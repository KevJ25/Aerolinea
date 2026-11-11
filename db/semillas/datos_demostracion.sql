-- =============================================================================
-- Datos de demostración · SOLO para los ambientes de Desarrollo, Integración y
-- Demostración (sección 15.3). Todos los datos son ficticios (sección 19.3).
--
-- Contraseña de todas las cuentas de demostración: Demo-SGA-2026!
-- Cada cuenta tiene su propio resumen Argon2id con sal única (S-01).
--
-- Las fechas de los vuelos son relativas al momento de la carga, para que los
-- datos sigan siendo válidos sin importar cuándo se ejecute.
-- Las operaciones se hacen con las mismas funciones que usa el backend, de
-- modo que la bitácora y las reglas se aplican igual que en uso real.
-- =============================================================================

DO $$
BEGIN
    IF current_database() ~* '(prod|produccion)' THEN
        RAISE EXCEPTION 'Los datos de demostración no se cargan en una base de producción';
    END IF;
    IF EXISTS (SELECT 1 FROM usuario) THEN
        RAISE EXCEPTION 'La base ya tiene usuarios; los datos de demostración solo se cargan en una base vacía';
    END IF;
END;
$$;

-- ---------------------------------------------------------------- usuarios
INSERT INTO usuario (nombre, correo, contrasena_hash, id_rol) VALUES
    ('Mariana Ruiz Pérez',  'mariana.ruiz@sga.mx',     '$argon2id$v=19$m=65536,t=3,p=4$pxTCN5WMBVRRAN6bkAVhjQ$iyKSNuX5qhn6Ey0dX044oUTeKtg6ymw1vEYKsJwupYs', 1),
    ('Luis Ortega Díaz',    'luis.ortega@sga.mx',      '$argon2id$v=19$m=65536,t=3,p=4$/EgbOQw09U3UtOwvDxk1Ig$TuGFH9XopUKw3X3//0cPTBazfOSXY8GROdaEL2+GA78', 2),
    ('Sofía Herrera Gil',   'sofia.herrera@sga.mx',    '$argon2id$v=19$m=65536,t=3,p=4$3D6b9PH9DoOX+UzVb10U0w$fTTtWTRqve0aaIXHoXW1hc+spbnj9BfAeu9nEXUthlk', 2),
    ('Ana López Ramírez',   'ana.lopez@correo.mx',     '$argon2id$v=19$m=65536,t=3,p=4$FfPoI6wPCc4XfiDcHXOTXg$QAAALjArAyuJJERo5CDM+mbKhoJkpQ6acpeb8nheAl0', 3),
    ('Jorge Mendoza Cruz',  'jorge.mendoza@correo.mx', '$argon2id$v=19$m=65536,t=3,p=4$AdJ4zJbko7kSHvZKy47p2g$Dgmr+HSQDzRZMDO1qHNysUbu4Q9VVy6MQZ9X0DEy/Uc', 3),
    ('Carmen Vázquez Soto', 'carmen.vazquez@correo.mx','$argon2id$v=19$m=65536,t=3,p=4$vuzav5+UH5PViMWsX0wvqg$4MRUPVSIHsQ+soHpVhTOrpwnHbNlmmheOri3lgwiefo', 3),
    ('Diego Navarro Luna',  'diego.navarro@correo.mx', '$argon2id$v=19$m=65536,t=3,p=4$JRYyZ0V7P7WyFwrtgSiRdg$u0IWjvXD6PD4DO69fW2kbMdAo+raMnqG8LfOq53HhS8', 3);

-- El administrador realiza las altas siguientes
SELECT set_config('sga.id_usuario', (SELECT id_usuario::text FROM usuario WHERE correo = 'mariana.ruiz@sga.mx'), false);

