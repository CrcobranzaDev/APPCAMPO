import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource }   from '@nestjs/typeorm';
import { DataSource }         from 'typeorm';

import { ConnectionName }     from 'src/database/constants/connection-names';

// ══════════════════════════════════════════════════════════
//  GESTIONES REALIZADAS SERVICE
//
//  Perfiles con acceso total (pueden filtrar por gestor):
//    scoringmanager, operatorsearch, operatormanager, manager
//
//  Perfil gestor campo (solo sus gestiones):
//    gestcamp
// ══════════════════════════════════════════════════════════

const PERFILES_SUPERVISOR = ['scoringmanager', 'operatorsearch', 'operatormanager', 'manager'];

export class FiltrosGestionesDto {
  gestor?:      string;
  campana?:     string;
  fecha_desde?: string;
  fecha_hasta?: string;
}

@Injectable()
export class GestionesRealizadasService {

  private readonly logger = new Logger(GestionesRealizadasService.name);

  constructor(
    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly dsCampo: DataSource,
  ) {}

  // ══════════════════════════════════════════════════════
  //  SIN TOKEN — web Laravel
  //  Filtra libremente por gestor, campaña y fecha
  // ══════════════════════════════════════════════════════
  async getGestionesWeb(filtros: FiltrosGestionesDto): Promise<any> {
    return this.ejecutarSP(
      filtros.gestor      ?? null,
      filtros.campana     ?? null,
      filtros.fecha_desde ?? null,
      filtros.fecha_hasta ?? null,
    );
  }

  // ══════════════════════════════════════════════════════
  //  CON TOKEN — app móvil
  //  gestcamp  → fuerza gestor = email del token
  //  otros     → filtra libremente
  // ══════════════════════════════════════════════════════
  async getGestionesApp(
    filtros: FiltrosGestionesDto,
    emailToken: string,
    perfilToken: string,
  ): Promise<any> {

    const esGestorCampo = perfilToken === 'gestcamp';

    // Gestor campo solo ve sus gestiones — ignora filtro de gestor del body
    const gestorLimpio = emailToken.includes('@')
      ? emailToken.split('@')[0]
      : emailToken;

    const gestor = esGestorCampo
      ? gestorLimpio
      : (filtros.gestor ?? null);

    this.logger.log(
      `App gestiones — perfil:${perfilToken} gestor:${gestor} campaña:${filtros.campana}`
    );

    return this.ejecutarSP(
      gestor,
      filtros.campana     ?? null,
      filtros.fecha_desde ?? null,
      filtros.fecha_hasta ?? null,
    );
  }

  // ══════════════════════════════════════════════════════
  //  EJECUTAR SP
  // ══════════════════════════════════════════════════════
  private async ejecutarSP(
    gestor:      string | null,
    campana:     string | null,
    fecha_desde: string | null,
    fecha_hasta: string | null,
  ): Promise<any> {

    const rows = await this.dsCampo.query(
      `EXEC SP_GestionesRealizadas @0, @1, @2, @3`,
      [gestor, campana, fecha_desde, fecha_hasta],
    );

    return {
      filtros: { gestor, campana, fecha_desde, fecha_hasta },
      total:   rows?.length ?? 0,
      gestiones: rows ?? [],
    };
  }
}
