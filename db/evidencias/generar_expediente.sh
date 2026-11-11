#!/usr/bin/env bash
# =============================================================================
# Expediente de evidencia de la base de datos para la auditoría
# Plan de auditoría PA-SW-2026-04 · Anexo A (V-20 a V-30) · ISO 19011, 6.4.7
#
#   db/evidencias/generar_expediente.sh [desde AAAA-MM-DD] [hasta AAAA-MM-DD]
#
# Reúne, desde la propia base de datos y su servidor, la evidencia objetiva de
# que los controles documentados existen y operan. Cada archivo lleva su hash
# SHA-256 en el índice para demostrar que la evidencia no se alteró después.
#
# Contenido:
#   00_indice.md                  qué contiene cada archivo y qué criterio respalda
#   01_version_esquema.md         migraciones aplicadas (línea base, V-20)
#   02_roles_y_privilegios.md     menor privilegio en la base (S-07, S-09)
#   03_politicas_auditoria.md     configuración vigente de pgAudit (AUD-01 a AUD-08)
#   04_registro_auditoria.log     líneas AUDIT del periodo (S-12)
#   05_resumen_auditoria.md       conteo por clase y política del periodo
#   06_bitacora_negocio.csv       bitácora RF-17 del periodo (solo identificadores)
#   07_respaldos/                 bitácora de respaldos y registros PR-xx (V-30)
#   08_resultado_pruebas.txt      salida de db/probar.sh (si SGA_INCLUIR_PRUEBAS=1)
#
# No incluye datos personales: la bitácora usa identificadores y el registro de
# auditoría no contiene valores de parámetros (pgaudit.log_parameter = off).
#
# Variables: PG* (cuenta administrativa), SGA_RESPALDO_DIR, SGA_EVIDENCIAS_DIR,
#            SGA_INCLUIR_PRUEBAS=1 para ejecutar y anexar la batería de pruebas
# =============================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
BASE="${PGDATABASE:?Defina PGDATABASE con la base a auditar}"
DESDE="${1:-$(date -d '30 days ago' +%F)}"
HASTA="${2:-$(date +%F)}"
SALIDA="${SGA_EXPEDIENTE_DIR:-./evidencias}/expediente_bd_$(date +%Y%m%d_%H%M)"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$BASE")

mkdir -p "$SALIDA/07_respaldos"

# Commit del repositorio. Dentro del contenedor no hay git, así que se lee
# directamente la carpeta .git como respaldo.
obtener_commit() {
    if command -v git >/dev/null && git -C "$RAIZ" rev-parse --short HEAD 2>/dev/null; then
        return
    fi
    local cabeza referencia
    cabeza="$(cat "$RAIZ/.git/HEAD" 2>/dev/null)" || { echo "sin repositorio git"; return; }
    if [[ "$cabeza" == ref:* ]]; then
        referencia="${cabeza#ref: }"
        if [[ -f "$RAIZ/.git/$referencia" ]]; then
            cut -c1-7 "$RAIZ/.git/$referencia"
        else
            awk -v ref="$referencia" '$2 == ref { print substr($1, 1, 7) }' "$RAIZ/.git/packed-refs" 2>/dev/null
        fi
    else
        echo "${cabeza:0:7}"
    fi
}

# ------------------------------------------------------------ 01 versión
{
    echo "# Versión del esquema de la base \`$BASE\`"
    echo
    echo "Fuente: tabla \`esquema_version\`, escrita por \`db/migrar.sh\`. El hash SHA-256 de cada migración"
    echo "debe coincidir con el del archivo en el repositorio (\`sha256sum db/migrations/*.sql\`)."
    echo
    "${PSQL[@]}" -P footer=off --csv -c "SELECT version, archivo, sha256, aplicado_por,
        to_char(aplicado_en, 'YYYY-MM-DD HH24:MI') AS aplicado_en FROM esquema_version ORDER BY version" \
        | sed 's/,/ | /g; s/^/| /; s/$/ |/' | sed '2i| --- | --- | --- | --- | --- |'
} > "$SALIDA/01_version_esquema.md"

