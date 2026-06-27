import { Module }          from '@nestjs/common';
import { ImagenController } from './imagen.controller';

@Module({
  controllers: [ImagenController],
})
export class ImagenModule {}