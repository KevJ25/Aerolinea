# Sprint 1 · Usuarios, roles y seguridad

Alcance según la Figura 6 del Manual de Calidad MC-SGA-001: módulo M-01 (usuarios, roles y seguridad) y la bitácora transversal. Este documento relaciona cada requisito con la pantalla donde se usa, el punto de la API que lo atiende y la prueba que demuestra que se cumple.

## Cómo verificarlo

```powershell
npm run prueba:aceptacion -- 1   # 48 verificaciones por HTTP sobre el sistema en ejecución
npm run db:probar                # 137 verificaciones de la base de datos
npm test                         # pruebas unitarias
```

La integración continua ejecuta las tres en cada pull request.

## Trazabilidad

| Requisito                                         | Pantalla                                 | API                                      | Prueba                                            |
| ------------------------------------------------- | ---------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| RF-01 Registro con correo único                   | `/registro` (MK-02)                      | `POST /api/autenticacion/registro`       | CP-01 en `pruebas-aceptacion/sprint1.mjs`         |
| RF-02, S-02 Bloqueo tras cinco intentos           | `/iniciar-sesion` (MK-01)                | `POST /api/autenticacion/iniciar-sesion` | CP-02 (aceptación) y `db/pruebas/operaciones.sql` |
| RF-03, S-07 Tres perfiles y menú por perfil       | Encabezado de todas las pantallas        | `GET /api/autenticacion/sesion`          | CP-03 (aceptación)                                |
| RF-03 Gestión de usuarios y perfiles              | `/admin/usuarios` (MK-12)                | `GET, POST, PATCH /api/usuarios`         | Aceptación, bloque Administración                 |
| RF-17, CA-11 Bitácora                             | `/admin/bitacora` (MK-12)                | `GET /api/bitacora`                      | CP-17 (aceptación) y `operaciones.sql`            |
| RF-18 Desbloqueo manual                           | `/admin/usuarios`                        | `POST /api/usuarios/:id/desbloquear`     | Aceptación y `operaciones.sql`                    |
| RNF-03, S-01 Contraseñas con Argon2id y sal única | —                                        | Registro y alta de usuarios              | CP-24 (aceptación consulta la base)               |
| RNF-04, S-06, CA-02 Rol verificado en el servidor | `/admin/*` con perfil distinto           | Todas                                    | CP-25 (aceptación) y `roles.guard.spec.ts`        |
| S-03 Expiración por 30 minutos de inactividad     | —                                        | Toda petición autenticada                | Aceptación y `db/pruebas/sesiones.sql`            |
| S-04 Invalidación al cerrar sesión                | Botón "Cerrar sesión"                    | `POST /api/autenticacion/cerrar-sesion`  | Aceptación y `sesiones.sql`                       |
| S-05 Política de contraseña                       | `/registro`, `/inicio`, alta de usuarios | Registro, alta y cambio de contraseña    | Aceptación                                        |
| S-08 El pasajero solo ve su información           | `/inicio`                                | `GET /api/perfil` (sin identificador)    | Aceptación                                        |
| S-09 Denegación por defecto                       | —                                        | Toda ruta sin `@Roles` o `@Publico`      | `roles.guard.spec.ts`                             |
| S-10, S-11 Validación y consultas parametrizadas  | —                                        | Todas                                    | Aceptación y análisis estático                    |
| S-12 No repudio                                   | —                                        | Bitácora y pgAudit                       | `db/pruebas/auditoria_pgaudit.sh`                 |
| S-13 Mensajes genéricos                           | Mensajes de error                        | Todas                                    | Aceptación                                        |
| RNF-12, S-14 Confirmación de la baja              | Diálogo "Dar de baja" (MK-10)            | `POST /api/usuarios/:id/baja`            | Aceptación                                        |

## Decisiones de este sprint para el Manual v2.1

- **S-03:** el manual dice "un periodo de inactividad definido" sin fijarlo. Se implementó en **30 minutos**; conviene escribirlo en el manual.
- **Sesiones del servidor:** el identificador es aleatorio de 256 bits, viaja en una cookie HttpOnly y SameSite=Strict (Secure por HTTPS), y la base guarda solo su resumen SHA-256. Cada petición vuelve a leer el rol vigente, así que un cambio de perfil o una baja surten efecto de inmediato.
- **Correo de desbloqueo:** sigue pendiente decidir el mecanismo. Mientras tanto, la pantalla de bloqueo indica solicitar el desbloqueo a un administrador, que lo hace desde `/admin/usuarios` (RF-18).
- **Funciones fuera del Sprint 1:** vuelos, reservaciones, pagos, check-in y reportes no aparecen en el menú. La base de datos ya las soporta y se incorporan en los Sprints 2 a 5 según la Figura 6.

## Cuentas de demostración

Se cargan con `npm run db:semillas`. Contraseña de todas: `Demo-SGA-2026!`

| Correo                  | Perfil        | Estado       |
| ----------------------- | ------------- | ------------ |
| mariana.ruiz@sga.mx     | Administrador | Activo       |
| luis.ortega@sga.mx      | Empleado      | Activo       |
| sofia.herrera@sga.mx    | Empleado      | Dado de baja |
| ana.lopez@correo.mx     | Pasajero      | Activo       |
| jorge.mendoza@correo.mx | Pasajero      | Activo       |

Antes de compartir el enlace público, cambie la contraseña de la cuenta de administración desde **Mi cuenta**: la contraseña de demostración está escrita en el repositorio.
