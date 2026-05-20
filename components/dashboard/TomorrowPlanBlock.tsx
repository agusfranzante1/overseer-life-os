'use client'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useTranslation } from '@/hooks/useTranslation'
import { motion } from 'framer-motion'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import Link from 'next/link'

export function TomorrowPlanBlock() {
  const { tasks, projects, completeTask } = useTasksStore()
  const { t } = useTranslation()

  const tomorrowTasks = Object.values(tasks).filter((task) => {
    const proj = projects[task.projectId]
    const isDone = proj?.statuses.find((s) => s.label === task.status)?.countsAsDone
    return !isDone && task.scheduledFor === 'tomorrow'
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          {t('dashboard.tomorrowPlan')}
          {tomorrowTasks.length > 0 && (
            <span className="ml-2 text-zinc-600">({tomorrowTasks.length})</span>
          )}
        </h2>
        <Link href="/tasks" className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="space-y-2">
        {tomorrowTasks.length === 0 ? (
          <div className="border border-dashed border-zinc-800 rounded-xl p-4 text-center">
            <p className="text-zinc-600 text-sm">Nothing planned for tomorrow yet.</p>
          </div>
        ) : (
          tomorrowTasks.slice(0, 4).map((task, i) => {
            const proj = projects[task.projectId]
            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50 group"
              >
                <button
                  onClick={() => completeTask(task.id)}
                  className="shrink-0 text-zinc-700 hover:text-indigo-400 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
                <span className="text-sm text-zinc-400 flex-1 truncate">{task.title}</span>
                {proj && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded shrink-0"
                    style={{ backgroundColor: proj.color + '15', color: proj.color + 'aa' }}
                  >
                    {proj.name}
                  </span>
                )}
              </motion.div>
            )
          })
        )}
      </div>
    </div>
  )
}
