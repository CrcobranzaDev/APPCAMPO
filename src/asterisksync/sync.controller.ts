import { Controller, Post, Get } from '@nestjs/common';
import { SyncService }           from './sync.service';

// ══════════════════════════════════════════════════════════
//  SYNC CONTROLLER
//  Permite ejecutar la sincronización manualmente
//  además del cron automático cada hora
// ══════════════════════════════════════════════════════════

@Controller('sync')
export class SyncController {

  constructor(private readonly syncService: SyncService) {}

  // ── POST /sync/all — ejecutar sync completo ───────────
  @Post('all')
  async syncAll() {
    return this.syncService.syncAll();
  }

  // ── POST /sync/campaigns — solo campañas ─────────────
  @Post('campaigns')
  async syncCampaigns() {
    const count = await this.syncService.syncCampaigns();
    return { sincronizadas: count, mensaje: `${count} campañas sincronizadas` };
  }

  // ── POST /sync/status — solo status ──────────────────
  @Post('status')
  async syncStatus() {
    const count = await this.syncService.syncCampanaStatus();
    return { sincronizados: count, mensaje: `${count} status sincronizados` };
  }












  
}
