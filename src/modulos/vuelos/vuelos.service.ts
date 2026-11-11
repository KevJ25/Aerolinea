import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { BaseDatosService } from '../../comun/base-datos/base-datos.service';
import { conflictoPorUnicidad, EntradaInvalida } from '../../comun/validacion/validacion';

export interface DatosVuelo {
    numeroVuelo: string;
    idRuta: number;
    idAvion: number;
    salida: string;
    llegada: string;
    tarifa: number;
}

export interface CambiosVuelo {
    salida?: string;
    llegada?: string;
    tarifa?: number;
    estado?: string;
}

/** [RN-05] Una ruta conecta exactamente dos aeropuertos */
const AEROPUERTOS_POR_RUTA = 2;
const LIMITE_DISPONIBLES = 200;
const LIMITE_ALTERNATIVAS = 8;
export const DIAS_CALENDARIO = 14;
const MENSAJE_LLEGADA = 'La llegada debe ser posterior a la salida.';
const UNICIDAD_RUTA = {
    ruta_id_aeropuerto_origen_id_aeropuerto_destino_key: 'Esa ruta ya existe.',
};
const UNICIDAD_VUELO = {
    vuelo_numero_vuelo_fecha_salida_key: 'Ya existe un vuelo con ese número y esa hora de salida.',
};

/** Vuelo con su ruta, aeronave y ocupación; base de los listados y del detalle */
const CONSULTA_VUELOS = `
    SELECT v.id_vuelo AS "idVuelo", v.numero_vuelo AS "numeroVuelo",
           ao.codigo_iata AS origen, ao.ciudad AS "ciudadOrigen",
           ad.codigo_iata AS destino, ad.ciudad AS "ciudadDestino",
           v.fecha_salida AS salida, v.fecha_llegada AS llegada, v.tarifa::float AS tarifa,
           v.estado_vuelo AS estado, av.matricula, av.modelo,
           (SELECT count(*)::int FROM asiento a WHERE a.id_vuelo = v.id_vuelo) AS "asientosTotales",
           (SELECT count(*)::int FROM disponibilidad_asiento d
             WHERE d.id_vuelo = v.id_vuelo AND d.estado_asiento = 'LIBRE') AS "asientosLibres"
    FROM vuelo v
    JOIN ruta ru       ON ru.id_ruta = v.id_ruta
    JOIN aeropuerto ao ON ao.id_aeropuerto = ru.id_aeropuerto_origen
    JOIN aeropuerto ad ON ad.id_aeropuerto = ru.id_aeropuerto_destino
    JOIN avion av      ON av.id_avion = v.id_avion`;

function esViolacionLlegada(error: unknown): boolean {
    return (error as { constraint?: string }).constraint === 'vuelo_check';
}

@Injectable()
export class VuelosService {
    constructor(private readonly baseDatos: BaseDatosService) {}

    // ------------------------------------------------------------ rutas

    listarRutas() {
        return this.baseDatos.consultar(
            `SELECT ru.id_ruta AS "idRuta", ao.codigo_iata AS origen, ao.ciudad AS "ciudadOrigen",
                    ad.codigo_iata AS destino, ad.ciudad AS "ciudadDestino", ru.activo,
                    (ao.activo AND ad.activo) AS "aeropuertosActivos"
             FROM ruta ru
             JOIN aeropuerto ao ON ao.id_aeropuerto = ru.id_aeropuerto_origen
             JOIN aeropuerto ad ON ad.id_aeropuerto = ru.id_aeropuerto_destino
             ORDER BY ru.activo DESC, ao.codigo_iata, ad.codigo_iata`,
        );
    }

    /** [V-07][RN-05] Dos aeropuertos activos y distintos */
    async crearRuta(idActor: number, idOrigen: number, idDestino: number): Promise<number> {
        if (idOrigen === idDestino) {
            throw new EntradaInvalida('El origen y el destino deben ser aeropuertos distintos.');
        }
        try {
            return await this.baseDatos.transaccion(idActor, async (cliente) => {
                const activos = await cliente.query(
                    'SELECT 1 FROM aeropuerto WHERE id_aeropuerto = ANY($1) AND activo',
                    [[idOrigen, idDestino]],
                );
                if (activos.rowCount !== AEROPUERTOS_POR_RUTA) {
                    throw new EntradaInvalida('Ambos aeropuertos deben existir y estar activos.');
                }
                const resultado = await cliente.query<{ id: number }>(
                    'INSERT INTO ruta (id_aeropuerto_origen, id_aeropuerto_destino) VALUES ($1, $2) RETURNING id_ruta AS id',
                    [idOrigen, idDestino],
                );
                return resultado.rows[0].id;
            });
        } catch (error) {
            throw conflictoPorUnicidad(error, UNICIDAD_RUTA);
        }
    }

