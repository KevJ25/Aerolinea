-- =============================================================================
-- Pruebas de las reglas de integridad implementadas en la base de datos.
-- Cada bloque verifica una regla V-xx / RN-xx del Manual de Calidad.
-- Ejecutar sobre una base recién migrada:
--   psql -v ON_ERROR_STOP=1 -f db/pruebas/reglas_integridad.sql
-- Todo se ejecuta dentro de una transacción que se revierte al final.
-- =============================================================================

\set QUIET on
\pset tuples_only on
\pset format unaligned
BEGIN;

-- Ejecuta una sentencia que DEBE ser rechazada. Si no se rechaza, la prueba falla.
CREATE FUNCTION pg_temp.debe_fallar(p_regla text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'OK   %  (rechazada: %)', p_regla, SQLERRM;
        RETURN;
    END;
    RAISE EXCEPTION 'FALLA %: la sentencia debió ser rechazada: %', p_regla, p_sql;
END;
$$;

CREATE FUNCTION pg_temp.ok(p_regla text, p_condicion boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT p_condicion THEN
        RAISE EXCEPTION 'FALLA %', p_regla;
    END IF;
    RAISE NOTICE 'OK   %', p_regla;
END;
$$;

-- ---------------------------------------------------------------- datos base
INSERT INTO aeropuerto (codigo_iata, nombre, ciudad, pais) VALUES
    ('TLC', 'Aeropuerto Internacional de Toluca', 'Toluca', 'México'),
    ('CUN', 'Aeropuerto Internacional de Cancún', 'Cancún', 'México');
INSERT INTO ruta (id_aeropuerto_origen, id_aeropuerto_destino)
    SELECT o.id_aeropuerto, d.id_aeropuerto FROM aeropuerto o, aeropuerto d
    WHERE o.codigo_iata = 'TLC' AND d.codigo_iata = 'CUN';
INSERT INTO avion (matricula, modelo, capacidad) VALUES ('XA-SGA', 'ATR 72-600', 72);
INSERT INTO usuario (nombre, correo, contrasena_hash, id_rol) VALUES
    ('Ana López', 'ana.lopez@correo.mx', '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA', 3),
    ('Luis Ortega', 'luis.ortega@sga.mx', '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA', 2);
INSERT INTO vuelo (numero_vuelo, id_ruta, id_avion, fecha_salida, fecha_llegada, tarifa)
    SELECT 'SG 1204', r.id_ruta, a.id_avion, now() + interval '10 days',
           now() + interval '10 days 2 hours 35 minutes', 1850.00
    FROM ruta r, avion a;

-- --------------------------------------------------------------- M-01
SELECT pg_temp.debe_fallar('V-01 correo duplicado (sin distinguir mayúsculas)',
    $q$INSERT INTO usuario (nombre, correo, contrasena_hash, id_rol)
       VALUES ('Otra', 'ANA.LOPEZ@correo.mx', '$argon2id$x', 3)$q$);
SELECT pg_temp.debe_fallar('V-01 correo con formato inválido',
    $q$INSERT INTO usuario (nombre, correo, contrasena_hash, id_rol)
       VALUES ('Otra', 'sin-arroba', '$argon2id$x', 3)$q$);
SELECT pg_temp.debe_fallar('V-02 contraseña en texto claro',
    $q$INSERT INTO usuario (nombre, correo, contrasena_hash, id_rol)
       VALUES ('Otra', 'otra@correo.mx', 'MiPassword123', 3)$q$);
SELECT pg_temp.debe_fallar('RN-07 usuario sin rol',
    $q$INSERT INTO usuario (nombre, correo, contrasena_hash, id_rol)
       VALUES ('Otra', 'otra@correo.mx', '$argon2id$x', NULL)$q$);

-- --------------------------------------------------------------- M-02 / M-03
SELECT pg_temp.debe_fallar('V-03 código IATA en minúsculas',
    $q$INSERT INTO aeropuerto (codigo_iata, nombre, ciudad, pais) VALUES ('mx1', 'X', 'X', 'X')$q$);
SELECT pg_temp.debe_fallar('V-03 código IATA duplicado',
    $q$INSERT INTO aeropuerto (codigo_iata, nombre, ciudad, pais) VALUES ('TLC', 'X', 'X', 'X')$q$);
SELECT pg_temp.debe_fallar('V-07 ruta con origen igual a destino',
    $q$INSERT INTO ruta (id_aeropuerto_origen, id_aeropuerto_destino)
       SELECT id_aeropuerto, id_aeropuerto FROM aeropuerto WHERE codigo_iata = 'TLC'$q$);
SELECT pg_temp.debe_fallar('V-04 matrícula duplicada',
    $q$INSERT INTO avion (matricula, modelo, capacidad) VALUES ('XA-SGA', 'Otro', 50)$q$);
SELECT pg_temp.debe_fallar('V-05 capacidad igual a cero',
    $q$INSERT INTO avion (matricula, modelo, capacidad) VALUES ('XA-SGZ', 'Otro', 0)$q$);

-- --------------------------------------------------------------- M-04 / M-05
SELECT pg_temp.debe_fallar('V-06 llegada anterior a la salida',
    $q$INSERT INTO vuelo (numero_vuelo, id_ruta, id_avion, fecha_salida, fecha_llegada, tarifa)
       SELECT 'SG 9999', r.id_ruta, a.id_avion, now() + interval '2 days', now() + interval '1 day', 100
       FROM ruta r, avion a$q$);
SELECT pg_temp.ok('RF-08 / RN-04 se generan 72 asientos para una aeronave de 72',
    (SELECT count(*) FROM asiento) = 72);
SELECT pg_temp.ok('RF-08 numeración de 1A a 12F',
    (SELECT bool_or(numero = '1A') AND bool_or(numero = '12F') AND NOT bool_or(numero = '13A') FROM asiento));
SELECT pg_temp.debe_fallar('V-08 número de asiento duplicado en el vuelo',
    $q$INSERT INTO asiento (id_vuelo, numero) SELECT id_vuelo, '1A' FROM vuelo$q$);

-- --------------------------------------------------------------- M-06
INSERT INTO reservacion (codigo_reserva, id_usuario, id_asiento)
    SELECT 'K7M2Q9XA', u.id_usuario, a.id_asiento
    FROM usuario u, asiento a WHERE u.correo = 'ana.lopez@correo.mx' AND a.numero = '12C';

SELECT pg_temp.debe_fallar('V-09 / RN-01 / RF-11 segunda reservación activa del mismo asiento',
    $q$INSERT INTO reservacion (codigo_reserva, id_usuario, id_asiento)
       SELECT 'B2N5V8KR', u.id_usuario, a.id_asiento
       FROM usuario u, asiento a WHERE u.correo = 'ana.lopez@correo.mx' AND a.numero = '12C'$q$);
SELECT pg_temp.debe_fallar('V-10 estado fuera del dominio',
    $q$UPDATE reservacion SET estado = 'APARTADA' WHERE codigo_reserva = 'K7M2Q9XA'$q$);
SELECT pg_temp.ok('RN-11 la expiración es a las 48 h cuando el vuelo sale después',
    (SELECT fecha_expiracion = fecha_creacion + interval '48 hours'
     FROM reservacion WHERE codigo_reserva = 'K7M2Q9XA'));
SELECT pg_temp.ok('RF-09 el asiento 12C aparece como RESERVADO',
    (SELECT estado_asiento = 'RESERVADO' FROM disponibilidad_asiento WHERE numero = '12C'));

-- --------------------------------------------------------------- M-07
SELECT pg_temp.debe_fallar('RN-02 pasar a PAGADA sin pago aprobado',
    $q$UPDATE reservacion SET estado = 'PAGADA' WHERE codigo_reserva = 'K7M2Q9XA'$q$);
SELECT pg_temp.debe_fallar('V-11 / RN-08 pago aprobado con monto distinto de la tarifa',
    $q$INSERT INTO pago (id_reservacion, monto, metodo_prueba, estado)
       SELECT id_reservacion, 1500.00, 'TARJETA_PRUEBA_APROBADA', 'APROBADO'
       FROM reservacion WHERE codigo_reserva = 'K7M2Q9XA'$q$);

-- --------------------------------------------------------------- M-08
SELECT pg_temp.debe_fallar('RN-03 check-in sobre reservación no pagada',
    $q$INSERT INTO check_in (id_reservacion, num_pase_abordar, id_empleado)
       SELECT r.id_reservacion, 'BP2612180042', u.id_usuario
       FROM reservacion r, usuario u
       WHERE r.codigo_reserva = 'K7M2Q9XA' AND u.correo = 'luis.ortega@sga.mx'$q$);

-- Flujo válido completo: pago aprobado, PAGADA, check-in y ABORDADA
INSERT INTO pago (id_reservacion, monto, metodo_prueba, estado)
    SELECT id_reservacion, 1850.00, 'TARJETA_PRUEBA_APROBADA', 'APROBADO'
    FROM reservacion WHERE codigo_reserva = 'K7M2Q9XA';
UPDATE reservacion SET estado = 'PAGADA' WHERE codigo_reserva = 'K7M2Q9XA';
INSERT INTO check_in (id_reservacion, num_pase_abordar, id_empleado)
    SELECT r.id_reservacion, 'BP2612180042', u.id_usuario
    FROM reservacion r, usuario u
    WHERE r.codigo_reserva = 'K7M2Q9XA' AND u.correo = 'luis.ortega@sga.mx';
UPDATE reservacion SET estado = 'ABORDADA' WHERE codigo_reserva = 'K7M2Q9XA';
SELECT pg_temp.ok('RN-02 / RN-03 flujo válido: pago, check-in y abordaje',
    (SELECT estado = 'ABORDADA' FROM reservacion WHERE codigo_reserva = 'K7M2Q9XA'));
SELECT pg_temp.ok('RF-09 el asiento 12C aparece como OCUPADO tras abordar',
    (SELECT estado_asiento = 'OCUPADO' FROM disponibilidad_asiento WHERE numero = '12C'));

-- --------------------------------------------------------------- RN-09
INSERT INTO reservacion (codigo_reserva, id_usuario, id_asiento)
    SELECT 'P3T8W1NB', u.id_usuario, a.id_asiento
    FROM usuario u, asiento a WHERE u.correo = 'ana.lopez@correo.mx' AND a.numero = '4B';
UPDATE vuelo SET estado_vuelo = 'CANCELADO';
SELECT pg_temp.ok('RN-09 la cancelación del vuelo cancela sus reservaciones activas',
    (SELECT estado = 'CANCELADA' FROM reservacion WHERE codigo_reserva = 'P3T8W1NB'));
SELECT pg_temp.ok('RN-09 la reservación ya abordada no se modifica',
    (SELECT estado = 'ABORDADA' FROM reservacion WHERE codigo_reserva = 'K7M2Q9XA'));

-- --------------------------------------------------------------- RN-11 (vuelo próximo)
INSERT INTO vuelo (numero_vuelo, id_ruta, id_avion, fecha_salida, fecha_llegada, tarifa)
    SELECT 'SG 1210', r.id_ruta, a.id_avion, now() + interval '30 hours',
           now() + interval '32 hours', 1620.00
    FROM ruta r, avion a;
INSERT INTO reservacion (codigo_reserva, id_usuario, id_asiento)
    SELECT 'H5R6J2LC', u.id_usuario, a.id_asiento
    FROM usuario u, asiento a JOIN vuelo v ON v.id_vuelo = a.id_vuelo
    WHERE u.correo = 'ana.lopez@correo.mx' AND v.numero_vuelo = 'SG 1210' AND a.numero = '1A';
SELECT pg_temp.ok('RN-11 la expiración es 24 h antes de la salida cuando el vuelo sale antes de 48 h',
    (SELECT r.fecha_expiracion = v.fecha_salida - interval '24 hours'
     FROM reservacion r JOIN asiento a USING (id_asiento) JOIN vuelo v USING (id_vuelo)
     WHERE r.codigo_reserva = 'H5R6J2LC'));

-- --------------------------------------------------------------- V-12 / S-12
SELECT pg_temp.debe_fallar('V-12 borrado físico de un usuario',
    $q$DELETE FROM usuario WHERE correo = 'luis.ortega@sga.mx'$q$);
SELECT pg_temp.debe_fallar('V-12 borrado físico de un aeropuerto',
    $q$DELETE FROM aeropuerto WHERE codigo_iata = 'CUN'$q$);
INSERT INTO bitacora (accion, modulo, detalle) VALUES ('ALTA', 'Vuelos', 'Prueba');
SELECT pg_temp.debe_fallar('S-12 modificar un registro de bitácora',
    $q$UPDATE bitacora SET detalle = 'alterado'$q$);
SELECT pg_temp.debe_fallar('S-12 borrar un registro de bitácora',
    $q$DELETE FROM bitacora$q$);

\echo 'Todas las reglas de integridad se verificaron correctamente.'
ROLLBACK;
