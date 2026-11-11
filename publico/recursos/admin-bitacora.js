import { api, el, formatoFechaHora, montarEncabezado, mostrarMensaje } from './comun.js';

await montarEncabezado();
const filtros = document.getElementById('filtros');
const filas = document.getElementById('filas');
const mensaje = document.getElementById('mensaje');
const anterior = document.getElementById('anterior');
const siguiente = document.getElementById('siguiente');
let pagina = 1;
let opcionesCargadas = false;

function llenarOpciones(select, valores) {
    const actual = select.value;
    select.replaceChildren(
        select.options[0],
        ...valores.map((valor) => el('option', { value: valor, texto: valor })),
    );
    select.value = actual;
}

async function cargar() {
    const parametros = new URLSearchParams({
        accion: filtros.accion.value,
        modulo: filtros.modulo.value,
        desde: filtros.desde.value,
        hasta: filtros.hasta.value,
        pagina: String(pagina),
    });
    const datos = await api(`/api/bitacora?${parametros}`);
    if (!opcionesCargadas) {
        llenarOpciones(filtros.accion, datos.acciones);
        opcionesCargadas = true;
    }
    llenarOpciones(filtros.modulo, datos.modulos);
    filas.replaceChildren(
        ...(datos.registros.length === 0
            ? [
                  el(
                      'tr',
                      {},
                      el('td', {
                          colspan: 5,
                          class: 'celda-vacia',
                          texto: 'No hay registros con esos filtros.',
                      }),
                  ),
              ]
            : datos.registros.map((registro) =>
                  el(
                      'tr',
                      {},
                      el('td', { texto: formatoFechaHora(registro.fechaHora) }),
                      el('td', {
                          texto:
                              registro.correo ??
                              (registro.idUsuario ? `id ${registro.idUsuario}` : 'Sistema'),
                      }),
                      el(
                          'td',
                          {},
                          el('span', {
                              class: `accion--${registro.accion}`,
                              texto: registro.accion,
                          }),
                      ),
                      el('td', { texto: registro.modulo }),
                      el('td', { texto: registro.detalle }),
                  ),
              )),
    );
    document.getElementById('pagina').textContent = `Página ${datos.pagina}`;
    anterior.disabled = datos.pagina <= 1;
    siguiente.disabled = !datos.haySiguiente;
}

function recargar() {
    cargar().catch((error) => mostrarMensaje(mensaje, 'error', error.message));
}

filtros.addEventListener('submit', (evento) => {
    evento.preventDefault();
    pagina = 1;
    recargar();
});
anterior.addEventListener('click', () => {
    pagina -= 1;
    recargar();
});
siguiente.addEventListener('click', () => {
    pagina += 1;
    recargar();
});
await cargar();
