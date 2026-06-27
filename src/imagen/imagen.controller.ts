import {
  Controller, Get, Param,
  Res, NotFoundException,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import * as fs          from 'fs';
import * as path        from 'path';

// ══════════════════════════════════════════════════════════
//  IMAGEN CONTROLLER — público, sin token
//
//  GET /App/campo/uploads/*ruta
//
//  Ejemplo:
//  GET /App/campo/uploads/gestiones/2026/03/30/1743300000.jpg
//  → sirve el archivo desde /root/Projects/appcampo/upload/
// ══════════════════════════════════════════════════════════

const UPLOAD_BASE = process.env.UPLOAD_PATH ?? '/root/Projects/appcampo/uploads';

const MIME_TYPES: Record<string, string> = {
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  gif:  'image/gif',
  webp: 'image/webp',
};

@Controller('uploads')
export class ImagenController {

  @Get('*')
  async getImagen(
    @Param('*') ruta: string,
    @Res() reply: FastifyReply,
  ) {
    const rutaAbsoluta = path.join(UPLOAD_BASE, ruta);

    // Verificar que el archivo existe
    if (!fs.existsSync(rutaAbsoluta)) {
      throw new NotFoundException(`Imagen no encontrada: ${ruta}`);
    }

    // Determinar tipo MIME
    const extension = ruta.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mimeType  = MIME_TYPES[extension] ?? 'image/jpeg';

    // Leer y retornar el archivo
    const buffer = fs.readFileSync(rutaAbsoluta);
    reply
      .header('Content-Type', mimeType)
      .header('Cache-Control', 'public, max-age=86400')
      .send(buffer);
  }
}