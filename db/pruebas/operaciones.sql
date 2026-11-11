-- =============================================================================
-- Pruebas de las operaciones de negocio y de la bitácora automática.
-- Las operaciones se ejecutan como sga_aplicacion, igual que el backend.
-- Todo ocurre en una transacción que se revierte al final.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned
BEGIN;
\ir _auxiliares.sql

-- ------------------------------------------------- cuentas iniciales (DBA)
INSERT INTO usuario (nombre, correo, contrasena_hash, id_rol) VALUES
    ('Mariana Ruiz', 'mariana.ruiz@sga.mx', '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA', 1),
    ('Luis Ortega',  'luis.ortega@sga.mx',  '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA', 2),
    ('Ana López',    'ana.lopez@correo.mx', '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA', 3),
    ('Jorge Mendoza','jorge.mendoza@correo.mx', '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA', 3);
SELECT id_usuario AS admin   FROM usuario WHERE correo = 'mariana.ruiz@sga.mx' \gset
SELECT id_usuario AS empleado FROM usuario WHERE correo = 'luis.ortega@sga.mx' \gset
SELECT id_usuario AS ana     FROM usuario WHERE correo = 'ana.lopez@correo.mx' \gset
SELECT id_usuario AS jorge   FROM usuario WHERE correo = 'jorge.mendoza@correo.mx' \gset

-- ------------------------------------------------- el administrador opera
SET ROLE sga_aplicacion;
SELECT FROM set_config('sga.id_usuario', :'admin', true);

INSERT INTO aeropuerto (codigo_iata, nombre, ciudad, pais) VALUES
    ('TLC', 'Aeropuerto Internacional de Toluca', 'Toluca', 'México'),
    ('CUN', 'Aeropuerto Internacional de Cancún', 'Cancún', 'México');
INSERT INTO ruta (id_aeropuerto_origen, id_aeropuerto_destino)
    SELECT o.id_aeropuerto, d.id_aeropuerto FROM aeropuerto o, aeropuerto d
    WHERE o.codigo_iata = 'TLC' AND d.codigo_iata = 'CUN';
INSERT INTO avion (matricula, modelo, capacidad) VALUES ('XA-SGA', 'ATR 72-600', 72);
INSERT INTO vuelo (numero_vuelo, id_ruta, id_avion, fecha_salida, fecha_llegada, tarifa)
    SELECT 'SG 1204', r.id_ruta, a.id_avion, now() + interval '10 days',
           now() + interval '10 days 2 hours 35 minutes', 1850.00
    FROM ruta r, avion a;
SELECT id_vuelo AS vuelo FROM vuelo WHERE numero_vuelo = 'SG 1204' \gset

SELECT prueba.ok('RF-08 el alta del vuelo generó sus 72 asientos',
    (SELECT count(*) = 72 FROM asiento WHERE id_vuelo = :vuelo));
SELECT prueba.ok('RF-17 / CA-11 el alta del vuelo quedó en la bitácora con el administrador',
    EXISTS (SELECT 1 FROM bitacora WHERE accion = 'ALTA' AND modulo = 'Vuelos' AND id_usuario = :admin));

-- ------------------------------------------------- M-06 reservaciones
SELECT FROM set_config('sga.id_usuario', :'ana', true);
SELECT crear_reservacion(:ana, :vuelo, '12c') AS codigo_ana \gset

SELECT prueba.ok('RF-10 la reservación recibe un código de 8 caracteres',
    :'codigo_ana' ~ '^[A-Z2-9]{8}$');
SELECT prueba.ok('RF-09 el asiento 12C aparece RESERVADO',
    (SELECT estado_asiento = 'RESERVADO' FROM disponibilidad_asiento WHERE id_vuelo = :vuelo AND numero = '12C'));
SELECT prueba.debe_fallar('RF-11 / CA-06 un segundo pasajero no puede reservar el mismo asiento', 'SGA01',
    format('SELECT crear_reservacion(%s, %s, %L)', :jorge, :vuelo, '12C'));
SELECT prueba.debe_fallar('S-07 un empleado no puede reservar como pasajero', 'SGA04',
    format('SELECT crear_reservacion(%s, %s, %L)', :empleado, :vuelo, '1A'));
