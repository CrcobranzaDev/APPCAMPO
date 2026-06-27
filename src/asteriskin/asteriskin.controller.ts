import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  BadRequestException,
} from '@nestjs/common';
import { AsteriskinService, CampoResponse } from './asteriskin.service';
import type { InsertaCampoDto } from './asteriskin.service';

@Controller('campo')
export class AsteriskinController {
  constructor(private readonly campoService: AsteriskinService) {}

  /**
   * POST /campo/asteriskin-multi
   *
   * Ejecuta INSERTA_CAMPO_MULTI en todas las conexiones Asterisk.
   * Busca el lead por vendor_lead_code + source_id + campaign_id.
   */
  @Post('asteriskin')
  @HttpCode(HttpStatus.OK)
  async insertarCampo(
    @Body() dto: InsertaCampoDto,
  ): Promise<{
    ok:      boolean;
    message: string;
    data:    CampoResponse;
  }> {
    // ─── Validaciones de campos requeridos ───────────────────────────────────
    if (!dto.vendor_lead_code?.trim()) {
      throw new BadRequestException('El campo vendor_lead_code es requerido');
    }
    if (!dto.source_id?.trim()) {
      throw new BadRequestException('El campo source_id es requerido');
    }
    if (!dto.campaign_id?.trim()) {
      throw new BadRequestException('El campo campaign_id es requerido');
    }
    if (!dto.status?.trim()) {
      throw new BadRequestException('El campo status es requerido');
    }
    if (!dto.user?.trim()) {
      throw new BadRequestException('El campo user es requerido');
    }

    const result = await this.campoService.insertarCampo(dto);

    if (result.executed_in === 0) {
      throw new BadRequestException(
        'El lead no fue encontrado en ninguna de las conexiones disponibles',
      );
    }

    return {
      ok:      true,
      message: `Registro procesado en ${result.executed_in} conexión(es)`,
      data:    result,
    };
  }
}