import { Module } from '@nestjs/common';
import { ExpiracionService } from './expiracion.service';
import { ReservacionesController } from './reservaciones.controller';
import { ReservacionesService } from './reservaciones.service';

@Module({
    controllers: [ReservacionesController],
    providers: [ReservacionesService, ExpiracionService],
    exports: [ReservacionesService],
})
export class ReservacionesModule {}
