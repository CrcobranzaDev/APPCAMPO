import { Controller, Post, UseGuards, Request } from '@nestjs/common';
import { DetalleClientesService }                from 'src/asignacionapp/services/detalle-clientes.service';
import { JwtAuthGuard }                          from 'src/auth/jwt-auth.guard';



@Controller('detalle-clientes')
@UseGuards(JwtAuthGuard)
export class DetalleClientesController {

  constructor(private readonly service: DetalleClientesService) {}

  // ── GET /detalle-clientes ─────────────────────────────
  //  El gestor se obtiene del JWT, no del URL
  //  Authorization: Bearer <token>
 @Post('clientes-activos')
async getClientesActivos(@Request() req: any) {
  console.log('Headers:', req.headers);
  console.log('User del token:', req.user);
  const emailGestor = req.user.email;
  return this.service.getClientesActivos(emailGestor);
}
}
