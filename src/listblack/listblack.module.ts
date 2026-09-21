// lista-negra.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ListaNegra } from 'src/listblack/listblack.entity';
import { ListaNegraService } from 'src/listblack/listblack.service';
import { ListaNegraController } from 'src/listblack/listblack.controller';
import { ConnectionName } from 'src/database/constants/connection-names';

@Module({
  imports: [TypeOrmModule.forFeature([ListaNegra], ConnectionName.SQLSERVER_CAMPO)],
  controllers: [ListaNegraController],
  providers: [ListaNegraService],
})
export class ListaNegraModule {}