import {
  Controller, Post, Body,
  HttpCode, HttpStatus,
  UseGuards, Req,
} from '@nestjs/common';
import { FastifyRequest }         from 'fastify';
import { RegistroGestionService } from './registro-gestion.service';
import { RegistrarGestionesDto }  from './registro-gestion.dto';
import { JwtAuthGuard }           from 'src/auth/jwt-auth.guard';

// ══════════════════════════════════════════════════════════
//  REGISTRO GESTION CONTROLLER — CON JWT
//  POST /App/campo/registro-gestion/registrar
// ══════════════════════════════════════════════════════════

@Controller('registro-gestion')
@UseGuards(JwtAuthGuard)
export class RegistroGestionController {

  constructor(private readonly service: RegistroGestionService) {}

  @Post('registrar')
@HttpCode(HttpStatus.OK)
async registrar(
  @Body() dto: RegistrarGestionesDto,
  @Req() req: FastifyRequest & { user: any },
) {
  return this.service.registrarGestiones(
    dto,
    req.user.email,
    dto.nombre,      );
}
}
