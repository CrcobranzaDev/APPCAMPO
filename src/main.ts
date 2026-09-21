import { NestFactory }                            from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyWebsocket                           from '@fastify/websocket';
import multipart                                  from '@fastify/multipart';
import { AppModule }                              from './app.module';
import { Logger, ValidationPipe }                 from '@nestjs/common';
import { GpsService }                             from 'src/websocket/gps.gateway';

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
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  });
  await app.init();

  const gpsService      = app.get(GpsService);
  const fastifyInstance = app.getHttpAdapter().getInstance();
  gpsService.registerRoutes(fastifyInstance);

  const HOST = '0.0.0.0';
  const PORT = 5005;

  try {
    await app.listen(PORT, HOST);
    logger.log(`🌐 WEB LOCAL:  http://localhost:${PORT}/App/campo`);
    logger.log(`📱 APP MÓVIL:  http://<IP-de-red>:${PORT}/App/campo`);
  } catch (error) {
    logger.error('Error fatal al iniciar el servidor', error);
    process.exit(1);
  }
}

bootstrap();