import { randomBytes } from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';

/**
 * [RNF-03][S-01] Resumen Argon2id con sal única de 16 bytes por usuario.
 * Parámetros: 64 MiB de memoria, 3 iteraciones, paralelismo 4, 32 bytes.
 * La base de datos rechaza cualquier valor que no sea un resumen Argon2id.
 */
const BYTES_SAL = 16;
const MEMORIA_KIB = 65536;
const ITERACIONES = 3;
const PARALELISMO = 4;
const LONGITUD_RESUMEN = 32;

export function calcularResumen(contrasena: string): Promise<string> {
    return argon2id({
        password: contrasena,
        salt: randomBytes(BYTES_SAL),
        parallelism: PARALELISMO,
        iterations: ITERACIONES,
        memorySize: MEMORIA_KIB,
        hashLength: LONGITUD_RESUMEN,
        outputType: 'encoded',
    });
}

export async function verificarContrasena(resumen: string, contrasena: string): Promise<boolean> {
    try {
        return await argon2Verify({ password: contrasena, hash: resumen });
    } catch {
        return false;
    }
}

/**
 * Resumen de una contraseña aleatoria que nadie conoce. Cuando el correo no
 * existe se verifica contra él, para que la respuesta tarde lo mismo que con
 * una contraseña incorrecta y no revele qué correos están registrados (S-13).
 */
let resumenSimulado: Promise<string> | null = null;
export function obtenerResumenSimulado(): Promise<string> {
    resumenSimulado ??= calcularResumen(randomBytes(BYTES_SAL).toString('hex'));
    return resumenSimulado;
}
