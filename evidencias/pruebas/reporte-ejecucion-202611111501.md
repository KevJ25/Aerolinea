# Reporte de ejecución de pruebas (formato de la Tabla 42)

Generado el 11/11/2026, 9:01:15 a.m. por Nombre de quien ejecuta con `npm run prueba:aceptacion`. Sistema: http://127.0.0.1:3000.

## Resumen

| Casos planificados | Ejecutados | Aprobados | Fallidos | Pendientes o no evaluables | KPI-02 cobertura de ejecución | Meta |
| --- | --- | --- | --- | --- | --- | --- |
| 38 | 36 | 36 | 0 | 2 | 94.7 % | ≥ 95 % |

## Reporte de ejecución

| CP | Requisito | Caso | Fecha | Ejecutó | Resultado | Defecto | Evidencia |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CP-01 | RF-01 | Registro de usuario con datos válidos | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 1: 1/1 verificaciones |
| CP-02 | RF-02 | Bloqueo tras cinco intentos fallidos | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 1: 3/3 verificaciones |
| CP-03 | RF-03 | Asignación y respeto del perfil de usuario | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 1: 3/3 verificaciones |
| CP-04 | RF-04 | Alta de aeropuerto con código IATA inválido | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 2: 2/2 verificaciones |
| CP-05 | RF-05 | Alta de aeronave con matrícula duplicada | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 2: 1/1 verificaciones |
| CP-06 | RF-06 | Programación de vuelo con llegada anterior a la salida | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 3: 1/1 verificaciones |
| CP-07 | RF-07 | Consulta de vuelos por origen, destino y fecha | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 3: 1/1 verificaciones |
| CP-08 | RF-08 | Generación automática de asientos | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 3: 1/1 verificaciones |
| CP-09 | RF-09 | Visualización de disponibilidad en tiempo real | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 3: 1/1 verificaciones |
| CP-10 | RF-10 | Creación de reservación y código único | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 4: 3/3 verificaciones |
| CP-12 | RF-12 | Cancelación de reservación y liberación del asiento | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 4: 1/1 verificaciones |
| CP-13 | RF-13 | Registro de pago con monto incorrecto | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 5: 1/1 verificaciones |
| CP-14 | RF-14 | Registro de pago aprobado y transición a PAGADA (propuesto en v2.1) | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 5: 2/2 verificaciones |
| CP-15 | RF-15 | Check-in sobre reservación no pagada | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 5: 2/2 verificaciones |
| CP-16 | RF-16 | Generación de reporte de ocupación | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 5: 1/1 verificaciones |
| CP-17 | RF-17 | Registro en bitácora de una modificación | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 1: 1/1 verificaciones |
| CP-18 | RNF-05 | Realización de tareas clave sin asistencia | — | — | No evaluable en la fase actual | — | Requiere una sesión con usuarios representativos de cada perfil (KPI-11). |
| CP-11 | RF-11 | Dos solicitudes simultáneas sobre el mismo asiento | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 4: 2/2 verificaciones |
| CP-19 | RNF-07 | Verificación del bloqueo transaccional del asiento | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 4: 1/1 verificaciones |
| CP-20 | RF-14 | Fallo simulado durante el registro del pago | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 5: 2/2 verificaciones |
| CP-31 | RF-08 | Alta de aeronave y verificación de asientos generados | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 3: 1/1 verificaciones |
| CP-32 | RF-15 | Check-in tras el pago de una reservación | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 5: 3/3 verificaciones |
| CP-33 | RN-09 | Cancelación de un vuelo con reservaciones asociadas | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 4: 2/2 verificaciones |
| CP-34 | RF-17 | Verificación del registro en bitácora tras una integración | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 2, 3, 4, 5: 4/4 verificaciones |
| CP-21 | RNF-01 | Consulta de vuelos disponibles (≤ 3 s) | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | rendimiento-202611111500.md: p95 0.102 s, 0 errores |
| CP-35 | RNF-01 | Creación de una reservación completa (≤ 3 s) | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | rendimiento-202611111500.md: p95 0.109 s, 0 errores |
| CP-36 | RNF-01 | Registro de un pago (≤ 3 s) | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | rendimiento-202611111500.md: p95 0.058 s, 0 errores |
| CP-37 | RNF-01 | Generación de un reporte de ocupación (≤ 5 s) | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | rendimiento-202611111500.md: p95 0.369 s, 0 errores |
| CP-38 | RNF-02 | Comportamiento ante pico de solicitudes | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | rendimiento-202611111500.md: p95 0.194 s, 0 errores |
| CP-22 | RNF-02 | Disponibilidad del sistema en operación sostenida (≥ 99 %) | — | — | No evaluable en la fase actual | — | Requiere operación sostenida durante el periodo de medición de KPI-08 (mensual). |
| CP-29 | RNF-10 | Restauración desde respaldo (≤ 30 min) | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | evidencias/restauracion/PR-20261111-0859.md |
| CP-24 | S-01, S-05 | Verificación del cifrado de credenciales | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 1: 2/2 verificaciones |
| CP-25 | S-03, S-06, S-08 | Intento de escalamiento de privilegios | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 1: 3/3 verificaciones |
| CP-26 | S-10, S-11, S-13 | Intento de inyección de código en formularios | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 1: 6/6 verificaciones |
| CP-27 | S-14 | Confirmación en operaciones irreversibles | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 1, 3: 4/4 verificaciones |
| CP-39 | S-02 | Bloqueo de cuenta por intentos fallidos | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 1: 2/2 verificaciones |
| CP-40 | S-04 | Invalidación de sesión al cerrar sesión | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 1: 1/1 verificaciones |
| CP-41 | S-12 | No repudio de operaciones | 11/11/2026 | Nombre de quien ejecuta | Aprobado | — | Aceptación, sprint 1: 1/1 verificaciones |