SELECT prueba.debe_fallar('Asiento inexistente en el vuelo', 'SGA05',
    format('SELECT crear_reservacion(%s, %s, %L)', :jorge, :vuelo, '40A'));

-- ------------------------------------------------- RN-12 cierre de venta
RESET ROLE;
SELECT FROM set_config('sga.id_usuario', :'admin', true);
INSERT INTO vuelo (numero_vuelo, id_ruta, id_avion, fecha_salida, fecha_llegada, tarifa)
    SELECT 'SG 7777', r.id_ruta, a.id_avion, now() + interval '20 hours', now() + interval '22 hours', 900
    FROM ruta r, avion a LIMIT 1;
SELECT id_vuelo AS vuelo_proximo FROM vuelo WHERE numero_vuelo = 'SG 7777' \gset
SET ROLE sga_aplicacion;
SELECT FROM set_config('sga.id_usuario', :'jorge', true);
SELECT prueba.debe_fallar('RN-12 un vuelo que sale en menos de 24 horas ya no admite reservaciones', 'SGA02',
    format('SELECT crear_reservacion(%s, %s, %L)', :jorge, :vuelo_proximo, '1A'));
SELECT prueba.ok('RN-12 el rechazo no genera registro',
    NOT EXISTS (SELECT 1 FROM reservacion r JOIN asiento a USING (id_asiento) WHERE a.id_vuelo = :vuelo_proximo));
SELECT FROM set_config('sga.id_usuario', :'ana', true);

-- ------------------------------------------------- M-07 pagos
SELECT prueba.ok('CA-08 un monto distinto de la tarifa se rechaza',
    registrar_pago(:'codigo_ana', 1500.00, 'TARJETA_PRUEBA_APROBADA') = 'RECHAZADO');
SELECT prueba.ok('CA-08 tras el rechazo la reservación sigue CONFIRMADA',
    (SELECT estado = 'CONFIRMADA' FROM reservacion WHERE codigo_reserva = :'codigo_ana'));
SELECT prueba.ok('RF-14 la tarjeta de prueba de rechazo se rechaza',
    registrar_pago(:'codigo_ana', 1850.00, 'TARJETA_PRUEBA_RECHAZADA') = 'RECHAZADO');
SELECT prueba.debe_fallar('S-10 un monto negativo es inválido', 'SGA06',
    format('SELECT registrar_pago(%L, -5, %L)', :'codigo_ana', 'TARJETA_PRUEBA_APROBADA'));
SELECT prueba.debe_fallar('RN-03 no hay check-in antes del pago', 'SGA03',
    format('SELECT realizar_check_in(%L, %s)', :'codigo_ana', :empleado));
-- CP-20: fallo simulado DESPUÉS de registrar el pago, dentro de la misma
-- transacción. Todo se revierte: ni pago ni cambio de estado.
DO $cp20$
BEGIN
    BEGIN
        PERFORM registrar_pago((SELECT codigo_reserva FROM reservacion ORDER BY id_reservacion LIMIT 1), 1850.00, 'TARJETA_PRUEBA_APROBADA');
        RAISE EXCEPTION 'fallo simulado CP-20';
    EXCEPTION WHEN raise_exception THEN
        NULL;
    END;
END;
$cp20$;
SELECT prueba.ok('CP-20 tras un fallo durante el pago la reservación conserva el estado CONFIRMADA',
    (SELECT estado = 'CONFIRMADA' FROM reservacion WHERE codigo_reserva = :'codigo_ana'));
SELECT prueba.ok('CP-20 tras el fallo no queda ningún pago aprobado',
    NOT EXISTS (SELECT 1 FROM pago p JOIN reservacion r USING (id_reservacion)
                WHERE r.codigo_reserva = :'codigo_ana' AND p.estado = 'APROBADO'));
SELECT prueba.ok('RF-13 el pago con el monto exacto se aprueba',
    registrar_pago(:'codigo_ana', 1850.00, 'TARJETA_PRUEBA_APROBADA') = 'APROBADO');
SELECT prueba.ok('RN-02 la reservación pasó a PAGADA',
    (SELECT estado = 'PAGADA' FROM reservacion WHERE codigo_reserva = :'codigo_ana'));
