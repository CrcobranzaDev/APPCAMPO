// lista-negra.controller.ts
import {
  Controller, Post, Get, Body, Query, Req, BadRequestException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ListaNegraService } from 'src/listblack/listblack.service';
import { CrearListaNegraDto, VerificarBloqueoDto } from 'src/listblack/crear-lista-negra.dto';

@Controller('listas-negras')
export class ListaNegraController {
  constructor(private readonly service: ListaNegraService) {}

  @Post('uploadlistblack')
  crear(@Body() dto: CrearListaNegraDto) {
    return this.service.crearOActualizar(dto);
  }

  @Get('listarblack')
  listar(
    @Query('documento') documento?: string,
    @Query('campaingId') campaingId?: string,
  ) {
    return this.service.listar(documento, campaingId);
  }

  @Post('verificar')
  verificar(@Body() dto: VerificarBloqueoDto) {
    return this.service.verificarBloqueo(dto.documento, dto.campaingId);
  }

  // Carga masiva vía Excel — API nativa de @fastify/multipart
 @Post('cargar-excel')
async cargarExcel(@Req() req: FastifyRequest) {
  const archivo = await req.file();

  if (!archivo) {
    throw new BadRequestException('Debe adjuntar un archivo Excel');
  }
  if (!archivo.filename.match(/\.(xlsx|xls)$/i)) {
    throw new BadRequestException('El archivo debe ser .xlsx o .xls');
  }

  const buffer = await archivo.toBuffer();

  console.log('tamaño buffer:', buffer.length);
  console.log('primeros bytes:', buffer.subarray(0, 8).toString('hex'));
  console.log('mimetype recibido:', archivo.mimetype);
  console.log('filename recibido:', archivo.filename);

  return this.service.cargarDesdeExcel(buffer);
}
}