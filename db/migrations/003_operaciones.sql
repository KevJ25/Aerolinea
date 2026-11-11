-- =============================================================================
-- Migración 003 · Operaciones transaccionales
-- Las operaciones cuya corrección depende de la concurrencia o de la
-- atomicidad se implementan en la base de datos y el backend solo las invoca.
-- Así una reservación, un pago o un check-in se aplican completos o no se
-- aplican (R-04), y el bloqueo pesimista (RNF-07) no depende de cada endpoint.
-- La migración 005 las convierte en SECURITY DEFINER con propietario
-- sga_operaciones: el backend no puede escribir directamente en reservaciones,
-- pagos ni check-in, solo invocar estas funciones.
--
-- Códigos de error propios. La API los traduce a mensajes genéricos (S-13):
--   SGA01  Asiento no disponible                       (RF-11, CA-06)
--   SGA02  El vuelo no admite la operación             (RF-06, RN-09)
--   SGA03  El estado de la reservación no lo permite   (RN-02, RN-03)
--   SGA04  Operación no autorizada para el usuario     (S-07, S-08, S-09)
--   SGA05  Registro inexistente
--   SGA06  Dato de entrada inválido                    (S-10)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------

-- Código aleatorio criptográficamente seguro. El alfabeto omite 0, O, 1 e I
-- para evitar confusiones al dictarlo en el mostrador de check-in. Tiene 32
-- símbolos, por lo que byte % 32 no introduce sesgo.
CREATE FUNCTION generar_codigo(p_longitud integer) RETURNS text
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    c_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_bytes    bytea := gen_random_bytes(p_longitud);
    v_codigo   text := '';
BEGIN
    FOR i IN 0 .. p_longitud - 1 LOOP
        v_codigo := v_codigo || substr(c_alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1);
    END LOOP;
    RETURN v_codigo;
END;
$$;

-- Verifica que el usuario exista, esté activo y tenga uno de los roles indicados
CREATE FUNCTION exigir_rol(p_id_usuario integer, p_roles text[]) RETURNS void
LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM usuario u JOIN rol r USING (id_rol)
        WHERE u.id_usuario = p_id_usuario AND u.activo AND r.nombre_rol = ANY (p_roles)
    ) THEN
        RAISE EXCEPTION 'Operación no autorizada para el usuario %', p_id_usuario
            USING ERRCODE = 'SGA04';
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- M-06 Reservaciones
-- -----------------------------------------------------------------------------

-- [RF-10][RF-11][RNF-07][RN-01][CA-05][CA-06]
-- Bloqueo pesimista sobre el asiento: dos solicitudes simultáneas por el mismo
-- asiento se atienden en serie; la segunda encuentra el asiento ocupado y
-- recibe SGA01 sin generar registro.
CREATE FUNCTION crear_reservacion(p_id_pasajero integer, p_id_vuelo integer, p_numero_asiento varchar)
RETURNS char(8)
LANGUAGE plpgsql AS $$
DECLARE
    c_longitud_codigo constant integer := 8;
    v_id_asiento integer;
    v_codigo     char(8);
