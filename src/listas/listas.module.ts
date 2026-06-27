// listas.module.ts
import { Module } from '@nestjs/common';


import { ListasService } from './listas.service';
import { ListasController } from './listas.controller';

@Module({
  controllers: [ListasController],
  providers: [ListasService],
  exports: [ListasService],
})
export class ListasModule {}