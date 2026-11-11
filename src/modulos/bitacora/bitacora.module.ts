import { Module } from '@nestjs/common';
import { BitacoraController } from './bitacora.controller';

@Module({ controllers: [BitacoraController] })
export class BitacoraModule {}
