// =============================================================================
// Pruebas de rendimiento · Manual §23 (Tabla 49) · formato de la Tabla 50
//   npm run prueba:rendimiento
//
// Simula usuarios concurrentes con sesión iniciada contra el sistema en
// ejecución y mide, por caso: tiempo mínimo, medio, máximo, percentil 95 y
// errores no controlados (respuestas 5xx o fallas de conexión).
//
//   CP-21  Consulta de vuelos disponibles             ≤ 3 s  (RNF-01)
//   CP-35  Creación de una reservación completa       ≤ 3 s  (RNF-01)
//   CP-36  Registro de un pago                        ≤ 3 s  (RNF-01)
//   CP-37  Generación de un reporte de ocupación      ≤ 5 s  (RNF-01)
//   CP-38  Pico de solicitudes simultáneas            sin errores no controlados (RNF-02)
//
// Veredicto: Aprobado si el percentil 95 no supera el umbral y no hay errores.
// El resultado se guarda en evidencias/pruebas/ para el reporte de ejecución.
// Variables: SGA_URL, PG* (como la prueba de aceptación), SGA_USUARIOS (por omisión 20)
// =============================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import {
    BASE,
    exigir,
    fechaHoraEnDias,
    iataLibre,
    numeroVuelo,
    sesionDe,
    SUFIJO,
} from './comun.mjs';

const USUARIOS = Number(process.env.SGA_USUARIOS ?? 20);
const CONSULTAS_POR_USUARIO = 10;
const RONDAS_RESERVACION = 3;
const SOLICITUDES_PICO = 100;
const DIRECTORIO = 'evidencias/pruebas';

function estadisticas(muestras) {
    const tiempos = muestras.map((m) => m.ms).sort((a, b) => a - b);
    const p95 = tiempos[Math.max(0, Math.ceil(0.95 * tiempos.length) - 1)] ?? 0;
    return {
        solicitudes: tiempos.length,
        minimo: tiempos[0] ?? 0,
        medio: tiempos.reduce((t, v) => t + v, 0) / (tiempos.length || 1),
        maximo: tiempos[tiempos.length - 1] ?? 0,
        p95,
        errores: muestras.filter((m) => m.error).length,
    };
}

/** Ejecuta las tareas con la concurrencia indicada y registra tiempo y error de cada una */
async function medir(tareas, concurrencia) {
    const muestras = [];
    let siguiente = 0;
    async function trabajador() {
        while (siguiente < tareas.length) {
            const tarea = tareas[siguiente++];
            const inicio = performance.now();
            try {
                const estado = await tarea();
                muestras.push({ ms: performance.now() - inicio, error: estado >= 500 });
            } catch {
                muestras.push({ ms: performance.now() - inicio, error: true });
            }
        }
    }
    await Promise.all(Array.from({ length: concurrencia }, trabajador));
    return estadisticas(muestras);
}

async function preparar(bd) {
    const { navegador: admin } = await sesionDe(bd, 'admin-rend', 'Administrador');
    const ids = [];
    const codigos = [];
    for (const ciudad of ['Origen', 'Destino']) {
        const codigo = await iataLibre(bd);
        const r = await admin.pedir('/api/aeropuertos', {
            metodo: 'POST',
            cuerpo: { codigoIata: codigo, nombre: `Aeropuerto ${codigo}`, ciudad, pais: 'México' },
        });
        ids.push(exigir(r, 'registrar aeropuerto').idAeropuerto);
        codigos.push(codigo);
    }
    const ruta = exigir(
        await admin.pedir('/api/rutas', {
            metodo: 'POST',
            cuerpo: { idOrigen: ids[0], idDestino: ids[1] },
        }),
        'crear ruta',
    );
    const avion = exigir(
        await admin.pedir('/api/aviones', {
            metodo: 'POST',
            cuerpo: {
                matricula: `XR-${SUFIJO.slice(-6).toUpperCase()}`,
                modelo: 'Avión de rendimiento',
                capacidad: USUARIOS * RONDAS_RESERVACION + 12,
                estadoOperativo: 'DISPONIBLE',
            },
        }),
        'registrar avión',
    );
    const vuelo = exigir(
        await admin.pedir('/api/vuelos', {
            metodo: 'POST',
            cuerpo: {
                numeroVuelo: numeroVuelo('TR'),
                idRuta: ruta.idRuta,
                idAvion: avion.idAvion,
                salida: fechaHoraEnDias(7, '09:00'),
                llegada: fechaHoraEnDias(7, '11:30'),
                tarifa: 1999,
            },
        }),
        'programar vuelo',
    );
    const pasajeros = [];
    for (let i = 0; i < USUARIOS; i += 1)
        pasajeros.push((await sesionDe(bd, `rend${i}`, 'Pasajero')).navegador);
    return {
        admin,
        pasajeros,
        idVuelo: vuelo.idVuelo,
        origen: codigos[0],
        destino: codigos[1],
        fecha: fechaHoraEnDias(7).slice(0, 10),
    };
}

