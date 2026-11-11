import { ConflictException, Injectable } from '@nestjs/common';
import { BaseDatosService } from '../../comun/base-datos/base-datos.service';
import { DetalleReservacion, ReservacionesService } from '../reservaciones/reservaciones.service';

const ESTADOS_VUELO_CON_CHECK_IN = ['PROGRAMADO', 'ABIERTO', 'RETRASADO'];

/**
 * [CP-15] Motivo por el que una reservación no admite check-in, o null si lo
 * admite. Se informa al empleado en lugar de un rechazo genérico.
 */
export function motivoSinCheckIn(reservacion: DetalleReservacion): string | null {
    if (reservacion.estado === 'ABORDADA') {
        return `Esta reservación ya tiene check-in. Pase de abordar: ${reservacion.pase}.`;
    }
    if (reservacion.estado === 'CONFIRMADA' || reservacion.estado === 'PENDIENTE') {
        return 'La reservación no tiene un pago aprobado. El pasajero debe completar el pago antes del check-in.';
    }
    if (reservacion.estado !== 'PAGADA') {
        return `La reservación está ${reservacion.estado.toLowerCase()} y no admite check-in.`;
    }
    if (!ESTADOS_VUELO_CON_CHECK_IN.includes(reservacion.estadoVuelo)) {
        return `El vuelo está ${reservacion.estadoVuelo.toLowerCase()} y ya no admite check-in.`;
    }
    return null;
}

@Injectable()
export class CheckInService {
    constructor(
        private readonly baseDatos: BaseDatosService,
        private readonly reservaciones: ReservacionesService,
    ) {}

    async consultar(codigo: string) {
        const reservacion = await this.reservaciones.obtener(codigo);
        return { ...reservacion, motivo: motivoSinCheckIn(reservacion) };
    }

    /**
     * [RF-15][RN-03][CA-09] Documenta una reservación PAGADA y emite el pase de
     * abordar único. La función de la base vuelve a validar bajo bloqueo.
     */
    async realizar(idEmpleado: number, codigo: string): Promise<string> {
        const motivo = motivoSinCheckIn(await this.reservaciones.obtener(codigo));
        if (motivo) throw new ConflictException(motivo);
        return this.baseDatos.transaccion(idEmpleado, async (cliente) => {
            const resultado = await cliente.query<{ pase: string }>(
                'SELECT realizar_check_in($1, $2) AS pase',
                [codigo, idEmpleado],
            );
            return resultado.rows[0].pase;
        });
    }
}
