# =============================================================================
# PostgreSQL 16 con pgAudit · imagen común a Desarrollo, Integración y CI
# (sección 15.3). Usa la misma configuración de auditoría que los servidores
# Debian/Ubuntu: db/servidor/postgresql-auditoria.conf.
#
# Fijación de versión: después de la primera construcción aprobada, sustituya
# la etiqueta por su digest (docker inspect --format '{{index .RepoDigests 0}}'
# postgres:16-bookworm) para que la imagen no cambie sin una solicitud de cambio.
# =============================================================================
FROM postgres:16-bookworm

# La imagen oficial ya incluye el repositorio apt.postgresql.org.
# Además de pgAudit se instalan las herramientas que usan los scripts de db/
# (cifrado de respaldos, cálculos y verificador SCRAM), para que todo se
# ejecute dentro del contenedor y la máquina del equipo, incluida Windows,
# solo necesite Docker.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        "postgresql-${PG_MAJOR}-pgaudit" gnupg bc python3 \
    && rm -rf /var/lib/apt/lists/*

# initdb copia postgresql.conf.sample al crear el directorio de datos; al
# anexar la configuración aquí, toda base nueva nace con pgAudit precargado.
COPY postgresql-auditoria.conf /tmp/postgresql-auditoria.conf
RUN cat /tmp/postgresql-auditoria.conf >> "/usr/share/postgresql/postgresql.conf.sample" \
    && rm /tmp/postgresql-auditoria.conf

HEALTHCHECK --interval=5s --timeout=5s --retries=20 \
    CMD pg_isready -U "${POSTGRES_USER:-postgres}" || exit 1
