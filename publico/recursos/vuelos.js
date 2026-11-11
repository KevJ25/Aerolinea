import {
    api,
    chip,
    el,
    formatoHora,
    formatoMoneda,
    hoyMexico,
    montarEncabezado,
    mostrarMensaje,
    ocultar,
} from './comun.js';

const DIAS_FRANJA = 14;
const sesion = await montarEncabezado();
const formulario = document.getElementById('busqueda');
const mensaje = document.getElementById('mensaje');
const resultados = document.getElementById('resultados');
const titulo = document.getElementById('titulo-resultados');
const conteo = document.getElementById('conteo');
const textoAccion = sesion.rol === 'Pasajero' ? 'Elegir asiento' : 'Ver asientos';
const hoy = hoyMexico();

// ------------------------------------------------------------ fechas (AAAA-MM-DD)
const sumarDias = (fecha, dias) =>
    new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);
const formatoDia = (fecha, opciones) =>
    new Date(`${fecha}T12:00:00Z`).toLocaleDateString('es-MX', { timeZone: 'UTC', ...opciones });
const fechaLarga = (fecha) => formatoDia(fecha, { weekday: 'long', day: 'numeric', month: 'long' });
const fechaCorta = (fecha) => formatoDia(fecha, { day: 'numeric', month: 'short' });
const fechaLocalDe = (iso) =>
    new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Mexico_City' }).format(new Date(iso));

// ------------------------------------------------------------ estado en la dirección
const estado = { origen: '', destino: '', fecha: '', desde: hoy };

function leerDireccion() {
    const p = new URLSearchParams(window.location.search);
    estado.origen = p.get('origen') ?? '';
    estado.destino = p.get('destino') ?? '';
    estado.fecha = p.get('fecha') ?? '';
    estado.desde = p.get('desde') ?? '';
    ajustarFranja();
}

/** La franja nunca empieza antes de hoy y siempre contiene la fecha elegida */
function ajustarFranja() {
    if (!estado.desde || estado.desde < hoy) estado.desde = hoy;
    if (
        estado.fecha &&
        (estado.fecha < estado.desde || estado.fecha > sumarDias(estado.desde, DIAS_FRANJA - 1))
    ) {
        estado.desde = estado.fecha < hoy ? hoy : estado.fecha;
    }
}

function escribirDireccion() {
    const p = new URLSearchParams();
    for (const clave of ['origen', 'destino', 'fecha'])
        if (estado[clave]) p.set(clave, estado[clave]);
    if (estado.desde !== hoy) p.set('desde', estado.desde);
    history.replaceState(null, '', p.size ? `?${p}` : window.location.pathname);
}

function filtrosAFormulario() {
    formulario.origen.value = estado.origen;
    formulario.destino.value = estado.destino;
    formulario.fecha.value = estado.fecha;
}

// ------------------------------------------------------------ franja de 14 días
async function dibujarFranja() {
    const consulta = new URLSearchParams({
        origen: estado.origen,
        destino: estado.destino,
        desde: estado.desde,
    });
    const dias = await api(`/api/vuelos/calendario?${consulta}`);
    document.getElementById('dias').replaceChildren(
        ...dias.map((d) =>
            el(
                'button',
                {
                    type: 'button',
                    class: d.vuelos ? 'dia' : 'dia dia--vacio',
                    'aria-pressed': d.fecha === estado.fecha ? 'true' : 'false',
                    'aria-label': `${fechaLarga(d.fecha)}: ${d.vuelos ? `${d.vuelos} vuelos desde ${formatoMoneda(d.tarifaMinima)}` : 'sin vuelos'}`,
                    alClick: () => elegirDia(d.fecha),
                },
                el('span', {
                    class: 'dia__semana',
                    texto: formatoDia(d.fecha, { weekday: 'short' }),
                }),
                el('span', { class: 'dia__fecha', texto: fechaCorta(d.fecha) }),
                el('span', {
                    class: 'dia__vuelos',
                    texto: d.vuelos
                        ? `${d.vuelos} ${d.vuelos === 1 ? 'vuelo' : 'vuelos'}`
                        : 'Sin vuelos',
                }),
                d.vuelos
                    ? el('span', {
                          class: 'dia__precio',
                          texto: `desde ${formatoMoneda(d.tarifaMinima)}`,
                      })
                    : null,
            ),
        ),
    );
    document.getElementById('anterior').disabled = estado.desde <= hoy;
}