-- ---------------------------------------------------------------- catálogos
INSERT INTO aeropuerto (codigo_iata, nombre, ciudad, pais, activo) VALUES
    ('TLC', 'Aeropuerto Internacional de Toluca',      'Toluca',      'México', true),
    ('CUN', 'Aeropuerto Internacional de Cancún',      'Cancún',      'México', true),
    ('GDL', 'Aeropuerto Internacional de Guadalajara', 'Guadalajara', 'México', true),
    ('MTY', 'Aeropuerto Internacional de Monterrey',   'Monterrey',   'México', true),
    ('TIJ', 'Aeropuerto Internacional de Tijuana',     'Tijuana',     'México', true),
    ('MID', 'Aeropuerto Internacional de Mérida',      'Mérida',      'México', true),
    ('ACA', 'Aeropuerto Internacional de Acapulco',    'Acapulco',    'México', false);

INSERT INTO ruta (id_aeropuerto_origen, id_aeropuerto_destino)
SELECT o.id_aeropuerto, d.id_aeropuerto
FROM (VALUES ('TLC', 'CUN'), ('CUN', 'TLC'), ('TLC', 'GDL'), ('TLC', 'MTY'),
             ('TLC', 'TIJ'), ('TLC', 'MID')) AS r (origen, destino)
JOIN aeropuerto o ON o.codigo_iata = r.origen
JOIN aeropuerto d ON d.codigo_iata = r.destino;

INSERT INTO avion (matricula, modelo, capacidad, estado_operativo) VALUES
    ('XA-SGA', 'ATR 72-600',   72,  'DISPONIBLE'),
    ('XA-SGB', 'ATR 72-600',   72,  'DISPONIBLE'),
    ('XA-SGC', 'ATR 72-600',   72,  'DISPONIBLE'),
    ('XA-SGD', 'ATR 72-600',   72,  'DISPONIBLE'),
    ('XA-SGE', 'ATR 72-600',   72,  'DISPONIBLE'),
    ('XA-SGG', 'Embraer E190', 100, 'MANTENIMIENTO');

-- ---------------------------------------------------------------- vuelos
-- Al insertar cada vuelo se generan sus asientos (RF-08)
INSERT INTO vuelo (numero_vuelo, id_ruta, id_avion, fecha_salida, fecha_llegada, tarifa, estado_vuelo)
SELECT v.numero, ru.id_ruta, av.id_avion,
       date_trunc('day', now()) + v.dias * interval '1 day' + v.hora,
       date_trunc('day', now()) + v.dias * interval '1 day' + v.hora + v.duracion,
       v.tarifa, v.estado
FROM (VALUES
    ('SG 1204', 'TLC', 'CUN', 'XA-SGA', 7, time '06:40', interval '2 hours 35 minutes', 1850.00, 'ABIERTO'),
    ('SG 1210', 'TLC', 'CUN', 'XA-SGB', 7, time '12:20', interval '2 hours 35 minutes', 1620.00, 'PROGRAMADO'),
    ('SG 1218', 'TLC', 'CUN', 'XA-SGC', 7, time '18:05', interval '2 hours 40 minutes', 2140.00, 'RETRASADO'),
    ('SG 1205', 'CUN', 'TLC', 'XA-SGA', 9, time '10:30', interval '2 hours 50 minutes', 1790.00, 'PROGRAMADO'),
    ('SG 0721', 'TLC', 'GDL', 'XA-SGD', 3, time '08:05', interval '1 hour 20 minutes',  1240.00, 'ABIERTO'),
    ('SG 0318', 'TLC', 'MTY', 'XA-SGE', 2, time '07:15', interval '1 hour 45 minutes',  1380.00, 'ABIERTO'),
    ('SG 0950', 'TLC', 'TIJ', 'XA-SGB', 12, time '09:30', interval '3 hours 40 minutes', 2650.00, 'PROGRAMADO'),
    ('SG 1112', 'TLC', 'MID', 'XA-SGC', 14, time '10:10', interval '2 hours 10 minutes', 1980.00, 'PROGRAMADO')
) AS v (numero, origen, destino, matricula, dias, hora, duracion, tarifa, estado)
JOIN aeropuerto o  ON o.codigo_iata = v.origen
JOIN aeropuerto d  ON d.codigo_iata = v.destino
JOIN ruta ru       ON ru.id_aeropuerto_origen = o.id_aeropuerto AND ru.id_aeropuerto_destino = d.id_aeropuerto
JOIN avion av      ON av.matricula = v.matricula;

