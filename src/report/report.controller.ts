import {
  Controller, Post, Body,
  HttpCode, HttpStatus, Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ExcelGestionesService } from './report.service';
import archiver from 'archiver';
import { PassThrough } from 'stream';

class ExcelFiltrosDto {
  campanas:    string[];   // ['MAFT2T3', 'SANT1']
  fecha_desde: string;     // YYYY-MM-DD requerido
  fecha_hasta: string;     // YYYY-MM-DD requerido
  gestor?:     string;     // opcional
}

// ══════════════════════════════════════════════════════════
//  EXCEL GESTIONES CONTROLLER — público, sin token
//  POST /App/campo/excel-gestiones/descargar
//
//  Retorna un .zip con el Excel adentro
//  Una hoja por campaña en el Excel
// ══════════════════════════════════════════════════════════

@Controller('excel-gestiones')
export class ExcelGestionesController {

  constructor(private readonly service: ExcelGestionesService) {}

  @Post('descargar')
  @HttpCode(HttpStatus.OK)
  async descargar(
    @Body() dto: ExcelFiltrosDto,
    @Res() reply: FastifyReply,
  ) {
    // 1. Generar Excel en buffer
    const excelBuffer = await this.service.generarExcel(
      dto.campanas,
      dto.fecha_desde,
      dto.fecha_hasta,
      dto.gestor,
    );

    const excelFilename = `gestiones_${dto.fecha_desde}_${dto.fecha_hasta}.xlsx`;
    const zipFilename   = `gestiones_${dto.fecha_desde}_${dto.fecha_hasta}.zip`;

    // 2. Comprimir en ZIP usando stream
    const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks:  Buffer[] = [];
      const output   = new PassThrough();
      const archive  = archiver('zip', { zlib: { level: 9 } });

      output.on('data',  chunk => chunks.push(chunk));
      output.on('end',   () => resolve(Buffer.concat(chunks)));
      output.on('error', reject);
      archive.on('error', reject);

      archive.pipe(output);
      archive.append(excelBuffer, { name: excelFilename });
      archive.finalize();
    });

    // 3. Enviar ZIP
    reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="${zipFilename}"`)
      .header('Content-Length', zipBuffer.length)
      .send(zipBuffer);
  }
}