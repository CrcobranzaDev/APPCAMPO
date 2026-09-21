import {
  Injectable, Logger,
  BadRequestException, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource }       from 'typeorm';
import { ConfigService }    from '@nestjs/config';
import * as fs   from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

import { ConnectionName } from 'src/database/constants/connection-names';

const PDF_MAGIC_BYTES = Buffer.from('%PDF-');
const MAX_FILE_BYTES  = 5 * 1024 * 1024;

interface ArchivoSubido {
  buffer:   Buffer;
  filename: string;
}

interface CrearPostulacionInput {
  nombreCompleto:  string;
  dni:             string;
  telefono:        string;
  email:           string;
  vacanteUuid:     string;
  consentimiento:  boolean;
  ip:              string;
  cv:              ArchivoSubido | undefined;
  cul:             ArchivoSubido | undefined;
}

@Injectable()
export class PostulacionesPublicasService {

  private readonly logger = new Logger(PostulacionesPublicasService.name);
  private readonly storageDir: string;

  constructor(
    @InjectDataSource(ConnectionName.CRERP)
    private readonly dsCrerp: DataSource,
    config: ConfigService,
  ) {
    this.storageDir = path.resolve(
      config.get<string>('POSTULACIONES_STORAGE_PATH', './storage/postulaciones'),
    );
  }

  async listarVacantesActivas(): Promise<any[]> {
    return this.dsCrerp.query(
      `SELECT uuid, titulo, publicada_en
         FROM vacantes
        WHERE estado = 'ACTIVA'
        ORDER BY publicada_en DESC`,
    );
  }

  async obtenerVacanteActiva(uuid: string): Promise<any> {
    const rows = await this.dsCrerp.query(
      `SELECT uuid, titulo, plazas, publicada_en
         FROM vacantes
        WHERE uuid = ? AND estado = 'ACTIVA'`,
      [uuid],
    );
    if (!rows.length) throw new NotFoundException('Vacante no encontrada');
    return rows[0];
  }

  async crearPostulacion(input: CrearPostulacionInput): Promise<{ uuid: string }> {
    this.validarCampos(input);
    this.validarArchivo(input.cv, true);
    this.validarArchivo(input.cul, false);

    const vacante = await this.dsCrerp.query(
      `SELECT id FROM vacantes WHERE uuid = ? AND estado = 'ACTIVA'`,
      [input.vacanteUuid],
    );
    if (!vacante.length) throw new NotFoundException('Vacante no encontrada');
    const vacanteId = vacante[0].id;

    const postulanteId = await this.buscarOCrearPostulante(input);

    const cvArchivo  = this.guardarArchivo(input.cv!);
    const culArchivo = input.cul ? this.guardarArchivo(input.cul) : null;

    try {
      const postulacionUuid = randomUUID();
      await this.dsCrerp.query(
        `INSERT INTO postulaciones
           (uuid, postulante_id, vacante_id, cv_ruta, cv_nombre_original,
            cul_ruta, cul_nombre_original, origen_ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          postulacionUuid, postulanteId, vacanteId,
          cvArchivo.ruta, cvArchivo.nombreOriginal,
          culArchivo?.ruta ?? null, culArchivo?.nombreOriginal ?? null,
          input.ip,
        ],
      );
      return { uuid: postulacionUuid };
    } catch (err: any) {
      this.borrarArchivo(cvArchivo.ruta);
      if (culArchivo) this.borrarArchivo(culArchivo.ruta);

      if (err.code === 'ER_DUP_ENTRY') {
        throw new ConflictException('Ya existe una postulación para esta vacante');
      }
      this.logger.error('Error creando postulación', err);
      throw err;
    }
  }

  // ══════════════════════════════════════════════════════
  //  Postulante: busca por DNI, crea si no existe
  // ══════════════════════════════════════════════════════
  private async buscarOCrearPostulante(input: CrearPostulacionInput): Promise<number> {
    const existente = await this.dsCrerp.query(
      `SELECT id FROM postulantes WHERE dni = ?`,
      [input.dni],
    );
    if (existente.length) return existente[0].id;

    try {
      const uuid = randomUUID();
      const result = await this.dsCrerp.query(
        `INSERT INTO postulantes
           (uuid, nombre_completo, dni, telefono, email, consentimiento_datos_en)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuid, input.nombreCompleto, input.dni, input.telefono, input.email,
          input.consentimiento ? new Date() : null,
        ],
      );
      return result.insertId;
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY') {
        const reintento = await this.dsCrerp.query(
          `SELECT id FROM postulantes WHERE dni = ?`,
          [input.dni],
        );
        if (reintento.length) return reintento[0].id;
      }
      throw err;
    }
  }

  // ══════════════════════════════════════════════════════
  //  Validaciones
  // ══════════════════════════════════════════════════════
  private validarCampos(input: CrearPostulacionInput): void {
    const requeridos: [string, string][] = [
      ['nombre_completo', input.nombreCompleto],
      ['dni',             input.dni],
      ['telefono',        input.telefono],
      ['email',           input.email],
      ['vacante_uuid',    input.vacanteUuid],
    ];
    for (const [campo, valor] of requeridos) {
      if (!valor || !valor.trim()) {
        throw new BadRequestException(`El campo "${campo}" es obligatorio`);
      }
    }
  }

  private validarArchivo(archivo: ArchivoSubido | undefined, obligatorio: boolean): void {
    if (!archivo) {
      if (obligatorio) throw new BadRequestException('El CV es obligatorio');
      return;
    }
    if (archivo.buffer.length > MAX_FILE_BYTES) {
      throw new BadRequestException('El archivo supera el tamaño máximo de 5MB');
    }
    if (!archivo.buffer.subarray(0, 5).equals(PDF_MAGIC_BYTES)) {
      throw new BadRequestException('El archivo debe ser un PDF válido');
    }
  }

  // ══════════════════════════════════════════════════════
  //  Storage — carpeta propia fuera del webroot
  // ══════════════════════════════════════════════════════
  private guardarArchivo(archivo: ArchivoSubido): { ruta: string; nombreOriginal: string } {
    fs.mkdirSync(this.storageDir, { recursive: true });
    const nombreArchivo = `${randomUUID()}.pdf`;
    const rutaAbsoluta  = path.join(this.storageDir, nombreArchivo);
    fs.writeFileSync(rutaAbsoluta, archivo.buffer);
    return {
      ruta:           nombreArchivo,
      nombreOriginal: archivo.filename.slice(0, 255),
    };
  }

  private borrarArchivo(nombreArchivo: string): void {
    try {
      fs.unlinkSync(path.join(this.storageDir, nombreArchivo));
    } catch {
      // ya no existe o no se pudo borrar — no es crítico
    }
  }
}
