// =============================================================================
// Monitor de disponibilidad · CP-22 (RNF-02, KPI-08: ≥ 99 %)
//   npm run prueba:disponibilidad -- 8      (horas; por omisión 1)
//
// Consulta /salud cada 30 segundos durante el periodo indicado y calcula el
// porcentaje de respuestas correctas. Deje la computadora encendida y sin
// suspensión durante la medición. El resultado se guarda en evidencias/pruebas/.
// =============================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as esperar } from 'node:timers/promises';

const BASE = process.env.SGA_URL ?? 'http://127.0.0.1:3000';
const HORAS = Number(process.argv[2] ?? 1);
const INTERVALO_MS = 30_000;
const LIMITE_RESPUESTA_MS = 5000;
const DIRECTORIO = 'evidencias/pruebas';

const inicio = new Date();
const fin = inicio.getTime() + HORAS * 3_600_000;
let total = 0;
let correctas = 0;
const caidas = [];
console.log(
    `Midiendo la disponibilidad de ${BASE} durante ${HORAS} h (una consulta cada 30 s). No suspenda la computadora.`,
);

while (Date.now() < fin) {
    total += 1;
    try {
        const respuesta = await fetch(`${BASE}/salud`, {
            signal: AbortSignal.timeout(LIMITE_RESPUESTA_MS),
        });
        if (respuesta.ok) correctas += 1;
        else caidas.push(new Date().toISOString());
    } catch {
        caidas.push(new Date().toISOString());
    }
    if (total % 20 === 0)
        console.log(
            `${total} consultas · disponibilidad ${((100 * correctas) / total).toFixed(2)} %`,
        );
    await esperar(INTERVALO_MS);
}

const porcentaje = (100 * correctas) / total;
const veredicto = porcentaje >= 99 ? 'Aprobado' : 'Fallido';
const marca = inicio.toISOString().slice(0, 16).replace(/[-:T]/g, '');
const documento = [
    '# Medición de disponibilidad (CP-22, KPI-08)',
    '',
    `| Inicio | Duración | Consultas | Correctas | Disponibilidad | Meta | Veredicto |`,
    `| --- | --- | --- | --- | --- | --- | --- |`,
    `| ${inicio.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })} | ${HORAS} h | ${total} | ${correctas} | ${porcentaje.toFixed(2)} % | ≥ 99 % | ${veredicto} |`,
    '',
    caidas.length ? `Consultas fallidas: ${caidas.join(', ')}` : 'No hubo consultas fallidas.',
].join('\n');
mkdirSync(DIRECTORIO, { recursive: true });
writeFileSync(`${DIRECTORIO}/disponibilidad-${marca}.md`, `${documento}\n`);
writeFileSync(
    `${DIRECTORIO}/disponibilidad-ultimo.json`,
    JSON.stringify(
        {
            fecha: inicio.toISOString(),
            horas: HORAS,
            total,
            correctas,
            porcentaje,
            veredicto,
            archivo: `disponibilidad-${marca}.md`,
        },
        null,
        2,
    ),
);
console.log(
    `\nDisponibilidad: ${porcentaje.toFixed(2)} % · ${veredicto} · ${DIRECTORIO}/disponibilidad-${marca}.md`,
);
