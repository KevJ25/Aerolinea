-- =============================================================================
-- Itinerario de demostración · SOLO para Desarrollo, Integración y Demostración
--
-- Programa los vuelos de los próximos 60 días con un horario fijo por ruta,
-- como el de una aerolínea real, y aparta asientos en los vuelos de las
-- próximas dos semanas para que los mapas de asientos se vean ocupados.
--
-- Se puede ejecutar las veces que sea necesario: solo agrega los vuelos que
-- falten (por número y hora de salida). Ejecutarlo de nuevo más adelante
-- extiende el itinerario otros 60 días a partir de esa fecha.
--
-- Todo pasa por las reglas del sistema: los asientos se generan al insertar
-- cada vuelo (RF-08), las reservaciones usan crear_reservacion() y los pagos
-- registrar_pago(), y cada operación queda en la bitácora (RF-17).
-- =============================================================================

DO $$
BEGIN
    IF current_database() ~* '(prod|produccion)' THEN
        RAISE EXCEPTION 'El itinerario de demostración no se carga en una base de producción';
    END IF;
END;
$$;

-- El primer administrador activo figura como autor de las altas
SELECT set_config('sga.id_usuario', coalesce(
    (SELECT u.id_usuario::text FROM usuario u JOIN rol r USING (id_rol)
     WHERE r.nombre_rol = 'Administrador' AND u.activo ORDER BY u.id_usuario LIMIT 1), ''), false);

-- ---------------------------------------------------------------- catálogo
INSERT INTO aeropuerto (codigo_iata, nombre, ciudad, pais) VALUES
    ('TLC', 'Aeropuerto Internacional de Toluca',      'Toluca',      'México'),
    ('CUN', 'Aeropuerto Internacional de Cancún',      'Cancún',      'México'),
    ('GDL', 'Aeropuerto Internacional de Guadalajara', 'Guadalajara', 'México'),
    ('MTY', 'Aeropuerto Internacional de Monterrey',   'Monterrey',   'México'),
    ('TIJ', 'Aeropuerto Internacional de Tijuana',     'Tijuana',     'México'),
    ('MID', 'Aeropuerto Internacional de Mérida',      'Mérida',      'México')
ON CONFLICT (codigo_iata) DO NOTHING;

INSERT INTO avion (matricula, modelo, capacidad, estado_operativo) VALUES
    ('XA-SGA', 'ATR 72-600',   72,  'DISPONIBLE'),
    ('XA-SGB', 'ATR 72-600',   72,  'DISPONIBLE'),
    ('XA-SGC', 'ATR 72-600',   72,  'DISPONIBLE'),
    ('XA-SGD', 'ATR 72-600',   72,  'DISPONIBLE'),
    ('XA-SGE', 'ATR 72-600',   72,  'DISPONIBLE'),
    ('XA-SGF', 'ATR 72-600',   72,  'DISPONIBLE'),
    ('XA-SGH', 'Embraer E190', 100, 'DISPONIBLE')
ON CONFLICT (matricula) DO NOTHING;

