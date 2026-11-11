# Flujo de trabajo en Git (NC-04)

Aplica las secciones 14.1 (Tabla 22) y 15.1 a 15.4 (Figura 20) del Manual de Calidad. Al terminar, `npm run evidencia:git` genera el documento que se entrega al equipo auditor.

## 1. Si la carpeta todavía no es un repositorio

```powershell
git init -b main
git add -A
git commit -m "chore(base): estructura inicial del sistema"
git remote add origin https://github.com/USUARIO/REPOSITORIO.git
git push -u origin main
```

Revisen antes con `git status` que **no** aparezcan `.env`, `respaldos\` ni `evidencias\expediente_bd_*`; el `.gitignore` ya los excluye.

## 2. Crear la rama de integración

```powershell
git checkout -b develop
git push -u origin develop
```

## 3. Cada cambio en su propia rama

Una rama por requisito, defecto o solicitud de cambio, con el nombre de la Tabla 22:

```powershell
git checkout develop
git pull
git checkout -b feature/rf-13-pagos
# ... cambios ...
git add -A
git commit -m "feat(RF-13,RF-14): pago simulado con validación de tarifa"
git push -u origin feature/rf-13-pagos
```

En GitHub abran un **pull request hacia `develop`**. Lo revisa y aprueba otra persona del equipo (sección 5.2) y la integración continua debe pasar. Después se fusiona.

Ejemplos de mensajes válidos (sección 15.4):

| Tipo de cambio                  | Mensaje                                                 |
| ------------------------------- | ------------------------------------------------------- |
| Nueva función                   | `feat(RF-15): check-in con pase de abordar`             |
| Corrección de un defecto        | `fix(DEF-03): validación del código IATA`               |
| Pruebas                         | `test(RF-11): prueba de concurrencia CP-11`             |
| Manual o documentación          | `docs(SC-003): manual de calidad versión 2.1`           |
| Infraestructura del repositorio | `chore(base): configuración de la integración continua` |

## 4. Líneas base y entrega

Cuando `develop` está listo para entregarse:

```powershell
git checkout develop
git pull
git checkout -b release/1.0.0
git push -u origin release/1.0.0
```

Pull request de `release/1.0.0` hacia `main`. Al fusionarlo, se etiqueta la línea base:

```powershell
git checkout main
git pull
git tag -a LB-3 -m "Línea base 3: entrega final"
git push origin LB-3
```

## 5. Evidencia para la auditoría

```powershell
npm run evidencia:git
```

Genera `evidencias\git\evidencia-git-<fecha>.md` con las ramas, la verificación del flujo, las etiquetas de línea base, el grafo del historial y la revisión de cada mensaje de commit. Acompáñenlo con capturas de GitHub de la lista de ramas y de un pull request revisado.

## Sobre el historial anterior

No reconstruyan el historial de los sprints anteriores con fechas o ramas ficticias. Si el código de los primeros sprints se integró en pocos commits, digan exactamente eso al equipo auditor y muestren que el flujo se aplica desde ahora. Fabricar evidencia convertiría una no conformidad menor en una mayor.
