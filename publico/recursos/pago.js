import {
    api,
    chip,
    formatoFechaHora,
    formatoMoneda,
    montarEncabezado,
    mostrarMensaje,
    ocultar,
} from './comun.js';

await montarEncabezado();
const codigo = window.location.pathname.split('/').pop();
const formulario = document.getElementById('formulario');
const mensaje = document.getElementById('mensaje');
const pagar = document.getElementById('pagar');

async function cargar() {
    const r = await api(`/api/reservaciones/${codigo}`);
    document.getElementById('estado-reserva').replaceChildren(chip(r.estado));
    document.getElementById('monto').textContent = formatoMoneda(r.tarifa);
    document.getElementById('r-codigo').textContent = r.codigo;
    document.getElementById('r-origen').textContent = r.origen;
    document.getElementById('r-destino').textContent = r.destino;
    document.getElementById('r-vuelo').textContent = r.numeroVuelo;
    document.getElementById('r-salida').textContent = formatoFechaHora(r.salida);
    document.getElementById('r-asiento').textContent = r.asiento;
    document.getElementById('r-expira').textContent =
        r.estado === 'CONFIRMADA' ? formatoFechaHora(r.fechaExpiracion) : '—';
    pagar.textContent = `Pagar ${formatoMoneda(r.tarifa)}`;
    const pagable = r.estado === 'CONFIRMADA' && new Date(r.fechaExpiracion) > new Date();
    if (!pagable) {
        formulario.classList.add('oculto');
        if (r.estado !== 'PAGADA')
            mostrarMensaje(
                mensaje,
                'info',
                `Esta reservación no admite pagos: su estado es ${r.estado}.`,
            );
    }
    return r;
}

let reservacion;
try {
    reservacion = await cargar();
} catch (error) {
    mostrarMensaje(mensaje, 'error', error.message);
    formulario.classList.add('oculto');
}

formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    ocultar(mensaje);
    pagar.disabled = true;
    try {
        const respuesta = await api(`/api/reservaciones/${codigo}/pago`, {
            metodo: 'POST',
            cuerpo: { metodo: formulario.metodo.value, monto: reservacion.tarifa },
        });
        const aprobado = respuesta.estado === 'APROBADO';
        mostrarMensaje(
            mensaje,
            aprobado ? 'ok' : 'error',
            respuesta.mensaje,
            aprobado ? 'Pago aprobado' : 'Pago rechazado',
        );
        reservacion = await cargar();
    } catch (error) {
        mostrarMensaje(mensaje, 'error', error.message);
    } finally {
        pagar.disabled = false;
    }
});
