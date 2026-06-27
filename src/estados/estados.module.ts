import { Module }                   from '@nestjs/common';
import { EstadosCampanaController } from 'src/estados/estados.controller';
import { EstadosCampanaService }    from 'src/estados/estados.service';

@Module({
  controllers: [EstadosCampanaController],
  providers:   [EstadosCampanaService],
  exports:     [EstadosCampanaService],
})
export class EstadosCampanaModule {}