import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { join } from 'node:path';
import { AppModule } from './app.module';

const PUERTO_POR_DEFECTO = 3000;

/**
 * Encabezados de seguridad para todas las respuestas. La política de contenido
 * solo permite recursos del propio sistema: sin scripts en línea ni de terceros.
 */
function encabezadosSeguridad(
    _solicitud: Request,
    respuesta: Response,
    siguiente: NextFunction,
): void {
    respuesta.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; " +
            "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    respuesta.setHeader('X-Content-Type-Options', 'nosniff');
    respuesta.setHeader('X-Frame-Options', 'DENY');
    // same-origin: la página de asientos sabe de qué búsqueda vino; nada sale del sistema
    respuesta.setHeader('Referrer-Policy', 'same-origin');
    respuesta.setHeader('Cache-Control', 'no-store');
    siguiente();
}

async function iniciarServidor(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    // Detrás de un túnel o proxy HTTPS: req.secure activa la cookie Secure
    app.set('trust proxy', 1);
    app.disable('x-powered-by');
    app.use(encabezadosSeguridad);
    app.useStaticAssets(join(__dirname, '..', 'publico', 'recursos'), { prefix: '/recursos/' });
    const puerto = Number(process.env.PUERTO ?? PUERTO_POR_DEFECTO);
    await app.listen(puerto, '0.0.0.0');
    Logger.log(`Servidor escuchando en el puerto ${puerto}`, 'Arranque');
}

void iniciarServidor();