BEGIN
    PERFORM exigir_rol(p_id_pasajero, ARRAY['Pasajero']);

    -- Bloqueo pesimista del asiento (RNF-07)
    SELECT a.id_asiento INTO v_id_asiento
    FROM asiento a
    WHERE a.id_vuelo = p_id_vuelo AND a.numero = upper(p_numero_asiento)
    FOR UPDATE;

    IF v_id_asiento IS NULL THEN
        RAISE EXCEPTION 'El asiento % no existe en el vuelo %', p_numero_asiento, p_id_vuelo
            USING ERRCODE = 'SGA05';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM vuelo
        WHERE id_vuelo = p_id_vuelo
          AND estado_vuelo IN ('PROGRAMADO', 'ABIERTO', 'RETRASADO')
          AND fecha_salida > now()
    ) THEN
        RAISE EXCEPTION 'El vuelo % no admite reservaciones', p_id_vuelo
            USING ERRCODE = 'SGA02';
    END IF;

    -- [RN-11] una reservación vencida libera el asiento aunque el proceso
    -- periódico de expiración todavía no haya corrido
    UPDATE reservacion SET estado = 'EXPIRADA'
    WHERE id_asiento = v_id_asiento
      AND estado IN ('PENDIENTE', 'CONFIRMADA')
      AND fecha_expiracion <= now();

    IF EXISTS (
        SELECT 1 FROM reservacion
        WHERE id_asiento = v_id_asiento
          AND estado IN ('PENDIENTE', 'CONFIRMADA', 'PAGADA', 'ABORDADA')
    ) THEN
        RAISE EXCEPTION 'El asiento % ya no está disponible', upper(p_numero_asiento)
            USING ERRCODE = 'SGA01';
    END IF;

    -- Reintenta en el caso improbable de que el código aleatorio ya exista
    LOOP
        v_codigo := generar_codigo(c_longitud_codigo);
        BEGIN
            INSERT INTO reservacion (codigo_reserva, id_usuario, id_asiento)
            VALUES (v_codigo, p_id_pasajero, v_id_asiento);
            RETURN v_codigo;
        EXCEPTION WHEN unique_violation THEN
            -- Si la colisión fue del asiento y no del código, el índice
            -- reservacion_asiento_activo_uq es la última garantía (V-09)
            IF SQLERRM LIKE '%reservacion_asiento_activo_uq%' THEN
                RAISE EXCEPTION 'El asiento % ya no está disponible', upper(p_numero_asiento)
                    USING ERRCODE = 'SGA01';
            END IF;
        END;
    END LOOP;
END;
$$;

-- [RF-12][S-08] Cancela una reservación. El pasajero solo puede cancelar las
-- suyas; empleados y administradores pueden cancelar cualquiera.
CREATE FUNCTION cancelar_reservacion(p_codigo varchar, p_id_solicitante integer)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_reservacion reservacion%ROWTYPE;
BEGIN
    SELECT * INTO v_reservacion FROM reservacion
    WHERE codigo_reserva = upper(p_codigo)
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La reservación % no existe', p_codigo USING ERRCODE = 'SGA05';
    END IF;

    IF v_reservacion.id_usuario <> p_id_solicitante THEN
        PERFORM exigir_rol(p_id_solicitante, ARRAY['Empleado', 'Administrador']);
    ELSE
        PERFORM exigir_rol(p_id_solicitante, ARRAY['Pasajero']);
    END IF;

    IF v_reservacion.estado NOT IN ('PENDIENTE', 'CONFIRMADA', 'PAGADA') THEN
        RAISE EXCEPTION 'Una reservación en estado % no puede cancelarse', v_reservacion.estado
            USING ERRCODE = 'SGA03';
    END IF;

    UPDATE reservacion SET estado = 'CANCELADA' WHERE id_reservacion = v_reservacion.id_reservacion;
END;
$$;

-- [RN-11] Proceso periódico: marca como EXPIRADAS las reservaciones sin pago
-- cuyo plazo venció. Devuelve cuántas expiró. Se programa desde el backend o
-- con cron cada 15 minutos.
CREATE FUNCTION expirar_reservaciones() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
    v_total integer;
BEGIN
    UPDATE reservacion SET estado = 'EXPIRADA'
    WHERE estado IN ('PENDIENTE', 'CONFIRMADA')
      AND fecha_expiracion <= now();
    GET DIAGNOSTICS v_total = ROW_COUNT;
    RETURN v_total;
END;
$$;

-- -----------------------------------------------------------------------------
-- M-07 Pagos simulados
-- -----------------------------------------------------------------------------

-- [RF-13][RF-14][RN-02][RN-08][CA-08][R-04]
-- Registra el pago simulado. Se aprueba solo si el método de prueba es el de
-- aprobación y el monto coincide exactamente con la tarifa del vuelo. Un pago
-- rechazado queda registrado y la reservación conserva su estado (CA-08).
-- Devuelve el estado del pago: APROBADO o RECHAZADO.
CREATE FUNCTION registrar_pago(p_codigo varchar, p_monto numeric, p_metodo varchar)
RETURNS varchar
LANGUAGE plpgsql AS $$
DECLARE
    v_reservacion reservacion%ROWTYPE;
    v_tarifa      numeric(10, 2);
    v_estado      varchar(20);
