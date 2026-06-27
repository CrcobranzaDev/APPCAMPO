import { Module }                       from '@nestjs/common';
import { DetalleAsignacionController }  from './detalle-asignacion.controller';
import { DetalleAsignacionService }     from './detalle-asignacion.service';
import { AuthModule }                   from 'src/auth/auth.module';

@Module({
  imports:     [AuthModule],
  controllers: [DetalleAsignacionController],
  providers:   [DetalleAsignacionService],
  exports:     [DetalleAsignacionService],
})
export class DetalleAsignacionModule {}
