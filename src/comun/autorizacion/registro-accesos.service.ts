import { Injectable, Logger } from '@nestjs/common';
import { BaseDatosService } from '../base-datos/base-datos.service';

const LONGITUD_MAXIMA_RUTA = 200;

/** [CP-25][S-12] Registra en la bitácora los intentos de acceso denegados por rol */
@Injectable()
export class RegistroAccesosService {
    constructor(private readonly baseDatos: BaseDatosService) {}

    async registrarDenegado(idUsuario: number, metodo: string, ruta: string): Promise<void> {
        const detalle = `Acceso denegado a ${metodo} ${ruta.slice(0, LONGITUD_MAXIMA_RUTA)}`;
        try {
            await this.baseDatos.transaccion(idUsuario, (cliente) =>
                cliente.query("SELECT registrar_evento('ACCESO', 'Seguridad', $1)", [detalle]),
            );
        } catch (error) {
            Logger.error(
                `No se pudo registrar el acceso denegado: ${String(error)}`,
                'RegistroAccesos',
            );
        }
    }
}
