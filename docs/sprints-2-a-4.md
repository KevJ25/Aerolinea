# Sprints 2 a 4 · Catálogos, vuelos y reservaciones

Alcance según la Figura 6 del Manual de Calidad MC-SGA-001:

| Sprint | Contenido                       | Módulos          |
| ------ | ------------------------------- | ---------------- |
| 2      | Aeropuertos, aviones y asientos | M-02, M-03, M-05 |
| 3      | Vuelos y rutas                  | M-04             |
| 4      | Reservaciones y concurrencia    | M-06             |

Con el Sprint 4 se completa el **núcleo funcional (LB-2)**: el sistema permite dar de alta el catálogo, programar vuelos, buscarlos, ver la disponibilidad de asientos y reservar sin duplicados.

## Cómo verificarlo

```powershell
npm run prueba:aceptacion              # Sprints 1 a 4: 130 verificaciones por HTTP
npm run prueba:aceptacion -- 4         # solo el Sprint 4
npm run db:probar                      # verificaciones de la base de datos
```

La prueba se puede repetir cuantas veces se quiera sobre la misma base: cada ejecución crea sus propios usuarios, aeropuertos, aeronaves y números de vuelo.

## Búsqueda de vuelos con calendario

La pantalla _Buscar vuelos_ nunca aparece vacía:

- **Vista inicial.** Sin filtros, muestra los vuelos disponibles de los próximos 14 días, agrupados por día.
- **Filtros opcionales.** Con solo el origen o solo el destino, la lista se reduce a esos vuelos. Con origen, destino y fecha se usa la consulta exacta de RF-07, que devuelve exclusivamente los vuelos coincidentes (CA-04).
- **Franja de 14 días.** Sobre los resultados, cada día muestra cuántos vuelos hay y desde qué precio, según los filtros. Un clic elige el día y un segundo clic vuelve a mostrar las dos semanas. Las flechas avanzan o retroceden 14 días.
- **Sugerencias.** Si no hay vuelos, se indica el siguiente vuelo de la ruta con un botón para ir a ese día, y los destinos (u orígenes) con vuelos próximos.
- **Filtros conservados.** Viajan en la dirección de la página: sobreviven a recargar, a compartir el enlace y al botón "Volver" desde la pantalla de asientos.

## Itinerario de demostración

```powershell
npm run db:itinerario
```

Programa los vuelos de los próximos 60 días con un horario fijo por ruta (17 vuelos con número propio, unos diarios y otros en días específicos) y aparta entre 10 % y 45 % de los asientos en los vuelos de las próximas dos semanas. Se puede ejecutar las veces que sea necesario: solo agrega los vuelos que falten, así que ejecutarlo de nuevo más adelante extiende el itinerario. Los pasajeros que ocupan esos asientos (`pasajero.demo.NN@correo.mx`) no tienen una contraseña utilizable: nadie puede iniciar sesión con ellos.

## Funciones por perfil (Tabla 8)

| Perfil        | Pantallas                                            | Puede                                                                                             |
| ------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Administrador | Aeropuertos y aviones, Rutas y vuelos, Reservaciones | Gestionar catálogos, rutas y vuelos; cancelar vuelos; consultar y cancelar reservaciones          |
| Empleado      | Vuelos, Reservaciones                                | Consultar vuelos y asientos; reservar a nombre de un pasajero; consultar y cancelar reservaciones |
| Pasajero      | Buscar vuelos, Mis reservaciones                     | Buscar vuelos; ver asientos; reservar; consultar y cancelar sus propias reservaciones             |

Cada ruta está protegida en el servidor: un perfil que no corresponde recibe 403 y el intento queda en la bitácora.

## Trazabilidad

