import { Module }                          from '@nestjs/common';
import { GestionesRealizadasController }  from './gestiones-realizadas.controller';
import { GestionesRealizadasService }     from './gestiones-realizadas.service';
import { AuthModule }                     from 'src/auth/auth.module';

@Module({
  imports:     [AuthModule],
  controllers: [GestionesRealizadasController],
  providers:   [GestionesRealizadasService],
  exports:     [GestionesRealizadasService],
})
export class GestionesRealizadasModule {}
