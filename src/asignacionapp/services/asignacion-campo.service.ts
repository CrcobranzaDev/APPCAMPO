import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectDataSource }  from '@nestjs/typeorm';
import { DataSource }        from 'typeorm';

import { ConnectionName }    from '../../database/constants/connection-names';
import {
  AsignarClientesDto,
  AsignacionResultDto,
} from 'src/asignacionapp/dto/asignacion-campo.dto';

// ══════════════════════════════════════════════════════════════════════════════
//  ASIGNACION CAMPO SERVICE
//
//  Fuente de verdad: campaign_columns_meta
//    columna_fisica   → columna en clientes_asignados  (destino)
//    columna_origen   → columna en el payload entrante (fuente)
//    tipo_dato        → txt | num | fec
//
//  ¿Cómo agregar una nueva campaña?
//    1. INSERT en campaigns
//    2. INSERT en campaign_columns_meta
//    → No se toca ningún archivo TypeScript
// ══════════════════════════════════════════════════════════════════════════════

interface ColumnaMeta {
  columna_fisica:   string;
  columna_origen:   string;
  columna_etiqueta: string;
  tipo_dato:        string;
  orden:            number;
}

@Injectable()
export class AsignacionCampoService {

  private readonly logger = new Logger(AsignacionCampoService.name);

  constructor(
    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly dsCampo: DataSource,
  ) {}

  // ════════════════════════════════════════════════════════════════════════
  //  ASIGNAR CLIENTES
  // ════════════════════════════════════════════════════════════════════════
  async asignarClientes(dto: AsignarClientesDto): Promise<AsignacionResultDto> {

    const { campaignId, agente, clientes } = dto;

    if (!clientes?.length) {
      throw new BadRequestException('No hay clientes para asignar');
    }

    // ── 1. Obtener id interno de la campaña ──────────────────────────────
    const campRows = await this.dsCampo.query(
      `SELECT id FROM campaigns WHERE campaign_id = @0`,
      [campaignId],
    );
    if (!campRows?.length) {
      throw new BadRequestException(`Campaña '${campaignId}' no encontrada`);
    }
    const campaignIdInterno: number = campRows[0].id;

    // ── 2. Leer columnas desde campaign_columns_meta ─────────────────────
    const columnasMeta = await this.obtenerColumnasMeta(campaignIdInterno, campaignId);

    // ── 3. Insertar cada cliente ─────────────────────────────────────────
    let insertados = 0;
    let fallidos   = 0;

    for (const cliente of clientes) {
      try {
        const mapped = this.mapearCliente(
          cliente as Record<string, any>,
          campaignId,
          agente.correo,
          agente.nombre,
          columnasMeta,
        );
        await this.insertarCliente(campaignIdInterno, mapped, columnasMeta);
        insertados++;
      } catch (error) {
        fallidos++;
        this.logger.error(
          `Error insertando cliente ${(cliente as any)['NUM_DOCUMENTO'] ?? '?'}: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `[${campaignId}] → ${agente.correo}: ${insertados} insertados, ${fallidos} fallidos`,
    );

    return {
      campaignId,
      agente:    agente.nombre,
      insertados,
      fallidos,
      mensaje:   `${insertados} cliente(s) asignado(s) correctamente a ${agente.nombre}`,
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  LEER campaign_columns_meta — única fuente de verdad
  // ════════════════════════════════════════════════════════════════════════
  private async obtenerColumnasMeta(
    campaignIdInterno: number,
    campaignId:        string,
  ): Promise<ColumnaMeta[]> {

    const rows: ColumnaMeta[] = await this.dsCampo.query(
      `SELECT columna_fisica,
              columna_origen,
              columna_etiqueta,
              tipo_dato,
              orden
       FROM   campaign_columns_meta
       WHERE  campaign_id = @0
         AND  activo      = 1
       ORDER  BY orden ASC`,
      [campaignIdInterno],
    );

    if (!rows?.length) {
      throw new BadRequestException(
        `Sin columnas configuradas para campaña '${campaignId}'. ` +
        `Inserta las filas en campaign_columns_meta antes de continuar.`,
      );
    }

    this.logger.debug(`[${campaignId}] ${rows.length} columnas leídas desde campaign_columns_meta`);
    return rows;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  MAPEAR CLIENTE
  //  Itera columnasMeta — para cada fila lee clienteRaw[columna_origen]
  //  y lo convierte según tipo_dato
  // ════════════════════════════════════════════════════════════════════════
  private mapearCliente(
  clienteRaw:    Record<string, any>,
  campaignId:    string,
  usuarioGestor: string,
  nombreGestor:  string,
  columnasMeta:  ColumnaMeta[],
): Record<string, any> {

  const mapped: Record<string, any> = {
    campana:        campaignId,
    usuario_gestor: usuarioGestor,
    nombre_gestor:  nombreGestor,
  };

  for (const col of columnasMeta) {
    // Busca primero por columna_etiqueta (label amigable que viene en el payload)
    // Si no encuentra, intenta con columna_origen (nombre original de la fuente)
    const valorRaw = clienteRaw[col.columna_etiqueta] 
                  ?? clienteRaw[col.columna_origen] 
                  ?? null;

    this.logger.debug(
      `[${campaignId}] ${col.columna_fisica} ← etiqueta:'${col.columna_etiqueta}'=${clienteRaw[col.columna_etiqueta]} | origen:'${col.columna_origen}'=${clienteRaw[col.columna_origen]}`,
    );

    switch (col.tipo_dato) {
      case 'num':
        mapped[col.columna_fisica] = this.toDecimal(valorRaw);
        break;
      case 'fec':
        mapped[col.columna_fisica] = this.toDate(valorRaw);
        break;
      default: // txt
        mapped[col.columna_fisica] = valorRaw;
    }
  }

  return mapped;
}

  // ════════════════════════════════════════════════════════════════════════
  //  INSERTAR CLIENTE
  //  Construye el INSERT dinámicamente desde columnasMeta
  // ════════════════════════════════════════════════════════════════════════
  private async insertarCliente(
    campaignIdInterno: number,
    mapped:            Record<string, any>,
    columnasMeta:      ColumnaMeta[],
  ): Promise<void> {

    // Columnas y valores dinámicos desde la meta
    const columnas = columnasMeta.map(c => c.columna_fisica);
    const valores  = columnas.map(col => mapped[col] ?? null);

    // Placeholders @1, @2, ... (@0 es campaign_id)
    const placeholders = columnas.map((_, i) => `@${i + 1}`).join(', ');

    await this.dsCampo.query(
      `INSERT INTO clientes_asignados (
        campaign_id,
        campana, usuario_gestor, nombre_gestor,
        ${columnas.join(', ')},
        estado, fecha_carga
      ) VALUES (
        @0,
        @${columnas.length + 1}, @${columnas.length + 2}, @${columnas.length + 3},
        ${placeholders},
        'ACTIVO', GETDATE()
      )`,
      [
        campaignIdInterno,
        ...valores,
        mapped.campana,
        mapped.usuario_gestor,
        mapped.nombre_gestor,
      ],
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  //  UTILS
  // ════════════════════════════════════════════════════════════════════════
  private toDecimal(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = parseFloat(String(value).replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  private toDate(value: any): string | null {
    if (!value) return null;
    try {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    } catch { return null; }
  }
}