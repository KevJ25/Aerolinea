#!/usr/bin/env bash
# =============================================================================
# Prueba de concurrencia · RF-11, RNF-07, V-09, CA-06, R-01 (base de CP-19)
# Dos sesiones de la cuenta de aplicación llaman a crear_reservacion() por el
# mismo asiento al mismo tiempo. Resultado esperado: exactamente una
# reservación; la segunda sesión espera el bloqueo pesimista y recibe SGA01.
#
# Usa las variables estándar de PostgreSQL (PGHOST, PGUSER, PGPASSWORD...) de
# una cuenta administrativa. Crea y elimina su propia base temporal.
# =============================================================================
set -euo pipefail

BASE="sga_concurrencia_$$"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
SALIDA_B="$(mktemp)"
trap 'dropdb --if-exists "$BASE" >/dev/null 2>&1 || true; rm -f "$SALIDA_B"' EXIT

createdb "$BASE"
PGDATABASE="$BASE" bash "$RAIZ/db/migrar.sh" >/dev/null

PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$BASE")
"${PSQL[@]}" <<'SQL'
INSERT INTO usuario (nombre, correo, contrasena_hash, id_rol) VALUES
    ('Administrador', 'admin@sga.mx', '$argon2id$prueba', 1),
    ('Pasajero A', 'a@correo.mx', '$argon2id$prueba', 3),
    ('Pasajero B', 'b@correo.mx', '$argon2id$prueba', 3);
INSERT INTO aeropuerto (codigo_iata, nombre, ciudad, pais) VALUES
    ('TLC', 'Toluca', 'Toluca', 'México'), ('CUN', 'Cancún', 'Cancún', 'México');
INSERT INTO ruta (id_aeropuerto_origen, id_aeropuerto_destino) VALUES (1, 2);
INSERT INTO avion (matricula, modelo, capacidad) VALUES ('XA-SGA', 'ATR 72-600', 72);
INSERT INTO vuelo (numero_vuelo, id_ruta, id_avion, fecha_salida, fecha_llegada, tarifa)
VALUES ('SG 1204', 1, 1, now() + interval '10 days', now() + interval '10 days 3 hours', 1850);
SQL

# Sesión A: reserva el 12C y mantiene la transacción abierta 2 segundos
"${PSQL[@]}" >/dev/null <<'SQL' &
SET ROLE sga_aplicacion;
BEGIN;
SELECT set_config('sga.id_usuario', '2', true);
SELECT crear_reservacion(2, 1, '12C');
SELECT pg_sleep(2);
COMMIT;
SQL
PID_A=$!

sleep 0.5

# Sesión B: intenta el mismo asiento mientras A sigue abierta
set +e
"${PSQL[@]}" >"$SALIDA_B" 2>&1 <<'SQL'
SET ROLE sga_aplicacion;
BEGIN;
SELECT set_config('sga.id_usuario', '3', true);
SELECT crear_reservacion(3, 1, '12C');
COMMIT;
SQL
CODIGO_B=$?
set -e

wait "$PID_A"

TOTAL=$(psql -X -tA -d "$BASE" -c "SELECT count(*) FROM reservacion")
DUENO=$(psql -X -tA -d "$BASE" -c "SELECT u.correo FROM reservacion r JOIN usuario u USING (id_usuario)")

echo "Sesión B: $(grep -o 'ERROR: .*' "$SALIDA_B" || cat "$SALIDA_B")"
echo "Reservaciones registradas: $TOTAL (de $DUENO)"

if [[ "$CODIGO_B" -ne 0 && "$TOTAL" -eq 1 && "$DUENO" == "a@correo.mx" ]] \
   && grep -q 'ya no está disponible' "$SALIDA_B"; then
    echo "OK   RF-11 / CA-06: dos solicitudes simultáneas producen una sola reservación válida."
else
    echo "FALLA RF-11 / CA-06: resultado inesperado." >&2
    exit 1
fi