-- ---------------------------------------------------------------- operaciones
-- Reservaciones, pagos y check-in con las funciones de negocio. Cada pasajero
-- actúa como sí mismo (sga.id_usuario) para que la bitácora sea realista.
CREATE TEMP TABLE demo_reserva (pasajero text, vuelo text, asiento text, pagar boolean, documentar boolean);
INSERT INTO demo_reserva VALUES
    ('ana.lopez@correo.mx',      'SG 1204', '12C', false, false),
    ('ana.lopez@correo.mx',      'SG 0318', '4B',  true,  false),
    ('ana.lopez@correo.mx',      'SG 0721', '8A',  true,  true),
    ('jorge.mendoza@correo.mx',  'SG 1204', '9F',  false, false),
    ('jorge.mendoza@correo.mx',  'SG 1210', '3D',  true,  false),
    ('carmen.vazquez@correo.mx', 'SG 1204', '1A',  true,  false),
    ('carmen.vazquez@correo.mx', 'SG 0950', '6E',  true,  false),
    ('diego.navarro@correo.mx',  'SG 1218', '10B', true,  false),
    ('diego.navarro@correo.mx',  'SG 0721', '2C',  true,  true);

DO $$
DECLARE
    r          record;
    v_pasajero integer;
    v_empleado integer := (SELECT id_usuario FROM usuario WHERE correo = 'luis.ortega@sga.mx');
    v_vuelo    vuelo%ROWTYPE;
    v_codigo   char(8);
BEGIN
    FOR r IN SELECT * FROM demo_reserva LOOP
        SELECT id_usuario INTO v_pasajero FROM usuario WHERE correo = r.pasajero;
        SELECT * INTO v_vuelo FROM vuelo WHERE numero_vuelo = r.vuelo;
        PERFORM set_config('sga.id_usuario', v_pasajero::text, false);
        v_codigo := crear_reservacion(v_pasajero, v_vuelo.id_vuelo, r.asiento);
        IF r.pagar THEN
            PERFORM registrar_pago(v_codigo, v_vuelo.tarifa, 'TARJETA_PRUEBA_APROBADA');
        END IF;
        IF r.documentar THEN
            PERFORM set_config('sga.id_usuario', v_empleado::text, false);
            PERFORM realizar_check_in(v_codigo, v_empleado);
        END IF;
    END LOOP;
END;
$$;

-- Un pago rechazado por monto incorrecto (CA-08) y una cancelación (RF-12)
DO $$
DECLARE
    v_jorge integer := (SELECT id_usuario FROM usuario WHERE correo = 'jorge.mendoza@correo.mx');
    v_codigo text;
BEGIN
    PERFORM set_config('sga.id_usuario', v_jorge::text, false);
    SELECT r.codigo_reserva INTO v_codigo
    FROM reservacion r JOIN asiento a USING (id_asiento) JOIN vuelo v USING (id_vuelo)
    WHERE r.id_usuario = v_jorge AND v.numero_vuelo = 'SG 1204';
    PERFORM registrar_pago(v_codigo, 1500.00, 'TARJETA_PRUEBA_APROBADA');
    PERFORM cancelar_reservacion(v_codigo, v_jorge);
END;
$$;

-- Una empleada dada de baja (V-12, baja lógica)
SELECT set_config('sga.id_usuario', (SELECT id_usuario::text FROM usuario WHERE correo = 'mariana.ruiz@sga.mx'), false);
SELECT dar_baja_usuario((SELECT id_usuario FROM usuario WHERE correo = 'sofia.herrera@sga.mx'));

SELECT set_config('sga.id_usuario', '', false);
DROP TABLE demo_reserva;
