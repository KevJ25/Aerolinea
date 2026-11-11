#!/usr/bin/env bash
# =============================================================================
# Creación de cuentas de base de datos · S-07, AUD-02, AUD-08
#
#   db/crear_cuentas.sh <tipo> <nombre_de_cuenta>
#
#   tipo = aplicacion     cuenta del backend (miembro de sga_aplicacion)
#          reportes       cuenta de solo lectura de reportes (sga_reportes)
#          administrador  cuenta NOMINAL de una persona del equipo, con
#                         auditoría completa de escrituras (AUD-08)
#
# La contraseña se toma de la variable SGA_CONTRASENA_NUEVA o se pide sin eco.
# Nunca viaja en texto claro: el script calcula el verificador SCRAM-SHA-256
# en el cliente y PostgreSQL solo recibe ese verificador. Como pgAudit registra
# toda sentencia CREATE/ALTER ROLE (AUD-02), enviar la contraseña en claro la
# dejaría escrita en el registro de auditoría.
#
# Las cuentas administrativas son nominales (una por persona, nunca
# compartidas): sin ellas el registro de auditoría no permite el no repudio.
# Se ejecuta con una cuenta administrativa existente (variables PG*).
# =============================================================================
set -euo pipefail

TIPO="${1:-}"
CUENTA="${2:-}"
LONGITUD_MINIMA=16

if [[ ! "$TIPO" =~ ^(aplicacion|reportes|administrador)$ || ! "$CUENTA" =~ ^[a-z][a-z0-9_]{2,62}$ ]]; then
    echo "Uso: $0 aplicacion|reportes|administrador nombre_en_minusculas" >&2
    exit 2
fi

CONTRASENA="${SGA_CONTRASENA_NUEVA:-}"
if [[ -z "$CONTRASENA" ]]; then
    read -r -s -p "Contraseña para $CUENTA: " CONTRASENA; echo
    read -r -s -p "Confirme la contraseña: " CONFIRMACION; echo
    [[ "$CONTRASENA" == "$CONFIRMACION" ]] || { echo "Las contraseñas no coinciden." >&2; exit 1; }
fi
if (( ${#CONTRASENA} < LONGITUD_MINIMA )); then
    echo "La contraseña de una cuenta de base de datos debe tener al menos $LONGITUD_MINIMA caracteres." >&2
    exit 1
fi

# Verificador SCRAM-SHA-256 en el formato que almacena PostgreSQL (RFC 5802/7677)
# shellcheck disable=SC2016  # el código de Python va entre comillas simples a propósito
VERIFICADOR="$(printf '%s' "$CONTRASENA" | python3 -c '
import base64, hashlib, hmac, os, sys
contrasena = sys.stdin.buffer.read()
sal, iteraciones = os.urandom(16), 4096
salada = hashlib.pbkdf2_hmac("sha256", contrasena, sal, iteraciones)
clave_cliente = hmac.new(salada, b"Client Key", hashlib.sha256).digest()
clave_almacenada = hashlib.sha256(clave_cliente).digest()
clave_servidor = hmac.new(salada, b"Server Key", hashlib.sha256).digest()
b64 = lambda b: base64.b64encode(b).decode()
print(f"SCRAM-SHA-256${iteraciones}:{b64(sal)}${b64(clave_almacenada)}:{b64(clave_servidor)}")
')"
unset CONTRASENA CONFIRMACION

case "$TIPO" in
    aplicacion)    OPCIONES="LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE"; GRUPO="sga_aplicacion" ;;
    reportes)      OPCIONES="LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE"; GRUPO="sga_reportes" ;;
    administrador) OPCIONES="LOGIN SUPERUSER";                            GRUPO="" ;;
esac

psql -X -q -v ON_ERROR_STOP=1 -v cuenta="$CUENTA" -v verificador="$VERIFICADOR" <<SQL
SELECT format('CREATE ROLE %I $OPCIONES PASSWORD %L', :'cuenta', :'verificador')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'cuenta') \gexec
SELECT format('ALTER ROLE %I $OPCIONES PASSWORD %L', :'cuenta', :'verificador') \gexec
SELECT format('GRANT %I TO %I', '$GRUPO', :'cuenta') WHERE '$GRUPO' <> '' \gexec

-- Cuentas de servicio: una espera de bloqueo o una transacción abandonada no
-- deben retener asientos indefinidamente (RNF-07)
SELECT format('ALTER ROLE %I SET lock_timeout = %L', :'cuenta', '5s') WHERE '$TIPO' <> 'administrador' \gexec
SELECT format('ALTER ROLE %I SET idle_in_transaction_session_timeout = %L', :'cuenta', '60s') WHERE '$TIPO' <> 'administrador' \gexec

-- AUD-08: auditoría completa de escrituras de cuentas administrativas
SELECT format('ALTER ROLE %I SET pgaudit.log = %L', :'cuenta', 'write, ddl, role, misc, function') WHERE '$TIPO' = 'administrador' \gexec
SQL

echo "Cuenta $CUENTA ($TIPO) lista."
