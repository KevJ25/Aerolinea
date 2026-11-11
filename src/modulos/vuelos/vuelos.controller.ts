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
    EntradaInvalida,
    ESTADOS_VUELO_EDITABLES,
    exigirFecha,
    exigirFechaHora,
    exigirIata,
    exigirId,
    exigirNumeroVuelo,
    exigirTarifa,
    fechaOHoy,
    iataOpcional,
    textoOpcional,
} from '../../comun/validacion/validacion';
import { CambiosVuelo, VuelosService } from './vuelos.service';

type SolicitudAutenticada = Request & { user: UsuarioAutenticado };
const TODOS_LOS_ROLES = [Rol.Administrador, Rol.Empleado, Rol.Pasajero];
const LONGITUD_MAXIMA_ESTADO = 20;
const MS_POR_DIA = 86_400_000;
const MAXIMO_DIAS_CONSULTA = 31;

function cambiosVuelo(cuerpo: Record<string, unknown>): CambiosVuelo {
    const estado = cuerpo?.estado;
    if (estado !== undefined && !(ESTADOS_VUELO_EDITABLES as readonly unknown[]).includes(estado)) {
        throw new EntradaInvalida(
            'Seleccione un estado válido. Para cancelar use la opción Cancelar vuelo.',
        );
    }
    return {
        salida:
            cuerpo?.salida === undefined ? undefined : exigirFechaHora(cuerpo.salida, 'la salida'),
        llegada:
            cuerpo?.llegada === undefined
                ? undefined
                : exigirFechaHora(cuerpo.llegada, 'la llegada'),
        tarifa: cuerpo?.tarifa === undefined ? undefined : exigirTarifa(cuerpo.tarifa),
        estado: estado as string | undefined,
    };
}

/** [RN-05] Rutas: solo el administrador (Tabla 8) */
@Roles(Rol.Administrador)
@Controller('api/rutas')
export class RutasController {
    constructor(private readonly vuelos: VuelosService) {}

    @Get()
    listar() {
        return this.vuelos.listarRutas();
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    async crear(@Req() solicitud: SolicitudAutenticada, @Body() cuerpo: Record<string, unknown>) {
        const idRuta = await this.vuelos.crearRuta(
            solicitud.user.idUsuario,
            exigirId(cuerpo?.idOrigen),
            exigirId(cuerpo?.idDestino),
        );
        return { idRuta, mensaje: 'Ruta registrada.' };
    }

    @Post(':id/desactivar')
    @HttpCode(HttpStatus.OK)
    async desactivar(@Req() solicitud: SolicitudAutenticada, @Param('id') id: string) {
        await this.vuelos.cambiarActivoRuta(solicitud.user.idUsuario, exigirId(id), false);
        return { mensaje: 'Ruta desactivada.' };
    }

    @Post(':id/activar')
    @HttpCode(HttpStatus.OK)
    async activar(@Req() solicitud: SolicitudAutenticada, @Param('id') id: string) {
        await this.vuelos.cambiarActivoRuta(solicitud.user.idUsuario, exigirId(id), true);
        return { mensaje: 'Ruta reactivada.' };
    }
}

/**
 * Vuelos (M-04) y asientos (M-05). La programación y la cancelación son del
 * administrador; la búsqueda, el detalle y la disponibilidad, de los tres perfiles.
 */
@Controller('api/vuelos')
export class VuelosController {
    constructor(private readonly vuelos: VuelosService) {}

    /** [RF-07][CA-04][CP-07] */
    @Roles(...TODOS_LOS_ROLES)
    @Get('buscar')
    buscar(
        @Query('origen') origen: unknown,
        @Query('destino') destino: unknown,
        @Query('fecha') fecha: unknown,
    ) {
        return this.vuelos.buscarVuelos(
            exigirIata(origen),
            exigirIata(destino),
            exigirFecha(fecha, 'la fecha'),
        );
    }

    /** Vista inicial y filtros parciales: vuelos disponibles en un intervalo */
    @Roles(...TODOS_LOS_ROLES)
    @Get('disponibles')
    disponibles(
        @Query('origen') origen: unknown,
        @Query('destino') destino: unknown,
        @Query('desde') desde: unknown,
        @Query('hasta') hasta: unknown,
    ) {
        const inicio = fechaOHoy(desde, 'la fecha inicial');
        const fin =
            hasta === undefined || hasta === '' ? inicio : exigirFecha(hasta, 'la fecha final');
        const dias = (Date.parse(fin) - Date.parse(inicio)) / MS_POR_DIA;
        if (dias < 0 || dias > MAXIMO_DIAS_CONSULTA) {
            throw new EntradaInvalida(
                `El intervalo de fechas debe ser de 0 a ${MAXIMO_DIAS_CONSULTA} días.`,
            );
        }
        return this.vuelos.disponibles(iataOpcional(origen), iataOpcional(destino), inicio, fin);
    }

