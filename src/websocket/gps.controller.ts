import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { GpsService } from 'src/websocket/gps.gateway';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import type { SyncLoteDto } from './gps.dto';

@Controller('gpes')
export class GpsController {
  constructor(private readonly gpsService: GpsService) {}

  // ── Ping individual (App en segundo plano, con señal) ──────────────
  @UseGuards(JwtAuthGuard)
  @Post('sync')
  async syncLocation(@Body() data: any, @Req() req: any) {
    if (!req.user?.email) {
      throw new UnauthorizedException('Usuario no identificado en el token');
    }
    const email = req.user.email;

    // HTTP → pasamos null como socket
    await this.gpsService.handleGestorMessage(null, email, data);

    return {
      status: 'success',
      message: 'Ubicación sincronizada',
      timestamp: new Date().toISOString(),
    };
  }

  // ── Lote offline (App recupera señal y sube pings buffereados) ─────
  @UseGuards(JwtAuthGuard)
  @Post('sync-lote')
  async syncLote(@Body() body: SyncLoteDto, @Req() req: any) {
    if (!req.user?.email) {
      throw new UnauthorizedException('Usuario no identificado en el token');
    }
    const email = req.user.email;

    if (!body?.pings?.length) {
      return { status: 'ok', received: 0 };
    }

    const insertados = await this.gpsService.insertarLoteLog(email, body.pings);

    return {
      status: 'success',
      message: 'Lote sincronizado',
      received: insertados,
      timestamp: new Date().toISOString(),
    };
  }
}