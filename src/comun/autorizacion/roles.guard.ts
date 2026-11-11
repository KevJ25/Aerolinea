import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    Optional,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CLAVE_PUBLICO, CLAVE_ROLES } from './autorizacion.decoradores';
import { RegistroAccesosService } from './registro-accesos.service';
import { Rol } from './rol.enum';

/** Usuario autenticado que AutenticacionGuard deja en la solicitud. */
export interface UsuarioAutenticado {
    idUsuario: number;
    rol: Rol;
    nombre?: string;
    correo?: string;
}

interface SolicitudConUsuario {
    user?: UsuarioAutenticado;
    method?: string;
    originalUrl?: string;
}

/** [S-13] mensaje genérico: no revela qué rol se requería ni la estructura interna. */
export const MENSAJE_ACCESO_DENEGADO = 'No tiene permiso para realizar esta operación.';

/**
 * Verificación de rol en el servidor en cada petición.
 * [RNF-04][S-06] la verificación ocurre aquí, nunca solo en la interfaz.
 * [S-09] denegación por defecto: una operación sin @Roles ni @Publico se rechaza.
 * [CP-25] todo rechazo por rol queda registrado en la bitácora.
 */
@Injectable()
export class RolesGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        @Optional() private readonly registroAccesos?: RegistroAccesosService,
    ) {}

    async canActivate(contexto: ExecutionContext): Promise<boolean> {
        const destinos = [contexto.getHandler(), contexto.getClass()];
        if (this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, destinos)) {
            return true;
        }
        const solicitud = contexto.switchToHttp().getRequest<SolicitudConUsuario>();
        const rolesPermitidos =
            this.reflector.getAllAndOverride<Rol[]>(CLAVE_ROLES, destinos) ?? [];
        const usuario = solicitud.user;

        if (rolesPermitidos.length > 0 && !usuario) {
            throw new UnauthorizedException('Inicie sesión para continuar.');
        }
        if (!usuario || !rolesPermitidos.includes(usuario.rol)) {
            await this.registrarRechazo(solicitud);
            throw new ForbiddenException(MENSAJE_ACCESO_DENEGADO);
        }
        return true;
    }

    private async registrarRechazo(solicitud: SolicitudConUsuario): Promise<void> {
        if (solicitud.user && this.registroAccesos) {
            await this.registroAccesos.registrarDenegado(
                solicitud.user.idUsuario,
                solicitud.method ?? '',
                solicitud.originalUrl ?? '',
            );
        }
    }
}
