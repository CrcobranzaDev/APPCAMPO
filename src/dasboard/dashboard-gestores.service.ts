import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource }   from '@nestjs/typeorm';
import { DataSource }         from 'typeorm';
import { ConnectionName }     from 'src/database/constants/connection-names';

export interface FiltroDashboard {
  campana?:        string | null;
  nombre_archivo?: string | null;
  fecha_desde?:    string | null;
  fecha_hasta?:    string | null;
}

export interface GestorResumen {
  usuario_gestor: string;
  nombre_gestor:  string;
  total:          number;
  gestionados:    number;
  pendientes:     number;
  desactivados:   number;
  pct_avance:     number;
  ultima_gestion: string | null;
}

@Injectable()
export class DashboardGestoresService {

  private readonly logger = new Logger(DashboardGestoresService.name);

  constructor(
    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly dsCampo: DataSource,
  ) {}

  async getDashboard(filtros: FiltroDashboard = {}): Promise<{
    filtros:        FiltroDashboard;
    total_gestores: number;
    resumen:        GestorResumen[];
    totales: {
      clientes:     number;
      gestionados:  number;
      pendientes:   number;
      desactivados: number;
      pct_avance:   number;
    };
  }> {
    const {
      campana        = null,
      nombre_archivo = null,
      fecha_desde    = null,
      fecha_hasta    = null,
    } = filtros;

    this.logger.log(
      `Dashboard gestores — campana:${campana} archivo:${nombre_archivo} ` +
      `desde:${fecha_desde} hasta:${fecha_hasta}`,
    );

    const rows: GestorResumen[] = await this.dsCampo.query(
      `EXEC SP_DashboardGestores @0, @1, @2, @3`,
      [campana, nombre_archivo, fecha_desde, fecha_hasta],
    );

    const totales = rows.reduce(
      (acc, r) => {
        acc.clientes     += Number(r.total);
        acc.gestionados  += Number(r.gestionados);
        acc.pendientes   += Number(r.pendientes);
        acc.desactivados += Number(r.desactivados);
        return acc;
      },
      { clientes: 0, gestionados: 0, pendientes: 0, desactivados: 0 },
    );

    const pct_avance = totales.clientes > 0
      ? parseFloat((100 * totales.gestionados / totales.clientes).toFixed(2))
      : 0;

    const resumen: GestorResumen[] = rows.map(r => ({
      ...r,
      total:          Number(r.total),
      gestionados:    Number(r.gestionados),
      pendientes:     Number(r.pendientes),
      desactivados:   Number(r.desactivados),
      pct_avance:     Number(r.pct_avance),
      ultima_gestion: r.ultima_gestion ?? null,
    }));

    return {
      filtros:        { campana, nombre_archivo, fecha_desde, fecha_hasta },
      total_gestores: resumen.length,
      resumen,
      totales:        { ...totales, pct_avance },
    };
  }
}