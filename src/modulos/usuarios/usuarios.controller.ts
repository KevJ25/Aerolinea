import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Query,
    Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../comun/autorizacion/autorizacion.decoradores';
import { Rol } from '../../comun/autorizacion/rol.enum';
import { UsuarioAutenticado } from '../../comun/autorizacion/roles.guard';
import { exigirPoliticaContrasena } from '../../comun/validacion/politica-contrasena';
import {
    exigirContrasena,
    exigirCorreo,
    exigirId,
    exigirNombre,
    exigirRol,
    textoOpcional,
} from '../../comun/validacion/validacion';
import { UsuarioListado, UsuariosService } from './usuarios.service';

type SolicitudAutenticada = Request & { user: UsuarioAutenticado };
const LONGITUD_MAXIMA_BUSQUEDA = 120;
const OK = { mensaje: 'Cambios guardados.' };

/** [RF-03][S-07] Solo el administrador gestiona usuarios y perfiles */
@Roles(Rol.Administrador)
@Controller('api/usuarios')
export class UsuariosController {
    constructor(private readonly usuarios: UsuariosService) {}

    @Get()
    listar(
        @Query('buscar') buscar: unknown,
        @Query('rol') rol: unknown,
    ): Promise<UsuarioListado[]> {
        const filtroRol = textoOpcional(rol, LONGITUD_MAXIMA_BUSQUEDA);
        return this.usuarios.listar(
            textoOpcional(buscar, LONGITUD_MAXIMA_BUSQUEDA),
            filtroRol === '' ? '' : exigirRol(filtroRol),
        );
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    async crear(@Req() solicitud: SolicitudAutenticada, @Body() cuerpo: Record<string, unknown>) {
        const contrasena = exigirContrasena(cuerpo?.contrasena, 'la contraseña inicial');
        exigirPoliticaContrasena(contrasena);
        const idUsuario = await this.usuarios.crear(
            solicitud.user.idUsuario,
            exigirNombre(cuerpo?.nombre),
            exigirCorreo(cuerpo?.correo),
            contrasena,
            exigirRol(cuerpo?.rol),
        );
        return { idUsuario, mensaje: 'Usuario creado.' };
    }

    @Patch(':id')
    async actualizar(
        @Req() solicitud: SolicitudAutenticada,
        @Param('id') id: string,
        @Body() cuerpo: Record<string, unknown>,
    ) {
        await this.usuarios.actualizar(solicitud.user.idUsuario, exigirId(id), {
            nombre: cuerpo?.nombre === undefined ? undefined : exigirNombre(cuerpo.nombre),
            correo: cuerpo?.correo === undefined ? undefined : exigirCorreo(cuerpo.correo),
            rol: cuerpo?.rol === undefined ? undefined : exigirRol(cuerpo.rol),
        });
        return OK;
    }

    /** [RF-18] */
    @Post(':id/desbloquear')
    @HttpCode(HttpStatus.OK)
    async desbloquear(@Req() solicitud: SolicitudAutenticada, @Param('id') id: string) {
        await this.usuarios.desbloquear(solicitud.user.idUsuario, exigirId(id));
        return { mensaje: 'Cuenta desbloqueada.' };
    }

    /** [RNF-12][S-14][V-12] Baja lógica con confirmación explícita */
    @Post(':id/baja')
    @HttpCode(HttpStatus.OK)
    async darDeBaja(
        @Req() solicitud: SolicitudAutenticada,
        @Param('id') id: string,
        @Body() cuerpo: Record<string, unknown>,
    ) {
        await this.usuarios.darDeBaja(solicitud.user.idUsuario, exigirId(id), cuerpo?.confirmacion);
        return { mensaje: 'Usuario dado de baja.' };
    }
}
