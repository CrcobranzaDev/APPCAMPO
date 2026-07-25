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
   * POST /campo/asteriskin
   *
   * Acepta UNA gestión (objeto) o VARIAS gestiones (array de objetos)
   * en el mismo request. Cada gestión se ejecuta en las 3 conexiones
   * Asterisk de forma independiente.
   */
  @Post('asteriskin')
  @HttpCode(HttpStatus.OK)
  async insertarCampo(
    @Body() body: InsertaCampoDto | InsertaCampoDto[],
  ): Promise<{
    ok:      boolean;
    message: string;
    data:    CampoResponse[];
  }> {
    // ─── Normalizar a array ──────────────────────────────────────────────
    const gestiones: InsertaCampoDto[] = Array.isArray(body) ? body : [body];

    if (gestiones.length === 0) {
      throw new BadRequestException('Debe enviar al menos una gestión');
    }

    // ─── Validar cada gestión individualmente ────────────────────────────
    gestiones.forEach((dto, index) => {
      const prefix = gestiones.length > 1 ? `Gestión #${index + 1}: ` : '';

      if (!dto.vendor_lead_code?.trim()) {
        throw new BadRequestException(`${prefix}El campo vendor_lead_code es requerido`);
      }
      if (!dto.source_id?.trim()) {
        throw new BadRequestException(`${prefix}El campo source_id es requerido`);
      }
      if (!dto.campaign_id?.trim()) {
        throw new BadRequestException(`${prefix}El campo campaign_id es requerido`);
      }
      if (!dto.status?.trim()) {
        throw new BadRequestException(`${prefix}El campo status es requerido`);
      }
      if (!dto.user?.trim()) {
        throw new BadRequestException(`${prefix}El campo user es requerido`);
      }
      if (!dto.fecha_gest?.trim()) {
        throw new BadRequestException(`${prefix}El campo fecha_gest es requerido`);
      }
    });

    // ─── Ejecutar cada gestión de forma SECUENCIAL ───────────────────────
    // (secuencial evita colisiones de uniqueid en el procedure cuando
    //  dos INSERTs llegan casi al mismo tiempo por la misma conexión)
    const data: CampoResponse[] = [];
    for (const dto of gestiones) {
      const result = await this.campoService.insertarCampo(dto);
      data.push(result);
    }

    const totalOk = data.reduce((acc, r) => acc + r.executed_in, 0);

    if (totalOk === 0) {
      throw new BadRequestException(
        'Ninguna gestión fue encontrada en las conexiones disponibles',
      );
    }

    return {
      ok:      true,
      message: `${gestiones.length} gestión(es) procesada(s), ${totalOk} inserciones exitosas en total`,
      data,
    };
  }
}