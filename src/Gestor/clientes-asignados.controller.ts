import { Controller, Post, Body, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { FastifyReply }          from 'fastify';
import { ClientesAsignadosService }   from './clientes-asignados.service';

// Clase en lugar de interface para evitar error con isolatedModules
class BuscarClientesDto {
  gestor?:         string;
  campana?:        string;
  estado?:         string;
  fecha_desde?:    string;
  fecha_hasta?:    string;
  nombre_archivo?: string;
}

// ══════════════════════════════════════════════════════════
//  CLIENTES ASIGNADOS CONTROLLER — público, sin token
//
//  POST /App/campo/clientes-asignados/buscar
//  POST /App/campo/clientes-asignados/exportar
// ══════════════════════════════════════════════════════════

@Controller('clientes-asignados')
export class ClientesAsignadosController {

  constructor(private readonly service: ClientesAsignadosService) {}

  @Post('buscar')
  @HttpCode(HttpStatus.OK)
  async buscar(@Body() filtros: BuscarClientesDto) {
    return this.service.getClientesAsignados(filtros);
  }

@Post('exportar')
@HttpCode(HttpStatus.OK)
async exportar(
  @Body() filtros: BuscarClientesDto,
  @Res() res: FastifyReply,
) {
  const buffer = await this.service.exportToExcel(filtros);

  const fecha    = new Date().toISOString().slice(0, 10);
  const filename = `clientes_asignados_${fecha}`;

  const JSZip    = require('jszip');
  const zip      = new JSZip();
  zip.file(`${filename}.xlsx`, buffer);

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  res.header('Content-Type',        'application/zip');
  res.header('Content-Disposition', `attachment; filename="${filename}.zip"`);
  res.header('Content-Length',      String(zipBuffer.length));

  return res.send(zipBuffer);
}


}