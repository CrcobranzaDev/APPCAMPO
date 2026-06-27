import { Injectable, Logger }             from '@nestjs/common';
import { InjectDataSource }               from '@nestjs/typeorm';
import { DataSource, SelectQueryBuilder } from 'typeorm';

import { ConnectionName } from '../../database/constants/connection-names';
import { FilterItem }     from 'src/carga/dto/filter.dto';

// ══════════════════════════════════════════════════════════════════════════════
//  ASIGNACION FILTER SERVICE
//
//  FLUJO:
//  ┌─────────────────────────────────────────────────────────────────────────┐
//  │  1. T_Columnas2 (BD_CR_MAESTRA)                                         │
//  │     → TODAS las columnas de la campaña → SELECT en FR_ASIGNACION        │
//  │                                                                         │
//  │  2. campaign_columns_meta (BD_CR_APP)                                   │
//  │     → qué cabeceras mostrar en el response                              │
//  │                                                                         │
//  │  3. FR_ASIGNACION (BD_CR_MAESTRA)                                       │
//  │     → datos filtrados · response con cabeceras de meta + filtros        │
//  └─────────────────────────────────────────────────────────────────────────┘
//
//  ¿Cómo agregar una nueva campaña?
//    1. INSERT en campaigns             (BD_CR_APP)
//    2. INSERT en campaign_columns_meta (BD_CR_APP)
//    3. Verificar T_Columnas2           (BD_CR_MAESTRA)
//    → No se toca ningún archivo TypeScript
// ══════════════════════════════════════════════════════════════════════════════

interface ColumnaInfo {
  columna:          string;   // columna real en FR_ASIGNACION
  columna_etiqueta: string;   // label para el frontend
}

@Injectable()
export class AsignacionFilterService {
  private readonly logger = new Logger(AsignacionFilterService.name);

  constructor(
    @InjectDataSource(ConnectionName.SQLSERVER_MAESTRA)
    private readonly maestraDS: DataSource,   // BD_CR_MAESTRA → T_Columnas2 · FR_ASIGNACION

    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly appDS: DataSource,       // BD_CR_APP → campaigns · campaign_columns_meta
  ) {}

