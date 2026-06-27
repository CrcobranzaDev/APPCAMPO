import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { DetalleAsignacionService }          from './detalle-asignacion.service';
import { JwtAuthGuard }                      from 'src/auth/jwt-auth.guard';

class BuscarClienteDto {
  documento: string;
  campana:   string;
}

// ══════════════════════════════════════════════════════════
//  DETALLE ASIGNACION CONTROLLER
//
//  POST /App/campo/detalle-asignacion/buscar
//       → CON JWT (app móvil Flutter)
//
//  POST /App/campo/detalle-asignacion/buscar-web
//       → SIN JWT (web Laravel)
// ══════════════════════════════════════════════════════════

@Controller('detalle-asignacion')
export class DetalleAsignacionController {

  constructor(private readonly service: DetalleAsignacionService) {}

  // ── App móvil — CON JWT ───────────────────────────────
  @Post('buscar')
  @UseGuards(JwtAuthGuard)
  async buscar(@Body() dto: BuscarClienteDto) {
    return this.service.getDetalleCliente(dto.documento, dto.campana);
  }

  // ── Web Laravel — SIN JWT ─────────────────────────────
  @Post('buscar-web')
  async buscarWeb(@Body() dto: BuscarClienteDto) {
    return this.service.getDetalleCliente(dto.documento, dto.campana);
  }
}
