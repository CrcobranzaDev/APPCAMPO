import {
  Controller, Post, Body,
  HttpCode, HttpStatus,
  UseGuards, Req,
} from '@nestjs/common';
import { FastifyRequest }               from 'fastify';
import { GestionesRealizadasService, FiltrosGestionesDto } from './gestiones-realizadas.service';
import { JwtAuthGuard }                 from 'src/auth/jwt-auth.guard';

// ══════════════════════════════════════════════════════════
//  GESTIONES REALIZADAS CONTROLLER
//
//  POST /App/campo/gestiones-realizadas/web
//       → SIN JWT — web Laravel, filtro libre
//
//  POST /App/campo/gestiones-realizadas/app
//       → CON JWT — app móvil
//         gestcamp  → solo sus gestiones
//         otros     → filtro libre
// ══════════════════════════════════════════════════════════

@Controller('gestiones-realizadas')
export class GestionesRealizadasController {

  constructor(private readonly service: GestionesRealizadasService) {}

  // ── POST /web — SIN JWT ───────────────────────────────
  @Post('web')
  @HttpCode(HttpStatus.OK)
  async getWeb(@Body() filtros: FiltrosGestionesDto) {
    return this.service.getGestionesWeb(filtros);
  }

  // ── POST /app — CON JWT ───────────────────────────────
  @Post('app')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getApp(
    @Body() filtros: FiltrosGestionesDto,
    @Req() req: FastifyRequest & { user: any },
  ) {
    const emailToken  = req.user.email;
    const perfilToken = req.user.perfil;
    return this.service.getGestionesApp(filtros, emailToken, perfilToken);
  }
}
