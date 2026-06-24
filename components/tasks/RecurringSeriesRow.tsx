'use client'
import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, Repeat } from 'lucide-react'
import type { Task } from '@/types'
import { recurrenceLabel } from '@/lib/utils/taskRecurrence'

const STORAGE_KEY = 'overseer-recurring-expanded'

function loadExpanded(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[]) }
  catch { return new Set() }
}
function saveExpanded(s: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...s])) } catch { /* noop */ }
}

/** Fila colapsada de una SERIE recurrente: cabecera (título de la madre +
 *  chip de recurrencia + contador hechas/total) expandible a sus instancias.
 *  Las instancias se renderizan vía `renderInstance` (el padre pasa el
 *  `TaskCard` con sus props), así no duplicamos lógica de tarjeta. */
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
  const rec = mother.recurrence ?? instances.find((i) => i.recurrence)?.recurrence
  const label = rec ? recurrenceLabel(rec) : 'Recurrente'

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={toggle}
          title={expanded ? 'Colapsar' : 'Expandir'}
          className="shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <button
          onClick={() => onOpenMother(mother)}
          className="min-w-0 flex-1 flex items-center gap-2 text-left group"
          title="Abrir la madre (editar / cortar la recurrencia)"
        >
          <span className={`text-sm truncate ${allDone ? 'text-zinc-500' : 'text-zinc-100'} group-hover:text-white transition-colors`}>
            {mother.title}
          </span>
          <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-300">
            <Repeat className="w-2.5 h-2.5" /> {label}
          </span>
        </button>
        <span className={`shrink-0 text-[11px] font-mono tabular-nums ${allDone ? 'text-emerald-400' : 'text-zinc-500'}`}>
          {done}/{total}
        </span>
      </div>
      {expanded && (
        <div className="px-2 pb-2 pt-2 space-y-2 border-t border-white/[0.05]">
          {instances.map((inst) => (
            <div key={inst.id}>{renderInstance(inst)}</div>
          ))}
        </div>
      )}
    </div>
  )
}
