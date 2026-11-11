#!/usr/bin/env bash
# =============================================================================
# Preparación de la base para ejecutar el sistema
#   1. Aplica las migraciones pendientes (db/migrar.sh)
#   2. Crea o actualiza la cuenta de la aplicación sga_api (S-07), con la
#      contraseña de SGA_API_CONTRASENA y sin exponerla (db/crear_cuentas.sh)
# Se puede ejecutar las veces que sea necesario.
# =============================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
: "${SGA_API_CONTRASENA:?Defina SGA_API_CONTRASENA (npm run configurar)}"

bash "$RAIZ/db/migrar.sh"
SGA_CONTRASENA_NUEVA="$SGA_API_CONTRASENA" bash "$RAIZ/db/crear_cuentas.sh" aplicacion sga_api
echo "Base lista para el sistema."
