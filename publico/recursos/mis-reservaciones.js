import { api, montarEncabezado, mostrarMensaje } from './comun.js';
import { pintarFilas, prepararCancelacion } from './reservaciones-comun.js';

await montarEncabezado();
const mensaje = document.getElementById('mensaje');
const filas = document.getElementById('filas');

async function cargar() {
    const reservaciones = await api('/api/reservaciones/mias');
    pintarFilas(
        filas,
        reservaciones,
        abrirCancelacion,
        false,
        'Aún no tiene reservaciones.',
        'Pasajero',
    );
}

const abrirCancelacion = prepararCancelacion(async (texto) => {
    mostrarMensaje(mensaje, 'ok', texto);
    await cargar();
});

await cargar();
