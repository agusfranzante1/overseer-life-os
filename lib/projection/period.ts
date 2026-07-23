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

/** Semestre calendario: H1 = Ene-Jun, H2 = Jul-Dic. Key = 'YYYY-H1' | 'YYYY-H2'. */
export type Semester = 1 | 2
export function currentSemesterKey(now: Date = new Date()): string {
  const h = now.getMonth() < 6 ? 1 : 2
  return `${now.getFullYear()}-H${h}`
}
/** Semestre (1|2) que contiene un mes (1-12). */
export function semesterOfMonth(month: number): Semester {
  return month <= 6 ? 1 : 2
}
/** Los 2 semestres de un año, como keys YYYY-HN. */
export function semestersOfYear(yearKey: string): string[] {
  return [`${yearKey}-H1`, `${yearKey}-H2`]
}
/** Los 2 trimestres que pertenecen a un semestre (YYYY-QN). */
export function quartersOfSemester(semesterKey: string): string[] {
  const [y, hStr] = semesterKey.split('-H')
  const h = parseInt(hStr, 10) as Semester
  const startQ = h === 1 ? 1 : 3
  return [`${y}-Q${startQ}`, `${y}-Q${startQ + 1}`]
}
/** Semestre que contiene un quarter key (YYYY-QN → YYYY-HN). */
export function semesterOfQuarterKey(quarterKey: string): string {
  const [y, qStr] = quarterKey.split('-Q')
  const q = parseInt(qStr, 10)
  return `${y}-H${q <= 2 ? 1 : 2}`
}
/** Semestre que contiene un month key (YYYY-MM → YYYY-HN). */
export function semesterOfMonthKey(monthKey: string): string {
  const [y, mStr] = monthKey.split('-')
  return `${y}-H${semesterOfMonth(parseInt(mStr, 10))}`
}
/** Año que contiene un semester key. */
export function yearOfSemester(semesterKey: string): string {
  return semesterKey.split('-H')[0]
}
/** Preview del próximo semestre si el lunes que viene arranca uno nuevo. */
export function previewSemesterKey(now: Date = new Date()): string | null {
  const monthKey = previewMonthKey(now)
  if (!monthKey) return null
  const [yearStr, monthStr] = monthKey.split('-')
  const m = parseInt(monthStr, 10)
  if (m !== 1 && m !== 7) return null
  return `${yearStr}-H${m === 1 ? 1 : 2}`
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

/** Returns the 1-indexed week number of an SPI session within its
 *  containing quarter. SPI sessions are Saturday-anchored, quarters start
 *  on Jan/Apr/Jul/Oct 1. Week 1 = the first SPI session whose Saturday
 *  falls inside the quarter's date range. A quarter typically has 12-13
 *  Saturdays — we cap at 13 just in case.
 *
 *  Used in the UI so the user sees "Semana 3 · Q1" instead of
 *  "Semana 12 del año" (ISO week of year), since they plan in 12-week
 *  trimester cycles. */
export function weekOfQuarter(weekStartDate: string): number {
  const [y, m, d] = weekStartDate.split('-').map(Number)
  const sat = new Date(y, m - 1, d)
  const q = quarterOfMonth(m)
  const quarterStartMonth = (q - 1) * 3  // 0-indexed (0, 3, 6, 9)
  const quarterStart = new Date(y, quarterStartMonth, 1)
  // Find the first Saturday on or after the quarter start.
  const startDay = quarterStart.getDay()  // 0=Sun ... 6=Sat
  const daysToFirstSat = (6 - startDay + 7) % 7
  const firstSat = new Date(y, quarterStartMonth, 1 + daysToFirstSat)
  const diffDays = Math.round((sat.getTime() - firstSat.getTime()) / (1000 * 60 * 60 * 24))
  const weekIndex = Math.floor(diffDays / 7) + 1
  return Math.max(1, Math.min(13, weekIndex))
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
  // Semester
  if (/^\d{4}-H[12]$/.test(periodKey)) {
    const [y, hStr] = periodKey.split('-H')
    return h1o2Label(parseInt(hStr, 10), y)
  }
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

/** Etiqueta "1er/2do semestre YYYY · rango". */
function h1o2Label(h: number, year: string): string {
  return h === 1 ? `1er semestre ${year} · Ene-Jun` : `2do semestre ${year} · Jul-Dic`
}

/** Step a period key forward/backward by one unit.
 *  Year: ±1 year. Semester: ±1 (wraps year). Quarter: ±1 quarter (wraps year). Month: ±1 month (wraps year). */
export function shiftPeriod(periodKey: string, delta: number): string {
  if (/^\d{4}$/.test(periodKey)) {
    return String(parseInt(periodKey, 10) + delta)
  }
  if (/^\d{4}-H[12]$/.test(periodKey)) {
    const [yStr, hStr] = periodKey.split('-H')
    let y = parseInt(yStr, 10)
    let h = parseInt(hStr, 10) + delta
    while (h < 1) { h += 2; y -= 1 }
    while (h > 2) { h -= 2; y += 1 }
    return `${y}-H${h}`
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
