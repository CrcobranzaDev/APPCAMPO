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

      // origenUpper → columna_fisica
      const origenToFisica = new Map<string, string>();
      const keyFisicas     = new Set<string>();

      campoMeta.forEach((cm: any) => {
        const origen = cm.columna_origen.trim().toUpperCase();
        const fisica = cm.columna_fisica.trim();
        origenToFisica.set(origen, fisica);
        if (cm.es_llave) keyFisicas.add(fisica);
      });

      // 3. Cabeceras del Excel → columna_fisica
      const excelHeaders   = Object.keys(rows[0]);
      const headerToFisica = new Map<string, string>();

      excelHeaders.forEach(h => {
        const fisica = origenToFisica.get(h.trim().toUpperCase());
        if (fisica) headerToFisica.set(h, fisica);
      });

      // Validar que todas las llaves físicas estén presentes
      const llavesFisicas = [...keyFisicas];
      const headerFisicas = new Set([...headerToFisica.values()]);
      const faltantes     = llavesFisicas.filter(l => !headerFisicas.has(l));

      if (faltantes.length) {
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

      // Obtener las llaves físicas dinámicamente desde keyFisicas
      const [keyFisica1, keyFisica2, keyFisica3, keyFisica4, keyFisica5] = llavesFisicas;

      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk         = rows.slice(i, i + CHUNK);
        const params: any[] = [campaignIntId];

        // Construir condición OR dinámicamente según las llaves
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

        // Columnas a seleccionar en la consulta de existentes
        const selectLlaves = llavesFisicas.map(f => `[${f}]`).join(', ');

        const existentes: any[] = await this.campoDs.query(
          `SELECT [id], ${selectLlaves}
           FROM   [dbo].[clientes_asignados] ca
           WHERE  [campaign_id] = @0 AND (${orCond})`,
          params,
        );

        // Construir mapa de existentes con clave dinámica
        const existMap = new Map(
          existentes.map(r => [
            llavesFisicas.map(f => r[f] ?? '').join('|'),
            r,
          ])
        );

        for (const row of chunk) {
          // Clave dinámica del row actual
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
}