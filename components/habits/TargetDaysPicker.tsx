'use client'
import { useState, useRef, useEffect } from 'react'

/** Picker compacto + popover para configurar qué días aplica un hábito.
 *
 *  Display: SOLO un ícono 📅. No mostramos los días en la fila para no
 *  ensuciar el layout con info redundante — el detalle vive en el
 *  popover. Hover muestra el resumen en el tooltip.
 *
 *  Popover: 3 presets (Todos / Lun-Vie / Fin de sem) + 7 chips L-D.
 *  Paleta puramente gris (no colores) — los activos se distinguen por
 *  ser claros + sólidos contra los inactivos que tienen borde fino.
 *
 *  Convención de días: 0=Domingo … 6=Sábado (igual que JS Date.getDay()).
 *  `targetDays === []` significa "todos los días" (convención del store
 *  para back-compat con hábitos viejos sin filtro). */

const DAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

interface Props {
  targetDays: number[]
  onChange: (days: number[]) => void
  /** Variant más chico para inline en filas de hábitos. */
  compact?: boolean
}

export function TargetDaysPicker({ targetDays, onChange, compact = false }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // [] = todos (convención del store). Para los chips visuales del popover
  // tratamos "todos" como "todos activos" → activeSet contiene 0-6.
  const isAllDays = targetDays.length === 0
  const activeSet = new Set(isAllDays ? [0, 1, 2, 3, 4, 5, 6] : targetDays)

  const toggle = (d: number) => {
    // Si todavía está en modo "todos" y el user toca un día, transicionamos
    // a modo explícito con los 7 días - el toggled.
    const base = isAllDays ? [0, 1, 2, 3, 4, 5, 6] : targetDays
    const next = activeSet.has(d) ? base.filter((x) => x !== d) : [...base, d]
    // Si terminás seleccionando los 7, volvemos a la convención [] —
    // representación "limpia" y más fácil de leer en logs.
    if (next.length === 7) onChange([])
    else onChange(next.sort((a, b) => a - b))
  }
  const setAll = () => onChange([])
  const setWeekdays = () => onChange([1, 2, 3, 4, 5])
  const setWeekends = () => onChange([0, 6])

  // Resumen para el tooltip del trigger.
  const summary = isAllDays
    ? 'Todos los días'
    : DAY_NAMES.filter((_, i) => activeSet.has(i)).join(' · ')

  const popupSize = compact ? 'w-7 h-7 text-[11px]' : 'w-8 h-8 text-xs'

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v) }}
        title={`Días — ${summary}`}
        className={`flex items-center transition-colors text-zinc-500 hover:text-zinc-200 ${
          compact ? 'text-[12px]' : 'text-[14px] px-1.5 py-0.5 rounded hover:bg-zinc-800/60'
        } ${!isAllDays ? 'text-zinc-300' : ''}`}
      >
        📅
      </button>

      {open && (
        <div
          className="absolute z-50 top-full mt-1 left-0 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-3 w-64"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
            Días en los que aplica
          </p>
          {/* Presets — gris */}
          <div className="flex gap-1 mb-3">
            <button
              onClick={setAll}
              className={`flex-1 px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                isAllDays
                  ? 'bg-zinc-200 text-zinc-900'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Todos
            </button>
            <button
              onClick={setWeekdays}
              className={`flex-1 px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                !isAllDays && targetDays.length === 5 && targetDays.every((d) => d >= 1 && d <= 5)
                  ? 'bg-zinc-200 text-zinc-900'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Lun-Vie
            </button>
            <button
              onClick={setWeekends}
              className={`flex-1 px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                !isAllDays && targetDays.length === 2 && targetDays.includes(0) && targetDays.includes(6)
                  ? 'bg-zinc-200 text-zinc-900'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Fin de sem
            </button>
          </div>
          {/* Chips individuales — gris activo / borde inactivo */}
          <div className="grid grid-cols-7 gap-1">
            {DAY_LABELS.map((label, i) => {
              const active = activeSet.has(i)
              return (
                <button
                  key={i}
                  onClick={() => toggle(i)}
                  title={DAY_NAMES[i]}
                  className={`${popupSize} rounded font-mono font-bold transition-colors flex items-center justify-center ${
                    active
                      ? 'bg-zinc-200 text-zinc-900'
                      : 'bg-transparent border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] text-zinc-600 italic mt-2 leading-relaxed">
            {isAllDays
              ? 'Aplica todos los días.'
              : `Aplica ${targetDays.length} día${targetDays.length === 1 ? '' : 's'}. Los demás quedan deshabilitados de hoy en adelante — el historial pasado no se toca.`}
          </p>
        </div>
      )}
    </div>
  )
}
