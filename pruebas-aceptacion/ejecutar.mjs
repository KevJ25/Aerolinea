// =============================================================================
// Pruebas de aceptación por sprint
//   npm run prueba:aceptacion            ejecuta los Sprints 1 a 5
//   npm run prueba:aceptacion -- 2 3     ejecuta solo los indicados
//
// Requiere el sistema en ejecución (SGA_URL, por omisión http://127.0.0.1:3000)
// y una conexión administrativa a la base (variables PG* del archivo .env) para
// preparar datos y verificar lo almacenado. Los usuarios que crea usan el
// dominio @prueba-aceptacion.mx; los aeropuertos, códigos IATA aleatorios libres.
// =============================================================================
import pg from 'pg';
import { BASE, iniciarSprint, resumen, verificaciones } from './comun.mjs';
import { generarReporte } from './reporte.mjs';

const SPRINTS = {
    1: './sprint1.mjs',
    2: './sprint2.mjs',
    3: './sprint3.mjs',
    4: './sprint4.mjs',
    5: './sprint5.mjs',
};
const elegidos = process.argv.slice(2).filter((s) => SPRINTS[s]);
const aEjecutar = elegidos.length ? elegidos : Object.keys(SPRINTS);

const inicio = new Date();
const bd = new pg.Client();
try {
    await bd.connect();
    console.log(`Sistema: ${BASE} · Sprints: ${aEjecutar.join(', ')}`);
    for (const sprint of aEjecutar) {
        iniciarSprint(sprint);
        const modulo = await import(SPRINTS[sprint]);
        await modulo.ejecutar(bd);
    }
} catch (error) {
    console.error(`\nLa prueba no pudo completarse: ${error.message}`);
    process.exitCode = 1;
} finally {
    await bd.end();
}

const { exitos, fallas } = resumen();
// [NC-01] Reporte de ejecución con el formato de la Tabla 42 y KPI-02
const reporte = generarReporte(verificaciones(), inicio);
console.log(`\nReporte de ejecución (Tabla 42): ${reporte.ruta}`);
console.log(
    `KPI-02 cobertura de ejecución: ${reporte.kpi02.toFixed(1)} % (${reporte.ejecutados} de ${reporte.planificados} casos)`,
);
console.log(`\n${exitos} verificaciones correctas, ${fallas} fallas.`);
if (fallas > 0 || process.exitCode === 1) {
    process.exitCode = 1;
} else {
    console.log(`Prueba de aceptación de los Sprints ${aEjecutar.join(', ')} superada.`);
}
