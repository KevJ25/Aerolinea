#!/usr/bin/env bash
# =============================================================================
# Prueba de las políticas de auditoría AUD-01 a AUD-08 (migración 006)
#
# Ejecuta operaciones reales con una cuenta de aplicación y con la cuenta
# administrativa, lee el registro del servidor con pg_read_file() y verifica
# que cada política dejó su línea AUDIT, que lo no auditado no se registra y
# que ninguna contraseña ni dato personal enviado como parámetro aparece.
#
# Requiere: servidor con db/servidor/postgresql-auditoria.conf y una cuenta
# administrativa (variables PG*). Crea y elimina su propia base y cuenta.
# =============================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
BASE="sga_auditoria_$$"
CUENTA_APP="sga_prueba_app_$$"
MARCA="prueba_auditoria_$$"
CONTRASENA_APP="ContrasenaDePrueba-$$-NoDebeAparecer"
CORREO_PRIVADO="privado.$$@correo.mx"
REGISTRO="$(mktemp)"
fallas=0

limpiar() {
    dropdb --if-exists "$BASE" >/dev/null 2>&1 || true
    psql -X -q -d postgres -c "DROP ROLE IF EXISTS $CUENTA_APP" >/dev/null 2>&1 || true
    rm -f "$REGISTRO"
}
trap limpiar EXIT

createdb "$BASE"
PGDATABASE="$BASE" bash "$RAIZ/db/migrar.sh" >/dev/null

# Inicio de la ventana de lectura del registro: incluye la creación de la cuenta
INICIO=$(psql -X -tA -d "$BASE" -c "SELECT (pg_stat_file(pg_current_logfile())).size")

SGA_CONTRASENA_NUEVA="$CONTRASENA_APP" PGDATABASE="$BASE" PGAPPNAME="$MARCA" \
    bash "$RAIZ/db/crear_cuentas.sh" aplicacion "$CUENTA_APP" >/dev/null

# ------------------------------------------------ cuenta administrativa
PGAPPNAME="$MARCA" psql -X -q -v ON_ERROR_STOP=1 -d "$BASE" >/dev/null <<SQL
INSERT INTO usuario (nombre, correo, contrasena_hash, id_rol)
    VALUES ('Administrador', 'admin@sga.mx', '\$argon2id\$prueba', 1);
-- Los datos personales se envían como parámetros, nunca como literales en el SQL
INSERT INTO usuario (nombre, correo, contrasena_hash, id_rol)
    VALUES ('Pasajera', \$1, '\$argon2id\$prueba', 3) \bind '$CORREO_PRIVADO' \g
INSERT INTO aeropuerto (codigo_iata, nombre, ciudad, pais) VALUES
    ('TLC', 'Toluca', 'Toluca', 'México'), ('CUN', 'Cancún', 'Cancún', 'México');
INSERT INTO ruta (id_aeropuerto_origen, id_aeropuerto_destino) VALUES (1, 2);
INSERT INTO avion (matricula, modelo, capacidad) VALUES ('XA-SGA', 'ATR 72-600', 72);
INSERT INTO vuelo (numero_vuelo, id_ruta, id_avion, fecha_salida, fecha_llegada, tarifa)
VALUES ('SG 1204', 1, 1, now() + interval '10 days', now() + interval '10 days 3 hours', 1850);
-- AUD-01 DDL y AUD-02 ROLE
CREATE TABLE tabla_temporal_auditoria (id integer);
GRANT SELECT ON tabla_temporal_auditoria TO sga_reportes;
DROP TABLE tabla_temporal_auditoria;
-- AUD-04 cambio de rol hecho directamente por un administrador
UPDATE usuario SET id_rol = 2 WHERE correo = 'admin@sga.mx';
UPDATE usuario SET id_rol = 1 WHERE correo = 'admin@sga.mx';
-- AUD-03 y AUD-05: acceso directo de un administrador, sin pasar por funciones
SELECT count(contrasena_hash) FROM usuario;
-- AUD-06 intento de alterar la bitácora: el disparador lo rechaza, pgAudit lo registra
DO \$\$ BEGIN DELETE FROM bitacora; EXCEPTION WHEN OTHERS THEN NULL; END \$\$;
SQL

