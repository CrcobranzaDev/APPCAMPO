// lista-negra.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { ListaNegra } from 'src/listblack/listblack.entity';
import { CrearListaNegraDto } from 'src/listblack/crear-lista-negra.dto';
import { ResultadoCargaDto } from 'src/listblack/resultado-carga.dto';
import { ConnectionName } from 'src/database/constants/connection-names';

const CAMPANA_TODAS = 'ALL';

@Injectable()
export class ListaNegraService {
  constructor(
    @InjectRepository(ListaNegra, ConnectionName.SQLSERVER_CAMPO)
    private readonly repo: Repository<ListaNegra>,
  ) {}

  // Carga única (desde el módulo/formulario)
  async crearOActualizar(dto: CrearListaNegraDto): Promise<ListaNegra> {
    const campaingId = dto.campaingId.trim().toUpperCase() === CAMPANA_TODAS
      ? CAMPANA_TODAS
      : dto.campaingId.trim();

    const existente = await this.repo.findOne({
      where: { documento: dto.documento, campaingId },
    });

    if (existente) {
      existente.act = dto.act;
      return this.repo.save(existente);
    }

    const nuevo = this.repo.create({ ...dto, campaingId });
    return this.repo.save(nuevo);
  }

  async listar(documento?: string, campaingId?: string) {
    const where: any = {};
    if (documento) where.documento = documento;
    if (campaingId) where.campaingId = campaingId;

    return this.repo.find({
      where,
      order: { id: 'DESC' },
    });
  }

  // Resuelve si un documento está bloqueado para una campaña puntual,
  // respetando la precedencia: fila específica > fila 'ALL' > no bloqueado
  async verificarBloqueo(
    documento: string,
    campaingId: string,
  ): Promise<{ bloqueado: boolean; origen: 'especifico' | 'all' | 'ninguno' }> {
    const especifico = await this.repo.findOne({
      where: { documento, campaingId },
    });

    if (especifico) {
      return { bloqueado: especifico.act === 1, origen: 'especifico' };
    }

    const general = await this.repo.findOne({
      where: { documento, campaingId: CAMPANA_TODAS },
    });

    if (general) {
      return { bloqueado: general.act === 1, origen: 'all' };
    }

    return { bloqueado: false, origen: 'ninguno' };
  }

  // Carga masiva desde Excel
  async cargarDesdeExcel(buffer: Buffer<ArrayBufferLike>): Promise<ResultadoCargaDto> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];

    const resultado: ResultadoCargaDto = {
      totalFilas: 0,
      insertados: 0,
      actualizados: 0,
      errores: [],
    };

    const filas = sheet.getRows(2, sheet.rowCount - 1) ?? [];

    for (const row of filas) {
      const numFila = row.number;
      const documento = row.getCell(1).text?.trim();
      let campaingId = row.getCell(2).text?.trim();
      const actRaw = row.getCell(3).text?.trim();

      if (!documento && !campaingId && !actRaw) continue;

      resultado.totalFilas++;

      if (!documento || !campaingId) {
        resultado.errores.push({ fila: numFila, motivo: 'Documento o campaña vacíos' });
        continue;
      }

      // normaliza 'all', 'All', 'ALL' -> 'ALL'
      if (campaingId.toUpperCase() === CAMPANA_TODAS) {
        campaingId = CAMPANA_TODAS;
      }

      const act = actRaw === '0' ? 0 : actRaw === '1' ? 1 : null;
      if (act === null) {
        resultado.errores.push({ fila: numFila, motivo: `Valor de act inválido: "${actRaw}" (debe ser 0 o 1)` });
        continue;
      }

      if (documento.length > 20 || campaingId.length > 20) {
        resultado.errores.push({ fila: numFila, motivo: 'Documento o campaña exceden 20 caracteres' });
        continue;
      }

      try {
        const existente = await this.repo.findOne({ where: { documento, campaingId } });
        if (existente) {
          existente.act = act;
          await this.repo.save(existente);
          resultado.actualizados++;
        } else {
          await this.repo.save(this.repo.create({ documento, campaingId, act }));
          resultado.insertados++;
        }
      } catch (e) {
        resultado.errores.push({ fila: numFila, motivo: 'Error al guardar en BD' });
      }
    }

    return resultado;
  }
}