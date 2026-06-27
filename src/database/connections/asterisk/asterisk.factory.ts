import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService }        from '@nestjs/config';
import { AsteriskSede }         from '../../constants/connection-names';



export function createAsteriskConnection(
  sede:   AsteriskSede,
  config: ConfigService,
): TypeOrmModuleOptions {
  return {
    type:        'mysql',
    host:        config.getOrThrow<string>(`ASTERISK_${sede}_HOST`),
    port:        config.getOrThrow<number>(`ASTERISK_${sede}_PORT`),
    username:    config.getOrThrow<string>(`ASTERISK_${sede}_USER`),
    password:    config.getOrThrow<string>(`ASTERISK_${sede}_PASSWORD`),
    database:    config.getOrThrow<string>(`ASTERISK_${sede}_DATABASE`),
    entities:    [],
    synchronize: false,
    logging:     false,
    connectTimeout: 10_000,
    extra: { connectionLimit: 5 },
  };
}