import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../comun/autorizacion/autorizacion.decoradores';
import { Rol } from '../../comun/autorizacion/rol.enum';
import { EntradaInvalida, fechaOHoy } from '../../comun/validacion/validacion';
import { ReportesService } from './reportes.service';

const MS_POR_DIA = 86_400_000;
const MAXIMO_DIAS_REPORTE = 92;

function intervalo(desde: unknown, hasta: unknown): [string, string] {
    const inicio = fechaOHoy(desde, 'la fecha inicial');
    const fin = fechaOHoy(hasta, 'la fecha final');
    const dias = (Date.parse(fin) - Date.parse(inicio)) / MS_POR_DIA;
    if (dias < 0 || dias > MAXIMO_DIAS_REPORTE) {
        throw new EntradaInvalida(
            `El periodo debe ser de 0 a ${MAXIMO_DIAS_REPORTE} días y la fecha final no puede ser anterior a la inicial.`,
        );
    }
    return [inicio, fin];
}

/** [RF-16][CA-10] Reportes (M-09): función del Administrador en la Tabla 8 */
@Roles(Rol.Administrador)
@Controller('api/reportes')
export class ReportesController {
    constructor(private readonly reportes: ReportesService) {}

    @Get('ocupacion')
    ocupacion(@Query('desde') desde: unknown, @Query('hasta') hasta: unknown) {
        return this.reportes.ocupacion(...intervalo(desde, hasta));
    }

    @Get('reservaciones')
    reservaciones(@Query('desde') desde: unknown, @Query('hasta') hasta: unknown) {
        return this.reportes.reservaciones(...intervalo(desde, hasta));
    }

    @Get('pagos')
    pagos(@Query('desde') desde: unknown, @Query('hasta') hasta: unknown) {
        return this.reportes.pagos(...intervalo(desde, hasta));
    }
}
