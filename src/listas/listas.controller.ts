// listas.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { ListasService } from 'src/listas/listas.service';

@Controller('listas')
export class ListasController {
  constructor(private readonly listasService: ListasService) {}

  @Get('campaign/:campaignId')
  async getCargasByCampaign(@Param('campaignId') campaignId: string) {
    return this.listasService.getCargasByCampaign(campaignId);
  }
}