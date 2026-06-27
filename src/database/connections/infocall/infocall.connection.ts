import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService }        from '@nestjs/config';



export function createInfocallConnection(
  config: ConfigService,
): TypeOrmModuleOptions {
  return {
    type:        'mysql',
    host:        config.getOrThrow<string>('INFOCALL_HOST'),
    port:        config.getOrThrow<number>('INFOCALL_PORT'),
    username:    config.getOrThrow<string>('INFOCALL_USER'),
    password:    config.getOrThrow<string>('INFOCALL_PASSWORD'),
    database:    config.getOrThrow<string>('INFOCALL_DATABASE'),
    entities:    [],
    synchronize: false,
    logging:     false,
    connectTimeout: 10_000,
    extra: { connectionLimit: 10 },
  };
}