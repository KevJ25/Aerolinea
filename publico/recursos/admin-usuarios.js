import {
    api,
    el,
    enlazarPolitica,
    formatoFecha,
    montarEncabezado,
    mostrarMensaje,
    ocultar,
} from './comun.js';

const sesion = await montarEncabezado();
const filas = document.getElementById('filas');
const mensaje = document.getElementById('mensaje');
const filtros = document.getElementById('filtros');
const dlgUsuario = document.getElementById('dlg-usuario');
const formUsuario = document.getElementById('form-usuario');
const dlgBaja = document.getElementById('dlg-baja');
const formBaja = document.getElementById('form-baja');
let usuarioEditado = null;
let usuarioBaja = null;

enlazarPolitica(formUsuario.contrasena, document.getElementById('u-politica'));
document
    .querySelectorAll('[data-cerrar]')
    .forEach((boton) => boton.addEventListener('click', () => boton.closest('dialog').close()));

async function cargar() {
    const parametros = new URLSearchParams({
        buscar: filtros.buscar.value,
        rol: filtros.rol.value,
    });
    const usuarios = await api(`/api/usuarios?${parametros}`);
    filas.replaceChildren(
        ...(usuarios.length === 0
            ? [
                  el(
                      'tr',
                      {},
                      el('td', {
                          colspan: 6,
                          class: 'celda-vacia',
                          texto: 'No hay usuarios que coincidan.',
                      }),
                  ),
              ]
            : usuarios.map(filaUsuario)),
    );
}

function filaUsuario(usuario) {
    const esPropio = usuario.idUsuario === sesion.idUsuario;
    const acciones = el('div', { class: 'acciones' });
    if (usuario.estado === 'Bloqueado') {
        acciones.append(
            el('button', {
                class: 'boton boton--secundario boton--chico',
                type: 'button',
                texto: 'Desbloquear',
                alClick: () => desbloquear(usuario),
            }),
        );
    }
    if (usuario.estado !== 'Inactivo') {
        acciones.append(
            el('button', {
                class: 'boton boton--secundario boton--chico',
                type: 'button',
                texto: 'Editar',
                alClick: () => abrirEdicion(usuario),
            }),
        );
    }
    if (usuario.estado !== 'Inactivo' && !esPropio) {
        acciones.append(
            el('button', {
                class: 'boton boton--peligro-contorno boton--chico',
                type: 'button',
                texto: 'Dar de baja',
                alClick: () => abrirBaja(usuario),
            }),
        );
    }
    return el(
        'tr',
        {},
        el('td', {}, el('strong', { texto: usuario.nombre }), esPropio ? ' (usted)' : ''),
        el('td', { texto: usuario.correo }),
        el('td', { texto: usuario.rol }),
        el('td', {}, el('span', { class: `chip chip--${usuario.estado}`, texto: usuario.estado })),
        el('td', { texto: formatoFecha(usuario.fechaAlta) }),
        el('td', {}, acciones),
    );
}

function abrirAlta() {
    usuarioEditado = null;
    formUsuario.reset();
    formUsuario.contrasena.dispatchEvent(new Event('input'));
    document.getElementById('dlg-usuario-titulo').textContent = 'Agregar usuario';
    document.getElementById('bloque-contrasena').classList.remove('oculto');
    ocultar(document.getElementById('mensaje-usuario'));
    dlgUsuario.showModal();
}

function abrirEdicion(usuario) {
    usuarioEditado = usuario;
    formUsuario.reset();
    formUsuario.nombre.value = usuario.nombre;
    formUsuario.correo.value = usuario.correo;
    formUsuario.rol.value = usuario.rol;
    document.getElementById('dlg-usuario-titulo').textContent = 'Editar usuario';
    document.getElementById('bloque-contrasena').classList.add('oculto');
    ocultar(document.getElementById('mensaje-usuario'));
    dlgUsuario.showModal();
}

formUsuario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const datos = {
        nombre: formUsuario.nombre.value,
        correo: formUsuario.correo.value,
        rol: formUsuario.rol.value,
    };
    try {
        const respuesta = usuarioEditado
            ? await api(`/api/usuarios/${usuarioEditado.idUsuario}`, {
                  metodo: 'PATCH',
                  cuerpo: datos,
              })
            : await api('/api/usuarios', {
                  metodo: 'POST',
                  cuerpo: { ...datos, contrasena: formUsuario.contrasena.value },
              });
        dlgUsuario.close();
        mostrarMensaje(mensaje, 'ok', respuesta.mensaje);
        await cargar();
    } catch (error) {
        mostrarMensaje(document.getElementById('mensaje-usuario'), 'error', error.message);
    }
});

/** [RNF-12][S-14] Confirmación explícita escribiendo el correo */
function abrirBaja(usuario) {
    usuarioBaja = usuario;
    formBaja.reset();
    document.getElementById('dlg-baja-texto').textContent =
        `${usuario.nombre} ya no podrá iniciar sesión y sus sesiones abiertas se cerrarán. ` +
        'El registro se conserva (baja lógica) y la operación queda en la bitácora.';
    document.getElementById('b-etiqueta').textContent = `Escriba ${usuario.correo} para confirmar`;
    ocultar(document.getElementById('mensaje-baja'));
    dlgBaja.showModal();
}

formBaja.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    try {
        const respuesta = await api(`/api/usuarios/${usuarioBaja.idUsuario}/baja`, {
            metodo: 'POST',
            cuerpo: { confirmacion: formBaja.confirmacion.value },
        });
        dlgBaja.close();
        mostrarMensaje(mensaje, 'ok', respuesta.mensaje);
        await cargar();
    } catch (error) {
        mostrarMensaje(document.getElementById('mensaje-baja'), 'error', error.message);
    }
});

/** [RF-18] */
async function desbloquear(usuario) {
    try {
        const respuesta = await api(`/api/usuarios/${usuario.idUsuario}/desbloquear`, {
            metodo: 'POST',
        });
        mostrarMensaje(
            mensaje,
            'ok',
            `${respuesta.mensaje} ${usuario.nombre} ya puede iniciar sesión.`,
        );
        await cargar();
    } catch (error) {
        mostrarMensaje(mensaje, 'error', error.message);
    }
}

document.getElementById('agregar').addEventListener('click', abrirAlta);
filtros.addEventListener('submit', (evento) => {
    evento.preventDefault();
    cargar().catch((error) => mostrarMensaje(mensaje, 'error', error.message));
});
await cargar();
