import { Injectable, NotFoundException } from '@nestjs/common';
import { BaseDatosService } from '../../comun/base-datos/base-datos.service';
import { conflictoPorUnicidad } from '../../comun/validacion/validacion';

export interface Aeropuerto {
    idAeropuerto: number;
    codigoIata: string;
    nombre: string;
    ciudad: string;
    pais: string;
    activo: boolean;
}

export interface Avion {
    idAvion: number;
    matricula: string;
    modelo: string;
    capacidad: number;
    estadoOperativo: string;
    vuelosProgramados: number;
}

export interface DatosAeropuerto {
    codigoIata: string;
    nombre: string;
    ciudad: string;
    pais: string;
}

export interface DatosAvion {
    matricula: string;
    modelo: string;
    capacidad: number;
    estadoOperativo: string;
}

const UNICIDAD_AEROPUERTO = {
    aeropuerto_codigo_iata_key: 'Ya existe un aeropuerto con ese código IATA.',
};
const UNICIDAD_AVION = { avion_matricula_key: 'Ya existe una aeronave con esa matrícula.' };

const CONSULTA_AEROPUERTOS = `
    SELECT id_aeropuerto AS "idAeropuerto", codigo_iata AS "codigoIata", nombre, ciudad, pais, activo
    FROM aeropuerto`;

const CONSULTA_AVIONES = `
    SELECT a.id_avion AS "idAvion", a.matricula, a.modelo, a.capacidad, a.estado_operativo AS "estadoOperativo",
           (SELECT count(*)::int FROM vuelo v WHERE v.id_avion = a.id_avion
              AND v.estado_vuelo IN ('PROGRAMADO', 'ABIERTO', 'RETRASADO')) AS "vuelosProgramados"
    FROM avion a`;

/** [RF-04][RF-05][CA-03] Catálogos de aeropuertos y aeronaves (M-02, M-03) */
@Injectable()
export class CatalogosService {
    constructor(private readonly baseDatos: BaseDatosService) {}

    listarAeropuertos(soloActivos: boolean): Promise<Aeropuerto[]> {
        return this.baseDatos.consultar<Aeropuerto>(
            CONSULTA_AEROPUERTOS +
                ' WHERE ($1 = false OR activo) ORDER BY activo DESC, codigo_iata',
            [soloActivos],
        );
    }

    async crearAeropuerto(idActor: number, datos: DatosAeropuerto): Promise<number> {
        try {
            return await this.baseDatos.transaccion(idActor, async (cliente) => {
                const resultado = await cliente.query<{ id: number }>(
                    `INSERT INTO aeropuerto (codigo_iata, nombre, ciudad, pais)
                     VALUES ($1, $2, $3, $4) RETURNING id_aeropuerto AS id`,
                    [datos.codigoIata, datos.nombre, datos.ciudad, datos.pais],
                );
                return resultado.rows[0].id;
            });
        } catch (error) {
            throw conflictoPorUnicidad(error, UNICIDAD_AEROPUERTO);
        }
    }

    async actualizarAeropuerto(idActor: number, id: number, datos: DatosAeropuerto): Promise<void> {
        try {
            const filas = await this.baseDatos.transaccion(idActor, async (cliente) => {
                const resultado = await cliente.query(
                    `UPDATE aeropuerto SET codigo_iata = $2, nombre = $3, ciudad = $4, pais = $5
                     WHERE id_aeropuerto = $1`,
                    [id, datos.codigoIata, datos.nombre, datos.ciudad, datos.pais],
                );
                return resultado.rowCount;
            });
            if (filas === 0) throw new NotFoundException('No se encontró el aeropuerto.');
        } catch (error) {
            throw conflictoPorUnicidad(error, UNICIDAD_AEROPUERTO);
        }
    }

    /** [RF-04][V-12] Desactivar o reactivar; nunca se borra */
    async cambiarActivoAeropuerto(idActor: number, id: number, activo: boolean): Promise<void> {
        const filas = await this.baseDatos.transaccion(idActor, async (cliente) => {
            const resultado = await cliente.query(
                'UPDATE aeropuerto SET activo = $2 WHERE id_aeropuerto = $1',
                [id, activo],
            );
            return resultado.rowCount;
        });
        if (filas === 0) throw new NotFoundException('No se encontró el aeropuerto.');
    }

    listarAviones(): Promise<Avion[]> {
        return this.baseDatos.consultar<Avion>(CONSULTA_AVIONES + ' ORDER BY a.matricula');
    }

    async crearAvion(idActor: number, datos: DatosAvion): Promise<number> {
        try {
            return await this.baseDatos.transaccion(idActor, async (cliente) => {
                const resultado = await cliente.query<{ id: number }>(
                    `INSERT INTO avion (matricula, modelo, capacidad, estado_operativo)
                     VALUES ($1, $2, $3, $4) RETURNING id_avion AS id`,
                    [datos.matricula, datos.modelo, datos.capacidad, datos.estadoOperativo],
                );
                return resultado.rows[0].id;
            });
        } catch (error) {
            throw conflictoPorUnicidad(error, UNICIDAD_AVION);
        }
    }

    /**
     * Actualiza modelo, capacidad y estado operativo. La capacidad nueva aplica a
     * los vuelos que se programen después: los asientos de un vuelo ya programado
     * no cambian (RN-04 se cumple al generar los asientos).
     */
    async actualizarAvion(
        idActor: number,
        id: number,
        datos: Omit<DatosAvion, 'matricula'>,
    ): Promise<void> {
        const filas = await this.baseDatos.transaccion(idActor, async (cliente) => {
            const resultado = await cliente.query(
                'UPDATE avion SET modelo = $2, capacidad = $3, estado_operativo = $4 WHERE id_avion = $1',
                [id, datos.modelo, datos.capacidad, datos.estadoOperativo],
            );
            return resultado.rowCount;
        });
        if (filas === 0) throw new NotFoundException('No se encontró la aeronave.');
    }
}
