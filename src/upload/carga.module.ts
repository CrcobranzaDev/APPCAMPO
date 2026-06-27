import { Module }  from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CargaController } from 'src/upload/carga.controller';
import { CargaService }    from 'src/upload/carga.service';
import { ConnectionName }  from 'src/database/constants/connection-names';

@Module({
  imports: [
    // Solo necesita acceso a los DataSource — no entidades propias
    TypeOrmModule.forFeature([], ConnectionName.SQLSERVER_MAESTRA),
    TypeOrmModule.forFeature([], ConnectionName.SQLSERVER_CAMPO),
  ],
  controllers: [CargaController],
  providers:   [CargaService],
  exports:     [CargaService],
})
export class CargaModule {}