# ------------------------------------------------------------ 02 privilegios
{
    echo "# Roles y privilegios de la base \`$BASE\`"
    echo
    echo "## Roles del sistema"
    echo
    "${PSQL[@]}" -P footer=off --csv -c "
        SELECT r.rolname AS rol, r.rolcanlogin AS inicia_sesion, r.rolsuper AS superusuario,
               coalesce(string_agg(g.rolname, ' ' ORDER BY g.rolname), '') AS miembro_de
        FROM pg_roles r
        LEFT JOIN pg_auth_members m ON m.member = r.oid
        LEFT JOIN pg_roles g ON g.oid = m.roleid
        WHERE r.rolname NOT LIKE 'pg\_%'
        GROUP BY r.rolname, r.rolcanlogin, r.rolsuper ORDER BY r.rolname" \
        | sed 's/,/ | /g; s/^/| /; s/$/ |/' | sed '2i| --- | --- | --- | --- |'
    echo
    echo "## Privilegios sobre tablas y vistas"
    echo
    "${PSQL[@]}" -P footer=off --csv -c "
        SELECT grantee AS rol, table_name AS objeto, string_agg(privilege_type, ' ' ORDER BY privilege_type) AS privilegios
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND grantee IN ('sga_aplicacion', 'sga_reportes', 'sga_operaciones', 'PUBLIC')
        GROUP BY grantee, table_name ORDER BY grantee, table_name" \
        | sed 's/,/ | /g; s/^/| /; s/$/ |/' | sed '2i| --- | --- | --- |'
    echo
    echo "## Privilegios por columna"
    echo
    "${PSQL[@]}" -P footer=off --csv -c "
        SELECT grantee AS rol, table_name AS tabla, privilege_type AS privilegio,
               string_agg(column_name, ' ' ORDER BY column_name) AS columnas
        FROM information_schema.column_privileges
        WHERE table_schema = 'public' AND grantee IN ('sga_aplicacion', 'sga_operaciones')
          AND (grantee, table_name, privilege_type) NOT IN (
              SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants)
        GROUP BY grantee, table_name, privilege_type ORDER BY 1, 2, 3" \
        | sed 's/,/ | /g; s/^/| /; s/$/ |/' | sed '2i| --- | --- | --- | --- |'
    echo
    echo "## Funciones que puede ejecutar la aplicación"
    echo
    "${PSQL[@]}" -tA -c "
        SELECT '- \`' || p.oid::regprocedure || '\`' || CASE WHEN p.prosecdef THEN ' (se ejecuta como ' || p.proowner::regrole || ')' ELSE '' END
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND has_function_privilege('sga_aplicacion', p.oid, 'EXECUTE')
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
        ORDER BY 1"
    echo
    echo "Privilegios otorgados a PUBLIC en tablas propias: $("${PSQL[@]}" -tA -c "SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'PUBLIC' AND table_schema = 'public'") (debe ser 0, S-09)."
} > "$SALIDA/02_roles_y_privilegios.md"

# ------------------------------------------------------------ 03 políticas
{
    echo "# Políticas de auditoría vigentes (pgAudit)"
    echo
    echo "- Biblioteca precargada: \`$("${PSQL[@]}" -tA -c "SHOW shared_preload_libraries")\`"
    echo "- Extensión: pgaudit $("${PSQL[@]}" -tA -c "SELECT extversion FROM pg_extension WHERE extname = 'pgaudit'")"
    echo "- Servidor: PostgreSQL $("${PSQL[@]}" -tA -c "SHOW server_version")"
    echo
    echo "## Parámetros por base de datos y por cuenta"
    echo
    echo "| Ámbito | Parámetro |"
    echo "| --- | --- |"
    "${PSQL[@]}" -tA -F ' | ' -c "
        SELECT CASE WHEN s.setrole = 0 THEN 'Base ' || d.datname ELSE 'Cuenta ' || r.rolname END, c
        FROM pg_db_role_setting s
        LEFT JOIN pg_database d ON d.oid = s.setdatabase
        LEFT JOIN pg_roles r ON r.oid = s.setrole, unnest(s.setconfig) AS c
        WHERE (s.setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database()) OR s.setdatabase = 0)
          AND c LIKE 'pgaudit.%'
        ORDER BY 1, 2" | sed 's/^/| /; s/$/ |/'
    echo
    echo "## Auditoría de objetos (permisos del rol sga_auditor)"
    echo
    echo "| Objeto | Operaciones auditadas | Columnas |"
    echo "| --- | --- | --- |"
    "${PSQL[@]}" -tA -F ' | ' -c "
        SELECT table_name, string_agg(DISTINCT privilege_type, ' '), 'todas'
        FROM information_schema.role_table_grants
        WHERE grantee = 'sga_auditor' AND table_schema = 'public' GROUP BY table_name
        UNION ALL
        SELECT table_name, privilege_type, string_agg(column_name, ' ' ORDER BY column_name)
        FROM information_schema.column_privileges
        WHERE grantee = 'sga_auditor' AND table_schema = 'public'
          AND (table_name, privilege_type) NOT IN (
              SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee = 'sga_auditor')
        GROUP BY table_name, privilege_type
        ORDER BY 1, 2" | sed 's/^/| /; s/$/ |/'
    echo
    echo "La correspondencia de cada parámetro y permiso con las políticas AUD-01 a AUD-08 está en"
    echo "\`db/migrations/006_politicas_auditoria.sql\` y en \`docs/base-de-datos.md\`."
} > "$SALIDA/03_politicas_auditoria.md"

