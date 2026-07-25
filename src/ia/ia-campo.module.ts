import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { IaCampoService } from './ia-campo.service';
import { IaCampoController } from './ia-campo.controller';

@Module({
  imports: [
    HttpModule.register({
      timeout: 15000,      // 15s — el /demo entrena modelos, puede tardar
      maxRedirects: 0,
    }),
  ],
  controllers: [IaCampoController],
  providers: [IaCampoService],
  exports: [IaCampoService],  // por si otro módulo lo necesita
})
export class IaCampoModule {}