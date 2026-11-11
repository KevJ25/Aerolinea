import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../comun/autorizacion/autorizacion.decoradores';
import { Rol } from '../../comun/autorizacion/rol.enum';
import { UsuarioAutenticado } from '../../comun/autorizacion/roles.guard';
import { exigirPoliticaContrasena } from '../../comun/validacion/politica-contrasena';
import { EntradaInvalida, exigirContrasena } from '../../comun/validacion/validacion';
import { UsuariosService } from './usuarios.service';

type SolicitudAutenticada = Request & { user: UsuarioAutenticado };

/**
 * Cuenta propia, para los tres perfiles. [S-08] Solo opera sobre el usuario de
 * la sesión: no recibe ningún identificador desde el navegador.
 */
@Roles(Rol.Administrador, Rol.Empleado, Rol.Pasajero)
@Controller('api/perfil')
export class PerfilController {
    constructor(private readonly usuarios: UsuariosService) {}

    @Get()
    consultar(@Req() solicitud: SolicitudAutenticada) {
        return this.usuarios.obtener(solicitud.user.idUsuario);
    }

    @Post('contrasena')
    @HttpCode(HttpStatus.OK)
    async cambiarContrasena(
        @Req() solicitud: SolicitudAutenticada,
        @Body() cuerpo: Record<string, unknown>,
    ) {
        const actual = exigirContrasena(cuerpo?.actual, 'la contraseña actual');
        const nueva = exigirContrasena(cuerpo?.nueva, 'la contraseña nueva');
        if (cuerpo?.confirmacion !== nueva) {
            throw new EntradaInvalida('La confirmación no coincide con la contraseña nueva.');
        }
        if (nueva === actual) {
            throw new EntradaInvalida('La contraseña nueva debe ser distinta de la actual.');
        }
        exigirPoliticaContrasena(nueva);
        const { idUsuario, correo } = solicitud.user;
        await this.usuarios.cambiarContrasenaPropia(idUsuario, correo ?? '', actual, nueva);
        return { mensaje: 'Su contraseña se actualizó.' };
    }
}
