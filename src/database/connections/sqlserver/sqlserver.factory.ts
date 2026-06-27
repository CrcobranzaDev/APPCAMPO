import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService }        from '@nestjs/config';

export type SqlServerInstance = 'SQLSERVER_MAESTRA' | 'SQLSERVER_CAMPO';

export function createSqlServerConnection(
  instance: SqlServerInstance,
  config:   ConfigService,
): TypeOrmModuleOptions {
  return {
    type:        'mssql',
    host:        config.getOrThrow<string>(`${instance}_HOST`),
    port:        parseInt(config.getOrThrow<string>(`${instance}_PORT`), 10), 
    username:    config.getOrThrow<string>(`${instance}_USER`),
    password:    config.getOrThrow<string>(`${instance}_PASSWORD`),
    database:    config.getOrThrow<string>(`${instance}_DATABASE`),
    entities:    [],
    synchronize: false,
    logging:     false,
    options: {
      encrypt:                false,
      trustServerCertificate: true,
      enableArithAbort:       true,
      connectTimeout:         15_000,
    },
    requestTimeout: 15_000,
    extra: { connectionLimit: 5 },
  };
}