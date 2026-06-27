import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource }   from '@nestjs/typeorm';
import { DataSource }         from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';

import { ConnectionName } from 'src/database/constants/connection-names';

@Injectable()
export class SyncService {

  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectDataSource(ConnectionName.ASTERISK_1)
    private readonly dsAsterisk: DataSource,

    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly dsCampo: DataSource,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async syncAll(): Promise<{ campaigns: number; status: number }> {
    this.logger.log('Iniciando sincronización desde Asterisk...');
    const [campaigns, status] = await Promise.all([
      this.syncCampaigns(),
      this.syncCampanaStatus(),
    ]);
    this.logger.log(`Sync completado: ${campaigns} campañas, ${status} status`);
    return { campaigns, status };
  }

  async syncCampaigns(): Promise<number> {
    this.logger.log('Sincronizando campañas...');
    const rows = await this.dsAsterisk.query(
      `SELECT campaign_id, campaign_name, active
       FROM vicidial_campaigns
       WHERE active = 'Y'`,
    );
    if (!rows || rows.length === 0) {
      this.logger.warn('No se encontraron campañas activas en Asterisk');
      return 0;
    }
    let count = 0;
    for (const row of rows) {
      await this.upsertCampaign(row);
      count++;
    }
    this.logger.log(`${count} campañas sincronizadas`);
    return count;
  }

  async syncCampanaStatus(): Promise<number> {
    this.logger.log('Sincronizando status...');

    // ── Solo campos que existen en vicidial_campaign_statuses ──
    // fecha_creat y feacha_updat NO existen en Asterisk
    // Se manejan con GETDATE() en BD_CR_APP
    const rows = await this.dsAsterisk.query(
      `SELECT status, status_name, campaign_id, category
       FROM vicidial_campaign_statuses
       WHERE scheduled_callback = 'Y'
         AND completed          = 'Y'`,
    );

    if (!rows || rows.length === 0) {
      this.logger.warn('No se encontraron status en Asterisk');
      return 0;
    }
    let count = 0;
    for (const row of rows) {
      await this.upsertStatus(row);
      count++;
    }
    this.logger.log(`${count} status sincronizados`);
    return count;
  }

  private async upsertCampaign(row: any): Promise<void> {
    const existe = await this.dsCampo.query(
      `SELECT id FROM campaigns WHERE campaign_id = @0`,
      [row.campaign_id],
    );
    if (existe && existe.length > 0) {
      await this.dsCampo.query(
        `UPDATE campaigns
         SET campaign_name       = @0,
             active              = @1,
             fecha_actualizacion = GETDATE(),
             sync_fecha          = GETDATE()
         WHERE campaign_id = @2`,
        [row.campaign_name, row.active, row.campaign_id],
      );
    } else {
      await this.dsCampo.query(
        `INSERT INTO campaigns (campaign_id, campaign_name, active, fecha_creacion, sync_fecha)
         VALUES (@0, @1, @2, GETDATE(), GETDATE())`,
        [row.campaign_id, row.campaign_name, row.active],
      );
      this.logger.log(`Nueva campaña insertada: ${row.campaign_id}`);
    }
  }

  private async upsertStatus(row: any): Promise<void> {
    const existe = await this.dsCampo.query(
      `SELECT id FROM campana_status
       WHERE campaign_id = @0 AND status = @1`,
      [row.campaign_id, row.status],
    );
    if (existe && existe.length > 0) {
      // fecha_updat se actualiza sola con GETDATE()
      await this.dsCampo.query(
        `UPDATE campana_status
         SET status_name = @0,
             category    = @1,
             fecha_updat = GETDATE(),
             sync_fecha  = GETDATE()
         WHERE campaign_id = @2 AND status = @3`,
        [row.status_name, row.category, row.campaign_id, row.status],
      );
    } else {
      // fecha_creat se llena con GETDATE() al insertar
      await this.dsCampo.query(
        `INSERT INTO campana_status
           (campaign_id, status, status_name, category, fecha_creat, sync_fecha)
         VALUES (@0, @1, @2, @3, GETDATE(), GETDATE())`,
        [row.campaign_id, row.status, row.status_name, row.category],
      );
    }
  }
}