BEGIN
    IF p_monto IS NULL OR p_monto <= 0 THEN
        RAISE EXCEPTION 'El monto debe ser mayor que cero' USING ERRCODE = 'SGA06';
    END IF;

    SELECT * INTO v_reservacion FROM reservacion
    WHERE codigo_reserva = upper(p_codigo)
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La reservación % no existe', p_codigo USING ERRCODE = 'SGA05';
    END IF;

    IF v_reservacion.estado NOT IN ('PENDIENTE', 'CONFIRMADA') OR v_reservacion.fecha_expiracion <= now() THEN
        RAISE EXCEPTION 'La reservación % no admite pagos en su estado actual', p_codigo
            USING ERRCODE = 'SGA03';
    END IF;

    SELECT v.tarifa INTO v_tarifa
    FROM asiento a JOIN vuelo v USING (id_vuelo)
    WHERE a.id_asiento = v_reservacion.id_asiento;

    v_estado := CASE
        WHEN p_metodo = 'TARJETA_PRUEBA_APROBADA' AND p_monto = v_tarifa THEN 'APROBADO'
        ELSE 'RECHAZADO'
    END;

    INSERT INTO pago (id_reservacion, monto, metodo_prueba, estado)
    VALUES (v_reservacion.id_reservacion, p_monto, p_metodo, v_estado);

    IF v_estado = 'APROBADO' THEN
        UPDATE reservacion SET estado = 'PAGADA' WHERE id_reservacion = v_reservacion.id_reservacion;
    END IF;

    RETURN v_estado;
END;
$$;

-- -----------------------------------------------------------------------------
-- M-08 Check-in
-- -----------------------------------------------------------------------------

-- [RF-15][RN-03][CA-09] Realiza el check-in de una reservación PAGADA y emite
-- el pase de abordar. Solo empleados y administradores. Devuelve el número
-- de pase de 12 caracteres.
CREATE FUNCTION realizar_check_in(p_codigo varchar, p_id_empleado integer)
RETURNS char(12)
LANGUAGE plpgsql AS $$
DECLARE
    c_longitud_pase constant integer := 12;
    v_reservacion reservacion%ROWTYPE;
    v_pase        char(12);
BEGIN
    PERFORM exigir_rol(p_id_empleado, ARRAY['Empleado', 'Administrador']);

    SELECT * INTO v_reservacion FROM reservacion
    WHERE codigo_reserva = upper(p_codigo)
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La reservación % no existe', p_codigo USING ERRCODE = 'SGA05';
    END IF;

    IF v_reservacion.estado <> 'PAGADA' THEN
        RAISE EXCEPTION 'El check-in requiere una reservación PAGADA (estado actual: %)', v_reservacion.estado
            USING ERRCODE = 'SGA03';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM asiento a JOIN vuelo v USING (id_vuelo)
        WHERE a.id_asiento = v_reservacion.id_asiento
          AND v.estado_vuelo IN ('PROGRAMADO', 'ABIERTO', 'RETRASADO')
    ) THEN
        RAISE EXCEPTION 'El vuelo de la reservación % no admite check-in', p_codigo
            USING ERRCODE = 'SGA02';
    END IF;

    LOOP
        v_pase := generar_codigo(c_longitud_pase);
        BEGIN
            INSERT INTO check_in (id_reservacion, num_pase_abordar, id_empleado)
            VALUES (v_reservacion.id_reservacion, v_pase, p_id_empleado);
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            IF SQLERRM NOT LIKE '%num_pase_abordar%' THEN
                RAISE;
            END IF;
        END;
    END LOOP;

    UPDATE reservacion SET estado = 'ABORDADA' WHERE id_reservacion = v_reservacion.id_reservacion;
    RETURN v_pase;
END;
$$;

-- -----------------------------------------------------------------------------
-- M-01 Autenticación y administración de cuentas
-- -----------------------------------------------------------------------------
-- La verificación del resumen Argon2id ocurre en el backend. La base de datos
-- lleva el conteo de intentos y el bloqueo, para que no dependan del proceso
-- del servidor web.

