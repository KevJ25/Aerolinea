# Base de datos

PostgreSQL 16 con pgAudit. Este documento es el contrato entre la base de datos y el backend, y la referencia de los controles de seguridad, auditoría y respaldo que el Manual de Calidad MC-SGA-001 exige. Todo lo descrito aquí está verificado por `db/probar.sh` en cada integración.

## Puesta en marcha

Funciona igual en Windows (PowerShell), macOS y Linux. Solo se necesitan Docker Desktop, Node.js 22 y Git: los scripts de `db/` se ejecutan dentro del contenedor, que ya incluye psql, GnuPG y las demás herramientas.

```powershell
copy .env.ejemplo .env               # ajuste PGPASSWORD y SGA_RESPALDO_CLAVE
npm run db:iniciar                   # PostgreSQL 16 con pgAudit precargado
npm run db:migrar                    # aplica las migraciones pendientes
npm run db:semillas                  # datos ficticios (solo Desarrollo y Demostración)
npm run db:probar                    # batería completa, en bases temporales
npm run db:consola                   # consola psql interactiva
```

Las cuentas de demostración usan la contraseña `Demo-SGA-2026!`: `mariana.ruiz@sga.mx` (Administrador), `luis.ortega@sga.mx` (Empleado), `ana.lopez@correo.mx` y `jorge.mendoza@correo.mx` (Pasajero), entre otras.

Los respaldos se guardan en la carpeta `respaldos` del proyecto y las evidencias en `evidencias`, visibles desde el Explorador de Windows. Ninguna de las dos se sube al repositorio.

| Comando                                  | Qué hace                                              |
| ---------------------------------------- | ----------------------------------------------------- |
| `npm run db:iniciar` / `db:detener`      | Inicia o detiene el contenedor                        |
| `npm run db:migrar`                      | Aplica las migraciones pendientes                     |
| `npm run db:semillas`                    | Carga los datos de demostración en una base vacía     |
| `npm run db:probar`                      | Ejecuta toda la batería de pruebas                    |
| `npm run db:prueba:concurrencia`         | Solo la prueba de concurrencia (RF-11)                |
| `npm run db:prueba:privilegios`          | Solo la prueba de privilegios (S-07)                  |
| `npm run db:prueba:auditoria`            | Solo la prueba de las políticas pgAudit               |
| `npm run db:respaldar`                   | Respaldo cifrado (sección 31)                         |
| `npm run db:probar-restauracion`         | Prueba de restauración y registro PR-xx               |
| `npm run db:expediente`                  | Expediente de evidencia para la auditoría             |
| `npm run db:expediente:completo`         | Expediente con la salida de las pruebas incluida      |
| `npm run db:cuenta -- aplicacion nombre` | Crea una cuenta de base de datos (pide la contraseña) |
| `npm run db:consola`                     | Consola psql                                          |

## Migraciones

| Versión | Contenido                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------- |
| 001     | Tablas del diccionario de datos (13.6) con las reglas V-01 a V-12 y RN-01 a RN-11 como restricciones y disparadores |
| 002     | Bitácora automática de altas, modificaciones y bajas (RF-17, RN-10, CA-11)                                          |
| 003     | Operaciones transaccionales: reservar, cancelar, pagar, check-in, autenticación, desbloqueo y baja                  |
| 004     | Vistas de reportes (RF-16)                                                                                          |
| 005     | Roles de base de datos y privilegios mínimos (S-07, S-09)                                                           |
| 006     | Políticas de auditoría pgAudit AUD-01 a AUD-08 (S-12)                                                               |
| 007     | Sesiones del servidor: expiración por inactividad e invalidación al cerrar sesión (S-03, S-04, S-06)                |
| 008     | Cierre de venta 24 horas antes de la salida (RN-12)                                                                 |
| 009     | Lectura de las vistas de reportes por la aplicación (RF-16)                                                         |

`db/migrar.sh` registra cada migración en `esquema_version` con su hash SHA-256 y la cuenta que la aplicó. **Una migración aplicada no se modifica**: si su contenido cambia, el ejecutor se detiene. Toda corrección se hace con una migración nueva respaldada por una solicitud de cambio (sección 16).

