'use client'
import { useState } from 'react'
import { CalendarClock, CheckCircle2, Circle, Coffee, Brain, CalendarDays, ListTodo, Info } from 'lucide-react'
import { useDayPlanStore, type DayPlanBlock } from '@/lib/store/dayPlanStore'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useAppStore } from '@/lib/store/appStore'
import { todayKeyInTz } from '@/lib/utils/dateInTz'

/** Widget "Plan de hoy" del Panel.
 *
 *  Muestra el plan de acción del día — normalmente escrito por Claude a través
 *  del bridge (`/api/mcp` → `save_day_plan`) desde la compu, y visible acá en
 *  cualquier dispositivo gracias al sync del dominio `dayPlan`.
 *
 *  Cada bloque puede llevar un `reason`: el "por qué va acá" que escribió el
 *  planificador. Se muestra a pedido (el ⓘ) para no ensuciar la lista pero que
 *  el usuario pueda auditar el criterio y corregirlo. */

const KIND_ICON = {
  task: ListTodo,
  event: CalendarDays,
  break: Coffee,
  focus: Brain,
} as const

const KIND_COLOR = {
  task: 'text-sky-400',
  event: 'text-violet-400',
  break: 'text-emerald-400',
  focus: 'text-amber-400',
} as const

export function DayPlanPanel() {
  const timezone = useAppStore((s) => s.timezone)
  const today = todayKeyInTz(timezone)
  const plans = useDayPlanStore((s) => s.plans)
  const toggleBlockDone = useDayPlanStore((s) => s.toggleBlockDone)
  const tasks = useTasksStore((s) => s.tasks)
  const [openReason, setOpenReason] = useState<string | null>(null)

  const plan = plans.find((p) => p.date === today)
  const blocks = plan?.blocks ?? []
  const doneCount = blocks.filter((b) => b.done).length

  /** Un bloque cuenta como hecho si lo tildaste acá O si su tarea linkeada ya
   *  está completada en el task manager. Así el plan no te miente cuando
   *  completaste la tarea desde otro lado. */
  const isDone = (b: DayPlanBlock): boolean => {
    if (b.done) return true
    if (b.taskId) {
      const t = tasks[b.taskId]
      if (t?.completedAt) return true
    }
    return false
  }

  const realDone = blocks.filter(isDone).length

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <CalendarClock className="w-4 h-4 text-sky-400" />
        <h2 className="text-sm font-bold text-white">Plan de hoy</h2>
        {blocks.length > 0 && (
          <span className="text-[10px] font-mono text-zinc-600">
            {realDone}/{blocks.length}
          </span>
        )}
        {plan?.source === 'claude' && (
          <span className="ml-auto text-[9px] uppercase tracking-wider font-mono text-sky-400/60 border border-sky-400/20 rounded-full px-2 py-0.5">
            Claude
          </span>
        )}
      </div>

      {plan?.note && (
        <p className="text-[11px] text-zinc-400 leading-relaxed mb-3 pb-3 border-b border-white/[0.06]">
          {plan.note}
        </p>
      )}

      {blocks.length === 0 ? (
        <div className="text-center py-6 text-xs text-zinc-600 italic">
          Sin plan para hoy. Pedíselo a Claude desde el chat conectado a tu cuenta.
        </div>
      ) : (
        <div className="space-y-1.5">
          {blocks.map((b) => {
            const done = isDone(b)
            const Icon = KIND_ICON[b.kind] ?? ListTodo
            const showReason = openReason === b.id
            return (
              <div
                key={b.id}
                className={`rounded-xl border transition-colors ${
                  done
                    ? 'bg-black/20 border-white/[0.04] opacity-60'
                    : 'bg-black/25 border-white/[0.06] hover:border-sky-500/25'
                }`}
              >
                <div className="flex items-center gap-2.5 px-2.5 py-2">
                  <button
                    onClick={() => toggleBlockDone(today, b.id)}
                    title={done ? 'Marcar como pendiente' : 'Marcar como hecho'}
                    className={`shrink-0 transition-colors ${done ? 'text-emerald-400' : 'text-zinc-600 hover:text-emerald-400'}`}
                  >
                    {done ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                  </button>

                  {(b.start || b.end) && (
                    <span className="shrink-0 text-[10px] font-mono text-zinc-500 tabular-nums">
                      {b.start ?? '··:··'}
                      {b.end ? `–${b.end}` : ''}
                    </span>
                  )}

                  <div className="min-w-0 flex-1 flex items-center gap-1.5">
                    <Icon className={`w-3 h-3 shrink-0 ${done ? 'text-zinc-600' : KIND_COLOR[b.kind]}`} />
                    <span className={`text-xs font-medium truncate ${done ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>
                      {b.title}
                    </span>
                  </div>

                  {b.reason && (
                    <button
                      onClick={() => setOpenReason(showReason ? null : b.id)}
                      title="Por qué está acá"
                      className={`shrink-0 transition-colors ${showReason ? 'text-sky-400' : 'text-zinc-700 hover:text-sky-400'}`}
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {showReason && b.reason && (
                  <p className="px-2.5 pb-2 -mt-0.5 text-[11px] text-zinc-500 leading-relaxed italic">
                    {b.reason}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {blocks.length > 0 && doneCount === blocks.length && (
        <p className="mt-3 text-center text-[11px] text-emerald-400/80">Plan del día completo ✅</p>
      )}
    </div>
  )
}
