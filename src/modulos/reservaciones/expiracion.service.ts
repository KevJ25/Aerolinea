import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BaseDatosService } from '../../comun/base-datos/base-datos.service';

const MINUTOS_ENTRE_EJECUCIONES = 15;
const MS_POR_MINUTO = 60_000;
const INTERVALO_MS = MINUTOS_ENTRE_EJECUCIONES * MS_POR_MINUTO;

/**
 * [RN-11] Proceso periódico: cada 15 minutos marca como EXPIRADAS las
 * reservaciones sin pago cuyo plazo venció. crear_reservacion() además libera
 * en el momento un asiento vencido, así que un retraso nunca bloquea un asiento.
 */
@Injectable()
export class ExpiracionService implements OnModuleInit, OnModuleDestroy {
    private temporizador?: NodeJS.Timeout;

    constructor(private readonly baseDatos: BaseDatosService) {}

    onModuleInit(): void {
        void this.expirar();
        this.temporizador = setInterval(() => void this.expirar(), INTERVALO_MS);
        this.temporizador.unref();
    }

    onModuleDestroy(): void {
        clearInterval(this.temporizador);
    }

    async expirar(): Promise<number> {
        try {
            const [fila] = await this.baseDatos.consultar<{ total: number }>(
                'SELECT expirar_reservaciones() AS total',
            );
            if (fila.total > 0) {
                Logger.log(`Reservaciones expiradas: ${fila.total}`, 'Expiracion');
            }
            return fila.total;
        } catch (error) {
            Logger.error(`No se pudo ejecutar la expiración: ${String(error)}`, 'Expiracion');
            return 0;
        }
    }
}
