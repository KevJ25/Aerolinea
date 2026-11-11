#!/usr/bin/env bash
# =============================================================================
# Ejecutor de migraciones · Manual MC-SGA-001, sección 15 (gestión de configuración)
#
# Aplica en orden los archivos db/migrations/NNN_*.sql que aún no estén
# aplicados. Cada archivo se ejecuta en UNA transacción junto con su registro
# en esquema_version: o se aplica completo y queda registrado, o no se aplica.
#
# Si una migración ya aplicada fue modificada después (su SHA-256 cambió), el
# ejecutor se detiene: una migración aplicada forma parte de la línea base y
# solo se corrige con una migración nueva respaldada por una solicitud de cambio.
#
# Debe ejecutarse con la cuenta administrativa de la base (variables PG*).
# =============================================================================
set -euo pipefail

DIRECTORIO="$(cd "$(dirname "$0")" && pwd)/migrations"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" <<'SQL'
SET client_min_messages = warning;
CREATE TABLE IF NOT EXISTS esquema_version (
    version       varchar(10) PRIMARY KEY,
    archivo       varchar(200) NOT NULL,
    sha256        char(64) NOT NULL,
    aplicado_por  varchar(63) NOT NULL DEFAULT session_user,
    aplicado_en   timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON esquema_version FROM PUBLIC;
SQL

aplicadas=0
for archivo in "$DIRECTORIO"/[0-9][0-9][0-9]_*.sql; do
    nombre="$(basename "$archivo")"
    version="${nombre%%_*}"
    hash="$(sha256sum "$archivo" | cut -d' ' -f1)"
    registrado="$("${PSQL[@]}" -tA -c "SELECT sha256 FROM esquema_version WHERE version = '$version'")"

    if [[ -n "$registrado" ]]; then
        if [[ "$registrado" != "$hash" ]]; then
            echo "ERROR: $nombre ya estaba aplicada y su contenido cambió." >&2
            echo "       Una migración aplicada no se modifica; cree una migración nueva." >&2
            exit 1
        fi
        continue
    fi

    echo "Aplicando $nombre"
    "${PSQL[@]}" --single-transaction \
        -f "$archivo" \
        -c "INSERT INTO esquema_version (version, archivo, sha256) VALUES ('$version', '$nombre', '$hash')"
    aplicadas=$((aplicadas + 1))
done

echo "Migraciones aplicadas en esta ejecución: $aplicadas"
"${PSQL[@]}" -c "SELECT version, archivo, aplicado_por, to_char(aplicado_en, 'YYYY-MM-DD HH24:MI') AS aplicado_en FROM esquema_version ORDER BY version"