CP-23, CP-28 y CP-30 no existen en el manual. CP-14 se define en la versión 2.1. Un caso "No evaluable en la fase actual" se documenta conforme al Plan de auditoría §9.3.

## Anexo · Verificaciones por caso

### CP-01 · Registro de usuario con datos válidos

- Correcta: CP-01 el registro con datos válidos crea la cuenta y confirma

### CP-02 · Bloqueo tras cinco intentos fallidos

- Correcta: CP-02 los intentos 1 a 4 se rechazan como credenciales incorrectas
- Correcta: CP-02 / CP-39 el quinto intento fallido bloquea la cuenta
- Correcta: CP-02 / CP-39 al sexto intento la cuenta sigue bloqueada aun con la contraseña correcta

### CP-03 · Asignación y respeto del perfil de usuario

- Correcta: CP-03 la sesión del pasajero tiene perfil Pasajero
- Correcta: CP-03 el menú del pasajero no incluye funciones administrativas
- Correcta: CP-03 el empleado tiene su perfil y no ve funciones administrativas

### CP-04 · Alta de aeropuerto con código IATA inválido

- Correcta: CP-04 un código IATA inválido se rechaza e informa el formato esperado
- Correcta: CP-04 un código IATA en minúsculas se rechaza

### CP-05 · Alta de aeronave con matrícula duplicada

- Correcta: CP-05 una matrícula duplicada se rechaza por unicidad

### CP-06 · Programación de vuelo con llegada anterior a la salida

- Correcta: CP-06 un vuelo con llegada anterior a la salida se rechaza e indica el error

### CP-07 · Consulta de vuelos por origen, destino y fecha

- Correcta: CP-07 la consulta devuelve únicamente el vuelo que coincide en origen, destino y fecha

### CP-08 · Generación automática de asientos

- Correcta: CP-08 / CP-31 el número de asientos generados coincide con la capacidad

### CP-09 · Visualización de disponibilidad en tiempo real

- Correcta: CP-09 el estado mostrado coincide con el almacenado

### CP-10 · Creación de reservación y código único

- Correcta: CP-10 el pasajero reserva un asiento libre
- Correcta: CP-10 se emite un código de 8 caracteres
- Correcta: CP-10 los códigos de reservación no se repiten

### CP-12 · Cancelación de reservación y liberación del asiento

- Correcta: CP-12 el pasajero cancela su reservación

### CP-13 · Registro de pago con monto incorrecto

- Correcta: CP-13 un pago cuyo monto no coincide con la tarifa se rechaza

### CP-14 · Registro de pago aprobado y transición a PAGADA (propuesto en v2.1)

- Correcta: CP-14 RF-13 el pago con el monto exacto se aprueba
- Correcta: CP-14 la reservación pasa a PAGADA solo tras el pago aprobado