-- Horario base: número, ruta, hora local de salida, duración, tarifa base,
-- aeronave y días de operación (1 = lunes ... 7 = domingo)
CREATE TEMP TABLE horario (
    numero varchar(10), origen char(3), destino char(3), hora time, duracion interval,
    tarifa numeric(10, 2), matricula varchar(10), dias int[]
);
INSERT INTO horario VALUES
    ('SG 1204', 'TLC', 'CUN', '06:40', '2 hours 35 minutes', 1850, 'XA-SGA', '{1,2,3,4,5,6,7}'),
    ('SG 1210', 'TLC', 'CUN', '12:20', '2 hours 35 minutes', 1620, 'XA-SGB', '{1,2,3,4,5,6,7}'),
    ('SG 1218', 'TLC', 'CUN', '18:05', '2 hours 40 minutes', 2140, 'XA-SGC', '{1,2,3,4,5,6,7}'),
    ('SG 1205', 'CUN', 'TLC', '10:30', '2 hours 50 minutes', 1790, 'XA-SGA', '{1,2,3,4,5,6,7}'),
    ('SG 1211', 'CUN', 'TLC', '16:10', '2 hours 50 minutes', 1690, 'XA-SGB', '{1,2,3,4,5,6,7}'),
    ('SG 0721', 'TLC', 'GDL', '08:05', '1 hour 20 minutes',  1240, 'XA-SGD', '{1,2,3,4,5,6,7}'),
    ('SG 0727', 'TLC', 'GDL', '19:30', '1 hour 20 minutes',  1180, 'XA-SGD', '{1,2,3,4,5,6,7}'),
    ('SG 0722', 'GDL', 'TLC', '10:15', '1 hour 20 minutes',  1240, 'XA-SGD', '{1,2,3,4,5,6,7}'),
    ('SG 0318', 'TLC', 'MTY', '07:15', '1 hour 45 minutes',  1380, 'XA-SGE', '{1,2,3,4,5,6,7}'),
    ('SG 0324', 'TLC', 'MTY', '17:45', '1 hour 45 minutes',  1450, 'XA-SGE', '{1,2,3,4,5}'),
    ('SG 0319', 'MTY', 'TLC', '09:50', '1 hour 45 minutes',  1380, 'XA-SGE', '{1,2,3,4,5,6,7}'),
    ('SG 0950', 'TLC', 'TIJ', '09:30', '3 hours 40 minutes', 2650, 'XA-SGH', '{1,2,3,4,5,6,7}'),
    ('SG 0951', 'TIJ', 'TLC', '14:30', '3 hours 30 minutes', 2650, 'XA-SGH', '{1,2,3,4,5,6,7}'),
    ('SG 1112', 'TLC', 'MID', '10:10', '2 hours 10 minutes', 1980, 'XA-SGC', '{1,3,5,7}'),
    ('SG 1113', 'MID', 'TLC', '13:30', '2 hours 10 minutes', 1980, 'XA-SGC', '{1,3,5,7}'),
    ('SG 2200', 'GDL', 'CUN', '11:00', '2 hours 50 minutes', 2290, 'XA-SGF', '{2,4,6}'),
    ('SG 2201', 'CUN', 'GDL', '15:20', '2 hours 50 minutes', 2290, 'XA-SGF', '{2,4,6}');

INSERT INTO ruta (id_aeropuerto_origen, id_aeropuerto_destino)
SELECT DISTINCT o.id_aeropuerto, d.id_aeropuerto
FROM horario h
JOIN aeropuerto o ON o.codigo_iata = h.origen
JOIN aeropuerto d ON d.codigo_iata = h.destino
ON CONFLICT (id_aeropuerto_origen, id_aeropuerto_destino) DO NOTHING;

-- ---------------------------------------------------------------- vuelos
-- Tarifa: base, +12 % viernes y domingo, y una variación fija por vuelo y día
-- para que el calendario muestre precios distintos. Abiertos los próximos 7 días.
CREATE TEMP TABLE vuelos_nuevos (id_vuelo integer);

WITH dias AS (
    SELECT (now() AT TIME ZONE 'America/Mexico_City')::date + n AS dia
    FROM generate_series(0, 59) AS n
), programacion AS (
    SELECT h.numero, ru.id_ruta, av.id_avion,
           ((d.dia + h.hora) AT TIME ZONE 'America/Mexico_City') AS salida,
           ((d.dia + h.hora + h.duracion) AT TIME ZONE 'America/Mexico_City') AS llegada,
           round(h.tarifa
                 * CASE WHEN extract(isodow FROM d.dia) IN (5, 7) THEN 1.12 ELSE 1 END
                 + (abs(hashtext(h.numero || d.dia::text)) % 7) * 30, -1) AS tarifa,
           CASE WHEN d.dia < (now() AT TIME ZONE 'America/Mexico_City')::date + 7
                THEN 'ABIERTO' ELSE 'PROGRAMADO' END AS estado
    FROM horario h
    CROSS JOIN dias d
    JOIN aeropuerto o  ON o.codigo_iata = h.origen
    JOIN aeropuerto de ON de.codigo_iata = h.destino
    JOIN ruta ru       ON ru.id_aeropuerto_origen = o.id_aeropuerto AND ru.id_aeropuerto_destino = de.id_aeropuerto
    JOIN avion av      ON av.matricula = h.matricula
    WHERE extract(isodow FROM d.dia) = ANY (h.dias)
), insertados AS (
    INSERT INTO vuelo (numero_vuelo, id_ruta, id_avion, fecha_salida, fecha_llegada, tarifa, estado_vuelo)
    SELECT numero, id_ruta, id_avion, salida, llegada, tarifa, estado
    FROM programacion
    WHERE salida > now() + interval '1 hour'
    ON CONFLICT (numero_vuelo, fecha_salida) DO NOTHING
    RETURNING id_vuelo
)
INSERT INTO vuelos_nuevos SELECT id_vuelo FROM insertados;