SELECT prueba.debe_fallar('No se paga dos veces la misma reservación', 'SGA03',
    format('SELECT registrar_pago(%L, 1850.00, %L)', :'codigo_ana', 'TARJETA_PRUEBA_APROBADA'));

-- ------------------------------------------------- M-08 check-in
SELECT prueba.debe_fallar('S-07 un pasajero no puede hacer check-in', 'SGA04',
    format('SELECT realizar_check_in(%L, %s)', :'codigo_ana', :ana));
SELECT FROM set_config('sga.id_usuario', :'empleado', true);
SELECT realizar_check_in(:'codigo_ana', :empleado) AS pase \gset
SELECT prueba.ok('RF-15 / CA-09 el check-in emite un pase de 12 caracteres',
    :'pase' ~ '^[A-Z2-9]{12}$');
SELECT prueba.ok('RF-09 el asiento 12C aparece OCUPADO',
    (SELECT estado_asiento = 'OCUPADO' FROM disponibilidad_asiento WHERE id_vuelo = :vuelo AND numero = '12C'));
SELECT prueba.debe_fallar('Una reservación abordada no se cancela', 'SGA03',
    format('SELECT cancelar_reservacion(%L, %s)', :'codigo_ana', :empleado));

-- ------------------------------------------------- RF-12 cancelación y S-08
SELECT FROM set_config('sga.id_usuario', :'jorge', true);
SELECT crear_reservacion(:jorge, :vuelo, '4B') AS codigo_jorge \gset
SELECT FROM set_config('sga.id_usuario', :'ana', true);
SELECT prueba.debe_fallar('S-08 un pasajero no cancela la reservación de otro', 'SGA04',
    format('SELECT cancelar_reservacion(%L, %s)', :'codigo_jorge', :ana));
SELECT FROM set_config('sga.id_usuario', :'jorge', true);
SELECT FROM cancelar_reservacion(:'codigo_jorge', :jorge);
SELECT prueba.ok('RF-12 el pasajero cancela su propia reservación y el asiento se libera',
    (SELECT estado_asiento = 'LIBRE' FROM disponibilidad_asiento WHERE id_vuelo = :vuelo AND numero = '4B'));

-- ------------------------------------------------- RN-11 expiración
SELECT crear_reservacion(:jorge, :vuelo, '5A') AS codigo_vence \gset
RESET ROLE;
UPDATE reservacion SET fecha_expiracion = now() - interval '1 minute' WHERE codigo_reserva = :'codigo_vence';
SET ROLE sga_aplicacion;
SELECT prueba.ok('RN-11 el proceso de expiración vence la reservación sin pago',
    expirar_reservaciones() = 1);
SELECT prueba.ok('RN-11 el asiento de la reservación vencida queda LIBRE',
    (SELECT estado_asiento = 'LIBRE' FROM disponibilidad_asiento WHERE id_vuelo = :vuelo AND numero = '5A'));
SELECT prueba.debe_fallar('RN-11 una reservación vencida no admite pago', 'SGA03',
    format('SELECT registrar_pago(%L, 1850.00, %L)', :'codigo_vence', 'TARJETA_PRUEBA_APROBADA'));

-- ------------------------------------------------- RF-02, S-02 y RF-18
SELECT FROM set_config('sga.id_usuario', '', true);
SELECT prueba.ok('Intentos 1 a 4 no bloquean la cuenta',
    NOT registrar_intento_fallido(:jorge) AND NOT registrar_intento_fallido(:jorge)
    AND NOT registrar_intento_fallido(:jorge) AND NOT registrar_intento_fallido(:jorge));
SELECT prueba.ok('RF-02 / CP-02 el quinto intento fallido bloquea la cuenta',
    registrar_intento_fallido(:jorge));
SELECT prueba.ok('S-02 el bloqueo dura 24 horas',
    (SELECT bloqueada_hasta = now() + interval '24 hours' FROM obtener_credencial('JORGE.mendoza@correo.mx')));
SELECT prueba.debe_fallar('Una cuenta bloqueada no inicia sesión', 'SGA04',
    format('SELECT registrar_acceso_exitoso(%s)', :jorge));
