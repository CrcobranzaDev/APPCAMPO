import { Controller, Post, Req, BadRequestException } from '@nestjs/common';
import { SincronizacionCampoServiceMAFT2T3 }    from './syncro.maft2t3.service';
import type { FastifyRequest }                        from 'fastify';

@Controller('sync/maft2t3')
export class SincronizacionCampoControllerMAFT2T3 {

  constructor(private readonly service: SincronizacionCampoServiceMAFT2T3) {}

  @Post('upload')
  async upload(@Req() req: FastifyRequest) {
    if (!req.isMultipart()) throw new BadRequestException('Se esperaba multipart/form-data');

    const data = await req.file();
    if (!data) throw new BadRequestException('No se recibió archivo');

    const buffer = await data.toBuffer();
return this.service.ejecutarSyncMAFT2T3(buffer, 'MAFT2T3');

  }
}