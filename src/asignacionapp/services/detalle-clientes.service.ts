import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource }   from '@nestjs/typeorm';
import { DataSource }         from 'typeorm';

import { ConnectionName }     from '../../database/constants/connection-names';

// ══════════════════════════════════════════════════════════
//  DETALLE CLIENTES SERVICE
//  Ejecuta sp_obtener_clientes_activos en BD_CR_APP
//  pasando solo el usuario sin @crcobranza.com.pe
// ══════════════════════════════════════════════════════════

@Injectable()
export class DetalleClientesService {

  private readonly logger = new Logger(DetalleClientesService.name);

  constructor(
    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly dsCampo: DataSource,
  ) {}

  // ══════════════════════════════════════════════════════
  //  OBTENER CLIENTES ACTIVOS POR GESTOR
  //  gestor puede venir como:
  //    - 'bquispee@crcobranza.com.pe' → se limpia a 'bquispee'
  //    - 'bquispee'                   → se usa directo
  // ══════════════════════════════════════════════════════
  async getClientesActivos(gestor: string): Promise<any[]> {

    // Quitar el dominio si viene con @
    const gestorLimpio = gestor.includes('@')
      ? gestor.split('@')[0]
      : gestor;

    this.logger.log(`Consultando clientes activos para gestor: ${gestorLimpio}`);

    const result = await this.dsCampo.query(
      `EXEC sp_obtener_clientes_activos @gestor = @0`,
      [gestorLimpio],
    );

    this.logger.log(`Clientes encontrados: ${result.length}`);
    return result;
  }
}
