import { Controller, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { CampaniasService } from 'src/campania/campania.service';
import { JwtAuthGuard }     from 'src/auth/jwt-auth.guard';

@Controller('campanias')
export class CampaniasController {

  constructor(private readonly service: CampaniasService) {}

  // ✅ CON TOKEN — GET /campanias/activas
  @Get('activas')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async obtenerActivas() {
    return this.service.obtenerCampanasActivas();
  }

  // 🔓 SIN TOKEN — GET /campanias/activas-public
  @Get('activas-public')
  @HttpCode(HttpStatus.OK)
  async obtenerActivasPublic() {
    return this.service.obtenerCampanasActivas();
  }
}