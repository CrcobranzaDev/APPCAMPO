// ── Metadata de T_Columnas_mask (BD_CR_MAESTRA) ──────────────────────────────
export interface ColMaskMeta {
  columna:           string;  // columna en FR_MASCARA   (ej: cnum_cuenta)
  columna_etiqueta:  string;  // header en el Excel      (ej: NUM_CUENTA)
}

// ── Metadata de campaign_columns_meta (BD_CR_APP) ────────────────────────────
export interface ColCampoMeta {
  columna_fisica:   string;
  columna_origen:   string;
  columna_etiqueta: string;
  orden:            number;
  es_llave:         boolean;
}

// ── Mapas de traducción construidos en runtime ────────────────────────────────
export interface CampaniaMaps {
  etiquetaToFr:  Map<string, string>;   // Excel header → FR_MASCARA col
  frToFisica:    Map<string, string>;   // FR_MASCARA col → clientes_asignados col
  keyFrCols:     string[];              // columnas de FR_MASCARA que forman la llave
}

// ── Fila del Excel normalizada a nombres de FR_MASCARA ───────────────────────
export interface FilaExcelNormalizada {
  keys:      Record<string, string>;
  excelData: Record<string, string>;  // ← todos los campos del Excel
  asesor:    string;
}

// ── Registro devuelto en el preview ──────────────────────────────────────────
export interface RegistroPreview {
  keys:             Record<string, string>;
  excelData:        Record<string, string>;  // ← agregar
  asesor:           string;
  encontrado:       boolean;
  datosEncontrados: Record<string, any> | null;
}

export interface PreviewResult {
  totalExcel:         number;
  totalEncontrados:   number;
  totalNoEncontrados: number;
  columnas: {
    frCol:          string | null;
    fisica:         string;
    etiqueta:       string;
    columna_origen: string;
  }[];
  registros: RegistroPreview[];
}
// ── Registro que el frontend manda al confirmar ───────────────────────────────
export interface RegistroConfirmar {
  keys:             Record<string, string>;
  asesor:           string;
  datosEncontrados: Record<string, any>;
}
