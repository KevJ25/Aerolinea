-- =============================================================================
-- Migración 009 · Lectura de reportes desde la aplicación (Sprint 5, RF-16)
-- La pantalla de reportes del administrador (MK-13) consulta las vistas de la
-- migración 004 con la cuenta de la aplicación. Se otorga SOLO lectura de esas
-- tres vistas: la aplicación sigue sin acceso a nada que no use (S-07).
-- El backend restringe la pantalla y la API al perfil Administrador (Tabla 8).
-- =============================================================================

GRANT SELECT ON reporte_ocupacion_vuelo, reporte_reservaciones_diarias, reporte_pagos_diarios
    TO sga_aplicacion;
