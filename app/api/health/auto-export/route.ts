import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

/**
 * Receives data from the iOS app "Health Auto Export".
 * Authentication: per-user webhook_token (same as /api/health). Send as:
 *   - Body field "token", OR
 *   - Header "x-overseer-key"
 *
 * HAE posts a payload like:
 *   {
 *     "token": "<user-webhook-token>",
 *     "data": {
 *       "metrics": [
 *         { "name": "step_count", "units": "count",
 *           "data": [{ "date": "2026-05-14 00:00:00 -0300", "qty": 8432 }, ...] },
 *         { "name": "sleep_analysis",
 *           "data": [{ "sleepStart": "...", "sleepEnd": "...", "asleep": 7.2, "inBed": 7.5, "awake": 0.3 }] },
 *         { "name": "resting_heart_rate", "units": "count/min",
 *           "data": [{ "date": "...", "qty": 58 }] },
 *         { "name": "heart_rate_variability", "units": "ms",
 *           "data": [{ "date": "...", "qty": 42 }] }
 *       ]
 *     }
 *   }
 *
 * Buckets by local date, normalizes, and upserts one row per (user, date)
 * into health_snapshots.
 */

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
  awake?: number           // hours
  source?: string
  Avg?: number
  Min?: number
  Max?: number
  value?: number
  totalSleep?: number
}

interface Metric {
  name?: string
  units?: string
  data?: MetricItem[]
}

interface HAEPayload {
  token?: string
  data?: { metrics?: Metric[] }
  metrics?: Metric[]
}

interface DayBucket {
  steps?: number
  sleepMinutes?: number
  sleepInBedMinutes?: number
  sleepAwakeMinutes?: number
  sleepStart?: string
  sleepEnd?: string
  restingHR?: number
  hrv?: number
  _minHR?: number   // accumulator for HR-min fallback
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
      // Sleep
      else if (name.includes('sleep') || name === 'time_asleep' || name === 'time_in_bed') {
        const key = dateToLocalKey(item.sleepEnd || item.date)
        const b = ensure(key)
        const asleepHours =
          (typeof item.asleep === 'number' && item.asleep) ||
          (typeof item.totalSleep === 'number' && item.totalSleep) ||
          (typeof item.qty === 'number' && item.qty) ||
          (typeof item.value === 'number' && item.value) ||
          (typeof item.inBed === 'number' && item.inBed && typeof item.awake === 'number'
            ? item.inBed - item.awake
            : 0) ||
          (typeof item.inBed === 'number' && item.inBed) ||
          0
        if (asleepHours > 0) {
          b.sleepMinutes = (b.sleepMinutes ?? 0) + Math.round(asleepHours * 60)
        }
        if (typeof item.inBed === 'number' && item.inBed > 0) {
          b.sleepInBedMinutes = (b.sleepInBedMinutes ?? 0) + Math.round(item.inBed * 60)
        }
        if (typeof item.awake === 'number' && item.awake > 0) {
          b.sleepAwakeMinutes = (b.sleepAwakeMinutes ?? 0) + Math.round(item.awake * 60)
        }
        if (item.sleepStart) b.sleepStart = item.sleepStart
        if (item.sleepEnd) b.sleepEnd = item.sleepEnd
      }
      // Resting HR (explicit)
      else if (name.includes('resting') && (name.includes('heart') || name.includes('hr'))) {
        const key = dateToLocalKey(item.date)
        const b = ensure(key)
        const v = item.qty ?? item.Avg
        if (typeof v === 'number') b.restingHR = Math.round(v)
      }
      // HRV
      else if (name.includes('variability') || name === 'hrv') {
        const key = dateToLocalKey(item.date)
        const b = ensure(key)
        const v = item.qty ?? item.Avg
        if (typeof v === 'number') b.hrv = Math.round(v * 10) / 10
      }
      // Generic heart rate — fallback for RHR (min of daily Avg/Min samples)
      else if (name === 'heart_rate' || (name.includes('heart') && name.includes('rate') && !name.includes('walking'))) {
        const key = dateToLocalKey(item.date)
        const b = ensure(key)
        const v = item.Min ?? item.Avg ?? item.qty
        if (typeof v === 'number' && v > 30 && v < 200) {
          b._minHR = b._minHR === undefined ? v : Math.min(b._minHR, v)
        }
      }
    }
  }

  // Apply minHR fallback per day
  for (const day of Object.values(buckets)) {
    if (day.restingHR === undefined && typeof day._minHR === 'number') {
      day.restingHR = Math.round(day._minHR)
    }
    delete day._minHR
  }

  return buckets
}

export async function POST(req: NextRequest) {
  try {
    const raw = (await req.json()) as HAEPayload

    // Auth: per-user webhook token (body or header)
    const token = raw.token ?? req.headers.get('x-overseer-key') ?? req.headers.get('api-key') ?? null
    if (!token) {
      return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 })
    }

    const sb = getSupabaseAdmin()
    const { data: cfg, error: cfgErr } = await sb
      .from('health_config')
      .select('user_id')
      .eq('webhook_token', token)
      .maybeSingle()

    if (cfgErr || !cfg) {
      return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 401 })
    }

    const userId = cfg.user_id as string

    const metrics = raw?.data?.metrics ?? raw?.metrics ?? []
    if (!Array.isArray(metrics) || metrics.length === 0) {
      return NextResponse.json({ ok: false, error: 'no_metrics' }, { status: 400 })
    }

    const buckets = bucketByDate(metrics)
    const dates = Object.keys(buckets)
    if (dates.length === 0) {
      return NextResponse.json({ ok: false, error: 'no_data_after_bucketing' }, { status: 400 })
    }

    // Upsert one row per date. Use upsert with onConflict so we don't lose
    // previously-written fields (e.g. core/deep/rem from the other shortcut).
    const rows = dates.map((date) => {
      const b = buckets[date]
      return {
        user_id: userId,
        date,
        steps: b.steps ?? 0,
        sleep_minutes: b.sleepMinutes ?? 0,
        sleep_in_bed_minutes: b.sleepInBedMinutes ?? null,
        sleep_awake_minutes: b.sleepAwakeMinutes ?? null,
        sleep_start: b.sleepStart ?? null,
        sleep_end: b.sleepEnd ?? null,
        resting_hr: b.restingHR ?? null,
        hrv: b.hrv ?? null,
        source: 'auto-export',
        synced_at: Date.now(),
      }
    })

    const { error: upErr } = await sb.from('health_snapshots').upsert(rows, { onConflict: 'user_id,date' })

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      days: dates.length,
      dates,
      metricNames: metrics.map((m) => m.name),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: 'POST Health Auto Export JSON here. Include "token" field with your per-user webhook token.',
  })
}
