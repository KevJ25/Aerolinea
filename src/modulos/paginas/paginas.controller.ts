import { Controller, Get, HttpStatus, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { join } from 'node:path';
import { Publico, Roles } from '../../comun/autorizacion/autorizacion.decoradores';
import { Rol } from '../../comun/autorizacion/rol.enum';
import { UsuarioAutenticado } from '../../comun/autorizacion/roles.guard';
import { DIRECTORIO_PAGINAS } from '../../comun/errores/filtro-errores';
import { exigirCodigoReserva, exigirId } from '../../comun/validacion/validacion';
import { destinoInicial } from '../autenticacion/menu';

/**
 * Páginas del sistema. Cada ruta se protege EN EL SERVIDOR con el mismo
 * RolesGuard que la API: un Pasajero que escribe /admin/usuarios en el
 * navegador recibe la página de acceso denegado con estado 403 y el intento
 * queda en la bitácora (CA-02, CP-25).
 */
@Controller()
export class PaginasController {
    private enviar(respuesta: Response, archivo: string): void {
        respuesta.sendFile(join(DIRECTORIO_PAGINAS, archivo));
    }

    @Publico()
    @Get()
    raiz(
        @Req() solicitud: Request & { user?: UsuarioAutenticado },
        @Res() respuesta: Response,
    ): void {
        const destino = solicitud.user ? destinoInicial(solicitud.user.rol) : '/iniciar-sesion';
        respuesta.redirect(HttpStatus.FOUND, destino);
    }

    @Publico()
    @Get('iniciar-sesion')
    iniciarSesion(@Res() respuesta: Response): void {
        this.enviar(respuesta, 'iniciar-sesion.html');
    }

    @Publico()
    @Get('registro')
    registro(@Res() respuesta: Response): void {
        this.enviar(respuesta, 'registro.html');
    }

    @Publico()
    @Get('aviso-de-privacidad')
    avisoPrivacidad(@Res() respuesta: Response): void {
        this.enviar(respuesta, 'aviso-de-privacidad.html');
    }

    @Roles(Rol.Administrador, Rol.Empleado, Rol.Pasajero)
    @Get('inicio')
    inicio(@Res() respuesta: Response): void {
        this.enviar(respuesta, 'inicio.html');
    }

    @Roles(Rol.Administrador)
    @Get('admin/usuarios')
    adminUsuarios(@Res() respuesta: Response): void {
        this.enviar(respuesta, 'admin-usuarios.html');
    }

    // ------------------------------------------------ Sprints 2 a 4

    @Roles(Rol.Administrador, Rol.Empleado, Rol.Pasajero)
    @Get('vuelos')
    vuelos(@Res() respuesta: Response): void {
        this.enviar(respuesta, 'vuelos.html');
    }

    @Roles(Rol.Administrador, Rol.Empleado, Rol.Pasajero)
    @Get('vuelos/:id')
    asientos(@Param('id') id: string, @Res() respuesta: Response): void {
        exigirId(id);
        this.enviar(respuesta, 'asientos.html');
    }

    @Roles(Rol.Pasajero)
    @Get('mis-reservaciones')
    misReservaciones(@Res() respuesta: Response): void {
        this.enviar(respuesta, 'mis-reservaciones.html');
    }

    @Roles(Rol.Empleado, Rol.Administrador)
    @Get('reservaciones')
    reservaciones(@Res() respuesta: Response): void {
        this.enviar(respuesta, 'reservaciones.html');
    }

    @Roles(Rol.Administrador)
    @Get('admin/catalogos')
    adminCatalogos(@Res() respuesta: Response): void {
        this.enviar(respuesta, 'admin-catalogos.html');
    }

    @Roles(Rol.Administrador)
    @Get('admin/vuelos')
    adminVuelos(@Res() respuesta: Response): void {
        this.enviar(respuesta, 'admin-vuelos.html');
    }

    // ------------------------------------------------ Sprint 5

    @Roles(Rol.Pasajero)
    @Get('pago/:codigo')
    pago(@Param('codigo') codigo: string, @Res() respuesta: Response): void {
        exigirCodigoReserva(codigo);
        this.enviar(respuesta, 'pago.html');
    }

    @Roles(Rol.Pasajero, Rol.Empleado, Rol.Administrador)
    @Get('pase/:codigo')
    pase(@Param('codigo') codigo: string, @Res() respuesta: Response): void {
        exigirCodigoReserva(codigo);
        this.enviar(respuesta, 'pase.html');
    }

    @Roles(Rol.Empleado)
    @Get('check-in')
    checkIn(@Res() respuesta: Response): void {
        this.enviar(respuesta, 'check-in.html');
    }

    @Roles(Rol.Administrador)
    @Get('admin/reportes')
    adminReportes(@Res() respuesta: Response): void {
        this.enviar(respuesta, 'admin-reportes.html');
    }

    @Roles(Rol.Administrador)
    @Get('admin/bitacora')
    adminBitacora(@Res() respuesta: Response): void {
        this.enviar(respuesta, 'admin-bitacora.html');
    }
}
