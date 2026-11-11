import {
    api,
    enlazarPolitica,
    formatoFecha,
    montarEncabezado,
    mostrarMensaje,
    ocultar,
} from './comun.js';

await montarEncabezado();
const perfil = await api('/api/perfil');

document.getElementById('saludo').textContent = `Hola, ${perfil.nombre.split(' ')[0]}`;
document.getElementById('d-nombre').textContent = perfil.nombre;
document.getElementById('d-correo').textContent = perfil.correo;
document.getElementById('d-rol').textContent = perfil.rol;
document.getElementById('d-alta').textContent = formatoFecha(perfil.fechaAlta);

const formulario = document.getElementById('formulario');
const mensaje = document.getElementById('mensaje');
enlazarPolitica(formulario.nueva, document.getElementById('politica'));

formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    ocultar(mensaje);
    try {
        const respuesta = await api('/api/perfil/contrasena', {
            metodo: 'POST',
            cuerpo: {
                actual: formulario.actual.value,
                nueva: formulario.nueva.value,
                confirmacion: formulario.confirmacion.value,
            },
        });
        formulario.reset();
        formulario.nueva.dispatchEvent(new Event('input'));
        mostrarMensaje(mensaje, 'ok', respuesta.mensaje);
    } catch (error) {
        mostrarMensaje(mensaje, 'error', error.message);
    }
});
