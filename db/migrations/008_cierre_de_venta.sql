-- =============================================================================
-- Migración 008 · Cierre de venta 24 horas antes de la salida
-- [RN-12] (nueva, para el Manual v2.1) La venta de un vuelo cierra 24 horas
-- antes de su salida.
--
-- Motivo: RN-11 fija que una reservación sin pago expira a las 48 horas de su
-- creación o 24 horas antes de la salida, lo que ocurra primero. Para un vuelo
-- que sale en menos de 24 horas ese plazo ya pasó al reservar: la reservación
-- nacía vencida, no podía pagarse y su asiento se liberaba ante la siguiente
-- solicitud. Se detectó al generar el itinerario de demostración.
--
-- Se reemplaza crear_reservacion() conservando su propietario, sus permisos,
-- SECURITY DEFINER y la ruta de búsqueda fija (migración 005).
-- =============================================================================

CREATE OR REPLACE FUNCTION crear_reservacion(p_id_pasajero integer, p_id_vuelo integer, p_numero_asiento varchar)
RETURNS char(8)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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

    -- [RN-12] La venta cierra 24 horas antes de la salida: después de ese
    -- momento el plazo de pago de RN-11 ya habría vencido al reservar
    IF EXISTS (
        SELECT 1 FROM vuelo
        WHERE id_vuelo = p_id_vuelo AND fecha_salida <= now() + interval '24 hours'
    ) THEN
        RAISE EXCEPTION 'La venta del vuelo % cerró 24 horas antes de la salida', p_id_vuelo
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
