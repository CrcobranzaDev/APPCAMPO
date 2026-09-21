import { Module }           from '@nestjs/common';
import { ThrottlerModule }  from '@nestjs/throttler';

import { PostulacionesPublicasController } from 'src/postulaciones-publicas/postulaciones-publicas.controller';
import { PostulacionesPublicasService }    from 'src/postulaciones-publicas/postulaciones-publicas.service';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
  ],
  controllers: [PostulacionesPublicasController],
  providers:   [PostulacionesPublicasService],
})
export class PostulacionesPublicasModule {}
