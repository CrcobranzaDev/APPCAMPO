import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';
import { ConnectionName } from 'src/database/constants/connection-names';
import { GPS_CONFIG } from  './gps.config';
import { GestorMsg, PingLoteDto } from  './gps.dto';

// ══════════════════════════════════════════════════════════
//  INTERFACES
// ══════════════════════════════════════════════════════════
interface UbicacionGestor {
  email: string;
  nombre: string;
  lat: number;
  lng: number;
  precision: number;
  ultimoEnvio: Date; // hora de CAPTURA del último ping (no de recepción)
  online: boolean;
  ultimoSync: Date; // última vez que se guardó en BD (para el throttle)
  ws: WebSocket | null;
  kmRecorridos: number;
  latAnterior: number;
  lngAnterior: number;
}

@Injectable()
export class GpsService implements OnModuleInit {
  private readonly logger = new Logger(GpsService.name);

  // Estado en memoria
  private readonly gestores = new Map<string, UbicacionGestor>();
  private readonly wsToEmail = new Map<WebSocket, string>();
  private readonly supervisores = new Set<WebSocket>();

  constructor(
    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly dsCampo: DataSource,
    private readonly jwtService: JwtService,
  ) {}

  onModuleInit() {
    setInterval(() => this.checkOfflineGestores(), GPS_CONFIG.CHECK_OFFLINE_MS);
  }

  // ══════════════════════════════════════════════════════
  //  REGISTRAR RUTAS (WS y HTTP)
  // ══════════════════════════════════════════════════════
  registerRoutes(fastify: FastifyInstance) {
    // 1. CANAL WEBSOCKET — App en primer plano
    fastify.get('/App/campo/gps', { websocket: true }, (socket: WebSocket, req: any) => {
      const token = this.extractToken(req);
      if (!token) return socket.close(1008, 'Sin token');

      try {
        const payload: any = this.jwtService.verify(token);
        const email = payload.email;
        const nombre = payload.nombre ?? email.split('@')[0];

        this.wsToEmail.set(socket, email);
        void this.inicializarGestorEnMemoria(email, nombre, socket);

        this.logger.log(`GPS: Gestor conectado vía WS: ${email}`);
        this.broadcastSupervisores({ type: 'gestor_online', email, nombre });
        this.send(socket, { type: 'mapa_init', data: this.getMapaActual() });

        socket.on('message', async (raw: Buffer) => {
          try {
            const msg = JSON.parse(raw.toString());
            await this.handleGestorMessage(socket, email, msg);
          } catch {
            this.logger.warn(`GPS: JSON inválido de ${email}`);
          }
        });

        socket.on('close', () => this.handleGestorClose(socket, email));
        socket.on('error', (err) => this.logger.error(`GPS Error ${email}: ${err.message}`));
      } catch {
        socket.close(1008, 'Token expirado');
      }
    });

    // 2. CANAL HTTP POST — App en segundo plano (un ping a la vez)
    fastify.post('/App/campo/gps/sync', async (request: FastifyRequest, reply) => {
      const token = this.extractToken(request);
      if (!token) return reply.code(401).send({ error: 'No token' });

      try {
        const payload: any = this.jwtService.verify(token);
        const email = payload.email;
        const msg = request.body as any;

        if (!this.gestores.has(email)) {
          const nombre = payload.nombre ?? email.split('@')[0];
          await this.inicializarGestorEnMemoria(email, nombre, null);
        }

        await this.handleGestorMessage(null, email, msg);
        return { status: 'ok', received: true };
      } catch {
        return reply.code(401).send({ error: 'Sesión inválida' });
      }
    });

    // 3. CANAL MAPA — Supervisores
    fastify.get('/App/campo/mapa', { websocket: true }, (socket: WebSocket) => {
      this.supervisores.add(socket);
      this.send(socket, { type: 'mapa_init', data: this.getMapaActual() });
      socket.on('close', () => this.supervisores.delete(socket));
    });
  }

