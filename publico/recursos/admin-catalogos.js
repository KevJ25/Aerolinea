import {
    api,
    boton,
    chip,
    el,
    enlazarCierreDialogos,
    filaVacia,
    montarEncabezado,
    mostrarMensaje,
    ocultar,
} from './comun.js';

await montarEncabezado();
const mensaje = document.getElementById('mensaje');
const formAeropuerto = document.getElementById('form-aeropuerto');
const formAvion = document.getElementById('form-avion');
const dlgEditar = document.getElementById('dlg-editar');
const formEditar = document.getElementById('form-editar');
let guardarEdicion = null;
enlazarCierreDialogos();

const ESTADOS = [
    ['DISPONIBLE', 'Disponible'],
    ['MANTENIMIENTO', 'En mantenimiento'],
    ['FUERA_DE_SERVICIO', 'Fuera de servicio'],
];

function campo(etiqueta, nombre, valor, atributos = {}) {
    const id = `e-${nombre}`;
    return el(
        'div',
        { class: 'campo' },
        el('label', { for: id, texto: etiqueta }),
        el('input', { id, name: nombre, value: valor, ...atributos }),
    );
}

/** Abre el diálogo de edición con los campos dados; guardar recibe los valores */
function abrirEdicion(titulo, campos, guardar) {
    document.getElementById('dlg-editar-titulo').textContent = titulo;
    document.getElementById('campos-editar').replaceChildren(...campos);
    ocultar(document.getElementById('mensaje-editar'));
    guardarEdicion = guardar;
    dlgEditar.showModal();
}

formEditar.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const valores = Object.fromEntries(new FormData(formEditar));
    try {
        const respuesta = await guardarEdicion(valores);
        dlgEditar.close();
        mostrarMensaje(mensaje, 'ok', respuesta.mensaje);
        await cargar();
    } catch (error) {
        mostrarMensaje(document.getElementById('mensaje-editar'), 'error', error.message);
    }
});

// --------------------------------------------------------------- aeropuertos
function filaAeropuerto(a) {
    const acciones = el('div', { class: 'acciones' });
    acciones.append(
        boton('Editar', () =>
            abrirEdicion(
                `Editar aeropuerto ${a.codigoIata}`,
                [
                    campo('Código IATA', 'codigoIata', a.codigoIata, { maxlength: 3 }),
                    campo('Nombre', 'nombre', a.nombre, { maxlength: 120 }),
                    campo('Ciudad', 'ciudad', a.ciudad, { maxlength: 80 }),
                    campo('País', 'pais', a.pais, { maxlength: 80 }),
                ],
                (valores) =>
                    api(`/api/aeropuertos/${a.idAeropuerto}`, { metodo: 'PATCH', cuerpo: valores }),
            ),
        ),
        a.activo
            ? boton('Desactivar', () => cambiarAeropuerto(a, 'desactivar'), 'peligro-contorno')
            : boton('Reactivar', () => cambiarAeropuerto(a, 'activar')),
    );
    return el(
        'tr',
        {},
        el('td', {}, el('span', { class: 'iata', texto: a.codigoIata })),
        el('td', { texto: a.nombre }),
        el('td', { texto: a.ciudad }),
        el('td', { texto: a.pais }),
        el('td', {}, chip(a.activo ? 'Activo' : 'Inactivo')),
        el('td', {}, acciones),
    );
}

async function cambiarAeropuerto(aeropuerto, accion) {
    try {
        const respuesta = await api(`/api/aeropuertos/${aeropuerto.idAeropuerto}/${accion}`, {
            metodo: 'POST',
        });
        mostrarMensaje(mensaje, 'ok', respuesta.mensaje);
        await cargar();
    } catch (error) {
        mostrarMensaje(mensaje, 'error', error.message);
    }
}

formAeropuerto.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const destino = document.getElementById('mensaje-aeropuerto');
    try {
        const respuesta = await api('/api/aeropuertos', {
            metodo: 'POST',
            cuerpo: Object.fromEntries(new FormData(formAeropuerto)),
        });
        formAeropuerto.reset();
        mostrarMensaje(destino, 'ok', respuesta.mensaje);
        await cargar();
    } catch (error) {
        mostrarMensaje(destino, 'error', error.message);
    }
});

// --------------------------------------------------------------- aviones
function selectorEstado(actual) {
    return el(
        'div',
        { class: 'campo' },
        el('label', { for: 'e-estado', texto: 'Estado operativo' }),
        el(
            'select',
            { id: 'e-estado', name: 'estadoOperativo' },
            ESTADOS.map(([valor, texto]) =>
                el('option', { value: valor, texto, selected: valor === actual }),
            ),
        ),
    );
}

function filaAvion(a) {
    const editar = boton('Editar', () =>
        abrirEdicion(
            `Editar avión ${a.matricula}`,
            [
                campo('Modelo', 'modelo', a.modelo, { maxlength: 120 }),
                campo('Capacidad', 'capacidad', a.capacidad, { type: 'number', min: 1, max: 600 }),
                selectorEstado(a.estadoOperativo),
            ],
            (valores) =>
                api(`/api/aviones/${a.idAvion}`, {
                    metodo: 'PATCH',
                    cuerpo: { ...valores, capacidad: Number(valores.capacidad) },
                }),
        ),
    );
    return el(
        'tr',
        {},
        el('td', {}, el('strong', { texto: a.matricula })),
        el('td', { texto: a.modelo }),
        el('td', { class: 'numerico', texto: `${a.capacidad} asientos` }),
        el('td', {}, chip(a.estadoOperativo)),
        el('td', { class: 'numerico', texto: a.vuelosProgramados }),
        el('td', {}, el('div', { class: 'acciones' }, editar)),
    );
}

formAvion.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const destino = document.getElementById('mensaje-avion');
    const valores = Object.fromEntries(new FormData(formAvion));
    try {
        const respuesta = await api('/api/aviones', {
            metodo: 'POST',
            cuerpo: { ...valores, capacidad: Number(valores.capacidad) },
        });
        formAvion.reset();
        mostrarMensaje(destino, 'ok', respuesta.mensaje);
        await cargar();
    } catch (error) {
        mostrarMensaje(destino, 'error', error.message);
    }
});

async function cargar() {
    const [aeropuertos, aviones] = await Promise.all([
        api('/api/aeropuertos'),
        api('/api/aviones'),
    ]);
    document
        .getElementById('filas-aeropuertos')
        .replaceChildren(
            ...(aeropuertos.length
                ? aeropuertos.map(filaAeropuerto)
                : [filaVacia(6, 'Aún no hay aeropuertos.')]),
        );
    document
        .getElementById('filas-aviones')
        .replaceChildren(
            ...(aviones.length ? aviones.map(filaAvion) : [filaVacia(6, 'Aún no hay aviones.')]),
        );
}

await cargar();
