import { api, chip, formatoFechaHora, montarEncabezado, mostrarMensaje, ocultar } from './comun.js';
import { tarjetaPase } from './pase-comun.js';

await montarEncabezado();
const busqueda = document.getElementById('busqueda');
const mensaje = document.getElementById('mensaje');
const tarjeta = document.getElementById('tarjeta-reserva');
const formCheckIn = document.getElementById('form-checkin');
const motivo = document.getElementById('motivo');
const seccionPase = document.getElementById('seccion-pase');
let codigoActual = '';

document.getElementById('imprimir').addEventListener('click', () => window.print());

function mostrarPase(r) {
    document.getElementById('pase').replaceChildren(tarjetaPase(r));
    seccionPase.classList.remove('oculto');
}

async function consultar(codigo) {
    ocultar(mensaje);
    ocultar(seccionPase);
    const r = await api(`/api/check-in/${encodeURIComponent(codigo)}`);
    codigoActual = r.codigo;
    document.getElementById('t-pasajero').textContent = r.pasajero;
    document.getElementById('estado').replaceChildren(chip(r.estado));
    document.getElementById('d-correo').textContent = r.correoPasajero;
    document.getElementById('d-vuelo').textContent = `${r.numeroVuelo}, ${r.origen} a ${r.destino}`;
    document.getElementById('d-salida').textContent = formatoFechaHora(r.salida);
    document.getElementById('d-asiento').textContent = r.asiento;
    document.getElementById('d-vuelo-estado').replaceChildren(chip(r.estadoVuelo));
    document.getElementById('d-pago').textContent = r.pago ?? 'Sin pago';
    tarjeta.classList.remove('oculto');
    // [CP-15] Si no procede, se informa el motivo y no se ofrece el botón
    if (r.motivo) {
        mostrarMensaje(
            motivo,
            r.estado === 'ABORDADA' ? 'info' : 'error',
            r.motivo,
            r.estado === 'ABORDADA' ? undefined : 'No se puede realizar el check-in',
        );
        ocultar(formCheckIn);
    } else {
        ocultar(motivo);
        formCheckIn.reset();
        formCheckIn.classList.remove('oculto');
    }
    if (r.pase) mostrarPase(r);
    history.replaceState(null, '', `?codigo=${r.codigo}`);
}

busqueda.addEventListener('submit', (evento) => {
    evento.preventDefault();
    consultar(busqueda.codigo.value.trim().toUpperCase()).catch((error) => {
        ocultar(tarjeta);
        mostrarMensaje(mensaje, 'error', error.message);
    });
});

formCheckIn.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    try {
        const respuesta = await api('/api/check-in', {
            metodo: 'POST',
            cuerpo: {
                codigo: codigoActual,
                identificacionVerificada: document.getElementById('identificacion').checked,
            },
        });
        await consultar(codigoActual);
        mostrarMensaje(mensaje, 'ok', respuesta.mensaje);
    } catch (error) {
        mostrarMensaje(mensaje, 'error', error.message);
    }
});

const inicial = new URLSearchParams(window.location.search).get('codigo');
if (inicial) {
    busqueda.codigo.value = inicial;
    busqueda.requestSubmit();
}
