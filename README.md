# Sistema de Gestión de Aerolínea

Sistema académico para administrar usuarios, aeropuertos, aviones, vuelos, asientos, reservaciones, pagos simulados, check-in y reportes. Los cinco sprints de desarrollo están completos: cubre RF-01 a RF-18 y los módulos M-01 a M-09. Su desarrollo se rige por el Manual de Calidad del Software **MC-SGA-001**.

## Tecnología

| Capa (sección 13.1)  | Tecnología                             |
| -------------------- | -------------------------------------- |
| Lógica de negocio    | Node.js 22 · TypeScript 5 · NestJS 11  |
| Persistencia         | PostgreSQL 16                          |
| Pruebas unitarias    | Jest                                   |
| Análisis estático    | ESLint con las reglas de la sección 14 |
| Integración continua | GitHub Actions                         |

## Puesta en marcha

Requisitos en cualquier sistema operativo, incluido Windows: **Docker Desktop**, **Node.js 22** y **Git**. La base de datos, pgAudit, la aplicación y todas sus herramientas corren en contenedores; no hace falta instalar PostgreSQL ni usar WSL. Los comandos son los mismos en PowerShell, macOS y Linux.

```powershell
npm ci
npm run configurar          # crea .env con contraseñas aleatorias seguras
npm run sistema:iniciar     # construye e inicia la base de datos y la aplicación
npm run db:preparar         # migraciones y cuenta de la aplicación
npm run db:semillas         # datos ficticios de demostración (opcional)
npm run db:itinerario       # vuelos de los próximos 2 meses (opcional, repetible)
npm run prueba:aceptacion   # Sprints 1 a 5 (169 verificaciones) y reporte de la Tabla 42
npm run prueba:rendimiento  # usuarios concurrentes: registro de la Tabla 50
npm run evidencia:git       # ramas, commits y convención (NC-04)
```

El sistema queda en **http://localhost:3000**. Para publicarlo en un enlace https temporal (por ejemplo, para el equipo auditor):

```powershell
npm run enlace              # imprime https://….trycloudflare.com
npm run enlace:cerrar       # lo cierra
```

El enlace funciona mientras la computadora y Docker estén encendidos, y cambia cada vez que se inicia.

Documentación: [Sprint 1](docs/sprint-1.md) (usuarios, roles y seguridad; cuentas de demostración), [Sprints 2 a 4](docs/sprints-2-a-4.md) (catálogos, vuelos y reservaciones), [Sprint 5](docs/sprint-5.md) (pagos, check-in y reportes), [atención de la auditoría de la Etapa 2](docs/auditoria-etapa-2.md), [flujo de Git](docs/git-flujo.md) y [base de datos](docs/base-de-datos.md) (roles, contrato con el backend, auditoría, respaldos y expediente).

## Estructura

```
src/               Backend NestJS: autorización, sesiones, usuarios, catálogos, vuelos,
                   reservaciones, pagos, check-in, reportes, bitácora y páginas
publico/           Pantallas (HTML, CSS y JavaScript sin dependencias externas)
pruebas-aceptacion/ Pruebas de aceptación por sprint, por HTTP
scripts/           Configuración del .env y enlace público
db/
  migrations/      Migraciones versionadas: esquema, bitácora, operaciones, reportes,
                   privilegios y políticas de auditoría
  pruebas/         Reglas, privilegios, operaciones, concurrencia y auditoría
  respaldos/       Respaldo cifrado y prueba de restauración (sección 31)
  semillas/        Datos ficticios de demostración
  servidor/        Imagen de PostgreSQL con pgAudit y su configuración
  migrar.sh        Ejecutor de migraciones con control de versiones
  crear_cuentas.sh Cuentas de base de datos sin exponer contraseñas
  probar.sh        Batería completa de pruebas de la base de datos
docs/              Documentación técnica
src/
  comun/           Servicios transversales (autorización, bitácora, validación)
  modulos/         Un módulo por componente funcional M-01 a M-09
.github/           Integración continua y plantillas de pull request, defecto y cambio
```

## Dónde vive cada control del manual

| Control del manual                                 | Implementación                                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| V-01 a V-12, RN-01 a RN-11 (secciones 13.9 y 19.2) | Restricciones y disparadores en `db/migrations/001`, cada uno comentado con su clave                                         |
| RF-11, RNF-07, R-01 concurrencia de asientos       | `crear_reservacion` con bloqueo pesimista, índice `reservacion_asiento_activo_uq` y prueba `db/pruebas/concurrencia_rf11.sh` |
| RNF-03, S-01 contraseñas cifradas                  | `contrasena_hash` solo acepta resúmenes Argon2id y la aplicación no puede leerla                                             |
| RF-17, RN-10, CA-11 bitácora                       | Disparadores que registran toda alta, modificación y baja con el usuario de la aplicación; la bitácora es de solo inserción  |
| S-07, S-09 menor privilegio en la base de datos    | Migración 005: la aplicación no borra, no altera la estructura y solo registra transacciones mediante funciones              |
| S-12 no repudio en la base de datos                | Políticas pgAudit AUD-01 a AUD-08 (migración 006)                                                                            |
| RNF-10, OC-10, KPI-12 respaldos y RTO              | `db/respaldos/`: respaldo cifrado y prueba de restauración cronometrada                                                      |
| RNF-04, S-06, S-09 rol verificado en el servidor   | `RolesGuard` global con denegación por defecto (`src/comun/autorizacion/`)                                                   |
| S-11 consultas parametrizadas                      | Regla de ESLint que rechaza SQL interpolado o concatenado                                                                    |
| RNF-08 complejidad ciclomática ≤ 10                | Regla `complexity` de ESLint                                                                                                 |
| 14.1 nomenclatura, 14.2 formato y valores mágicos  | ESLint, Prettier y `.editorconfig`                                                                                           |
| 15 líneas base del esquema                         | `db/migrar.sh`: versión, hash SHA-256 y cuenta que aplicó cada migración                                                     |
| 15.4 commits con clave trazable                    | `commitlint.config.mjs`, verificado en cada pull request                                                                     |
| 16.2 solicitud de cambio                           | Plantilla de issue _Solicitud de cambio_                                                                                     |
| 20.3 y 20.4 registro de defectos                   | Plantilla de issue _Defecto_                                                                                                 |
| KPI-09 vulnerabilidades críticas                   | `npm audit` en la integración continua                                                                                       |

## Evidencia que genera el repositorio

Cada pull request conserva la revisión por pares, el resultado de la integración continua y la trazabilidad con el requisito. Cada ejecución de la integración continua guarda el reporte de cobertura durante 90 días. Para la auditoría, exporte estos registros al expediente correspondiente antes de que caduquen.

La base de datos genera además su propia evidencia: la tabla `esquema_version` (qué migración se aplicó, cuándo y con qué cuenta), la bitácora de negocio, el registro de pgAudit en el servidor, la bitácora de respaldos (`bitacora_respaldos.csv`, Tabla 68) y un registro `evidencias/restauracion/PR-xx.md` por cada prueba de restauración (Tabla 67), listo para la firma del responsable de calidad.

Consulte [CONTRIBUTING.md](CONTRIBUTING.md) para el flujo de trabajo y la configuración obligatoria de GitHub.