/** Clic en un día: lo elige; un segundo clic vuelve a mostrar las dos semanas */
function elegirDia(fecha) {
    estado.fecha = estado.fecha === fecha ? '' : fecha;
    actualizar();
}

// ------------------------------------------------------------ resultados
function tarjetaVuelo(v) {
    return el(
        'article',
        { class: 'vuelo' },
        el(
            'div',
            { class: 'vuelo__ruta' },
            el(
                'div',
                { class: 'vuelo__punto' },
                el('span', { class: 'iata', texto: v.origen }),
                el('span', { class: 'hora', texto: formatoHora(v.salida) }),
            ),
            el('span', { class: 'vuelo__linea', 'aria-hidden': 'true' }),
            el(
                'div',
                { class: 'vuelo__punto' },
                el('span', { class: 'iata', texto: v.destino }),
                el('span', { class: 'hora', texto: formatoHora(v.llegada) }),
            ),
        ),
        el(
            'div',
            { class: 'vuelo__datos' },
            el(
                'span',
                {},
                el('strong', { texto: v.numeroVuelo }),
                ` · ${v.ciudadOrigen} a ${v.ciudadDestino}`,
            ),
            el('span', {
                texto: `${v.asientosLibres} de ${v.asientosTotales} asientos disponibles · ${v.modelo}`,
            }),
            el('span', {}, chip(v.estado)),
        ),
        el(
            'div',
            { class: 'vuelo__precio' },
            el('strong', { texto: formatoMoneda(v.tarifa) }),
            el('a', { class: 'boton', href: `/vuelos/${v.idVuelo}`, texto: textoAccion }),
        ),
    );
}

/** Agrupa los vuelos por día cuando la lista abarca varios días */
function pintarVuelos(vuelos, agrupar) {
    if (!agrupar) {
        resultados.replaceChildren(...vuelos.map(tarjetaVuelo));
        return;
    }
    const grupos = new Map();
    for (const v of vuelos) {
        const dia = fechaLocalDe(v.salida);
        if (!grupos.has(dia)) grupos.set(dia, []);
        grupos.get(dia).push(v);
    }
    resultados.replaceChildren(
        ...[...grupos].map(([dia, lista]) =>
            el(
                'section',
                { class: 'grupo-dia' },
                el('h3', { texto: dia === hoy ? `Hoy, ${fechaLarga(dia)}` : fechaLarga(dia) }),
                ...lista.map(tarjetaVuelo),
            ),
        ),
    );
}

function describirBusqueda() {
    const { origen, destino } = estado;
    if (origen && destino) return `Vuelos de ${origen} a ${destino}`;
    if (origen) return `Vuelos que salen de ${origen}`;
    if (destino) return `Vuelos con destino a ${destino}`;
    return 'Próximos vuelos';
}

function describirFechas() {
    if (estado.fecha) return `el ${fechaLarga(estado.fecha)}`;
    return `del ${fechaCorta(estado.desde)} al ${fechaCorta(sumarDias(estado.desde, DIAS_FRANJA - 1))}`;
}

