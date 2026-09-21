import {
  Controller, Get, Post, Param, Req,
  HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

import { PostulacionesPublicasService } from 'src/postulaciones-publicas/postulaciones-publicas.service';

@Controller('publico')
export class PostulacionesPublicasController {

  constructor(private readonly service: PostulacionesPublicasService) {}

  @Get('vacantes')
  @HttpCode(HttpStatus.OK)
  async listarVacantes() {
    return this.service.listarVacantesActivas();
  }

  @Get('vacantes/:uuid')
  @HttpCode(HttpStatus.OK)
  async detalleVacante(@Param('uuid') uuid: string) {
    return this.service.obtenerVacanteActiva(uuid);
  }

  @Post('postulaciones')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.CREATED)
  async crearPostulacion(@Req() req: any) {
    const campos: Record<string, string> = {};
    let cv:  { buffer: Buffer; filename: string } | undefined;
    let cul: { buffer: Buffer; filename: string } | undefined;

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk);
        const archivo = { buffer: Buffer.concat(chunks), filename: part.filename };

        if (part.fieldname === 'cv')  cv  = archivo;
        if (part.fieldname === 'cul') cul = archivo;
      } else {
        campos[part.fieldname] = part.value;
      }
    }

    return this.service.crearPostulacion({
      nombreCompleto: campos['nombre_completo'],
      dni:            campos['dni'],
      telefono:       campos['telefono'],
      email:          campos['email'],
      vacanteUuid:    campos['vacante_uuid'],
      consentimiento: campos['consentimiento'] === 'true',
      ip:             req.ip,
      cv,
      cul,
    });
  }
}
