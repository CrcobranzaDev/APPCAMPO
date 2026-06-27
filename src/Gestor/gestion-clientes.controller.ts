import { Controller, Post, Body, HttpCode, HttpStatus, UseInterceptors, UploadedFile, Req } from '@nestjs/common';
import { GestionClientesService }   from './gestion-clientes.service';
import { ImportarClientesDto, ReasignarClientesDto }     from './dto/gestion-clientes.dto';
import type { FastifyRequest } from 'fastify';

// ══════════════════════════════════════════════════════════
//  GESTION CLIENTES CONTROLLER — público, sin token
//
//  POST /App/campo/gestion-clientes/reasignar
//  POST /App/campo/gestion-clientes/desactivar
//  POST /App/campo/gestion-clientes/reactivar
// ══════════════════════════════════════════════════════════

@Controller('gestion-clientes')
export class GestionClientesController {

  constructor(private readonly service: GestionClientesService) {}

  // ── POST /reasignar ───────────────────────────────────
  @Post('reasignar')
  @HttpCode(HttpStatus.OK)
  async reasignar(@Body() dto: ReasignarClientesDto) {
    const usuarioAdmin = dto.usuario_admin ?? 'sistema';
    return this.service.reasignar(dto, usuarioAdmin);
  }

  // ── POST /desactivar ──────────────────────────────────
  @Post('desactivar')
  @HttpCode(HttpStatus.OK)
  async desactivar(@Body() body: { ids: number[] }) {
    return this.service.cambiarEstado({ ids: body.ids, estado: 'DESACTIVADO' });
  }

  // ── POST /reactivar ───────────────────────────────────
  @Post('reactivar')
  @HttpCode(HttpStatus.OK)
  async reactivar(@Body() body: { ids: number[] }) {
    return this.service.cambiarEstado({ ids: body.ids, estado: 'ACTIVO' });
  }


@Post('importar')
@HttpCode(HttpStatus.OK)
async importar(@Req() req: FastifyRequest) {
  return this.service.importarDesdeRequest(req);
}



}