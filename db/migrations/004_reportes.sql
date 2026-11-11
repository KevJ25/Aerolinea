-- =============================================================================
-- Migración 004 · Reportes administrativos (M-09)
-- [RF-16][CA-10] Los reportes se calculan directamente sobre las tablas
-- transaccionales; no existen tablas de resumen que puedan desincronizarse.
-- El backend filtra por fecha con consultas parametrizadas (S-11).
-- =============================================================================

-- Ocupación por vuelo (pantalla MK-13). Excluye vuelos cancelados.
CREATE VIEW reporte_ocupacion_vuelo AS
SELECT v.id_vuelo,
       v.numero_vuelo,
       ao.codigo_iata AS origen,
       ad.codigo_iata AS destino,
       v.fecha_salida,
       v.estado_vuelo,
       count(DISTINCT a.id_asiento) AS asientos_totales,
       count(r.id_reservacion) FILTER (WHERE r.estado IN ('PENDIENTE', 'CONFIRMADA')) AS asientos_apartados,
       count(r.id_reservacion) FILTER (WHERE r.estado IN ('PAGADA', 'ABORDADA'))      AS asientos_vendidos,
       round(100.0 * count(r.id_reservacion) / nullif(count(DISTINCT a.id_asiento), 0), 1) AS porcentaje_ocupacion
FROM vuelo v
JOIN ruta ru        ON ru.id_ruta = v.id_ruta
JOIN aeropuerto ao  ON ao.id_aeropuerto = ru.id_aeropuerto_origen
JOIN aeropuerto ad  ON ad.id_aeropuerto = ru.id_aeropuerto_destino
JOIN asiento a      ON a.id_vuelo = v.id_vuelo
LEFT JOIN reservacion r
       ON r.id_asiento = a.id_asiento
      AND r.estado IN ('PENDIENTE', 'CONFIRMADA', 'PAGADA', 'ABORDADA')
WHERE v.estado_vuelo <> 'CANCELADO'
GROUP BY v.id_vuelo, ao.codigo_iata, ad.codigo_iata;

-- Reservaciones creadas por día y estado actual, en hora del centro de México
CREATE VIEW reporte_reservaciones_diarias AS
SELECT (r.fecha_creacion AT TIME ZONE 'America/Mexico_City')::date AS fecha,
       count(*)                                         AS total,
       count(*) FILTER (WHERE r.estado = 'CONFIRMADA')  AS confirmadas,
       count(*) FILTER (WHERE r.estado = 'PAGADA')      AS pagadas,
       count(*) FILTER (WHERE r.estado = 'ABORDADA')    AS abordadas,
       count(*) FILTER (WHERE r.estado = 'CANCELADA')   AS canceladas,
       count(*) FILTER (WHERE r.estado = 'EXPIRADA')    AS expiradas
FROM reservacion r
GROUP BY 1;

-- Pagos simulados registrados por día
CREATE VIEW reporte_pagos_diarios AS
SELECT (p.fecha_registro AT TIME ZONE 'America/Mexico_City')::date AS fecha,
       count(*) FILTER (WHERE p.estado = 'APROBADO')                 AS pagos_aprobados,
       coalesce(sum(p.monto) FILTER (WHERE p.estado = 'APROBADO'), 0) AS monto_aprobado,
       count(*) FILTER (WHERE p.estado = 'RECHAZADO')                AS pagos_rechazados
FROM pago p
GROUP BY 1;
