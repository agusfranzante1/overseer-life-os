'use client'
import { motion } from 'framer-motion'
import { Zap, Check, Lock, Unlock } from 'lucide-react'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useDailyPriorities } from '@/lib/dashboard/priorities'

/** ⚡ Prioridades de hoy — checklist de las tareas marcadas con ⚡ en el SPI
 *  que vencen hoy. Completarlas desbloquea la vista diaria (DailyAgendaCard).
 *  El checkbox es two-way: togglea la tarea real vía `completeTask`. */
export function DailyPriorities() {
  const { items, hasPriorities, allDone, doneCount, unlinkedCount } = useDailyPriorities()
  const completeTask = useTasksStore((s) => s.completeTask)

  return (
    <div className="bg-gradient-to-br from-violet-500/[0.10] to-fuchsia-500/[0.05] border border-violet-500/25 rounded-2xl p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <Zap className="w-4 h-4 text-violet-400 fill-violet-400/40" />
          Prioridades de hoy
        </h3>
        {hasPriorities && (
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-full border ${
            allDone
              ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
              : 'text-violet-200 border-violet-500/30 bg-violet-500/10'
          }`}>
            {allDone ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
            {doneCount}/{items.length}
          </span>
        )}
      </div>

      {!hasPriorities ? (
        unlinkedCount > 0 ? (
          <p className="text-xs text-amber-300/90 leading-relaxed">
            Marcaste {unlinkedCount} {unlinkedCount === 1 ? 'prioridad' : 'prioridades'} con <Zap className="w-3 h-3 inline text-violet-400" />,
            pero todavía no se materializaron en el task manager. <span className="text-amber-200 font-medium">Cerrá la sesión del SPI</span> (o
            pusheá la tarea con la flecha) para que aparezcan acá como checkbox.
          </p>
        ) : (
          <p className="text-xs text-zinc-500 leading-relaxed">
            No marcaste prioridades para hoy. Andá al <span className="text-violet-400 font-medium">SPI</span> y
            tocá el <Zap className="w-3 h-3 inline text-violet-400" /> en las tareas que mueven la aguja —
            aparecerán acá como checkbox y desbloquearán tu día. Por ahora, tu día está libre.
          </p>
        )
      ) : (
        <>
          {/* Barra de progreso */}
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-4">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400"
              initial={false}
              animate={{ width: `${(doneCount / items.length) * 100}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 28 }}
            />
          </div>

          <ul className="space-y-2">
            {items.map(({ spiTask, task }) => {
              const done = !!task.completedAt
              return (
                <li key={task.id}>
                  <button
                    onClick={() => completeTask(task.id)}
                    className="w-full flex items-start gap-3 text-left group"
                  >
                    <span className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                      done
                        ? 'bg-emerald-500/80 border-emerald-400'
                        : 'border-violet-400/50 group-hover:border-violet-300 group-hover:bg-violet-500/10'
                    }`}>
                      {done && <Check className="w-3.5 h-3.5 text-white" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm leading-snug transition-colors ${
                        done ? 'text-zinc-500 line-through' : 'text-zinc-100'
                      }`}>
                        {task.title}
                      </span>
                      {spiTask.whyPurpose && (
                        <span className={`block text-[11px] mt-0.5 ${done ? 'text-zinc-600' : 'text-violet-300/70'}`}>
                          {spiTask.whyPurpose}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {allDone && (
            <p className="mt-4 text-xs text-emerald-300 flex items-center gap-1.5">
              <Unlock className="w-3.5 h-3.5" /> Prioridades completas — tu día está desbloqueado.
            </p>
          )}
        </>
      )}
    </div>
  )
}