# ------------------------------------------------ cuenta de aplicación
# Las consultas con parámetros se envían con \bind, como lo hace el backend.
PGAPPNAME="$MARCA" PGUSER="$CUENTA_APP" PGPASSWORD="$CONTRASENA_APP" \
psql -X -q -v ON_ERROR_STOP=1 -d "$BASE" >/dev/null <<SQL
-- AUD-03 lectura de credenciales durante la autenticación
SELECT id_usuario FROM obtener_credencial(\$1) \bind '$CORREO_PRIVADO' \g
-- AUD-05 reservación y pago
BEGIN;
SELECT set_config('sga.id_usuario', '2', true);
SELECT crear_reservacion(2, 1, '12C') AS codigo \gset
SELECT registrar_pago(:'codigo', 1850.00, 'TARJETA_PRUEBA_APROBADA');
COMMIT;
-- AUD-07 cambio de tarifa del vuelo
BEGIN;
SELECT set_config('sga.id_usuario', '1', true);
UPDATE vuelo SET tarifa = 1900.00 WHERE id_vuelo = \$1 \bind 1 \g
COMMIT;
-- Lectura de un catálogo: NO debe auditarse
SELECT count(*) FROM aeropuerto;
SQL

# AUD-05 escritura directa de un administrador sobre una reservación existente
PGAPPNAME="$MARCA" psql -X -q -v ON_ERROR_STOP=1 -d "$BASE" \
    -c "UPDATE reservacion SET estado = estado WHERE id_reservacion = 1" >/dev/null

# La aplicación no puede desactivar ni redirigir la auditoría de su sesión
for parametro in "pgaudit.log = 'none'" "pgaudit.role = ''"; do
    if PGUSER="$CUENTA_APP" PGPASSWORD="$CONTRASENA_APP" \
        psql -X -q -d "$BASE" -c "SET $parametro" >/dev/null 2>&1; then
        echo "FALLA La aplicación pudo ejecutar SET $parametro" >&2
        fallas=$((fallas + 1))
    else
        echo "OK   La aplicación no puede ejecutar SET $parametro"
    fi
done

# Intento de la aplicación fuera de sus privilegios: lo rechaza PostgreSQL
# antes de ejecutarlo y queda en el registro como ERROR con la sentencia.
PGAPPNAME="$MARCA" PGUSER="$CUENTA_APP" PGPASSWORD="$CONTRASENA_APP" \
    psql -X -q -d "$BASE" -c "DELETE FROM bitacora" >/dev/null 2>&1 || true

sleep 1
psql -X -tA -d "$BASE" -c \
    "SELECT pg_read_file(pg_current_logfile(), $INICIO, (pg_stat_file(pg_current_logfile())).size - $INICIO)" \
    > "$REGISTRO"

verificar() {
    local politica="$1" patron="$2"
    # Sin grep -q: con pipefail, su salida anticipada haría fallar la tubería
    if grep -E "app=$MARCA" "$REGISTRO" | grep -E "$patron" >/dev/null; then
        echo "OK   $politica"
    else
        echo "FALLA $politica: no se encontró /$patron/" >&2
        fallas=$((fallas + 1))
    fi
}

no_debe_aparecer() {
    local descripcion="$1" texto="$2"
    if grep -qF -- "$texto" "$REGISTRO"; then
        echo "FALLA $descripcion: el registro contiene '$texto'" >&2
        fallas=$((fallas + 1))
    else
        echo "OK   $descripcion"
    fi
}

