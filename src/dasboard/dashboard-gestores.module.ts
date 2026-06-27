import { Module }                      from '@nestjs/common';
import { DashboardGestoresController } from './dashboard-gestores.controller';
import { DashboardGestoresService }    from './dashboard-gestores.service';

@Module({
  controllers: [DashboardGestoresController],
  providers:   [DashboardGestoresService],
  exports:     [DashboardGestoresService],
})
export class DashboardGestoresModule {}
