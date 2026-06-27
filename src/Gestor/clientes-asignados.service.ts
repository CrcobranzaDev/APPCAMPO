import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource }   from '@nestjs/typeorm';
import { DataSource }         from 'typeorm';
import { ConnectionName }     from 'src/database/constants/connection-names';
import * as ExcelJS           from 'exceljs';

// ══════════════════════════════════════════════════════════
//  CLIENTES ASIGNADOS SERVICE
//  Consulta clientes asignados con filtros opcionales
//  Usa SP_ClientesAsignados en BD_CR_APP
// ══════════════════════════════════════════════════════════
interface FiltrosClientesAsignados {
  gestor?:         string;
  campana?:        string;
  estado?:         string;
  fecha_desde?:    string;
  fecha_hasta?:    string;
  nombre_archivo?: string;
}

@Injectable()
export class ClientesAsignadosService {
  private readonly logger = new Logger(ClientesAsignadosService.name);

  constructor(
    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly dsCampo: DataSource,
  ) {}

  // ──────────────────────────────────────────────────────
  //  Consulta base (JSON)
  // ──────────────────────────────────────────────────────
  async getClientesAsignados(filtros: FiltrosClientesAsignados): Promise<any> {
    const {
      gestor         = null,
      campana        = null,
      estado         = null,
      fecha_desde    = null,
      fecha_hasta    = null,
      nombre_archivo = null,
    } = filtros;

    this.logger.log(
      `Consultando clientes asignados — gestor:${gestor} campaña:${campana} estado:${estado} archivo:${nombre_archivo}`,
    );

    const rows = await this.dsCampo.query(
      `EXEC SP_ClientesAsignados @0, @1, @2, @3, @4, @5`,
      [gestor, campana, estado, fecha_desde, fecha_hasta, nombre_archivo],
    );

    return {
      filtros: { gestor, campana, estado, fecha_desde, fecha_hasta, nombre_archivo },
      total:   rows?.length ?? 0,
      clientes: rows ?? [],
    };
  }

  // ──────────────────────────────────────────────────────
  //  Exportación a Excel (.xlsx) — cabeceras + datos
  //  Retorna un Buffer listo para convertir a base64
  // ──────────────────────────────────────────────────────
  async exportToExcel(filtros: FiltrosClientesAsignados): Promise<Buffer> {
    const { clientes } = await this.getClientesAsignados(filtros);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Clientes Asignados');

    if (!clientes.length) {
      ws.addRow(['Sin resultados']);
      return Buffer.from(await wb.xlsx.writeBuffer());
    }

    const columns = Object.keys(clientes[0]);

    // ── Cabecera ─────────────────────────────────────────
    ws.columns = columns.map((col) => ({
      header: col.toUpperCase().replace(/_/g, ' '),
      key:    col,
      width:  Math.max(col.length + 4, 16),
    }));

    const headerRow     = ws.getRow(1);
    headerRow.font      = { name: 'Arial', bold: true, size: 10 };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height    = 20;

    // ── Datos ────────────────────────────────────────────
    clientes.forEach((cliente: Record<string, any>) => {
      ws.addRow(columns.map((col) => cliente[col] ?? ''));
    });

    this.logger.log(`Excel generado — ${clientes.length} registros`);

    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}