  // ══════════════════════════════════════════════════════
  //  PROCESAMIENTO DE MENSAJES (Lógica Central)
  //  Soporta WebSocket (ws) y HTTP (null)
  // ══════════════════════════════════════════════════════
  public async handleGestorMessage(ws: WebSocket | null, email: string, msg: GestorMsg) {
    if (!msg || !msg.type) return;

    let gestor = this.gestores.get(email);
    if (!gestor) {
      const nombre = email.split('@')[0];
      await this.inicializarGestorEnMemoria(email, nombre, ws);
      gestor = this.gestores.get(email)!;
    }

    switch (msg.type) {
      case 'ubicacion': {
        const m = msg as any;
        if (m.lat == null || m.lng == null) return;

        // ── FECHA DE CAPTURA (no de recepción) ──────────────────
        // El teléfono manda su timestamp; si no viene o el reloj está
        // roto (>12h de desfase), caemos a la hora del servidor.
        const fechaCaptura = m.timestamp ? new Date(m.timestamp) : new Date();
        const desfaseMin = Math.abs(Date.now() - fechaCaptura.getTime()) / 60000;
        const fechaFinal =
          desfaseMin > GPS_CONFIG.DESFASE_MAX_MIN ? new Date() : fechaCaptura;

        // ── ODÓMETRO ────────────────────────────────────────────
        if (gestor.lat !== 0 && gestor.lng !== 0 && m.lat !== 0 && m.lng !== 0) {
          const dist = this.calcularDistanciaKm(gestor.lat, gestor.lng, m.lat, m.lng);
          if (dist > GPS_CONFIG.ODOMETRO_MIN_KM && dist < GPS_CONFIG.ODOMETRO_MAX_KM) {
            gestor.kmRecorridos += dist;
          }
        }

        // ── ACTUALIZAR ESTADO EN MEMORIA ────────────────────────
        gestor.latAnterior = gestor.lat;
        gestor.lngAnterior = gestor.lng;
        gestor.lat = m.lat;
        gestor.lng = m.lng;
        gestor.precision = m.precision ?? 0;
        gestor.ultimoEnvio = fechaFinal;
        gestor.online = true;
        if (ws) gestor.ws = ws;

        // ── SYNC A BD (throttle) ────────────────────────────────
        const tiempoDesdeUltimoSync =
          (Date.now() - gestor.ultimoSync.getTime()) / 1000;
        if (tiempoDesdeUltimoSync >= GPS_CONFIG.SYNC_INTERVAL_SEG) {
          this.upsertUbicacionEnBD(gestor).catch((err) =>
            this.logger.error(`Error Sync BD ${email}: ${err.message}`),
          );
          gestor.ultimoSync = new Date();
        }

        this.broadcastSupervisores({ type: 'mapa_update', data: this.getMapaActual() });
        break;
      }

      case 'ping': {
        gestor.ultimoEnvio = new Date();
        gestor.online = true;
        if (ws && ws.readyState === WebSocket.OPEN) {
          this.send(ws, {
            type: 'pong',
            time: new Date().toISOString(),
            serverTime: Date.now(),
          });
        }
        break;
      }

      default:
        this.logger.debug(`Tipo no manejado: ${msg.type} de ${email}`);
    }
  }

  // ══════════════════════════════════════════════════════
  //  LOTE OFFLINE — inserta pings buffereados DIRECTO al log
  //  Llamado desde el controller (POST /gpes/sync-lote)
  //
  //  NO pasa por gestor_ubicacion, NO dispara el trigger,
  //  NO pasa por el throttle de 30s. Cada ping conserva su
  //  timestamp ORIGINAL de captura.
  // ══════════════════════════════════════════════════════
  public async insertarLoteLog(email: string, pings: PingLoteDto[]): Promise<number> {
    const validos = pings.filter(
      (p) => p.lat !== 0 && p.lng !== 0 && p.timestamp > 0,
    );
    if (!validos.length) return 0;

    // Ordenar por timestamp para que el log quede cronológico
    validos.sort((a, b) => a.timestamp - b.timestamp);

    // SQL Server limita a 2100 parámetros; con 5 por ping = ~420 pings/insert.
    // Insertamos en bloques de 400 por seguridad.
    const BLOQUE = 400;
    let insertados = 0;

    for (let inicio = 0; inicio < validos.length; inicio += BLOQUE) {
      const chunk = validos.slice(inicio, inicio + BLOQUE);

      const filas = chunk
        .map(
          (_, i) =>
            `(@${i * 5}, @${i * 5 + 1}, @${i * 5 + 2}, @${i * 5 + 3}, @${i * 5 + 4}, 0, 'SYNC')`,
        )
        .join(', ');

      const params = chunk.flatMap((p) => [
        email,
        p.lat,
        p.lng,
        p.precision ?? 0,
        new Date(p.timestamp),
      ]);

      await this.dsCampo.query(
        `INSERT INTO gestor_ubicacion_log
           (email, lat, lng, [precision], fecha_envio, online, origen)
         VALUES ${filas}`,
        params,
      );
      insertados += chunk.length;
    }

    // Actualizar posición actual con el ÚLTIMO ping del lote
    const ultimo = validos[validos.length - 1];
    await this.handleGestorMessage(null, email, {
      type: 'ubicacion',
      lat: ultimo.lat,
      lng: ultimo.lng,
      precision: ultimo.precision,
      timestamp: ultimo.timestamp,
    });

    // Avisar a Python que recalcule (cuando esté habilitado)
    await this.invalidarCachePython(email);

    this.logger.log(`GPS: Lote SYNC de ${email}: ${insertados} pings`);
    return insertados;
  }

  // ══════════════════════════════════════════════════════
  //  HELPERS INTERNOS
  // ══════════════════════════════════════════════════════

