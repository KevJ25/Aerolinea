import {
    aFechaHoraLocal,
    api,
    boton,
    chip,
    el,
    enlazarCierreDialogos,
    filaVacia,
    formatoFechaHora,
    formatoMoneda,
    montarEncabezado,
    mostrarMensaje,
    ocultar,
} from './comun.js';

await montarEncabezado();
const mensaje = document.getElementById('mensaje');
const formRuta = document.getElementById('form-ruta');
const formVuelo = document.getElementById('form-vuelo');
const formEditar = document.getElementById('form-editar');
const formCancelar = document.getElementById('form-cancelar');
const filtroEstado = document.getElementById('filtro-estado');
let vueloSeleccionado = null;
enlazarCierreDialogos();

function opciones(select, elementos, etiqueta, valor, vacio) {
    const seleccion = select.value;
    select.replaceChildren(
        el('option', { value: '', texto: vacio }),
        ...elementos.map((e) => el('option', { value: valor(e), texto: etiqueta(e) })),
    );
    select.value = seleccion;
}

async function enviar(promesa, destino, despues) {
    try {
        const respuesta = await promesa;
        mostrarMensaje(destino, 'ok', respuesta.mensaje);
        despues?.();
        await cargar();
    } catch (error) {
        mostrarMensaje(destino, 'error', error.message);
    }
}

// --------------------------------------------------------------- rutas
function filaRuta(r) {
    const accion = r.activo
        ? boton(
              'Desactivar',
              () => enviar(api(`/api/rutas/${r.idRuta}/desactivar`, { metodo: 'POST' }), mensaje),
              'peligro-contorno',
          )
        : boton('Reactivar', () =>
              enviar(api(`/api/rutas/${r.idRuta}/activar`, { metodo: 'POST' }), mensaje),
          );
    return el(
        'tr',
        {},
        el('td', {}, el('span', { class: 'iata', texto: r.origen }), ` ${r.ciudadOrigen}`),
        el('td', {}, el('span', { class: 'iata', texto: r.destino }), ` ${r.ciudadDestino}`),
        el('td', {}, chip(r.activo && r.aeropuertosActivos ? 'Activo' : 'Inactivo')),
        el('td', {}, el('div', { class: 'acciones' }, accion)),
    );
}

formRuta.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const datos = {
        idOrigen: Number(formRuta.idOrigen.value),
        idDestino: Number(formRuta.idDestino.value),
    };
    enviar(
        api('/api/rutas', { metodo: 'POST', cuerpo: datos }),
        document.getElementById('mensaje-ruta'),
    );
});

// --------------------------------------------------------------- vuelos
formVuelo.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const valores = Object.fromEntries(new FormData(formVuelo));
    const datos = {
        ...valores,
        idRuta: Number(valores.idRuta),
        idAvion: Number(valores.idAvion),
        tarifa: Number(valores.tarifa),
    };
    enviar(
        api('/api/vuelos', { metodo: 'POST', cuerpo: datos }),
        document.getElementById('mensaje-vuelo'),
        () => formVuelo.reset(),
    );
});

function abrirEdicion(v) {
    vueloSeleccionado = v;
    document.getElementById('dlg-editar-titulo').textContent = `Editar vuelo ${v.numeroVuelo}`;
    formEditar.salida.value = aFechaHoraLocal(v.salida);
    formEditar.llegada.value = aFechaHoraLocal(v.llegada);
    formEditar.tarifa.value = v.tarifa;
    formEditar.estado.value = v.estado;
    ocultar(document.getElementById('mensaje-editar'));
    document.getElementById('dlg-editar').showModal();
}

formEditar.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const valores = Object.fromEntries(new FormData(formEditar));
    try {
        const respuesta = await api(`/api/vuelos/${vueloSeleccionado.idVuelo}`, {
            metodo: 'PATCH',
            cuerpo: { ...valores, tarifa: Number(valores.tarifa) },
        });
        document.getElementById('dlg-editar').close();
        mostrarMensaje(mensaje, 'ok', respuesta.mensaje);
        await cargar();
    } catch (error) {
        mostrarMensaje(document.getElementById('mensaje-editar'), 'error', error.message);
    }
});

