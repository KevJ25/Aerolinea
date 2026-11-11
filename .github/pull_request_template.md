## Qué cambia

<!-- Describe el cambio en una o dos frases. -->

## Trazabilidad

| Clave | Tipo                         | Caso de prueba | Criterio de aceptación |
| ----- | ---------------------------- | -------------- | ---------------------- |
| RF-__ | Requisito / Defecto / Cambio | CP-__          | CA-__                  |

Solicitud de cambio aprobada (si modifica un requisito o la arquitectura): SC-__

## Definición de terminado (sección 11.2)

- [ ] El código respeta los estándares de la sección 14 (el análisis estático pasa en CI)
- [ ] Las pruebas unitarias del cambio existen y pasan
- [ ] El criterio de aceptación CA-__ está verificado
- [ ] La documentación afectada está actualizada (manual, matriz de trazabilidad, diagramas)
- [ ] Los riesgos relacionados se revisaron en la bitácora de riesgos

## Seguridad (sección 18)

- [ ] Las entradas del usuario se validan en el servidor (S-10)
- [ ] Las consultas a la base de datos son parametrizadas (S-11)
- [ ] Toda ruta nueva declara `@Roles(...)` o `@Publico()` justificado (S-06, S-09)
- [ ] Los mensajes de error no exponen información interna (S-13)
- [ ] Las altas, modificaciones y bajas se registran en la bitácora (S-12)

## Revisión por pares

La persona que revisa no puede ser quien escribió el código (sección 5.2).