## Roles de base de datos

| Rol                     | Inicia sesión                                              | Puede                                                                                                                                   | No puede                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sga_aplicacion`        | Mediante cuentas creadas con `crear_cuentas.sh aplicacion` | Leer tablas (sin resúmenes de contraseña), administrar catálogos, rutas, vuelos y datos de usuarios, invocar las operaciones de negocio | Borrar; escribir directamente en reservaciones, pagos, check-in o bitácora; alterar la estructura; ver `esquema_version`; desactivar su auditoría |
| `sga_reportes`          | Mediante cuentas `reportes`                                | Leer las tres vistas de reportes                                                                                                        | Leer datos personales o transacciones individuales; escribir                                                                                      |
| `sga_operaciones`       | No                                                         | Es el propietario de las operaciones de negocio, que se ejecutan con sus privilegios (`SECURITY DEFINER`, ruta de búsqueda fija)        | Nadie puede iniciar sesión con este rol                                                                                                           |
| `sga_auditor`           | No                                                         | Nada: sus "permisos" solo definen qué audita pgAudit                                                                                    | —                                                                                                                                                 |
| Cuentas administrativas | Una por persona, `crear_cuentas.sh administrador`          | Migraciones, respaldos, soporte                                                                                                         | Su actividad de escritura queda auditada completa (AUD-08)                                                                                        |

Las cuentas administrativas son **nominales**: nunca se comparten. Sin ellas, el registro de auditoría no identifica a una persona y se pierde el no repudio.

## Contrato con el backend

### Identificar al usuario en cada transacción

Al inicio de cada transacción que modifique datos, el backend declara quién actúa. Con eso la bitácora registra al usuario de la aplicación, no a la cuenta de base de datos:

```sql
SELECT set_config('sga.id_usuario', $1, true);   -- $1 = id del usuario autenticado
```

El tercer argumento (`true`) limita el valor a la transacción, de modo que no se filtra a otra petición que reutilice la conexión del _pool_.

### Operaciones

Todas las consultas se envían con parámetros (`$1`, `$2`…), nunca concatenando valores (S-11; el análisis estático lo verifica).

| Función                                                    | Devuelve                                                    | Requisitos                 |
| ---------------------------------------------------------- | ----------------------------------------------------------- | -------------------------- |
| `crear_reservacion(id_pasajero, id_vuelo, numero_asiento)` | Código de 8 caracteres                                      | RF-10, RF-11, CA-05, CA-06 |
| `cancelar_reservacion(codigo, id_solicitante)`             | —                                                           | RF-12, S-08                |
| `registrar_pago(codigo, monto, metodo)`                    | `APROBADO` o `RECHAZADO`                                    | RF-13, RF-14, CA-08        |
| `realizar_check_in(codigo, id_empleado)`                   | Pase de abordar de 12 caracteres                            | RF-15, RN-03, CA-09        |
| `expirar_reservaciones()`                                  | Número de reservaciones vencidas                            | RN-11                      |
| `obtener_credencial(correo)`                               | id, resumen Argon2id, rol, si está bloqueada y hasta cuándo | RF-02                      |
| `registrar_intento_fallido(id_usuario)`                    | `true` si la cuenta quedó bloqueada                         | RF-02, S-02, CP-02         |
| `registrar_acceso_exitoso(id_usuario)`                     | —                                                           | RF-17                      |
| `desbloquear_cuenta(id_usuario)`                           | — (solo Administrador)                                      | RF-18                      |
| `dar_baja_usuario(id_usuario)`                             | — (solo Administrador)                                      | RF-03, V-12                |
| `registrar_evento(accion, modulo, detalle)`                | — (`ACCESO` o `ERROR`)                                      | RF-17, CP-25               |

Flujo de inicio de sesión: `obtener_credencial` → si está bloqueada, rechazar sin verificar → verificar Argon2id en el backend → `registrar_acceso_exitoso` o `registrar_intento_fallido`. Si el correo no existe, el backend responde exactamente igual que con una contraseña incorrecta (S-13).

Un acceso denegado por rol (CP-25) se registra con `registrar_evento('ACCESO', '<módulo>', 'Acceso denegado a <ruta>')`.

### Códigos de error

Las operaciones señalan sus rechazos con códigos propios. El backend los traduce a un mensaje genérico (S-13) y nunca reenvía el texto de PostgreSQL al cliente.

| SQLSTATE | Significado                               | HTTP sugerido | Mensaje al usuario                                            |
| -------- | ----------------------------------------- | ------------- | ------------------------------------------------------------- |
| `SGA01`  | Asiento no disponible                     | 409           | El asiento ya no está disponible. Elige otro asiento libre.   |
| `SGA02`  | El vuelo no admite la operación           | 409           | Este vuelo ya no admite la operación solicitada.              |
| `SGA03`  | El estado de la reservación no lo permite | 409           | La reservación no permite esta operación en su estado actual. |
| `SGA04`  | Operación no autorizada                   | 403           | No tiene permiso para realizar esta operación.                |
| `SGA05`  | Registro inexistente                      | 404           | No se encontró la información solicitada.                     |
| `SGA06`  | Dato de entrada inválido                  | 422           | Revise los datos capturados.                                  |
| `42501`  | Privilegio insuficiente en la base        | 500 y alerta  | Ocurrió un error. Inténtelo más tarde.                        |

Un `42501` significa que el backend intentó algo para lo que su cuenta no tiene permiso. Es un defecto del backend o un intento de abuso, y debe registrarse como incidente (sección 30).

### Proceso periódico

`expirar_reservaciones()` debe ejecutarse cada 15 minutos. Lo recomendable es hacerlo desde el planificador del backend; mientras no exista, en Windows puede programarse con el Programador de tareas (ajuste la ruta del proyecto):

```powershell
schtasks /Create /SC MINUTE /MO 15 /TN "SGA expirar reservaciones" /TR "cmd /c cd /d C:\ruta\sga && docker compose exec -T postgres psql -X -q -c \"SELECT expirar_reservaciones()\""
```

`crear_reservacion` también libera en el momento un asiento cuya reservación ya venció, así que un retraso del proceso nunca bloquea un asiento disponible.

## Políticas de auditoría (pgAudit)

| Política | Qué se registra                                                   | Mecanismo                                                    | Control     | ISO/IEC 27001:2022 |
| -------- | ----------------------------------------------------------------- | ------------------------------------------------------------ | ----------- | ------------------ |
| AUD-01   | Cambios de estructura (CREATE, ALTER, DROP)                       | Sesión `ddl`                                                 | 15, 16      | 8.32               |
| AUD-02   | Cambios de roles y privilegios (GRANT, REVOKE, CREATE/ALTER ROLE) | Sesión `role`                                                | S-07        | 8.2                |
| AUD-03   | Lectura de resúmenes de contraseña                                | Sesión `function` (autenticación) y objeto (lectura directa) | S-01        | 8.5                |
| AUD-04   | Cambios de rol, estado, bloqueo o contraseña de un usuario        | Objeto                                                       | S-07, RF-18 | 8.2                |
| AUD-05   | Reservaciones, pagos y check-in                                   | Sesión `function` (aplicación) y objeto (escritura directa)  | S-12, R-04  | 8.15               |
| AUD-06   | Intentos de alterar la bitácora o de borrar físicamente           | Objeto, y registro de error del servidor                     | S-12, V-12  | 8.15               |
| AUD-07   | Cambios de horario, tarifa o estado de un vuelo                   | Objeto                                                       | RN-09       | 8.15               |
| AUD-08   | Toda escritura de las cuentas administrativas                     | Sesión `write, ddl, role, misc, function` por cuenta         | S-07        | 8.2                |

**Cómo se complementa con la bitácora de negocio.** La bitácora (RF-17) registra qué hizo cada usuario de la aplicación y qué campos cambió. pgAudit registra qué se ejecutó en la base de datos y con qué cuenta, incluida la actividad de los administradores, que la bitácora no ve cuando trabajan directamente en la base.

**Minimización.** Los valores de los parámetros no se registran (`pgaudit.log_parameter = off`), así que correos, nombres y resúmenes enviados como parámetro no aparecen. La prueba de auditoría lo verifica.

**Limitación conocida, verificada por la prueba.** pgAudit 16.0 no emite auditoría de _objeto_ para las sentencias dentro de funciones `SECURITY DEFINER` invocadas por cuentas sin superusuario. Por eso AUD-03 y AUD-05 registran la invocación de la operación (clase `function`) y la bitácora conserva el detalle. Si una versión futura de pgAudit corrige este comportamiento, la prueba lo detectará.

**Contraseñas de cuentas nuevas.** AUD-02 registra el texto completo de `CREATE ROLE`. Por eso las cuentas se crean exclusivamente con `db/crear_cuentas.sh`, que envía el verificador SCRAM-SHA-256 calculado en el cliente y nunca la contraseña.

### Revisar el registro

El registro está en el directorio `log/` de los datos del servidor, un archivo por día. Para un resumen por política del periodo, lo más sencillo es `npm run db:expediente`. Para buscar algo puntual, abra una terminal dentro del contenedor desde PowerShell:

```powershell
docker exec -it sga-postgres bash
```

Y ya dentro del contenedor:

```bash
cd "$PGDATA/log"

