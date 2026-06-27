import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource }       from 'typeorm';
import * as ExcelJS         from 'exceljs';

import { ConnectionName }   from 'src/database/constants/connection-names';

// ══════════════════════════════════════════════════════════
//  EXCEL GESTIONES SERVICE
//
//  Genera un Excel con una hoja por campaña.
//  Las columnas de cliente se leen ÚNICAMENTE desde
//  campaign_columns_meta (fuente única de verdad) para evitar
//  cabeceras duplicadas. Luego se anexan los campos de gestión.
//
//  Filtros: campañas (array), fecha_desde, fecha_hasta, gestor
// ══════════════════════════════════════════════════════════

const IMAGE_BASE_URL = process.env.IMAGE_BASE_URL ?? 'http://192.168.1.26:5005/App/campo/uploads';

// Campos estáticos de gestiones (siempre al final)
const CAMPOS_GESTION = [
  'ESTATUS', 'CLASIFICACION', 'COMENTARIO', 'MONTO_PDP', 'FECHA_PDP',
  'GESTOR', 'DIRECCION_ADICIONAL', 'ENCARGADO_PAGO', 'TELEFONO_ADICIONAL',
  'FECHA_REGISTRO', 'UBIGEO', 'IMAGEN',
];

// Colores para cabeceras
const HEADER_COLOR  = '1A73E8';
const HEADER_COLOR2 = '0D47A1';

@Injectable()
export class ExcelGestionesService {

  private readonly logger = new Logger(ExcelGestionesService.name);

  constructor(
    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly dsCampo: DataSource,
  ) {}

