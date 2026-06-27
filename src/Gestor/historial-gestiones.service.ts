import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource }       from 'typeorm';

import { ConnectionName }   from 'src/database/constants/connection-names';

// ══════════════════════════════════════════════════════════
//  HISTORIAL GESTIONES SERVICE
//
//  Consulta todas las gestiones realizadas por un gestor
//  con filtro de rango de fechas
// ══════════════════════════════════════════════════════════

@Injectable()
export class HistorialGestionesService {

  private readonly logger = new Logger(HistorialGestionesService.name);

  constructor(
    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly dsCampo: DataSource,
  ) {}

  async getHistorialGestor(
    gestor:       string,
    fechaDesde:   string,
    fechaHasta:   string,
  ): Promise<any> {

    // Validar fechas
    if (!fechaDesde || !fechaHasta) {
      throw new BadRequestException('fecha_desde y fecha_hasta son requeridos');
    }

    const desde = new Date(fechaDesde);
    const hasta = new Date(fechaHasta);

    if (isNaN(desde.getTime()) || isNaN(hasta.getTime())) {
      throw new BadRequestException('Formato de fecha inválido. Use YYYY-MM-DD');
    }

    if (desde > hasta) {
      throw new BadRequestException('fecha_desde no puede ser mayor que fecha_hasta');
    }

    this.logger.log(`Historial de ${gestor} del ${fechaDesde} al ${fechaHasta}`);

    const rows = await this.dsCampo.query(
      `EXEC SP_HistorialGestor @0, @1, @2`,
      [gestor, fechaDesde, fechaHasta],
    );

    return {
      gestor,
      fecha_desde:   fechaDesde,
      fecha_hasta:   fechaHasta,
      total:         rows?.length ?? 0,
      gestiones:     rows ?? [],
    };
  }
}
