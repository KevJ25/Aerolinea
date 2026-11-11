import { el, formatoFecha, formatoHora } from './comun.js';

/** Pase de abordar con el diseño del mockup MK-08 */
export function tarjetaPase(r) {
    const dato = (etiqueta, valor) =>
        el('div', {}, el('dt', { texto: etiqueta }), el('dd', { texto: valor }));
    return el(
        'article',
        { class: 'pase', 'aria-label': `Pase de abordar ${r.pase}` },
        el(
            'div',
            { class: 'pase__cuerpo' },
            el(
                'div',
                { class: 'pase__encabezado' },
                el('span', { texto: 'Sistema de Gestión de Aerolínea' }),
                el('span', { texto: 'Pase de abordar' }),
            ),
            el(
                'div',
                { class: 'pase__ruta' },
                el(
                    'div',
                    {},
                    el('span', { class: 'iata', texto: r.origen }),
                    el('small', { texto: r.ciudadOrigen }),
                ),
                el(
                    'div',
                    { class: 'derecha' },
                    el('span', { class: 'iata', texto: r.destino }),
                    el('small', { texto: r.ciudadDestino }),
                ),
            ),
            el(
                'dl',
                { class: 'pase__datos' },
                dato('Pasajero', r.pasajero),
                dato('Vuelo', r.numeroVuelo),
                dato('Fecha', formatoFecha(r.salida)),
                dato('Salida', formatoHora(r.salida)),
                dato('Asiento', r.asiento),
                dato('Reservación', r.codigo),
            ),
        ),
        el(
            'div',
            { class: 'pase__talon' },
            el(
                'div',
                {},
                el('div', { texto: 'Número de pase' }),
                el('div', { class: 'pase__numero', texto: r.pase }),
            ),
            el('div', {
                class: 'pase__barras',
                role: 'img',
                'aria-label': `Código de barras del pase ${r.pase}`,
            }),
            el('div', { texto: `Asiento ${r.asiento}` }),
        ),
    );
}
