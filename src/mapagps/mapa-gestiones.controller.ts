import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { MapaGestionesService } from './mapa-gestiones.service';

class MapaFiltrosDto {
  gestor?:      string;
  fecha_desde?: string;
  fecha_hasta?: string;
}

// ══════════════════════════════════════════════════════════
//  MAPA GESTIONES CONTROLLER — público, sin token
//  POST /App/campo/mapa-gestiones/puntos
// ══════════════════════════════════════════════════════════

@Controller('mapa-gestiones')
export class MapaGestionesController {

  constructor(private readonly service: MapaGestionesService) {}

  @Post('puntos')
  @HttpCode(HttpStatus.OK)
  async getPuntos(@Body() dto: MapaFiltrosDto) {
    return this.service.getPuntos(
      dto.gestor,
      dto.fecha_desde,
      dto.fecha_hasta,
    );
  }
}