### CP-15 · Check-in sobre reservación no pagada

- Correcta: CP-15 la consulta informa el motivo por el que no procede
- Correcta: CP-15 el sistema impide el check-in e informa el motivo

### CP-16 · Generación de reporte de ocupación

- Correcta: CP-16 los totales del reporte de ocupación coinciden con la base de datos

### CP-17 · Registro en bitácora de una modificación

- Correcta: CP-17 la modificación registra usuario, fecha, hora, acción y módulo

### CP-11 · Dos solicitudes simultáneas sobre el mismo asiento

- Correcta: CP-11 exactamente una solicitud obtiene el asiento
- Correcta: CP-11 todas las demás reciben rechazo por asiento no disponible

### CP-19 · Verificación del bloqueo transaccional del asiento

- Correcta: CP-19 la base registra una sola reservación para el asiento

### CP-20 · Fallo simulado durante el registro del pago

- Correcta: CP-20 tras el fallo la transacción se revierte y la reservación conserva el estado CONFIRMADA
- Correcta: CP-20 no queda ningún registro de pago parcial

### CP-31 · Alta de aeronave y verificación de asientos generados

- Correcta: CP-08 / CP-31 el número de asientos generados coincide con la capacidad

### CP-32 · Check-in tras el pago de una reservación

- Correcta: CP-32 CA-09 el check-in de una reservación PAGADA emite un pase de 12 caracteres
- Correcta: CP-32 la reservación pasa a ABORDADA
- Correcta: CP-32 CA-09 los números de pase son únicos

### CP-33 · Cancelación de un vuelo con reservaciones asociadas

- Correcta: CP-33 el administrador cancela el vuelo e informa cuántas reservaciones se cancelaron
- Correcta: CP-33 RN-09 las reservaciones del pasajero pasaron a CANCELADA

### CP-34 · Verificación del registro en bitácora tras una integración

- Correcta: CP-34 RF-17 la modificación del aeropuerto quedó en la bitácora
- Correcta: CP-34 RF-17 la programación del vuelo quedó en la bitácora
- Correcta: CP-34 RF-17 la bitácora registra al empleado que creó la reservación
- Correcta: CP-34 RF-17 la bitácora registra al empleado que hizo el check-in

### CP-24 · Verificación del cifrado de credenciales

- Correcta: CP-24 la contraseña se almacena como resumen Argon2id
- Correcta: CP-24 el valor en texto claro no aparece en la base

### CP-25 · Intento de escalamiento de privilegios

- Correcta: CP-25 la URL administrativa responde 403 desde el servidor
- Correcta: CP-25 la API administrativa responde 403
- Correcta: CP-25 el intento de escalamiento quedó en la bitácora con el usuario

### CP-26 · Intento de inyección de código en formularios

- Correcta: CP-26 una inyección SQL en el correo del inicio de sesión se rechaza
- Correcta: CP-26 una inyección SQL en la contraseña no permite entrar
- Correcta: CP-26 el texto con SQL y script se guarda literal, sin ejecutarse
- Correcta: CP-26 la base de datos no se alteró (la tabla de usuarios sigue existiendo)
- Correcta: CP-26 la política de contenido impide ejecutar scripts en línea
- Correcta: CP-26 una inyección en los filtros de búsqueda se rechaza como dato inválido

### CP-27 · Confirmación en operaciones irreversibles

- Correcta: CP-27 RNF-12 la baja sin la confirmación correcta se rechaza
- Correcta: CP-27 RNF-12 con la confirmación correcta la baja procede
- Correcta: CP-27 RNF-12 cancelar un vuelo sin escribir su número se rechaza
- Correcta: CP-27 RN-09 el administrador cancela el vuelo con confirmación explícita

### CP-39 · Bloqueo de cuenta por intentos fallidos

- Correcta: CP-02 / CP-39 el quinto intento fallido bloquea la cuenta
- Correcta: CP-02 / CP-39 al sexto intento la cuenta sigue bloqueada aun con la contraseña correcta

### CP-40 · Invalidación de sesión al cerrar sesión

- Correcta: CP-40 S-04 el identificador de la sesión cerrada ya no es válido

### CP-41 · No repudio de operaciones

- Correcta: CP-41 RF-17 la baja quedó en la bitácora con usuario, fecha, hora, acción y módulo

