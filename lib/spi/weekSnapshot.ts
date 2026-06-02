/** Captura del estado de hábitos de una semana SPI al cerrarla.
 *  Espejo de `buildMonthSnapshot` pero con horizonte de 7 días (Sáb→Vie)
 *  y sin ingresos (eso lo cubre el cierre mensual). */

import type { WeekClosureSnapshot, SPISession } from './types'
import type { KPISnapshot } from '@/lib/kpi/types'
import { useHabitsStore } from '@/lib/store/habitsStore'
import { useKpisStore, kpiCompletionPct } from '@/lib/store/kpisStore'
import { readKpiValue, readKpiTargetOverride } from '@/lib/kpi/sessionHelpers'

function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Construye un snapshot para la semana cuyo sábado es `weekStartDate`
 *  (formato YYYY-MM-DD). Lee del estado live de habitsStore (sin
 *  suscripciones — se llama una sola vez al cerrar la sesión, o desde
 *  el container live cuando no hay snapshot guardado). */
export function buildWeekSnapshot(
  weekStartDate: string,
  session?: SPISession,
): WeekClosureSnapshot {
  const [yStr, mStr, dStr] = weekStartDate.split('-').map(Number)
  const sat = new Date(yStr, mStr - 1, dStr)
  sat.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Pre-computamos los 7 strings de fecha Sáb→Vie de una.
  const dateStrs: string[] = []
  const dateObjs: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(sat)
    d.setDate(sat.getDate() + i)
    d.setHours(0, 0, 0, 0)
    dateObjs.push(d)
    dateStrs.push(dateToStr(d))
  }

  // ── Hábitos ──
  const habits = useHabitsStore.getState().habits
  const habitsSnapshot: WeekClosureSnapshot['habits'] = habits.map((h) => {
    const completedSet = new Set(h.completedDates)
    const skippedSet = new Set(h.skippedDates ?? [])
    const days: WeekClosureSnapshot['habits'][number]['days'] = []
    let doneCount = 0
    let countedDays = 0
    for (let i = 0; i < 7; i++) {
      if (dateObjs[i].getTime() > today.getTime()) {
        days.push('future')
        continue
      }
      if (skippedSet.has(dateStrs[i])) { days.push('skipped'); continue }
      if (completedSet.has(dateStrs[i])) { days.push('done'); doneCount++; countedDays++; continue }
      days.push('missed'); countedDays++
    }
    const completionPct = countedDays > 0 ? Math.round((doneCount / countedDays) * 100) : 0
    return {
      id: h.id,
      name: h.name,
      icon: h.icon,
      color: h.color,
      days,
      completionPct,
    }
  })

  // ── KPIs ──
  // Solo snapshoteamos los KPIs que el usuario "activó" para esta semana
  // vía `session.selectedKpiIds`. El valor se lee de session.values.kpis;
  // el target prioriza el override per-session sobre el de la library.
  let kpiSnapshot: KPISnapshot[] | undefined
  if (session && Array.isArray(session.selectedKpiIds) && session.selectedKpiIds.length > 0) {
    const library = useKpisStore.getState().definitions
    const libById = new Map(library.map((k) => [k.id, k]))
    kpiSnapshot = session.selectedKpiIds
      .map((kpiId) => {
        const def = libById.get(kpiId)
        if (!def) return null  // KPI fue borrado de la library; no podemos snapshotear sin meta
        const value = readKpiValue(session, kpiId, def.kind)
        const override = readKpiTargetOverride(session, kpiId)
        const target = override ?? def.target
        const pct = kpiCompletionPct(value, target, def.kind)
        const snap: KPISnapshot = {
          id: def.id,
          name: def.name,
          icon: def.icon,
          color: def.color,
          kind: def.kind,
          group: def.group,
          areaKey: def.areaKey,
          target,
          value,
          completionPct: pct ?? undefined,
        }
        return snap
      })
      .filter((s): s is KPISnapshot => s !== null)
  }

  return {
    habits: habitsSnapshot,
    weekStartDate,
    capturedAt: new Date().toISOString(),
    kpis: kpiSnapshot,
  }
}
