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

// Orden visual: empezamos en LUNES para que matchee la grilla semanal
// de hábitos (que también arranca el lunes). Los valores son JS
// `Date.getDay()` → 0=Dom..6=Sáb. NO cambiamos el storage — `targetDays`
// sigue guardando day-of-week values (0-6 sun-sat), solo el orden de
// render es diferente. Esto mantiene compatible al dispatcher que también
// usa `getDay()`.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] // posicional con DAY_ORDER
const DAY_NAMES_BY_DOW = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

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

  // Resumen para el tooltip del trigger — ordenado Lun..Dom para matchear
  // la grilla. (Filtramos sobre DAY_ORDER en vez de DAY_NAMES_BY_DOW.)
  const summary = isAllDays
    ? 'Todos los días'
    : DAY_ORDER.filter((dow) => activeSet.has(dow))
        .map((dow) => DAY_NAMES_BY_DOW[dow])
        .join(' · ')

  const popupSize = compact ? 'w-7 h-7 text-[11px]' : 'w-8 h-8 text-xs'

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v) }}
        title={`Días — ${summary}`}
        className={`flex items-center transition-colors text-zinc-500 hover:text-zinc-200 ${
          compact ? 'text-[12px]' : 'text-[14px] px-1.5 py-0.5 rounded hover:bg-white/[0.05]/60'
        } ${!isAllDays ? 'text-zinc-300' : ''}`}
      >
        📅
      </button>

      {open && (
        <div
          className="absolute z-50 top-full mt-1 left-0 bg-white/[0.03] border border-white/[0.12] rounded-lg shadow-2xl p-3 w-64"
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
          {/* Chips individuales — gris activo / borde inactivo.
              Renderizados en orden Lun→Dom (DAY_ORDER) para matchear la
              grilla semanal de hábitos. El valor que toggleamos es el
              day-of-week JS (0=Dom..6=Sáb), no el índice visual. */}
          <div className="grid grid-cols-7 gap-1">
            {DAY_ORDER.map((dow, idx) => {
              const label = DAY_LABELS[idx]
              const active = activeSet.has(dow)
              return (
                <button
                  key={dow}
                  onClick={() => toggle(dow)}
                  title={DAY_NAMES_BY_DOW[dow]}
                  className={`${popupSize} rounded font-mono font-bold transition-colors flex items-center justify-center ${
                    active
                      ? 'bg-zinc-200 text-zinc-900'
                      : 'bg-transparent border border-white/[0.12] text-zinc-500 hover:text-zinc-300 hover:border-zinc-500'
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
