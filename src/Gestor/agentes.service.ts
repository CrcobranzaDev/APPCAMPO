import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource }   from '@nestjs/typeorm';
import { DataSource }         from 'typeorm';

import { ConnectionName }     from 'src/database/constants/connection-names';

// ══════════════════════════════════════════════════════════
//  AGENTES SERVICE
//  Conexión: infocall (MySQL)
//  Procedure: Agentes_Campo
//  Retorna: correo, nombre, Perfil
// ══════════════════════════════════════════════════════════

export interface AgenteDto {
  correo:  string;
  nombre:  string;
  perfil:  string;
}

@Injectable()
export class AgentesService {
  private readonly logger = new Logger(AgentesService.name);

  constructor(
    @InjectDataSource(ConnectionName.INFOCALL)
    private readonly dsInfocall: DataSource,
  ) {}

  async getAgentes(): Promise<AgenteDto[]> {
    this.logger.log('Ejecutando procedure Agentes_Campo');

    const result = await this.dsInfocall.query(`CALL Agentes_Campo()`);

    // MySQL devuelve [[rows], OkPacket]
    const rows: any[] = Array.isArray(result[0]) ? result[0] : result;

    return rows.map(row => ({
      correo: row.correo,
      nombre: row.nombre,
      perfil: row.Perfil,
    }));
  }
}
