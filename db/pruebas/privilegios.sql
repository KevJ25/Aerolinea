-- =============================================================================
-- Pruebas de privilegios · S-07 menor privilegio, S-09 denegación por defecto
-- Se ejecutan con SET ROLE para comprobar lo que cada cuenta puede hacer en
-- realidad. Todo ocurre en una transacción que se revierte al final.
-- 42501 = insufficient_privilege
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned
BEGIN;
\ir _auxiliares.sql

-- ------------------------------------------------------------ sga_aplicacion
SET ROLE sga_aplicacion;

SELECT prueba.debe_fallar('V-12 la aplicación no puede borrar usuarios', '42501',
    'DELETE FROM usuario');
SELECT prueba.debe_fallar('V-12 la aplicación no puede borrar vuelos', '42501',
    'DELETE FROM vuelo');
SELECT prueba.debe_fallar('S-07 la aplicación no puede vaciar tablas', '42501',
    'TRUNCATE reservacion');
SELECT prueba.debe_fallar('S-01 la aplicación no puede leer resúmenes de contraseña', '42501',
    'SELECT contrasena_hash FROM usuario');
SELECT prueba.debe_fallar('RF-11 la aplicación no puede crear reservaciones sin la función', '42501',
    $q$INSERT INTO reservacion (codigo_reserva, id_usuario, id_asiento) VALUES ('AAAAAAAA', 1, 1)$q$);
SELECT prueba.debe_fallar('RN-02 la aplicación no puede marcar una reservación como pagada directamente', '42501',
    $q$UPDATE reservacion SET estado = 'PAGADA'$q$);
SELECT prueba.debe_fallar('R-04 la aplicación no puede registrar pagos sin la función', '42501',
    $q$INSERT INTO pago (id_reservacion, monto, metodo_prueba, estado) VALUES (1, 1, 'TARJETA_PRUEBA_APROBADA', 'APROBADO')$q$);
SELECT prueba.debe_fallar('RN-03 la aplicación no puede registrar check-in sin la función', '42501',
    $q$INSERT INTO check_in (id_reservacion, num_pase_abordar, id_empleado) VALUES (1, 'AAAAAAAAAAAA', 1)$q$);
SELECT prueba.debe_fallar('S-12 la aplicación no puede escribir directamente en la bitácora', '42501',
    $q$INSERT INTO bitacora (accion, modulo, detalle) VALUES ('ALTA', 'X', 'falso')$q$);
SELECT prueba.debe_fallar('S-12 la aplicación no puede modificar la bitácora', '42501',
    $q$UPDATE bitacora SET detalle = 'alterado'$q$);
SELECT prueba.debe_fallar('RF-02 la aplicación no puede desbloquear cuentas sin la función', '42501',
    'UPDATE usuario SET bloqueado_hasta = NULL');
SELECT prueba.debe_fallar('V-12 la aplicación no puede dar de baja sin la función', '42501',
    'UPDATE usuario SET activo = false');
SELECT prueba.debe_fallar('15 la aplicación no puede ver el control de versiones del esquema', '42501',
    'SELECT * FROM esquema_version');
SELECT prueba.debe_fallar('15 la aplicación no puede crear tablas', '42501',
    'CREATE TABLE public.intrusa (id integer)');
SELECT prueba.debe_fallar('15 la aplicación no puede alterar la estructura', '42501',
    'ALTER TABLE vuelo ADD COLUMN intrusa integer');
SELECT prueba.debe_fallar('15 la aplicación no puede eliminar tablas', '42501',
    'DROP TABLE bitacora');
SELECT prueba.debe_fallar('S-07 la aplicación no puede crear roles', '42501',
    'CREATE ROLE intruso');
SELECT prueba.debe_fallar('S-07 la aplicación no puede ejecutar funciones internas', '42501',
    'SELECT generar_codigo(8)');

-- Lo que sí puede hacer
SELECT prueba.ok('La aplicación consulta la disponibilidad de asientos',
    (SELECT count(*) >= 0 FROM disponibilidad_asiento));
SELECT prueba.ok('RF-16 la aplicación lee las vistas de reportes (migración 009)',
    (SELECT count(*) >= 0 FROM reporte_ocupacion_vuelo)
    AND (SELECT count(*) >= 0 FROM reporte_reservaciones_diarias)
    AND (SELECT count(*) >= 0 FROM reporte_pagos_diarios));
SELECT prueba.ok('La aplicación consulta usuarios sin el resumen de contraseña',
    (SELECT count(*) >= 0 FROM (SELECT id_usuario, nombre, correo, id_rol, activo FROM usuario) u));
RESET ROLE;

-- -------------------------------------------------------------- sga_reportes
SET ROLE sga_reportes;
SELECT prueba.ok('RF-16 reportes lee la ocupación por vuelo',
    (SELECT count(*) >= 0 FROM reporte_ocupacion_vuelo));
SELECT prueba.ok('RF-16 reportes lee las reservaciones diarias',
    (SELECT count(*) >= 0 FROM reporte_reservaciones_diarias));
SELECT prueba.ok('RF-16 reportes lee los pagos diarios',
    (SELECT count(*) >= 0 FROM reporte_pagos_diarios));
SELECT prueba.debe_fallar('S-07 reportes no lee datos personales de usuarios', '42501',
    'SELECT correo FROM usuario');
SELECT prueba.debe_fallar('S-07 reportes no lee reservaciones individuales', '42501',
    'SELECT codigo_reserva FROM reservacion');
SELECT prueba.debe_fallar('S-07 reportes no escribe', '42501',
    $q$INSERT INTO aeropuerto (codigo_iata, nombre, ciudad, pais) VALUES ('ZZZ', 'X', 'X', 'X')$q$);
SELECT prueba.debe_fallar('S-07 reportes no ejecuta operaciones de negocio', '42501',
    'SELECT expirar_reservaciones()');
RESET ROLE;

-- ------------------------------------------------------------- sga_auditor
SET ROLE sga_auditor;
SELECT prueba.debe_fallar('AUD sga_auditor no tiene acceso real a la base', '42501',
    'SELECT * FROM bitacora');
RESET ROLE;

-- ------------------------------------------------------------ PUBLIC
SELECT prueba.ok('S-09 ninguna tabla otorga privilegios a PUBLIC',
    NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                WHERE grantee = 'PUBLIC' AND table_schema = 'public'));
SELECT prueba.ok('S-09 ninguna función propia otorga EXECUTE a PUBLIC',
    NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND has_function_privilege('public', p.oid, 'EXECUTE')));
SELECT prueba.ok('Las funciones privilegiadas fijan su ruta de búsqueda',
    NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.prosecdef
                  AND NOT coalesce(p.proconfig, '{}') @> ARRAY['search_path=public, pg_temp']
                  -- se excluyen las funciones que pertenecen a extensiones
                  AND NOT EXISTS (SELECT 1 FROM pg_depend d
                                  WHERE d.objid = p.oid AND d.deptype = 'e')));

\echo 'Todos los privilegios se verificaron correctamente.'
ROLLBACK;