    async cambiarActivoRuta(idActor: number, idRuta: number, activo: boolean): Promise<void> {
        const filas = await this.baseDatos.transaccion(idActor, async (cliente) => {
            const resultado = await cliente.query(
                'UPDATE ruta SET activo = $2 WHERE id_ruta = $1',
                [idRuta, activo],
            );
            return resultado.rowCount;
        });
        if (filas === 0) throw new NotFoundException('No se encontró la ruta.');
    }

    // ------------------------------------------------------------ vuelos

    listarVuelos(estado: string) {
        return this.baseDatos.consultar(
            CONSULTA_VUELOS +
                ` WHERE ($1 = '' OR v.estado_vuelo = $1) ORDER BY v.fecha_salida DESC LIMIT 300`,
            [estado],
        );
    }

    async obtenerVuelo(idVuelo: number) {
        const [vuelo] = await this.baseDatos.consultar(CONSULTA_VUELOS + ' WHERE v.id_vuelo = $1', [
            idVuelo,
        ]);
        if (!vuelo) throw new NotFoundException('No se encontró el vuelo.');
        return vuelo;
    }

    /**
     * [RF-07][CA-04][CP-07] Solo vuelos que coinciden exactamente y admiten
     * reservaciones; la venta cierra 24 horas antes de la salida (RN-12).
     */
    buscarVuelos(origen: string, destino: string, fecha: string) {
        return this.baseDatos.consultar(
            CONSULTA_VUELOS +
                ` WHERE ao.codigo_iata = $1 AND ad.codigo_iata = $2
                    AND (v.fecha_salida AT TIME ZONE 'America/Mexico_City')::date = $3::date
                    AND v.estado_vuelo IN ('PROGRAMADO', 'ABIERTO', 'RETRASADO')
                    AND v.fecha_salida > now() + interval '24 hours'
                  ORDER BY v.fecha_salida`,
            [origen, destino, fecha],
        );
    }

    // ------------------------------------------------------------ apoyo a la búsqueda

    /**
     * Vuelos que admiten reservaciones en un intervalo de fechas, con origen y
     * destino opcionales. Alimenta la vista inicial "Próximos vuelos"; la
     * consulta exacta de RF-07 sigue siendo buscarVuelos().
     */
    disponibles(origen: string, destino: string, desde: string, hasta: string) {
        return this.baseDatos.consultar(
            CONSULTA_VUELOS +
                ` WHERE ($1 = '' OR ao.codigo_iata = $1) AND ($2 = '' OR ad.codigo_iata = $2)
                    AND (v.fecha_salida AT TIME ZONE 'America/Mexico_City')::date BETWEEN $3::date AND $4::date
                    AND v.estado_vuelo IN ('PROGRAMADO', 'ABIERTO', 'RETRASADO')
                    AND v.fecha_salida > now() + interval '24 hours'
                  ORDER BY v.fecha_salida LIMIT $5`,
            [origen, destino, desde, hasta, LIMITE_DISPONIBLES],
        );
    }

    /** Calendario: por cada día, cuántos vuelos hay y la tarifa más baja */
    calendario(origen: string, destino: string, desde: string) {
        return this.baseDatos.consultar(
            `SELECT to_char(d.dia, 'YYYY-MM-DD') AS fecha,
                    count(v.id_vuelo)::int AS vuelos,
                    min(v.tarifa)::float AS "tarifaMinima"
             FROM generate_series($3::date, $3::date + ($4::int - 1), interval '1 day') AS d (dia)
             LEFT JOIN (vuelo v
                        JOIN ruta ru       ON ru.id_ruta = v.id_ruta
                        JOIN aeropuerto ao ON ao.id_aeropuerto = ru.id_aeropuerto_origen
                        JOIN aeropuerto ad ON ad.id_aeropuerto = ru.id_aeropuerto_destino)
                    ON (v.fecha_salida AT TIME ZONE 'America/Mexico_City')::date = d.dia::date
                   AND ($1 = '' OR ao.codigo_iata = $1) AND ($2 = '' OR ad.codigo_iata = $2)
                   AND v.estado_vuelo IN ('PROGRAMADO', 'ABIERTO', 'RETRASADO')
                   AND v.fecha_salida > now() + interval '24 hours'
             GROUP BY d.dia ORDER BY d.dia`,
            [origen, destino, desde, DIAS_CALENDARIO],
        );
    }

