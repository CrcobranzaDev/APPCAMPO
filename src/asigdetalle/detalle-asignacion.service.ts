import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource }       from 'typeorm';
import { ConnectionName }   from 'src/database/constants/connection-names';

@Injectable()
export class DetalleAsignacionService {

  private readonly logger = new Logger(DetalleAsignacionService.name);

  constructor(
    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly dsCampo: DataSource,
  ) {}

  async getDetalleCliente(documento: string, campana: string): Promise<any[]> {

    this.logger.log(`Buscando cliente: documento=${documento}, campaña=${campana}`);

    // ── 1. Campaña ────────────────────────────────────────────────────────────
    const campRows = await this.dsCampo.query(
      `SELECT [id], [campaign_id], [campaign_name]
       FROM   [dbo].[campaigns]
       WHERE  [campaign_id] = @0 AND [active] = 'Y'`,
      [campana],
    );

    if (!campRows?.length) {
      throw new NotFoundException(`Campaña '${campana}' no encontrada o inactiva`);
    }

    const { id: campaignIntId, campaign_id, campaign_name } = campRows[0];

    // ── 2. Metadata dinámica desde campaign_columns_meta ─────────────────────
    const metaRows: { columna_fisica: string; columna_etiqueta: string }[] =
      await this.dsCampo.query(
        `SELECT [columna_fisica], [columna_etiqueta]
         FROM   [dbo].[campaign_columns_meta]
         WHERE  [campaign_id] = @0 AND [activo] = 1
         ORDER BY [orden] ASC`,
        [campaignIntId],
      );

    const metaMap = new Map<string, string>(
      metaRows.map(r => [r.columna_fisica.trim(), r.columna_etiqueta.trim()])
    );

    // ── 3. Solo clientes ACTIVOS ──────────────────────────────────────────────
    const clientes = await this.dsCampo.query(
      `SELECT
         [id], [carga_id], [periodo],
         [usuario_gestor], [nombre_gestor],
         [documento], [cuenta], [cliente],
         [direccion], [distrito],
         -- texto (12 slots)
         [ext_txt1],  [ext_txt2],  [ext_txt3],  [ext_txt4],
         [ext_txt5],  [ext_txt6],  [ext_txt7],  [ext_txt8],
         [ext_txt9],  [ext_txt10], [ext_txt11], [ext_txt12],
         -- numérico (7 slots)
         [ext_num1],  [ext_num2],  [ext_num3],  [ext_num4],
         [ext_num5],  [ext_num6],  [ext_num7],
         -- fecha (5 slots)
         [ext_fec1],  [ext_fec2],  [ext_fec3],  [ext_fec4],  [ext_fec5],
         [estado],
         CONVERT(VARCHAR(19), [fecha_carga],            120) AS fecha_carga,
         CONVERT(VARCHAR(19), [fecha_ult_reasignacion], 120) AS fecha_ult_reasignacion,
         CONVERT(VARCHAR(19), [fecha_actualizacion],    120) AS fecha_actualizacion
       FROM   [dbo].[clientes_asignados]
       WHERE  [documento]   = @0
         AND  [campaign_id] = @1
         AND  [estado]      = 'ACTIVO'
       ORDER BY [fecha_carga] DESC`,
      [documento, campaignIntId],
    );

    if (!clientes?.length) {
      throw new NotFoundException(
        `No se encontraron cuentas ACTIVAS para documento '${documento}' en campaña '${campana}'`
      );
    }

    // ── 4. Mapear ─────────────────────────────────────────────────────────────
    return clientes.map((row: any) => this.mapearFila(row, metaMap, campaign_id, campaign_name));
  }

  private mapearFila(
    row:           any,
    metaMap:       Map<string, string>,
    campaign_id:   string,
    campaign_name: string,
  ): any {

    // Campos fijos
    const resultado: any = {
      id:                     row.id,
      carga_id:               row.carga_id,
      campaign_id,
      campaign_name,
      periodo:                row.periodo,
      usuario_gestor:         row.usuario_gestor,
      nombre_gestor:          row.nombre_gestor,
      documento:              row.documento,
      cuenta:                 row.cuenta,
      cliente:                row.cliente,
      direccion:              row.direccion,
      distrito:               row.distrito,
      estado:                 row.estado,
      fecha_carga:            row.fecha_carga,
      fecha_ult_reasignacion: row.fecha_ult_reasignacion,
      fecha_actualizacion:    row.fecha_actualizacion,
    };

    // Campos ext — solo los que tienen etiqueta en campaign_columns_meta
    const extCols = [
      'ext_txt1','ext_txt2','ext_txt3','ext_txt4', 'ext_txt5', 'ext_txt6',
      'ext_txt7','ext_txt8','ext_txt9','ext_txt10','ext_txt11','ext_txt12',
      'ext_num1','ext_num2','ext_num3','ext_num4', 'ext_num5', 'ext_num6','ext_num7',
      'ext_fec1','ext_fec2','ext_fec3','ext_fec4', 'ext_fec5',
    ];

    extCols.forEach(col => {
      const etiqueta = metaMap.get(col);
      if (etiqueta && row[col] !== null && row[col] !== undefined) {
        resultado[etiqueta] = row[col];
      }
    });

    return resultado;
  }
}