  // ════════════════════════════════════════════════════════════════════════
  //  MÉTODO PRINCIPAL
  // ════════════════════════════════════════════════════════════════════════
async buscarConFiltros(
  campaignName:     string,
  filtros:          FilterItem[],
  fechaCargaDesde?: string,
  fechaCargaHasta?: string,
) {
  try {
    // ── PASO 1: T_Columnas2 → columnas para SELECT y WHERE ────────────────
    const columnasT2 = await this.obtenerTodasLasColumnas(campaignName);

    if (!columnasT2.length) {
      throw new Error(`Sin columnas en T_Columnas2 para '${campaignName}'`);
    }

    // ── PASO 2: campaign_columns_meta → etiquetas permitidas en response ──
    const etiquetasMeta = await this.obtenerEtiquetasDeMeta(campaignName);

    // ── Mapas desde T_Columnas2 ───────────────────────────────────────────
    const columnaAEtiqueta = new Map<string, string>(
      columnasT2.map(c => [c.columna, c.columna_etiqueta]),
    );
    const etiquetaAColumna = new Map<string, string>(
      columnasT2.map(c => [c.columna_etiqueta, c.columna]),
    );

    // ── PASO 3: SELECT con TODAS las columnas de T_Columnas2 ─────────────
    const selectArray = columnasT2.map(c => `fr.${c.columna}`);

    filtros.forEach(filtro => {
      const col = etiquetaAColumna.get(filtro.etiqueta);
      if (col && !selectArray.includes(`fr.${col}`)) {
        selectArray.push(`fr.${col}`);
        if (!columnaAEtiqueta.has(col)) columnaAEtiqueta.set(col, filtro.etiqueta);
      }
    });

    // ── PASO 4: query sobre FR_ASIGNACION ─────────────────────────────────
    const qb = this.maestraDS
      .createQueryBuilder()
      .select(selectArray)
      .from('FR_ASIGNACION', 'fr')
      .where('fr.campaign_id = :campaignId', { campaignId: campaignName });

    const filtroYaTienePeriodo = filtros.some(
      f => etiquetaAColumna.get(f.etiqueta) === 'cPERIODO',
    );
    if (!filtroYaTienePeriodo) {
      this.aplicarFiltroPeriodo(qb, fechaCargaDesde, fechaCargaHasta);
    }

    if (filtros.length > 0) {
      if (!this.validarParentesisBalanceados(filtros)) {
        throw new Error('Los paréntesis de los filtros no están balanceados');
      }
      this.aplicarFiltrosConLogica(qb, filtros, etiquetaAColumna);
    }

    this.logger.log('SQL:', qb.getSql());
    this.logger.log('Params:', JSON.stringify(qb.getParameters()));

    const t0         = Date.now();
    const resultados = await qb.getRawMany();
    this.logger.log(`[${campaignName}] ${Date.now() - t0}ms · ${resultados.length} filas`);

    // ── PASO 5: response → solo cabeceras de campaign_columns_meta ────────
    const metaMap = await this.obtenerEtiquetasDeMeta(campaignName);

return this.transformarResultados(resultados, columnaAEtiqueta, metaMap, filtros);

  } catch (error) {
    this.logger.error('Error en buscarConFiltros:', error);
    throw error;
  }
}




// ════════════════════════════════════════════════════════════════════════
//  ETIQUETAS DISPONIBLES — directo desde T_Columnas2
// ════════════════════════════════════════════════════════════════════════
async obtenerEtiquetasDisponibles(campaignName: string) {
  const columnas = await this.obtenerTodasLasColumnas(campaignName);

  if (!columnas.length) {
    throw new Error(`Sin columnas en T_Columnas2 para '${campaignName}'`);
  }

  return {
    campaignName,
    total:     columnas.length,
    etiquetas: columnas.map(c => c.columna_etiqueta),
  };
}

// ════════════════════════════════════════════════════════════════════════
//  T_Columnas2 (BD_CR_MAESTRA) — fuente de verdad de columnas y etiquetas
// ════════════════════════════════════════════════════════════════════════
private async obtenerTodasLasColumnas(campaignName: string): Promise<ColumnaInfo[]> {
  const rows = await this.maestraDS.query(
    `SELECT columna, columna_etiqueta
     FROM   T_Columnas2
     WHERE  campaign_id = @0`,
    [campaignName],
  );

  this.logger.log(`[${campaignName}] T_Columnas2 → ${rows.length} columnas`);

  return rows.map((r: any) => ({
    columna:          r.columna,
    columna_etiqueta: r.columna_etiqueta,
  }));
}


private async obtenerEtiquetasDeMeta(
  campaignName: string,
): Promise<Map<string, string>> {
  const rows = await this.appDS.query(
    `SELECT ccm.columna_origen, ccm.columna_etiqueta
     FROM   campaign_columns_meta ccm
     JOIN   campaigns c ON c.id = ccm.campaign_id
     WHERE  c.campaign_id = @0
       AND  ccm.activo    = 1
     ORDER  BY ccm.orden ASC`,
    [campaignName],
  );

  this.logger.log(`[${campaignName}] campaign_columns_meta → ${rows.length} columnas`);

  // columna_origen → columna_etiqueta
  // 'NUM_CUENTA'   → 'Cuenta'
  // 'NOMBRE TITULAR' → 'Cliente'
  return new Map<string, string>(
    rows.map((r: any) => [r.columna_origen, r.columna_etiqueta]),
  );
}
// ════════════════════════════════════════════════════════════════════════
//  campaign_id numérico para filtrar FR_ASIGNACION
// ════════════════════════════════════════════════════════════════════════
/*private async obtenerCampaignId(campaignName: string): Promise<number> {
  const rows = await this.appDS.query(
    `SELECT id FROM campaigns WHERE campaign_id = @0 AND active = 'Y'`,
    [campaignName],
  );

  if (!rows?.length) {
    throw new Error(`Campaña '${campaignName}' no encontrada o inactiva`);
  }
  return rows[0].id;
}**/

// ════════════════════════════════════════════════════════════════════════
//  FILTROS CON LÓGICA AND/OR Y PARÉNTESIS
// ════════════════════════════════════════════════════════════════════════
private aplicarFiltrosConLogica(
  qb:               SelectQueryBuilder<any>,
  filtros:          FilterItem[],
  etiquetaAColumna: Map<string, string>,
) {
  const condiciones: string[]            = [];
  const params:      Record<string, any> = {};

  filtros.forEach((filtro, index) => {
    const columna = etiquetaAColumna.get(filtro.etiqueta);
    if (!columna) {
      throw new Error(`Etiqueta '${filtro.etiqueta}' no encontrada en T_Columnas2`);
    }

    const paramName = `fp${index}`;
    const abrir     = filtro.abrirParentesis  ?? 0;
    const cerrar    = filtro.cerrarParentesis ?? 0;

    let condicion = '';
    if (abrir  > 0) condicion += '('.repeat(abrir);

    const { sql, params: condParams } = this.construirCondicionSQL(
      columna, filtro.valor, filtro.operador ?? '=', paramName,
    );
    condicion += sql;
    Object.assign(params, condParams);

    if (cerrar > 0) condicion += ')'.repeat(cerrar);
    condiciones.push(condicion);
  });

  const whereCompleto = condiciones
    .map((cond, i) =>
      i < condiciones.length - 1
        ? `${cond} ${filtros[i].operadorLogico ?? 'AND'} `
        : cond,
    )
    .join('');

  this.logger.log('WHERE generado:', whereCompleto);
  this.logger.log('Params filtros:', JSON.stringify(params, null, 2));

  if (whereCompleto) qb.andWhere(whereCompleto, params);
}

// ════════════════════════════════════════════════════════════════════════
//  CONSTRUCCIÓN DE CONDICIÓN SQL POR OPERADOR
// ════════════════════════════════════════════════════════════════════════
private construirCondicionSQL(
  columna:   string,
  valor:     any,
  operador:  string,
  paramName: string,
): { sql: string; params: Record<string, any> } {
  switch (operador) {
    case '=': case '!=': case '>': case '<': case '>=': case '<=':
      return {
        sql:    `fr.${columna} ${operador} :${paramName}`,
        params: { [paramName]: valor },
      };
    case 'LIKE':
      return {
        sql:    `fr.${columna} LIKE :${paramName}`,
        params: { [paramName]: `%${valor}%` },
      };
    case 'IN':
      if (!Array.isArray(valor) || !valor.length)
        throw new Error('IN requiere un array con al menos un valor');
      return {
        sql:    `fr.${columna} IN (:...${paramName})`,
        params: { [paramName]: valor },
      };
    case 'BETWEEN':
      if (!Array.isArray(valor) || valor.length !== 2)
        throw new Error('BETWEEN requiere exactamente 2 valores');
      return {
        sql:    `fr.${columna} BETWEEN :${paramName}0 AND :${paramName}1`,
        params: { [`${paramName}0`]: valor[0], [`${paramName}1`]: valor[1] },
      };
    case 'IS NULL':
      return { sql: `fr.${columna} IS NULL`,     params: {} };
    case 'IS NOT NULL':
      return { sql: `fr.${columna} IS NOT NULL`, params: {} };
    default:
      throw new Error(`Operador '${operador}' no soportado`);
  }
}

// ════════════════════════════════════════════════════════════════════════
//  FILTRO POR PERIODO O RANGO DE FECHAS
// ════════════════════════════════════════════════════════════════════════
private aplicarFiltroPeriodo(
  qb:     SelectQueryBuilder<any>,
  desde?: string,
  hasta?: string,
) {
  if (desde && hasta) {
    qb.andWhere('fr.fecha_carga BETWEEN :desde AND :hasta', { desde, hasta });
    return;
  }

  const periodo = this.obtenerPeriodoActual();
  this.logger.log(`Filtro por periodo automático: ${periodo}`);
  qb.andWhere('fr.cPERIODO = :cPERIODO', { cPERIODO: periodo });
}

private obtenerPeriodoActual(): string {
  const fecha = new Date();
  return `${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

// ════════════════════════════════════════════════════════════════════════
//  VALIDACIÓN DE PARÉNTESIS
// ════════════════════════════════════════════════════════════════════════
private validarParentesisBalanceados(filtros: FilterItem[]): boolean {
  let contador = 0;
  for (const f of filtros) {
    contador += f.abrirParentesis  ?? 0;
    contador -= f.cerrarParentesis ?? 0;
    if (contador < 0) return false;
  }
  return contador === 0;
}

// ════════════════════════════════════════════════════════════════════════
//  TRANSFORMAR RESPONSE: columna_real → columna_etiqueta de T_Columnas2
// ════════════════════════════════════════════════════════════════════════
private transformarResultados(
  resultados:       any[],
  columnaAEtiqueta: Map<string, string>,  // columna_real → columna_origen (T_Columnas2)
  metaMap:          Map<string, string>,  // columna_origen → label amigable (meta)
  filtros:          FilterItem[],         // columnas extra que se usaron como filtro
) {
  // Set de columna_origen usadas en filtros
  // Si filtré por 'cPERIODO' → etiquetaAColumna lo resuelve a su columna_origen
  const origenFiltros = new Set(filtros.map(f => f.etiqueta));

  return resultados.map(fila => {
    const filaFiltrada: Record<string, any> = {};

    Object.entries(fila).forEach(([col, val]) => {
      const origenT2      = columnaAEtiqueta.get(col);
      const labelAmigable = origenT2 ? metaMap.get(origenT2) : undefined;

      if (labelAmigable !== undefined) {
        // ✅ Está en campaign_columns_meta → label amigable
        filaFiltrada[labelAmigable] = val;
      } else if (origenT2 && origenFiltros.has(origenT2)) {
        // ✅ Fue usada como filtro pero no está en meta → mostrar con etiqueta T2
        filaFiltrada[origenT2] = val;
      }
      // ❌ No está en meta ni en filtros → no aparece
    });

    return filaFiltrada;
  });
}
}