async function ejecutar(bd) {
    console.log(
        `Sistema: ${BASE} · ${USUARIOS} usuarios concurrentes\nPreparando datos de prueba...`,
    );
    const { admin, pasajeros, idVuelo, origen, destino, fecha } = await preparar(bd);
    const resultados = [];
    const registrar = (cp, operacion, umbralMs, concurrencia, datos) => {
        const veredicto =
            datos.errores === 0 && (umbralMs === null || datos.p95 <= umbralMs)
                ? 'Aprobado'
                : 'Fallido';
        resultados.push({ cp, operacion, umbralMs, concurrencia, ...datos, veredicto });
        console.log(
            `${cp}  ${operacion}: medio ${Math.round(datos.medio)} ms · p95 ${Math.round(datos.p95)} ms · errores ${datos.errores} · ${veredicto}`,
        );
    };

    // CP-21 Consulta de vuelos
    const consultas = pasajeros.flatMap((p) =>
        Array.from(
            { length: CONSULTAS_POR_USUARIO },
            () => async () =>
                (
                    await p.pedir(
                        `/api/vuelos/buscar?origen=${origen}&destino=${destino}&fecha=${fecha}`,
                    )
                ).estado,
        ),
    );
    registrar(
        'CP-21',
        'Consulta de vuelos disponibles',
        3000,
        USUARIOS,
        await medir(consultas, USUARIOS),
    );

    // CP-35 Reservación completa: consultar el mapa de asientos y reservar uno libre distinto por usuario
    const asientos = (await pasajeros[0].pedir(`/api/vuelos/${idVuelo}/asientos`)).datos.map(
        (s) => s.numero,
    );
    const codigos = pasajeros.map(() => []);
    const reservaciones = [];
    for (let ronda = 0; ronda < RONDAS_RESERVACION; ronda += 1) {
        pasajeros.forEach((p, i) => {
            const asiento = asientos[ronda * USUARIOS + i];
            reservaciones.push(async () => {
                await p.pedir(`/api/vuelos/${idVuelo}/asientos`);
                const r = await p.pedir('/api/reservaciones', {
                    metodo: 'POST',
                    cuerpo: { idVuelo, asiento },
                });
                if (r.estado === 201) codigos[i].push(r.datos.codigo);
                return r.estado;
            });
        });
    }
    registrar(
        'CP-35',
        'Creación de una reservación completa',
        3000,
        USUARIOS,
        await medir(reservaciones, USUARIOS),
    );

    // CP-36 Registro de pago de las reservaciones creadas
    const pagos = pasajeros.flatMap((p, i) =>
        codigos[i].slice(0, 2).map(
            (codigo) => async () =>
                (
                    await p.pedir(`/api/reservaciones/${codigo}/pago`, {
                        metodo: 'POST',
                        cuerpo: { monto: 1999, metodo: 'TARJETA_PRUEBA_APROBADA' },
                    })
                ).estado,
        ),
    );
    registrar('CP-36', 'Registro de un pago', 3000, USUARIOS, await medir(pagos, USUARIOS));

    // CP-37 Reporte de ocupación de dos meses
    const hasta = fechaHoraEnDias(60).slice(0, 10);
    const desde = fechaHoraEnDias(0).slice(0, 10);
    const reportes = Array.from(
        { length: 20 },
        () => async () =>
            (await admin.pedir(`/api/reportes/ocupacion?desde=${desde}&hasta=${hasta}`)).estado,
    );
    registrar(
        'CP-37',
        'Generación de un reporte de ocupación (60 días)',
        5000,
        5,
        await medir(reportes, 5),
    );

    // CP-38 Pico: solicitudes simultáneas mezcladas, todas a la vez
    const rutas = [
        `/api/vuelos/buscar?origen=${origen}&destino=${destino}&fecha=${fecha}`,
        `/api/vuelos/${idVuelo}/asientos`,
        '/api/vuelos/calendario',
        '/api/reservaciones/mias',
    ];
    const pico = Array.from(
        { length: SOLICITUDES_PICO },
        (_, i) => async () => (await pasajeros[i % USUARIOS].pedir(rutas[i % rutas.length])).estado,
    );
    registrar(
        'CP-38',
        `Pico de ${SOLICITUDES_PICO} solicitudes simultáneas`,
        null,
        SOLICITUDES_PICO,
        await medir(pico, SOLICITUDES_PICO),
    );

    return resultados;
}