# ------------------------------------------------------------ 04 registro
# Lee los archivos de registro del periodo desde el servidor (pg_ls_logdir y
# pg_read_file requieren una cuenta administrativa).
"${PSQL[@]}" -tA -c "
    SELECT name FROM pg_ls_logdir()
    WHERE name ~ '^postgresql-\d{4}-\d{2}-\d{2}\.log$'
      AND substring(name FROM '\d{4}-\d{2}-\d{2}')::date BETWEEN '$DESDE' AND '$HASTA'
    ORDER BY name" > "$SALIDA/.archivos_registro"
: > "$SALIDA/04_registro_auditoria.log"
while read -r archivo; do
    [[ -n "$archivo" ]] || continue
    "${PSQL[@]}" -tA -c "SELECT pg_read_file('log/$archivo')" \
        | grep -E "bd=$BASE .*(AUDIT: |permission denied)" >> "$SALIDA/04_registro_auditoria.log" || true
done < "$SALIDA/.archivos_registro"
ARCHIVOS_LEIDOS="$(grep -c . "$SALIDA/.archivos_registro" || true)"
rm -f "$SALIDA/.archivos_registro"

contar() { grep -cE "$1" "$SALIDA/04_registro_auditoria.log" || true; }
# PostgreSQL verifica cada llave foránea con una consulta interna
# "SELECT 1 FROM ONLY ... FOR KEY SHARE" que pgAudit registra como lectura de
# la tabla referida. No es una lectura de datos y se cuenta por separado.
PATRON_LLAVE_FORANEA='SELECT 1 FROM ONLY'
PATRON_RESPALDO='COPY public\.'
contar_lectura_directa() {
    grep -E "$1" "$SALIDA/04_registro_auditoria.log" \
        | grep -vE "$PATRON_LLAVE_FORANEA|$PATRON_RESPALDO" | grep -c . || true
}
{
    echo "# Resumen del registro de auditoría"
    echo
    echo "Base \`$BASE\`, del $DESDE al $HASTA. Archivos de registro leídos: $ARCHIVOS_LEIDOS."
    echo "Total de líneas: $(grep -c . "$SALIDA/04_registro_auditoria.log" || true)."
    echo
    echo "| Política | Criterio de búsqueda | Líneas |"
    echo "| --- | --- | --- |"
    echo "| AUD-01 Cambios de estructura | SESSION DDL | $(contar 'AUDIT: SESSION,[0-9]+,[0-9]+,DDL,') |"
    echo "| AUD-02 Roles y privilegios | SESSION ROLE | $(contar 'AUDIT: SESSION,[0-9]+,[0-9]+,ROLE,') |"
    echo "| AUD-03 Autenticación | FUNCTION obtener_credencial | $(contar 'FUNCTION,EXECUTE,FUNCTION,public.obtener_credencial') |"
    echo "| AUD-03 Lectura directa de credenciales | OBJECT READ usuario, sin verificaciones internas ni respaldos | $(contar_lectura_directa 'AUDIT: OBJECT,[0-9]+,[0-9]+,READ,SELECT,TABLE,public.usuario') |"
    echo "| AUD-03 Lectura de usuarios por respaldos | COPY public.usuario | $(contar 'READ,SELECT,TABLE,public.usuario,.*COPY public\.usuario') |"
    echo "| AUD-04 Cambios de rol, estado o credencial | OBJECT WRITE usuario | $(contar 'AUDIT: OBJECT,[0-9]+,[0-9]+,WRITE,UPDATE,TABLE,public.usuario') |"
    echo "| AUD-05 Reservaciones, pagos y check-in | FUNCTION de operaciones | $(contar 'FUNCTION,public\.(crear_reservacion|cancelar_reservacion|registrar_pago|realizar_check_in)') |"
    echo "| AUD-06 Intentos de borrado o alteración | OBJECT DELETE/TRUNCATE y rechazos | $(contar 'AUDIT: OBJECT,[0-9]+,[0-9]+,WRITE,(DELETE|TRUNCATE)|permission denied') |"
    echo "| AUD-07 Cambios de vuelo | OBJECT WRITE vuelo | $(contar 'AUDIT: OBJECT,[0-9]+,[0-9]+,WRITE,UPDATE,TABLE,public.vuelo') |"
    echo "| AUD-08 Escrituras administrativas | SESSION WRITE | $(contar 'AUDIT: SESSION,[0-9]+,[0-9]+,WRITE,') |"
    echo
    echo "## Actividad por cuenta"
    echo
    echo "| Cuenta | Líneas |"
    echo "| --- | --- |"
    grep -oE 'usuario=[^ ]+' "$SALIDA/04_registro_auditoria.log" | sort | uniq -c | sort -rn \
        | awk '{ sub("usuario=", "", $2); printf "| %s | %s |\n", $2, $1 }' || true
    echo
    echo "Verificaciones internas de llave foránea registradas como lectura (no son lecturas de datos): $(contar "$PATRON_LLAVE_FORANEA")."
    echo
    echo "Una política con 0 líneas no indica falla: puede que en el periodo no ocurriera ese evento."
    echo "Que cada política genera su registro se demuestra con \`db/pruebas/auditoria_pgaudit.sh\` (archivo 08)."
} > "$SALIDA/05_resumen_auditoria.md"

