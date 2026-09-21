// dto/resultado-carga.dto.ts
export class ResultadoCargaDto {
  totalFilas: number;
  insertados: number;
  actualizados: number;
  errores: { fila: number; motivo: string }[];
}