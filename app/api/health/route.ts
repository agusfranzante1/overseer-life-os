import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { parseSleepRaw } from '@/lib/health/sleep-parser'

interface HealthPayload {
  token?: string
  date?: string
  steps?: number
  sleep_minutes?: number
  sleepMinutes?: number
  sleep_raw?: string             // Raw HealthKit dump from iOS Shortcut
  sleep_start?: string
  sleepStart?: string
  sleep_end?: string
  sleepEnd?: string
  resting_hr?: number
  restingHR?: number
  hrv?: number
}

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as HealthPayload

    const token = body.token ?? req.headers.get('x-overseer-key') ?? null
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
    const date = body.date && isValidDate(body.date) ? body.date : todayLocal()

    const steps = Number.isFinite(body.steps) ? Math.round(body.steps!) : 0

    // Sleep: parse raw if provided, otherwise fall back to scalar sleep_minutes.
    let sleepMinutes = 0
    let sleepStart: string | null = body.sleep_start ?? body.sleepStart ?? null
    let sleepEnd: string | null = body.sleep_end ?? body.sleepEnd ?? null
    let stages = { inBedMinutes: 0, coreMinutes: 0, deepMinutes: 0, remMinutes: 0, awakeMinutes: 0 }

    if (typeof body.sleep_raw === 'string' && body.sleep_raw.trim().length > 0) {
      const parsed = parseSleepRaw(body.sleep_raw)
      sleepMinutes = parsed.totalAsleepMinutes
      stages = {
        inBedMinutes: parsed.inBedMinutes,
        coreMinutes: parsed.coreMinutes,
        deepMinutes: parsed.deepMinutes,
        remMinutes: parsed.remMinutes,
        awakeMinutes: parsed.awakeMinutes,
      }
      if (!sleepStart && parsed.sleepStart) sleepStart = parsed.sleepStart
      if (!sleepEnd && parsed.sleepEnd) sleepEnd = parsed.sleepEnd
    } else {
      const sleepMinutesRaw = body.sleep_minutes ?? body.sleepMinutes
      if (Number.isFinite(sleepMinutesRaw)) sleepMinutes = Math.round(sleepMinutesRaw!)
    }

    const restingRaw = body.resting_hr ?? body.restingHR
    const restingHR = Number.isFinite(restingRaw) ? Math.round(restingRaw!) : null
    const hrv = Number.isFinite(body.hrv) ? Math.round(body.hrv! * 10) / 10 : null

    const { error: upErr } = await sb.from('health_snapshots').upsert(
      {
        user_id: userId,
        date,
        steps,
        sleep_minutes: sleepMinutes,
        sleep_in_bed_minutes: stages.inBedMinutes || null,
        sleep_core_minutes: stages.coreMinutes || null,
        sleep_deep_minutes: stages.deepMinutes || null,
        sleep_rem_minutes: stages.remMinutes || null,
        sleep_awake_minutes: stages.awakeMinutes || null,
        sleep_start: sleepStart,
        sleep_end: sleepEnd,
        resting_hr: restingHR,
        hrv,
        source: 'shortcut',
        synced_at: Date.now(),
      },
      { onConflict: 'user_id,date' },
    )

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 })
    }

    const debug = typeof body.sleep_raw === 'string' && body.sleep_raw.length > 0
      ? {
          sleep_raw_length: body.sleep_raw.length,
          sleep_raw_preview: body.sleep_raw.slice(0, 500),
          parsed: {
            total: sleepMinutes,
            ...stages,
            sleepStart, sleepEnd,
          },
        }
      : undefined

    return NextResponse.json({ ok: true, date, debug })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
