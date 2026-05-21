/**
 * Parses raw text dumps of HealthKit sleep samples (HKCategoryTypeSleepAnalysis)
 * as iOS Shortcuts emits them. Tolerant to multiple formats — list of samples
 * with timestamp ranges, or summary lines with "X h Y min" durations.
 *
 * Returns minutes per category. Total asleep = core + deep + rem (+ legacy
 * "asleep unspecified"). "In bed" is reported separately because it includes
 * awake periods.
 */

export interface SleepStages {
  inBedMinutes: number
  coreMinutes: number
  deepMinutes: number
  remMinutes: number
  awakeMinutes: number
  asleepLegacyMinutes: number   // pre-watchOS 9 "Asleep" (single value)
  totalAsleepMinutes: number    // core + deep + rem + legacy asleep
  sleepStart?: string           // ISO of earliest sample
  sleepEnd?: string             // ISO of latest sample
}

// ─── Stage label keywords (Spanish + English, lowercase) ──────────────────────

interface StageMatcher {
  key: keyof Pick<SleepStages, 'inBedMinutes' | 'coreMinutes' | 'deepMinutes' | 'remMinutes' | 'awakeMinutes' | 'asleepLegacyMinutes'>
  keywords: string[]
}

// Order matters: more-specific labels first so "Dormido (Núcleo)" matches Core,
// not the legacy "Dormido".
const STAGE_MATCHERS: StageMatcher[] = [
  { key: 'coreMinutes',         keywords: ['núcleo', 'nucleo', 'core', 'ligero', 'light'] },
  { key: 'deepMinutes',         keywords: ['profundo', 'deep'] },
  { key: 'remMinutes',          keywords: ['rem'] },
  { key: 'awakeMinutes',        keywords: ['despierto', 'awake', 'vigilia'] },
  { key: 'inBedMinutes',        keywords: ['en cama', 'in bed'] },
  { key: 'asleepLegacyMinutes', keywords: ['dormido', 'asleep'] },
]

// ─── Duration extraction patterns ─────────────────────────────────────────────

function extractMinutesFromDuration(s: string): number | null {
  // "1 h 30 min", "1h30min", "1 hora 30 minutos", "1:30", "2 h", "45 min", "45 minutos"
  // Note: regex flags only the explicit duration shapes, not arbitrary numbers.

  // "X h Y min" / "X h Y minutos" / "Xh Ymin"
  const hm = s.match(/(\d+)\s*h(?:oras?)?\s*(\d+)\s*m(?:in(?:utos?)?)?/i)
  if (hm) return Number(hm[1]) * 60 + Number(hm[2])

  // "X h" / "X horas"
  const h = s.match(/(\d+)\s*h(?:oras?)?(?!\d)/i)
  if (h) return Number(h[1]) * 60

  // "X min" / "X minutos"
  const m = s.match(/(\d+)\s*m(?:in(?:utos?)?)/i)
  if (m) return Number(m[1])

  // "X:YY" (hours:minutes) — only when standalone
  const hmColon = s.match(/(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/)
  if (hmColon) return Number(hmColon[1]) * 60 + Number(hmColon[2])

  return null
}

// Parses an ISO-ish datetime or "dd/mm/yyyy HH:MM" or "dd mes yyyy a las HH:MM"
// Returns Date or null.
const SPANISH_MONTHS: Record<string, number> = {
  ene: 0, enero: 0,
  feb: 1, febrero: 1,
  mar: 2, marzo: 2,
  abr: 3, abril: 3,
  may: 4, mayo: 4,
  jun: 5, junio: 5,
  jul: 6, julio: 6,
  ago: 7, agosto: 7,
  sep: 8, sept: 8, septiembre: 8,
  oct: 9, octubre: 9,
  nov: 10, noviembre: 10,
  dic: 11, diciembre: 11,
}

function parseDate(s: string): Date | null {
  // ISO 8601: 2025-05-23T23:45:00 or with timezone
  const iso = s.match(/(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/)
  if (iso) {
    const d = new Date(iso[1])
    if (!isNaN(d.getTime())) return d
  }

  // "dd/mm/yyyy HH:MM" or "dd-mm-yyyy HH:MM"
  const dmy = s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})[ T,]+(\d{1,2}):(\d{2})/)
  if (dmy) {
    const yyyy = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3])
    const d = new Date(yyyy, Number(dmy[2]) - 1, Number(dmy[1]), Number(dmy[4]), Number(dmy[5]))
    if (!isNaN(d.getTime())) return d
  }

  // "23 may 2025 a las 23:45" / "23 mayo 2025, 23:45"
  const dmyEs = s.match(/(\d{1,2})\s+([a-záéíóúñ]+)\.?\s+(\d{4})[\s,a-záéíóú]*(\d{1,2}):(\d{2})/i)
  if (dmyEs) {
    const monthKey = dmyEs[2].toLowerCase().replace(/\.$/, '')
    const month = SPANISH_MONTHS[monthKey]
    if (month !== undefined) {
      const d = new Date(Number(dmyEs[3]), month, Number(dmyEs[1]), Number(dmyEs[4]), Number(dmyEs[5]))
      if (!isNaN(d.getTime())) return d
    }
  }

  return null
}

