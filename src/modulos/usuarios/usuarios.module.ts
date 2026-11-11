import { Module } from '@nestjs/common';
import { PerfilController } from './perfil.controller';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

@Module({
    controllers: [UsuariosController, PerfilController],
    providers: [UsuariosService],
})
export class UsuariosModule {}
