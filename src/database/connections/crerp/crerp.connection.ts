import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService }        from '@nestjs/config';



export function createCrerpConnection(
  config: ConfigService,
): TypeOrmModuleOptions {
  return {
    type:        'mysql',
    host:        config.getOrThrow<string>('DB_ERP'),
    port:        config.getOrThrow<number>('DB_ERP_PORT'),
    username:    config.getOrThrow<string>('DB_ERP_USERNAME'),
    password:    config.getOrThrow<string>('DB_ERP_PASSWORD'),
    database:    config.getOrThrow<string>('DB_ERP_DATABASE'),
    entities:    [],
    synchronize: false,
    logging:     false,
    connectTimeout: 10_000,
    extra: { connectionLimit: 10 },
  };
}
