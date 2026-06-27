import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';

import { AsignacionFilterService } from 'src/carga/services/asignacion-filter.service';
import { BuscarConFiltrosDto }     from 'src/carga/dto/filter.dto';
// import { JwtAuthGuard }         from '../auth/guards/jwt-auth.guard';

// ══════════════════════════════════════════════════════════
//  ASIGNACION CONTROLLER
//  Rutas bajo /api/v1/asignacion
//  Fuente: BD_CR_MAESTRA · solo lectura
// ══════════════════════════════════════════════════════════

@Controller('asignacion')
// @UseGuards(JwtAuthGuard)   ← descomentar cuando el auth esté listo
export class AsignacionController {

  constructor(
    private readonly asignacionFilterService: AsignacionFilterService,
  ) {}

  // ── POST /asignacion/buscar ───────────────────────────
  //  Busca registros de FR_ASIGNACION con filtros dinámicos
  @Post('buscar')
  async buscar(@Body() dto: BuscarConFiltrosDto) {
    return this.asignacionFilterService.buscarConFiltros(
      dto.campaignId,
      dto.filtros,
      dto.fechaCargaDesde,
      dto.fechaCargaHasta,
    );
  }

  // ── GET /asignacion/etiquetas?campaignId=xxx ──────────
  //  Devuelve las etiquetas disponibles para el frontend
  @Get('etiquetas')
  async etiquetas(@Query('campaignId') campaignId: string) {
    return this.asignacionFilterService.obtenerEtiquetasDisponibles(campaignId);
  }
}