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
import {
    exigirCapacidad,
    exigirEstadoOperativo,
    exigirIata,
    exigirId,
    exigirLugar,
    exigirMatricula,
    exigirTextoCatalogo,
} from '../../comun/validacion/validacion';
import { Aeropuerto, Avion, CatalogosService, DatosAeropuerto } from './catalogos.service';

type SolicitudAutenticada = Request & { user: UsuarioAutenticado };
const TODOS_LOS_ROLES = [Rol.Administrador, Rol.Empleado, Rol.Pasajero];

function datosAeropuerto(cuerpo: Record<string, unknown>): DatosAeropuerto {
    return {
        codigoIata: exigirIata(cuerpo?.codigoIata),
        nombre: exigirTextoCatalogo(cuerpo?.nombre, 'el nombre del aeropuerto'),
        ciudad: exigirLugar(cuerpo?.ciudad, 'la ciudad'),
        pais: exigirLugar(cuerpo?.pais, 'el país'),
    };
}

function datosAvion(cuerpo: Record<string, unknown>) {
    return {
        modelo: exigirTextoCatalogo(cuerpo?.modelo, 'el modelo'),
        capacidad: exigirCapacidad(cuerpo?.capacidad),
        estadoOperativo: exigirEstadoOperativo(cuerpo?.estadoOperativo ?? 'DISPONIBLE'),
    };
}

/** [RF-04][CA-03] Aeropuertos (M-02). Gestión solo para el administrador (Tabla 8). */
@Controller('api/aeropuertos')
export class AeropuertosController {
    constructor(private readonly catalogos: CatalogosService) {}

    /** Aeropuertos activos, para la búsqueda de vuelos de cualquier perfil */
    @Roles(...TODOS_LOS_ROLES)
    @Get('activos')
    listarActivos(): Promise<Aeropuerto[]> {
        return this.catalogos.listarAeropuertos(true);
    }

    @Roles(Rol.Administrador)
    @Get()
    listar(@Query('activos') activos: unknown): Promise<Aeropuerto[]> {
        return this.catalogos.listarAeropuertos(activos === 'true');
    }

    @Roles(Rol.Administrador)
    @Post()
    @HttpCode(HttpStatus.CREATED)
    async crear(@Req() solicitud: SolicitudAutenticada, @Body() cuerpo: Record<string, unknown>) {
        const idAeropuerto = await this.catalogos.crearAeropuerto(
            solicitud.user.idUsuario,
            datosAeropuerto(cuerpo),
        );
        return { idAeropuerto, mensaje: 'Aeropuerto registrado.' };
    }

    @Roles(Rol.Administrador)
    @Patch(':id')
    async actualizar(
        @Req() solicitud: SolicitudAutenticada,
        @Param('id') id: string,
        @Body() cuerpo: Record<string, unknown>,
    ) {
        await this.catalogos.actualizarAeropuerto(
            solicitud.user.idUsuario,
            exigirId(id),
            datosAeropuerto(cuerpo),
        );
        return { mensaje: 'Cambios guardados.' };
    }

    @Roles(Rol.Administrador)
    @Post(':id/desactivar')
    @HttpCode(HttpStatus.OK)
    async desactivar(@Req() solicitud: SolicitudAutenticada, @Param('id') id: string) {
        await this.catalogos.cambiarActivoAeropuerto(solicitud.user.idUsuario, exigirId(id), false);
        return {
            mensaje: 'Aeropuerto desactivado. Ya no aparecerá en la búsqueda ni en rutas nuevas.',
        };
    }

    @Roles(Rol.Administrador)
    @Post(':id/activar')
    @HttpCode(HttpStatus.OK)
    async activar(@Req() solicitud: SolicitudAutenticada, @Param('id') id: string) {
        await this.catalogos.cambiarActivoAeropuerto(solicitud.user.idUsuario, exigirId(id), true);
        return { mensaje: 'Aeropuerto reactivado.' };
    }
}

/** [RF-05][CA-03] Aeronaves (M-03). Solo el administrador. */
@Roles(Rol.Administrador)
@Controller('api/aviones')
export class AvionesController {
    constructor(private readonly catalogos: CatalogosService) {}

    @Get()
    listar(): Promise<Avion[]> {
        return this.catalogos.listarAviones();
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    async crear(@Req() solicitud: SolicitudAutenticada, @Body() cuerpo: Record<string, unknown>) {
        const idAvion = await this.catalogos.crearAvion(solicitud.user.idUsuario, {
            matricula: exigirMatricula(cuerpo?.matricula),
            ...datosAvion(cuerpo),
        });
        return { idAvion, mensaje: 'Aeronave registrada.' };
    }

    @Patch(':id')
    async actualizar(
        @Req() solicitud: SolicitudAutenticada,
        @Param('id') id: string,
        @Body() cuerpo: Record<string, unknown>,
    ) {
        await this.catalogos.actualizarAvion(
            solicitud.user.idUsuario,
            exigirId(id),
            datosAvion(cuerpo),
        );
        return { mensaje: 'Cambios guardados.' };
    }
}
