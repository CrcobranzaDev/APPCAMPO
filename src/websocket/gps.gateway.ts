import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';
import { ConnectionName } from 'src/database/constants/connection-names';

// ══════════════════════════════════════════════════════════
//  INTERFACES
// ══════════════════════════════════════════════════════════
interface UbicacionGestor {
  email: string;
  nombre: string;
  lat: number;
  lng: number;
  precision: number;
  ultimoEnvio: Date;
  online: boolean;
  ultimoSync: Date;
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
    // Revisar inactividad cada 30s
    setInterval(() => this.checkOfflineGestores(), 30_000);
  }

  // ══════════════════════════════════════════════════════
  //  REGISTRAR RUTAS (WS y HTTP)
  // ══════════════════════════════════════════════════════
  registerRoutes(fastify: FastifyInstance) {
    
    // 1. CANAL WEBSOCKET — Para App en primer plano
    fastify.get('/App/campo/gps', { websocket: true }, (socket: WebSocket, req: any) => {
      const token = this.extractToken(req);
      if (!token) return socket.close(1008, 'Sin token');

      try {
        const payload: any = this.jwtService.verify(token);
        const email = payload.email;
        const nombre = payload.nombre ?? email.split('@')[0];

        this.wsToEmail.set(socket, email);
        this.inicializarGestorEnMemoria(email, nombre, socket);

        this.logger.log(`GPS: Gestor conectado vía WS: ${email}`);
        
        // Notificar conexión
        this.broadcastSupervisores({ type: 'gestor_online', email, nombre });
        this.send(socket, { type: 'mapa_init', data: this.getMapaActual() });

        socket.on('message', async (raw: Buffer) => {
          try {
            const msg = JSON.parse(raw.toString());
            // CAMBIO: Ahora es público para ser llamado desde las rutas
            await this.handleGestorMessage(socket, email, msg);
          } catch {
            this.logger.warn(`GPS: JSON inválido de ${email}`);
          }
        });

        socket.on('close', () => this.handleGestorClose(socket, email));
        socket.on('error', (err) => this.logger.error(`GPS Error ${email}: ${err.message}`));
      } catch (e) {
        socket.close(1008, 'Token expirado');
      }
    });

    // 2. CANAL HTTP POST — Para App en segundo plano (Background)
    fastify.post('/App/campo/gps/sync', async (request: FastifyRequest, reply) => {
      const token = this.extractToken(request);
      if (!token) return reply.code(401).send({ error: 'No token' });

      try {
        const payload: any = this.jwtService.verify(token);
        const email = payload.email;
        const msg = request.body as any;

        // Si el gestor no está en memoria (ej. reinició servidor), lo creamos
        if (!this.gestores.has(email)) {
          const nombre = payload.nombre ?? email.split('@')[0];
          this.inicializarGestorEnMemoria(email, nombre, null);
        }

        // Procesamos la ubicación exactamente igual que el WS
        await this.handleGestorMessage(null, email, msg);

        return { status: 'ok', received: true };
      } catch (err) {
        return reply.code(401).send({ error: 'Sesión inválida' });
      }
    });

    // 3. CANAL MAPA — Para Supervisores
    fastify.get('/App/campo/mapa', { websocket: true }, (socket: WebSocket) => {
      this.supervisores.add(socket);
      this.send(socket, { type: 'mapa_init', data: this.getMapaActual() });
      socket.on('close', () => this.supervisores.delete(socket));
    });
  }

  // ══════════════════════════════════════════════════════
  //  PROCESAMIENTO DE MENSAJES (Lógica Central)
  //  CAMBIO: Se pone PUBLIC para que registerRoutes pueda acceder
  // ══════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════