-- Datos necesarios para autenticar. Solo devuelve usuarios activos.
CREATE FUNCTION obtener_credencial(p_correo varchar)
RETURNS TABLE (id_usuario integer, contrasena_hash varchar, nombre_rol varchar, bloqueada boolean, bloqueada_hasta timestamptz)
LANGUAGE sql STABLE AS $$
    SELECT u.id_usuario, u.contrasena_hash, r.nombre_rol,
           coalesce(u.bloqueado_hasta > now(), false), u.bloqueado_hasta
    FROM usuario u JOIN rol r USING (id_rol)
    WHERE lower(u.correo) = lower(p_correo) AND u.activo;
$$;

-- [RF-02][S-02][CP-02] Registra un intento fallido. Al quinto intento
-- consecutivo bloquea la cuenta 24 horas. Devuelve true si la cuenta queda
-- (o ya estaba) bloqueada.
CREATE FUNCTION registrar_intento_fallido(p_id_usuario integer) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
    c_max_intentos    constant integer := 5;
    c_duracion_bloqueo constant interval := interval '24 hours';
    v_usuario usuario%ROWTYPE;
BEGIN
    SELECT * INTO v_usuario FROM usuario WHERE id_usuario = p_id_usuario FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El usuario % no existe', p_id_usuario USING ERRCODE = 'SGA05';
    END IF;

    IF v_usuario.bloqueado_hasta > now() THEN
        RETURN true;
    END IF;

    IF v_usuario.intentos_fallidos + 1 >= c_max_intentos THEN
        UPDATE usuario
        SET intentos_fallidos = 0, bloqueado_hasta = now() + c_duracion_bloqueo
        WHERE id_usuario = p_id_usuario;
        INSERT INTO bitacora (id_usuario, accion, modulo, detalle)
        VALUES (p_id_usuario, 'ACCESO', 'Usuarios',
                format('Cuenta bloqueada 24 horas tras %s intentos fallidos consecutivos', c_max_intentos));
        RETURN true;
    END IF;

    UPDATE usuario SET intentos_fallidos = intentos_fallidos + 1 WHERE id_usuario = p_id_usuario;
    INSERT INTO bitacora (id_usuario, accion, modulo, detalle)
    VALUES (p_id_usuario, 'ACCESO', 'Usuarios',
            format('Intento de inicio de sesión fallido (%s de %s)', v_usuario.intentos_fallidos + 1, c_max_intentos));
    RETURN false;
END;
$$;

-- Registra un inicio de sesión correcto y reinicia el conteo de intentos.
CREATE FUNCTION registrar_acceso_exitoso(p_id_usuario integer) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL
    WHERE id_usuario = p_id_usuario AND activo AND coalesce(bloqueado_hasta <= now(), true);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La cuenta % no puede iniciar sesión', p_id_usuario USING ERRCODE = 'SGA04';
    END IF;

    INSERT INTO bitacora (id_usuario, accion, modulo, detalle)
    VALUES (p_id_usuario, 'ACCESO', 'Usuarios', 'Inicio de sesión');
END;
$$;

-- [RF-18] Desbloqueo manual. Solo un administrador, identificado por
-- sga.id_usuario, puede ejecutarlo.
CREATE FUNCTION desbloquear_cuenta(p_id_usuario integer) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM exigir_rol(usuario_actor(), ARRAY['Administrador']);

    UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL
    WHERE id_usuario = p_id_usuario AND bloqueado_hasta > now();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La cuenta % no está bloqueada', p_id_usuario USING ERRCODE = 'SGA05';
    END IF;

    INSERT INTO bitacora (id_usuario, accion, modulo, detalle)
    VALUES (usuario_actor(), 'ACCESO', 'Usuarios', format('Desbloqueo manual de la cuenta id_usuario=%s', p_id_usuario));
END;
$$;

-- [RF-03][V-12] Baja lógica de un usuario. Solo un administrador.
CREATE FUNCTION dar_baja_usuario(p_id_usuario integer) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM exigir_rol(usuario_actor(), ARRAY['Administrador']);

    IF p_id_usuario = usuario_actor() THEN
        RAISE EXCEPTION 'Un administrador no puede darse de baja a sí mismo' USING ERRCODE = 'SGA04';
    END IF;

    UPDATE usuario SET activo = false, fecha_baja = now()
    WHERE id_usuario = p_id_usuario AND activo;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El usuario % no existe o ya está dado de baja', p_id_usuario USING ERRCODE = 'SGA05';
    END IF;
END;
$$;
