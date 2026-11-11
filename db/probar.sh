#!/usr/bin/env bash
# =============================================================================
# Batería completa de pruebas de la base de datos
#   1. Reglas de integridad V-xx y RN-xx         pruebas/reglas_integridad.sql
#   2. Privilegios por rol (S-07, S-09)          pruebas/privilegios.sql
#   3. Operaciones de negocio y bitácora         pruebas/operaciones.sql
#   3b. Sesiones (S-03, S-04, S-06)              pruebas/sesiones.sql
#   4. Concurrencia de reservaciones (RF-11)     pruebas/concurrencia_rf11.sh
#   5. Políticas de auditoría pgAudit (AUD-xx)   pruebas/auditoria_pgaudit.sh
#   6. Respaldo cifrado y restauración (RNF-10)  respaldos/*.sh
#
# Cada bloque usa su propia base temporal. Requiere una cuenta administrativa
# (variables PG*) en un servidor con db/servidor/postgresql-auditoria.conf.
# =============================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
BASE="sga_pruebas_$$"
TEMPORAL="$(mktemp -d)"
trap 'dropdb --if-exists "$BASE" >/dev/null 2>&1 || true; rm -rf "$TEMPORAL"' EXIT

titulo() { printf '\n== %s\n' "$1"; }
ejecutar_sql() {
    # Muestra solo los resultados OK/FALLA y el mensaje final de cada archivo
    psql -X -v ON_ERROR_STOP=1 -d "$BASE" -f "$1" 2>&1 \
        | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR):  //' | grep -E '^(OK|FALLA)|correctamente|ERROR' \
        | tee "$TEMPORAL/salida.txt"
    ! grep -qE '^FALLA|ERROR' "$TEMPORAL/salida.txt"
}

titulo "Migraciones"
createdb "$BASE"
PGDATABASE="$BASE" bash "$RAIZ/db/migrar.sh" | grep -E 'Aplicando|aplicadas'

titulo "1. Reglas de integridad";      ejecutar_sql "$RAIZ/db/pruebas/reglas_integridad.sql"
titulo "2. Privilegios por rol";       ejecutar_sql "$RAIZ/db/pruebas/privilegios.sql"
titulo "3. Operaciones y bitácora";    ejecutar_sql "$RAIZ/db/pruebas/operaciones.sql"
titulo "3b. Sesiones (S-03, S-04)";   ejecutar_sql "$RAIZ/db/pruebas/sesiones.sql"
titulo "4. Concurrencia (RF-11)";      bash "$RAIZ/db/pruebas/concurrencia_rf11.sh"
titulo "5. Políticas pgAudit";         bash "$RAIZ/db/pruebas/auditoria_pgaudit.sh" 2>&1 | grep -E '^(OK|FALLA)|Líneas|correctamente'

titulo "6. Respaldo y restauración (RNF-10)"
psql -X -q -v ON_ERROR_STOP=1 -d "$BASE" -f "$RAIZ/db/semillas/datos_demostracion.sql" >/dev/null
# Con el itinerario el respaldo tiene un volumen realista: con bases pequeñas
# algunos errores de tuberías no aparecen
psql -X -q -v ON_ERROR_STOP=1 -d "$BASE" -f "$RAIZ/db/semillas/itinerario_demostracion.sql" >/dev/null
export SGA_RESPALDO_CLAVE="clave-de-prueba-$$-$RANDOM" SGA_RESPALDO_DIR="$TEMPORAL/respaldos" \
       SGA_EVIDENCIAS_DIR="$TEMPORAL/evidencias" SGA_RESPONSABLE="Integración continua"
# Sin tubería hacia head: con pipefail, el cierre anticipado de la tubería
# haría fallar el respaldo con SIGPIPE
PGDATABASE="$BASE" bash "$RAIZ/db/respaldos/respaldar.sh" diario > "$TEMPORAL/respaldo.txt"
head -1 "$TEMPORAL/respaldo.txt"
PGDATABASE="$BASE" bash "$RAIZ/db/respaldos/prueba_restauracion.sh"

printf '\nTodas las pruebas de la base de datos pasaron.\n'
