/** Aritmética de la semana del SPI. Puro, sin base de datos, con test.
 *
 *  Existe por un motivo que se paga caro si se adivina: **la semana del SPI
 *  arranca el SÁBADO**, no el lunes. Una sesión anclada al sábado X es la que
 *  planifica la semana **lunes X+2 → domingo X+8**.
 *
 *  Es la misma cuenta que hace `lastSaturdayYmd` en `lib/store/spiStore.ts`.
 *  Está duplicada acá a propósito: ese archivo es `'use client'` y arrastra
 *  Zustand entero, que del lado server no se puede importar. Si allá cambia,
 *  acá tiene que cambiar — el test fija el contrato.
 */

/** El sábado al que pertenece la sesión de esta fecha. Si hoy ES sábado,
 *  devuelve hoy; si no, retrocede al sábado anterior. */
export function lastSaturdayYmd(now: Date = new Date()): string {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0 domingo … 6 sábado
  const diff = day === 6 ? 0 : day + 1 // dom=1, lun=2, …, vie=6
  d.setDate(d.getDate() - diff)
  return ymd(d)
}

/** La semana que PLANIFICA una sesión anclada a `weekStartDate` (un sábado):
 *  del lunes siguiente al domingo de esa semana. */
export function spiPlannedWeek(weekStartDate: string): { from: string; to: string } {
  const sat = parseYmd(weekStartDate)
  const mon = new Date(sat)
  mon.setDate(sat.getDate() + 2)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return { from: ymd(mon), to: ymd(sun) }
}

/** `true` si el string es un YYYY-MM-DD real (no "2026-02-31" ni "hoy"). */
export function isYmd(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = parseYmd(s)
  return !Number.isNaN(d.getTime()) && ymd(d) === s
}

/** Valida que la fecha sea un SÁBADO. Anclar una sesión a otro día la deja
 *  invisible en la app: los renderers buscan por el sábado. */
export function isSaturday(weekStartDate: string): boolean {
  return isYmd(weekStartDate) && parseYmd(weekStartDate).getDay() === 6
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
