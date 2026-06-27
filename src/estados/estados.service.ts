import { Injectable, Logger, NotFoundException ,BadRequestException} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource }       from 'typeorm';

import { ConnectionName }   from 'src/database/constants/connection-names';

// ══════════════════════════════════════════════════════════
//  ESTADOS CAMPANA SERVICE
//
//  Recibe solo campaña y retorna estados con:
//    - codigo  (status)      → para registrar gestión
//    - nombre  (status_name) → para mostrar en app
//    - tipo    (category)    → CD | NC | otros
//
//  Mapeo de category:
//    CD    → CONTACTO DIRECTO
//    NC    → NO CONTACTO
//    otros → CONTACTO INDIRECTO
// ══════════════════════════════════════════════════════════

const CATEGORIA_LABEL: Record<string, string> = {
  CD: 'CONTACTO DIRECTO',
  NC: 'NO CONTACTO',
};

@Injectable()
export class EstadosCampanaService {

  private readonly logger = new Logger(EstadosCampanaService.name);

  constructor(
    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly dsCampo: DataSource,
  ) {}

  async getEstados(campana: string): Promise<any> {

  this.logger.log(`Estados — campaña: ${campana}`);

  let rows: any[];

  try {
    rows = await this.dsCampo.query(
      `SELECT status, status_name, category ,pdp as esPDP , activo       
       FROM campana_status
       WHERE campaign_id = @0 and activo = 1
       ORDER BY status_name ASC`,
      [campana],
    );
    this.logger.log(`Query OK — filas encontradas: ${rows?.length ?? 0}`);
  } catch (err) {
    this.logger.error(`Error en query — campaña: ${campana}`, err);
    throw err;
  }

  if (!rows || rows.length === 0) {
    this.logger.warn(`Sin resultados — campaña: ${campana}`);
    throw new NotFoundException(
      `No se encontraron estados para campaña '${campana}'`
    );
  }

  this.logger.log(`Mapeando ${rows.length} estados para campaña: ${campana}`);

  return {
    campana,
    total:   rows.length,
    estados: rows.map((r: any) => ({
      codigo:   r.status,
      nombre:   r.status_name,
      category: r.category,
      activo:   Number(!!r.activo), // Convierte true -> 1 y false -> 0
      esPDP:    Number(!!r.esPDP),
      tipo:     CATEGORIA_LABEL[r.category?.toUpperCase()] ?? 'CONTACTO INDIRECTO',
    })),
  };
}


  /**
   * Actualiza el estado de actividad y la marca de PDP
   * @param campaignId ID de la campaña
   * @param statusId Código del estado (ej. 'VNT', 'BUS')
   * @param activo 1 para activar, 0 para desactivar
   * @param esPDP 1 para marcar como principal, 0 para quitar marca
   */
  async updateEstado(
    campaignId: string, 
    statusId: string, 
    activo: number, 
    esPDP: number
  ): Promise<any> {
    
    this.logger.log(`Actualizando estado ${statusId} para campaña ${campaignId}`);

    // Validar que los valores sean 0 o 1
    if (![0, 1].includes(activo) || ![0, 1].includes(esPDP)) {
      throw new BadRequestException('Los valores de activo y esPDP deben ser 0 o 1');
    }

    const queryRunner = this.dsCampo.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Si el usuario quiere que este sea el PDP, reseteamos los demás primero
      if (esPDP === 1) {
        await queryRunner.query(
          `UPDATE campana_status 
           SET pdp = 0 
           WHERE campaign_id = @0`,
          [campaignId]
        );
      }

      // 2. Actualizamos el registro específico
      const result = await queryRunner.query(
        `UPDATE campana_status 
         SET activo = @0, pdp = @1 
         WHERE campaign_id = @2 AND status = @3`,
        [activo, esPDP, campaignId, statusId]
      );

      await queryRunner.commitTransaction();
      
      this.logger.log(`Estado ${statusId} actualizado correctamente.`);
      return { message: 'Actualización exitosa', campaignId, statusId, activo, esPDP };

    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error actualizando estado: ${err.message}`);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

async findAllByCampana(campana: string): Promise<any[]> {
    this.logger.log(`Fetching all status records for campaign: ${campana}`);

    try {
      // Consulta directa de todos los campos relevantes
      const rows = await this.dsCampo.query(
        `SELECT 
            status AS codigo, 
            status_name AS nombre, 
            category, 
            activo, 
            pdp AS esPDP,
            sync_fecha
         FROM campana_status
         WHERE campaign_id = @0 and activo = 1
         ORDER BY status_name ASC`,
        [campana],
      );

      if (!rows || rows.length === 0) {
        this.logger.warn(`No se encontraron registros para la campaña: ${campana}`);
        // Devolvemos array vacío en lugar de excepción si prefieres un GET limpio
        return []; 
      }

      // Retornamos el mapeo simple con la lógica de tipo de contacto que ya manejas
      return rows.map((r: any) => ({
        ...r,
        tipo: CATEGORIA_LABEL[r.category?.toUpperCase()] ?? 'CONTACTO INDIRECTO',
        // Convertimos bits de SQL a booleanos reales de JS
        activo: Number(!!r.activo), // Convierte true -> 1 y false -> 0
        esPDP: Number(!!r.esPDP)
      }));

    } catch (err) {
      this.logger.error(`Error en findAllByCampana [${campana}]: ${err.message}`);
      throw err;
    }
  }

}