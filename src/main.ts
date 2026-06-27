import { NestFactory }                             from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyWebsocket                           from '@fastify/websocket';
import multipart                                  from '@fastify/multipart'; 
import { AppModule }                              from './app.module';
import { Logger, ValidationPipe }                from '@nestjs/common';
import { GpsService }                            from 'src/websocket/gps.gateway';
import * as http                                 from 'http';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.setGlobalPrefix('App/campo');
  app.enableCors({ origin: true, credentials: true });

await app.register(fastifyWebsocket);
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }  // 10 MB
  });
  await app.init();

  const gpsService      = app.get(GpsService);
  const fastifyInstance = app.getHttpAdapter().getInstance();
  gpsService.registerRoutes(fastifyInstance);

  const HOST        = '0.0.0.0';
  const WEB_PORT    = 5005;
  const MOBILE_PORT = 6000;

  try {
    // 1. Servidor principal (Puerto 5005)
    await app.listen(WEB_PORT, HOST);
    logger.log(`🌐 WEB LOCAL:       http://192.168.1.26:${WEB_PORT}/App/campo`);

    // 2. Servidor secundario (Puerto 6000)
    // Usa el mismo servidor interno de Fastify para manejar las requests
    const secondaryServer = http.createServer((req, res) => {
      // Pasar la request directamente al servidor de Fastify
      fastifyInstance.server.emit('request', req, res);
    });

    // Reenviar upgrades de WebSocket al servidor principal
    secondaryServer.on('upgrade', (req, socket, head) => {
      fastifyInstance.server.emit('upgrade', req, socket, head);
    });

    secondaryServer.listen(MOBILE_PORT, HOST, () => {
      logger.log(`📱 APP MÓVIL (NAT): http://192.168.1.26:${MOBILE_PORT}/App/campo`);
    });

    secondaryServer.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`❌ Puerto ${MOBILE_PORT} ocupado.`);
      }
    });

  } catch (error) {
    logger.error('💥 Error fatal al iniciar el servidor', error);
    process.exit(1);
  }
}

bootstrap();