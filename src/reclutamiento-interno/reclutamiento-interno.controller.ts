import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { ReclutamientoInternoService } from './reclutamiento-interno.service';

@Controller('reclutamiento-interno')

export class ReclutamientoInternoController {
  constructor(private readonly service: ReclutamientoInternoService) {}

  @Post('vacantes')
  crearVacante(@Body() body: any) {
    return this.service.crearVacante(body);
  }
}
