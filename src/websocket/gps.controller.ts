import { Controller, Post, Body, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { GpsService } from 'src/websocket/gps.gateway'; // Asegúrate que la ruta sea la correcta
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('gpes')
export class GpsController {
  constructor(private readonly gpsService: GpsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('sync')
  async syncLocation(@Body() data: any, @Req() req: any) {
    // 1. Validar que el usuario exista en el request (inyectado por JwtAuthGuard)
    if (!req.user || !req.user.email) {
      throw new UnauthorizedException('Usuario no identificado en el token');
    }

    const userEmail = req.user.email;

    // 2. LLAMADA CORRECTA AL SERVICIO:
    // Pasamos 'null' porque esta petición viene por HTTP, no por WebSocket.
    // Usamos 'await' porque el procesamiento incluye cálculos y guardado en BD.
    await this.gpsService.handleGestorMessage(null, userEmail, data);

    // 3. Respuesta para el servicio nativo de Android
    return {
      status: 'success',
      message: 'Ubicación sincronizada',
      timestamp: new Date().toISOString()
    };
  }
}