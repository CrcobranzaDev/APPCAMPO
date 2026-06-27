import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource }   from '@nestjs/typeorm';
import { DataSource }         from 'typeorm';

import { ConnectionName }     from 'src/database/constants/connection-names';

// ══════════════════════════════════════════════════════════
//  MAPA GESTIONES SERVICE — sin token
//  Retorna puntos GPS de gestiones para OpenStreetMap
// ══════════════════════════════════════════════════════════

@Injectable()
export class MapaGestionesService {

  private readonly logger = new Logger(MapaGestionesService.name);

  constructor(
    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly dsCampo: DataSource,
  ) {}

  async getPuntos(
    gestor?:      string,
    fechaDesde?:  string,
    fechaHasta?:  string,
  ): Promise<any> {

    this.logger.log(`Mapa gestiones — gestor:${gestor ?? 'todos'}`);

    const rows = await this.dsCampo.query(
      `EXEC SP_MapaGestiones @0, @1, @2`,
      [
        gestor     ?? null,
        fechaDesde ?? null,
        fechaHasta ?? null,
      ],
    );

    return {
      total:  rows?.length ?? 0,
      puntos: rows ?? [],
    };
  }
}