# Cambios de estructura o privilegios del día
grep -E "AUDIT: SESSION,[0-9]+,[0-9]+,(DDL|ROLE)" "postgresql-$(date +%F).log"

# Toda la actividad de una cuenta administrativa
grep "usuario=nombre_cuenta .*AUDIT:" postgresql-*.log

# Accesos rechazados por falta de privilegios
grep "permission denied" postgresql-*.log

exit
```

## Respaldos y restauración (sección 31)

```powershell
npm run db:respaldar                 # diario, semanal o mensual según la fecha
npm run db:probar-restauracion       # restaura el más reciente y genera PR-xx
```

`respaldar.sh` toma el volcado y el conteo de registros de la misma instantánea, empaqueta roles y la configuración de la base (incluidas las políticas pgAudit), cifra con AES-256 (GnuPG), verifica que el respaldo se pueda leer, anota la bitácora de respaldos (Tabla 68) y aplica la retención de 7 diarios, 4 semanales y mensuales hasta el cierre.

`prueba_restauracion.sh` restaura en una base nueva, mide el tiempo contra el RTO de 30 minutos, compara cada tabla con el manifiesto, verifica que las políticas de auditoría quedaron aplicadas y escribe el registro de la Tabla 67 en `evidencias/restauracion/PR-xx.md`, listo para la firma del responsable de calidad. Un archivo alterado o una frase incorrecta se rechazan.

Programación sugerida en Windows con el Programador de tareas (ajuste la ruta del proyecto; la computadora y Docker Desktop deben estar encendidos a esa hora):

```powershell
schtasks /Create /SC DAILY /ST 02:30 /TN "SGA respaldo diario" /TR "cmd /c cd /d C:\ruta\sga && npm run db:respaldar >> respaldos\tareas.log 2>&1"
schtasks /Create /SC MONTHLY /D 1 /ST 09:00 /TN "SGA prueba de restauracion" /TR "cmd /c cd /d C:\ruta\sga && npm run db:probar-restauracion >> respaldos\tareas.log 2>&1"
```

La Tabla 66 exige una copia en almacenamiento separado del servidor de datos. Los scripts dejan el respaldo en `SGA_RESPALDO_DIR`; la copia externa debe configurarse según el almacenamiento que use el equipo. La frase de cifrado se resguarda fuera del servidor: sin ella ningún respaldo se puede restaurar.

## Expediente de evidencia para la auditoría

```powershell
npm run db:expediente:completo -- 2026-09-24 2026-11-11
```

Genera `evidencias/expediente_bd_<fecha>/` y su `.tar.gz` con la versión del esquema, roles y privilegios, la configuración vigente de pgAudit, el registro de auditoría del periodo con su resumen por política, la bitácora de negocio, la bitácora de respaldos, los registros PR-xx y, con `db:expediente:completo`, la salida de la batería de pruebas. El índice relaciona cada archivo con el criterio del Anexo A que respalda y `SHA256SUMS` permite comprobar que nada se alteró después de entregarlo. No contiene datos personales.

Al leer el registro de auditoría hay que saber que PostgreSQL verifica cada llave foránea con una consulta interna (`SELECT 1 FROM ONLY … FOR KEY SHARE`), que pgAudit registra como lectura de la tabla referida. No son lecturas de datos; el resumen las cuenta por separado.

## Trazabilidad

| Requisito o control                           | Objeto de base de datos                                                         | Verificado en                              |
| --------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------ |
| V-01 a V-12, RN-01 a RN-11                    | Restricciones y disparadores de 001                                             | `reglas_integridad.sql`                    |
| RF-02, S-02, RF-18                            | `registrar_intento_fallido`, `desbloquear_cuenta`                               | `operaciones.sql`                          |
| RF-11, RNF-07, R-01                           | `crear_reservacion` (bloqueo pesimista), índice `reservacion_asiento_activo_uq` | `operaciones.sql`, `concurrencia_rf11.sh`  |
| RF-13, CA-08, R-04                            | `registrar_pago`, disparador `pago_validar_monto`                               | `operaciones.sql`                          |
| RF-15, RN-03                                  | `realizar_check_in`, disparador `check_in_validar`                              | `operaciones.sql`                          |
| RF-16, CA-10                                  | Vistas `reporte_*`                                                              | `operaciones.sql`, `privilegios.sql`       |
| RF-17, RN-10, CA-11, S-12                     | Disparadores `*_bitacora`, `bitacora_solo_insercion`                            | `operaciones.sql`, `reglas_integridad.sql` |
| S-01                                          | Columna `contrasena_hash` (solo Argon2id), sin lectura para la aplicación       | `reglas_integridad.sql`, `privilegios.sql` |
| S-07, S-09                                    | Migración 005                                                                   | `privilegios.sql`                          |
| S-12 (no repudio de cuentas de base de datos) | Migración 006                                                                   | `auditoria_pgaudit.sh`                     |
| RNF-10, OC-10, KPI-12                         | `respaldar.sh`, `prueba_restauracion.sh`                                        | `probar.sh` (bloque 6)                     |

## Cambios propuestos para el Manual v2.1

Estos puntos surgieron al implementar y deben reflejarse en el manual para que documento y sistema coincidan:

1. **V-08.** Cambiar "número de asiento único dentro de una aeronave" por "único dentro del vuelo": el asiento pertenece al vuelo (RF-08, RF-09).
2. **RF-09.** Indicar que el estado del asiento (libre, reservado, ocupado) se deriva de las reservaciones y no se almacena.
3. **S-01.** Especificar Argon2id como función de derivación de clave.
4. **Diccionario de datos.** Agregar el dominio de `estado_operativo` del avión: DISPONIBLE, MANTENIMIENTO, FUERA_DE_SERVICIO.
5. **Estado PENDIENTE de la reservación.** Ningún flujo lo usa: las reservaciones nacen CONFIRMADA. Definir cuándo aplica o retirarlo del dominio.
6. **Sección 13.1.** Documentar que las operaciones transaccionales críticas se implementan en la base de datos y el backend las invoca.
7. **Sección 18.** Incorporar la tabla de políticas AUD-01 a AUD-08, la exigencia de cuentas administrativas nominales y la limitación conocida de pgAudit.
8. **Retención y revisión del registro de auditoría.** El manual no las define. Propuesta: conservarlo hasta el cierre del proyecto y revisión semanal por el responsable de calidad, con constancia de la revisión.
9. **Tabla 66.** Sustituir "respaldo completo semanal e incremental diario" por "respaldo completo diario", que cumple el RPO de 24 horas y que PostgreSQL 16 realiza de forma nativa.
10. **RN-12 (nueva).** La venta de un vuelo cierra 24 horas antes de la salida (migración 008).
11. **RN-11 (nueva).** Expiración a las 48 horas de la creación o 24 horas antes de la salida, lo que ocurra primero.
