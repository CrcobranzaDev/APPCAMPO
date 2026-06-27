import {
  Injectable, Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource }  from '@nestjs/typeorm';
import { DataSource }        from 'typeorm';
import { JwtService }        from '@nestjs/jwt';
import { ConfigService }     from '@nestjs/config';
import * as bcrypt           from 'bcryptjs';
import * as nodemailer       from 'nodemailer';

import { ConnectionName }         from '../database/constants/connection-names';
import { LoginDto, Verify2faDto } from 'src/auth/auth.dto';

@Injectable()
export class AuthService {

  private readonly logger:      Logger = new Logger(AuthService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(
    // ── MySQL infocall — login / JWT / 2FA ────────────────
    @InjectDataSource(ConnectionName.INFOCALL)
    private readonly dsInfocall: DataSource,

    // ── SQL Server campo — marcar offline al hacer logout ─
    @InjectDataSource(ConnectionName.SQLSERVER_CAMPO)
    private readonly dsCampo: DataSource,

    private readonly jwtService:    JwtService,
    private readonly configService: ConfigService,
  ) {
    this.transporter = nodemailer.createTransport({
      host:   this.configService.getOrThrow('SMTP_HOST'),
      port:   this.configService.getOrThrow<number>('SMTP_PORT'),
      secure: true,
      auth: {
        user: this.configService.getOrThrow('SMTP_USER'),
        pass: this.configService.getOrThrow('SMTP_PASSWORD'),
      },
      tls: { rejectUnauthorized: false },
    });
  }

  // ══════════════════════════════════════════════════════
  //  STEP 1 — LOGIN
  // ══════════════════════════════════════════════════════
  async login(dto: LoginDto): Promise<{ message: string }> {

    const userRows = await this.dsInfocall.query(
      `SELECT id, email, name, password
       FROM infocall.users
       WHERE email = ?
       LIMIT 1`,
      [dto.email],
    );

    if (!userRows || userRows.length === 0) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const user = userRows[0];

    const passwordValido = await bcrypt.compare(dto.password, user.password);
    if (!passwordValido) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const result = await this.dsInfocall.query(
      `CALL LOGIN_APP_CAMPO(?, ?)`,
      [dto.email, user.password],
    );

    const rows = Array.isArray(result[0]) ? result[0] : result;
    if (!rows || rows.length === 0) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const code      = this.generate2faCode();
    const expiresAt = new Date(Date.now() + 45 * 1000);

    await this.dsInfocall.query(
      `UPDATE infocall.users
       SET two_factor_code       = ?,
           two_factor_expires_at = ?,
           two_factor_verified   = 0
       WHERE email = ?`,
      [code, expiresAt, dto.email],
    );

    await this.sendCodeEmail(dto.email, user.name, code);
    this.logger.log(`Código 2FA enviado a ${dto.email}`);

    return { message: `Código de verificación enviado a ${dto.email}` };
  }

  // ══════════════════════════════════════════════════════
  //  STEP 2 — VERIFY 2FA
  // ══════════════════════════════════════════════════════
  async verify2fa(dto: Verify2faDto): Promise<{ access_token: string; user: any }> {

    const rows = await this.dsInfocall.query(
      `SELECT u.id, u.email, u.name, u.two_factor_code, u.two_factor_expires_at,
              r.slug AS perfil
       FROM infocall.users u
       LEFT JOIN role_user ru ON ru.user_id = u.id
       LEFT JOIN roles r      ON r.id = ru.role_id
       WHERE u.email = ?
       LIMIT 1`,
      [dto.email],
    );

    if (!rows || rows.length === 0) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    const user = rows[0];

    if (user.two_factor_code !== dto.code) {
      throw new BadRequestException('Código incorrecto');
    }

    const ahora  = new Date();
    const expira = new Date(user.two_factor_expires_at);
    if (ahora > expira) {
      throw new BadRequestException('El código ha expirado, solicitá uno nuevo');
    }

    const payload = {
      sub:    user.id,
      email:  user.email,
      nombre: user.name,   // ← nombre real para GPS y mapa
      perfil: user.perfil,
    };
    const access_token = this.jwtService.sign(payload);
    const jwtExpiresAt = new Date(Date.now() + 10 * 60 * 60 * 1000);

    await this.dsInfocall.query(
      `UPDATE infocall.users
       SET jwt_token           = ?,
           jwt_expires_at      = ?,
           two_factor_verified = 1,
           two_factor_code     = NULL
       WHERE email = ?`,
      [access_token, jwtExpiresAt, dto.email],
    );

    this.logger.log(`Login completo para ${dto.email}`);

    return {
      access_token,
      user: {
        id:     user.id,
        email:  user.email,
        nombre: user.name,
        perfil: user.perfil,
      },
    };
  }

  // ══════════════════════════════════════════════════════
  //  STEP 3 — LOGOUT
  //  1. Limpia JWT en infocall (MySQL)
  //  2. Marca offline en gestor_ubicacion (SQL Server)
  // ══════════════════════════════════════════════════════
  async logout(email: string): Promise<{ message: string }> {

    const userRows = await this.dsInfocall.query(
      `SELECT id FROM infocall.users WHERE email = ? LIMIT 1`,
      [email],
    );

    if (!userRows || userRows.length === 0) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    // 1. Limpiar JWT en infocall (MySQL)
    await this.dsInfocall.query(
      `UPDATE infocall.users
       SET jwt_token           = NULL,
           jwt_expires_at      = NULL,
           two_factor_verified = 0,
           two_factor_code     = NULL
       WHERE email = ?`,
      [email],
    );

    // 2. Marcar offline en BD_CR_APP (SQL Server)
    // El email en gestor_ubicacion se guarda sin @dominio
    const gestorLimpio = email.includes('@') ? email.split('@')[0] : email;
    try {
      await this.dsCampo.query(
        `UPDATE gestor_ubicacion
         SET online       = 0,
             ultimo_envio = GETDATE()
         WHERE email = @0`,
        [gestorLimpio],
      );
      this.logger.log(`Gestor ${gestorLimpio} marcado offline en BD_CR_APP`);
    } catch (error) {
      // No bloquear el logout si falla el update de ubicación
      this.logger.warn(`No se pudo marcar offline a ${gestorLimpio}: ${error.message}`);
    }

    this.logger.log(`Logout exitoso para ${email}`);
    return { message: 'Sesión cerrada correctamente' };
  }

  // ══════════════════════════════════════════════════════
  //  HELPERS PRIVADOS
  // ══════════════════════════════════════════════════════

  private generate2faCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async sendCodeEmail(
    email:  string,
    nombre: string,
    code:   string,
  ): Promise<void> {
    const fromName  = this.configService.get('SMTP_FROM_NAME');
    const fromEmail = this.configService.get('SMTP_FROM_EMAIL');

    await this.transporter.sendMail({
      from:    `"${fromName}" <${fromEmail}>`,
      to:      email,
      subject: 'Código de verificación — CR Cobranza',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 32px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #1a1a2e; margin-bottom: 8px;">Código de verificación</h2>
          <p style="color: #555; margin-bottom: 24px;">
            Hola <strong>${nombre ?? email}</strong>, usá el siguiente código para completar tu inicio de sesión en el App Campo:
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <span style="font-size: 48px; font-weight: bold; letter-spacing: 16px; color: #1a1a2e;">
              ${code}
            </span>
          </div>
          <p style="color: #888; font-size: 13px; text-align: center;">
            Este código expira en <strong>45 segundos</strong>.<br>
            Si no solicitaste este código, ignorá este mensaje.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="color: #aaa; font-size: 11px; text-align: center;">CR Cobranza · contactanos@crcobranza.com.pe</p>
        </div>
      `,
    });
  }
}