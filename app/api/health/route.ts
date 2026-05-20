import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

interface HealthPayload {
  token?: string
  date?: string
  steps?: number
  sleep_minutes?: number
  sleepMinutes?: number      // accept both camel/snake for shortcut convenience
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

    // Resolve token from body OR header (Shortcuts can send either)
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
    const sleepMinutesRaw = body.sleep_minutes ?? body.sleepMinutes
    const sleepMinutes = Number.isFinite(sleepMinutesRaw) ? Math.round(sleepMinutesRaw!) : 0
    const sleepStart = body.sleep_start ?? body.sleepStart ?? null
    const sleepEnd = body.sleep_end ?? body.sleepEnd ?? null
    const restingRaw = body.resting_hr ?? body.restingHR
    const restingHR = Number.isFinite(restingRaw) ? Math.round(restingRaw!) : null
    const hrv = Number.isFinite(body.hrv) ? Math.round(body.hrv! * 10) / 10 : null

    const { error: upErr } = await sb.from('health_snapshots').upsert(
      {
        user_id: userId,
        date,
        steps,
        sleep_minutes: sleepMinutes,
        sleep_start: typeof sleepStart === 'string' ? sleepStart : null,
        sleep_end: typeof sleepEnd === 'string' ? sleepEnd : null,
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

    return NextResponse.json({ ok: true, date })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
