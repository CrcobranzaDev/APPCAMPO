import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource }   from '@nestjs/typeorm';
import { DataSource }         from 'typeorm';
import { ConnectionName }     from 'src/database/constants/connection-names';

@Injectable()
export class CampaniasService {

  private readonly logger = new Logger(CampaniasService.name);

  constructor(
    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly dsCampo: DataSource,
  ) {}

  async obtenerCampanasActivas(): Promise<any[]> {
    this.logger.log('Obteniendo campañas activas');

    const result = await this.dsCampo.query(
      `EXEC SP_ObtenerCampanasActivas`,
    );

    return result;
  }
}