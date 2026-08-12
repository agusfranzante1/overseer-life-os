/**
 * Tests del invariante de tiempo del calendario. Correr con:
 *   ./node_modules/.bin/tsx lib/calendar/timeMath.test.ts
 *
 * Blindan contra la regresión del "bloque que empezaba 5 min corrido".
 */
import { snapDeltaMinutes, toLocalISO } from './timeMath'

let passed = 0
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error('FALLÓ: ' + msg)
  passed++
}

// ── snapDeltaMinutes: el delta SIEMPRE es múltiplo de step ──────────────────
const HOUR_PX = 52 // el valor real del componente (no divide limpio a propósito)
for (let px = -200; px <= 200; px += 1) {
  const d = snapDeltaMinutes(px, HOUR_PX)
  assert(d % 15 === 0, `delta ${d} para ${px}px no es múltiplo de 15`)
}

// Un evento en :00 movido cualquier cantidad de píxeles cae en un borde limpio.
// (deltaMin múltiplo de 15 sumado a un minuto :00 → sigue en :00/:15/:30/:45.)
for (let px = -200; px <= 200; px += 7) {
  const base = new Date(2026, 0, 15, 16, 0, 0) // 16:00 exacto
  const moved = new Date(base.getTime() + snapDeltaMinutes(px, HOUR_PX) * 60_000)
  assert([0, 15, 30, 45].includes(moved.getMinutes()), `16:00 + ${px}px → :${moved.getMinutes()} (no es borde limpio)`)
}

// Desplazamiento chico dentro de la zona muerta (< 7.5 min equivalentes) → 0.
assert(snapDeltaMinutes(0, HOUR_PX) === 0, 'offset 0 debe dar 0')
assert(snapDeltaMinutes(3, HOUR_PX) === 0, '3px (~3.5min) redondea a 0')
// ~13px ≈ 15min → snapea a 15.
assert(snapDeltaMinutes(13, HOUR_PX) === 15, '13px debe snapear a 15min')
assert(snapDeltaMinutes(-13, HOUR_PX) === -15, '-13px debe snapear a -15min')
// hourPx inválido no explota.
assert(snapDeltaMinutes(50, 0) === 0, 'hourPx 0 → 0 (sin división por cero)')

// ── toLocalISO: formato y round-trip ────────────────────────────────────────
const dt = new Date(2026, 7, 12, 16, 0, 0) // 12 ago 2026 16:00 local
const iso = toLocalISO(dt)
assert(/^2026-08-12T16:00:00[+-]\d{2}:\d{2}$/.test(iso), `formato inesperado: ${iso}`)
// Round-trip: parsear el ISO (que lleva offset) da el MISMO instante.
assert(new Date(iso).getTime() === dt.getTime(), 'round-trip de toLocalISO no preserva el instante')
// Los minutos se preservan exactos (no hay corrimiento).
assert(toLocalISO(new Date(2026, 7, 12, 16, 5, 0)).includes('T16:05:00'), '16:05 debe serializar 16:05')

console.log(`✅ timeMath: ${passed} asserts OK`)
