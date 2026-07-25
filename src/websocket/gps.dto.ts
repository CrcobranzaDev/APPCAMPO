// gps.dto.ts — Tipado de los mensajes que llegan del teléfono

export interface UbicacionMsg {
  type: 'ubicacion';
  lat: number;
  lng: number;
  precision?: number;
  timestamp?: number; // epoch millis de captura GPS (NUEVO)
}

export interface PingMsg {
  type: 'ping';
}

export type GestorMsg = UbicacionMsg | PingMsg | { type: string; [k: string]: any };

// Ping individual dentro de un lote offline
export interface PingLoteDto {
  lat: number;
  lng: number;
  precision?: number;
  timestamp: number; // epoch millis de captura — obligatorio en lote
}

// Body del endpoint /gpes/sync-lote
export interface SyncLoteDto {
  pings: PingLoteDto[];
}