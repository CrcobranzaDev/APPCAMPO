import { Module }                   from '@nestjs/common';
import { RegistroGestionController } from './registro-gestion.controller';
import { RegistroGestionService }    from './registro-gestion.service';
import { AuthModule }                from 'src/auth/auth.module';

@Module({
  imports:     [AuthModule],
  controllers: [RegistroGestionController],
  providers:   [RegistroGestionService],
  exports:     [RegistroGestionService],
})
export class RegistroGestionModule {}