verificar "AUD-01 cambios de estructura (DDL)"           "AUDIT: SESSION,[0-9]+,[0-9]+,DDL,CREATE TABLE,TABLE,public.tabla_temporal_auditoria"
verificar "AUD-01 eliminación de objetos (DDL)"          "AUDIT: SESSION,[0-9]+,[0-9]+,DDL,DROP TABLE"
verificar "AUD-02 cambios de privilegios (ROLE)"         "AUDIT: SESSION,[0-9]+,[0-9]+,ROLE,GRANT"
verificar "AUD-03 autenticación de la aplicación"       "usuario=$CUENTA_APP .*AUDIT: SESSION,[0-9]+,[0-9]+,FUNCTION,EXECUTE,FUNCTION,public.obtener_credencial"
verificar "AUD-03 lectura directa de resúmenes"          "usuario=$PGUSER .*AUDIT: OBJECT,[0-9]+,[0-9]+,READ,SELECT,TABLE,public.usuario"
verificar "AUD-04 cambio de rol de un usuario"           "AUDIT: OBJECT,[0-9]+,[0-9]+,WRITE,UPDATE,TABLE,public.usuario"
verificar "AUD-05 creación de reservación"               "usuario=$CUENTA_APP .*AUDIT: SESSION,[0-9]+,[0-9]+,FUNCTION,EXECUTE,FUNCTION,public.crear_reservacion"
verificar "AUD-05 registro de pago"                      "usuario=$CUENTA_APP .*AUDIT: SESSION,[0-9]+,[0-9]+,FUNCTION,EXECUTE,FUNCTION,public.registrar_pago"
verificar "AUD-05 escritura directa de un administrador" "usuario=$PGUSER .*AUDIT: OBJECT,[0-9]+,[0-9]+,WRITE,UPDATE,TABLE,public.reservacion"
verificar "AUD-06 intento de borrar la bitácora"         "AUDIT: OBJECT,[0-9]+,[0-9]+,WRITE,DELETE,TABLE,public.bitacora"
verificar "AUD-06 intento rechazado por privilegios"     "usuario=$CUENTA_APP .*ERROR:  permission denied for table bitacora"
verificar "AUD-07 cambio de tarifa del vuelo"            "usuario=$CUENTA_APP .*AUDIT: OBJECT,[0-9]+,[0-9]+,WRITE,UPDATE,TABLE,public.vuelo"
verificar "AUD-08 escrituras de la cuenta administrativa" "usuario=$PGUSER .*AUDIT: SESSION,[0-9]+,[0-9]+,WRITE,INSERT,TABLE,public.aeropuerto"

if grep -E "usuario=$CUENTA_APP .*AUDIT:.*public.aeropuerto" "$REGISTRO" >/dev/null; then
    echo "FALLA Política dirigida: la lectura de catálogos por la aplicación no debe auditarse" >&2
    fallas=$((fallas + 1))
else
    echo "OK   Política dirigida: la lectura de catálogos por la aplicación no se audita"
fi

no_debe_aparecer "AUD-02 la contraseña de la cuenta nueva no aparece en el registro" "$CONTRASENA_APP"
no_debe_aparecer "LFPDPPP el correo enviado como parámetro no aparece en el registro" "$CORREO_PRIVADO"
verificar "Los parámetros se omiten explícitamente" "<not logged>"

# El detalle de lo que cambió lo conserva la bitácora de negocio (RF-17)
if [[ "$(psql -X -tA -d "$BASE" -c "SELECT count(*) FROM bitacora WHERE modulo IN ('Reservaciones', 'Pagos') AND id_usuario = 2")" -ge 3 ]]; then
    echo "OK   AUD-05 la bitácora de negocio conserva el detalle con el usuario de la aplicación"
else
    echo "FALLA AUD-05 la bitácora no registró la reservación y el pago" >&2
    fallas=$((fallas + 1))
fi

echo "Líneas de auditoría generadas por la prueba: $(grep -c "app=$MARCA.*AUDIT:" "$REGISTRO")"
if (( fallas > 0 )); then
    echo "$fallas política(s) no se verificaron." >&2
    exit 1
fi
echo "Todas las políticas de auditoría se verificaron correctamente."
