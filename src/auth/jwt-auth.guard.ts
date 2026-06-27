import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard }                         from '@nestjs/passport';

// ══════════════════════════════════════════════════════════
//  JWT GUARD
//  Protege rutas que requieren autenticación.
//  Uso: @UseGuards(JwtAuthGuard)
// ══════════════════════════════════════════════════════════

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    return user;
  }
}
