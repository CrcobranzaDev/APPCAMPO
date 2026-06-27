// cargas.service.ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConnectionName } from 'src/database/constants/connection-names';

export interface CargaCampaign {
  campaign_id: string;
  nombre_archivo: string;
  fecha_carga: Date;
  campaign_name: string;
}

@Injectable()
export class ListasService {
  constructor(
    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly dsCampo: DataSource,
  ) {}

  async getCargasByCampaign(campaignId: string): Promise<CargaCampaign[]> {
    const result = await this.dsCampo.query<CargaCampaign[]>(
      `
      SELECT
        B.campaign_id,
        A.nombre_archivo,
        A.fecha_carga,
        B.campaign_name
      FROM [BD_CR_APP].[dbo].[cargas] A
      LEFT JOIN campaigns B ON A.campaign_id = B.id
      WHERE B.campaign_id = @0
      `,
      [campaignId],
    );

    return result;
  }
}