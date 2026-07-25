// sincronizacion-campo-maft2t3.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource }       from 'typeorm';
import { ConnectionName }   from 'src/database/constants/connection-names';
import * as XLSX            from 'xlsx';

@Injectable()
export class SincronizacionCampoServiceMAFT2T3 {

  private readonly logger = new Logger(SincronizacionCampoServiceMAFT2T3.name);
  private running         = false;

  constructor(
    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly campoDs: DataSource,
  ) {}

  // ✅ Ahora recibe campaignId dinámico
  async ejecutarSyncMAFT2T3(buffer: Buffer, campaignId: string): Promise<{ actualizados: number }> {

    if (this.running) {
      this.logger.warn(`⏭ Sync ${campaignId} — ciclo anterior activo, omitido`);
      return { actualizados: 0 };
    }
    this.running = true;

    try {
      // 1. Leer Excel
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet     = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

      if (!rows.length) throw new BadRequestException('El archivo está vacío');

      // 2. Leer mapeo desde campaign_columns_meta — DINÁMICO
      const campoMeta: any[] = await this.campoDs.query(
        `SELECT ccm.[columna_fisica], ccm.[columna_origen], ccm.[es_llave]
         FROM   [dbo].[campaign_columns_meta] ccm
         INNER JOIN [dbo].[campaigns] c ON c.[id] = ccm.[campaign_id]
         WHERE  c.[campaign_id] = @0 AND ccm.[activo] = 1`,
        [campaignId]  // ✅ parámetro seguro, evita SQL injection
      );

      if (!campoMeta.length) {
        throw new BadRequestException(`No se encontró mapeo de columnas para la campaña: ${campaignId}`);
      }

      // origenNormalizado → columna_fisica
      const origenToFisica = new Map<string, string>();
      const keyFisicas     = new Set<string>();

      campoMeta.forEach((cm: any) => {
        const origen = this.normalizarHeader(cm.columna_origen);
        const fisica = cm.columna_fisica.trim();
        origenToFisica.set(origen, fisica);
        if (this.esLlave(cm.es_llave)) keyFisicas.add(fisica);
      });

      this.logger.debug(
        `${campaignId} — columnas llave detectadas (es_llave=1): ${[...keyFisicas].join(', ')}`,
      );

      // 3. Cabeceras del Excel → columna_fisica
      const excelHeaders   = Object.keys(rows[0]);
      const headerToFisica = new Map<string, string>();
      const sinMatch: string[] = [];

      excelHeaders.forEach(h => {
        const normalizado = this.normalizarHeader(h);
        const fisica = origenToFisica.get(normalizado);
        if (fisica) {
          headerToFisica.set(h, fisica);
        } else {
          sinMatch.push(h);
        }
      });

      if (sinMatch.length) {
        this.logger.debug(
          `${campaignId} — headers del Excel sin match en columna_origen: ${sinMatch.join(', ')}`,
        );
      }

      // Validar que todas las llaves físicas estén presentes
      const llavesFisicas = [...keyFisicas];
      const headerFisicas = new Set([...headerToFisica.values()]);
      const faltantes     = llavesFisicas.filter(l => !headerFisicas.has(l));

      if (faltantes.length) {
        const detalle = campoMeta
          .filter((cm: any) => faltantes.includes(cm.columna_fisica.trim()))
          .map((cm: any) => `${cm.columna_fisica} (origen esperado: "${cm.columna_origen}")`)
          .join(' | ');

        this.logger.error(
          `${campaignId} — Llaves faltantes. Detalle: ${detalle}. ` +
          `Headers recibidos del Excel: ${excelHeaders.join(', ')}`,
        );

        throw new BadRequestException(
          `Faltan columnas llave en el Excel para ${campaignId}: ${faltantes.join(', ')}`
        );
      }

      // 4. Campaign int id — DINÁMICO
      const campRows = await this.campoDs.query(
        `SELECT [id] FROM [dbo].[campaigns]
         WHERE  [campaign_id] = @0 AND [active] = 'Y'`,
        [campaignId]
      );
      const campaignIntId: number = campRows[0]?.id;
      if (!campaignIntId) {
        throw new BadRequestException(`Campaign ${campaignId} no encontrada o inactiva`);
      }

      // 5. UPDATE en lotes de 500
      const CHUNK = 500;
      let upd     = 0;

      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk         = rows.slice(i, i + CHUNK);
        const params: any[] = [campaignIntId];

        const orCond = chunk.map(row => {
          const conditions: string[] = [];

          llavesFisicas.forEach(fisica => {
            const excelHeader = this.getExcelHeader(headerToFisica, fisica);
            const idx         = params.length;
            params.push(row[excelHeader] ?? '');
            conditions.push(`ISNULL(ca.[${fisica}],'') = ISNULL(@${idx},'')`);
          });

          return `(${conditions.join(' AND ')})`;
        }).join(' OR ');

        const selectLlaves = llavesFisicas.map(f => `[${f}]`).join(', ');

        const existentes: any[] = await this.campoDs.query(
          `SELECT [id], ${selectLlaves}
           FROM   [dbo].[clientes_asignados] ca
           WHERE  [campaign_id] = @0 AND (${orCond})`,
          params,
        );

        const existMap = new Map(
          existentes.map(r => [
            llavesFisicas.map(f => r[f] ?? '').join('|'),
            r,
          ])
        );

        for (const row of chunk) {
          const key = llavesFisicas
            .map(fisica => row[this.getExcelHeader(headerToFisica, fisica)] ?? '')
            .join('|');

          const existente = existMap.get(key);
          if (!existente) continue;

          const setCols: string[] = [];
          const setVals: any[]    = [];

          headerToFisica.forEach((fisica, excelHeader) => {
            if (keyFisicas.has(fisica)) return; // llaves no se actualizan
            setCols.push(`[${fisica}] = @${setVals.length}`);
            setVals.push(row[excelHeader] ?? null);
          });

          if (!setCols.length) continue;

          const idIdx = setVals.length;
          setVals.push(existente.id);

          await this.campoDs.query(
            `UPDATE [dbo].[clientes_asignados]
             SET    ${setCols.join(', ')}
             WHERE  [id] = @${idIdx}`,
            setVals,
          );
          upd++;
        }

        this.logger.log(`📦 ${campaignId} — Lote ${i / CHUNK + 1} — actualizados: ${upd}`);
      }

      this.logger.log(`✅ Sync ${campaignId} — total actualizados: ${upd}`);
      return { actualizados: upd };

    } catch (err) {
      this.logger.error(`❌ Sync ${campaignId}:`, err.message);
      throw err;

    } finally {
      this.running = false;
    }
  }

  private getExcelHeader(headerToFisica: Map<string, string>, fisica: string): string {
    for (const [header, fis] of headerToFisica.entries()) {
      if (fis === fisica) return header;
    }
    return '';
  }

  /**
   * Interpreta el campo es_llave de campaign_columns_meta sin importar
   * cómo lo devuelva el driver de SQL Server: bit -> boolean, pero a
   * veces llega como number (1/0) o como string ("1"/"0", "S"/"N", "Y"/"N").
   * OJO: en JS el string "0" es truthy, por eso NO se puede usar
   * simplemente `if (valor)` — hay que parsear explícitamente.
   */
  private esLlave(valor: any): boolean {
    if (valor === true || valor === 1) return true;
    if (valor === false || valor === 0 || valor === null || valor === undefined) return false;

    const v = String(valor).trim().toUpperCase();
    return v === '1' || v === 'S' || v === 'SI' || v === 'Y' || v === 'YES' || v === 'TRUE';
  }

  /**
   * Normaliza un header para comparación robusta entre Excel y BD:
   * - trim de espacios normales Y no separables (\u00A0)
   * - colapsa espacios internos múltiples
   * - quita tildes/diacríticos (Á -> A)
   * - uppercase
   */
  private normalizarHeader(valor: any): string {
    if (valor === null || valor === undefined) return '';

    return String(valor)
      .normalize('NFD')                  // separa letra + tilde
      .replace(/[\u0300-\u036f]/g, '')   // elimina diacríticos (tildes)
      .replace(/[\u00A0]/g, ' ')         // NBSP -> espacio normal
      .replace(/\s+/g, ' ')              // colapsa espacios múltiples
      .trim()
      .toUpperCase();
  }
}