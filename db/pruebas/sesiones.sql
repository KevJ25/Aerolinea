-- =============================================================================
-- Pruebas de sesiones · S-03, S-04, S-06 (migración 007)
-- Se ejecutan como sga_aplicacion. Todo se revierte al final.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned
BEGIN;
\ir _auxiliares.sql

INSERT INTO usuario (nombre, correo, contrasena_hash, id_rol) VALUES
    ('Mariana Ruiz', 'mariana.ruiz@sga.mx', '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA', 1),
    ('Ana López',    'ana.lopez@correo.mx', '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA', 3);
SELECT id_usuario AS admin FROM usuario WHERE correo = 'mariana.ruiz@sga.mx' \gset
SELECT id_usuario AS ana   FROM usuario WHERE correo = 'ana.lopez@correo.mx' \gset

SET ROLE sga_aplicacion;
SELECT crear_sesion(:ana) AS token \gset

SELECT prueba.ok('El token de sesión tiene 256 bits en hexadecimal', :'token' ~ '^[0-9a-f]{64}$');
SELECT prueba.ok('Una sesión válida devuelve el usuario y su rol',
    (SELECT nombre_rol = 'Pasajero' FROM validar_sesion(:'token')));
SELECT prueba.ok('Un token inventado no es válido',
    NOT EXISTS (SELECT 1 FROM validar_sesion(repeat('a', 64))));
SELECT prueba.ok('Un token con formato inválido no es válido',
    NOT EXISTS (SELECT 1 FROM validar_sesion('x'' OR 1=1 --')));
SELECT prueba.debe_fallar('S-07 la aplicación no puede leer la tabla de sesiones', '42501',
    'SELECT token_hash FROM sesion');
SELECT prueba.debe_fallar('S-07 la aplicación no puede crear sesiones sin la función', '42501',
    $q$INSERT INTO sesion (token_hash, id_usuario) VALUES (repeat('b', 64), 1)$q$);

-- S-06: el rol se lee de la base en cada petición
RESET ROLE;
UPDATE usuario SET id_rol = 2 WHERE id_usuario = :ana;
SET ROLE sga_aplicacion;
SELECT prueba.ok('S-06 un cambio de rol se refleja en la siguiente petición',
    (SELECT nombre_rol = 'Empleado' FROM validar_sesion(:'token')));
RESET ROLE;
UPDATE usuario SET id_rol = 3 WHERE id_usuario = :ana;
SELECT prueba.ok('El token se almacena solo como resumen SHA-256',
    NOT EXISTS (SELECT 1 FROM sesion WHERE token_hash = :'token')
    AND EXISTS (SELECT 1 FROM sesion WHERE token_hash = encode(digest(:'token', 'sha256'), 'hex')));

-- S-04: cerrar sesión invalida el token
SET ROLE sga_aplicacion;
SELECT FROM cerrar_sesion(:'token');
SELECT prueba.ok('S-04 tras cerrar sesión el token deja de ser válido',
    NOT EXISTS (SELECT 1 FROM validar_sesion(:'token')));

-- S-03: 30 minutos de inactividad
SELECT crear_sesion(:ana) AS token2 \gset
RESET ROLE;
UPDATE sesion SET ultimo_uso = now() - interval '29 minutes'
WHERE token_hash = encode(digest(:'token2', 'sha256'), 'hex');
SET ROLE sga_aplicacion;
SELECT prueba.ok('S-03 con 29 minutos de inactividad la sesión sigue válida',
    EXISTS (SELECT 1 FROM validar_sesion(:'token2')));
RESET ROLE;
UPDATE sesion SET ultimo_uso = now() - interval '31 minutes'
WHERE token_hash = encode(digest(:'token2', 'sha256'), 'hex');
SET ROLE sga_aplicacion;
SELECT prueba.ok('S-03 con 31 minutos de inactividad la sesión expira',
    NOT EXISTS (SELECT 1 FROM validar_sesion(:'token2')));
RESET ROLE;
SELECT prueba.ok('S-03 la sesión expirada queda cerrada por INACTIVIDAD',
    (SELECT motivo_cierre = 'INACTIVIDAD' FROM sesion WHERE token_hash = encode(digest(:'token2', 'sha256'), 'hex')));

-- Una baja invalida las sesiones abiertas
SET ROLE sga_aplicacion;
SELECT crear_sesion(:ana) AS token3 \gset
SELECT FROM set_config('sga.id_usuario', :'admin', true);
SELECT FROM dar_baja_usuario(:ana);
SELECT prueba.ok('Una baja invalida la sesión abierta del usuario',
    NOT EXISTS (SELECT 1 FROM validar_sesion(:'token3')));
SELECT prueba.debe_fallar('Un usuario dado de baja no puede iniciar sesión', 'SGA04',
    format('SELECT crear_sesion(%s)', :ana));
RESET ROLE;

\echo 'Todas las sesiones se verificaron correctamente.'
ROLLBACK;