| Requisito                                                        | Pantalla                                       | API                                        | Caso de prueba                                              |
| ---------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| RF-04, CA-03 Aeropuertos con IATA válido y único                 | `/admin/catalogos` (MK-11)                     | `/api/aeropuertos`                         | CP-04 en `sprint2.mjs`                                      |
| RF-05, CA-03 Aeronaves con matrícula única                       | `/admin/catalogos` (MK-11)                     | `/api/aviones`                             | CP-05 en `sprint2.mjs`                                      |
| RN-05 Rutas entre dos aeropuertos distintos                      | `/admin/vuelos` (MK-09)                        | `/api/rutas`                               | `sprint3.mjs`                                               |
| RF-06, CA-04 Programación con llegada posterior a la salida      | `/admin/vuelos` (MK-09)                        | `POST /api/vuelos`                         | CP-06 en `sprint3.mjs`                                      |
| RF-07, CA-04 Búsqueda por origen, destino y fecha                | `/vuelos` (MK-04)                              | `GET /api/vuelos/buscar`                   | CP-07 en `sprint3.mjs`                                      |
| RF-08, RN-04, CA-05 Asientos generados según capacidad           | —                                              | Al programar el vuelo                      | CP-08 en `sprint3.mjs`                                      |
| RF-09, CA-05 Disponibilidad libre, reservado y ocupado           | `/vuelos/:id` (MK-05)                          | `GET /api/vuelos/:id/asientos`             | CP-09 en `sprint3.mjs` y `sprint4.mjs`                      |
| RN-09, RNF-12 Cancelación de vuelo con confirmación              | `/admin/vuelos` (MK-10)                        | `POST /api/vuelos/:id/cancelar`            | `sprint3.mjs` y `sprint4.mjs`                               |
| RF-10 Reservación con código único                               | `/vuelos/:id` (MK-05)                          | `POST /api/reservaciones`                  | CP-10 en `sprint4.mjs`                                      |
| RF-11, RNF-07, CA-06 Sin duplicados ante solicitudes simultáneas | `/vuelos/:id`                                  | `POST /api/reservaciones`                  | CP-11 y CP-19 en `sprint4.mjs` (10 solicitudes simultáneas) |
| RF-12, CA-07 Cancelación y liberación del asiento                | `/mis-reservaciones` (MK-07), `/reservaciones` | `POST /api/reservaciones/:codigo/cancelar` | CP-12 en `sprint4.mjs`                                      |
| RN-11 Expiración de reservaciones sin pago                       | —                                              | Proceso cada 15 minutos en el backend      | `db/pruebas/operaciones.sql`                                |
| RNF-01 Respuesta en 3 segundos o menos                           | —                                              | Búsqueda y reservación                     | `sprint3.mjs` y `sprint4.mjs` miden el tiempo               |
| S-08 Cada pasajero ve solo lo suyo                               | `/mis-reservaciones`                           | `GET /api/reservaciones/mias`              | `sprint4.mjs`                                               |

## Decisiones para el Manual v2.1

1. **Inconsistencia entre la Tabla 8 y la matriz RACI.** La Tabla 8 dice que el Administrador administra rutas y vuelos y el Empleado solo los consulta; la RACI asigna "Gestión de vuelos" al Empleado (R). Se implementó la Tabla 8, que es la que define permisos del sistema. Hay que corregir la RACI.
2. **Reservaciones por perfil.** El Empleado reserva a nombre de un pasajero ("gestionar reservaciones cuando corresponda"). El Administrador consulta y cancela, pero no crea reservaciones, porque la Tabla 8 no lo incluye entre sus funciones.
3. **"En tiempo real" (RF-09).** La pantalla de asientos consulta la disponibilidad cada 5 segundos. Si otra persona aparta el asiento elegido, se avisa al usuario antes de que intente reservarlo.
4. **Capacidad de una aeronave.** Si se modifica, aplica a los vuelos que se programen después; los ya programados conservan sus asientos (RN-04 se cumple al generar los asientos).
5. **Fechas y horas.** Se capturan y muestran en hora del centro de México y se almacenan con zona horaria.
6. **RN-12 (nueva): la venta cierra 24 horas antes de la salida.** RN-11 fija que una reservación sin pago expira a las 48 horas o 24 horas antes de la salida, lo que ocurra primero. Para un vuelo que sale en menos de 24 horas ese plazo ya habría pasado al reservar: la reservación nacía vencida y su asiento se liberaba con la siguiente solicitud. Se detectó al generar el itinerario de demostración y se corrigió con la migración 008, que cierra la venta 24 horas antes. Esos vuelos siguen visibles para el administrador, pero ya no aparecen en la búsqueda.
7. **Oportunidad de mejora.** El sistema no impide programar la misma aeronave en dos vuelos que se traslapan en horario; ningún requisito lo exige. Conviene evaluarlo como requisito nuevo.

## Lo que sigue

El **Sprint 5** (pagos simulados, check-in y reportes) está documentado en [sprint-5.md](sprint-5.md).
