import { api, enlazarPolitica, mostrarMensaje, ocultar } from './comun.js';

const formulario = document.getElementById('formulario');
const mensaje = document.getElementById('mensaje');
const enviar = document.getElementById('enviar');

enlazarPolitica(formulario.contrasena, document.getElementById('politica'));

formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    ocultar(mensaje);
    formulario.correo.removeAttribute('aria-invalid');
    enviar.disabled = true;
    try {
        await api('/api/autenticacion/registro', {
            metodo: 'POST',
            cuerpo: {
                nombre: formulario.nombre.value,
                correo: formulario.correo.value,
                contrasena: formulario.contrasena.value,
                confirmacion: formulario.confirmacion.value,
                aceptaAviso: formulario.aviso.checked,
            },
        });
        window.location.assign('/iniciar-sesion?registro=ok');
    } catch (error) {
        if (error.estado === 409) formulario.correo.setAttribute('aria-invalid', 'true');
        mostrarMensaje(mensaje, 'error', error.message);
    } finally {
        enviar.disabled = false;
    }
});
