import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, ArrayMinSize } from 'class-validator';

// ── Reasignar clientes ────────────────────────────────────
export class ReasignarClientesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  ids: number[];

  @IsString() @IsNotEmpty()
  usuario_nuevo: string;

  @IsString() @IsNotEmpty()
  nombre_nuevo: string;

  @IsString() @IsOptional()
  motivo?: string;

  @IsString() @IsOptional()
  usuario_admin?: string;    // ← agregar esta línea
}
// ── Cambiar estado (desactivar / reactivar) ───────────────
export class CambiarEstadoDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  ids: number[];             // IDs de clientes_asignados

  @IsString() @IsNotEmpty()
  estado: 'DESACTIVADO' | 'ACTIVO';  // estado destino
}


// gestion-clientes.dto.ts
export class ImportarFilaDto {
  id:     number;
  gestor: string;
  estado: string;
}

export class ImportarClientesDto {
  filas: ImportarFilaDto[];
  usuario_admin: string;
}