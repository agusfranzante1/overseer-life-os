'use client'
import { useState, useRef, useEffect } from 'react'

/** Picker compacto + popover para configurar qué días aplica un hábito.
 *
 *  Display: un chip "L M M J V S D" donde los días activos están
 *  resaltados con el color del hábito. Click → popover con 3 presets
 *  rápidos + chips individuales por día.
 *
 *  Convención de días: 0=Domingo … 6=Sábado (igual que JS Date.getDay()).
 *  `targetDays === []` significa "todos los días" (convención del store
 *  para mantener back-compat con hábitos viejos sin filtro). */

const DAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

interface Props {
  targetDays: number[]
  onChange: (days: number[]) => void
  /** Color de acento — usá el color del hábito. Default indigo. */
  accentColor?: string
  /** Variant más chico para inline en filas de hábitos. */
  compact?: boolean
}

export function TargetDaysPicker({ targetDays, onChange, accentColor = '#6366f1', compact = false }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  // Click-outside para cerrar el popover.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // [] = todos (el store usa esa convención). Para los chips visuales
  // tratamos "todos" como "todos activos" → highlightedSet contiene 0-6.
  const isAllDays = targetDays.length === 0
  const activeSet = new Set(isAllDays ? [0, 1, 2, 3, 4, 5, 6] : targetDays)

  const toggle = (d: number) => {
    // Si todavía está en modo "todos" y el user toca un día, transicionamos
    // a modo explícito con los 7 días - el toggled.
    const base = isAllDays ? [0, 1, 2, 3, 4, 5, 6] : targetDays
    const next = activeSet.has(d) ? base.filter((x) => x !== d) : [...base, d]
    // Si terminás seleccionando los 7, volvemos a la convención []
    // (sino el dispatcher lee un set explícito y es lo mismo, pero []
    // es la representación "limpia" y más fácil de leer en logs).
    if (next.length === 7) onChange([])
    else onChange(next.sort((a, b) => a - b))
  }
  const setAll = () => onChange([])
  const setWeekdays = () => onChange([1, 2, 3, 4, 5])
  const setWeekends = () => onChange([0, 6])

  const chipSize = compact ? 'w-3.5 h-3.5 text-[8px]' : 'w-5 h-5 text-[10px]'
  const popupSize = compact ? 'w-6 h-6 text-[11px]' : 'w-8 h-8 text-xs'

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v) }}
        title={isAllDays ? 'Todos los días' : DAY_NAMES.filter((_, i) => activeSet.has(i)).join(' · ')}
        className={`flex items-center gap-0.5 transition-colors ${compact ? '' : 'px-1.5 py-0.5 rounded hover:bg-zinc-800/60'}`}
      >
        <span className={`text-[10px] ${compact ? 'opacity-50' : 'text-zinc-500'}`}>📅</span>
        <div className="flex gap-0.5">
          {DAY_LABELS.map((label, i) => {
            const active = activeSet.has(i)
            return (
              <span
                key={i}
                className={`${chipSize} rounded-sm flex items-center justify-center font-mono font-bold transition-colors`}
                style={{
                  background: active ? accentColor : 'transparent',
                  color: active ? '#fff' : '#52525b',
                  border: active ? 'none' : '1px solid #3f3f46',
                }}
              >
                {label}
              </span>
            )
          })}
        </div>
      </button>

      {open && (
        <div
          className="absolute z-50 top-full mt-1 left-0 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-3 w-64"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
            Días en los que aplica
          </p>
          {/* Presets */}
          <div className="flex gap-1 mb-3">
            <button
              onClick={setAll}
              className={`flex-1 px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                isAllDays ? 'bg-indigo-500/25 text-indigo-200' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Todos
            </button>
            <button
              onClick={setWeekdays}
              className={`flex-1 px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                !isAllDays && targetDays.length === 5 && targetDays.every((d) => d >= 1 && d <= 5)
                  ? 'bg-indigo-500/25 text-indigo-200'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Lun-Vie
            </button>
            <button
              onClick={setWeekends}
              className={`flex-1 px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                !isAllDays && targetDays.length === 2 && targetDays.includes(0) && targetDays.includes(6)
                  ? 'bg-indigo-500/25 text-indigo-200'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Fin de sem
            </button>
          </div>
          {/* Custom chips */}
          <div className="grid grid-cols-7 gap-1">
            {DAY_LABELS.map((label, i) => {
              const active = activeSet.has(i)
              return (
                <button
                  key={i}
                  onClick={() => toggle(i)}
                  title={DAY_NAMES[i]}
                  className={`${popupSize} rounded font-mono font-bold transition-colors flex items-center justify-center`}
                  style={{
                    background: active ? accentColor : 'transparent',
                    color: active ? '#fff' : '#a1a1aa',
                    border: active ? 'none' : '1px solid #3f3f46',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] text-zinc-600 italic mt-2">
            {isAllDays
              ? 'Aplica todos los días — los recordatorios y las stats se cuentan los 7 días.'
              : `Aplica ${targetDays.length} día${targetDays.length === 1 ? '' : 's'}. Los demás se ignoran (no afectan stats ni mandan push).`}
          </p>
        </div>
      )}
    </div>
  )
}