//  PROCESAMIENTO DE MENSAJES (Lógica Central)
//  Soporta tanto WebSocket (ws) como peticiones HTTP (null)
// ══════════════════════════════════════════════════════════
public async handleGestorMessage(ws: WebSocket | null, email: string, msg: any) {
  // 1. Validar que el mensaje tenga datos mínimos
  if (!msg || !msg.type) return;

  // 2. Obtener o inicializar el gestor en memoria
  let gestor = this.gestores.get(email);
  if (!gestor) {
    const nombre = email.split('@')[0];
    this.inicializarGestorEnMemoria(email, nombre, ws);
    gestor = this.gestores.get(email)!;
  }

  // 3. Procesar según el tipo de mensaje
  switch (msg.type) {
    case 'ubicacion':
      // --- CÁLCULO DE DISTANCIA (ODÓMETRO) ---
      // Solo calculamos si ya tenemos una coordenada previa válida
      if (gestor.lat !== 0 && gestor.lng !== 0 && msg.lat !== 0 && msg.lng !== 0) {
        const dist = this.calcularDistanciaKm(gestor.lat, gestor.lng, msg.lat, msg.lng);
        
        // Filtro de ruido: 
        // > 0.005 (5 metros) para ignorar GPS "saltarín" estando quieto.
        // < 1.5 (1.5km) para ignorar saltos falsos por cambio de torre celular.
        if (dist > 0.005 && dist < 1.5) {
          gestor.kmRecorridos += dist;
        }
      }

      // --- ACTUALIZAR ESTADO EN MEMORIA ---
      gestor.latAnterior = gestor.lat;
      gestor.lngAnterior = gestor.lng;
      gestor.lat = msg.lat;
      gestor.lng = msg.lng;
      gestor.precision = msg.precision ?? 0;
      gestor.ultimoEnvio = new Date();
      gestor.online = true;
      
      // Si entra por WS, actualizamos la referencia del socket
      if (ws) gestor.ws = ws; 

      // --- SINCRONIZACIÓN A BASE DE DATOS SQL SERVER ---
      // Para no saturar el DS, guardamos en BD solo cada 30 segundos
      const ahora = Date.now();
      const tiempoDesdeUltimoSync = (ahora - gestor.ultimoSync.getTime()) / 1000;

      if (tiempoDesdeUltimoSync >= 30) {
        // Ejecuta el SP de actualización en segundo plano
        this.upsertUbicacionEnBD(gestor).catch(err => 
          this.logger.error(`Error en Sync BD para ${email}: ${err.message}`)
        );
        gestor.ultimoSync = new Date();
      }

      // --- NOTIFICAR A SUPERVISORES ---
      // Enviamos el mapa actualizado a todos los que tengan abierto el panel de monitoreo
      this.broadcastSupervisores({ 
        type: 'mapa_update', 
        data: this.getMapaActual() 
      });
      break;

    case 'ping':
      // El "ping" mantiene la conexión viva y resetea el tiempo de inactividad
      gestor.ultimoEnvio = new Date();
      gestor.online = true;
      
      // Si hay un socket abierto (WS), respondemos el PONG
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.send(ws, { 
          type: 'pong', 
          time: new Date().toISOString(),
          serverTime: Date.now() 
        });
      }
      break;

    default:
      this.logger.debug(`Tipo de mensaje no manejado: ${msg.type} de ${email}`);
      break;
  }
}
  // ══════════════════════════════════════════════════════
  //  HELPERS INTERNOS
  // ══════════════════════════════════════════════════════

  private inicializarGestorEnMemoria(email: string, nombre: string, socket: WebSocket | null) {
    const existing = this.gestores.get(email);
    this.gestores.set(email, {
      email,
      nombre,
      lat: existing?.lat ?? 0,
      lng: existing?.lng ?? 0,
      precision: existing?.precision ?? 0,
      ultimoEnvio: new Date(),
      online: true,
      ultimoSync: existing?.ultimoSync ?? new Date(0),
      ws: socket, // Si entra por HTTP, socket es null
      kmRecorridos: existing?.kmRecorridos ?? 0,
      latAnterior: existing?.lat ?? 0,
      lngAnterior: existing?.lng ?? 0,
    });
  }

  private extractToken(req: any): string | null {
    const auth = req.headers?.authorization;
    if (auth?.startsWith('Bearer ')) return auth.replace('Bearer ', '');
    // Soporte para token por query params (común en WebSockets)
    const url = new URL(req.url, 'http://localhost');
    return url.searchParams.get('token') || (req.query as any)?.token || null;
  }

  private checkOfflineGestores() {
    const ahora = Date.now();
    this.gestores.forEach((g, email) => {
      if (!g.online) return;
      
      // Margen de 130 segundos (un poco más de los 2 min por latencia)
      if ((ahora - g.ultimoEnvio.getTime()) > 130_000) {
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
      // Usar parámetros nombrados o posicionales según tu configuración de TypeORM
      await this.dsCampo.query(
        `EXEC SP_UpsertUbicacion @0, @1, @2, @3, @4`, 
        [g.email, g.nombre, g.lat, g.lng, g.precision]
      );
    } catch (e) {
      this.logger.error(`Error SQL Server (Upsert): ${e.message}`);
    }
  }

  private async marcarOfflineEnBD(email: string) {
    try {
      await this.dsCampo.query(
        `UPDATE gestor_ubicacion SET online = 0 WHERE email = @0`, 
        [email]
      );
    } catch (e) { /* silent fail */ }
  }

  private handleGestorClose(socket: WebSocket, email: string) {
    this.wsToEmail.delete(socket);
    const g = this.gestores.get(email);
    if (g) {
      g.ws = null; 
      // IMPORTANTE: No lo marcamos online = false aquí. 
      // Dejamos que checkOfflineGestores decida si entra o no por HTTP.
    }
    this.logger.log(`GPS: Socket cerrado para ${email}`);
  }

  private send(ws: WebSocket, data: any) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  }

  private broadcastSupervisores(data: any) {
    const payload = JSON.stringify(data);
    this.supervisores.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    });
  }

  private getMapaActual(): any[] {
    return Array.from(this.gestores.values()).map(g => ({
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
    const R = 6371; // Radio de la tierra en km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}