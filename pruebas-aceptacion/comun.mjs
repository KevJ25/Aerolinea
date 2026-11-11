// Utilidades compartidas por las pruebas de aceptación de cada sprint.
import { randomBytes } from 'node:crypto';
import { argon2id } from 'hash-wasm';

export const BASE = process.env.SGA_URL ?? 'http://127.0.0.1:3000';
export const SUFIJO = Date.now().toString(36);
export const DOMINIO = '@prueba-aceptacion.mx';
export const correo = (nombre) => `${nombre}.${SUFIJO}${DOMINIO}`;

const resultado = { exitos: 0, fallas: 0 };
const registro = [];
let sprintActual = '';

/** El ejecutor indica qué sprint corre, para agrupar las verificaciones del reporte */
export function iniciarSprint(numero) {
    sprintActual = String(numero);
}

/**
 * Registra una verificación. Los casos del manual que cubre (CP-nn) se toman
 * de la descripción, así el reporte de ejecución (Tabla 42) se arma solo.
 */
export function verificar(descripcion, condicion, detalle = '') {
    const correcta = Boolean(condicion);
    registro.push({
        sprint: sprintActual,
        descripcion,
        correcta,
        detalle: correcta ? '' : detalle,
        casos: descripcion.match(/CP-\d+/g) ?? [],
    });
    if (correcta) {
        resultado.exitos += 1;
        console.log(`OK    ${descripcion}`);
    } else {
        resultado.fallas += 1;
        console.log(`FALLA ${descripcion}${detalle ? `: ${detalle}` : ''}`);
    }
}

export function verificaciones() {
    return [...registro];
}

export function seccion(titulo) {
    console.log(`\n== ${titulo}`);
}

export function resumen() {
    return { ...resultado };
}

/** Navegador mínimo: conserva la cookie de sesión entre peticiones */
export class Navegador {
    cookie = '';

    async pedir(ruta, { metodo = 'GET', cuerpo } = {}) {
        const encabezados = {};
        if (cuerpo !== undefined) encabezados['Content-Type'] = 'application/json';
        if (this.cookie) encabezados.Cookie = this.cookie;
        const inicio = performance.now();
        const respuesta = await fetch(BASE + ruta, {
            method: metodo,
            redirect: 'manual',
            headers: encabezados,
            body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        });
        for (const linea of respuesta.headers.getSetCookie()) {
            const [par] = linea.split(';');
            const [nombre, valor] = par.split('=');
            if (nombre === 'sga_sesion') this.cookie = valor ? `sga_sesion=${valor}` : '';
        }
        const tipo = respuesta.headers.get('content-type') ?? '';
        const datos = tipo.includes('json') ? await respuesta.json() : await respuesta.text();
        return {
            estado: respuesta.status,
            datos,
            encabezados: respuesta.headers,
            ms: performance.now() - inicio,
        };
    }

    iniciarSesion(correoUsuario, contrasena) {
        return this.pedir('/api/autenticacion/iniciar-sesion', {
            metodo: 'POST',
            cuerpo: { correo: correoUsuario, contrasena },
        });
    }
}

export function resumenArgon2(contrasena) {
    return argon2id({
        password: contrasena,
        salt: randomBytes(16),
        parallelism: 4,
        iterations: 3,
        memorySize: 65536,
        hashLength: 32,
        outputType: 'encoded',
    });
}

const ROLES = { Administrador: 1, Empleado: 2, Pasajero: 3 };

/** Crea un usuario directamente en la base (preparación de la prueba) */
export async function crearUsuario(bd, nombre, correoUsuario, contrasena, rol) {
    const resumenContrasena = await resumenArgon2(contrasena);
    const { rows } = await bd.query(
        'INSERT INTO usuario (nombre, correo, contrasena_hash, id_rol) VALUES ($1, $2, $3, $4) RETURNING id_usuario',
        [nombre, correoUsuario, resumenContrasena, ROLES[rol]],
    );
    return rows[0].id_usuario;
}

/** Crea el usuario y devuelve un navegador con su sesión iniciada */
export async function sesionDe(bd, nombre, rol, contrasena = 'Prueba-Aceptacion-2026!') {
    const correoUsuario = correo(`${nombre}-${randomBytes(3).toString('hex')}`);
    const id = await crearUsuario(bd, nombre, correoUsuario, contrasena, rol);
    const navegador = new Navegador();
    await navegador.iniciarSesion(correoUsuario, contrasena);
    return { navegador, correo: correoUsuario, id };
}

/** Código IATA que aún no existe, para que cada ejecución use aeropuertos propios */
export async function iataLibre(bd) {
    for (;;) {
        const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const codigo = Array.from(randomBytes(3), (b) => letras[b % letras.length]).join('');
        const { rowCount } = await bd.query('SELECT 1 FROM aeropuerto WHERE codigo_iata = $1', [
            codigo,
        ]);
        if (rowCount === 0) return codigo;
    }
}

/** Fecha y hora local de México a n días de hoy, en el formato de un campo datetime-local */
export function fechaHoraEnDias(dias, hora = '10:00') {
    const fecha = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Mexico_City' }).format(
        new Date(Date.now() + dias * 86400000),
    );
    return `${fecha}T${hora}`;
}

/** Número de vuelo distinto en cada ejecución, para que la prueba se pueda repetir en la misma base */
const BASE_NUMERO = (Number.parseInt(SUFIJO.slice(-5), 36) % 8000) + 1000;
export function numeroVuelo(prefijo, desplazamiento = 0) {
    return `${prefijo} ${BASE_NUMERO + desplazamiento}`;
}

/** Detiene la prueba con un mensaje claro si un paso de preparación no funcionó */
export function exigir(respuesta, descripcion) {
    if (respuesta.estado >= 300) {
        throw new Error(
            `No se pudo preparar: ${descripcion} (${respuesta.estado} ${JSON.stringify(respuesta.datos)})`,
        );
    }
    return respuesta.datos;
}

/** Fecha y hora local de México dentro de n horas, en el formato de un campo datetime-local */
export function fechaHoraEnHoras(horas) {
    const partes = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(new Date(Date.now() + horas * 3600000));
    return partes.replace(' ', 'T');
}