/** [RNF-12][S-14][RN-09] Confirmación explícita (MK-10) */
function abrirCancelacion(v) {
    vueloSeleccionado = v;
    formCancelar.reset();
    const ocupados = v.asientosTotales - v.asientosLibres;
    document.getElementById('dlg-cancelar-titulo').textContent =
        `¿Cancelar el vuelo ${v.numeroVuelo}?`;
    document.getElementById('dlg-cancelar-texto').textContent =
        `Esta acción no se puede deshacer. Las reservaciones activas del vuelo (${ocupados} asientos apartados u ocupados) pasarán a CANCELADA.`;
    document.getElementById('c-etiqueta').textContent = `Escriba ${v.numeroVuelo} para confirmar`;
    ocultar(document.getElementById('mensaje-cancelar'));
    document.getElementById('dlg-cancelar').showModal();
}

formCancelar.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    try {
        const respuesta = await api(`/api/vuelos/${vueloSeleccionado.idVuelo}/cancelar`, {
            metodo: 'POST',
            cuerpo: { confirmacion: formCancelar.confirmacion.value },
        });
        document.getElementById('dlg-cancelar').close();
        mostrarMensaje(mensaje, 'ok', respuesta.mensaje);
        await cargar();
    } catch (error) {
        mostrarMensaje(document.getElementById('mensaje-cancelar'), 'error', error.message);
    }
});

function filaVuelo(v) {
    const acciones = el(
        'div',
        { class: 'acciones' },
        boton('Asientos', () => window.location.assign(`/vuelos/${v.idVuelo}`)),
    );
    if (v.estado !== 'CANCELADO') acciones.append(boton('Editar', () => abrirEdicion(v)));
    if (['PROGRAMADO', 'ABIERTO', 'RETRASADO'].includes(v.estado)) {
        acciones.append(boton('Cancelar vuelo', () => abrirCancelacion(v), 'peligro-contorno'));
    }
    return el(
        'tr',
        {},
        el('td', {}, el('strong', { texto: v.numeroVuelo })),
        el('td', {}, el('span', { class: 'iata', texto: `${v.origen} – ${v.destino}` })),
        el('td', { class: 'numerico', texto: formatoFechaHora(v.salida) }),
        el('td', { texto: v.matricula }),
        el('td', {
            class: 'numerico',
            texto: `${v.asientosTotales - v.asientosLibres} / ${v.asientosTotales}`,
        }),
        el('td', { class: 'numerico', texto: formatoMoneda(v.tarifa) }),
        el('td', {}, chip(v.estado)),
        el('td', {}, acciones),
    );
}

async function cargar() {
    const [aeropuertos, rutas, aviones, vuelos] = await Promise.all([
        api('/api/aeropuertos?activos=true'),
        api('/api/rutas'),
        api('/api/aviones'),
        api(`/api/vuelos?estado=${encodeURIComponent(filtroEstado.value)}`),
    ]);
    const etiquetaAeropuerto = (a) => `${a.codigoIata} · ${a.ciudad}`;
    opciones(
        formRuta.idOrigen,
        aeropuertos,
        etiquetaAeropuerto,
        (a) => a.idAeropuerto,
        'Seleccione el origen',
    );
    opciones(
        formRuta.idDestino,
        aeropuertos,
        etiquetaAeropuerto,
        (a) => a.idAeropuerto,
        'Seleccione el destino',
    );
    opciones(
        formVuelo.idRuta,
        rutas.filter((r) => r.activo && r.aeropuertosActivos),
        (r) => `${r.origen} – ${r.destino}`,
        (r) => r.idRuta,
        'Seleccione la ruta',
    );
    opciones(
        formVuelo.idAvion,
        aviones.filter((a) => a.estadoOperativo === 'DISPONIBLE'),
        (a) => `${a.matricula} · ${a.modelo} · ${a.capacidad} asientos`,
        (a) => a.idAvion,
        'Seleccione la aeronave',
    );
    document
        .getElementById('filas-rutas')
        .replaceChildren(
            ...(rutas.length ? rutas.map(filaRuta) : [filaVacia(4, 'Aún no hay rutas.')]),
        );
    document
        .getElementById('filas-vuelos')
        .replaceChildren(
            ...(vuelos.length
                ? vuelos.map(filaVuelo)
                : [filaVacia(8, 'No hay vuelos con ese estado.')]),
        );
}

filtroEstado.addEventListener('change', () =>
    cargar().catch((error) => mostrarMensaje(mensaje, 'error', error.message)),
);
await cargar();