  // ══════════════════════════════════════════════════════
  //  GENERAR EXCEL
  // ══════════════════════════════════════════════════════
  async generarExcel(
    campanas:   string[],
    fechaDesde: string,
    fechaHasta: string,
    gestor?:    string,
  ): Promise<Buffer> {

    if (!campanas || campanas.length === 0) {
      throw new BadRequestException('Debe indicar al menos una campaña');
    }
    if (!fechaDesde || !fechaHasta) {
      throw new BadRequestException('fecha_desde y fecha_hasta son requeridos');
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CR Cobranza App Campo';
    workbook.created = new Date();

    // ── Una hoja por campaña ──────────────────────────────
    for (const campaignId of campanas) {
      await this.agregarHoja(workbook, campaignId, fechaDesde, fechaHasta, gestor);
    }

    // ── Generar buffer ────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ══════════════════════════════════════════════════════
  //  AGREGAR HOJA POR CAMPAÑA
  // ══════════════════════════════════════════════════════
  private async agregarHoja(
    workbook:   ExcelJS.Workbook,
    campaignId: string,
    fechaDesde: string,
    fechaHasta: string,
    gestor?:    string,
  ): Promise<void> {

    // 1. Obtener campaign_id interno
    const campRows = await this.dsCampo.query(
      `SELECT id FROM campaigns WHERE campaign_id = @0`,
      [campaignId],
    );
    if (!campRows || campRows.length === 0) {
      this.logger.warn(`Campaña '${campaignId}' no encontrada — hoja omitida`);
      return;
    }
    const campaignIdInterno: number = campRows[0].id;

    // 2. Leer columnas dinámicas — FUENTE ÚNICA DE VERDAD
    //    Se filtra activo = 1 para no traer columnas desactivadas.
    const metaRows = await this.dsCampo.query(
      `SELECT columna_fisica, columna_etiqueta
       FROM campaign_columns_meta
       WHERE campaign_id = @0
         AND activo = 1
       ORDER BY orden ASC`,
      [campaignIdInterno],
    );

    if (!metaRows || metaRows.length === 0) {
      this.logger.warn(`Campaña '${campaignId}' sin columnas en campaign_columns_meta — hoja omitida`);
      return;
    }

    // 3. Deduplicar por etiqueta y por columna física.
    //    Esto protege contra filas repetidas en campaign_columns_meta
    //    (p. ej. si el INSERT se corrió dos veces).
    const etiquetasVistas = new Set<string>();
    const fisicasVistas    = new Set<string>();
    const metaCols = metaRows.filter((m: any) => {
      const etiqueta = String(m.columna_etiqueta).trim().toUpperCase();
      const fisica   = String(m.columna_fisica).trim().toLowerCase();
      if (etiquetasVistas.has(etiqueta) || fisicasVistas.has(fisica)) {
        this.logger.warn(`Columna duplicada ignorada en meta: ${m.columna_fisica} → ${m.columna_etiqueta}`);
        return false;
      }
      etiquetasVistas.add(etiqueta);
      fisicasVistas.add(fisica);
      return true;
    });

    // 4. Construir cabeceras (dinámicas del meta + estáticas de gestión)
    const cabeceras: string[] = [
      ...metaCols.map((m: any) => m.columna_etiqueta),
      ...CAMPOS_GESTION,
    ];

    // 5. Construir SELECT dinámico.
    //    Se usan corchetes en columna_fisica y en la etiqueta por si
    //    contienen espacios o caracteres reservados.
    const selectParts: string[] = [
      // Campos dinámicos desde clientes_asignados (definidos en el meta)
      ...metaCols.map(
        (m: any) => `cli.[${m.columna_fisica}] AS [${m.columna_etiqueta}]`,
      ),

      // Campos estáticos de gestiones
      `gs.clasificacion                                   AS ESTATUS`,
      `cs.status_name                                     AS CLASIFICACION`,
      `gs.comentario                                      AS COMENTARIO`,
      `gs.monto_pdp                                       AS MONTO_PDP`,
      `CONVERT(VARCHAR(10), gs.fecha_pdp, 120)            AS FECHA_PDP`,
      `gs.usuario_gestor                                  AS GESTOR`,
      `gs.direccion_adicional                             AS DIRECCION_ADICIONAL`,
      `gs.encargado_pago                                  AS ENCARGADO_PAGO`,
      `gs.telefono_adicional                              AS TELEFONO_ADICIONAL`,
      `CONVERT(VARCHAR(19), gs.fecha_hora_gestion, 120)   AS FECHA_REGISTRO`,
      `CASE WHEN gs.foto_lat IS NOT NULL AND gs.foto_lon IS NOT NULL
            THEN 'https://www.google.com/maps/search/?api=1&query=' +
                 CAST(gs.foto_lat AS VARCHAR(50)) + ',' +
                 CAST(gs.foto_lon AS VARCHAR(50))
            ELSE NULL END                                 AS UBIGEO`,
      `CASE WHEN ima.ruta_archivo IS NOT NULL
            THEN '${IMAGE_BASE_URL}/' + CAST(ima.ruta_archivo AS VARCHAR(200))
            ELSE NULL END                                 AS IMAGEN`,
    ];

    // 6. Params y WHERE
    const params: any[]    = [campaignId, fechaDesde + ' 00:00:00', fechaHasta + ' 23:59:59'];
    let   paramIdx         = 3;
    const wheres: string[] = [
      `cs.campaign_id = @0`,
      `gs.fecha_hora_gestion BETWEEN @1 AND @2`,
      `gs.fecha_hora_gestion IS NOT NULL`,
    ];

    if (gestor) {
      wheres.push(`gs.usuario_gestor = @${paramIdx}`);
      params.push(gestor);
      paramIdx++;
    }

  
    const query = `
      SELECT ${selectParts.join(',\n')}
      FROM  clientes_asignados cli
      LEFT  JOIN gestiones gs ON cli.id = gs.id_cliente_asig
      OUTER APPLY (
        SELECT TOP 1 cst.status_name, cst.campaign_id
        FROM   campana_status cst
        WHERE  cst.[status]     = gs.clasificacion
          AND  cst.campaign_id  = @0
        ORDER  BY cst.[status]
      ) cs
      OUTER APPLY (
        SELECT TOP 1 gi.ruta_archivo
        FROM   gestion_imagenes gi
        WHERE  gi.id_gestion = gs.id_gestion
        ORDER  BY gi.id_imagen ASC
      ) ima
      WHERE ${wheres.join('\n        AND ')}
      ORDER BY gs.fecha_hora_gestion DESC
    `;

    const rows = await this.dsCampo.query(query, params);

    // 7. Crear hoja
    const sheet = workbook.addWorksheet(campaignId, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    // 8. Cabecera con estilo
    sheet.columns = cabeceras.map(cab => ({
      header: cab,
      key:    cab,
      width:  cab.length < 10 ? 15 : cab.length + 5,
    }));

    const headerRow = sheet.getRow(1);
    headerRow.eachCell(cell => {
      cell.fill = {
        type:    'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${HEADER_COLOR}` },
      };
      cell.font = {
        bold:  true,
        color: { argb: 'FFFFFFFF' },
        size:  11,
        name:  'Arial',
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        bottom: { style: 'medium', color: { argb: `FF${HEADER_COLOR2}` } },
      };
    });
    headerRow.height = 22;

    // 9. Insertar datos
    const colUbigeo = cabeceras.indexOf('UBIGEO') + 1;
    const colImagen = cabeceras.indexOf('IMAGEN') + 1;

    rows.forEach((row: any, idx: number) => {
      const values: any[] = cabeceras.map(cab => row[cab] ?? '');
      const dataRow = sheet.addRow(values);

      // Alternar color de filas
      if (idx % 2 === 0) {
        dataRow.eachCell(cell => {
          cell.fill = {
            type:    'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF0F7FF' },
          };
        });
      }

      dataRow.eachCell(cell => {
        cell.font      = { name: 'Arial', size: 10 };
        cell.alignment = { vertical: 'middle', wrapText: false };
      });

      // UBIGEO → hyperlink clickeable con texto "VER"
      if (colUbigeo > 0 && row['UBIGEO']) {
        const cell = dataRow.getCell(colUbigeo);
        cell.value = { text: 'VER', hyperlink: row['UBIGEO'] };
        cell.font  = { name: 'Arial', size: 10, color: { argb: 'FF1A73E8' }, underline: true };
      }

      // IMAGEN → hyperlink clickeable con texto "VER"
      if (colImagen > 0 && row['IMAGEN']) {
        const cell = dataRow.getCell(colImagen);
        cell.value = { text: 'VER', hyperlink: row['IMAGEN'] };
        cell.font  = { name: 'Arial', size: 10, color: { argb: 'FF1A73E8' }, underline: true };
      }
    });

    // 10. Auto-filtro
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to:   { row: 1, column: cabeceras.length },
    };

    this.logger.log(`Hoja '${campaignId}' generada: ${rows.length} registros, ${cabeceras.length} columnas`);
  }
}