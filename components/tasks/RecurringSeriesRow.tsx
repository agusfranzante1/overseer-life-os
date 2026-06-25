'use client'
import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Repeat } from 'lucide-react'
import type { Task } from '@/types'
import { recurrenceLabel } from '@/lib/utils/taskRecurrence'

const STORAGE_KEY = 'overseer-recurring-expanded'
// Acento de la serie recurrente — índigo, mismo lenguaje visual que el chip
// de recurrencia del resto de la app.
const ACCENT = '#818cf8'

function loadExpanded(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[]) }
  catch { return new Set() }
}
function saveExpanded(s: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...s])) } catch { /* noop */ }
}

/** Fila de una SERIE recurrente. Reusa el MISMO chrome que una `TaskCard`
 *  madre (card `rounded-2xl` con `var(--card-bg)`, borde superior de acento,
 *  `p-4`, fila `flex items-start gap-3`, barra de progreso) para que se sienta
 *  nativa — pero con el distintivo de recurrente: ícono 🔁 en lugar del check,
 *  acento índigo arriba y chip con el label de recurrencia.
 *
 *  Click en el cuerpo abre la madre (editar / cortar la recurrencia); el
 *  chevron expande/colapsa las instancias, igual que las subtareas de una
 *  tarea madre. Las instancias se renderizan vía `renderInstance`. */
export function RecurringSeriesRow({
  headId, mother, instances, onOpenMother, renderInstance,
}: {
  headId: string
  mother: Task
  instances: Task[]
  onOpenMother: (task: Task) => void
  renderInstance: (task: Task) => React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  useEffect(() => { setExpanded(loadExpanded().has(headId)) }, [headId])

  const toggle = () => {
    const next = loadExpanded()
    if (next.has(headId)) next.delete(headId); else next.add(headId)
    saveExpanded(next)
    setExpanded(next.has(headId))
  }

  const total = instances.length
  const done = instances.filter((t) => !!t.completedAt).length
  const allDone = total > 0 && done === total
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const rec = mother.recurrence ?? instances.find((i) => i.recurrence)?.recurrence
  const label = rec ? recurrenceLabel(rec) : 'Recurrente'

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div
        style={{
          // Mismo glass base que la TaskCard, con un tinte índigo arriba y el
          // borde superior de acento (igual que las cards con prioridad).
          background: `linear-gradient(180deg, ${ACCENT}1a 0%, transparent 25%), var(--card-bg)`,
          borderTop: `2px solid ${ACCENT}`,
          boxShadow: 'inset 0 0 0 1px var(--card-inset), 0 1px 2px rgba(0,0,0,0.3)',
          opacity: allDone ? 0.65 : 1,
        }}
        className="rounded-2xl overflow-hidden transition-all"
      >
        <div
          className="relative p-4 cursor-pointer group/card"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[data-interactive]')) return
            onOpenMother(mother)
          }}
        >
          <div className="flex items-start gap-3">
            {/* Distintivo: ícono recurrente en el lugar del check de la madre. */}
            <span className="mt-0.5 shrink-0 text-indigo-400" title="Serie recurrente">
              <Repeat className="w-4 h-4" />
            </span>

            <div className="flex-1 min-w-0">
              <span className={`text-sm font-medium leading-snug break-words ${allDone ? 'text-zinc-400' : 'text-zinc-100'}`}>
                {mother.title}
              </span>

              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-300/90">
                  <Repeat className="w-2.5 h-2.5" /> {label}
                </span>
                <span className={`text-[10px] font-mono ${allDone ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  {done}/{total} hechas
                </span>
              </div>

              {/* Barra de progreso — mismo estilo que el progreso de subtareas. */}
              <div className="mt-2 h-0.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>

            {/* Chevron expand/colapsar — donde la madre tiene el de subtareas. */}
            <button
              data-interactive
              onClick={(e) => { e.stopPropagation(); toggle() }}
              title={expanded ? 'Colapsar' : 'Ver instancias'}
              className="mt-0.5 shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="px-3 pb-3 space-y-2">
            {instances.map((inst) => (
              <div key={inst.id}>{renderInstance(inst)}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
