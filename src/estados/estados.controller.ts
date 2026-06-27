import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { EstadosCampanaService } from 'src/estados/estados.service';

// DTO para la búsqueda existente
class EstadosDto {
  campana:   string;
  categoria: string;
}

// DTO para la actualización
class UpdateEstadoDto {
  campana:  string; 
  codigo:   string; 
  activo:   number; // 1 o 0
  esPDP:    number; // 1 o 0
}

@Controller('estados')
export class EstadosCampanaController {

  constructor(private readonly service: EstadosCampanaService) {}

  /**
   * Obtiene solo los estados ACTIVOS de una campaña
   * POST /estados/buscar
   */
  @Post('buscar')
  @HttpCode(HttpStatus.OK)
  async buscar(@Body() dto: EstadosDto) {
    return this.service.getEstados(dto.campana);
  }

  /**
   * Obtiene TODO el catálogo de estados (activos e inactivos) con todos sus campos
   * POST /estados/todos
   */
  @Post('todos')
  @HttpCode(HttpStatus.OK)
  async traerTodos(@Body() dto: { campana: string }) {
    // Usamos el nuevo método del servicio que trae todos los campos
    return this.service.findAllByCampana(dto.campana);
  }

  /**
   * Actualiza el estado de actividad y marca PDP
   * POST /estados/gestionar
   */
  @Post('gestionar')
  @HttpCode(HttpStatus.OK)
  async gestionar(@Body() dto: UpdateEstadoDto) {
    return this.service.updateEstado(
      dto.campana,
      dto.codigo,
      dto.activo,
      dto.esPDP
    );
  }
}