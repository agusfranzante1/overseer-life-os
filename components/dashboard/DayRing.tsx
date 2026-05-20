'use client'
import { useEffect, useState } from 'react'

const WAKE_HOUR = 8
const SLEEP_HOUR = 24
const R = 52
const C = 2 * Math.PI * R

const PALETTE: [number, number, number][] = [
  [255, 216, 158],
  [255, 205, 121],
  [255, 227, 143],
  [255, 183, 106],
  [255, 149,  89],
  [243, 111,  79],
  [226,  93, 122],
  [123,  91, 176],
  [ 47,  58, 102],
]

function interpolateColor(percent: number): string {
  const stops = PALETTE.length - 1
  const t = (percent / 100) * stops
  const i = Math.min(Math.floor(t), stops - 1)
  const f = t - i
  const [r1, g1, b1] = PALETTE[i]
  const [r2, g2, b2] = PALETTE[i + 1]
  return `rgb(${Math.round(r1 + (r2 - r1) * f)},${Math.round(g1 + (g2 - g1) * f)},${Math.round(b1 + (b2 - b1) * f)})`
}

function getPhase(pct: number) {
  if (pct < 25)  return { phase: 'MAÑANA',     status: '☀️ Mañana — empezá fresco' }
  if (pct < 50)  return { phase: 'MEDIODÍA',   status: '⚡ Mediodía — seguí firme' }
  if (pct < 75)  return { phase: 'TARDE',      status: '🔥 Tarde — empujá' }
  if (pct < 90)  return { phase: 'ANOCHECER',  status: '⏳ Anochecer — ir cerrando' }
  return               { phase: 'A DORMIR',   status: '🌙 Casi hora de dormir' }
}

function formatClock(now: Date) {
  const h = now.getHours()
  const m = now.getMinutes()
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function fmtRemaining(hrs: number, label: string) {
  const h = Math.floor(hrs)
  const m = Math.round((hrs - h) * 60)
  return h > 0 ? `${h}h ${m}m ${label}` : `${m}m ${label}`
}

function compute() {
  const now = new Date()
  const hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600

  if (hours < WAKE_HOUR) {
    return {
      pct: 0, color: '#4D4B47', offset: C,
      phase: 'DURMIENDO', status: '😴 Todavía durmiendo',
      remaining: fmtRemaining(WAKE_HOUR - hours, 'para despertarse'),
      label: '—', clock: formatClock(now),
    }
  }
  if (hours >= SLEEP_HOUR) {
    return {
      pct: 100, color: '#E25D7A', offset: 0,
      phase: 'PASADO HORARIO', status: '⚠️ Hora de dormir hace rato',
      remaining: '¡A dormir!', label: '100%', clock: formatClock(now),
    }
  }
  const pct = Math.min(((hours - WAKE_HOUR) / (SLEEP_HOUR - WAKE_HOUR)) * 100, 100)
  const { phase, status } = getPhase(pct)
  return {
    pct, color: interpolateColor(pct), offset: C * (1 - pct / 100),
    phase, status,
    remaining: fmtRemaining(SLEEP_HOUR - hours, 'despierto'),
    label: Math.round(pct) + '%', clock: formatClock(now),
  }
}

const INITIAL_STATE = {
  pct: 0, color: '#4D4B47', offset: C,
  phase: 'LOADING', status: '', remaining: '', label: '—', clock: '',
}

export function DayRing() {
  const [state, setState] = useState(INITIAL_STATE)

  useEffect(() => {
    // Only compute on the client, after hydration
    setState(compute())
    const id = setInterval(() => setState(compute()), 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="relative" style={{ width: 168, height: 168 }}>
        <svg viewBox="0 0 120 120" width="168" height="168">
          <defs>
            <filter id="ring-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Track */}
          <circle cx="60" cy="60" r={R} fill="none"
            stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
          {/* Fill */}
          <circle cx="60" cy="60" r={R} fill="none"
            stroke={state.color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={state.offset}
            transform="rotate(-90 60 60)"
            filter="url(#ring-glow)"
            style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1), stroke 0.7s cubic-bezier(0.22,1,0.36,1)' }}
          />
        </svg>

        {/* Center overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 pointer-events-none">
          <span className="text-[38px] font-extrabold tabular-nums leading-none"
            style={{ color: state.color, letterSpacing: '-0.04em' }}>
            {state.label}
          </span>
          <span className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500 mt-1">
            {state.phase}
          </span>
          <span className="text-[10px] font-mono text-zinc-500">{state.clock}</span>
        </div>
      </div>

      <div className="text-center space-y-0.5">
        <p className="text-sm font-bold text-white">{state.status}</p>
        {state.remaining && (
          <p className="text-[11px] font-mono text-zinc-400">{state.remaining}</p>
        )}
        <p className="text-[10px] font-mono text-zinc-600">08:00 – 24:00</p>
      </div>
    </div>
  )
}
