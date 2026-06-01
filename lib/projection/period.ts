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

/** "Preview" period helpers — if today is a SATURDAY or SUNDAY and the
 *  upcoming Monday is the 1st of a new month/quarter, return that upcoming
 *  period key. Otherwise return null.
 *
 *  Usage: the SPI page surfaces this preview as an extra card ABOVE the
 *  current month/quarter so the user can do their planning on the weekend
 *  instead of waiting for the Monday to roll around. */
export function previewMonthKey(now: Date = new Date()): string | null {
  const dow = now.getDay()
  // 6 = Saturday, 0 = Sunday. Only trigger on weekends.
  if (dow !== 6 && dow !== 0) return null
  const daysToMonday = dow === 6 ? 2 : 1
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToMonday)
  // Only return a preview key when that upcoming Monday is the first of a
  // new calendar month. If it's just a "normal" Monday mid-month, no preview.
  if (monday.getDate() !== 1) return null
  const y = monday.getFullYear()
  const m = String(monday.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** Same idea as `previewMonthKey` but for quarters. Only returns a key when
 *  the upcoming Monday is the start of a new QUARTER (Jan / Apr / Jul / Oct). */
export function previewQuarterKey(now: Date = new Date()): string | null {
  const monthKey = previewMonthKey(now)
  if (!monthKey) return null
  const [yearStr, monthStr] = monthKey.split('-')
  const m = parseInt(monthStr, 10)
  if (m !== 1 && m !== 4 && m !== 7 && m !== 10) return null
  const q = quarterOfMonth(m)
  return `${yearStr}-Q${q}`
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
 *  'current' (eagle) → 'Vista de Águila · workspace'
 *  '2026' → '2026'
 *  '2026-Q1' → 'Q1 2026 · Ene-Mar'
 *  '2026-03' → 'Marzo 2026' */
export function labelForPeriod(periodKey: string): string {
  if (periodKey === 'current') return 'Vista de Águila'
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
