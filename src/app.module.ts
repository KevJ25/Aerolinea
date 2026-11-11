import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AutenticacionGuard } from './comun/autorizacion/autenticacion.guard';
import { RegistroAccesosService } from './comun/autorizacion/registro-accesos.service';
import { RolesGuard } from './comun/autorizacion/roles.guard';
import { BaseDatosModule } from './comun/base-datos/base-datos.module';
import { FiltroErrores } from './comun/errores/filtro-errores';
import { AutenticacionModule } from './modulos/autenticacion/autenticacion.module';
import { CatalogosModule } from './modulos/catalogos/catalogos.module';
import { CheckInModule } from './modulos/checkin/checkin.module';
import { BitacoraModule } from './modulos/bitacora/bitacora.module';
import { PaginasController } from './modulos/paginas/paginas.controller';
import { SaludController } from './modulos/salud/salud.controller';
import { ReportesModule } from './modulos/reportes/reportes.module';
import { ReservacionesModule } from './modulos/reservaciones/reservaciones.module';
import { UsuariosModule } from './modulos/usuarios/usuarios.module';
import { VuelosModule } from './modulos/vuelos/vuelos.module';

/**
 * Módulo raíz. Sistema completo (Sprints 1 a 5): usuarios y seguridad (M-01),
 * catálogos (M-02, M-03), vuelos y asientos (M-04, M-05), reservaciones (M-06),
 * pagos simulados (M-07), check-in (M-08), reportes (M-09) y bitácora.
 * Los guards globales se ejecutan en orden: primero se identifica la sesión,
 * luego se decide por rol. Toda ruta queda protegida salvo que declare @Publico.
 */
@Module({
    imports: [
        BaseDatosModule,
        AutenticacionModule,
        UsuariosModule,
        BitacoraModule,
        CatalogosModule,
        VuelosModule,
        ReservacionesModule,
        CheckInModule,
        ReportesModule,
    ],
    controllers: [SaludController, PaginasController],
    providers: [
        RegistroAccesosService,
        { provide: APP_GUARD, useClass: AutenticacionGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_FILTER, useClass: FiltroErrores },
    ],
})
export class AppModule {}
