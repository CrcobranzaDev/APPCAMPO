import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EncryptionService } from 'src/common/encryption.service';
import { ASTERISK_CONNECTIONS } from 'src/database/constants/connection-names';

// ─── DTO de entrada ───────────────────────────────────────────────────────────

export interface InsertaCampoDto {
  vendor_lead_code: string;
  source_id:        string;
  campaign_id:      string;
  status:           string;
  user:             string;
  fecha_gest:       string;   // ← REQUERIDO
  fecha_pdp?:       string;
  monto_pdp?:       string;
  tipogest?:        string;
  comen?:           string;
}

// ─── Resultado por conexión ───────────────────────────────────────────────────

export interface CampoResult {
  connection: string;
  success:    boolean;
  data?: {
    records_processed:  number;
    status:             string;
    user_used:          string;
    campaign_used:      string;
    filas_actualizadas: number;
    lead_id_afectado:   number;
  };
  error?: string;
}

// ─── Resultado global ─────────────────────────────────────────────────────────

export interface CampoResponse {
  executed_in: number;
  results:     CampoResult[];
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class AsteriskinService {
  private readonly logger = new Logger(AsteriskinService.name);

  constructor(
    @InjectDataSource(ASTERISK_CONNECTIONS[0])
    private readonly ds1: DataSource,

    @InjectDataSource(ASTERISK_CONNECTIONS[1])
    private readonly ds2: DataSource,

    @InjectDataSource(ASTERISK_CONNECTIONS[2])
    private readonly ds3: DataSource,

    private readonly encryptionService: EncryptionService,
  ) {}

  // ─── Helper: normaliza fecha_gest a datetime MySQL ────────────────────────

  private normalizarFechaGest(fechaGest: string): string {
    // Detecta si el móvil mandó zona horaria (Z o +/-HH:MM)
    const tieneZonaHoraria = /[Zz]|[+-]\d{2}:\d{2}$/.test(fechaGest);

    if (tieneZonaHoraria) {
      // Con zona → parsear y convertir (puede ajustar a UTC según offset)
      return new Date(fechaGest).toISOString().slice(0, 19).replace('T', ' ');
    }

    // Sin zona → el móvil mandó hora local, usar tal cual
    // Ej: "2025-06-16T10:30:00" → "2025-06-16 10:30:00"
    return fechaGest.slice(0, 19).replace('T', ' ');
  }

  // ─── Método principal ─────────────────────────────────────────────────────

  async insertarCampo(dto: InsertaCampoDto): Promise<CampoResponse> {
    const fechaGestNormalizada = this.normalizarFechaGest(dto.fecha_gest);
    this.logger.debug(`fecha_gest: "${fechaGestNormalizada}"`);

    const vendorEncriptado = this.encryptionService.encriptar(dto.vendor_lead_code);
    const sourceEncriptado = this.encryptionService.encriptar(dto.source_id);

    const dataSources: [string, DataSource][] = [
      [ASTERISK_CONNECTIONS[0], this.ds1],
      [ASTERISK_CONNECTIONS[1], this.ds2],
      [ASTERISK_CONNECTIONS[2], this.ds3],
    ];

    const settled = await Promise.allSettled(
      dataSources.map(([name, ds]) =>
        this.ejecutarEnConexion(name, ds, {
          ...dto,
          fecha_gest:       fechaGestNormalizada,
          vendor_lead_code: vendorEncriptado,
          source_id:        sourceEncriptado,
        }),
      ),
    );

    const results: CampoResult[] = settled.map((result, i) => {
      const connectionName = dataSources[i][0];
      if (result.status === 'fulfilled') return result.value;
      return {
        connection: connectionName,
        success:    false,
        error:      String(result.reason),
      };
    });

    const executed_in = results.filter(r => r.success).length;

    this.logger.log(
      `Campo insertado [${dto.campaign_id}]: ${executed_in}/${dataSources.length} conexiones OK`,
    );

    return { executed_in, results };
  }

  // ─── Ejecución en una sola DataSource ────────────────────────────────────

  private async ejecutarEnConexion(
    connectionName: string,
    ds: DataSource,
    dto: InsertaCampoDto,
  ): Promise<CampoResult> {
    const query = `CALL INSERTA_CAMPO(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
      dto.vendor_lead_code,
      dto.source_id,
      dto.campaign_id,
      dto.status,
      dto.user,
      dto.fecha_pdp  ?? null,
      dto.monto_pdp  ?? null,
      dto.tipogest   ?? null,
      dto.comen      ?? null,
      dto.fecha_gest,           // ← siempre llega, no necesita ?? null
    ];

    try {
      const [rows]: [any[], any] = await ds.query(query, params);
      const row = Array.isArray(rows[0]) ? rows[0][0] : rows[0];

      this.logger.debug(
        `[${connectionName}] OK — campaign: ${dto.campaign_id} lead_id: ${row?.lead_id_afectado}`,
      );

      return {
        connection: connectionName,
        success:    true,
        data: {
          records_processed:  row?.records_processed  ?? 1,
          status:             row?.status             ?? 'OK',
          user_used:          row?.user_used          ?? dto.user,
          campaign_used:      row?.campaign_used      ?? dto.campaign_id,
          filas_actualizadas: row?.filas_actualizadas ?? 1,
          lead_id_afectado:   row?.lead_id_afectado   ?? 0,
        },
      };
    } catch (error: any) {
      const msg: string = error?.message ?? String(error);
      const esLeadNoEncontrado = msg.includes('Lead no encontrado');

      if (esLeadNoEncontrado) {
        this.logger.debug(`[${connectionName}] Lead no encontrado — omitiendo (esperado)`);
      } else {
        this.logger.error(`[${connectionName}] Error inesperado: ${msg}`);
      }

      return {
        connection: connectionName,
        success:    false,
        error:      msg,
      };
    }
  }
}