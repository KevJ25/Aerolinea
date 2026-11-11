import { Module } from '@nestjs/common';
import { ReservacionesModule } from '../reservaciones/reservaciones.module';
import { CheckInController } from './checkin.controller';
import { CheckInService } from './checkin.service';

@Module({
    imports: [ReservacionesModule],
    controllers: [CheckInController],
    providers: [CheckInService],
})
export class CheckInModule {}
