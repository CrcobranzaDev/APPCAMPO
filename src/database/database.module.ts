import { Module }from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { ConnectionName }from 'src/database/constants/connection-names';
import { createInfocallConnection } from 'src/database/connections/infocall/infocall.connection';
import { createAsteriskConnection } from 'src/database/connections/asterisk/asterisk.factory';
import { createSqlServerConnection } from 'src/database/connections/sqlserver/sqlserver.factory';
import { createCrerpConnection } from 'src/database/connections/crerp/crerp.connection';



@Module({
  imports: [

  
    TypeOrmModule.forRootAsync({
      name:    ConnectionName.INFOCALL,
      imports: [ConfigModule],
      inject:  [ConfigService],
      useFactory: (config: ConfigService) =>
        createInfocallConnection(config),
    }),

    
    TypeOrmModule.forRootAsync({
      name:    ConnectionName.SQLSERVER_MAESTRA,
      imports: [ConfigModule],
      inject:  [ConfigService],
      useFactory: (config: ConfigService) =>
        createSqlServerConnection('SQLSERVER_MAESTRA', config),
    }),

    
    TypeOrmModule.forRootAsync({
      name:    ConnectionName.SQLSERVER_CAMPO,
      imports: [ConfigModule],
      inject:  [ConfigService],
      useFactory: (config: ConfigService) =>
        createSqlServerConnection('SQLSERVER_CAMPO', config),
    }),

    TypeOrmModule.forRootAsync({
      name:    ConnectionName.ASTERISK_1,
      imports: [ConfigModule],
      inject:  [ConfigService],
      useFactory: (config: ConfigService) =>
        createAsteriskConnection(1, config),
    }),

    
    TypeOrmModule.forRootAsync({
      name:    ConnectionName.ASTERISK_2,
      imports: [ConfigModule],
      inject:  [ConfigService],
      useFactory: (config: ConfigService) =>
        createAsteriskConnection(2, config),
    }),

    
    TypeOrmModule.forRootAsync({
      name:    ConnectionName.ASTERISK_3,
      imports: [ConfigModule],
      inject:  [ConfigService],
      useFactory: (config: ConfigService) =>
        createAsteriskConnection(3, config),
    }),

    TypeOrmModule.forRootAsync({
      name:    ConnectionName.CRERP,
      imports: [ConfigModule],
      inject:  [ConfigService],
      useFactory: (config: ConfigService) =>
        createCrerpConnection(config),
    }),

  ],
})
export class DatabaseModule {}