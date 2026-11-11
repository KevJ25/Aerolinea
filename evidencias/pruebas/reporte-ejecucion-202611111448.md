# Reporte de ejecución de pruebas (formato de la Tabla 42)

Generado el 11/11/2026, 8:48:29 a.m. por Nombre de quien ejecuta con `npm run prueba:aceptacion`. Sistema: http://127.0.0.1:3000.

## Resumen

| Casos planificados | Ejecutados | Aprobados | Fallidos | Pendientes o no evaluables | KPI-02 cobertura de ejecución | Meta |
| --- | --- | --- | --- | --- | --- | --- |
| 38 | 0 | 0 | 0 | 38 | 0.0 % | ≥ 95 % |

## Reporte de ejecución

| CP | Requisito | Caso | Fecha | Ejecutó | Resultado | Defecto | Evidencia |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CP-01 | RF-01 | Registro de usuario con datos válidos | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-02 | RF-02 | Bloqueo tras cinco intentos fallidos | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-03 | RF-03 | Asignación y respeto del perfil de usuario | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-04 | RF-04 | Alta de aeropuerto con código IATA inválido | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-05 | RF-05 | Alta de aeronave con matrícula duplicada | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-06 | RF-06 | Programación de vuelo con llegada anterior a la salida | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-07 | RF-07 | Consulta de vuelos por origen, destino y fecha | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-08 | RF-08 | Generación automática de asientos | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-09 | RF-09 | Visualización de disponibilidad en tiempo real | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-10 | RF-10 | Creación de reservación y código único | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-12 | RF-12 | Cancelación de reservación y liberación del asiento | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-13 | RF-13 | Registro de pago con monto incorrecto | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-14 | RF-14 | Registro de pago aprobado y transición a PAGADA (propuesto en v2.1) | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-15 | RF-15 | Check-in sobre reservación no pagada | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-16 | RF-16 | Generación de reporte de ocupación | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-17 | RF-17 | Registro en bitácora de una modificación | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-18 | RNF-05 | Realización de tareas clave sin asistencia | — | — | No evaluable en la fase actual | — | Requiere una sesión con usuarios representativos de cada perfil (KPI-11). |
| CP-11 | RF-11 | Dos solicitudes simultáneas sobre el mismo asiento | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-19 | RNF-07 | Verificación del bloqueo transaccional del asiento | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-20 | RF-14 | Fallo simulado durante el registro del pago | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-31 | RF-08 | Alta de aeronave y verificación de asientos generados | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-32 | RF-15 | Check-in tras el pago de una reservación | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-33 | RN-09 | Cancelación de un vuelo con reservaciones asociadas | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-34 | RF-17 | Verificación del registro en bitácora tras una integración | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-21 | RNF-01 | Consulta de vuelos disponibles (≤ 3 s) | — | — | Pendiente | — | Ejecutar npm run prueba:rendimiento |
| CP-35 | RNF-01 | Creación de una reservación completa (≤ 3 s) | — | — | Pendiente | — | Ejecutar npm run prueba:rendimiento |
| CP-36 | RNF-01 | Registro de un pago (≤ 3 s) | — | — | Pendiente | — | Ejecutar npm run prueba:rendimiento |
| CP-37 | RNF-01 | Generación de un reporte de ocupación (≤ 5 s) | — | — | Pendiente | — | Ejecutar npm run prueba:rendimiento |
| CP-38 | RNF-02 | Comportamiento ante pico de solicitudes | — | — | Pendiente | — | Ejecutar npm run prueba:rendimiento |
| CP-22 | RNF-02 | Disponibilidad del sistema en operación sostenida (≥ 99 %) | — | — | No evaluable en la fase actual | — | Requiere operación sostenida durante el periodo de medición de KPI-08 (mensual). |
| CP-29 | RNF-10 | Restauración desde respaldo (≤ 30 min) | — | — | Pendiente | — | Ejecutar npm run db:probar-restauracion |
| CP-24 | S-01, S-05 | Verificación del cifrado de credenciales | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-25 | S-03, S-06, S-08 | Intento de escalamiento de privilegios | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-26 | S-10, S-11, S-13 | Intento de inyección de código en formularios | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-27 | S-14 | Confirmación en operaciones irreversibles | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-39 | S-02 | Bloqueo de cuenta por intentos fallidos | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-40 | S-04 | Invalidación de sesión al cerrar sesión | — | — | No ejecutado | — | Sin verificaciones en esta corrida |
| CP-41 | S-12 | No repudio de operaciones | — | — | No ejecutado | — | Sin verificaciones en esta corrida |

CP-23, CP-28 y CP-30 no existen en el manual. CP-14 se define en la versión 2.1. Un caso "No evaluable en la fase actual" se documenta conforme al Plan de auditoría §9.3.

## Anexo · Verificaciones por caso

