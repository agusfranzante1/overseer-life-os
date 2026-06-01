/** Captura del estado de hábitos de una semana SPI al cerrarla.
 *  Espejo de `buildMonthSnapshot` pero con horizonte de 7 días (Sáb→Vie)
 *  y sin ingresos (eso lo cubre el cierre mensual). */

import type { WeekClosureSnapshot } from './types'
import { useHabitsStore } from '@/lib/store/habitsStore'

function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Construye un snapshot para la semana cuyo sábado es `weekStartDate`
 *  (formato YYYY-MM-DD). Lee del estado live de habitsStore (sin
 *  suscripciones — se llama una sola vez al cerrar la sesión, o desde
 *  el container live cuando no hay snapshot guardado). */
export function buildWeekSnapshot(weekStartDate: string): WeekClosureSnapshot {
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

  return {
    habits: habitsSnapshot,
    weekStartDate,
    capturedAt: new Date().toISOString(),
  }
}
