import { Module }         from '@nestjs/common';
import { JwtModule }      from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService }    from './auth.service';
import { JwtStrategy }    from './jwt.strategy';
import { JwtAuthGuard }   from 'src/auth/jwt-auth.guard';

// ══════════════════════════════════════════════════════════
//  AUTH MODULE
// ══════════════════════════════════════════════════════════

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),

    JwtModule.registerAsync({
      imports:    [ConfigModule],
      inject:     [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:      config.getOrThrow('JWT_SECRET'),
        signOptions: { expiresIn: '10h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers:   [AuthService, JwtStrategy, JwtAuthGuard],
  exports:     [JwtAuthGuard, JwtStrategy],  // exportar para proteger otras rutas
})
export class AuthModule {}
