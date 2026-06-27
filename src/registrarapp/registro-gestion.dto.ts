import {
  IsArray, IsNotEmpty, IsNumber,
  IsOptional, IsString, ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── Gestion individual por cuenta ─────────────────────────
export class GestionItemDto {

  @IsNumber()
  id_cliente_asig: number;        // ID de clientes_asignados

  @IsString() @IsNotEmpty()
  clasificacion: string;          // codigo del estado

  @IsString() @IsOptional()
  comentario?: string;

  // ── Fecha de gestión (datetime) ───────────────────────
  @IsString() @IsOptional()
  fecha_gest?: string;            // formato: YYYY-MM-DD HH:mm:ss

  // ── Coordenadas foto ──────────────────────────────────
  @IsOptional() foto_lat?:       number;
  @IsOptional() foto_lon?:       number;
  @IsOptional() foto_precision?: number;

  // ── Coordenadas registro ──────────────────────────────
  @IsOptional() reg_lat?:       number;
  @IsOptional() reg_lon?:       number;
  @IsOptional() reg_precision?: number;

  // ── Campos adicionales ────────────────────────────────
  @IsString() @IsOptional() direccion_adicional?: string;
  @IsString() @IsOptional() telefono_adicional?:  string;
  @IsString() @IsOptional() encargado_pago?:      string;

  // ── Promesa de pago (por cuenta) ─────────────────────
  @IsOptional()
  @Type(() => Number)
  monto_pdp?: number;

  @IsString() @IsOptional()
  fecha_pdp?: string;             // YYYY-MM-DD
}

// ── Body principal ────────────────────────────────────────
export class RegistrarGestionesDto {

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GestionItemDto)
  gestiones: GestionItemDto[];

  // ── Imagen opcional (base64) ──────────────────────────
  @IsString() @IsOptional()
  imagen_base64?: string;

  @IsString() @IsOptional()
  imagen_extension?: string;      // 'jpg' | 'png' | 'jpeg' (default: 'jpg')

  // ── Coordenadas de la foto (para gestion_imagenes) ────
  @IsOptional() foto_lat?: number;
  @IsOptional() foto_lon?: number;

  @IsString()
  nombre: string;
}