# ------------------------------------------------------------ 06 bitácora
"${PSQL[@]}" --csv -c "
    SELECT id_bitacora, to_char(fecha_hora, 'YYYY-MM-DD HH24:MI:SS') AS fecha_hora, id_usuario, accion, modulo, detalle
    FROM bitacora
    WHERE fecha_hora::date BETWEEN '$DESDE' AND '$HASTA'
    ORDER BY id_bitacora" > "$SALIDA/06_bitacora_negocio.csv"

# ------------------------------------------------------------ 07 respaldos
RESPALDOS="${SGA_RESPALDO_DIR:-./respaldos}"
RESTAURACIONES="${SGA_EVIDENCIAS_DIR:-./evidencias/restauracion}"
[[ -f "$RESPALDOS/bitacora_respaldos.csv" ]] && cp "$RESPALDOS/bitacora_respaldos.csv" "$SALIDA/07_respaldos/"
find "$RESTAURACIONES" -maxdepth 1 -name 'PR-*.md' -exec cp {} "$SALIDA/07_respaldos/" \; 2>/dev/null || true

# ------------------------------------------------------------ 08 pruebas
if [[ "${SGA_INCLUIR_PRUEBAS:-0}" == "1" ]]; then
    PGDATABASE=postgres bash "$RAIZ/db/probar.sh" > "$SALIDA/08_resultado_pruebas.txt" 2>&1 \
        || echo "LA BATERÍA DE PRUEBAS TERMINÓ CON ERRORES" >> "$SALIDA/08_resultado_pruebas.txt"
fi

# ------------------------------------------------------------ 00 índice
{
    echo "# Expediente de evidencia de la base de datos"
    echo
    echo "| Dato | Valor |"
    echo "| --- | --- |"
    echo "| Base de datos | \`$BASE\` |"
    echo "| Periodo | $DESDE a $HASTA |"
    echo "| Generado | $(date '+%d/%m/%Y %H:%M') |"
    echo "| Generado por | ${SGA_RESPONSABLE:-$(whoami)} con la cuenta de base de datos \`$("${PSQL[@]}" -tA -c "SELECT session_user")\` |"
    echo "| Commit del repositorio | \`$(obtener_commit)\` |"
    echo
    echo "| Archivo | Criterio que respalda | SHA-256 |"
    echo "| --- | --- | --- |"
    describir() {
        case "$1" in
            01_*) echo "V-20 líneas base; sección 15" ;;
            02_*) echo "V-24; S-07 menor privilegio; S-09 denegación por defecto" ;;
            03_*) echo "S-12 no repudio; políticas AUD-01 a AUD-08" ;;
            04_*) echo "S-12; ISO/IEC 27001 8.15 registro de eventos" ;;
            05_*) echo "S-12; operación de las políticas en el periodo" ;;
            06_*) echo "RF-17; RN-10; CA-11" ;;
            07_respaldos/bitacora*) echo "V-30; Tabla 68 bitácora de respaldos" ;;
            07_respaldos/PR-*) echo "V-30; Tabla 67 prueba de restauración; KPI-12" ;;
            08_*) echo "V-18, V-24, V-26, V-28: reglas, controles y casos verificados" ;;
            *) echo "" ;;
        esac
    }
    (cd "$SALIDA" && find . -type f ! -name '00_indice.md' | sed 's|^\./||' | sort) | while read -r archivo; do
        echo "| \`$archivo\` | $(describir "$archivo") | \`$(sha256sum "$SALIDA/$archivo" | cut -c1-16)…\` |"
    done
    echo
    echo "Los hashes completos están en \`SHA256SUMS\`. Verificación: \`sha256sum -c SHA256SUMS\`."
    echo
    echo "Entregó: ______________________    Recibió (equipo auditor): ______________________    Fecha: __________"
} > "$SALIDA/00_indice.md"

(cd "$SALIDA" && find . -type f | sed 's|^\./||' | sort | xargs sha256sum > "$SALIDA.sha256sums")
mv "$SALIDA.sha256sums" "$SALIDA/SHA256SUMS"
tar -C "$(dirname "$SALIDA")" -czf "$SALIDA.tar.gz" "$(basename "$SALIDA")"

echo "Expediente generado: $SALIDA"
echo "Paquete para entregar: $SALIDA.tar.gz"
