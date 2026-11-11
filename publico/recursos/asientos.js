import {
    api,
    chip,
    el,
    formatoFechaHora,
    formatoMoneda,
    montarEncabezado,
    mostrarMensaje,
    ocultar,
} from './comun.js';

const ACTUALIZACION_MS = 5000;
const LETRAS_IZQUIERDA = ['A', 'B', 'C'];
const LETRAS_DERECHA = ['D', 'E', 'F'];

const sesion = await montarEncabezado();
const idVuelo = Number(window.location.pathname.split('/').pop());
const mensaje = document.getElementById('mensaje');
const cabina = document.getElementById('cabina');
const formReserva = document.getElementById('form-reserva');
const reservar = document.getElementById('reservar');
const puedeReservar = sesion.rol === 'Pasajero' || sesion.rol === 'Empleado';
let elegido = null;
let reservable = false;

// "Volver" regresa a la búsqueda con los mismos filtros, si se llegó desde ella
const volver = document.getElementById('volver');
const anterior = document.referrer ? new URL(document.referrer) : null;
if (
    anterior?.origin === window.location.origin &&
    ['/vuelos', '/admin/vuelos'].includes(anterior.pathname)
) {
    volver.href = anterior.pathname + anterior.search;
} else if (sesion.rol === 'Administrador') {
    volver.href = '/admin/vuelos';
}

const vuelo = await api(`/api/vuelos/${idVuelo}`);
document.getElementById('t-cabina').textContent = `Asientos del vuelo ${vuelo.numeroVuelo}`;
document.getElementById('capacidad').textContent =
    `${vuelo.modelo} · ${vuelo.asientosTotales} asientos`;
document.getElementById('r-origen').textContent = vuelo.origen;
document.getElementById('r-destino').textContent = vuelo.destino;
document.getElementById('r-vuelo').textContent = vuelo.numeroVuelo;
document.getElementById('r-salida').textContent = formatoFechaHora(vuelo.salida);
document.getElementById('r-llegada').textContent = formatoFechaHora(vuelo.llegada);
document.getElementById('r-estado').replaceChildren(chip(vuelo.estado));
document.getElementById('r-tarifa').textContent = formatoMoneda(vuelo.tarifa);
// [RN-12] La venta cierra 24 horas antes de la salida
const VENTA_CIERRA_MS = 24 * 60 * 60 * 1000;
const ventaAbierta = new Date(vuelo.salida).getTime() - VENTA_CIERRA_MS > Date.now();
reservable =
    puedeReservar && ['PROGRAMADO', 'ABIERTO', 'RETRASADO'].includes(vuelo.estado) && ventaAbierta;
if (puedeReservar && !ventaAbierta && vuelo.estado !== 'CANCELADO') {
    mostrarMensaje(
        mensaje,
        'info',
        'La venta de este vuelo cerró 24 horas antes de la salida. Puede consultar la disponibilidad, pero ya no es posible reservar.',
    );
}
if (reservable) {
    formReserva.classList.remove('oculto');
    if (sesion.rol === 'Empleado')
        document.getElementById('campo-pasajero').classList.remove('oculto');
}

function actualizarSeleccion() {
    document.getElementById('r-asiento').textContent = elegido ?? 'Sin elegir';
    reservar.disabled = !elegido;
    reservar.textContent = elegido ? `Reservar asiento ${elegido}` : 'Elija un asiento libre';
}

function botonAsiento(asiento) {
    const estado = asiento?.estado ?? 'LIBRE';
    const nombres = { LIBRE: 'libre', RESERVADO: 'reservado', OCUPADO: 'ocupado' };
    const clases = ['asiento', `asiento--${estado}`, asiento.mio ? 'asiento--mio' : ''].join(' ');
    return el('button', {
        type: 'button',
        class: clases,
        texto: asiento.numero.slice(-1),
        'aria-label': `Asiento ${asiento.numero}, ${nombres[estado]}${asiento.mio ? ', su reservación' : ''}`,
        'aria-pressed': elegido === asiento.numero ? 'true' : 'false',
        disabled: estado !== 'LIBRE' || !reservable,
        alClick: () => {
            elegido = asiento.numero;
            ocultar(mensaje);
            dibujar(ultimoMapa);
            actualizarSeleccion();
        },
    });
}

let ultimoMapa = [];
function dibujar(asientos) {
    ultimoMapa = asientos;
    const porNumero = new Map(asientos.map((a) => [a.numero, a]));
    const filas = Math.max(...asientos.map((a) => Number.parseInt(a.numero, 10)), 0);
    const encabezado = el(
        'div',
        { class: 'fila-asientos', 'aria-hidden': 'true' },
        el('span'),
        ...LETRAS_IZQUIERDA.map((l) => el('span', { class: 'fila-asientos__letra', texto: l })),
        el('span'),
        ...LETRAS_DERECHA.map((l) => el('span', { class: 'fila-asientos__letra', texto: l })),
    );
    const lineas = [encabezado];
    for (let fila = 1; fila <= filas; fila += 1) {
        const celda = (letra) =>
            porNumero.has(`${fila}${letra}`)
                ? botonAsiento(porNumero.get(`${fila}${letra}`))
                : el('span');
        lineas.push(
            el(
                'div',
                { class: 'fila-asientos' },
                el('span', { class: 'fila-asientos__numero', texto: fila }),
                ...LETRAS_IZQUIERDA.map(celda),
                el('span'),
                ...LETRAS_DERECHA.map(celda),
            ),
        );
    }
    cabina.replaceChildren(...lineas);
}

async function cargarAsientos() {
    const asientos = await api(`/api/vuelos/${idVuelo}/asientos`);
    if (elegido && asientos.find((a) => a.numero === elegido)?.estado !== 'LIBRE') {
        mostrarMensaje(
            mensaje,
            'error',
            `El asiento ${elegido} acaba de ser reservado por otra persona. Elija otro asiento libre.`,
        );
        elegido = null;
        actualizarSeleccion();
    }
    dibujar(asientos);
}

formReserva.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    reservar.disabled = true;
    const cuerpo = { idVuelo, asiento: elegido };
    if (sesion.rol === 'Empleado') cuerpo.correoPasajero = formReserva.correoPasajero.value;
    try {
        const respuesta = await api('/api/reservaciones', { metodo: 'POST', cuerpo });
        const destino =
            sesion.rol === 'Pasajero'
                ? 'Puede consultarla en Mis reservaciones.'
                : 'El pasajero puede consultarla en su cuenta.';
        mostrarMensaje(
            mensaje,
            'ok',
            `Asiento ${respuesta.asiento} apartado. Expira el ${formatoFechaHora(respuesta.fechaExpiracion)} si no se registra el pago. ${destino}`,
            `Reservación ${respuesta.codigo}`,
        );
        elegido = null;
    } catch (error) {
        mostrarMensaje(mensaje, 'error', error.message);
        if (error.estado === 409) elegido = null;
    }
    actualizarSeleccion();
    await cargarAsientos();
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

await cargarAsientos();
setInterval(() => cargarAsientos().catch(() => {}), ACTUALIZACION_MS);