// Find a date range "X → Y" / "X - Y" / "X hasta Y" / "X to Y" in a chunk.
function extractMinutesFromRange(chunk: string): { minutes: number; start: Date; end: Date } | null {
  // Split chunk in two by common range separators, then parse each side.
  const splitters = [' hasta ', ' to ', ' → ', ' -> ', ' — ', ' – ', ' - ']
  for (const sep of splitters) {
    const idx = chunk.toLowerCase().indexOf(sep.toLowerCase())
    if (idx === -1) continue
    const left = chunk.slice(0, idx)
    const right = chunk.slice(idx + sep.length)
    const start = parseDate(left)
    const end = parseDate(right)
    if (start && end && end.getTime() > start.getTime()) {
      const minutes = Math.round((end.getTime() - start.getTime()) / 60000)
      return { minutes, start, end }
    }
  }
  return null
}

function matchStage(chunk: string): StageMatcher['key'] | null {
  const lower = chunk.toLowerCase()
  for (const matcher of STAGE_MATCHERS) {
    for (const kw of matcher.keywords) {
      if (lower.includes(kw)) return matcher.key
    }
  }
  return null
}

// ─── Main parser ──────────────────────────────────────────────────────────────

/** Parse raw HealthKit sleep dump text. */
export function parseSleepRaw(raw: string): SleepStages {
  const stages: SleepStages = {
    inBedMinutes: 0,
    coreMinutes: 0,
    deepMinutes: 0,
    remMinutes: 0,
    awakeMinutes: 0,
    asleepLegacyMinutes: 0,
    totalAsleepMinutes: 0,
  }

  if (!raw || typeof raw !== 'string') return stages

  // Split into chunks: either by newline, or by sample-separators (";", ",", numbered list)
  const chunks = raw
    .split(/\n+|(?:^|\s)\d+[\.\)]\s+/g)
    .map((c) => c.trim())
    .filter((c) => c.length > 0)

  let earliest: Date | null = null
  let latest: Date | null = null

  for (const chunk of chunks) {
    const stage = matchStage(chunk)
    if (!stage) continue

    // Try duration patterns first (explicit "X h Y min"), then fallback to time range diff.
    let minutes = extractMinutesFromDuration(chunk)
    if (minutes === null) {
      const range = extractMinutesFromRange(chunk)
      if (range) {
        minutes = range.minutes
        if (!earliest || range.start < earliest) earliest = range.start
        if (!latest || range.end > latest) latest = range.end
      }
    }

    if (minutes !== null && minutes > 0) {
      stages[stage] += minutes
    }
  }

  stages.totalAsleepMinutes =
    stages.coreMinutes + stages.deepMinutes + stages.remMinutes + stages.asleepLegacyMinutes

  if (earliest) stages.sleepStart = earliest.toISOString()
  if (latest) stages.sleepEnd = latest.toISOString()

  return stages
}
