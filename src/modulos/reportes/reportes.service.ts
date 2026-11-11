import { Injectable } from '@nestjs/common';
import { BaseDatosService } from '../../comun/base-datos/base-datos.service';

/**
 * [RF-16][CA-10][CP-16] Reportes calculados al momento sobre las vistas de la
 * base (migración 004), que leen directamente las tablas transaccionales: no
 * hay tablas de resumen que puedan desincronizarse de los registros.
 */
@Injectable()
export class ReportesService {
    constructor(private readonly baseDatos: BaseDatosService) {}

    private async generar<T extends object>(
        filas: T[],
        totales: Record<string, number>,
        desde: string,
        hasta: string,
    ) {
        const [{ ahora }] = await this.baseDatos.consultar<{ ahora: string }>(
            'SELECT now() AS ahora',
        );
        return { desde, hasta, generadoEn: ahora, filas, totales };
    }

    async ocupacion(desde: string, hasta: string) {
        const filas = await this.baseDatos.consultar<{
            asientosTotales: number;
            asientosApartados: number;
            asientosVendidos: number;
        }>(
            `SELECT id_vuelo AS "idVuelo", numero_vuelo AS "numeroVuelo", origen, destino,
                    fecha_salida AS salida, estado_vuelo AS "estadoVuelo",
                    asientos_totales::int AS "asientosTotales", asientos_apartados::int AS "asientosApartados",
                    asientos_vendidos::int AS "asientosVendidos", porcentaje_ocupacion::float AS "porcentajeOcupacion"
             FROM reporte_ocupacion_vuelo
             WHERE (fecha_salida AT TIME ZONE 'America/Mexico_City')::date BETWEEN $1::date AND $2::date
             ORDER BY fecha_salida, numero_vuelo`,
            [desde, hasta],
        );
        const sumar = (campo: keyof (typeof filas)[number]) =>
            filas.reduce((total, f) => total + f[campo], 0);
        const totales = {
            vuelos: filas.length,
            asientosTotales: sumar('asientosTotales'),
            asientosApartados: sumar('asientosApartados'),
            asientosVendidos: sumar('asientosVendidos'),
        };
        return this.generar(filas, totales, desde, hasta);
    }

    async reservaciones(desde: string, hasta: string) {
        const filas = await this.baseDatos.consultar<Record<string, number | string>>(
            `SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, total::int AS total, confirmadas::int AS confirmadas,
                    pagadas::int AS pagadas, abordadas::int AS abordadas, canceladas::int AS canceladas,
                    expiradas::int AS expiradas
             FROM reporte_reservaciones_diarias
             WHERE fecha BETWEEN $1::date AND $2::date
             ORDER BY fecha`,
            [desde, hasta],
        );
        const campos = ['total', 'confirmadas', 'pagadas', 'abordadas', 'canceladas', 'expiradas'];
        const totales = Object.fromEntries(
            campos.map((c) => [c, filas.reduce((t, f) => t + Number(f[c]), 0)]),
        );
        return this.generar(filas, totales, desde, hasta);
    }

    async pagos(desde: string, hasta: string) {
        const filas = await this.baseDatos.consultar<Record<string, number | string>>(
            `SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, pagos_aprobados::int AS "pagosAprobados",
                    monto_aprobado::float AS "montoAprobado", pagos_rechazados::int AS "pagosRechazados"
             FROM reporte_pagos_diarios
             WHERE fecha BETWEEN $1::date AND $2::date
             ORDER BY fecha`,
            [desde, hasta],
        );
        const campos = ['pagosAprobados', 'montoAprobado', 'pagosRechazados'];
        const totales = Object.fromEntries(
            campos.map((c) => [c, filas.reduce((t, f) => t + Number(f[c]), 0)]),
        );
        return this.generar(filas, totales, desde, hasta);
    }
}
