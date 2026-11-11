import { api, montarEncabezado, mostrarMensaje } from './comun.js';
import { tarjetaPase } from './pase-comun.js';

const sesion = await montarEncabezado();
const codigo = window.location.pathname.split('/').pop();
if (sesion.rol !== 'Pasajero') document.getElementById('volver').href = '/reservaciones';
document.getElementById('imprimir').addEventListener('click', () => window.print());

try {
    const r = await api(`/api/reservaciones/${codigo}`);
    if (r.pase) {
        document.getElementById('pase').replaceChildren(tarjetaPase(r));
    } else {
        mostrarMensaje(
            document.getElementById('mensaje'),
            'info',
            'Esta reservación todavía no tiene check-in, así que aún no hay pase de abordar.',
        );
    }
} catch (error) {
    mostrarMensaje(document.getElementById('mensaje'), 'error', error.message);
}