  private async inicializarGestorEnMemoria(
    email: string,
    nombre: string,
    socket: WebSocket | null,
  ) {
    const existing = this.gestores.get(email);

    // Recuperar km del día desde el log si es primera vez (tras reinicio)
    let kmHoy = existing?.kmRecorridos ?? 0;
    if (!existing) {
      kmHoy = await this.recuperarKmDelDia(email);
    }

    this.gestores.set(email, {
      email,
      nombre,
      lat: existing?.lat ?? 0,
      lng: existing?.lng ?? 0,
      precision: existing?.precision ?? 0,
      ultimoEnvio: new Date(),
      online: true,
      ultimoSync: existing?.ultimoSync ?? new Date(0),
      ws: socket,
      kmRecorridos: kmHoy,
      latAnterior: existing?.lat ?? 0,
      lngAnterior: existing?.lng ?? 0,
    });
  }

  /** Reconstruye el odómetro del día leyendo el log (sobrevive reinicios). */
  private async recuperarKmDelDia(email: string): Promise<number> {
    try {
      const r: Array<{ lat: number; lng: number }> = await this.dsCampo.query(
        `SELECT lat, lng
           FROM gestor_ubicacion_log
          WHERE email = @0
            AND CAST(fecha_envio AS DATE) = CAST(GETDATE() AS DATE)
          ORDER BY fecha_envio ASC`,
        [email],
      );
      let km = 0;
      for (let i = 1; i < r.length; i++) {
        const d = this.calcularDistanciaKm(r[i - 1].lat, r[i - 1].lng, r[i].lat, r[i].lng);
        if (d > GPS_CONFIG.ODOMETRO_MIN_KM && d < GPS_CONFIG.ODOMETRO_MAX_KM) km += d;
      }
      return km;
    } catch {
      return 0;
    }
  }

  private extractToken(req: any): string | null {
    const auth = req.headers?.authorization;
    if (auth?.startsWith('Bearer ')) return auth.replace('Bearer ', '');
    const url = new URL(req.url, 'http://localhost');
    return url.searchParams.get('token') || (req.query as any)?.token || null;
  }

  private checkOfflineGestores() {
    const ahora = Date.now();
    this.gestores.forEach((g, email) => {
      if (!g.online) return;
      if (ahora - g.ultimoEnvio.getTime() > GPS_CONFIG.OFFLINE_TIMEOUT_MS) {
        g.online = false;
        this.marcarOfflineEnBD(email).catch(() => {});
        this.broadcastSupervisores({ type: 'gestor_offline', email });
        this.broadcastSupervisores({ type: 'mapa_update', data: this.getMapaActual() });
        this.logger.warn(`Gestor Offline (Inactividad): ${email}`);
      }
    });
  }

  private async upsertUbicacionEnBD(g: UbicacionGestor) {
    try {
      // El SP recibe la fecha de CAPTURA como parámetro (no usa GETDATE())
      await this.dsCampo.query(`EXEC SP_UpsertUbicacion @0, @1, @2, @3, @4, @5`, [
        g.email,
        g.nombre,
        g.lat,
        g.lng,
        g.precision,
        g.ultimoEnvio,
      ]);
    } catch (e) {
      this.logger.error(`Error SQL Server (Upsert): ${e.message}`);
    }
  }

  private async marcarOfflineEnBD(email: string) {
    try {
      await this.dsCampo.query(`UPDATE gestor_ubicacion SET online = 0 WHERE email = @0`, [
        email,
      ]);
    } catch {
      /* silent fail */
    }
  }

  /** Avisa a Python que invalide el caché tras un lote offline. */
  private async invalidarCachePython(email: string) {
    if (!GPS_CONFIG.PYTHON_ENABLED) return; // desactivado hasta levantar Python
    try {
      await fetch(`${GPS_CONFIG.PYTHON_URL}/invalidar-cache/${email}`, {
        method: 'POST',
      });
    } catch {
      // Python caído NO debe romper el sync de GPS
      this.logger.warn(`No se pudo invalidar caché Python para ${email}`);
    }
  }

  private handleGestorClose(socket: WebSocket, email: string) {
    this.wsToEmail.delete(socket);
    const g = this.gestores.get(email);
    if (g) g.ws = null;
    this.logger.log(`GPS: Socket cerrado para ${email}`);
  }

  private send(ws: WebSocket, data: any) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  }

  private broadcastSupervisores(data: any) {
    const payload = JSON.stringify(data);
    this.supervisores.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    });
  }

  private getMapaActual(): any[] {
    return Array.from(this.gestores.values()).map((g) => ({
      email: g.email,
      nombre: g.nombre,
      lat: g.lat,
      lng: g.lng,
      precision: g.precision,
      online: g.online,
      ultimoEnvio: g.ultimoEnvio,
      kmRecorridos: parseFloat(g.kmRecorridos.toFixed(3)),
    }));
  }

  private calcularDistanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}