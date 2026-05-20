import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data', 'health')

interface HealthPayload {
  date?: string
  steps?: number
  sleepMinutes?: number
  sleepStart?: string
  sleepEnd?: string
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
    // Optional shared-secret auth (only enforced if env var set)
    const requiredKey = process.env.OVERSEER_HEALTH_KEY
    if (requiredKey) {
      const got = req.headers.get('x-overseer-key')
      if (got !== requiredKey) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
      }
    }

    const body = (await req.json()) as HealthPayload
    const date = body.date && isValidDate(body.date) ? body.date : todayLocal()

    const snapshot = {
      date,
      steps: Number.isFinite(body.steps) ? Math.round(body.steps!) : 0,
      sleepMinutes: Number.isFinite(body.sleepMinutes) ? Math.round(body.sleepMinutes!) : 0,
      sleepStart: typeof body.sleepStart === 'string' ? body.sleepStart : undefined,
      sleepEnd: typeof body.sleepEnd === 'string' ? body.sleepEnd : undefined,
      restingHR: Number.isFinite(body.restingHR) ? Math.round(body.restingHR!) : undefined,
      hrv: Number.isFinite(body.hrv) ? Math.round(body.hrv! * 10) / 10 : undefined,
      source: 'shortcut' as const,
      syncedAt: Date.now(),
    }

    await fs.mkdir(DATA_DIR, { recursive: true })
    const file = path.join(DATA_DIR, `${date}.json`)
    await fs.writeFile(file, JSON.stringify(snapshot, null, 2), 'utf-8')

    return NextResponse.json({ ok: true, date })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    const file = path.join(DATA_DIR, `${todayLocal()}.json`)
    try {
      const raw = await fs.readFile(file, 'utf-8')
      return NextResponse.json(JSON.parse(raw))
    } catch {
      return NextResponse.json(null)
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