-- ---------------------------------------------------------------- ocupación
-- Pasajeros de demostración SIN contraseña utilizable: su resumen tiene formato
-- Argon2id válido pero se forma con bytes aleatorios, así que nadie puede
-- iniciar sesión con ellos. Solo sirven para ocupar asientos.
INSERT INTO usuario (nombre, correo, contrasena_hash, id_rol)
SELECT format('Pasajero de demostración %s', lpad(n::text, 2, '0')),
       format('pasajero.demo.%s@correo.mx', lpad(n::text, 2, '0')),
       format('$argon2id$v=19$m=65536,t=3,p=4$%s$%s',
              rtrim(encode(gen_random_bytes(16), 'base64'), '='),
              rtrim(encode(gen_random_bytes(32), 'base64'), '=')),
       3
FROM generate_series(1, 20) AS n
ON CONFLICT DO NOTHING;

-- En los vuelos nuevos de los próximos 14 días que siguen a la venta se aparta entre 10 % y 45 % de
-- los asientos; 70 % de esas reservaciones queda pagada.
DO $$
DECLARE
    v_vuelo      record;
    v_asiento    record;
    v_pasajeros  integer[];
    v_pasajero   integer;
    v_codigo     text;
    v_porcentaje integer;
BEGIN
    SELECT array_agg(id_usuario) INTO v_pasajeros
    FROM usuario WHERE correo LIKE 'pasajero.demo.%@correo.mx' AND activo;

    FOR v_vuelo IN
        SELECT v.id_vuelo, v.tarifa, (SELECT count(*) FROM asiento a WHERE a.id_vuelo = v.id_vuelo) AS asientos
        FROM vuelo v JOIN vuelos_nuevos n USING (id_vuelo)
        WHERE v.fecha_salida < now() + interval '14 days'
          AND v.fecha_salida > now() + interval '24 hours'  -- RN-12: la venta ya cerró
    LOOP
        v_porcentaje := 10 + abs(hashtext(v_vuelo.id_vuelo::text)) % 36;
        FOR v_asiento IN
            SELECT numero FROM asiento WHERE id_vuelo = v_vuelo.id_vuelo
            ORDER BY random() LIMIT ceil(v_vuelo.asientos * v_porcentaje / 100.0)
        LOOP
            v_pasajero := v_pasajeros[1 + floor(random() * array_length(v_pasajeros, 1))::int];
            PERFORM set_config('sga.id_usuario', v_pasajero::text, false);
            v_codigo := crear_reservacion(v_pasajero, v_vuelo.id_vuelo, v_asiento.numero);
            IF random() < 0.7 THEN
                PERFORM registrar_pago(v_codigo, v_vuelo.tarifa, 'TARJETA_PRUEBA_APROBADA');
            END IF;
        END LOOP;
    END LOOP;
END;
$$;

SELECT set_config('sga.id_usuario', '', false);

-- ---------------------------------------------------------------- resumen
SELECT (SELECT count(*) FROM vuelos_nuevos) AS vuelos_agregados,
       (SELECT count(*) FROM vuelo WHERE fecha_salida > now()
          AND estado_vuelo IN ('PROGRAMADO', 'ABIERTO', 'RETRASADO')) AS vuelos_futuros,
       (SELECT to_char(max(fecha_salida) AT TIME ZONE 'America/Mexico_City', 'DD/MM/YYYY') FROM vuelo) AS ultimo_dia;

DROP TABLE horario;
DROP TABLE vuelos_nuevos;