    /**
     * Sugerencias cuando una búsqueda no tiene resultados: el siguiente vuelo de
     * la ruta a partir de la fecha y los destinos (u orígenes) con vuelos próximos.
     */
    async sugerencias(origen: string, destino: string, fecha: string) {
        const [siguiente] =
            origen && destino
                ? await this.baseDatos.consultar(
                      CONSULTA_VUELOS +
                          ` WHERE ao.codigo_iata = $1 AND ad.codigo_iata = $2
                              AND (v.fecha_salida AT TIME ZONE 'America/Mexico_City')::date >= $3::date
                              AND v.estado_vuelo IN ('PROGRAMADO', 'ABIERTO', 'RETRASADO')
                              AND v.fecha_salida > now() + interval '24 hours'
                            ORDER BY v.fecha_salida LIMIT 1`,
                      [origen, destino, fecha],
                  )
                : [];
        const alternativas = await this.baseDatos.consultar(
            `SELECT CASE WHEN $1 <> '' THEN ad.codigo_iata ELSE ao.codigo_iata END AS codigo,
                    CASE WHEN $1 <> '' THEN ad.ciudad ELSE ao.ciudad END AS ciudad,
                    min(v.fecha_salida) AS "proximaSalida", count(*)::int AS vuelos
             FROM vuelo v
             JOIN ruta ru       ON ru.id_ruta = v.id_ruta
             JOIN aeropuerto ao ON ao.id_aeropuerto = ru.id_aeropuerto_origen
             JOIN aeropuerto ad ON ad.id_aeropuerto = ru.id_aeropuerto_destino
             WHERE (($1 <> '' AND ao.codigo_iata = $1) OR ($1 = '' AND $2 <> '' AND ad.codigo_iata = $2))
               AND v.estado_vuelo IN ('PROGRAMADO', 'ABIERTO', 'RETRASADO')
               AND v.fecha_salida > now() + interval '24 hours'
             GROUP BY 1, 2 ORDER BY 3 LIMIT $3`,
            [origen, destino, LIMITE_ALTERNATIVAS],
        );
        return { siguiente: siguiente ?? null, alternativas };
    }

    /** [RF-09][CA-05] Estado de cada asiento; "mio" solo marca los del usuario que consulta (S-08) */
    asientos(idVuelo: number, idUsuario: number) {
        return this.baseDatos.consultar(
            `SELECT d.numero, d.estado_asiento AS estado, (r.id_reservacion IS NOT NULL) AS mio
             FROM disponibilidad_asiento d
             LEFT JOIN reservacion r ON r.id_asiento = d.id_asiento AND r.id_usuario = $2
                  AND r.estado IN ('PENDIENTE', 'CONFIRMADA', 'PAGADA', 'ABORDADA')
             WHERE d.id_vuelo = $1
             ORDER BY regexp_replace(d.numero, '[A-F]', '')::int, right(d.numero, 1)`,
            [idVuelo, idUsuario],
        );
    }

    private async validarProgramacion(cliente: PoolClient, datos: DatosVuelo): Promise<void> {
        const ruta = await cliente.query(
            `SELECT 1 FROM ruta ru
             JOIN aeropuerto ao ON ao.id_aeropuerto = ru.id_aeropuerto_origen AND ao.activo
             JOIN aeropuerto ad ON ad.id_aeropuerto = ru.id_aeropuerto_destino AND ad.activo
             WHERE ru.id_ruta = $1 AND ru.activo`,
            [datos.idRuta],
        );
        if (ruta.rowCount === 0) throw new EntradaInvalida('La ruta no existe o no está activa.');
        const avion = await cliente.query(
            "SELECT 1 FROM avion WHERE id_avion = $1 AND activo AND estado_operativo = 'DISPONIBLE'",
            [datos.idAvion],
        );
        if (avion.rowCount === 0)
            throw new EntradaInvalida('La aeronave no existe o no está disponible.');
        const salidaFutura = await cliente.query(
            `SELECT ($1::timestamp AT TIME ZONE 'America/Mexico_City') > now() AS ok`,
            [datos.salida],
        );
        if (!salidaFutura.rows[0].ok)
            throw new EntradaInvalida('La salida debe ser una fecha y hora futuras.');
    }

