import {
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { BaseDatosService } from '../../comun/base-datos/base-datos.service';
import { Rol } from '../../comun/autorizacion/rol.enum';
import { EntradaInvalida } from '../../comun/validacion/validacion';
import { calcularResumen, verificarContrasena } from '../autenticacion/contrasenas';

export interface UsuarioListado {
    idUsuario: number;
    nombre: string;
    correo: string;
    rol: Rol;
    estado: 'Activo' | 'Bloqueado' | 'Inactivo';
    bloqueadoHasta: string | null;
    fechaAlta: string;
}

interface CambiosUsuario {
    nombre?: string;
    correo?: string;
    rol?: Rol;
}

const LIMITE_LISTADO = 200;
const RESTRICCION_CORREO_UNICO = 'usuario_correo_uq';
const MENSAJE_CORREO_DUPLICADO = 'Ese correo ya pertenece a otra cuenta.';

/** Comodines de ILIKE escapados para que la búsqueda sea literal */
function patronBusqueda(texto: string): string {
    return `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function esCorreoDuplicado(error: unknown): boolean {
    return (error as { constraint?: string }).constraint === RESTRICCION_CORREO_UNICO;
}

const CONSULTA_USUARIOS = `
    SELECT u.id_usuario AS "idUsuario", u.nombre, u.correo, r.nombre_rol AS rol,
           CASE WHEN NOT u.activo THEN 'Inactivo'
                WHEN u.bloqueado_hasta > now() THEN 'Bloqueado'
                ELSE 'Activo' END AS estado,
           CASE WHEN u.bloqueado_hasta > now() THEN u.bloqueado_hasta END AS "bloqueadoHasta",
           u.fecha_alta AS "fechaAlta"
    FROM usuario u JOIN rol r USING (id_rol)`;

@Injectable()
export class UsuariosService {
    constructor(private readonly baseDatos: BaseDatosService) {}

    listar(busqueda: string, rol: string): Promise<UsuarioListado[]> {
        return this.baseDatos.consultar<UsuarioListado>(
            CONSULTA_USUARIOS +
                ` WHERE ($1 = '' OR u.nombre ILIKE $2 OR u.correo ILIKE $2)
                    AND ($3 = '' OR r.nombre_rol = $3)
                  ORDER BY u.activo DESC, u.nombre LIMIT $4`,
            [busqueda, patronBusqueda(busqueda), rol, LIMITE_LISTADO],
        );
    }

    async obtener(idUsuario: number): Promise<UsuarioListado> {
        const [usuario] = await this.baseDatos.consultar<UsuarioListado>(
            CONSULTA_USUARIOS + ' WHERE u.id_usuario = $1',
            [idUsuario],
        );
        if (!usuario) {
            throw new NotFoundException('No se encontró el usuario.');
        }
        return usuario;
    }

    /** [RF-03] El administrador da de alta cuentas de cualquier perfil */
    async crear(
        idActor: number,
        nombre: string,
        correo: string,
        contrasena: string,
        rol: Rol,
    ): Promise<number> {
        const resumen = await calcularResumen(contrasena);
        try {
            return await this.baseDatos.transaccion(idActor, async (cliente) => {
                const resultado = await cliente.query<{ id_usuario: number }>(
                    `INSERT INTO usuario (nombre, correo, contrasena_hash, id_rol)
                     SELECT $1, $2, $3, id_rol FROM rol WHERE nombre_rol = $4
                     RETURNING id_usuario`,
                    [nombre, correo, resumen, rol],
                );
                return resultado.rows[0].id_usuario;
            });
        } catch (error) {
            throw esCorreoDuplicado(error)
                ? new ConflictException(MENSAJE_CORREO_DUPLICADO)
                : error;
        }
    }

    /** [RF-03] Edición de nombre, correo y perfil. Queda en la bitácora (RF-17). */
    async actualizar(idActor: number, idUsuario: number, cambios: CambiosUsuario): Promise<void> {
        if (idUsuario === idActor && cambios.rol && cambios.rol !== Rol.Administrador) {
            throw new ForbiddenException(
                'No puede quitarse a sí mismo el perfil de administrador.',
            );
        }
        await this.obtener(idUsuario);
        try {
            await this.baseDatos.transaccion(idActor, (cliente) =>
                cliente.query(
                    `UPDATE usuario
                     SET nombre = coalesce($2, nombre),
                         correo = coalesce($3, correo),
                         id_rol = coalesce((SELECT id_rol FROM rol WHERE nombre_rol = $4), id_rol)
                     WHERE id_usuario = $1 AND activo`,
                    [
                        idUsuario,
                        cambios.nombre ?? null,
                        cambios.correo ?? null,
                        cambios.rol ?? null,
                    ],
                ),
            );
        } catch (error) {
            throw esCorreoDuplicado(error)
                ? new ConflictException(MENSAJE_CORREO_DUPLICADO)
                : error;
        }
    }

    /** [RF-18] Desbloqueo manual */
    async desbloquear(idActor: number, idUsuario: number): Promise<void> {
        await this.baseDatos.transaccion(idActor, (cliente) =>
            cliente.query('SELECT desbloquear_cuenta($1)', [idUsuario]),
        );
    }

    /** [RNF-12][S-14] La baja exige escribir el correo exacto del usuario */
    async darDeBaja(idActor: number, idUsuario: number, confirmacion: unknown): Promise<void> {
        const usuario = await this.obtener(idUsuario);
        if (
            typeof confirmacion !== 'string' ||
            confirmacion.trim().toLowerCase() !== usuario.correo
        ) {
            throw new EntradaInvalida(
                'Para confirmar la baja escriba exactamente el correo del usuario.',
            );
        }
        await this.baseDatos.transaccion(idActor, (cliente) =>
            cliente.query('SELECT dar_baja_usuario($1)', [idUsuario]),
        );
    }

    /** Cambio de la contraseña propia: exige la contraseña actual */
    async cambiarContrasenaPropia(
        idUsuario: number,
        correo: string,
        actual: string,
        nueva: string,
    ): Promise<void> {
        const [credencial] = await this.baseDatos.consultar<{ contrasena_hash: string }>(
            'SELECT contrasena_hash FROM obtener_credencial($1)',
            [correo],
        );
        if (!credencial || !(await verificarContrasena(credencial.contrasena_hash, actual))) {
            throw new EntradaInvalida('La contraseña actual no es correcta.');
        }
        const resumen = await calcularResumen(nueva);
        await this.baseDatos.transaccion(idUsuario, (cliente) =>
            cliente.query('UPDATE usuario SET contrasena_hash = $2 WHERE id_usuario = $1', [
                idUsuario,
                resumen,
            ]),
        );
    }
}
