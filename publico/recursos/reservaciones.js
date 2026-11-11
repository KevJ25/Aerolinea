import { api, montarEncabezado, mostrarMensaje } from './comun.js';
import { pintarFilas, prepararCancelacion } from './reservaciones-comun.js';

const sesion = await montarEncabezado();
const mensaje = document.getElementById('mensaje');
const filtros = document.getElementById('filtros');
const filas = document.getElementById('filas');
if (sesion.rol === 'Empleado') document.getElementById('nueva').classList.remove('oculto');

async function cargar() {
    const consulta = new URLSearchParams({
        codigo: filtros.codigo.value,
        correo: filtros.correo.value,
    });
    const reservaciones = await api(`/api/reservaciones?${consulta}`);
    pintarFilas(
        filas,
        reservaciones,
        abrirCancelacion,
        true,
        'No hay reservaciones que coincidan.',
        sesion.rol,
    );
}

const abrirCancelacion = prepararCancelacion(async (texto) => {
    mostrarMensaje(mensaje, 'ok', texto);
    await cargar();
});

filtros.addEventListener('submit', (evento) => {
    evento.preventDefault();
    cargar().catch((error) => mostrarMensaje(mensaje, 'error', error.message));
});
await cargar();
