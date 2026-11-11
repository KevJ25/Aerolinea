import {
    api,
    chip,
    el,
    filaVacia,
    formatoFecha,
    formatoFechaHora,
    formatoMoneda,
    hoyMexico,
    montarEncabezado,
    mostrarMensaje,
    ocultar,
} from './comun.js';

await montarEncabezado();
const filtros = document.getElementById('filtros');
const mensaje = document.getElementById('mensaje');
const sumarDias = (fecha, dias) =>
    new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);
const hoy = hoyMexico();
let tipo = 'ocupacion';
let ultimo = null;

const porcentaje = (valor, total) => (total ? `${((100 * valor) / total).toFixed(1)} %` : '—');
function barra(valor) {
    const pista = el(
        'div',
        { class: 'barra-ocupacion__pista' },
        el('div', { class: 'barra-ocupacion__valor' }),
    );
    pista.firstChild.style.width = `${Math.min(100, valor)}%`;
    return el(
        'div',
        { class: 'barra-ocupacion' },
        pista,
        el('span', { class: 'numerico', texto: `${valor.toFixed(1)} %` }),
    );
}

/** Definición de cada reporte: columnas, celdas, totales y texto del periodo */
const REPORTES = {
    ocupacion: {
        titulo: 'Ocupación por vuelo',
        etiquetas: ['Salida desde', 'Salida hasta'],
        periodo: () => [hoy, sumarDias(hoy, 6)],
        columnas: [
            'Vuelo',
            'Ruta',
            'Salida',
            'Estado',
            'Asientos',
            'Apartados',
            'Vendidos',
            'Ocupación',
        ],
        fila: (f) => [
            f.numeroVuelo,
            `${f.origen} – ${f.destino}`,
            formatoFechaHora(f.salida),
            chip(f.estadoVuelo),
            f.asientosTotales,
            f.asientosApartados,
            f.asientosVendidos,
            barra(f.porcentajeOcupacion),
        ],
        csv: (f) => [
            f.numeroVuelo,
            f.origen,
            f.destino,
            f.salida,
            f.estadoVuelo,
            f.asientosTotales,
            f.asientosApartados,
            f.asientosVendidos,
            f.porcentajeOcupacion,
        ],
        encabezadoCsv: [
            'vuelo',
            'origen',
            'destino',
            'salida',
            'estado',
            'asientos',
            'apartados',
            'vendidos',
            'porcentaje_ocupacion',
        ],
        totales: (t) => [
            `${t.vuelos} vuelos`,
            '',
            '',
            '',
            t.asientosTotales,
            t.asientosApartados,
            t.asientosVendidos,
            porcentaje(t.asientosApartados + t.asientosVendidos, t.asientosTotales),
        ],
    },
    reservaciones: {
        titulo: 'Reservaciones por periodo',
        etiquetas: ['Creadas desde', 'Creadas hasta'],
        periodo: () => [sumarDias(hoy, -29), hoy],
        columnas: [
            'Fecha',
            'Total',
            'Confirmadas',
            'Pagadas',
            'Abordadas',
            'Canceladas',
            'Expiradas',
        ],
        fila: (f) => [
            formatoFecha(`${f.fecha}T12:00:00`),
            f.total,
            f.confirmadas,
            f.pagadas,
            f.abordadas,
            f.canceladas,
            f.expiradas,
        ],
        csv: (f) => [
            f.fecha,
            f.total,
            f.confirmadas,
            f.pagadas,
            f.abordadas,
            f.canceladas,
            f.expiradas,
        ],
        encabezadoCsv: [
            'fecha',
            'total',
            'confirmadas',
            'pagadas',
            'abordadas',
            'canceladas',
            'expiradas',
        ],
        totales: (t) => [
            'Total',
            t.total,
            t.confirmadas,
            t.pagadas,
            t.abordadas,
            t.canceladas,
            t.expiradas,
        ],
    },
    pagos: {
        titulo: 'Pagos registrados',
        etiquetas: ['Registrados desde', 'Registrados hasta'],
        periodo: () => [sumarDias(hoy, -29), hoy],
        columnas: ['Fecha', 'Pagos aprobados', 'Monto aprobado', 'Pagos rechazados'],
        fila: (f) => [
            formatoFecha(`${f.fecha}T12:00:00`),
            f.pagosAprobados,
            formatoMoneda(f.montoAprobado),
            f.pagosRechazados,
        ],
        csv: (f) => [f.fecha, f.pagosAprobados, f.montoAprobado.toFixed(2), f.pagosRechazados],
        encabezadoCsv: ['fecha', 'pagos_aprobados', 'monto_aprobado_mxn', 'pagos_rechazados'],
        totales: (t) => [
            'Total',
            t.pagosAprobados,
            formatoMoneda(t.montoAprobado),
            t.pagosRechazados,
        ],
    },
};

