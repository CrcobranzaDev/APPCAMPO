import { Controller, Post, Req, Param, BadRequestException } from '@nestjs/common';
import { SincronizacionCampoServiceMAFT2T3 }    from './syncro.maft2t3.service';
import type { FastifyRequest }                        from 'fastify';

@Controller('sync')
export class SincronizacionCampoControllerMAFT2T3 {

  constructor(private readonly service: SincronizacionCampoServiceMAFT2T3) {}

  // ✅ Ahora la ruta recibe el campaignId como parámetro dinámico:
  //    POST /sync/MAFT2T3/upload, POST /sync/OTRACARTERA/upload, etc.
  @Post(':campaignId/upload')
  async upload(@Param('campaignId') campaignId: string, @Req() req: FastifyRequest) {
    if (!req.isMultipart()) throw new BadRequestException('Se esperaba multipart/form-data');

    const data = await req.file();
    if (!data) throw new BadRequestException('No se recibió archivo');

    const buffer = await data.toBuffer();

    // ✅ Ya no se hardcodea 'MAFT2T3' — se usa el valor real que llega en la URL
    return this.service.ejecutarSyncMAFT2T3(buffer, campaignId.toUpperCase());
  }
}