    /** [RF-06][RF-08][CA-04][CP-06][CP-08] Al insertarse, la base genera los asientos */
    async programarVuelo(idActor: number, datos: DatosVuelo): Promise<number> {
        if (datos.llegada <= datos.salida) throw new EntradaInvalida(MENSAJE_LLEGADA);
        try {
            return await this.baseDatos.transaccion(idActor, async (cliente) => {
                await this.validarProgramacion(cliente, datos);
                const resultado = await cliente.query<{ id: number }>(
                    `INSERT INTO vuelo (numero_vuelo, id_ruta, id_avion, fecha_salida, fecha_llegada, tarifa)
                     VALUES ($1, $2, $3, $4::timestamp AT TIME ZONE 'America/Mexico_City', $5::timestamp AT TIME ZONE 'America/Mexico_City', $6)
                     RETURNING id_vuelo AS id`,
                    [
                        datos.numeroVuelo,
                        datos.idRuta,
                        datos.idAvion,
                        datos.salida,
                        datos.llegada,
                        datos.tarifa,
                    ],
                );
                return resultado.rows[0].id;
            });
        } catch (error) {
            if (esViolacionLlegada(error)) throw new EntradaInvalida(MENSAJE_LLEGADA);
            throw conflictoPorUnicidad(error, UNICIDAD_VUELO);
        }
    }

    /** Cambios de horario, tarifa o estado de un vuelo no cancelado (AUD-07 los audita) */
    async actualizarVuelo(idActor: number, idVuelo: number, cambios: CambiosVuelo): Promise<void> {
        try {
            const filas = await this.baseDatos.transaccion(idActor, async (cliente) => {
                const resultado = await cliente.query(
                    `UPDATE vuelo SET
                        fecha_salida  = coalesce($2::timestamp AT TIME ZONE 'America/Mexico_City', fecha_salida),
                        fecha_llegada = coalesce($3::timestamp AT TIME ZONE 'America/Mexico_City', fecha_llegada),
                        tarifa        = coalesce($4, tarifa),
                        estado_vuelo  = coalesce($5, estado_vuelo)
                     WHERE id_vuelo = $1 AND estado_vuelo <> 'CANCELADO'`,
                    [
                        idVuelo,
                        cambios.salida ?? null,
                        cambios.llegada ?? null,
                        cambios.tarifa ?? null,
                        cambios.estado ?? null,
                    ],
                );
                return resultado.rowCount;
            });
            if (filas === 0) throw new NotFoundException('El vuelo no existe o está cancelado.');
        } catch (error) {
            if (esViolacionLlegada(error)) throw new EntradaInvalida(MENSAJE_LLEGADA);
            throw error;
        }
    }

    /** [RN-09][RNF-12][S-14] Cancelación con confirmación; la base cancela sus reservaciones */
    async cancelarVuelo(idActor: number, idVuelo: number, confirmacion: unknown): Promise<number> {
        const vuelo = (await this.obtenerVuelo(idVuelo)) as { numeroVuelo: string; estado: string };
        if (
            typeof confirmacion !== 'string' ||
            confirmacion.trim().toUpperCase() !== vuelo.numeroVuelo
        ) {
            throw new EntradaInvalida(
                `Para confirmar escriba exactamente el número de vuelo: ${vuelo.numeroVuelo}.`,
            );
        }
        if (!['PROGRAMADO', 'ABIERTO', 'RETRASADO'].includes(vuelo.estado)) {
            throw new HttpException('Este vuelo ya no se puede cancelar.', HttpStatus.CONFLICT);
        }
        return this.baseDatos.transaccion(idActor, async (cliente) => {
            const activas = await cliente.query<{ total: number }>(
                `SELECT count(*)::int AS total FROM reservacion r JOIN asiento a USING (id_asiento)
                 WHERE a.id_vuelo = $1 AND r.estado IN ('PENDIENTE', 'CONFIRMADA', 'PAGADA')`,
                [idVuelo],
            );
            await cliente.query("UPDATE vuelo SET estado_vuelo = 'CANCELADO' WHERE id_vuelo = $1", [
                idVuelo,
            ]);
            return activas.rows[0].total;
        });
    }
}
