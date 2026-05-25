/** Period key helpers for Proyección.
 *  All operations work on canonical sortable strings — no Date juggling
 *  in components, no timezone-related bugs. */

export type Quarter = 1 | 2 | 3 | 4

/** Returns current year as YYYY string. */
export function currentYearKey(now: Date = new Date()): string {
  return String(now.getFullYear())
}

/** Returns the current quarter key (YYYY-QN). */
export function currentQuarterKey(now: Date = new Date()): string {
  const y = now.getFullYear()
  const q = quarterOfMonth(now.getMonth() + 1)
  return `${y}-Q${q}`
}

/** Returns current month key (YYYY-MM). */
export function currentMonthKey(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** Map a calendar month (1-12) to its quarter (1-4). */
export function quarterOfMonth(month: number): Quarter {
  if (month <= 3) return 1
  if (month <= 6) return 2
  if (month <= 9) return 3
  return 4
}

/** Months that belong to a given quarter, as YYYY-MM keys. */
export function quarterMonths(quarterKey: string): string[] {
  const [yearStr, qStr] = quarterKey.split('-Q')
  const y = parseInt(yearStr, 10)
  const q = parseInt(qStr, 10) as Quarter
  const startMonth = (q - 1) * 3 + 1
  return [0, 1, 2].map((offset) => `${y}-${String(startMonth + offset).padStart(2, '0')}`)
}

/** Year that contains a given quarter key. */
export function yearOfQuarter(quarterKey: string): string {
  return quarterKey.split('-Q')[0]
}

/** Quarter that contains a given month key. */
export function quarterOfMonthKey(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-')
  const m = parseInt(monthStr, 10)
  return `${yearStr}-Q${quarterOfMonth(m)}`
}

/** Year that contains a given month key. */
export function yearOfMonth(monthKey: string): string {
  return monthKey.split('-')[0]
}

/** Given an SPI session's weekStartDate (YYYY-MM-DD), return its month key. */
export function monthOfSpiWeek(weekStartDate: string): string {
  const [y, m] = weekStartDate.split('-')
  return `${y}-${m}`
}

/** Human-readable label for any period key.
 *  '2026' → '2026'
 *  '2026-Q1' → 'Q1 2026 · Ene-Mar'
 *  '2026-03' → 'Marzo 2026' */
export function labelForPeriod(periodKey: string): string {
  // Year
  if (/^\d{4}$/.test(periodKey)) return periodKey
  // Quarter
  if (/^\d{4}-Q[1-4]$/.test(periodKey)) {
    const [y, qStr] = periodKey.split('-Q')
    const q = parseInt(qStr, 10) as Quarter
    const rangeLabels: Record<Quarter, string> = {
      1: 'Ene-Mar',
      2: 'Abr-Jun',
      3: 'Jul-Sep',
      4: 'Oct-Dic',
    }
    return `Q${q} ${y} · ${rangeLabels[q]}`
  }
  // Month
  if (/^\d{4}-\d{2}$/.test(periodKey)) {
    const [yStr, mStr] = periodKey.split('-')
    const y = parseInt(yStr, 10)
    const m = parseInt(mStr, 10) - 1
    const date = new Date(y, m, 1)
    const monthName = date.toLocaleDateString('es-AR', { month: 'long' })
    return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${y}`
  }
  return periodKey
}

/** Step a period key forward/backward by one unit.
 *  Year: ±1 year. Quarter: ±1 quarter (wraps year). Month: ±1 month (wraps year). */
export function shiftPeriod(periodKey: string, delta: number): string {
  if (/^\d{4}$/.test(periodKey)) {
    return String(parseInt(periodKey, 10) + delta)
  }
  if (/^\d{4}-Q[1-4]$/.test(periodKey)) {
    const [yStr, qStr] = periodKey.split('-Q')
    let y = parseInt(yStr, 10)
    let q = parseInt(qStr, 10) + delta
    while (q < 1) { q += 4; y -= 1 }
    while (q > 4) { q -= 4; y += 1 }
    return `${y}-Q${q}`
  }
  if (/^\d{4}-\d{2}$/.test(periodKey)) {
    const [yStr, mStr] = periodKey.split('-')
    let y = parseInt(yStr, 10)
    let m = parseInt(mStr, 10) + delta
    while (m < 1)  { m += 12; y -= 1 }
    while (m > 12) { m -= 12; y += 1 }
    return `${y}-${String(m).padStart(2, '0')}`
  }
  return periodKey
}
