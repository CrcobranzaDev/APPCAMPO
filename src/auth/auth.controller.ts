import {
  Controller, Post, Body,
  HttpCode, HttpStatus,
  UseGuards, Req,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';  // ← tipo nativo de Fastify

import { AuthService }              from './auth.service';
import { LoginDto, Verify2faDto }   from 'src/auth/auth.dto';
import { JwtAuthGuard }             from './jwt-auth.guard';

@Controller('auth')
export class AuthController {

  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('verify-2fa')
  @HttpCode(HttpStatus.OK)
  async verify2fa(@Body() dto: Verify2faDto) {
    return this.authService.verify2fa(dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: FastifyRequest & { user: { email: string } }) {
    return this.authService.logout(req.user.email);
  }
}