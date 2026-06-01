/** Captura del estado de hábitos + ingresos del mes al momento de cerrar
 *  un plan mensual. Se usa cuando el usuario aprieta "Cerrar mes" en
 *  Proyección — la imagen queda guardada dentro del plan así la revisión
 *  histórica no depende de que los hábitos/transacciones sigan existiendo
 *  con la misma forma. */

import type { MonthClosureSnapshot } from './types'
import { useHabitsStore } from '@/lib/store/habitsStore'
import { useWalletStore } from '@/lib/store/walletStore'

/** Construye un snapshot para el mes indicado por `monthKey` (YYYY-MM).
 *  Lee del estado live de habitsStore y walletStore (sin suscripciones —
 *  esto se llama una sola vez al cerrar). */
export function buildMonthSnapshot(monthKey: string): MonthClosureSnapshot {
  const [yearStr, monthStr] = monthKey.split('-')
  const year = parseInt(yearStr, 10)
  const monthIdx = parseInt(monthStr, 10) - 1
  const totalDays = new Date(year, monthIdx + 1, 0).getDate()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const dateStrFor = (day: number) =>
    `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`

  // ── Hábitos ──
  const habits = useHabitsStore.getState().habits
  const habitsSnapshot: MonthClosureSnapshot['habits'] = habits.map((h) => {
    const completedSet = new Set(h.completedDates)
    const skippedSet = new Set(h.skippedDates ?? [])
    const days: MonthClosureSnapshot['habits'][number]['days'] = []
    let doneCount = 0
    let countedDays = 0
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = dateStrFor(d)
      const dayDate = new Date(year, monthIdx, d)
      dayDate.setHours(0, 0, 0, 0)
      if (dayDate.getTime() > today.getTime()) {
        days.push('future')
        continue
      }
      if (skippedSet.has(dateStr)) { days.push('skipped'); continue }
      if (completedSet.has(dateStr)) { days.push('done'); doneCount++; countedDays++; continue }
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

  // ── Ingresos ──
  // Agrupados por código de moneda. Filtramos transacciones tipo income
  // cuya fecha caiga en este mes.
  const transactions = useWalletStore.getState().transactions
  const incomeMap = new Map<string, { total: number; count: number }>()
  for (const tx of transactions) {
    if (tx.type !== 'income') continue
    if (!tx.date || !tx.date.startsWith(`${yearStr}-${monthStr}`)) continue
    const existing = incomeMap.get(tx.currencyCode) ?? { total: 0, count: 0 }
    existing.total += tx.amount
    existing.count += 1
    incomeMap.set(tx.currencyCode, existing)
  }
  const income = Array.from(incomeMap.entries())
    .map(([currencyCode, v]) => ({ currencyCode, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total)

  return {
    habits: habitsSnapshot,
    income,
    capturedAt: new Date().toISOString(),
  }
}
