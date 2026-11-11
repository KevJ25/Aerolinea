import type { Request, Response } from 'express';

/** Cookie de sesión: HttpOnly y SameSite=Strict; Secure cuando la conexión es HTTPS */
export const NOMBRE_COOKIE_SESION = 'sga_sesion';

export function leerTokenSesion(solicitud: Request): string | null {
    const encabezado = solicitud.headers.cookie ?? '';
    for (const parte of encabezado.split(';')) {
        const [nombre, ...valor] = parte.trim().split('=');
        if (nombre === NOMBRE_COOKIE_SESION) {
            return decodeURIComponent(valor.join('='));
        }
    }
    return null;
}

export function escribirCookieSesion(solicitud: Request, respuesta: Response, token: string): void {
    respuesta.cookie(NOMBRE_COOKIE_SESION, token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: solicitud.secure,
        path: '/',
    });
}

export function borrarCookieSesion(solicitud: Request, respuesta: Response): void {
    respuesta.clearCookie(NOMBRE_COOKIE_SESION, {
        httpOnly: true,
        sameSite: 'strict',
        secure: solicitud.secure,
        path: '/',
    });
}
