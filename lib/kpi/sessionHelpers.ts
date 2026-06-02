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
