import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { DashboardGestoresService, FiltroDashboard }    from './dashboard-gestores.service';

// DTO — clase en lugar de interface para compatibilidad con isolatedModules
class FiltroDashboardDto implements FiltroDashboard {
  campana?:        string;
  nombre_archivo?: string;
  fecha_desde?:    string;
  fecha_hasta?:    string;
}

// ══════════════════════════════════════════════════════════
//  DASHBOARD GESTORES CONTROLLER
//
//  POST /App/campo/dashboard-gestores/buscar
//       Body (todos opcionales):
//         { campana, nombre_archivo, fecha_desde, fecha_hasta }
//
//  Respuesta:
//    {
//      filtros:         { ... },
//      total_gestores:  N,
//      resumen: [
//        {
//          usuario_gestor, nombre_gestor,
//          total, gestionados, pendientes, desactivados,
//          pct_avance, total_deuda, ultima_gestion
//        }, ...
//      ],
//      totales: {
//        clientes, gestionados, pendientes,
//        desactivados, pct_avance, total_deuda
//      }
//    }
// ══════════════════════════════════════════════════════════

@Controller('dashboard-gestores')
export class DashboardGestoresController {

  constructor(private readonly service: DashboardGestoresService) {}

  @Post('buscar')
  @HttpCode(HttpStatus.OK)
  async buscar(@Body() filtros: FiltroDashboardDto) {
    return this.service.getDashboard(filtros);
  }
}
