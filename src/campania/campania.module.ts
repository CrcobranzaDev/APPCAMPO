import { Module }             from '@nestjs/common';
import { CampaniasService }   from 'src/campania/campania.service';
import { CampaniasController } from 'src/campania/campania.controller';

@Module({
  controllers: [CampaniasController],
  providers:   [CampaniasService],
})
export class CampaniasModule {}