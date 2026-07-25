// gps.config.ts — Parámetros ajustables del servicio GPS
// Todo lo que podrías querer tunear sin tocar la lógica está aquí.

export const GPS_CONFIG = {
  // ── Sincronización a BD ─────────────────────────────────────
  SYNC_INTERVAL_SEG: 30, // guardar en BD como máx cada 30s (throttle online)

  // ── Detección de offline ────────────────────────────────────
  OFFLINE_TIMEOUT_MS: 130_000, // 130s sin pings = offline
  CHECK_OFFLINE_MS: 30_000, // revisar inactividad cada 30s

  // ── Filtro de ruido del odómetro (en km) ───────────────────
  ODOMETRO_MIN_KM: 0.005, // <5m = GPS saltarín estando quieto, ignorar
  ODOMETRO_MAX_KM: 1.5, // >1.5km entre pings = salto falso de torre, ignorar

  // ── Validación de timestamp ─────────────────────────────────
  DESFASE_MAX_MIN: 720, // >12h de desfase = reloj del teléfono roto, usar hora servidor

  // ── Integración con microservicio Python ────────────────────
  PYTHON_URL: 'http://localhost:8001',
  PYTHON_ENABLED: false, // ← poner true cuando Python esté corriendo
};