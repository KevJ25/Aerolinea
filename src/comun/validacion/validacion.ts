import { HttpException, HttpStatus } from '@nestjs/common';
import { Rol } from '../autorizacion/rol.enum';

/** Error de validación de una entrada del usuario (S-10). Responde 422. */
export class EntradaInvalida extends HttpException {
    constructor(mensaje: string) {
        super(mensaje, HttpStatus.UNPROCESSABLE_ENTITY);
    }
}

const LONGITUD_MAXIMA_CORREO = 120;
const LONGITUD_MAXIMA_NOMBRE = 120;
const LONGITUD_MAXIMA_CONTRASENA = 128;
const PATRON_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Texto obligatorio, recortado y con longitud acotada */
export function exigirTexto(valor: unknown, campo: string, maximo: number): string {
    if (typeof valor !== 'string' || valor.trim().length === 0) {
        throw new EntradaInvalida(`Capture ${campo}.`);
    }
    const texto = valor.trim();
    if (texto.length > maximo) {
        throw new EntradaInvalida(`${campo} admite como máximo ${maximo} caracteres.`);
    }
    return texto;
}

export function exigirNombre(valor: unknown): string {
    return exigirTexto(valor, 'el nombre', LONGITUD_MAXIMA_NOMBRE);
}

/** [V-01] Correo con formato válido, normalizado en minúsculas */
export function exigirCorreo(valor: unknown): string {
    const correo = exigirTexto(
        valor,
        'el correo electrónico',
        LONGITUD_MAXIMA_CORREO,
    ).toLowerCase();
    if (!PATRON_CORREO.test(correo)) {
        throw new EntradaInvalida('Escriba un correo electrónico válido.');
    }
    return correo;
}

/** La contraseña no se recorta: los espacios forman parte de ella */
export function exigirContrasena(valor: unknown, campo = 'la contraseña'): string {
    if (typeof valor !== 'string' || valor.length === 0) {
        throw new EntradaInvalida(`Capture ${campo}.`);
    }
    if (valor.length > LONGITUD_MAXIMA_CONTRASENA) {
        throw new EntradaInvalida(
            `${campo} admite como máximo ${LONGITUD_MAXIMA_CONTRASENA} caracteres.`,
        );
    }
    return valor;
}

export function exigirRol(valor: unknown): Rol {
    const roles = Object.values(Rol) as string[];
    if (typeof valor !== 'string' || !roles.includes(valor)) {
        throw new EntradaInvalida('Seleccione un perfil válido.');
    }
    return valor as Rol;
}

/** Identificador numérico positivo de la ruta */
export function exigirId(valor: unknown): number {
    const id = Number(valor);
    if (!Number.isInteger(id) || id <= 0) {
        throw new EntradaInvalida('Identificador inválido.');
    }
    return id;
}

/** Texto opcional para filtros: vacío si no viene */
export function textoOpcional(valor: unknown, maximo: number): string {
    return typeof valor === 'string' ? valor.trim().slice(0, maximo) : '';
}

// ---------------------------------------------------------------- Sprints 2 a 4

const PATRON_IATA = /^[A-Z]{3}$/;
const PATRON_MATRICULA = /^[A-Z0-9][A-Z0-9-]{1,9}$/;
const PATRON_NUMERO_VUELO = /^[A-Z0-9]{2} ?\d{1,4}$/;
const PATRON_ASIENTO = /^[1-9]\d{0,3}[A-F]$/;
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const PATRON_FECHA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const CAPACIDAD_MAXIMA = 600;
const TARIFA_MAXIMA = 999999.99;
const LONGITUD_MAXIMA_TEXTO_CATALOGO = 120;
const LONGITUD_MAXIMA_LUGAR = 80;
const DECIMALES_TARIFA = 100;

export const ESTADOS_OPERATIVOS = ['DISPONIBLE', 'MANTENIMIENTO', 'FUERA_DE_SERVICIO'] as const;
export const ESTADOS_VUELO_EDITABLES = [
    'PROGRAMADO',
    'ABIERTO',
    'RETRASADO',
    'EN VUELO',
    'ATERRIZADO',
] as const;

/** [V-03][RF-04][CP-04] Tres letras mayúsculas; el mensaje informa el formato esperado */
export function exigirIata(valor: unknown): string {
    const codigo = typeof valor === 'string' ? valor.trim() : '';
    if (!PATRON_IATA.test(codigo)) {
        throw new EntradaInvalida(
            'El código IATA debe tener exactamente tres letras mayúsculas, por ejemplo PBC.',
        );
    }
    return codigo;
}

export function exigirTextoCatalogo(valor: unknown, campo: string): string {
    return exigirTexto(valor, campo, LONGITUD_MAXIMA_TEXTO_CATALOGO);
}

export function exigirLugar(valor: unknown, campo: string): string {
    return exigirTexto(valor, campo, LONGITUD_MAXIMA_LUGAR);
}

