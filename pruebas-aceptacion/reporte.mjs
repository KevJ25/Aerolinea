// =============================================================================
// Reporte de ejecución de pruebas con el formato de la Tabla 42 (NC-01, Etapa 2)
// Lo genera automáticamente pruebas-aceptacion/ejecutar.mjs al terminar.
//
// Une cuatro fuentes:
//   - las verificaciones de la prueba de aceptación, agrupadas por caso CP-nn
//   - el último registro de rendimiento (Tabla 50), si existe
//   - la última medición de disponibilidad (CP-22), si existe
//   - el último registro de prueba de restauración PR-xx (CP-29), si existe
// y calcula KPI-02 (cobertura de ejecución de pruebas).
// =============================================================================
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CASOS } from './catalogo-casos.mjs';

const DIRECTORIO = 'evidencias/pruebas';
const RESTAURACION = 'evidencias/restauracion';
const META_KPI_02 = 95;

function leerJson(ruta) {
    return existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : null;
}

function ultimaRestauracion() {
    if (!existsSync(RESTAURACION)) return null;
    const archivos = readdirSync(RESTAURACION)
        .filter((a) => /^PR-.*\.md$/.test(a))
        .sort();
    if (!archivos.length) return null;
    const archivo = archivos[archivos.length - 1];
    const texto = readFileSync(`${RESTAURACION}/${archivo}`, 'utf8');
    return { archivo, exitoso: /\| Resultado \| Exitoso \|/.test(texto) };
}

/** Resultado de un caso según cómo se evalúa */
function evaluar(caso, verificaciones, rendimiento, disponibilidad, restauracion) {
    if (caso.evaluacion === 'aceptacion') {
        const propias = verificaciones.filter((v) => v.casos.includes(caso.cp));
        if (!propias.length)
            return { resultado: 'No ejecutado', evidencia: 'Sin verificaciones en esta corrida' };
        const fallidas = propias.filter((v) => !v.correcta);
        const sprints = [...new Set(propias.map((v) => v.sprint))].join(', ');
        return {
            resultado: fallidas.length ? 'Fallido' : 'Aprobado',
            evidencia: `Aceptación, sprint ${sprints}: ${propias.length - fallidas.length}/${propias.length} verificaciones`,
            detalle: propias,
        };
    }
    if (caso.evaluacion === 'rendimiento') {
        const r = rendimiento?.resultados.find((x) => x.cp === caso.cp);
        if (!r) return { resultado: 'Pendiente', evidencia: 'Ejecutar npm run prueba:rendimiento' };
        return {
            resultado: r.veredicto,
            evidencia: `${rendimiento.archivo}: p95 ${(r.p95 / 1000).toFixed(3)} s, ${r.errores} errores`,
            fecha: rendimiento.fecha,
        };
    }
    if (caso.evaluacion === 'restauracion') {
        if (!restauracion)
            return { resultado: 'Pendiente', evidencia: 'Ejecutar npm run db:probar-restauracion' };
        return {
            resultado: restauracion.exitoso ? 'Aprobado' : 'Fallido',
            evidencia: `evidencias/restauracion/${restauracion.archivo}`,
        };
    }
    if (caso.cp === 'CP-22' && disponibilidad) {
        return {
            resultado: disponibilidad.veredicto,
            evidencia: `${disponibilidad.archivo}: ${disponibilidad.porcentaje.toFixed(2)} % en ${disponibilidad.horas} h`,
            fecha: disponibilidad.fecha,
        };
    }
    return { resultado: 'No evaluable en la fase actual', evidencia: caso.motivo };
}

const fechaCorta = (iso) =>
    new Date(iso).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });

export function generarReporte(verificaciones, inicio) {
    const rendimiento = leerJson(`${DIRECTORIO}/rendimiento-ultimo.json`);
    const disponibilidad = leerJson(`${DIRECTORIO}/disponibilidad-ultimo.json`);
    const restauracion = ultimaRestauracion();
    const responsable = process.env.SGA_RESPONSABLE ?? 'Equipo de desarrollo';
    const filas = CASOS.map((caso) => ({
        caso,
        ...evaluar(caso, verificaciones, rendimiento, disponibilidad, restauracion),
    }));
    const ejecutados = filas.filter((f) => f.resultado === 'Aprobado' || f.resultado === 'Fallido');
    const aprobados = filas.filter((f) => f.resultado === 'Aprobado');
    const kpi02 = (100 * ejecutados.length) / CASOS.length;
    const marca = inicio.toISOString().slice(0, 16).replace(/[-:T]/g, '');

    const tabla = filas.map(({ caso, resultado, evidencia, fecha }) => {
        const defecto = resultado === 'Fallido' ? 'D-__ (registrar)' : '—';
        return `| ${caso.cp} | ${caso.requisito} | ${caso.nombre} | ${resultado === 'Pendiente' || resultado.startsWith('No') ? '—' : fechaCorta(fecha ?? inicio)} | ${resultado === 'Pendiente' || resultado.startsWith('No') ? '—' : responsable} | ${resultado} | ${defecto} | ${evidencia} |`;
    });
    const detalle = filas
        .filter((f) => f.detalle)
        .map((f) =>
            [
                `### ${f.caso.cp} · ${f.caso.nombre}`,
                '',
                ...f.detalle.map(
                    (v) =>
                        `- ${v.correcta ? 'Correcta' : 'FALLIDA'}: ${v.descripcion}${v.detalle ? ` (${v.detalle})` : ''}`,
                ),
                '',
            ].join('\n'),
        );

    const documento = [
        '# Reporte de ejecución de pruebas (formato de la Tabla 42)',
        '',
        `Generado el ${inicio.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })} por ${responsable} con \`npm run prueba:aceptacion\`. Sistema: ${process.env.SGA_URL ?? 'http://127.0.0.1:3000'}.`,
        '',
        '## Resumen',
        '',
        `| Casos planificados | Ejecutados | Aprobados | Fallidos | Pendientes o no evaluables | KPI-02 cobertura de ejecución | Meta |`,
        `| --- | --- | --- | --- | --- | --- | --- |`,
        `| ${CASOS.length} | ${ejecutados.length} | ${aprobados.length} | ${ejecutados.length - aprobados.length} | ${CASOS.length - ejecutados.length} | ${kpi02.toFixed(1)} % | ≥ ${META_KPI_02} % |`,
        '',
        '## Reporte de ejecución',
        '',
        '| CP | Requisito | Caso | Fecha | Ejecutó | Resultado | Defecto | Evidencia |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
        ...tabla,
        '',
        'CP-23, CP-28 y CP-30 no existen en el manual. CP-14 se define en la versión 2.1. Un caso "No evaluable en la fase actual" se documenta conforme al Plan de auditoría §9.3.',
        '',
        '## Anexo · Verificaciones por caso',
        '',
        ...detalle,
    ].join('\n');

    mkdirSync(DIRECTORIO, { recursive: true });
    const ruta = `${DIRECTORIO}/reporte-ejecucion-${marca}.md`;
    writeFileSync(ruta, `${documento}\n`);
    const csv = [
        'cp,requisito,caso,resultado,evidencia',
        ...filas.map(({ caso, resultado, evidencia }) =>
            [caso.cp, caso.requisito, caso.nombre, resultado, evidencia]
                .map((v) => `"${String(v).replace(/"/g, '""')}"`)
                .join(','),
        ),
    ];
    writeFileSync(`${DIRECTORIO}/reporte-ejecucion-${marca}.csv`, `\uFEFF${csv.join('\r\n')}\r\n`);
    return { ruta, kpi02, ejecutados: ejecutados.length, planificados: CASOS.length };
}
