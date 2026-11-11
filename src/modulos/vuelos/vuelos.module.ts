import { Module } from '@nestjs/common';
import { RutasController, VuelosController } from './vuelos.controller';
import { VuelosService } from './vuelos.service';

@Module({
    controllers: [RutasController, VuelosController],
    providers: [VuelosService],
})
export class VuelosModule {}
