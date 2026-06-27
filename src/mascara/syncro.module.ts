import { Module }        from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConnectionName }                from 'src/database/constants/connection-names';
import { SincronizacionCampoServiceMAFT2T3 }    from './syncro.maft2t3.service';
import { SincronizacionCampoControllerMAFT2T3 } from './syncro.controller';


@Module({
  imports: [
    TypeOrmModule.forFeature([], ConnectionName.SQLSERVER_MAESTRA),
    TypeOrmModule.forFeature([], ConnectionName.SQLSERVER_CAMPO),
  ],
  controllers: [SincronizacionCampoControllerMAFT2T3],
  providers:   [SincronizacionCampoServiceMAFT2T3],
  exports:     [SincronizacionCampoServiceMAFT2T3],  // por si lo usas en CargaService
})
export class SincronizacionCampoModule {}