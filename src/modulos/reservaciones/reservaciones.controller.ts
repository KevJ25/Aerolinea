import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    NotFoundException,
    Param,
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
    exigirAsiento,
    exigirCodigoReserva,
    exigirCorreo,
    exigirId,
    exigirTarifa,
    textoOpcional,
} from '../../comun/validacion/validacion';
import { METODOS_PAGO, ReservacionesService } from './reservaciones.service';

type SolicitudAutenticada = Request & { user: UsuarioAutenticado };
const LONGITUD_MAXIMA_FILTRO = 120;

/** Reservaciones (M-06) */
@Controller('api/reservaciones')
export class ReservacionesController {
    constructor(private readonly reservaciones: ReservacionesService) {}

    /**
     * [RF-10][RF-11][CA-06][CP-10][CP-11] El pasajero reserva a su nombre; el
     * empleado, a nombre del pasajero cuyo correo indique (Tabla 8).
     */
    @Roles(Rol.Pasajero, Rol.Empleado)
    @Post()
    @HttpCode(HttpStatus.CREATED)
    async crear(@Req() solicitud: SolicitudAutenticada, @Body() cuerpo: Record<string, unknown>) {
        const { idUsuario, rol } = solicitud.user;
        const idPasajero =
            rol === Rol.Pasajero
                ? idUsuario
                : await this.reservaciones.idPasajeroPorCorreo(
                      exigirCorreo(cuerpo?.correoPasajero),
                  );
        const reservacion = await this.reservaciones.crear(
            idUsuario,
            idPasajero,
            exigirId(cuerpo?.idVuelo),
            exigirAsiento(cuerpo?.asiento),
        );
        return { ...reservacion, mensaje: `Reservación ${reservacion.codigo} creada.` };
    }

    /** [S-08] */
    @Roles(Rol.Pasajero)
    @Get('mias')
    mias(@Req() solicitud: SolicitudAutenticada) {
        return this.reservaciones.deUsuario(solicitud.user.idUsuario);
    }

    @Roles(Rol.Empleado, Rol.Administrador)
    @Get()
    buscar(@Query('codigo') codigo: unknown, @Query('correo') correo: unknown) {
        return this.reservaciones.buscar(
            textoOpcional(codigo, LONGITUD_MAXIMA_FILTRO).toUpperCase(),
            textoOpcional(correo, LONGITUD_MAXIMA_FILTRO),
        );
    }

    /** Detalle de una reservación: el pasajero solo las suyas (S-08); el personal, cualquiera */
    @Roles(Rol.Pasajero, Rol.Empleado, Rol.Administrador)
    @Get(':codigo')
    async detalle(@Req() solicitud: SolicitudAutenticada, @Param('codigo') codigo: string) {
        const reservacion = await this.reservaciones.obtener(exigirCodigoReserva(codigo));
        if (
            solicitud.user.rol === Rol.Pasajero &&
            reservacion.idUsuario !== solicitud.user.idUsuario
        ) {
            throw new NotFoundException('No se encontró la reservación.');
        }
        return reservacion;
    }

    /** [RF-13][RF-14][CA-08][CP-13] Solo el pasajero paga sus reservaciones (Tabla 8) */
    @Roles(Rol.Pasajero)
    @Post(':codigo/pago')
    @HttpCode(HttpStatus.OK)
    async pagar(
        @Req() solicitud: SolicitudAutenticada,
        @Param('codigo') codigo: string,
        @Body() cuerpo: Record<string, unknown>,
    ) {
        const metodo = cuerpo?.metodo;
        if (typeof metodo !== 'string' || !(METODOS_PAGO as readonly string[]).includes(metodo)) {
            throw new EntradaInvalida('Seleccione un método de pago de prueba.');
        }
        const estado = await this.reservaciones.pagar(
            solicitud.user.idUsuario,
            exigirCodigoReserva(codigo),
            exigirTarifa(cuerpo?.monto),
            metodo,
        );
        return {
            estado,
            mensaje:
                estado === 'APROBADO'
                    ? 'Pago aprobado. Su reservación quedó pagada.'
                    : 'Pago rechazado. Su reservación sigue confirmada y su asiento apartado; puede intentarlo de nuevo.',
        };
    }

    /** [RF-12][CA-07][CP-12] */
    @Roles(Rol.Pasajero, Rol.Empleado, Rol.Administrador)
    @Post(':codigo/cancelar')
    @HttpCode(HttpStatus.OK)
    async cancelar(@Req() solicitud: SolicitudAutenticada, @Param('codigo') codigo: string) {
        await this.reservaciones.cancelar(solicitud.user.idUsuario, exigirCodigoReserva(codigo));
        return { mensaje: 'Reservación cancelada. El asiento volvió a quedar disponible.' };
    }
}
