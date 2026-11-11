import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';

const MAX_CONEXIONES = 10;
const ESPERA_CONEXION_MS = 5000;

/**
 * Acceso a PostgreSQL con la cuenta de la aplicación (miembro de sga_aplicacion).
 * La conexión se configura con las variables estándar PGHOST, PGUSER, PGPASSWORD...
 * Todas las consultas usan parámetros ($1, $2...), nunca valores concatenados (S-11).
 */
@Injectable()
export class BaseDatosService implements OnModuleDestroy {
    private readonly pool = new Pool({
        max: MAX_CONEXIONES,
        connectionTimeoutMillis: ESPERA_CONEXION_MS,
        application_name: 'sga-api',
    });

    async consultar<T extends QueryResultRow>(
        sql: string,
        parametros: unknown[] = [],
    ): Promise<T[]> {
        const resultado = await this.pool.query<T>(sql, parametros);
        return resultado.rows;
    }

    /**
     * Ejecuta una operación en una transacción declarando quién actúa, para que la
     * bitácora registre al usuario de la aplicación (RF-17, contrato en docs/base-de-datos.md).
     */
    async transaccion<T>(
        idActor: number | null,
        operacion: (cliente: PoolClient) => Promise<T>,
    ): Promise<T> {
        const cliente = await this.pool.connect();
        try {
            await cliente.query('BEGIN');
            await cliente.query("SELECT set_config('sga.id_usuario', $1, true)", [
                idActor === null ? '' : String(idActor),
            ]);
            const resultado = await operacion(cliente);
            await cliente.query('COMMIT');
            return resultado;
        } catch (error) {
            await cliente.query('ROLLBACK');
            throw error;
        } finally {
            cliente.release();
        }
    }

    async onModuleDestroy(): Promise<void> {
        await this.pool.end();
    }
}
