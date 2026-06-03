/** Helpers para leer/escribir valores y target-overrides de KPIs dentro
 *  de una SPISession. Centraliza las claves reservadas en
 *  `session.values` así no quedan strings sueltas en componentes. */

import type { SPISession } from '@/lib/spi/types'
import type { KPIKind } from '@/lib/kpi/types'
import { parseKpiValue } from '@/lib/store/kpisStore'

const KPI_VALUES_KEY = 'kpis'
const KPI_TARGETS_KEY = 'kpiTargets'

/** Lee el valor que el usuario cargó esta semana para un KPI. Devuelve
 *  el número parseado según el `kind`; 0 si no hay valor. */
export function readKpiValue(session: SPISession, kpiId: string, kind: KPIKind): number {
  const raw = session.values?.[KPI_VALUES_KEY]?.[kpiId] ?? ''
  return parseKpiValue(raw, kind)
}

/** Lee el target override para esta semana (si el usuario lo cambió).
 *  Devuelve undefined si no hay override — el caller debe usar el de la
 *  library en ese caso. */
export function readKpiTargetOverride(session: SPISession, kpiId: string): number | undefined {
  const raw = session.values?.[KPI_TARGETS_KEY]?.[kpiId] ?? ''
  if (!raw) return undefined
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : undefined
}

/** Clave del valor en session.values — para pasarla a onValueChange. */
export const KPI_VALUES_SECTION = KPI_VALUES_KEY
export const KPI_TARGETS_SECTION = KPI_TARGETS_KEY

/** Suma los valores semanales de un KPI a lo largo de todas las sesiones
 *  SPI que caen dentro del rango [startDate, hoy]. Para sesiones cerradas
 *  usamos el snapshot congelado (más confiable); para sesiones abiertas o
 *  cerradas sin snapshot leemos del `session.values` live.
 *
 *  Se usa para calcular el progreso ACUMULADO del KPI contra su
 *  `cumulativeTarget` (meta total de largo plazo, ej. "300 sesiones").
 *
 *  @param kpiId        el id del KPI a sumar.
 *  @param kind         'count' | 'percent' | 'boolean' — para parsear el value.
 *  @param sessions     todas las sesiones SPI del store.
 *  @param startDate    YYYY-MM-DD — sesiones con weekStartDate ANTERIOR
 *                      a esta fecha se ignoran. */
export function sumCumulativeKpi(
  kpiId: string,
  kind: KPIKind,
  sessions: SPISession[],
  startDate: string,
): number {
  let total = 0
  for (const sess of sessions) {
    if (sess.weekStartDate < startDate) continue
    // Preferir snapshot si existe (es lo "oficial" del cierre).
    const snap = sess.weekSnapshot?.kpis?.find((k) => k.id === kpiId)
    if (snap) {
      total += snap.value
    } else {
      // Sesión abierta o cerrada sin snapshot — leer del live.
      total += readKpiValue(sess, kpiId, kind)
    }
  }
  return total
}

/** Calcula dónde DEBERÍAS ir a esta altura si tuvieras que llegar a
 *  `cumulativeTarget` para la fecha `deadline`, asumiendo ritmo lineal
 *  desde `startDate`. Devuelve un valor entero.
 *
 *  Edge cases:
 *   - Si hoy es ≥ deadline → devuelve cumulativeTarget (deberías estar
 *     en 100% o pasado).
 *   - Si hoy es ≤ startDate → devuelve 0 (aún no arrancaste el plan).
 *   - Si deadline = startDate → devuelve cumulativeTarget (ya tendría
 *     que estar cumplido — usuario raro pero no rompemos). */
export function expectedCumulativeByNow(
  cumulativeTarget: number,
  startDate: string,
  deadline: string,
  todayYmd: string,
): number {
  if (todayYmd >= deadline) return cumulativeTarget
  if (todayYmd <= startDate) return 0
  // Días totales del plan vs días transcurridos. Usamos string compare
  // primero para early-exit, después calculamos en milliseconds para
  // ser exactos en la división.
  const dayMs = 86400000
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [dy, dm, dd] = deadline.split('-').map(Number)
  const [ty, tm, td] = todayYmd.split('-').map(Number)
  const startMs = Date.UTC(sy, sm - 1, sd)
  const endMs   = Date.UTC(dy, dm - 1, dd)
  const nowMs   = Date.UTC(ty, tm - 1, td)
  const totalDays    = (endMs - startMs) / dayMs
  const elapsedDays  = (nowMs   - startMs) / dayMs
  if (totalDays <= 0) return cumulativeTarget
  return Math.round((cumulativeTarget * elapsedDays) / totalDays)
}
