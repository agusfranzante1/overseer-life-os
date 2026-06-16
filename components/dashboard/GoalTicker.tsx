'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { getActiveDateString, storeGet, Goal } from '@/lib/goals/goalsUtils'

interface TickerItem { status: 'done' | 'pending' | 'empty'; text: string }

function buildItems(): { items: TickerItem[]; meta: string } {
  const goals: Goal[] = storeGet(`goals:${getActiveDateString()}`) ?? []
  const total = goals.length
  const done = goals.filter(g => g.done).length
  if (total === 0) return { items: [{ status: 'empty', text: 'No goals set for today — add one to get rolling.' }], meta: '0/0' }
  if (done === total) return { items: [{ status: 'done', text: '✓ All goals done — solid day.' }], meta: `${done}/${total}` }
  return {
    items: goals.filter(g => !g.done).map(g => ({ status: 'pending' as const, text: g.text })),
    meta: `${done}/${total}`,
  }
}

export function GoalTicker() {
  const [current, setCurrent] = useState<TickerItem>({ status: 'empty', text: '—' })
  const [animKey, setAnimKey] = useState(0)
  const [meta, setMeta] = useState('—')
  const [mounted, setMounted] = useState(false)
  const idxRef = useRef(0)

  const tick = useCallback(() => {
    const { items, meta: m } = buildItems()
    setMeta(m)
    const idx = idxRef.current % items.length
    idxRef.current = (idxRef.current + 1) % items.length
    setCurrent(items[idx])
    setAnimKey(k => k + 1)
  }, [])

  useEffect(() => {
    setMounted(true)
    tick()
    const iv = setInterval(tick, 5000)
    const onChanged = () => { idxRef.current = 0; tick() }
    window.addEventListener('goals-changed', onChanged)
    return () => { clearInterval(iv); window.removeEventListener('goals-changed', onChanged) }
  }, [tick])

  if (!mounted) return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
      style={{ background: 'linear-gradient(180deg,rgba(0,0,0,0.45) 0%,rgba(0,0,0,0.30) 100%)', height: 36 }} />
  )

  const glyph = current.status === 'done' ? '✓' : current.status === 'pending' ? '○' : '·'
  const glyphColor = current.status === 'done' ? '#6BE3A4' : '#76746E'

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl overflow-hidden relative"
      style={{
        background: 'linear-gradient(180deg,rgba(0,0,0,0.45) 0%,rgba(0,0,0,0.30) 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}>

      {/* Pulsing LED */}
      <span className="shrink-0 animate-pulse-led"
        style={{ display:'inline-block', width:7, height:7, borderRadius:'50%', background:'#6BE3A4', boxShadow:'0 0 8px rgba(107,227,164,0.7)' }} />

      {/* Label */}
      <span className="shrink-0 font-mono text-[9.5px] font-black tracking-[0.18em]" style={{ color: '#76746E' }}>
        GOALS
      </span>

      {/* Stage */}
      <div className="flex-1 overflow-hidden" style={{ height: 22, position: 'relative' }}>
        <div key={animKey}
          className="flex items-center gap-2 h-full font-mono text-[12.5px] font-semibold whitespace-nowrap"
          style={{ color: '#FAFAFA', animation: 'ticker-enter 0.45s cubic-bezier(0.22,1,0.36,1) forwards' }}>
          <span className="shrink-0 w-[18px]" style={{ color: glyphColor }}>{glyph}</span>
          <span className="truncate">{current.text}</span>
        </div>
      </div>

      {/* Meta pill */}
      <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full"
        style={{ color: '#B8B6B0', background: 'var(--surface-fill)' }}>
        {meta}
      </span>

      <style>{`
        @keyframes ticker-enter {
          from { opacity: 0; transform: translateY(100%); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-pulse-led {
          animation: led-pulse 1.6s ease-in-out infinite;
        }
        @keyframes led-pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.45; transform:scale(0.85); }
        }
      `}</style>
    </div>
  )
}
