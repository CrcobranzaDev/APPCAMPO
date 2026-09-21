// dto/crear-lista-negra.dto.ts
import { IsString, IsInt, IsIn, MaxLength } from 'class-validator';

export class CrearListaNegraDto {
  @IsString()
  @MaxLength(20)
  documento: string;

  @IsString()
  @MaxLength(20)
  campaingId: string;

  @IsInt()
  @IsIn([0, 1])
  act: number;
}


export class VerificarBloqueoDto {
  @IsString()
  @MaxLength(20)
  documento: string;

  @IsString()
  @MaxLength(20)
  campaingId: string;
}