SELECT FROM set_config('sga.id_usuario', :'empleado', true);
SELECT prueba.debe_fallar('RF-18 un empleado no puede desbloquear cuentas', 'SGA04',
    format('SELECT desbloquear_cuenta(%s)', :jorge));
SELECT FROM set_config('sga.id_usuario', :'admin', true);
SELECT FROM desbloquear_cuenta(:jorge);
SELECT prueba.ok('RF-18 el administrador desbloquea la cuenta',
    (SELECT NOT bloqueada FROM obtener_credencial('jorge.mendoza@correo.mx')));
SELECT FROM registrar_acceso_exitoso(:jorge);

-- ------------------------------------------------- RF-03 baja lógica
SELECT prueba.debe_fallar('Un administrador no se da de baja a sí mismo', 'SGA04',
    format('SELECT dar_baja_usuario(%s)', :admin));
SELECT FROM dar_baja_usuario(:jorge);
SELECT prueba.ok('V-12 la baja es lógica: el registro permanece inactivo',
    (SELECT NOT activo AND fecha_baja IS NOT NULL FROM usuario WHERE id_usuario = :jorge));
SELECT prueba.ok('Un usuario dado de baja ya no puede autenticarse',
    NOT EXISTS (SELECT 1 FROM obtener_credencial('jorge.mendoza@correo.mx')));

-- ------------------------------------------------- RN-09 cancelación de vuelo
SELECT FROM set_config('sga.id_usuario', :'ana', true);
SELECT crear_reservacion(:ana, :vuelo, '7D') AS codigo_cancelar \gset
SELECT FROM set_config('sga.id_usuario', :'admin', true);
UPDATE vuelo SET estado_vuelo = 'CANCELADO' WHERE id_vuelo = :vuelo;
SELECT prueba.ok('RN-09 cancelar el vuelo cancela las reservaciones activas',
    (SELECT estado = 'CANCELADA' FROM reservacion WHERE codigo_reserva = :'codigo_cancelar'));
SELECT prueba.debe_fallar('SGA02 un vuelo cancelado no admite reservaciones', 'SGA02',
    format('SELECT crear_reservacion(%s, %s, %L)', :ana, :vuelo, '9A'));

-- ------------------------------------------------- bitácora y reportes
SELECT prueba.ok('RF-17 cada evento de acceso quedó registrado',
    (SELECT count(*) >= 6 FROM bitacora WHERE accion = 'ACCESO' AND modulo = 'Usuarios'));
SELECT prueba.ok('RF-17 la baja del usuario quedó registrada como BAJA por el administrador',
    EXISTS (SELECT 1 FROM bitacora WHERE accion = 'BAJA' AND id_usuario = :admin
            AND detalle LIKE format('usuario id_usuario=%s%%', :jorge)));
SELECT prueba.ok('S-12 la bitácora conserva estados anterior y nuevo',
    EXISTS (SELECT 1 FROM bitacora WHERE detalle LIKE '%estado: CONFIRMADA → PAGADA%'));
SELECT prueba.ok('LFPDPPP la bitácora nunca contiene resúmenes de contraseña',
    NOT EXISTS (SELECT 1 FROM bitacora WHERE detalle LIKE '%$argon2%'));
SELECT prueba.ok('RF-17 toda operación hecha por la aplicación tiene usuario identificado',
    NOT EXISTS (SELECT 1 FROM bitacora WHERE id_usuario IS NULL AND detalle NOT LIKE '%cuenta de base de datos%'));
RESET ROLE;
SET ROLE sga_reportes;
SELECT prueba.ok('RF-16 / CA-10 el reporte de pagos coincide con los pagos registrados',
    (SELECT pagos_aprobados = 1 AND pagos_rechazados = 2 AND monto_aprobado = 1850.00 FROM reporte_pagos_diarios));
SELECT prueba.ok('RF-16 el reporte de ocupación excluye vuelos cancelados',
    NOT EXISTS (SELECT 1 FROM reporte_ocupacion_vuelo WHERE id_vuelo = :vuelo));
RESET ROLE;

\echo 'Todas las operaciones se verificaron correctamente.'
ROLLBACK;
