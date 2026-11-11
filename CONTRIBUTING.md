# Guía de contribución

Este documento aplica las secciones 11, 14, 15 y 16 del Manual de Calidad MC-SGA-001 al trabajo diario en el repositorio. Todo lo que aquí se describe deja evidencia auditable en GitHub.

## Ramas (sección 15.1, Figura 20)

| Rama            | Propósito                                | Ambiente (Tabla 25) | Recibe cambios de        |
| --------------- | ---------------------------------------- | ------------------- | ------------------------ |
| `main`          | Versión entregada y de demostración      | Demostración        | `release/*` y `hotfix/*` |
| `release/x.y.z` | Estabilización para pruebas de sistema   | Calidad (QA)        | `develop`                |
| `develop`       | Integración continua de lo terminado     | Integración         | `feature/*` y `fix/*`    |
| `feature/*`     | Una historia de usuario o requisito      | Desarrollo          | Trabajo individual       |
| `fix/*`         | Corrección de un defecto registrado      | Desarrollo          | Trabajo individual       |
| `hotfix/*`      | Corrección urgente sobre lo ya entregado | Demostración        | `main`                   |

Los nombres siguen la convención `tipo/descripcion-breve` de la Tabla 22, por ejemplo `feature/reserva-asiento` o `fix/def-03-iata`.

## Mensajes de commit (sección 15.4)

```
tipo(CLAVE): descripción en minúsculas
```

La clave enlaza el commit con lo que atiende: `RF-xx`, `RNF-xx`, `DEF-xx`, `SC-xx` o `HU-xx`. Se admiten varias separadas por coma. Ejemplos válidos:

```
feat(RF-11): bloqueo de asiento en reserva concurrente
fix(DEF-03): corrige la validación del código IATA
test(RF-10,RF-11): agrega prueba de concurrencia CP-19
docs(SC-02): actualiza la matriz de trazabilidad
```

La clave `base` se reserva para infraestructura del repositorio que no atiende un requisito (por ejemplo, configurar la integración continua). Usarla para código funcional es una desviación.

Los tipos permitidos son los de Conventional Commits: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`, `ci`, `build`, `perf`, `style`, `revert`. La integración continua rechaza cualquier pull request con un commit fuera de la convención.

## Pull requests y revisión por pares (sección 14.4)

1. Abra el pull request hacia `develop` y llene la plantilla completa: trazabilidad, definición de terminado y controles de seguridad.
2. La integración continua debe pasar: formato, análisis estático, compilación, pruebas unitarias, auditoría de dependencias, reglas de la base de datos y mensajes de commit.
3. Otra persona del equipo revisa y aprueba. **Quien escribió el código no puede aprobarlo** (sección 5.2).
4. Los comentarios de revisión se resuelven en el propio pull request; quedan como evidencia de la revisión por pares.

## Configuración obligatoria de GitHub

Esto se configura una sola vez y protege lo que el manual promete. Hágalo antes del primer commit funcional y conserve una captura de pantalla como evidencia de la sección 15.

En **Settings › Branches › Add branch ruleset**, cree una regla para `main` y otra para `develop` con:

- Require a pull request before merging
- Required approvals: 1
- Dismiss stale pull request approvals when new commits are pushed
- Require approval of the most recent reviewable push (impide aprobar el propio código)
- Require status checks to pass: `Análisis estático y pruebas unitarias`, `Base de datos, auditoría, respaldos y aceptación`, `Mensajes de commit trazables`
- Require branches to be up to date before merging
- Block force pushes
- Restrict deletions

En **Settings › General › Pull Requests**, deje activa solo la opción _Allow squash merging_ con el mensaje predeterminado _Pull request title_, para que el historial de `develop` conserve un commit trazable por cambio. El título del pull request debe seguir la misma convención de commits.

En **Settings › Code security**, active _Dependabot alerts_ y _Secret scanning_.

## Defectos y solicitudes de cambio

- Un defecto se registra con la plantilla **Defecto** (secciones 20.3 y 20.4). El folio `DEF-xx` es el número que se usa en la rama y en los commits.
- Un cambio sobre un requisito aprobado o la arquitectura requiere primero una **Solicitud de cambio** (sección 16.2) autorizada por el rol que indica la Tabla 26. Sin la autorización registrada, el pull request no se aprueba.

## Estándares de código (sección 14)

El análisis estático verifica automáticamente nomenclatura, complejidad ciclomática menor o igual a 10, funciones de 50 líneas como máximo, ausencia de valores mágicos, ausencia de SQL concatenado y uso de `console`. Lo que no se puede verificar con herramientas se revisa en el pull request: que los métodos empiecen con verbo, que cada clase tenga una sola responsabilidad y que los algoritmos críticos estén comentados.

Ejecute lo mismo que la integración continua antes de subir cambios:

```bash
npm run formato && npm run lint && npm run build && npm test
```
