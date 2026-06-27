import { Injectable }        from '@nestjs/common';
import { PassportStrategy }  from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService }     from '@nestjs/config';

// ══════════════════════════════════════════════════════════
//  JWT STRATEGY
//  Extrae y valida el JWT del header Authorization: Bearer
// ══════════════════════════════════════════════════════════

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {

  constructor(config: ConfigService) {
    super({
      jwtFromRequest:   ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:      config.getOrThrow('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    return {
      id:     payload.sub,
      email:  payload.email,
      perfil: payload.perfil,
    };
  }
}
