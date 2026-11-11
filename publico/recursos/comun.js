// Utilidades compartidas de las pantallas. Ningún dato se inserta como HTML:
// todo texto pasa por textContent para evitar inyección de código (S-10).

/** Petición a la API. Si la sesión expiró (S-03) lleva al inicio de sesión. */
export async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
    const respuesta = await fetch(ruta, {
        method: metodo,
        credentials: 'same-origin',
        headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (respuesta.status === 401 && !ruta.includes('/iniciar-sesion')) {
        window.location.assign('/iniciar-sesion');
        throw new Error('La sesión expiró.');
    }
    if (!respuesta.ok) {
        const error = new Error(datos.mensaje ?? 'Ocurrió un error. Inténtelo más tarde.');
        error.estado = respuesta.status;
        throw error;
    }
    return datos;
}

/** Crea un elemento con atributos y contenido de texto seguro */
export function el(etiqueta, atributos = {}, ...hijos) {
    const elemento = document.createElement(etiqueta);
    for (const [clave, valor] of Object.entries(atributos)) {
        if (valor === undefined || valor === null || valor === false) continue;
        if (clave === 'texto') elemento.textContent = valor;
        else if (/^al[A-Z]/.test(clave))
            elemento.addEventListener(clave.slice(2).toLowerCase(), valor);
        else elemento.setAttribute(clave, valor === true ? '' : valor);
    }
    for (const hijo of hijos.flat()) {
        if (hijo === null || hijo === undefined || hijo === false) continue;
        elemento.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
    }
    return elemento;
}

/** Muestra un mensaje en un contenedor; tipo: error, ok o info */
export function mostrarMensaje(contenedor, tipo, texto, titulo) {
    contenedor.replaceChildren();
    contenedor.className = `mensaje mensaje--${tipo}`;
    contenedor.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
    if (titulo) contenedor.append(el('strong', { texto: titulo }));
    contenedor.append(document.createTextNode(texto));
    contenedor.classList.remove('oculto');
}

export function ocultar(elemento) {
    elemento.classList.add('oculto');
}

export function formatoFechaHora(valor) {
    if (!valor) return '';
    return new Date(valor).toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
        dateStyle: 'short',
        timeStyle: 'medium',
    });
}

export function formatoFecha(valor) {
    if (!valor) return '';
    return new Date(valor).toLocaleDateString('es-MX', {
        timeZone: 'America/Mexico_City',
        dateStyle: 'long',
    });
}

const ICONO =
    '<svg class="marca__icono" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="#F2B705" ' +
    'stroke-width="2.2" stroke-linejoin="round"><path d="M3 17l26-11-8 22-5-8-13-3z"></path><path d="M16 20l13-14"></path></svg>';

/** Encabezado con el menú que el servidor define para el perfil (CP-03) */
export async function montarEncabezado() {
    const sesion = await api('/api/autenticacion/sesion');
    const marca = el('a', { class: 'marca', href: '/' }, 'Sistema de Gestión de Aerolínea');
    marca.insertAdjacentHTML('afterbegin', ICONO);
    const navegacion = el(
        'nav',
        { class: 'navegacion', 'aria-label': 'Principal' },
        sesion.menu.map((opcion) =>
            el('a', {
                href: opcion.ruta,
                texto: opcion.etiqueta,
                'aria-current': window.location.pathname === opcion.ruta ? 'page' : undefined,
            }),
        ),
    );
    const salir = el('button', { class: 'boton-salir', type: 'button', texto: 'Cerrar sesión' });
    salir.addEventListener('click', async () => {
        const { destino } = await api('/api/autenticacion/cerrar-sesion', { metodo: 'POST' });
        window.location.assign(destino);
    });
    const cuenta = el(
        'div',
        { class: 'cuenta' },
        el('span', { texto: sesion.nombre }),
        el('span', { class: 'cuenta__rol', texto: sesion.rol }),
        salir,
    );
    const encabezado = el(
        'header',
        { class: 'encabezado' },
        el('div', { class: 'encabezado__contenido' }, marca, navegacion, cuenta),
    );
    document.body.prepend(encabezado);
    return sesion;
}

/** Reglas de la política de contraseña (S-05); el servidor es quien las hace cumplir */
export const REGLAS_CONTRASENA = [
    { texto: 'Al menos 8 caracteres', cumple: (c) => c.length >= 8 },
    { texto: 'Una letra mayúscula', cumple: (c) => /\p{Lu}/u.test(c) },
    { texto: 'Una letra minúscula', cumple: (c) => /\p{Ll}/u.test(c) },
    { texto: 'Al menos un número', cumple: (c) => /\d/.test(c) },
    { texto: 'Al menos un símbolo, por ejemplo ! # $ %', cumple: (c) => /[^\p{L}\d\s]/u.test(c) },
];

/** Lista que indica en vivo qué reglas cumple la contraseña escrita */
export function enlazarPolitica(campo, lista) {
    const elementos = REGLAS_CONTRASENA.map((regla) => el('li', { texto: regla.texto }));
    lista.replaceChildren(...elementos);
    const actualizar = () =>
        REGLAS_CONTRASENA.forEach((regla, i) =>
            elementos[i].classList.toggle('cumple', regla.cumple(campo.value)),
        );
    campo.addEventListener('input', actualizar);
    actualizar();
}

/** Importe en pesos mexicanos */
export function formatoMoneda(valor) {
    return Number(valor).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

/** Hora local del centro de México, por ejemplo 06:40 */
export function formatoHora(valor) {
    return new Date(valor).toLocaleTimeString('es-MX', {
        timeZone: 'America/Mexico_City',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

/** Valor para un campo datetime-local a partir de una fecha ISO, en hora de México */
export function aFechaHoraLocal(valor) {
    const partes = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(new Date(valor));
    return partes.replace(' ', 'T');
}

/** Fecha de hoy en hora de México (AAAA-MM-DD) */
export function hoyMexico() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Mexico_City' }).format(new Date());
}

export function chip(texto) {
    const clave = String(texto).replace(/\s+/g, '_');
    return el('span', { class: `chip chip--${clave}`, texto: String(texto).replace(/_/g, ' ') });
}

export function boton(texto, alClick, variante = 'secundario') {
    return el('button', {
        class: `boton boton--${variante} boton--chico`,
        type: 'button',
        texto,
        alClick,
    });
}

/** Cierra cualquier diálogo desde sus botones con data-cerrar */
export function enlazarCierreDialogos() {
    document
        .querySelectorAll('[data-cerrar]')
        .forEach((elemento) =>
            elemento.addEventListener('click', () => elemento.closest('dialog').close()),
        );
}

/** Fila que ocupa todas las columnas con un mensaje (tabla vacía) */
export function filaVacia(columnas, texto) {
    return el('tr', {}, el('td', { colspan: columnas, class: 'celda-vacia', texto }));
}
