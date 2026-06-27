import { Module }                   from '@nestjs/common';
import { MapaGestionesController }  from './mapa-gestiones.controller';
import { MapaGestionesService }     from './mapa-gestiones.service';

@Module({
  controllers: [MapaGestionesController],
  providers:   [MapaGestionesService],
  exports:     [MapaGestionesService],
})
export class MapaGestionesModule {}
