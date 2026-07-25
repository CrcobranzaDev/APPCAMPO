import {
  Injectable, Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource }       from 'typeorm';
import * as fs              from 'fs';
import * as path            from 'path';

import { ConnectionName }        from 'src/database/constants/connection-names';
import { RegistrarGestionesDto } from './registro-gestion.dto';

// ══════════════════════════════════════════════════════════
//  REGISTRO GESTION SERVICE v2
//
//  Flujo:
//    1. Insertar una gestión por cada cuenta (SP_RegistrarGestion)
//    2. Si hay imagen base64:
//       a. Decodificar y guardar en disco
//          /uploads/gestiones/{año}/{mes}/{dia}/{timestamp}.jpg
//       b. Insertar en gestion_imagenes vinculando TODOS
//          los id_gestion de las cuentas del cliente
//    3. Retornar resultado
// ══════════════════════════════════════════════════════════

// Ruta base donde se guardan las imágenes
// Cambiar según el servidor de producción
const UPLOAD_BASE = process.env.UPLOAD_PATH ?? './uploads/gestiones';

@Injectable()
export class RegistroGestionService {

  private readonly logger = new Logger(RegistroGestionService.name);

  constructor(
    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly dsCampo: DataSource,
  ) {}

  // ══════════════════════════════════════════════════════
  //  FECHA/HORA ACTUAL EN ZONA PERÚ (GMT-5, sin DST)
  // ══════════════════════════════════════════════════════
  private obtenerFechaHoraPeru(): string {
    const ahoraUTC = new Date();

    // Perú siempre es UTC-5 (no tiene horario de verano)
    const OFFSET_PERU_MS = -5 * 60 * 60 * 1000;
    const limaTime = new Date(ahoraUTC.getTime() + OFFSET_PERU_MS);

    const yyyy = limaTime.getUTCFullYear();
    const mm   = String(limaTime.getUTCMonth() + 1).padStart(2, '0');
    const dd   = String(limaTime.getUTCDate()).padStart(2, '0');
    const hh   = String(limaTime.getUTCHours()).padStart(2, '0');
    const mi   = String(limaTime.getUTCMinutes()).padStart(2, '0');
    const ss   = String(limaTime.getUTCSeconds()).padStart(2, '0');

    // Formato compatible con datetime de SQL Server
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  }
// ══════════════════════════════════════════════════════
//  REGISTRAR GESTIONES
// ══════════════════════════════════════════════════════
async registrarGestiones(
  dto:           RegistrarGestionesDto,
  usuarioGestor: string,   // userid  → va a @user
  nombreGestor:  string,   // nombre completo → va a @usuario_gestor
): Promise<any> {

  // Limpiar @ del email para el userid
  const userId = usuarioGestor.includes('@')
    ? usuarioGestor.split('@')[0]
    : usuarioGestor;

  this.logger.log(
    `Registrando ${dto.gestiones.length} gestión(es) — gestor: ${userId} (${nombreGestor})`
  );

  const idsGestion:  number[] = [];
  let   insertados = 0;
  let   fallidos   = 0;
  const errores:     string[] = [];

  const primerItem     = dto.gestiones[0];
  const direccionComun = primerItem.direccion_adicional ?? null;
  const telefonoComun  = primerItem.telefono_adicional  ?? null;
  const encargadoComun = primerItem.encargado_pago      ?? null;

  // ── 1. Insertar gestión por cada cuenta ──────────────
  for (const g of dto.gestiones) {
    try {
      const result = await this.dsCampo.query(
  `EXEC SP_RegistrarGestion @0,@1,@2,@3,@4,@5,@6,@7,@8,@9,@10,@11,@12,@13,@14,@15,@16`,
  [
    g.id_cliente_asig,
    nombreGestor,
    userId,
    g.clasificacion,
    g.comentario          ?? null,
    g.foto_lat            ?? null,
    g.foto_lon            ?? null,
    g.foto_precision      ?? null,
    g.reg_lat             ?? null,
    g.reg_lon             ?? null,
    g.reg_precision       ?? null,
    g.direccion_adicional ?? direccionComun,
    g.telefono_adicional  ?? telefonoComun,
    g.encargado_pago      ?? encargadoComun,
    g.monto_pdp           ?? null,
    g.fecha_pdp           ?? null,
    //  fecha_gest: usa la del frontend o genera datetime actual
    g.fecha_gest      ?? this.obtenerFechaHoraPeru(),
  ],
);

      const idGestion = result?.[0]?.id_gestion ?? result?.id_gestion;
      if (idGestion) idsGestion.push(Number(idGestion));

      insertados++;

    } catch (error) {
      fallidos++;
      errores.push(`id_cliente ${g.id_cliente_asig}: ${error.message}`);
      this.logger.error(`Error gestion id_cliente ${g.id_cliente_asig}: ${error.message}`);
    }
  }

  // ── 2. Guardar imagen si viene en el body ─────────────
  let rutaImagen: string | null = null;

  if (dto.imagen_base64 && idsGestion.length > 0) {
    try {
      rutaImagen = await this.guardarImagen(
        dto.imagen_base64,
        dto.imagen_extension ?? 'jpg',
      );

      for (const idGestion of idsGestion) {
        await this.dsCampo.query(
          `EXEC SP_RegistrarGestionImagen @0, @1, @2, @3`,
          [
            idGestion,
            rutaImagen,
            dto.foto_lat ?? null,
            dto.foto_lon ?? null,
          ],
        );
      }

      this.logger.log(
        `Imagen guardada: ${rutaImagen} → vinculada a ${idsGestion.length} gestión(es)`
      );

    } catch (error) {
      this.logger.error(`Error guardando imagen: ${error.message}`);
      errores.push(`imagen: ${error.message}`);
    }
  }

  return {
    userId,
    nombreGestor,
    insertados,
    fallidos,
    ids_gestion: idsGestion,
    ruta_imagen: rutaImagen,
    errores:     errores.length > 0 ? errores : undefined,
    mensaje:     `${insertados} gestión(es) registrada(s) correctamente`,
  };
}
  // ══════════════════════════════════════════════════════
  //  GUARDAR IMAGEN EN DISCO
  //  Ruta: /uploads/gestiones/YYYY/MM/DD/timestamp.ext
  // ══════════════════════════════════════════════════════
  private async guardarImagen(
    base64:    string,
    extension: string,
  ): Promise<string> {

    // Limpiar prefijo base64 si viene con data:image/...
    const base64Clean = base64.replace(/^data:image\/\w+;base64,/, '');

    // Crear ruta con fecha organizada
    const ahora    = new Date();
    const año      = ahora.getFullYear();
    const mes      = String(ahora.getMonth() + 1).padStart(2, '0');
    const dia      = String(ahora.getDate()).padStart(2, '0');
    const timestamp = ahora.getTime();

    const dirRelativo = path.join(String(año), mes, dia);
    const dirAbsoluto = path.join(UPLOAD_BASE, dirRelativo);
    const nombreArchivo = `${timestamp}.${extension}`;
    const rutaAbsoluta  = path.join(dirAbsoluto, nombreArchivo);
    const rutaRelativa  = path.join('gestiones', dirRelativo, nombreArchivo)
                              .replace(/\\/g, '/');

    // Crear carpetas si no existen
    fs.mkdirSync(dirAbsoluto, { recursive: true });

    // Guardar imagen
    const buffer = Buffer.from(base64Clean, 'base64');
    fs.writeFileSync(rutaAbsoluta, buffer);

    this.logger.log(`Imagen guardada en: ${rutaAbsoluta}`);

    // Retornar ruta relativa para guardar en BD
    return rutaRelativa;
  }
}