// ══════════════════════════════════════════════════════════
//  CAMPAIGN FIELD MAP CONFIG
//  src/asignacionapp/services/campaign-field-map.config.ts
// ══════════════════════════════════════════════════════════

export interface CampaignFieldMap {
  documento?:   string;
  cuenta?:      string;
  cliente?:     string;
  distrito?:    string;
  direccion?:   string;
  tramo?:       string;
  total_venci?: string;
  ext_txt1?: string; ext_txt2?: string; ext_txt3?: string;
  ext_txt4?: string; ext_txt5?: string;
  ext_num1?: string; ext_num2?: string; ext_num3?: string;
  ext_num4?: string; ext_num5?: string;
  ext_fec1?: string; ext_fec2?: string; ext_fec3?: string;
  ext_fec4?: string; ext_fec5?: string;
}

export const DEFAULT_FIELD_MAP: Required<Pick<
  CampaignFieldMap,
  'documento' | 'cuenta' | 'cliente' | 'distrito' | 'direccion' | 'tramo' | 'total_venci'
>> = {
  documento:   'NUM_DOCUMENTO',
  cuenta:      'CONCATENADO',
  cliente:     'CLIENTE',
  distrito:    'DISTRITO_LEGAL',
  direccion:   'DIRECCION_LEGAL',
  tramo:       'TRAMO',
  total_venci: 'MONT_CUOTA_BASE_DOL',
};

// ── Campos compartidos Santander ──────────────────────────
const SANTANDER_FIELDS: CampaignFieldMap = {
  // Fijos que difieren del default
  cuenta:      'NUM_CUENTA',
  cliente:     'NOMBRE TITULAR',
  distrito:    'DISTRITO',
  direccion:   'DIRECCION DOMICILIO',
  total_venci: 'MONTO_TOTAL',
  // Ext
  ext_txt1: 'VALI_PLACA_AUTO',
  ext_txt2: 'MODELO',
  ext_txt3: 'PRODUCTO',
};

export const CAMPAIGN_FIELD_MAP: Record<string, CampaignFieldMap> = {

  MAFT2T3: {
    ext_txt1: 'PLACA',
    ext_txt2: 'DESCRIPCION_VEHICULO',
    ext_txt3: 'TIPO_CREDITO',
  },

  SANT1: SANTANDER_FIELDS,
  SANT2: SANTANDER_FIELDS,
  SANT3: SANTANDER_FIELDS,

};

export function getCampaignFieldMap(campaignId: string): CampaignFieldMap {
  return CAMPAIGN_FIELD_MAP[campaignId.toUpperCase()] ?? {};
}

// Retorna solo los campos fijos que difieren del default
export function getFijosOverride(campaignId: string): Partial<typeof DEFAULT_FIELD_MAP> {
  const map   = getCampaignFieldMap(campaignId);
  const fijos: Partial<typeof DEFAULT_FIELD_MAP> = {};
  const keys  = ['documento','cuenta','cliente','distrito','direccion','tramo','total_venci'] as const;
  for (const key of keys) {
    if (map[key]) fijos[key] = map[key];
  }
  return fijos;
}