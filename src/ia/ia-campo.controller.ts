import { Controller, Get, Post, Query, Param, UseGuards } from '@nestjs/common';
import { IaCampoService } from './ia-campo.service';


@Controller('ia-campo')

export class IaCampoController {
  constructor(private readonly iaService: IaCampoService) {}

  // ── Dashboard de tiempos muertos (todos los asesores) ──────────────
  // GET /ia-campo/dashboard?fecha=2025-07-20
  @Get('dashboard')
  getDashboard(@Query('fecha') fecha?: string) {
    return this.iaService.getDashboardTiemposMuertos(fecha);
  }

  // ── Jornada completa de un asesor ──────────────────────────────────
  // GET /ia-campo/jornada/asesor@correo.com?fecha=2025-07-20
  @Get('jornada/:email')
  getJornada(@Param('email') email: string, @Query('fecha') fecha?: string) {
    return this.iaService.getJornadaAsesor(email, fecha);
  }

  // ── Solo alertas de un asesor ──────────────────────────────────────
  // GET /ia-campo/alertas/asesor@correo.com
  @Get('alertas/:email')
  getAlertas(@Param('email') email: string, @Query('fecha') fecha?: string) {
    return this.iaService.getAlertasAsesor(email, fecha);
  }

  // ── Estado de los modelos ML ───────────────────────────────────────
  // GET /ia-campo/ml/estado
  @Get('ml/estado')
  getEstadoML() {
    return this.iaService.getEstadoML();
  }

  // ── Forzar reentrenamiento manual ──────────────────────────────────
  // POST /ia-campo/ml/entrenar
  @Post('ml/entrenar')
  reentrenar() {
    return this.iaService.reentrenar();
  }
}