import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { HistorialGestionesService }                    from './historial-gestiones.service';

class HistorialGestorDto {
  gestor:       string;  // ej: 'bquispee' (sin @dominio)
  fecha_desde:  string;  // ej: '2026-03-01'
  fecha_hasta:  string;  // ej: '2026-03-22'
}

// ══════════════════════════════════════════════════════════
//  HISTORIAL GESTIONES CONTROLLER — público, sin token
//  POST /App/campo/historial-gestiones/por-gestor
// ══════════════════════════════════════════════════════════

@Controller('gestiones')
export class HistorialGestionesController {

  constructor(private readonly service: HistorialGestionesService) {}

  @Post('gestor')
  @HttpCode(HttpStatus.OK)
  async porGestor(@Body() dto: HistorialGestorDto) {
    return this.service.getHistorialGestor(
      dto.gestor,
      dto.fecha_desde,
      dto.fecha_hasta,
    );
  }
}