const celda = (valor) =>
    el(
        'td',
        { class: typeof valor === 'number' ? 'numerico derecha' : undefined },
        valor instanceof Node ? valor : String(valor),
    );

async function generar() {
    ocultar(mensaje);
    const definicion = REPORTES[tipo];
    const consulta = new URLSearchParams({
        desde: filtros.desde.value,
        hasta: filtros.hasta.value,
    });
    try {
        const datos = await api(`/api/reportes/${tipo}?${consulta}`);
        ultimo = datos;
        document.getElementById('titulo-reporte').textContent =
            `${definicion.titulo} · ${formatoFecha(`${datos.desde}T12:00:00`)} a ${formatoFecha(`${datos.hasta}T12:00:00`)}`;
        document.getElementById('encabezado').replaceChildren(
            el(
                'tr',
                {},
                definicion.columnas.map((c) => el('th', { scope: 'col', texto: c })),
            ),
        );
        document
            .getElementById('filas')
            .replaceChildren(
                ...(datos.filas.length
                    ? datos.filas.map((f) => el('tr', {}, definicion.fila(f).map(celda)))
                    : [filaVacia(definicion.columnas.length, 'No hay registros en el periodo.')]),
            );
        document
            .getElementById('totales')
            .replaceChildren(
                datos.filas.length
                    ? el('tr', {}, definicion.totales(datos.totales).map(celda))
                    : '',
            );
        document.getElementById('pie').textContent =
            `Generado el ${formatoFechaHora(datos.generadoEn)} directamente de los registros vigentes en la base de datos (CA-10). Horas del centro de México.`;
    } catch (error) {
        mostrarMensaje(mensaje, 'error', error.message);
    }
}

function elegir(nuevo) {
    tipo = nuevo;
    document
        .querySelectorAll('[data-reporte]')
        .forEach((b) => b.setAttribute('aria-selected', String(b.dataset.reporte === tipo)));
    const definicion = REPORTES[tipo];
    [filtros.desde.value, filtros.hasta.value] = definicion.periodo();
    document.getElementById('etiqueta-desde').textContent = definicion.etiquetas[0];
    document.getElementById('etiqueta-hasta').textContent = definicion.etiquetas[1];
    generar();
}

/** CSV con BOM para que Excel respete los acentos */
function descargarCsv() {
    if (!ultimo) return;
    const definicion = REPORTES[tipo];
    const escapar = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lineas = [definicion.encabezadoCsv, ...ultimo.filas.map(definicion.csv)].map((fila) =>
        fila.map(escapar).join(','),
    );
    const archivo = new Blob([`\uFEFF${lineas.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const enlace = el('a', {
        href: URL.createObjectURL(archivo),
        download: `reporte-${tipo}-${ultimo.desde}-a-${ultimo.hasta}.csv`,
    });
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
    // Se libera después: hacerlo de inmediato puede cancelar la descarga
    setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

document
    .querySelectorAll('[data-reporte]')
    .forEach((b) => b.addEventListener('click', () => elegir(b.dataset.reporte)));
filtros.addEventListener('submit', (evento) => {
    evento.preventDefault();
    generar();
});
document.getElementById('csv').addEventListener('click', descargarCsv);
document.getElementById('imprimir').addEventListener('click', () => window.print());
elegir('ocupacion');
