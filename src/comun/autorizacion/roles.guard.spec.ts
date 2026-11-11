import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Publico, Roles } from './autorizacion.decoradores';
import { RegistroAccesosService } from './registro-accesos.service';
import { RolesGuard, UsuarioAutenticado } from './roles.guard';
import { Rol } from './rol.enum';

class ControladorDePrueba {
    @Publico()
    iniciarSesion(): void {}

    @Roles(Rol.Administrador)
    gestionarUsuarios(): void {}

    @Roles(Rol.Empleado, Rol.Administrador)
    realizarCheckIn(): void {}

    operacionSinDeclarar(): void {}
}

function crearContexto(metodo: keyof ControladorDePrueba, usuario?: UsuarioAutenticado) {
    return {
        getHandler: () => ControladorDePrueba.prototype[metodo],
        getClass: () => ControladorDePrueba,
        switchToHttp: () => ({
            getRequest: () => ({ user: usuario, method: 'GET', originalUrl: '/admin/usuarios' }),
        }),
    } as unknown as ExecutionContext;
}

const pasajero: UsuarioAutenticado = { idUsuario: 3, rol: Rol.Pasajero };
const empleado: UsuarioAutenticado = { idUsuario: 2, rol: Rol.Empleado };
const administrador: UsuarioAutenticado = { idUsuario: 1, rol: Rol.Administrador };

describe('RolesGuard · RNF-04, S-06, S-07, S-09 (CP-25)', () => {
    const guard = new RolesGuard(new Reflector());

    it('permite una operación marcada como pública sin autenticación', async () => {
        await expect(guard.canActivate(crearContexto('iniciarSesion'))).resolves.toBe(true);
    });

    it('S-09: rechaza una operación que no declara roles, aun con administrador', async () => {
        await expect(
            guard.canActivate(crearContexto('operacionSinDeclarar', administrador)),
        ).rejects.toThrow(ForbiddenException);
    });

    it('CP-25: un pasajero no puede acceder a una operación administrativa', async () => {
        await expect(
            guard.canActivate(crearContexto('gestionarUsuarios', pasajero)),
        ).rejects.toThrow(ForbiddenException);
    });

    it('CP-25: un empleado no puede acceder a una operación administrativa', async () => {
        await expect(
            guard.canActivate(crearContexto('gestionarUsuarios', empleado)),
        ).rejects.toThrow(ForbiddenException);
    });

    it('permite la operación al perfil autorizado', async () => {
        await expect(
            guard.canActivate(crearContexto('gestionarUsuarios', administrador)),
        ).resolves.toBe(true);
        await expect(guard.canActivate(crearContexto('realizarCheckIn', empleado))).resolves.toBe(
            true,
        );
    });

    it('rechaza con 401 una operación protegida sin usuario autenticado', async () => {
        await expect(guard.canActivate(crearContexto('realizarCheckIn'))).rejects.toThrow(
            UnauthorizedException,
        );
    });

    it('S-13: el mensaje de rechazo no revela los roles requeridos', async () => {
        await expect(
            guard.canActivate(crearContexto('gestionarUsuarios', pasajero)),
        ).rejects.toThrow(/^(?!.*Administrador)/);
    });

    it('CP-25: el rechazo por rol se registra en la bitácora con el usuario y la ruta', async () => {
        const registrarDenegado = jest.fn().mockResolvedValue(undefined);
        const guardConRegistro = new RolesGuard(new Reflector(), {
            registrarDenegado,
        } as unknown as RegistroAccesosService);
        const contexto = crearContexto('gestionarUsuarios', pasajero);
        await expect(guardConRegistro.canActivate(contexto)).rejects.toThrow(ForbiddenException);
        expect(registrarDenegado).toHaveBeenCalledWith(3, 'GET', '/admin/usuarios');
    });

    it('no registra en la bitácora un acceso permitido', async () => {
        const registrarDenegado = jest.fn();
        const guardConRegistro = new RolesGuard(new Reflector(), {
            registrarDenegado,
        } as unknown as RegistroAccesosService);
        await guardConRegistro.canActivate(crearContexto('gestionarUsuarios', administrador));
        expect(registrarDenegado).not.toHaveBeenCalled();
    });
});
