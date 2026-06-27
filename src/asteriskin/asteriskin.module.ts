import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AsteriskinController } from './asteriskin.controller';
import { AsteriskinService } from './asteriskin.service';
import { EncryptionModule } from 'src/common/encryption.module';
import { ASTERISK_CONNECTIONS } from 'src/database/constants/connection-names';
         // ajusta el path

@Module({
  imports: [
    /**
     * forFeature vacío pero con el nombre de cada conexión:
     * esto le dice a TypeORM que este módulo usa esas DataSources,
     * permitiendo inyectarlas con @InjectDataSource(nombre).
     *
     * No se registran entidades porque solo usamos ds.query() puro.
     */
    TypeOrmModule.forFeature([], ASTERISK_CONNECTIONS[0]),
    TypeOrmModule.forFeature([], ASTERISK_CONNECTIONS[1]),
    TypeOrmModule.forFeature([], ASTERISK_CONNECTIONS[2]),

    // Módulo que provee EncryptionService
    EncryptionModule,
  ],
  controllers: [AsteriskinController],
  providers:   [AsteriskinService],
  exports:     [AsteriskinService], // exportar si otro módulo necesita llamar al servicio directamente
})
export class AsteriskinModule {}