import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AsignacionCampoService } from 'src/asignacionapp/services/asignacion-campo.service';
import { AsignarClientesDto }     from 'src/asignacionapp/dto/asignacion-campo.dto';

// ══════════════════════════════════════════════════════════
//  ASIGNACION CAMPO CONTROLLER
//  POST /App/campo/asignacion/guardar
// ══════════════════════════════════════════════════════════

@Controller('asignacion')
export class AsignacionCampoController {

  constructor(private readonly service: AsignacionCampoService) {}

  @Post('guardar')
  @HttpCode(HttpStatus.OK)
  async asignar(@Body() dto: AsignarClientesDto) {
    return this.service.asignarClientes(dto);
  }
}
