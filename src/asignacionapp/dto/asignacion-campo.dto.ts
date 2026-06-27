import { IsString, IsNotEmpty, IsNumber, IsArray } from 'class-validator';

export class AgenteDto {
  @IsString() @IsNotEmpty()
  correo: string;

  @IsString() @IsNotEmpty()
  nombre: string;
}

export class AsignarClientesDto {
  @IsString() @IsNotEmpty()
  campaignId: string;

  agente: AgenteDto;

  @IsNumber()
  totalClientes: number;

  @IsArray()
  clientes: any[];
}

export interface AsignacionResultDto {
  campaignId:  string;
  agente:      string;
  insertados:  number;
  fallidos:    number;
  mensaje:     string;
}