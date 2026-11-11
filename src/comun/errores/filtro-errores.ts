import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { join } from 'node:path';

/** Directorio de las páginas HTML (fuera de dist/) */
export const DIRECTORIO_PAGINAS = join(__dirname, '..', '..', '..', 'publico', 'paginas');

const MENSAJE_GENERICO = 'Ocurrió un error. Inténtelo más tarde.';

/**
 * Códigos de error propios de la base de datos (docs/base-de-datos.md) y su
 * traducción a una respuesta genérica (S-13): nunca se reenvía el texto de PostgreSQL.
 */
const ERRORES_BASE_DATOS: Record<string, [number, string]> = {
    SGA01: [HttpStatus.CONFLICT, 'El asiento ya no está disponible. Elija otro asiento libre.'],
    SGA02: [
        HttpStatus.CONFLICT,
        'Este vuelo ya no admite la operación: fue cancelado, ya salió o su venta cerró 24 horas antes de la salida.',
    ],
    SGA03: [HttpStatus.CONFLICT, 'El registro no permite esta operación en su estado actual.'],
    SGA04: [HttpStatus.FORBIDDEN, 'No tiene permiso para realizar esta operación.'],
    SGA05: [HttpStatus.NOT_FOUND, 'No se encontró la información solicitada.'],
    SGA06: [HttpStatus.UNPROCESSABLE_ENTITY, 'Revise los datos capturados.'],
    // Restricciones de la base que el servidor no anticipó: unicidad y verificación
    '23505': [HttpStatus.CONFLICT, 'Ya existe un registro con esos datos.'],
    '23514': [HttpStatus.UNPROCESSABLE_ENTITY, 'Revise los datos capturados.'],
};

interface ErrorPostgres {
    code?: string;
}

function traducir(error: unknown): [number, string] {
    if (error instanceof HttpException) {
        const respuesta = error.getResponse();
        const mensaje = typeof respuesta === 'string' ? respuesta : error.message;
        return [error.getStatus(), mensaje];
    }
    const codigo = (error as ErrorPostgres)?.code;
    if (codigo && ERRORES_BASE_DATOS[codigo]) {
        return ERRORES_BASE_DATOS[codigo];
    }
    // Cualquier otro error, incluido 42501 (privilegio insuficiente), es un
    // defecto o un abuso: se registra completo en el servidor y no se expone.
    Logger.error(error instanceof Error ? error.stack : String(error), 'FiltroErrores');
    return [HttpStatus.INTERNAL_SERVER_ERROR, MENSAJE_GENERICO];
}

@Catch()
export class FiltroErrores implements ExceptionFilter {
    catch(error: unknown, host: ArgumentsHost): void {
        const contexto = host.switchToHttp();
        const solicitud = contexto.getRequest<Request>();
        const respuesta = contexto.getResponse<Response>();
        const [estado, mensaje] = traducir(error);

        if (solicitud.path.startsWith('/api/') || solicitud.method !== 'GET') {
            respuesta.status(estado).json({ estado, mensaje });
            return;
        }
        if (estado === HttpStatus.UNAUTHORIZED) {
            respuesta.redirect(HttpStatus.FOUND, '/iniciar-sesion');
            return;
        }
        if (estado === HttpStatus.FORBIDDEN) {
            respuesta.status(estado).sendFile(join(DIRECTORIO_PAGINAS, 'acceso-denegado.html'));
            return;
        }
        respuesta.status(estado).type('text/plain; charset=utf-8').send(mensaje);
    }
}
