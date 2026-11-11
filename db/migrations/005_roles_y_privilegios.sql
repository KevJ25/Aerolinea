-- =============================================================================
-- Migración 005 · Roles y privilegios de base de datos
-- [S-07] menor privilegio  [S-09] denegación por defecto  [V-12] sin borrado
--
-- Roles de grupo, ninguno inicia sesión. Las cuentas con contraseña se crean
-- por ambiente con db/crear_cuentas.sh y se hacen miembros de un grupo.
--
--   sga_operaciones  propietario de las operaciones transaccionales. Las
--                    funciones de negocio se ejecutan con SUS privilegios
--                    (SECURITY DEFINER), de modo que la única vía para crear
--                    reservaciones, pagos, check-in o registros de bitácora
--                    es a través de esas funciones, que aplican las reglas.
--   sga_aplicacion   cuenta del backend: lee, administra catálogos y vuelos e
--                    invoca las operaciones. No escribe directamente en
--                    reservaciones, pagos, check-in ni bitácora; no borra; no
--                    altera la estructura; no lee resúmenes de contraseña.
--   sga_reportes     solo lectura de las vistas de reportes (RF-16).
--   sga_auditor      no tiene acceso: sus "permisos" definen las políticas de
--                    auditoría de objetos de pgAudit (migración 006).
--
-- Toda tabla o función nueva nace SIN permisos para estos grupos: cada
-- migración futura debe otorgarlos explícitamente (S-09).
-- =============================================================================

DO $$
DECLARE
    v_rol text;
BEGIN
    FOREACH v_rol IN ARRAY ARRAY['sga_operaciones', 'sga_aplicacion', 'sga_reportes', 'sga_auditor'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_rol) THEN
            EXECUTE format('CREATE ROLE %I NOLOGIN', v_rol);
        END IF;
    END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- [S-09] Nada es accesible por omisión
-- -----------------------------------------------------------------------------
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
DO $$
BEGIN
    EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO sga_aplicacion, sga_reportes', current_database());
END;
$$;

GRANT USAGE ON SCHEMA public TO sga_operaciones, sga_aplicacion, sga_reportes;

-- -----------------------------------------------------------------------------
-- sga_operaciones: lo estrictamente necesario para las operaciones de negocio
-- -----------------------------------------------------------------------------
GRANT SELECT ON rol, usuario, aeropuerto, ruta, avion, vuelo, asiento, reservacion, pago, check_in
    TO sga_operaciones;
-- El bloqueo pesimista FOR UPDATE exige privilegio de actualización sobre la fila
GRANT UPDATE (numero) ON asiento TO sga_operaciones;
GRANT INSERT ON asiento, reservacion, pago, check_in, bitacora TO sga_operaciones;
GRANT UPDATE (estado) ON reservacion TO sga_operaciones;
GRANT UPDATE (intentos_fallidos, bloqueado_hasta, activo, fecha_baja) ON usuario TO sga_operaciones;
GRANT EXECUTE ON FUNCTION gen_random_bytes(integer) TO sga_operaciones;

-- Funciones que se ejecutan con los privilegios de sga_operaciones. La ruta de
-- búsqueda queda fija para impedir que un objeto homónimo las suplante.
DO $$
DECLARE
    v_funcion regprocedure;
BEGIN
    FOREACH v_funcion IN ARRAY ARRAY[
        -- Operaciones de negocio (003)
        'crear_reservacion(integer, integer, varchar)',
        'cancelar_reservacion(varchar, integer)',
        'expirar_reservaciones()',
        'registrar_pago(varchar, numeric, varchar)',
        'realizar_check_in(varchar, integer)',
        'obtener_credencial(varchar)',
        'registrar_intento_fallido(integer)',
        'registrar_acceso_exitoso(integer)',
        'desbloquear_cuenta(integer)',
        'dar_baja_usuario(integer)',
        -- Bitácora (002): nadie escribe en ella salvo estas funciones
        'registrar_evento(varchar, varchar, varchar)',
        'registrar_operacion_bitacora()',
        -- Disparadores que escriben en tablas restringidas (001)
        'generar_asientos()',
        'propagar_cancelacion_vuelo()'
    ]::regprocedure[] LOOP
        EXECUTE format('ALTER FUNCTION %s OWNER TO sga_operaciones', v_funcion);
        EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = public, pg_temp', v_funcion);
    END LOOP;

    -- Auxiliares que invocan las funciones anteriores
    FOREACH v_funcion IN ARRAY ARRAY[
        'usuario_actor()', 'exigir_rol(integer, text[])', 'generar_codigo(integer)'
    ]::regprocedure[] LOOP
        EXECUTE format('ALTER FUNCTION %s OWNER TO sga_operaciones', v_funcion);
    END LOOP;
END;
$$;

-- Al cambiar de propietario, PostgreSQL vuelve a otorgar EXECUTE a PUBLIC solo
-- si el nuevo propietario lo hace; se revoca de nuevo por seguridad.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- sga_aplicacion
-- -----------------------------------------------------------------------------

-- Lectura. Del usuario no se expone el resumen de contraseña (S-01): la
-- autenticación lo obtiene con obtener_credencial().
GRANT SELECT ON rol, aeropuerto, ruta, avion, vuelo, asiento, reservacion, pago,
                check_in, bitacora, disponibilidad_asiento
    TO sga_aplicacion;
GRANT SELECT (id_usuario, nombre, correo, id_rol, intentos_fallidos, bloqueado_hasta,
              activo, fecha_alta, fecha_baja)
    ON usuario TO sga_aplicacion;

-- Catálogos y vuelos: alta y modificación; la baja es lógica (V-12)
GRANT INSERT, UPDATE ON aeropuerto, ruta, avion, vuelo TO sga_aplicacion;

-- Usuarios: registro, edición de datos, cambio de contraseña y de rol.
-- Bloqueo, desbloqueo y baja solo mediante sus funciones.
GRANT INSERT (nombre, correo, contrasena_hash, id_rol) ON usuario TO sga_aplicacion;
GRANT UPDATE (nombre, correo, contrasena_hash, id_rol) ON usuario TO sga_aplicacion;

-- Operaciones de negocio
GRANT EXECUTE ON FUNCTION
    crear_reservacion(integer, integer, varchar),
    cancelar_reservacion(varchar, integer),
    expirar_reservaciones(),
    registrar_pago(varchar, numeric, varchar),
    realizar_check_in(varchar, integer),
    obtener_credencial(varchar),
    registrar_intento_fallido(integer),
    registrar_acceso_exitoso(integer),
    desbloquear_cuenta(integer),
    dar_baja_usuario(integer),
    registrar_evento(varchar, varchar, varchar)
    TO sga_aplicacion;

-- -----------------------------------------------------------------------------
-- sga_reportes
-- -----------------------------------------------------------------------------
GRANT SELECT ON reporte_ocupacion_vuelo, reporte_reservaciones_diarias, reporte_pagos_diarios
    TO sga_reportes;
