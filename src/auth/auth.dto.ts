import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

// ══════════════════════════════════════════════════════════
//  AUTH DTOs
// ══════════════════════════════════════════════════════════

// ── POST /auth/login ──────────────────────────────────────
export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

// ── POST /auth/verify-2fa ─────────────────────────────────
export class Verify2faDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @Length(6, 6)
  @IsNotEmpty()
  code: string;
}
