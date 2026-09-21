import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { ReclutamientoInternoController } from './reclutamiento-interno.controller';
import { ReclutamientoInternoService } from './reclutamiento-interno.service';

@Module({
  imports: [AuthModule],
  controllers: [ReclutamientoInternoController],
  providers: [ReclutamientoInternoService],
})
export class ReclutamientoInternoModule {}
