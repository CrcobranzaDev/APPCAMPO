import { Module } from '@nestjs/common';
import { AsignacionController } from './controller/asignacion.controller';
import { AsignacionFilterService } from './services/asignacion-filter.service';


// ══════════════════════════════════════════════════════════
//  ASIGNACION MODULE
//  Conexión: sqlserver_maestra (BD_CR_MAESTRA · solo lectura)
//  No necesita TypeOrmModule.forFeature() porque usa
//  DataSource directamente para raw queries.
// ══════════════════════════════════════════════════════════

@Module({
  controllers: [AsignacionController],
  providers:   [AsignacionFilterService],
  exports:     [AsignacionFilterService],
})
export class AsignacionModule {}