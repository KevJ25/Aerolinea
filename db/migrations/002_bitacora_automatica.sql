-- =============================================================================
-- Migración 002 · Bitácora automática de operaciones
-- [RF-17][RN-10][S-12][CA-11] Toda alta, modificación y baja en las tablas
-- principales genera un registro en la bitácora con usuario, fecha, hora y
-- módulo, aunque la capa de negocio omita registrarla.
--
-- Contrato con el backend: al inicio de cada transacción la aplicación declara
-- quién actúa con
--     SELECT set_config('sga.id_usuario', '<id del usuario autenticado>', true);
-- El tercer parámetro (true) limita el valor a la transacción en curso.
--
-- Minimización de datos (LFPDPPP): la bitácora registra QUÉ campos cambiaron,
-- nunca sus valores, salvo los campos de estado y rol listados en
-- campos_con_valor, que son necesarios para el no repudio.
-- =============================================================================

-- Usuario de la aplicación que realiza la operación en curso (NULL si no se declaró)
CREATE FUNCTION usuario_actor() RETURNS integer
LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('sga.id_usuario', true), '')::integer;
$$;

-- Registro explícito de eventos que no son altas, bajas ni modificaciones:
-- inicios de sesión, accesos denegados (CP-25) y errores.
CREATE FUNCTION registrar_evento(p_accion varchar, p_modulo varchar, p_detalle varchar)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF p_accion NOT IN ('ACCESO', 'ERROR') THEN
        RAISE EXCEPTION 'registrar_evento solo admite ACCESO o ERROR; las altas, modificaciones y bajas se registran solas'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    INSERT INTO bitacora (id_usuario, accion, modulo, detalle)
    VALUES (usuario_actor(), p_accion, p_modulo, left(p_detalle, 500));
END;
$$;

CREATE FUNCTION registrar_operacion_bitacora() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    -- Argumentos del disparador: módulo y columna de la llave primaria
    v_modulo          constant text := TG_ARGV[0];
    v_columna_llave   constant text := TG_ARGV[1];
    -- Campos cuyo valor anterior y nuevo se conserva por no repudio
    campos_con_valor  constant text[] := ARRAY['estado', 'estado_vuelo', 'id_rol', 'activo'];
    -- Campos que gestionan las funciones de autenticación con su propio registro ACCESO
    campos_de_acceso  constant text[] := ARRAY['intentos_fallidos', 'bloqueado_hasta'];
    v_nuevo           jsonb := to_jsonb(NEW);
    v_anterior        jsonb;
    v_accion          text;
    v_cambios         text[];
    v_detalle         text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_accion := 'ALTA';
    ELSE
        v_anterior := to_jsonb(OLD);

        SELECT array_agg(
                   CASE WHEN clave = ANY (campos_con_valor)
                        THEN format('%s: %s → %s', clave, v_anterior ->> clave, v_nuevo ->> clave)
                        ELSE clave
                   END ORDER BY clave)
        INTO v_cambios
        FROM jsonb_object_keys(v_nuevo) AS clave
        WHERE v_nuevo -> clave IS DISTINCT FROM v_anterior -> clave
          AND NOT clave = ANY (campos_de_acceso);

        -- Actualización sin cambios reales o solo de campos de acceso
        IF v_cambios IS NULL THEN
            RETURN NULL;
        END IF;

        v_accion := CASE
            WHEN (v_anterior ->> 'activo')::boolean AND NOT (v_nuevo ->> 'activo')::boolean THEN 'BAJA'
            ELSE 'MODIFICACION'
        END;
    END IF;

    v_detalle := format('%s %s=%s', TG_TABLE_NAME, v_columna_llave, v_nuevo ->> v_columna_llave);
    IF v_cambios IS NOT NULL THEN
        v_detalle := v_detalle || '; campos: ' || array_to_string(v_cambios, ', ');
    END IF;
    -- Sin usuario de aplicación declarado se identifica la cuenta de base de datos
    IF usuario_actor() IS NULL THEN
        v_detalle := v_detalle || '; cuenta de base de datos: ' || session_user;
    END IF;

    INSERT INTO bitacora (id_usuario, accion, modulo, detalle)
    VALUES (usuario_actor(), v_accion, v_modulo, left(v_detalle, 500));
    RETURN NULL;
END;
$$;

CREATE TRIGGER usuario_bitacora     AFTER INSERT OR UPDATE ON usuario     FOR EACH ROW EXECUTE FUNCTION registrar_operacion_bitacora('Usuarios', 'id_usuario');
CREATE TRIGGER aeropuerto_bitacora  AFTER INSERT OR UPDATE ON aeropuerto  FOR EACH ROW EXECUTE FUNCTION registrar_operacion_bitacora('Aeropuertos', 'id_aeropuerto');
CREATE TRIGGER ruta_bitacora        AFTER INSERT OR UPDATE ON ruta        FOR EACH ROW EXECUTE FUNCTION registrar_operacion_bitacora('Rutas', 'id_ruta');
CREATE TRIGGER avion_bitacora       AFTER INSERT OR UPDATE ON avion       FOR EACH ROW EXECUTE FUNCTION registrar_operacion_bitacora('Aviones', 'id_avion');
CREATE TRIGGER vuelo_bitacora       AFTER INSERT OR UPDATE ON vuelo       FOR EACH ROW EXECUTE FUNCTION registrar_operacion_bitacora('Vuelos', 'id_vuelo');
CREATE TRIGGER reservacion_bitacora AFTER INSERT OR UPDATE ON reservacion FOR EACH ROW EXECUTE FUNCTION registrar_operacion_bitacora('Reservaciones', 'id_reservacion');
CREATE TRIGGER pago_bitacora        AFTER INSERT OR UPDATE ON pago        FOR EACH ROW EXECUTE FUNCTION registrar_operacion_bitacora('Pagos', 'id_pago');
CREATE TRIGGER check_in_bitacora    AFTER INSERT OR UPDATE ON check_in    FOR EACH ROW EXECUTE FUNCTION registrar_operacion_bitacora('Check-in', 'id_check_in');
-- Los asientos no se registran uno por uno: los genera el alta del vuelo (RF-08),
-- que ya queda en la bitácora.