/** [V-04][RF-05] Matrícula en mayúsculas, por ejemplo XA-SGA */
export function exigirMatricula(valor: unknown): string {
    const matricula = typeof valor === 'string' ? valor.trim().toUpperCase() : '';
    if (!PATRON_MATRICULA.test(matricula)) {
        throw new EntradaInvalida(
            'La matrícula debe tener de 2 a 10 letras, números o guiones, por ejemplo XA-SGA.',
        );
    }
    return matricula;
}

/** [V-05] Capacidad entera mayor que cero */
export function exigirCapacidad(valor: unknown): number {
    const capacidad = Number(valor);
    if (!Number.isInteger(capacidad) || capacidad <= 0 || capacidad > CAPACIDAD_MAXIMA) {
        throw new EntradaInvalida(
            `La capacidad debe ser un número entero entre 1 y ${CAPACIDAD_MAXIMA}.`,
        );
    }
    return capacidad;
}

export function exigirEstadoOperativo(valor: unknown): string {
    if (typeof valor !== 'string' || !(ESTADOS_OPERATIVOS as readonly string[]).includes(valor)) {
        throw new EntradaInvalida('Seleccione un estado operativo válido.');
    }
    return valor;
}

export function exigirNumeroVuelo(valor: unknown): string {
    const numero = typeof valor === 'string' ? valor.trim().toUpperCase().replace(/\s+/g, ' ') : '';
    if (!PATRON_NUMERO_VUELO.test(numero)) {
        throw new EntradaInvalida(
            'El número de vuelo debe tener dos letras o números y hasta cuatro dígitos, por ejemplo SG 1204.',
        );
    }
    return numero;
}

/** Tarifa positiva con dos decimales como máximo */
export function exigirTarifa(valor: unknown): number {
    const tarifa = Number(valor);
    if (
        !Number.isFinite(tarifa) ||
        tarifa <= 0 ||
        tarifa > TARIFA_MAXIMA ||
        Math.round(tarifa * DECIMALES_TARIFA) !== tarifa * DECIMALES_TARIFA
    ) {
        throw new EntradaInvalida(
            'La tarifa debe ser un importe mayor que cero, con dos decimales como máximo.',
        );
    }
    return tarifa;
}

/** Fecha y hora local del centro de México, como la envía un campo datetime-local */
export function exigirFechaHora(valor: unknown, campo: string): string {
    const texto = typeof valor === 'string' ? valor.trim() : '';
    if (!PATRON_FECHA_HORA.test(texto) || Number.isNaN(Date.parse(`${texto}:00Z`))) {
        throw new EntradaInvalida(`Capture ${campo} con fecha y hora válidas.`);
    }
    return texto;
}

export function exigirFecha(valor: unknown, campo: string): string {
    const texto = typeof valor === 'string' ? valor.trim() : '';
    if (!PATRON_FECHA.test(texto) || Number.isNaN(Date.parse(texto))) {
        throw new EntradaInvalida(`Capture ${campo} con el formato AAAA-MM-DD.`);
    }
    return texto;
}

/** Designación de asiento, por ejemplo 12C */
export function exigirAsiento(valor: unknown): string {
    const asiento = typeof valor === 'string' ? valor.trim().toUpperCase() : '';
    if (!PATRON_ASIENTO.test(asiento)) {
        throw new EntradaInvalida('Seleccione un asiento válido, por ejemplo 12C.');
    }
    return asiento;
}

/** Código de reservación de 8 caracteres */
export function exigirCodigoReserva(valor: unknown): string {
    const codigo = typeof valor === 'string' ? valor.trim().toUpperCase() : '';
    if (!/^[A-Z0-9]{8}$/.test(codigo)) {
        throw new EntradaInvalida('El código de reservación tiene 8 letras o números.');
    }
    return codigo;
}

/** Traduce la violación de una restricción de unicidad a un conflicto con mensaje claro */
export function conflictoPorUnicidad(
    error: unknown,
    restricciones: Record<string, string>,
): unknown {
    const restriccion = (error as { constraint?: string }).constraint ?? '';
    const mensaje = restricciones[restriccion];
    return mensaje ? new HttpException(mensaje, HttpStatus.CONFLICT) : error;
}

/** Código IATA opcional en filtros: vacío si no se eligió */
export function iataOpcional(valor: unknown): string {
    return typeof valor === 'string' && valor.trim() !== '' ? exigirIata(valor) : '';
}

/** Fecha de hoy en el centro de México (AAAA-MM-DD) */
export function hoyEnMexico(): string {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Mexico_City' }).format(new Date());
}

/** Fecha opcional en filtros; si no viene, hoy en el centro de México */
export function fechaOHoy(valor: unknown, campo: string): string {
    return typeof valor === 'string' && valor.trim() !== ''
        ? exigirFecha(valor, campo)
        : hoyEnMexico();
}
