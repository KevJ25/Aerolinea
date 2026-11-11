import { Controller, Get } from '@nestjs/common';
import { Publico } from '../../comun/autorizacion/autorizacion.decoradores';

/** Verificación de disponibilidad del servicio, usada para medir KPI-08. */
@Controller('salud')
export class SaludController {
    @Publico()
    @Get()
    consultarEstado(): { estado: string } {
        return { estado: 'disponible' };
    }
}