    /** Franja de 14 días con número de vuelos y tarifa mínima por día */
    @Roles(...TODOS_LOS_ROLES)
    @Get('calendario')
    calendario(
        @Query('origen') origen: unknown,
        @Query('destino') destino: unknown,
        @Query('desde') desde: unknown,
    ) {
        return this.vuelos.calendario(
            iataOpcional(origen),
            iataOpcional(destino),
            fechaOHoy(desde, 'la fecha inicial'),
        );
    }

    /** Siguiente vuelo y alternativas cuando una búsqueda no tiene resultados */
    @Roles(...TODOS_LOS_ROLES)
    @Get('sugerencias')
    sugerencias(
        @Query('origen') origen: unknown,
        @Query('destino') destino: unknown,
        @Query('fecha') fecha: unknown,
    ) {
        return this.vuelos.sugerencias(
            iataOpcional(origen),
            iataOpcional(destino),
            fechaOHoy(fecha, 'la fecha'),
        );
    }

    @Roles(Rol.Administrador)
    @Get()
    listar(@Query('estado') estado: unknown) {
        return this.vuelos.listarVuelos(
            textoOpcional(estado, LONGITUD_MAXIMA_ESTADO).toUpperCase(),
        );
    }

    @Roles(...TODOS_LOS_ROLES)
    @Get(':id')
    obtener(@Param('id') id: string) {
        return this.vuelos.obtenerVuelo(exigirId(id));
    }

    /** [RF-09][CA-05][CP-09] */
    @Roles(...TODOS_LOS_ROLES)
    @Get(':id/asientos')
    asientos(@Req() solicitud: SolicitudAutenticada, @Param('id') id: string) {
        return this.vuelos.asientos(exigirId(id), solicitud.user.idUsuario);
    }

    /** [RF-06][RF-08][CP-06][CP-08] */
    @Roles(Rol.Administrador)
    @Post()
    @HttpCode(HttpStatus.CREATED)
    async programar(
        @Req() solicitud: SolicitudAutenticada,
        @Body() cuerpo: Record<string, unknown>,
    ) {
        const idVuelo = await this.vuelos.programarVuelo(solicitud.user.idUsuario, {
            numeroVuelo: exigirNumeroVuelo(cuerpo?.numeroVuelo),
            idRuta: exigirId(cuerpo?.idRuta),
            idAvion: exigirId(cuerpo?.idAvion),
            salida: exigirFechaHora(cuerpo?.salida, 'la salida'),
            llegada: exigirFechaHora(cuerpo?.llegada, 'la llegada'),
            tarifa: exigirTarifa(cuerpo?.tarifa),
        });
        return { idVuelo, mensaje: 'Vuelo programado. Sus asientos se generaron automáticamente.' };
    }

    @Roles(Rol.Administrador)
    @Patch(':id')
    async actualizar(
        @Req() solicitud: SolicitudAutenticada,
        @Param('id') id: string,
        @Body() cuerpo: Record<string, unknown>,
    ) {
        await this.vuelos.actualizarVuelo(
            solicitud.user.idUsuario,
            exigirId(id),
            cambiosVuelo(cuerpo),
        );
        return { mensaje: 'Cambios guardados.' };
    }

    /** [RN-09][RNF-12][S-14] */
    @Roles(Rol.Administrador)
    @Post(':id/cancelar')
    @HttpCode(HttpStatus.OK)
    async cancelar(
        @Req() solicitud: SolicitudAutenticada,
        @Param('id') id: string,
        @Body() cuerpo: Record<string, unknown>,
    ) {
        const canceladas = await this.vuelos.cancelarVuelo(
            solicitud.user.idUsuario,
            exigirId(id),
            cuerpo?.confirmacion,
        );
        return {
            reservacionesCanceladas: canceladas,
            mensaje: `Vuelo cancelado. Reservaciones canceladas: ${canceladas}.`,
        };
    }
}
