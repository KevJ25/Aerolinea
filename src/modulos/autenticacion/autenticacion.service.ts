import {
    ConflictException,
    HttpException,
    HttpStatus,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { BaseDatosService } from '../../comun/base-datos/base-datos.service';
import { Rol } from '../../comun/autorizacion/rol.enum';
import { calcularResumen, obtenerResumenSimulado, verificarContrasena } from './contrasenas';

/** [S-13] Mismo mensaje para correo inexistente y contraseña incorrecta */
export const MENSAJE_CREDENCIALES =
    'Correo o contraseña incorrectos. Revise sus datos e inténtelo de nuevo.';
export const MENSAJE_BLOQUEO =
    'Su cuenta se bloqueó temporalmente por cinco intentos fallidos consecutivos. ' +
    'Se desbloqueará automáticamente en 24 horas; si necesita entrar antes, solicite el desbloqueo a un administrador.';

interface Credencial {
    id_usuario: number;
    contrasena_hash: string;
    nombre_rol: Rol;
    bloqueada: boolean;
}

export interface SesionIniciada {
    token: string;
    rol: Rol;
}

const ROL_PASAJERO = 3;
const RESTRICCION_CORREO_UNICO = 'usuario_correo_uq';

@Injectable()
export class AutenticacionService {
    constructor(private readonly baseDatos: BaseDatosService) {}

    /** [RF-01][CP-01] Registro público: toda cuenta nueva es de Pasajero */
    async registrarPasajero(nombre: string, correo: string, contrasena: string): Promise<void> {
        const resumen = await calcularResumen(contrasena);
        try {
            await this.baseDatos.transaccion(null, (cliente) =>
                cliente.query(
                    'INSERT INTO usuario (nombre, correo, contrasena_hash, id_rol) VALUES ($1, $2, $3, $4)',
                    [nombre, correo, resumen, ROL_PASAJERO],
                ),
            );
        } catch (error) {
            if ((error as { constraint?: string }).constraint === RESTRICCION_CORREO_UNICO) {
                throw new ConflictException(
                    'Este correo ya tiene una cuenta. Inicie sesión o use otro correo.',
                );
            }
            throw error;
        }
    }

    /** [RF-02][S-02][CP-02] Inicio de sesión con bloqueo tras cinco intentos */
    async iniciarSesion(correo: string, contrasena: string): Promise<SesionIniciada> {
        const [credencial] = await this.baseDatos.consultar<Credencial>(
            'SELECT id_usuario, contrasena_hash, nombre_rol, bloqueada FROM obtener_credencial($1)',
            [correo],
        );
        if (!credencial) {
            await verificarContrasena(await obtenerResumenSimulado(), contrasena);
            throw new UnauthorizedException(MENSAJE_CREDENCIALES);
        }
        if (credencial.bloqueada) {
            throw new HttpException(MENSAJE_BLOQUEO, HttpStatus.LOCKED);
        }
        if (!(await verificarContrasena(credencial.contrasena_hash, contrasena))) {
            const [{ bloqueada }] = await this.baseDatos.consultar<{ bloqueada: boolean }>(
                'SELECT registrar_intento_fallido($1) AS bloqueada',
                [credencial.id_usuario],
            );
            throw bloqueada
                ? new HttpException(MENSAJE_BLOQUEO, HttpStatus.LOCKED)
                : new UnauthorizedException(MENSAJE_CREDENCIALES);
        }
        const token = await this.baseDatos.transaccion(credencial.id_usuario, async (cliente) => {
            await cliente.query('SELECT registrar_acceso_exitoso($1)', [credencial.id_usuario]);
            const resultado = await cliente.query<{ token: string }>(
                'SELECT crear_sesion($1) AS token',
                [credencial.id_usuario],
            );
            return resultado.rows[0].token;
        });
        return { token, rol: credencial.nombre_rol };
    }

    /** [S-04] El token deja de ser válido aunque el navegador lo conserve */
    async cerrarSesion(token: string): Promise<void> {
        await this.baseDatos.consultar('SELECT cerrar_sesion($1)', [token]);
    }
}
