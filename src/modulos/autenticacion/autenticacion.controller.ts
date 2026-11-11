import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Publico, Roles } from '../../comun/autorizacion/autorizacion.decoradores';
import { Rol } from '../../comun/autorizacion/rol.enum';
import { UsuarioAutenticado } from '../../comun/autorizacion/roles.guard';
import {
    borrarCookieSesion,
    escribirCookieSesion,
    leerTokenSesion,
} from '../../comun/autorizacion/sesion';
import {
    exigirPoliticaContrasena,
    REGLAS_CONTRASENA,
} from '../../comun/validacion/politica-contrasena';
import {
    EntradaInvalida,
    exigirContrasena,
    exigirCorreo,
    exigirNombre,
} from '../../comun/validacion/validacion';
import { AutenticacionService } from './autenticacion.service';
import { destinoInicial, menuDe } from './menu';

type SolicitudAutenticada = Request & { user: UsuarioAutenticado };
const TODOS_LOS_ROLES = [Rol.Administrador, Rol.Empleado, Rol.Pasajero];

@Controller('api/autenticacion')
export class AutenticacionController {
    constructor(private readonly autenticacion: AutenticacionService) {}

    /** Reglas de la política de contraseña, para que la pantalla las muestre */
    @Publico()
    @Get('politica-contrasena')
    consultarPolitica(): { reglas: string[] } {
        return { reglas: REGLAS_CONTRASENA.map((regla) => regla.descripcion) };
    }

    /** [RF-01][CP-01] */
    @Publico()
    @Post('registro')
    @HttpCode(HttpStatus.CREATED)
    async registrar(@Body() cuerpo: Record<string, unknown>): Promise<{ mensaje: string }> {
        const nombre = exigirNombre(cuerpo?.nombre);
        const correo = exigirCorreo(cuerpo?.correo);
        const contrasena = exigirContrasena(cuerpo?.contrasena);
        if (cuerpo?.confirmacion !== contrasena) {
            throw new EntradaInvalida('La confirmación no coincide con la contraseña.');
        }
        if (cuerpo?.aceptaAviso !== true) {
            throw new EntradaInvalida('Debe aceptar el aviso de privacidad para crear su cuenta.');
        }
        exigirPoliticaContrasena(contrasena);
        await this.autenticacion.registrarPasajero(nombre, correo, contrasena);
        return { mensaje: 'Su cuenta se creó correctamente. Ya puede iniciar sesión.' };
    }

    /** [RF-02][CP-02] */
    @Publico()
    @Post('iniciar-sesion')
    @HttpCode(HttpStatus.OK)
    async iniciarSesion(
        @Body() cuerpo: Record<string, unknown>,
        @Req() solicitud: Request,
        @Res({ passthrough: true }) respuesta: Response,
    ): Promise<{ destino: string }> {
        const correo = exigirCorreo(cuerpo?.correo);
        const contrasena = exigirContrasena(cuerpo?.contrasena);
        const sesion = await this.autenticacion.iniciarSesion(correo, contrasena);
        escribirCookieSesion(solicitud, respuesta, sesion.token);
        return { destino: destinoInicial(sesion.rol) };
    }

    /** [S-04] */
    @Roles(...TODOS_LOS_ROLES)
    @Post('cerrar-sesion')
    @HttpCode(HttpStatus.OK)
    async cerrarSesion(
        @Req() solicitud: Request,
        @Res({ passthrough: true }) respuesta: Response,
    ): Promise<{ destino: string }> {
        const token = leerTokenSesion(solicitud);
        if (token) {
            await this.autenticacion.cerrarSesion(token);
        }
        borrarCookieSesion(solicitud, respuesta);
        return { destino: '/iniciar-sesion' };
    }

    /** Datos de la sesión y menú del perfil [CP-03] */
    @Roles(...TODOS_LOS_ROLES)
    @Get('sesion')
    consultarSesion(@Req() solicitud: SolicitudAutenticada) {
        const { idUsuario, nombre, correo, rol } = solicitud.user;
        return { idUsuario, nombre, correo, rol, menu: menuDe(rol) };
    }
}
