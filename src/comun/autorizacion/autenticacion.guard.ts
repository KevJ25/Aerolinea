import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { BaseDatosService } from '../base-datos/base-datos.service';
import { Rol } from './rol.enum';
import { UsuarioAutenticado } from './roles.guard';
import { leerTokenSesion } from './sesion';

interface FilaSesion {
    id_usuario: number;
    nombre: string;
    correo: string;
    nombre_rol: Rol;
}

/**
 * Identifica al usuario de cada petición a partir de su cookie de sesión.
 * No rechaza nada por sí mismo: la decisión la toma RolesGuard, que se ejecuta
 * después. La base valida el token, renueva la inactividad (S-03) y devuelve
 * el rol vigente (S-06).
 */
@Injectable()
export class AutenticacionGuard implements CanActivate {
    constructor(private readonly baseDatos: BaseDatosService) {}

    async canActivate(contexto: ExecutionContext): Promise<boolean> {
        const solicitud = contexto
            .switchToHttp()
            .getRequest<Request & { user?: UsuarioAutenticado }>();
        const token = leerTokenSesion(solicitud);
        if (!token) {
            return true;
        }
        const [fila] = await this.baseDatos.consultar<FilaSesion>(
            'SELECT id_usuario, nombre, correo, nombre_rol FROM validar_sesion($1)',
            [token],
        );
        if (fila) {
            solicitud.user = {
                idUsuario: fila.id_usuario,
                nombre: fila.nombre,
                correo: fila.correo,
                rol: fila.nombre_rol,
            };
        }
        return true;
    }
}
