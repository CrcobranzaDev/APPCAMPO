// dtos/filter.dto.ts
import { 
  IsString, 
  IsArray, 
  ValidateNested, 
  IsOptional, 
  IsIn, 
  IsNumber, 
  Min,
  IsNotEmpty 
} from 'class-validator';
import { Type } from 'class-transformer';

export class FilterItem {
  @IsString()
  @IsNotEmpty()
  etiqueta: string;

  // ✅ CRÍTICO: No agregar validadores aquí porque puede ser string, number, array
  valor: any;

  @IsOptional()
  @IsString()
  operador?: string;

  @IsOptional()
  @IsIn(['AND', 'OR'])
  operadorLogico?: 'AND' | 'OR';

  @IsOptional()
  @IsNumber()
  @Min(0)
  abrirParentesis?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cerrarParentesis?: number;
}

export class BuscarConFiltrosDto {
  @IsString()
  @IsNotEmpty()
  campaignId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterItem)
  filtros: FilterItem[];

  @IsOptional()
  @IsString()
  fechaCargaDesde?: string;

  @IsOptional()
  @IsString()
  fechaCargaHasta?: string;
}