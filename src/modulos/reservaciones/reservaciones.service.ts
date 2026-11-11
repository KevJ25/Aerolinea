import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BaseDatosService } from '../../comun/base-datos/base-datos.service';

export interface DetalleReservacion {
    codigo: string;
    estado: string;
    idUsuario: number;
    tarifa: number;
    fechaExpiracion: string;
    estadoVuelo: string;
    pase: string | null;
    [campo: string]: unknown;
}

export const METODOS_PAGO = ['TARJETA_PRUEBA_APROBADA', 'TARJETA_PRUEBA_RECHAZADA'] as const;

export interface ReservacionCreada {
    codigo: string;
    asiento: string;
    fechaExpiracion: string;
}

const LIMITE_LISTADO = 100;

const CONSULTA_RESERVACIONES = `
    SELECT r.codigo_reserva AS codigo, r.estado, r.fecha_creacion AS "fechaCreacion",
           r.fecha_expiracion AS "fechaExpiracion", a.numero AS asiento,
           v.id_vuelo AS "idVuelo", v.numero_vuelo AS "numeroVuelo", v.estado_vuelo AS "estadoVuelo",
           ao.codigo_iata AS origen, ad.codigo_iata AS destino, v.fecha_salida AS salida, v.tarifa::float AS tarifa,
           (SELECT p.estado FROM pago p WHERE p.id_reservacion = r.id_reservacion
             ORDER BY p.fecha_registro DESC LIMIT 1) AS pago,
           u.nombre AS pasajero, u.correo AS "correoPasajero", r.id_usuario AS "idUsuario",
           ao.ciudad AS "ciudadOrigen", ad.ciudad AS "ciudadDestino", v.fecha_llegada AS llegada,
           ci.num_pase_abordar AS pase, ci.fecha_check_in AS "fechaCheckIn"
    FROM reservacion r
    JOIN usuario u     ON u.id_usuario = r.id_usuario
    JOIN asiento a     ON a.id_asiento = r.id_asiento
    JOIN vuelo v       ON v.id_vuelo = a.id_vuelo
    JOIN ruta ru       ON ru.id_ruta = v.id_ruta
    JOIN aeropuerto ao ON ao.id_aeropuerto = ru.id_aeropuerto_origen
    JOIN aeropuerto ad ON ad.id_aeropuerto = ru.id_aeropuerto_destino
    LEFT JOIN check_in ci ON ci.id_reservacion = r.id_reservacion`;

@Injectable()
export class ReservacionesService {
    constructor(private readonly baseDatos: BaseDatosService) {}

    /** Identificador de un pasajero activo a partir de su correo (reservación por un empleado) */
    async idPasajeroPorCorreo(correo: string): Promise<number> {
        const [fila] = await this.baseDatos.consultar<{ id_usuario: number }>(
            `SELECT u.id_usuario FROM usuario u JOIN rol r USING (id_rol)
             WHERE lower(u.correo) = lower($1) AND u.activo AND r.nombre_rol = 'Pasajero'`,
            [correo],
        );
        if (!fila) throw new NotFoundException('No existe un pasajero activo con ese correo.');
        return fila.id_usuario;
    }

    /**
     * [RF-10][RF-11][RNF-07][CA-06] La función de la base bloquea el asiento
     * (FOR UPDATE): ante solicitudes simultáneas solo una obtiene el asiento y la
     * otra recibe SGA01 sin generar registro.
     */
    async crear(
        idActor: number,
        idPasajero: number,
        idVuelo: number,
        asiento: string,
    ): Promise<ReservacionCreada> {
        return this.baseDatos.transaccion(idActor, async (cliente) => {
            const creada = await cliente.query<{ codigo: string }>(
                'SELECT crear_reservacion($1, $2, $3) AS codigo',
                [idPasajero, idVuelo, asiento],
            );
            const codigo = creada.rows[0].codigo;
            const detalle = await cliente.query<{ expira: string }>(
                'SELECT fecha_expiracion AS expira FROM reservacion WHERE codigo_reserva = $1',
                [codigo],
            );
            return { codigo, asiento, fechaExpiracion: detalle.rows[0].expira };
        });
    }

    /** [S-08] Solo las reservaciones del pasajero que consulta */
    deUsuario(idUsuario: number) {
        return this.baseDatos.consultar(
            CONSULTA_RESERVACIONES + ' WHERE r.id_usuario = $1 ORDER BY v.fecha_salida DESC',
            [idUsuario],
        );
    }

    /** Consulta para la atención de pasajeros (Empleado y Administrador, Tabla 8) */
    buscar(codigo: string, correo: string) {
        return this.baseDatos.consultar(
            CONSULTA_RESERVACIONES +
                ` WHERE ($1 = '' OR r.codigo_reserva = $1) AND ($2 = '' OR lower(u.correo) = lower($2))
                  ORDER BY r.fecha_creacion DESC LIMIT $3`,
            [codigo, correo, LIMITE_LISTADO],
        );
    }

    /** [RF-12][CA-07][S-08] La función valida que el pasajero solo cancele las suyas */
    async cancelar(idActor: number, codigo: string): Promise<void> {
        await this.baseDatos.transaccion(idActor, (cliente) =>
            cliente.query('SELECT cancelar_reservacion($1, $2)', [codigo, idActor]),
        );
    }

    async obtener(codigo: string): Promise<DetalleReservacion> {
        const [reservacion] = await this.baseDatos.consultar<DetalleReservacion>(
            CONSULTA_RESERVACIONES + ' WHERE r.codigo_reserva = $1',
            [codigo],
        );
        if (!reservacion) throw new NotFoundException('No se encontró la reservación.');
        return reservacion;
    }

    /**
     * [RF-13][RF-14][CA-08][CP-13] Pago simulado de una reservación propia. La
     * función de la base aprueba solo si el método es el de aprobación y el monto
     * coincide con la tarifa; un rechazo deja la reservación CONFIRMADA. Pago y
     * cambio de estado ocurren en una sola transacción (CP-20).
     */
    async pagar(
        idPasajero: number,
        codigo: string,
        monto: number,
        metodo: string,
    ): Promise<string> {
        const reservacion = await this.obtener(codigo);
        if (reservacion.idUsuario !== idPasajero) {
            throw new NotFoundException('No se encontró la reservación.');
        }
        if (!['PENDIENTE', 'CONFIRMADA'].includes(reservacion.estado)) {
            throw new ConflictException(
                `Esta reservación no admite pagos: su estado es ${reservacion.estado}.`,
            );
        }
        if (new Date(reservacion.fechaExpiracion) <= new Date()) {
            throw new ConflictException(
                'El plazo para pagar esta reservación venció y el asiento se liberó.',
            );
        }
        return this.baseDatos.transaccion(idPasajero, async (cliente) => {
            const resultado = await cliente.query<{ estado: string }>(
                'SELECT registrar_pago($1, $2, $3) AS estado',
                [codigo, monto, metodo],
            );
            return resultado.rows[0].estado;
        });
    }
}
