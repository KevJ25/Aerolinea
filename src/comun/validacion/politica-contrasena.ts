import { EntradaInvalida } from './validacion';

/**
 * Política de contraseña (S-05, manual v2.1): al menos 8 caracteres, una
 * mayúscula, una minúscula, un número y un símbolo. La misma lista la muestra
 * la pantalla de registro (MK-02); el servidor es quien la hace cumplir (S-10).
 */
export const LONGITUD_MINIMA_CONTRASENA = 8;

export interface ReglaContrasena {
    clave: string;
    descripcion: string;
    cumple: (contrasena: string) => boolean;
}

export const REGLAS_CONTRASENA: ReglaContrasena[] = [
    {
        clave: 'longitud',
        descripcion: `Al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres`,
        cumple: (c) => c.length >= LONGITUD_MINIMA_CONTRASENA,
    },
    { clave: 'mayuscula', descripcion: 'Una letra mayúscula', cumple: (c) => /\p{Lu}/u.test(c) },
    { clave: 'minuscula', descripcion: 'Una letra minúscula', cumple: (c) => /\p{Ll}/u.test(c) },
    { clave: 'numero', descripcion: 'Al menos un número', cumple: (c) => /\d/.test(c) },
    {
        clave: 'simbolo',
        descripcion: 'Al menos un símbolo, por ejemplo ! # $ %',
        cumple: (c) => /[^\p{L}\d\s]/u.test(c),
    },
];

export function reglasIncumplidas(contrasena: string): string[] {
    return REGLAS_CONTRASENA.filter((regla) => !regla.cumple(contrasena)).map((r) => r.descripcion);
}

export function exigirPoliticaContrasena(contrasena: string): void {
    const faltantes = reglasIncumplidas(contrasena);
    if (faltantes.length > 0) {
        throw new EntradaInvalida(
            `La contraseña no cumple la política: ${faltantes.join(', ').toLowerCase()}.`,
        );
    }
}
