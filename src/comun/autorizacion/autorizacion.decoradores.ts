import { SetMetadata } from '@nestjs/common';
import { Rol } from './rol.enum';

export const CLAVE_ROLES = 'rolesPermitidos';
export const CLAVE_PUBLICO = 'rutaPublica';

/**
 * Declara los perfiles autorizados para un controlador o una operación.
 * [S-07] principio de menor privilegio: liste solo los perfiles que la necesitan.
 */
export const Roles = (...roles: Rol[]) => SetMetadata(CLAVE_ROLES, roles);

/**
 * Marca una operación que no requiere autenticación (por ejemplo, iniciar sesión).
 * Debe usarse de forma excepcional y justificarse en la revisión de código.
 */
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);
