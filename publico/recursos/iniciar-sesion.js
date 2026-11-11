import { api, mostrarMensaje, ocultar } from './comun.js';

const formulario = document.getElementById('formulario');
const mensaje = document.getElementById('mensaje');
const enviar = document.getElementById('enviar');

if (new URLSearchParams(window.location.search).get('registro') === 'ok') {
    mostrarMensaje(mensaje, 'ok', 'Su cuenta se creó correctamente. Ya puede iniciar sesión.');
}

formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    ocultar(mensaje);
    enviar.disabled = true;
    try {
        const { destino } = await api('/api/autenticacion/iniciar-sesion', {
            metodo: 'POST',
            cuerpo: { correo: formulario.correo.value, contrasena: formulario.contrasena.value },
        });
        window.location.assign(destino);
    } catch (error) {
        const bloqueada = error.estado === 423;
        mostrarMensaje(
            mensaje,
            'error',
            error.message,
            bloqueada ? 'Cuenta bloqueada temporalmente' : undefined,
        );
        formulario.contrasena.value = '';
        formulario.contrasena.focus();
    } finally {
        enviar.disabled = false;
    }
});
