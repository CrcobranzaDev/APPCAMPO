// ══════════════════════════════════════════════════════════
//  CAMPAIGN COLUMNS CONFIG
//  Solo define qué columna_etiqueta mostrar por campaña.
//  El mapeo etiqueta → columna real lo hace T_Columnas2.
//
//  ¿Cómo agregar una nueva campaña?
//    1. Agregar el nombre de campaña con su lista de etiquetas
//    2. Listo — no hay que tocar ningún otro archivo
// ══════════════════════════════════════════════════════════

// ── Etiquetas compartidas por las campañas Santander ─────
const ETIQUETAS_SANTANDER: string[] = [
  'NUM_DOCUMENTO',
  'NUM_CUENTA',
  'NOMBRE TITULAR',
  'DISTRITO',
  'MONTO_TOTAL',
  'DIRECCION DOMICILIO',
  'VALI_PLACA_AUTO',
  'MODELO',
  'TRAMO',
  'PRODUCTO',
];

// ── ETIQUETAS FIJAS POR CAMPAÑA ───────────────────────────
export const CAMPAIGN_ETIQUETAS: Record<string, string[]> = {

  // ── MAFT2T3 ──────────────────────────────────────────
  MAFT2T3: [
    'NUM_DOCUMENTO',
    'CONCATENADO',
    'CLIENTE',
    'DISTRITO_LEGAL',
    'MONT_CUOTA_BASE_DOL',
    'DIRECCION_LEGAL',
    'PLACA',
    'DESCRIPCION_VEHICULO',
    'TRAMO',
    'TIPO_CREDITO',
    'CICLO',
  ],

  // ── SANTANDER ────────────────────────────────────────
  SANT1: ETIQUETAS_SANTANDER,
  SANT2: ETIQUETAS_SANTANDER,
  SANT3: ETIQUETAS_SANTANDER,

  // ── NUEVA CAMPAÑA (ejemplo de cómo agregar) ──────────
  // NUEVA_CAMPAÑA: [
  //   'NUM_DOCUMENTO',
  //   'NOMBRE_TITULAR',
  //   'MONTO_TOTAL',
  // ],

};

// ── ETIQUETAS POR DEFECTO si la campaña no está configurada ──
export const DEFAULT_ETIQUETAS: string[] = [
  'NUM_DOCUMENTO',
  'NUM_CUENTA',
];

// ── Helper para obtener etiquetas de una campaña ──────────
export function getEtiquetasByCampaign(campaignId: string): string[] {
  return CAMPAIGN_ETIQUETAS[campaignId.toUpperCase()] ?? DEFAULT_ETIQUETAS;
}