// ------------------------------------------------------------ sugerencias
async function pintarSugerencias() {
    const consulta = new URLSearchParams({
        origen: estado.origen,
        destino: estado.destino,
        fecha: estado.fecha || estado.desde,
    });
    const { siguiente, alternativas } = await api(`/api/vuelos/sugerencias?${consulta}`);
    const caja = el('div', { class: 'sugerencia' });
    if (siguiente) {
        const dia = fechaLocalDe(siguiente.salida);
        caja.append(
            el('h3', {
                texto: `El siguiente vuelo de ${estado.origen} a ${estado.destino} sale el ${fechaLarga(dia)} a las ${formatoHora(siguiente.salida)}.`,
            }),
            el(
                'div',
                { class: 'sugerencia__opciones' },
                el('button', {
                    class: 'boton',
                    type: 'button',
                    texto: 'Ver ese día',
                    alClick: () => {
                        estado.fecha = dia;
                        estado.desde = '';
                        ajustarFranja();
                        actualizar();
                    },
                }),
            ),
        );
    } else if (estado.origen && estado.destino) {
        caja.append(
            el('h3', {
                texto: `La ruta de ${estado.origen} a ${estado.destino} no tiene vuelos programados por ahora.`,
            }),
        );
    }
    if (alternativas.length) {
        const deOrigen = Boolean(estado.origen);
        caja.append(
            el('p', {
                class: 'nota',
                texto: deOrigen
                    ? `Destinos con vuelos próximos desde ${estado.origen}:`
                    : `Orígenes con vuelos próximos a ${estado.destino}:`,
            }),
            el(
                'div',
                { class: 'sugerencia__opciones' },
                alternativas.map((a) =>
                    el('button', {
                        class: 'boton boton--secundario boton--chico',
                        type: 'button',
                        texto: `${a.codigo} · ${a.ciudad} · desde el ${fechaCorta(fechaLocalDe(a.proximaSalida))}`,
                        alClick: () => {
                            estado[deOrigen ? 'destino' : 'origen'] = a.codigo;
                            estado.fecha = '';
                            actualizar();
                        },
                    }),
                ),
            ),
        );
    }
    if (!caja.childElementCount)
        caja.append(el('h3', { texto: 'No hay vuelos programados por ahora.' }));
    resultados.replaceChildren(caja);
}

// ------------------------------------------------------------ flujo principal
async function cargarResultados() {
    const exacta = estado.origen && estado.destino && estado.fecha;
    const vuelos = exacta
        ? await api(
              `/api/vuelos/buscar?${new URLSearchParams({ origen: estado.origen, destino: estado.destino, fecha: estado.fecha })}`,
          )
        : await api(
              `/api/vuelos/disponibles?${new URLSearchParams({ origen: estado.origen, destino: estado.destino, desde: estado.fecha || estado.desde, hasta: estado.fecha || sumarDias(estado.desde, DIAS_FRANJA - 1) })}`,
          );
    titulo.textContent = `${describirBusqueda()} ${describirFechas()}`;
    conteo.textContent = vuelos.length
        ? `${vuelos.length} ${vuelos.length === 1 ? 'vuelo' : 'vuelos'}`
        : '';
    if (vuelos.length) pintarVuelos(vuelos, !estado.fecha);
    else await pintarSugerencias();
}

async function actualizar() {
    ocultar(mensaje);
    ajustarFranja();
    filtrosAFormulario();
    escribirDireccion();
    try {
        await Promise.all([dibujarFranja(), cargarResultados()]);
    } catch (error) {
        mostrarMensaje(mensaje, 'error', error.message);
    }
}

// ------------------------------------------------------------ eventos
const aeropuertos = await api('/api/aeropuertos/activos');
for (const [select, vacio] of [
    [formulario.origen, 'Cualquier origen'],
    [formulario.destino, 'Cualquier destino'],
]) {
    select.replaceChildren(
        el('option', { value: '', texto: vacio }),
        ...aeropuertos.map((a) =>
            el('option', { value: a.codigoIata, texto: `${a.codigoIata} · ${a.ciudad}` }),
        ),
    );
}
formulario.fecha.min = hoy;

formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (formulario.origen.value && formulario.origen.value === formulario.destino.value) {
        mostrarMensaje(mensaje, 'error', 'El origen y el destino deben ser distintos.');
        return;
    }
    Object.assign(estado, {
        origen: formulario.origen.value,
        destino: formulario.destino.value,
        fecha: formulario.fecha.value,
    });
    actualizar();
});
for (const select of [formulario.origen, formulario.destino])
    select.addEventListener('change', () => formulario.requestSubmit());
document.getElementById('limpiar').addEventListener('click', () => {
    Object.assign(estado, { origen: '', destino: '', fecha: '', desde: hoy });
    actualizar();
});
document.getElementById('anterior').addEventListener('click', () => {
    estado.desde = sumarDias(estado.desde, -DIAS_FRANJA);
    estado.fecha = '';
    actualizar();
});
document.getElementById('siguiente').addEventListener('click', () => {
    estado.desde = sumarDias(estado.desde, DIAS_FRANJA);
    estado.fecha = '';
    actualizar();
});

leerDireccion();
await actualizar();