function guardar(resultados, inicio) {
    const fecha = new Date();
    const marca = fecha.toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const ms = (v) => `${(v / 1000).toFixed(3)} s`;
    const filas = resultados.map(
        (r) =>
            `| ${r.cp} | ${r.operacion} | ${r.concurrencia} | ${r.solicitudes} | ${ms(r.minimo)} | ${ms(r.medio)} | ${ms(r.maximo)} | ${ms(r.p95)} | ${r.errores} | ${r.umbralMs === null ? 'Sin errores' : `≤ ${r.umbralMs / 1000} s`} | ${r.veredicto} |`,
    );
    const documento = [
        '# Registro de resultados de rendimiento (formato de la Tabla 50)',
        '',
        `Ejecutado el ${fecha.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })} contra ${BASE} por ${process.env.SGA_RESPONSABLE ?? 'el equipo de desarrollo'}. Duración: ${Math.round((Date.now() - inicio) / 1000)} s.`,
        '',
        '| CP | Operación | Usuarios concurrentes | Solicitudes | Tiempo mínimo | Tiempo medio | Tiempo máximo | Percentil 95 | Errores | Umbral | Veredicto |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        ...filas,
        '',
        'Veredicto: Aprobado si el percentil 95 no supera el umbral de RNF-01 y no hay errores no controlados (respuestas 5xx o fallas de conexión). Generado por `pruebas-aceptacion/rendimiento.mjs`.',
    ].join('\n');
    mkdirSync(DIRECTORIO, { recursive: true });
    writeFileSync(`${DIRECTORIO}/rendimiento-${marca}.md`, `${documento}\n`);
    writeFileSync(
        `${DIRECTORIO}/rendimiento-ultimo.json`,
        JSON.stringify(
            { fecha: fecha.toISOString(), archivo: `rendimiento-${marca}.md`, resultados },
            null,
            2,
        ),
    );
    return `${DIRECTORIO}/rendimiento-${marca}.md`;
}

const inicio = Date.now();
const bd = new pg.Client();
try {
    await bd.connect();
    const resultados = await ejecutar(bd);
    const archivo = guardar(resultados, inicio);
    console.log(`\nRegistro de rendimiento: ${archivo}`);
    if (resultados.some((r) => r.veredicto !== 'Aprobado')) process.exitCode = 1;
} catch (error) {
    console.error(`La prueba de rendimiento no pudo completarse: ${error.message}`);
    process.exitCode = 1;
} finally {
    await bd.end();
}
