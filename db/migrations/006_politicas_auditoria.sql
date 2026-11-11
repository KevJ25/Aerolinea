-- =============================================================================
-- Migración 006 · Políticas de auditoría de base de datos con pgAudit
-- [S-12] no repudio · Manual MC-SGA-001, secciones 18 y 30
-- ISO/IEC 27001:2022 Anexo A: 8.15 registro de eventos, 8.2 derechos de acceso
-- privilegiado, 8.5 autenticación segura, 8.32 gestión de cambios.
--
-- Requisito del servidor: pgaudit en shared_preload_libraries
-- (db/servidor/postgresql-auditoria.conf). Sin él, esta migración falla.
--
-- Dos mecanismos complementarios:
--   * Auditoría de SESIÓN (pgaudit.log): clases de sentencias que se registran
--     para cualquier tabla. Se usa para estructura, roles y cuentas privilegiadas.
--   * Auditoría de OBJETO (pgaudit.role): se registra una operación sobre una
--     tabla o columna si el rol sga_auditor tiene "permiso" para ella. Ese
--     permiso no da acceso a nadie; solo define qué se audita.
--
-- Complemento, no reemplazo: la bitácora de negocio (RF-17) registra qué hizo
-- cada usuario de la aplicación; pgAudit registra qué se ejecutó en la base de
-- datos y con qué cuenta, incluidas las administrativas.
--
-- Política                                            Clase             Control  ISO 27001
-- AUD-01 Cambios de estructura (DDL)                  Sesión            15, 16   8.32
-- AUD-02 Cambios de roles y privilegios               Sesión            S-07     8.2
-- AUD-03 Lectura de resúmenes de contraseña           Sesión + Objeto   S-01     8.5
-- AUD-04 Cambios de rol, estado o credencial          Objeto            S-07     8.2
-- AUD-05 Operaciones de reservación, pago y check-in  Sesión + Objeto   S-12     8.15
-- AUD-06 Intentos de alterar bitácora o borrar        Objeto            S-12     8.15
-- AUD-07 Cambios de horario, tarifa o estado de vuelo Objeto            RN-09    8.15
-- AUD-08 Toda escritura de cuentas administrativas    Sesión            S-07     8.2
--
-- Limitación verificada (db/pruebas/auditoria_pgaudit.sh): pgAudit 16.0 no
-- emite auditoría de OBJETO para sentencias dentro de funciones SECURITY
-- DEFINER cuando las invoca una cuenta sin superusuario. Por eso AUD-03 y
-- AUD-05 se cubren con la clase de sesión FUNCTION, que registra cada
-- invocación de una operación de negocio con la cuenta que la hizo, y la
-- bitácora de negocio (RF-17) registra el detalle de lo que cambió. La parte
-- de objeto de AUD-03 y AUD-05 cubre el acceso directo a las tablas, que solo
-- es posible para cuentas administrativas.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgaudit;

-- -----------------------------------------------------------------------------
-- Parámetros generales y auditoría de sesión para la base de datos
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_bd constant text := current_database();
BEGIN
    -- AUD-01 y AUD-02: DDL (CREATE, ALTER, DROP) y ROLE (GRANT, REVOKE,
    -- CREATE/ALTER ROLE) de cualquier cuenta.
    -- AUD-03 y AUD-05: FUNCTION registra cada invocación de función propia
    -- (las del catálogo del sistema se omiten con log_catalog = off).
    EXECUTE format('ALTER DATABASE %I SET pgaudit.log = %L', v_bd, 'ddl, role, function');

    -- Rol cuyos permisos definen la auditoría de objetos (AUD-03 a AUD-07)
    EXECUTE format('ALTER DATABASE %I SET pgaudit.role = %L', v_bd, 'sga_auditor');

    -- Nombre de la tabla en cada registro, para filtrar por objeto
    EXECUTE format('ALTER DATABASE %I SET pgaudit.log_relation = %L', v_bd, 'on');

    -- Las consultas internas del catálogo del sistema no aportan y saturan
    EXECUTE format('ALTER DATABASE %I SET pgaudit.log_catalog = %L', v_bd, 'off');

    -- Minimización (LFPDPPP): no se registran los VALORES de los parámetros,
    -- que pueden contener correos, nombres o resúmenes de contraseña. La
    -- sentencia sí se registra, por lo que se sabe qué se hizo y sobre qué.
    EXECUTE format('ALTER DATABASE %I SET pgaudit.log_parameter = %L', v_bd, 'off');
END;
$$;

-- AUD-08: la cuenta administrativa que ejecuta las migraciones registra además
-- toda escritura (INSERT, UPDATE, DELETE, TRUNCATE, COPY) y operaciones misc
-- (VACUUM, SET...). La configuración por rol tiene precedencia sobre la de
-- la base de datos. Las cuentas administrativas adicionales se crean con
-- db/crear_cuentas.sh, que les aplica esta misma política.
DO $$
BEGIN
    EXECUTE format('ALTER ROLE %I SET pgaudit.log = %L', session_user, 'write, ddl, role, misc, function');
END;
$$;

-- -----------------------------------------------------------------------------
-- Auditoría de objetos: lo que sga_auditor puede "hacer" es lo que se registra
-- -----------------------------------------------------------------------------

-- AUD-03 Lectura directa del resumen de contraseña (S-01, CP-24). La lectura
-- durante la autenticación queda registrada como invocación de obtener_credencial.
GRANT SELECT (contrasena_hash) ON usuario TO sga_auditor;

-- AUD-04 Escalamiento de privilegios, bajas, desbloqueos y cambios de
-- contraseña (S-07, RF-03, RF-18)
GRANT UPDATE (id_rol, activo, bloqueado_hasta, contrasena_hash) ON usuario TO sga_auditor;

-- AUD-05 Escritura directa de operaciones con efecto económico o sobre el
-- embarque (R-04, S-12). Las hechas por la aplicación quedan registradas como
-- invocación de crear_reservacion, registrar_pago y realizar_check_in.
GRANT INSERT ON pago, check_in TO sga_auditor;
GRANT INSERT, UPDATE (estado) ON reservacion TO sga_auditor;

-- AUD-06 Intentos de alterar la bitácora o de borrar físicamente (S-12, V-12).
-- Los disparadores los rechazan; pgAudit deja constancia del intento.
GRANT UPDATE, DELETE, TRUNCATE ON bitacora TO sga_auditor;
GRANT DELETE, TRUNCATE ON usuario, aeropuerto, ruta, avion, vuelo, asiento,
                          reservacion, pago, check_in TO sga_auditor;

-- AUD-07 Cambios que afectan a pasajeros con reservación (RN-09)
GRANT UPDATE (estado_vuelo, fecha_salida, fecha_llegada, tarifa) ON vuelo TO sga_auditor;

-- [S-09] Las funciones de disparador de eventos que instala pgAudit nacen con
-- EXECUTE para PUBLIC. El servidor las invoca sin revisar ese permiso, así que
-- se revoca para mantener la denegación por defecto.
REVOKE ALL ON FUNCTION pgaudit_ddl_command_end(), pgaudit_sql_drop() FROM PUBLIC;
