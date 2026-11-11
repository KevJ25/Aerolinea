import { Module } from '@nestjs/common';
import { AeropuertosController, AvionesController } from './catalogos.controller';
import { CatalogosService } from './catalogos.service';

@Module({
    controllers: [AeropuertosController, AvionesController],
    providers: [CatalogosService],
})
export class CatalogosModule {}
