import {
    api,
    boton,
    chip,
    el,
    filaVacia,
    formatoFechaHora,
    mostrarMensaje,
    ocultar,
} from './comun.js';

const ACTIVAS = ['PENDIENTE', 'CONFIRMADA', 'PAGADA'];

/**
 * [RF-12][CA-07] Diálogo de confirmación de la cancelación. Al confirmar, la
 * base libera el asiento y vuelve a mostrarse como disponible.
 */
export function prepararCancelacion(alCancelar) {
    const dialogo = document.getElementById('dlg-cancelar');
    const texto = document.getElementById('dlg-cancelar-texto');
    const mensaje = document.getElementById('mensaje-cancelar');
    let actual = null;
    document.getElementById('dlg-cancelar-no').addEventListener('click', () => dialogo.close());
    document.getElementById('dlg-cancelar-si').addEventListener('click', async () => {
        try {
            const respuesta = await api(`/api/reservaciones/${actual.codigo}/cancelar`, {
                metodo: 'POST',
            });
            dialogo.close();
            await alCancelar(respuesta.mensaje);
        } catch (error) {
            mostrarMensaje(mensaje, 'error', error.message);
        }
    });
    return (reservacion) => {
        actual = reservacion;
        texto.textContent = `Se cancelará la reservación ${reservacion.codigo} del vuelo ${reservacion.numeroVuelo} (${reservacion.origen} – ${reservacion.destino}), asiento ${reservacion.asiento}. El asiento quedará disponible para otros pasajeros.`;
        ocultar(mensaje);
        dialogo.showModal();
    };
}

const enlace = (texto, ruta, variante = 'secundario') =>
    el('a', { class: `boton boton--${variante} boton--chico`, href: ruta, texto });

/** Acciones según el estado de la reservación y el perfil (Tabla 8) */
function accionesDe(r, abrirCancelacion, rol) {
    const acciones = el('div', { class: 'acciones' });
    if (
        rol === 'Pasajero' &&
        r.estado === 'CONFIRMADA' &&
        new Date(r.fechaExpiracion) > new Date()
    ) {
        acciones.append(enlace('Pagar', `/pago/${r.codigo}`, 'primario'));
    }
    if (rol === 'Empleado' && r.estado === 'PAGADA') {
        acciones.append(enlace('Check-in', `/check-in?codigo=${r.codigo}`));
    }
    if (r.estado === 'ABORDADA') acciones.append(enlace('Ver pase', `/pase/${r.codigo}`));
    acciones.append(boton('Ver vuelo', () => window.location.assign(`/vuelos/${r.idVuelo}`)));
    if (ACTIVAS.includes(r.estado))
        acciones.append(boton('Cancelar', () => abrirCancelacion(r), 'peligro-contorno'));
    return acciones;
}

function textoPago(r) {
    if (r.estado === 'CONFIRMADA')
        return `Pendiente · pagar antes del ${formatoFechaHora(r.fechaExpiracion)}`;
    return r.pago ?? 'Sin pago';
}

/** Fila de reservación; columnas extra para la vista de atención a pasajeros */
export function filaReservacion(r, abrirCancelacion, conPasajero, rol) {
    return el(
        'tr',
        {},
        el('td', {}, el('span', { class: 'codigo', texto: r.codigo })),
        conPasajero
            ? el(
                  'td',
                  {},
                  el('div', { texto: r.pasajero }),
                  el('div', { class: 'nota', texto: r.correoPasajero }),
              )
            : null,
        el('td', { texto: r.numeroVuelo }),
        el('td', {}, el('span', { class: 'iata', texto: `${r.origen} – ${r.destino}` })),
        el('td', { class: 'numerico', texto: formatoFechaHora(r.salida) }),
        el('td', { texto: r.asiento }),
        el('td', {}, chip(r.estado)),
        el('td', { texto: textoPago(r) }),
        el('td', {}, accionesDe(r, abrirCancelacion, rol)),
    );
}

export function pintarFilas(cuerpo, reservaciones, abrirCancelacion, conPasajero, vacio, rol) {
    const columnas = conPasajero ? 9 : 8;
    cuerpo.replaceChildren(
        ...(reservaciones.length
            ? reservaciones.map((r) => filaReservacion(r, abrirCancelacion, conPasajero, rol))
            : [filaVacia(columnas, vacio)]),
    );
}
