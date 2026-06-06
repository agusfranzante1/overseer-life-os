'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useTranslation } from '@/hooks/useTranslation'
import { Task } from '@/types'
import { CheckCircle2, Clock, ChevronRight } from 'lucide-react'
import { PRIORITY_COLORS } from '@/lib/utils/constants'
import Link from 'next/link'

/** Parse a YYYY-MM-DD string in LOCAL time (avoids the UTC-roll-back bug
 *  where new Date('2026-05-27') becomes 2026-05-26 21:00 in UTC-3). */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setHours(0, 0, 0, 0)
  return dt
}

function startOfTodayLocal(): Date {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t
}

/** Solo cuenta tareas cuya `dueDate` cae HOY (no `scheduledFor`, no
 *  vencidas, no overdue). El usuario explícitamente pidió que este
 *  panel del dashboard muestre únicamente las tareas con fecha de hoy
 *  — el listado anterior con scheduledFor + overdue acumulaba todo lo
 *  postergado y se hacía interminable. */
function isDueToday(task: Task): boolean {
  if (!task.dueDate) return false
  return parseLocalDate(task.dueDate).getTime() === startOfTodayLocal().getTime()
}

export function TodayTaskList() {
  const { tasks, projects, completeTask, postponeTask } = useTasksStore()
  const { t } = useTranslation()

  const todayTasks = Object.values(tasks).filter((task) => {
    const proj = projects[task.projectId]
    const isDone = proj?.statuses.find((s) => s.label === task.status)?.countsAsDone
    // Solo dueDate === hoy. Ni overdue ni scheduledFor — esos quedan
    // en el task manager completo, no en el dashboard.
    return !isDone && isDueToday(task)
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          {t('dashboard.todayTasks')}
          {todayTasks.length > 0 && (
            <span className="ml-2 text-indigo-400">({todayTasks.length})</span>
          )}
        </h2>
        <Link href="/tasks" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
          All <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="space-y-2">
        <AnimatePresence>
          {todayTasks.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-6">{t('dashboard.noTasks')}</p>
          ) : (
            todayTasks.map((task, i) => {
              const proj = projects[task.projectId]
              return (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-start gap-3 bg-white/[0.03] rounded-xl p-3 border border-white/[0.08] group transition-colors hover:border-white/[0.12]"
                >
                  <button
                    onClick={() => completeTask(task.id)}
                    className="mt-0.5 shrink-0 text-zinc-600 hover:text-indigo-400 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-zinc-200 font-medium truncate">{task.title}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {proj && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: proj.color + '20', color: proj.color }}
                        >
                          {proj.name}
                        </span>
                      )}
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: PRIORITY_COLORS[task.priority] + '20', color: PRIORITY_COLORS[task.priority] }}
                      >
                        {t(`tasks.priorities.${task.priority}`)}
                      </span>
                      {task.subtasks.length > 0 && (
                        <span className="text-xs text-zinc-500">
                          {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length} subtasks
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => postponeTask(task.id)}
                      className="text-xs text-zinc-500 hover:text-amber-400 transition-colors px-2 py-1 rounded hover:bg-zinc-800"
                    >
                      <Clock className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
