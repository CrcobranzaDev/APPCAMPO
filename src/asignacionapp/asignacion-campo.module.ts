import { Module } from '@nestjs/common';
import { AsignacionCampoController } from 'src/asignacionapp/controller/asignacion-campo.controller';
import { AsignacionCampoService }    from 'src/asignacionapp/services/asignacion-campo.service';
import { DetalleClientesService } from './services/detalle-clientes.service';
import { DetalleClientesController } from './controller/detalle-clientes.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
   imports:     [AuthModule], 
  controllers: [AsignacionCampoController,DetalleClientesController],
  providers:   [AsignacionCampoService,DetalleClientesService],
  exports:     [AsignacionCampoService,DetalleClientesService],
})
export class AsignacionCampoModule {}
