# Sprint 5 · Pagos, check-in y reportes

Último sprint funcional según la Figura 6 del Manual de Calidad MC-SGA-001. Con él, el sistema cubre los 18 requisitos funcionales (RF-01 a RF-18) y los nueve módulos (M-01 a M-09).

## Cómo verificarlo

```powershell
npm run prueba:aceptacion          # Sprints 1 a 5: 161 verificaciones por HTTP
npm run prueba:aceptacion -- 5     # solo el Sprint 5
npm run db:probar                  # 142 verificaciones de la base, incluido CP-20
```

## Funciones por perfil (Tabla 8)

| Perfil        | Pantalla                                      | Puede                                                                                        |
| ------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Pasajero      | _Mis reservaciones_ → **Pagar**; **Ver pase** | Pagar sus reservaciones confirmadas con un método de prueba; consultar su pase de abordar    |
| Empleado      | **Check-in**                                  | Buscar una reservación por código, verificar la identificación y emitir el pase de abordar   |
| Administrador | **Reportes**                                  | Ocupación por vuelo, reservaciones por periodo y pagos registrados; descargar CSV o imprimir |

## Trazabilidad

| Requisito                                                          | Pantalla                             | API                                                   | Caso de prueba                                       |
| ------------------------------------------------------------------ | ------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------- |
| RF-13, RN-08, CA-08 Pago validado contra la tarifa                 | `/pago/:codigo` (MK-06)              | `POST /api/reservaciones/:codigo/pago`                | CP-13 en `sprint5.mjs`                               |
| RF-14, RN-02 PAGADA solo con pago aprobado                         | `/pago/:codigo`                      | ídem                                                  | CP-14 en `sprint5.mjs`                               |
| RF-14 Fallo durante el pago revierte todo                          | —                                    | Transacción única                                     | CP-20 en `db/pruebas/operaciones.sql`                |
| RF-15, RN-03, CA-09 Check-in de reservaciones pagadas y pase único | `/check-in` (MK-08), `/pase/:codigo` | `GET/POST /api/check-in`                              | CP-15 y CA-09 en `sprint5.mjs`                       |
| RF-16, CA-10 Reportes que coinciden con la base                    | `/admin/reportes` (MK-13)            | `/api/reportes/ocupacion`, `/reservaciones`, `/pagos` | CP-16 y CA-10 en `sprint5.mjs`                       |
| S-08 Cada pasajero paga y consulta solo lo suyo                    | `/pago/:codigo`, `/pase/:codigo`     | `GET /api/reservaciones/:codigo`                      | `sprint5.mjs`                                        |
| PCI-DSS (diseño preventivo)                                        | `/pago/:codigo`                      | —                                                     | La pantalla no solicita ni almacena datos de tarjeta |

## Decisiones para el Manual v2.1

1. **Pago simulado sin datos de tarjeta.** Por diseño preventivo de PCI-DSS, la pantalla no pide número de tarjeta: se elige un método de prueba (aprobado o rechazado) y el monto lo calcula el sistema. Cada intento, aprobado o rechazado, queda registrado.
2. **Quién paga.** Solo el pasajero paga sus reservaciones (Tabla 8). Una reservación ajena responde como inexistente, para no revelar su existencia (S-08).
3. **Check-in.** Lo realiza el empleado tras confirmar la identificación oficial del pasajero. Si no procede, el sistema informa el motivo concreto (CP-15): falta de pago, check-in previo, reservación cancelada o vuelo que ya no lo admite. Al documentar, la reservación pasa a ABORDADA y el asiento a OCUPADO.
4. **Reportes.** Se calculan al momento sobre los registros vigentes (CA-10), con periodos de hasta 92 días. La migración 009 da a la cuenta de la aplicación lectura de las tres vistas de reportes y nada más.
5. **Exportación.** Los reportes se descargan en CSV (abre en Excel con acentos correctos) o se imprimen o guardan como PDF desde el navegador; el pase de abordar también se imprime.

## Lo que sigue en el cronograma

Con el Sprint 5 se cierra el desarrollo. Según la Figura 6 sigue la fase de **pruebas de sistema y regresión** y la **línea base LB-3 (entrega final)** con su auditoría. Quedan por medir los indicadores que dependen del sistema en operación: disponibilidad (KPI-08), tasa de éxito de usuarios (KPI-11) y las pruebas de carga y resistencia (CP-21, CP-22).
