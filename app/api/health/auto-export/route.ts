import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

/**
 * Receives data from the iOS app "Health Auto Export".
 * The app posts a payload like:
 *
 *   {
 *     "data": {
 *       "metrics": [
 *         { "name": "step_count", "units": "count",
 *           "data": [{ "date": "2026-05-14 00:00:00 -0300", "qty": 8432 }, ...] },
 *         { "name": "sleep_analysis",
 *           "data": [{ "sleepStart": "...", "sleepEnd": "...", "asleep": 7.2, "inBed": 7.5, ... }] },
 *         { "name": "resting_heart_rate", "units": "count/min",
 *           "data": [{ "date": "...", "qty": 58 }] },
 *         { "name": "heart_rate_variability", "units": "ms",
 *           "data": [{ "date": "...", "qty": 42 }] }
 *       ]
 *     }
 *   }
 *
 * We pick the most recent reading per metric, normalize it, and write
 * one JSON file per local date under `data/health/`.
 */

const DATA_DIR = path.join(process.cwd(), 'data', 'health')

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateToLocalKey(input: string | undefined): string {
  if (!input) return todayLocal()
  // HAE sends "2026-05-14 13:42:00 -0300" — Date() handles this
  const d = new Date(input)
  if (isNaN(d.getTime())) return todayLocal()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface MetricItem {
  date?: string
  qty?: number
  sleepStart?: string
  sleepEnd?: string
  asleep?: number          // hours
  inBed?: number           // hours
  source?: string
  Avg?: number
  Min?: number
  Max?: number
}

interface Metric {
  name?: string
  units?: string
  data?: MetricItem[]
}

interface HAEPayload {
  data?: { metrics?: Metric[] }
  metrics?: Metric[]  // some configs flatten
}

// Group reading by local date so multi-day batches still write correctly
interface DayBucket {
  steps?: number
  sleepMinutes?: number
  sleepStart?: string
  sleepEnd?: string
  restingHR?: number
  hrv?: number
}

function bucketByDate(metrics: Metric[]): Record<string, DayBucket> {
  const buckets: Record<string, DayBucket> = {}
  const ensure = (k: string): DayBucket => (buckets[k] = buckets[k] ?? {})

  for (const m of metrics) {
    if (!m?.name || !m.data) continue
    const name = m.name.toLowerCase()

    for (const item of m.data) {
      // Steps
      if (name.includes('step') && typeof item.qty === 'number') {
        const key = dateToLocalKey(item.date)
        const b = ensure(key)
        b.steps = (b.steps ?? 0) + Math.round(item.qty)
      }
      // Sleep — HAE can use several shapes/names:
      //   v1: { asleep, inBed, awake, sleepStart, sleepEnd }
      //   v2: { date, qty }   (qty in hours)
      //   alternate: { value, totalSleep, ... }
      else if (name.includes('sleep') || name === 'time_asleep' || name === 'time_in_bed') {
        const key = dateToLocalKey(item.sleepEnd || item.date)
        const b = ensure(key)
        const itm = item as MetricItem & { qty?: number; value?: number; totalSleep?: number; awake?: number }
        const hours =
          (typeof itm.asleep === 'number' && itm.asleep) ||
          (typeof itm.totalSleep === 'number' && itm.totalSleep) ||
          (typeof itm.qty === 'number' && itm.qty) ||
          (typeof itm.value === 'number' && itm.value) ||
          (typeof itm.inBed === 'number' && itm.inBed && typeof itm.awake === 'number'
            ? itm.inBed - itm.awake
            : 0) ||
          (typeof itm.inBed === 'number' && itm.inBed) ||
          0
        if (hours > 0) {
          // If a previous entry already exists for the same date, sum it (multiple sleep sessions)
          b.sleepMinutes = (b.sleepMinutes ?? 0) + Math.round(hours * 60)
        }
        if (item.sleepStart) b.sleepStart = item.sleepStart
        if (item.sleepEnd) b.sleepEnd = item.sleepEnd
      }
      // Resting heart rate (explicit)
      else if (name.includes('resting') && (name.includes('heart') || name.includes('hr'))) {
        const key = dateToLocalKey(item.date)
        const b = ensure(key)
        const v = item.qty ?? item.Avg
        if (typeof v === 'number') b.restingHR = Math.round(v)
      }
      // HRV
      else if (name.includes('variability') || name === 'hrv' || name.includes('hrv')) {
        const key = dateToLocalKey(item.date)
        const b = ensure(key)
        const v = item.qty ?? item.Avg
        if (typeof v === 'number') b.hrv = Math.round(v * 10) / 10
      }
      // Generic heart rate — used as fallback for RHR if no explicit resting_heart_rate.
      // We take the daily minimum of "Avg" / "Min" values as a proxy for resting HR.
      else if (name === 'heart_rate' || (name.includes('heart') && name.includes('rate') && !name.includes('walking'))) {
        const key = dateToLocalKey(item.date)
        const b = ensure(key)
        const itm = item as MetricItem & { Min?: number; Max?: number; Avg?: number; qty?: number }
        const v = itm.Min ?? itm.Avg ?? itm.qty
        if (typeof v === 'number' && v > 30 && v < 200) {
          // Track min-of-Avg across samples per day (most stable estimate of RHR)
          const prev = (b as DayBucket & { _minHR?: number })._minHR
          ;(b as DayBucket & { _minHR?: number })._minHR = prev === undefined ? v : Math.min(prev, v)
        }
      }
    }
  }

  return buckets
}

export async function POST(req: NextRequest) {
  try {
    // Optional shared secret (configure in the iOS app as a header: x-overseer-key OR api-key)
    const requiredKey = process.env.OVERSEER_HEALTH_KEY
    if (requiredKey) {
      const got = req.headers.get('x-overseer-key') ?? req.headers.get('api-key')
      if (got !== requiredKey) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
      }
    }

    const raw = (await req.json()) as HAEPayload
    const metrics = raw?.data?.metrics ?? raw?.metrics ?? []

    // Debug: dump raw payload to disk so we can see what HAE actually sends
    await fs.mkdir(DATA_DIR, { recursive: true })
    const debugPath = path.join(DATA_DIR, '_last-payload.json')
    await fs.writeFile(debugPath, JSON.stringify({
      receivedAt: new Date().toISOString(),
      metricNames: metrics.map((m) => m.name),
      sampleSizes: metrics.map((m) => ({ name: m.name, count: m.data?.length ?? 0 })),
      raw,
    }, null, 2), 'utf-8')

    if (!Array.isArray(metrics) || metrics.length === 0) {
      return NextResponse.json({ ok: false, error: 'no_metrics' }, { status: 400 })
    }

    const buckets = bucketByDate(metrics)

    // Apply minHR fallback for restingHR when no explicit resting_heart_rate was provided
    for (const day of Object.values(buckets)) {
      const minHR = (day as DayBucket & { _minHR?: number })._minHR
      if (day.restingHR === undefined && typeof minHR === 'number') {
        day.restingHR = Math.round(minHR)
      }
      delete (day as DayBucket & { _minHR?: number })._minHR
    }

    const written: string[] = []
    for (const [date, b] of Object.entries(buckets)) {
      const file = path.join(DATA_DIR, `${date}.json`)
      // Merge with existing day's data if present (don't lose previously-written fields)
      let existing: Record<string, unknown> = {}
      try {
        const prev = await fs.readFile(file, 'utf-8')
        existing = JSON.parse(prev)
      } catch { /* no previous file */ }

      const snapshot = {
        ...existing,
        date,
        steps: b.steps ?? (existing.steps as number | undefined) ?? 0,
        sleepMinutes: b.sleepMinutes ?? (existing.sleepMinutes as number | undefined) ?? 0,
        sleepStart: b.sleepStart ?? existing.sleepStart,
        sleepEnd: b.sleepEnd ?? existing.sleepEnd,
        restingHR: b.restingHR ?? existing.restingHR,
        hrv: b.hrv ?? existing.hrv,
        source: 'health-auto-export' as const,
        syncedAt: Date.now(),
      }

      await fs.writeFile(file, JSON.stringify(snapshot, null, 2), 'utf-8')
      written.push(date)
    }

    return NextResponse.json({ ok: true, days: written.length, dates: written })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET() {
  // Healthcheck so you can test that the URL is reachable from your iPhone:
  // open http://<PC-LAN-IP>:3001/api/health/auto-export in Safari.
  return NextResponse.json({ ok: true, hint: 'POST Health Auto Export JSON here' })
}
