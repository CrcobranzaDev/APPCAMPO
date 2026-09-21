import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as XLSX from 'xlsx';

import { ConnectionName } from 'src/database/constants/connection-names';
import {
  ColMaskMeta,
  ColCampoMeta,
  CampaniaMaps,
  FilaExcelNormalizada,
  RegistroPreview,
  PreviewResult,
  RegistroConfirmar,
} from 'src/upload/carga.interface';
import { ConfirmarCargaDto } from 'src/upload/confirmar-carga.dto';

// Nombre de la columna física que representa el documento del cliente
// en campaign_columns_meta.columna_fisica. Ajustar aquí si en alguna
// campaña usa un nombre distinto (ej. 'dni', 'nro_documento').
const DOCUMENTO_FISICA_NAME = 'documento';

@Injectable()
export class CargaService {
  private readonly logger = new Logger(CargaService.name);

  constructor(
    @InjectDataSource(ConnectionName.SQLSERVER_MAESTRA)
    private readonly maestraDs: DataSource,

    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly campoDs: DataSource,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  //  PASO 1 — PREVIEW
  // ══════════════════════════════════════════════════════════════════════════
  async previsualizarCarga(
    file: Express.Multer.File,
    campaignId: string,
  ): Promise<PreviewResult & { totalBloqueados: number }> {

    const [maskMeta, campoMeta] = await Promise.all([
      this.getColMaskMeta(campaignId),
      this.getColCampoMeta(campaignId),
    ]);

    if (!maskMeta.length) {
      throw new BadRequestException(`Sin metadata para campaña ${campaignId}`);
    }

    const maps = this.buildMaps(maskMeta, campoMeta);

    if (!maps.keyFrCols.length) {
      throw new BadRequestException(
        `La campaña ${campaignId} no tiene columnas marcadas como llave (es_llave=1)`,
      );
    }

    const fisicaToFr = new Map<string, string>();
    maps.frToFisica.forEach((fisica, frCol) => fisicaToFr.set(fisica, frCol));

    const columnas = campoMeta.map(cm => ({
      frCol:          fisicaToFr.get(cm.columna_fisica) ?? null,
      fisica:         cm.columna_fisica,
      etiqueta:       cm.columna_etiqueta,
      columna_origen: cm.columna_origen,
    }));

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, {
      defval: null,
      raw:    false,
    });

    if (!rawRows.length) {
      return {
        totalExcel: 0,
        totalEncontrados: 0,
        totalNoEncontrados: 0,
        totalBloqueados: 0,
        columnas,
        registros: [],
      };
    }

    const filasTotales = rawRows.map(row => this.normalizarFila(row, maskMeta, maps.keyFrCols));

    // ────────────────────────────────────────────────────────────────────
    // LISTAS NEGRAS: se valida ANTES de tocar FR_MASCARA. Los documentos
    // bloqueados se descartan aquí mismo y nunca llegan a la búsqueda de
    // información — así no se gasta esa consulta (chunks de 200 con OR)
    // en registros que de todas formas no se van a mostrar.
    // ────────────────────────────────────────────────────────────────────
    const documentoFrCol = this.resolveDocumentoFrCol(maps);

    let documentosBloqueados = new Set<string>();

    if (documentoFrCol) {
      const documentosUnicos = [...new Set(
        filasTotales
          .map(f => this.extraerDocumento(f, documentoFrCol, maskMeta))
          .filter(doc => doc),
      )];

      documentosBloqueados = await this.getDocumentosBloqueados(documentosUnicos, campaignId);
    } else {
      this.logger.warn(
        `No se encontró columna física "${DOCUMENTO_FISICA_NAME}" para la campaña ${campaignId}; no se aplicará el filtro de listas negras.`,
      );
    }

    // Filas que SÍ pasan la validación de Listas Negras — solo estas
    // avanzan a la búsqueda en FR_MASCARA.
    const filas = documentoFrCol
      ? filasTotales.filter(f => {
          const doc = this.extraerDocumento(f, documentoFrCol, maskMeta);
          return !doc || !documentosBloqueados.has(doc);
        })
      : filasTotales;

    const totalBloqueados = filasTotales.length - filas.length;

    if (totalBloqueados > 0) {
      this.logger.log(
        `Preview campaña ${campaignId}: ${totalBloqueados} documento(s) inhibidos por Listas Negras (no pasan a FR_MASCARA).`,
      );
    }

    if (!filas.length) {
      return {
        totalExcel:         filasTotales.length,
        totalEncontrados:   0,
        totalNoEncontrados: 0,
        totalBloqueados,
        columnas,
        registros: [],
      };
    }

    // Solo los documentos NO bloqueados llegan a esta búsqueda.
    const encontradosMap = await this.buscarEnFRMascara(filas, campaignId, maps.keyFrCols);

    const registros: RegistroPreview[] = filas.map(f => {
      const key  = this.buildKey(f.keys, maps.keyFrCols);
      const dato = encontradosMap.get(key) ?? null;
      return {
        keys:             f.keys,
        excelData:        f.excelData,
        asesor:           f.asesor,
        encontrado:       dato !== null,
        datosEncontrados: dato,
      };
    });

    return {
      totalExcel:         filasTotales.length,
      totalEncontrados:   registros.filter(r => r.encontrado).length,
      totalNoEncontrados: registros.filter(r => !r.encontrado).length,
      totalBloqueados,
      columnas,
      registros,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PASO 2 — CONFIRMAR
  // ══════════════════════════════════════════════════════════════════════════
  async confirmarCarga(
    dto: ConfirmarCargaDto,
  ): Promise<{ cargaId: number; insertados: number; omitidos: number; bloqueados: number }> {
    const { campaignId, nombreArchivo, usuarioCarga, registros } = dto;

    if (!registros.length) throw new BadRequestException('Sin registros para confirmar');

    // 1. Resolver campaignIntId
    let campaignIntId = dto.campaignIntId;
    if (!campaignIntId) {
      const rows: { id: number }[] = await this.campoDs.query(
        `SELECT [id] FROM [dbo].[campaigns] WHERE [campaign_id] = @0`,
        [campaignId],
      );
      if (!rows[0]?.id) throw new BadRequestException(`Campaña ${campaignId} no encontrada en BD_APP`);
      campaignIntId = rows[0].id;
    }

    // 2. Metadata de mapeo
    const [maskMeta, campoMeta] = await Promise.all([
      this.getColMaskMeta(campaignId),
      this.getColCampoMeta(campaignId),
    ]);
    const maps = this.buildMaps(maskMeta, campoMeta);

    this.logger.debug(`keyFrCols: ${JSON.stringify(maps.keyFrCols)}`);
    this.logger.debug(`frToFisica: ${JSON.stringify([...maps.frToFisica.entries()])}`);

    // ────────────────────────────────────────────────────────────────────
    // LISTAS NEGRAS: doble verificación al confirmar, por si un documento
    // fue bloqueado entre el preview y este paso (ventana de tiempo).
    // ────────────────────────────────────────────────────────────────────
    const documentoFrCol = this.resolveDocumentoFrCol(maps);

    let documentosBloqueados = new Set<string>();

    if (documentoFrCol) {
      const documentosUnicos = [...new Set(
        registros
          .map(r => this.extraerDocumentoDeRegistroConfirmar(r, documentoFrCol))
          .filter(doc => doc),
      )];

      documentosBloqueados = await this.getDocumentosBloqueados(documentosUnicos, campaignId);
    }

    // 3. Crear entrada en cargas
    const cargaRes: { carga_id: number }[] = await this.campoDs.query(
      `INSERT INTO [dbo].[cargas] ([campaign_id],[nombre_archivo],[usuario_carga])
       OUTPUT INSERTED.id AS carga_id
       VALUES (@0, @1, @2)`,
      [campaignIntId, nombreArchivo, usuarioCarga],
    );
    const cargaId = cargaRes[0].carga_id;
    this.logger.debug(`Carga creada con id: ${cargaId}`);

    // 4. Insertar registros uno a uno
    const CHUNK   = 200;
    let insertados = 0;
    let omitidos   = 0;
    let bloqueados = 0;

    for (let i = 0; i < registros.length; i += CHUNK) {
      const chunk = registros.slice(i, i + CHUNK);

      for (const reg of chunk) {
        if (i === 0 && chunk.indexOf(reg) === 0) {
          this.logger.debug(`Primer reg.keys: ${JSON.stringify(reg.keys)}`);
        }

        // Bloqueo por Listas Negras: se omite sin insertar.
        if (documentoFrCol) {
          const doc = this.extraerDocumentoDeRegistroConfirmar(reg, documentoFrCol);
          if (doc && documentosBloqueados.has(doc)) {
            this.logger.warn(`Registro omitido por Listas Negras — documento: ${doc}`);
            bloqueados++;
            continue;
          }
        }

        const params = this.buildInsertParams(reg, maps, cargaId, campaignIntId, campaignId);

        if (i === 0 && chunk.indexOf(reg) === 0) {
          this.logger.debug(`Primer params a insertar: ${JSON.stringify(params)}`);
        }

        // Verificar que las llaves físicas tienen valor
        const llavesConValor = maps.keyFrCols.every(frCol => {
          const fisica = maps.frToFisica.get(frCol);
          return fisica && params[fisica] != null && params[fisica] !== '';
        });

        if (!llavesConValor) {
          this.logger.warn(`Registro omitido por llaves vacías: ${JSON.stringify(reg.keys)}`);
          omitidos++;
          continue;
        }

        const cols         = Object.keys(params);
        const vals         = Object.values(params);
        const placeholders = vals.map((_, idx) => `@${idx}`).join(', ');
        const colList      = cols.map(c => `[${c}]`).join(', ');

        try {
          await this.campoDs.query(
            `INSERT INTO [dbo].[clientes_asignados] (${colList}) VALUES (${placeholders})`,
            vals,
          );
          insertados++;
        } catch (err: any) {
          this.logger.error(`Error insertando registro: ${err?.message}`);
          this.logger.error(`Vals: ${JSON.stringify(vals)}`);
          omitidos++;
        }
      }
    }

    this.logger.log(
      `Carga ${cargaId} finalizada — insertados: ${insertados}, omitidos: ${omitidos}, bloqueados: ${bloqueados}`,
    );

    return { cargaId, insertados, omitidos, bloqueados };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  HELPERS PRIVADOS
  // ══════════════════════════════════════════════════════════════════════════

  private async getColMaskMeta(campaignId: string): Promise<ColMaskMeta[]> {
    return this.maestraDs.query(
      `SELECT [columna], [columna_etiqueta]
       FROM [BD_CR_MAESTRA].[dbo].[T_Columnas_mask]
       WHERE [campaign_id] = @0`,
      [campaignId],
    );
  }

  private async getColCampoMeta(campaignId: string): Promise<ColCampoMeta[]> {
    return this.campoDs.query(
      `SELECT ccm.[columna_fisica], ccm.[columna_origen], ccm.[columna_etiqueta],
              ccm.[orden], ccm.[es_llave]
       FROM [dbo].[campaign_columns_meta] ccm
       INNER JOIN [dbo].[campaigns] c ON c.[id] = ccm.[campaign_id]
       WHERE c.[campaign_id] = @0 AND ccm.[activo] = 1
       ORDER BY ccm.[orden]`,
      [campaignId],
    );
  }

  private buildMaps(maskMeta: ColMaskMeta[], campoMeta: ColCampoMeta[]): CampaniaMaps {
    const etiquetaToFr = new Map<string, string>();
    maskMeta.forEach(m =>
      etiquetaToFr.set(m.columna_etiqueta.trim().toUpperCase(), m.columna.trim()),
    );

    const frToFisica = new Map<string, string>();
    const keyFrCols: string[] = [];

    campoMeta.forEach(cm => {
      const frCol = etiquetaToFr.get(cm.columna_origen.trim().toUpperCase());
      if (!frCol) return;
      frToFisica.set(frCol, cm.columna_fisica.trim());
      if (cm.es_llave) keyFrCols.push(frCol);
    });

    return { etiquetaToFr, frToFisica, keyFrCols };
  }

  private normalizarFila(
    row: Record<string, any>,
    maskMeta: ColMaskMeta[],
    keyFrCols: string[],
  ): FilaExcelNormalizada {
    const r: Record<string, any> = {};
    Object.keys(row).forEach(h => { r[h.trim().toUpperCase()] = row[h]; });

    const keys: Record<string, string> = {};
    keyFrCols.forEach(frCol => {
      const meta = maskMeta.find(m => m.columna.trim() === frCol);
      if (meta) {
        keys[frCol] = String(r[meta.columna_etiqueta.trim().toUpperCase()] ?? '').trim();
      }
    });

    const excelData: Record<string, string> = {};
    maskMeta.forEach(m => {
      const etiqueta = m.columna_etiqueta.trim();
      excelData[etiqueta] = String(r[etiqueta.toUpperCase()] ?? '').trim();
    });

    return { keys, excelData, asesor: String(r['ASESOR'] ?? '').trim() };
  }

  private buildKey(keys: Record<string, string>, keyFrCols: string[]): string {
    return keyFrCols.map(col => keys[col] ?? '').join('|');
  }

  private async buscarEnFRMascara(
    filas: FilaExcelNormalizada[],
    campaignId: string,
    keyFrCols: string[],
  ): Promise<Map<string, Record<string, any>>> {
    const resultado = new Map<string, Record<string, any>>();
    const CHUNK = 200;

    for (let i = 0; i < filas.length; i += CHUNK) {
      const chunk  = filas.slice(i, i + CHUNK);
      const params: any[] = [campaignId];

      const orConditions = chunk.map(fila => {
        const andParts = keyFrCols.map(col => {
          const idx = params.length;
          params.push(fila.keys[col] ?? '');
          return `ISNULL(fr.[${col}],'') = ISNULL(@${idx},'')`;
        });
        return `(${andParts.join(' AND ')})`;
      });

      const sql = `
        SELECT fr.*
        FROM [BD_CR_MAESTRA].[dbo].[FR_MASCARA] fr
        WHERE fr.campaign_id = @0
          AND (${orConditions.join(' OR ')})`;

      const rows: Record<string, any>[] = await this.maestraDs.query(sql, params);

      rows.forEach(row => {
        const rowKeys: Record<string, string> = {};
        keyFrCols.forEach(col => { rowKeys[col] = String(row[col] ?? ''); });
        resultado.set(this.buildKey(rowKeys, keyFrCols), row);
      });
    }

    return resultado;
  }

  private buildInsertParams(
    reg: RegistroConfirmar,
    maps: CampaniaMaps,
    cargaId: number,
    campaignIntId: number,
    campana: string,
  ): Record<string, any> {
    const params: Record<string, any> = {
      carga_id:       cargaId,
      campaign_id:    campaignIntId,
      campana,
      usuario_gestor: reg.asesor || 'SIN_ASIGNAR',
      nombre_gestor:  null,
      cliente:        '',
      direccion:      null,
      distrito:       null,
      ext_txt1:  null, ext_txt2:  null, ext_txt3:  null, ext_txt4:  null,
      ext_txt5:  null, ext_txt6:  null, ext_txt7:  null, ext_txt8:  null,
      ext_txt9:  null, ext_txt10: null, ext_txt11: null, ext_txt12: null,
      ext_num1:  null, ext_num2:  null, ext_num3:  null, ext_num4:  null,
      ext_num5:  null, ext_num6:  null, ext_num7:  null,
      ext_fec1:  null, ext_fec2:  null, ext_fec3:  null,
      ext_fec4:  null, ext_fec5:  null,
      estado: 'ACTIVO',
    };

    // Llaves: vienen como frCol desde el frontend → traducir a física
    Object.entries(reg.keys).forEach(([frCol, val]) => {
      const fisica = maps.frToFisica.get(frCol.trim());
      if (fisica) params[fisica] = val ?? null;
    });

    // Resto de columnas desde FR_MASCARA
    if (reg.datosEncontrados) {
      Object.entries(reg.datosEncontrados).forEach(([frCol, val]) => {
        const fisica = maps.frToFisica.get(frCol.trim());
        if (fisica) params[fisica] = val ?? null;
      });
    }

    return params;
  }

  // ────────────────────────────────────────────────────────────────────────
  //  LISTAS NEGRAS
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Encuentra el frCol (columna del Excel/FR_MASCARA) que corresponde
   * a la columna física "documento" según campaign_columns_meta.
   * Devuelve null si la campaña no tiene esa columna mapeada.
   */
  private resolveDocumentoFrCol(maps: CampaniaMaps): string | null {
    for (const [frCol, fisica] of maps.frToFisica.entries()) {
      if (fisica.trim().toLowerCase() === DOCUMENTO_FISICA_NAME) {
        return frCol;
      }
    }
    return null;
  }

  /**
   * Extrae el valor de documento de una fila normalizada del Excel.
   * Si la columna de documento es llave (es_llave=1), viene en f.keys;
   * si no, se busca en excelData usando su etiqueta.
   */
  private extraerDocumento(
    f: FilaExcelNormalizada,
    documentoFrCol: string,
    maskMeta: ColMaskMeta[],
  ): string {
    if (f.keys[documentoFrCol] !== undefined) {
      return f.keys[documentoFrCol];
    }

    const meta = maskMeta.find(m => m.columna.trim() === documentoFrCol);
    if (meta) {
      return f.excelData[meta.columna_etiqueta.trim()] ?? '';
    }

    return '';
  }

  /**
   * Extrae el valor de documento de un RegistroConfirmar (paso de
   * confirmación), intentando primero en keys y luego en datosEncontrados.
   */
  private extraerDocumentoDeRegistroConfirmar(
    reg: RegistroConfirmar,
    documentoFrCol: string,
  ): string {
    if (reg.keys?.[documentoFrCol] !== undefined) {
      return String(reg.keys[documentoFrCol] ?? '').trim();
    }

    if (reg.datosEncontrados?.[documentoFrCol] !== undefined) {
      return String(reg.datosEncontrados[documentoFrCol] ?? '').trim();
    }

    return '';
  }

  /**
   * Consulta list_negras y devuelve el conjunto de documentos
   * efectivamente bloqueados (act=1) para la campaña dada, aplicando
   * precedencia: regla específica de campaña > regla general (ALL).
   */
  private async getDocumentosBloqueados(
    documentos: string[],
    campaignId: string,
  ): Promise<Set<string>> {
    if (!documentos.length) return new Set();

    const CHUNK = 500; // límite prudente de parámetros por consulta
    const bloqueados = new Set<string>();

    for (let i = 0; i < documentos.length; i += CHUNK) {
      const chunk = documentos.slice(i, i + CHUNK);

      // @0 = campaignId, @1..@N = documentos del chunk
      const params: any[] = [campaignId, ...chunk];
      const placeholders = chunk.map((_, idx) => `@${idx + 1}`).join(', ');

      const sql = `
        SELECT [documento], [campaing_id], [act]
        FROM [dbo].[list_negras]
        WHERE [campaing_id] IN (@0, 'ALL')
          AND [documento] IN (${placeholders})`;

      const rows: { documento: string; campaing_id: string; act: number }[] =
        await this.campoDs.query(sql, params);

      // Agrupar por documento aplicando precedencia:
      // específico de campaña > ALL
      const porDocumento = new Map<string, { especifico?: number; all?: number }>();

      rows.forEach(row => {
        const doc = String(row.documento ?? '').trim();
        if (!doc) return;

        const entry = porDocumento.get(doc) ?? {};

        if (String(row.campaing_id).toUpperCase() === 'ALL') {
          entry.all = Number(row.act);
        } else {
          entry.especifico = Number(row.act);
        }

        porDocumento.set(doc, entry);
      });

      porDocumento.forEach((regla, doc) => {
        const actEfectivo = regla.especifico !== undefined ? regla.especifico : regla.all;
        if (actEfectivo === 1) {
          bloqueados.add(doc);
        }
      });
    }

    return bloqueados;
  }
}