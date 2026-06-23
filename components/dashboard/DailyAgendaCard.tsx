'use client'
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Clock, Lock, CalendarDays, Check } from 'lucide-react'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useAppStore } from '@/lib/store/appStore'
import { useGoogleCalendarStore, resolveEventColor } from '@/lib/store/googleCalendarStore'
import { todayKeyInTz } from '@/lib/utils/dateInTz'
import { useDailyPriorities } from '@/lib/dashboard/priorities'

const TASK_ACCENT = '#8b5cf6'

interface AgendaBlock {
  id: string
  title: string
  /** ISO start — solo en bloques timeados. */
  start?: string
  color: string
  done: boolean
  /** Si viene de una task global → su id (permite completar). Eventos GCal no. */
  taskId?: string
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Vista diaria "nutrida del calendario": eventos de Google Calendar de hoy +
 *  tareas timeadas de hoy (lista cronológica) + tareas sin hora (to-do de hoy).
 *
 *  Se BLOQUEA (difuminado + candado) mientras haya prioridades del día sin
 *  completar. Al completar las prioridades se desbloquea. Si no hay prioridades
 *  marcadas, queda siempre desbloqueada. */
export function DailyAgendaCard() {
  const { hasPriorities, allDone, doneCount, items } = useDailyPriorities()
  const tasks = useTasksStore((s) => s.tasks)
  const completeTask = useTasksStore((s) => s.completeTask)
  const timezone = useAppStore((s) => s.timezone)
  const gcalEvents = useGoogleCalendarStore((s) => s.events)
  const calendars = useGoogleCalendarStore((s) => s.calendars)

  const todayKey = todayKeyInTz(timezone)

  const { timed, untimed } = useMemo(() => {
    const calBg = new Map(calendars.map((c) => [c.id, c.backgroundColor ?? null]))
    // GCal events ya linkeados a una task se omiten (la task ya los representa).
    const linkedGcalIds = new Set<string>()
    for (const t of Object.values(tasks)) if (t.gcalEventId) linkedGcalIds.add(t.gcalEventId)

    const timed: AgendaBlock[] = []
    const untimed: AgendaBlock[] = []

    for (const ev of gcalEvents) {
      if (linkedGcalIds.has(ev.id)) continue
      if (ev.start.slice(0, 10) !== todayKey) continue
      const color = resolveEventColor(ev, calBg.get(ev.calendarId))
      const block: AgendaBlock = { id: ev.id, title: ev.summary || '(sin título)', color, done: false }
      if (ev.allDay) untimed.push(block)
      else timed.push({ ...block, start: ev.start })
    }

    for (const t of Object.values(tasks)) {
      if (t.archivedAt) continue
      if (t.dueDate !== todayKey) continue
      const done = !!t.completedAt
      if (t.dueTime) {
        const [y, m, d] = t.dueDate.split('-').map(Number)
        const [hh, mm] = t.dueTime.split(':').map(Number)
        const start = new Date(y, m - 1, d, hh, mm, 0).toISOString()
        timed.push({ id: `task:${t.id}`, title: t.title, start, color: TASK_ACCENT, done, taskId: t.id })
      } else {
        untimed.push({ id: `task:${t.id}`, title: t.title, color: TASK_ACCENT, done, taskId: t.id })
      }
    }

    timed.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))
    return { timed, untimed }
  }, [gcalEvents, calendars, tasks, todayKey])

  const locked = hasPriorities && !allDone
  const isEmpty = timed.length === 0 && untimed.length === 0

  return (
    <div className="relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] overflow-hidden">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-semibold text-zinc-100">Tu día</h3>
      </div>

      {/* Contenido — se difumina y deshabilita cuando está bloqueado. */}
      <div className={locked ? 'blur-[6px] pointer-events-none select-none' : ''} aria-hidden={locked}>
        {isEmpty ? (
          <p className="text-xs text-zinc-500 py-6 text-center">No hay nada agendado para hoy.</p>
        ) : (
          <div className="space-y-4">
            {timed.length > 0 && (
              <ul className="space-y-1.5">
                {timed.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 bg-white/[0.02] border border-white/[0.06]"
                    style={{ borderLeft: `3px solid ${b.color}` }}
                  >
                    <span className="shrink-0 text-[11px] font-mono text-zinc-400 w-10 tabular-nums">
                      {b.start ? fmtTime(b.start) : ''}
                    </span>
                    {b.taskId ? (
                      <button
                        onClick={() => completeTask(b.taskId!)}
                        className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          b.done ? 'bg-emerald-500/80 border-emerald-400' : 'border-zinc-600 hover:border-indigo-300'
                        }`}
                        title={b.done ? 'Marcar como pendiente' : 'Completar'}
                      >
                        {b.done && <Check className="w-3 h-3 text-white" />}
                      </button>
                    ) : (
                      <Clock className="w-3.5 h-3.5 shrink-0 text-zinc-600" />
                    )}
                    <span className={`text-sm truncate ${b.done ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                      {b.title}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {untimed.length > 0 && (
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-600 mb-2">To-do de hoy</p>
                <ul className="space-y-1">
                  {untimed.map((b) => (
                    <li key={b.id} className="flex items-center gap-3 px-1 py-1">
                      {b.taskId ? (
                        <button
                          onClick={() => completeTask(b.taskId!)}
                          className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                            b.done ? 'bg-emerald-500/80 border-emerald-400' : 'border-zinc-600 hover:border-indigo-300'
                          }`}
                          title={b.done ? 'Marcar como pendiente' : 'Completar'}
                        >
                          {b.done && <Check className="w-3 h-3 text-white" />}
                        </button>
                      ) : (
                        <span className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: b.color }} />
                      )}
                      <span className={`text-sm truncate ${b.done ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>
                        {b.title}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Overlay de bloqueo */}
      {locked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 bg-zinc-950/40"
        >
          <div className="w-11 h-11 rounded-full bg-violet-500/15 border border-violet-500/40 flex items-center justify-center">
            <Lock className="w-5 h-5 text-violet-300" />
          </div>
          <p className="text-sm font-medium text-zinc-100">Completá tus prioridades para desbloquear tu día</p>
          <p className="text-xs text-violet-300/80 font-mono">{doneCount}/{items.length} prioridades hechas</p>
        </motion.div>
      )}
    </div>
  )
}
