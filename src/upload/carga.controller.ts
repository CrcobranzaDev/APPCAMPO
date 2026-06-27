import {
  Controller, Post, Param, Req,
  Body,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';   // ← import type

import { CargaService }      from 'src/upload/carga.service';
import { ConfirmarCargaDto } from 'src/upload/confirmar-carga.dto';

@Controller('carga-masiva')
export class CargaController {
  constructor(private readonly cargaService: CargaService) {}

  @Post('preview/:campaignId')
  async preview(
    @Param('campaignId') campaignId: string,
    @Req() req: any,   // ← any para evitar el problema con emitDecoratorMetadata
  ) {
    const part = await req.file();
    if (!part) throw new Error('No se recibió archivo');

    const chunks: Buffer[] = [];
    for await (const chunk of part.file) chunks.push(chunk);

    const file = {
      buffer:       Buffer.concat(chunks),
      originalname: part.filename,
      mimetype:     part.mimetype,
    } as Express.Multer.File;

    return this.cargaService.previsualizarCarga(file, campaignId.toUpperCase());
  }

  @Post('confirmar')
  async confirmar(@Body() dto: ConfirmarCargaDto) {
    return this.cargaService.confirmarCarga(dto);
  }
}