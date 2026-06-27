import { IsString, IsNumber, IsArray, ValidateNested, IsNotEmpty, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { RegistroConfirmar } from 'src/upload/carga.interface';

export class RegistroConfirmarDto implements RegistroConfirmar {
  @IsNotEmpty() keys:             Record<string, string>;
  @IsString()   @IsNotEmpty() asesor:           string;
                datosEncontrados: Record<string, any>;
}

// confirmar-carga.dto.ts
export class ConfirmarCargaDto {
  @IsString()  @IsNotEmpty() campaignId:    string;

  @IsOptional()
  @IsNumber()               campaignIntId?: number;   // ← opcional

  @IsString()  @IsNotEmpty() nombreArchivo: string;
  @IsString()  @IsNotEmpty() usuarioCarga:  string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RegistroConfirmarDto)
  registros: RegistroConfirmarDto[];
}