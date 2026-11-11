import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../comun/autorizacion/autorizacion.decoradores';
import { Rol } from '../../comun/autorizacion/rol.enum';
import { UsuarioAutenticado } from '../../comun/autorizacion/roles.guard';
import { EntradaInvalida, exigirCodigoReserva } from '../../comun/validacion/validacion';
import { CheckInService } from './checkin.service';

type SolicitudAutenticada = Request & { user: UsuarioAutenticado };

/** Check-in (M-08): función del Empleado en la Tabla 8 */
@Roles(Rol.Empleado)
@Controller('api/check-in')
export class CheckInController {
    constructor(private readonly checkIn: CheckInService) {}

    @Get(':codigo')
    consultar(@Param('codigo') codigo: string) {
        return this.checkIn.consultar(exigirCodigoReserva(codigo));
    }

    /** [RF-15][CA-09][CP-15] */
    @Post()
    @HttpCode(HttpStatus.CREATED)
    async realizar(
        @Req() solicitud: SolicitudAutenticada,
        @Body() cuerpo: Record<string, unknown>,
    ) {
        if (cuerpo?.identificacionVerificada !== true) {
            throw new EntradaInvalida(
                'Confirme que verificó la identificación oficial del pasajero.',
            );
        }
        const pase = await this.checkIn.realizar(
            solicitud.user.idUsuario,
            exigirCodigoReserva(cuerpo?.codigo),
        );
        return { pase, mensaje: `Check-in realizado. Pase de abordar ${pase}.` };
    }
}
