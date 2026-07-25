import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

// ══════════════════════════════════════════════════════════
//  CONFIGURACIÓN — mover a variables de entorno / config
// ══════════════════════════════════════════════════════════
const IA_URL     = process.env.IA_URL     ?? 'http://192.168.1.6:3003';
const IA_API_KEY = process.env.IA_API_KEY ?? 'SECRET2026';

// ══════════════════════════════════════════════════════════
//  INTERFACES — reflejan lo que devuelve el microservicio Python
// ══════════════════════════════════════════════════════════
export interface TiempoMuerto {
  hora:     string;
  duracion: number;
  donde:    string;
}

export interface MetricasIA {
  min_en_gestion:          number;
  min_traslado:            number;
  min_refrigerio:          number;
  min_trafico:             number;
  min_tiempo_muerto:       number;
  min_sin_senal:           number;
  cant_gestiones:          number;
  cant_tiempos_muertos:    number;
  cant_clientes_pendientes:number;
  pct_tiempo_efectivo:     number;
  pct_tiempo_muerto:       number;
  inicio_tardio:           boolean;
  cierre_anticipado:       boolean;
}

export interface AlertaIA {
  tipo:          string;
  hora?:         string;
  duracion_min?: number;
  observacion:   string;
  cliente?:      string;
  metros_desvio?:number;
}

export interface AnomaliaIA {
  modo:        'ML' | 'REGLA';
  es_anomalo:  boolean;
  score:       number;
  explicacion: string;
}

export interface JornadaIA {
  email:    string;
  fecha:    string;
  eventos:  any[];
  alertas:  AlertaIA[];
  metricas: MetricasIA;
  flotando: boolean;
  anomalia: AnomaliaIA;
}

export interface AsesorDashboardIA {
  email:               string;
  nombre:              string;
  min_tiempo_muerto:   number;
  cant_tiempos_muertos:number;
  pct_tiempo_efectivo: number;
  tiempos_muertos:     TiempoMuerto[];
  ia_modo:             'ML' | 'REGLA';
  ia_score_anomalia:   number;
  ia_es_anomalo:       boolean;
  ia_explicacion:      string;
}

export interface DashboardIA {
  fecha:          string;
  hora:           string;
  total_asesores: number;
  en_modo_ml:     number;
  asesores:       AsesorDashboardIA[];
}

@Injectable()
export class IaCampoService {
  private readonly logger = new Logger(IaCampoService.name);

  constructor(private readonly http: HttpService) {}

  // ── Cabeceras con la API key ──────────────────────────────
  private get headers() {
    return { headers: { 'X-API-Key': IA_API_KEY } };
  }

  // ── Helper para manejar errores de forma uniforme ─────────
  private manejarError(e: unknown, contexto: string): never {
    const err = e as AxiosError;
    const detalle = err.response?.data ?? err.message;
    this.logger.error(`IA [${contexto}]: ${JSON.stringify(detalle)}`);

    // Si el servicio de IA está caído, no rompas todo el flujo:
    // devuelve un 503 claro para que el frontend lo maneje.
    throw new HttpException(
      { mensaje: 'Servicio de IA no disponible', contexto },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  // ══════════════════════════════════════════════════════
  //  DASHBOARD DE TIEMPOS MUERTOS (todos los asesores)
  //  Consume el endpoint /demo/tiempos-muertos del Python
  // ══════════════════════════════════════════════════════
  async getDashboardTiemposMuertos(fecha?: string): Promise<DashboardIA> {
    const url = `${IA_URL}/demo/tiempos-muertos${fecha ? `?fecha=${fecha}` : ''}`;
    try {
      const { data } = await firstValueFrom(
        this.http.get<DashboardIA>(url, this.headers),
      );
      return data;
    } catch (e) {
      this.manejarError(e, 'dashboard-tiempos-muertos');
    }
  }

  // ══════════════════════════════════════════════════════
  //  JORNADA COMPLETA DE UN ASESOR
  // ══════════════════════════════════════════════════════
  async getJornadaAsesor(email: string, fecha?: string): Promise<JornadaIA> {
    const url = `${IA_URL}/jornada/${encodeURIComponent(email)}${fecha ? `?fecha=${fecha}` : ''}`;
    try {
      const { data } = await firstValueFrom(
        this.http.get<JornadaIA>(url, this.headers),
      );
      return data;
    } catch (e) {
      this.manejarError(e, 'jornada-asesor');
    }
  }

  // ══════════════════════════════════════════════════════
  //  SOLO ALERTAS DE UN ASESOR (liviano, para pooling)
  // ══════════════════════════════════════════════════════
  async getAlertasAsesor(email: string, fecha?: string): Promise<{
    email: string; fecha: string; alertas: AlertaIA[];
    flotando: boolean; metricas: MetricasIA;
  }> {
    const url = `${IA_URL}/alertas/${encodeURIComponent(email)}${fecha ? `?fecha=${fecha}` : ''}`;
    try {
      const { data } = await firstValueFrom(this.http.get(url, this.headers));
      return data;
    } catch (e) {
      this.manejarError(e, 'alertas-asesor');
    }
  }

  // ══════════════════════════════════════════════════════
  //  ESTADO DE LOS MODELOS ML (diagnóstico)
  // ══════════════════════════════════════════════════════
  async getEstadoML(): Promise<any> {
    const url = `${IA_URL}/ml/estado`;
    try {
      const { data } = await firstValueFrom(this.http.get(url, this.headers));
      return data;
    } catch (e) {
      this.manejarError(e, 'estado-ml');
    }
  }

  // ══════════════════════════════════════════════════════
  //  FORZAR REENTRENAMIENTO (manual, sin esperar al sábado)
  // ══════════════════════════════════════════════════════
  async reentrenar(): Promise<any> {
    const url = `${IA_URL}/ml/entrenar`;
    try {
      const { data } = await firstValueFrom(this.http.post(url, {}, this.headers));
      return data;
    } catch (e) {
      this.manejarError(e, 'reentrenar');
    }
  }
}