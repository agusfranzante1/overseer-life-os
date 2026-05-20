'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useTranslation } from '@/hooks/useTranslation'
import { Clock, ArrowRight, Sparkles, CheckCircle } from 'lucide-react'
import { Task } from '@/types'

export function QuickActions() {
  const { planNext2h, pushRemainingToTomorrow } = useTasksStore()
  const { t } = useTranslation()
  const [plan, setPlan] = useState<Task[] | null>(null)
  const [pushed, setPushed] = useState(false)

  const handlePlan = () => {
    const result = planNext2h()
    setPlan(result)
  }

  const handlePushTomorrow = () => {
    pushRemainingToTomorrow()
    setPushed(true)
    setTimeout(() => setPushed(false), 3000)
  }

  return (
    <div>
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
        {t('dashboard.quickActions')}
      </h2>
      <div className="flex flex-wrap gap-2">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handlePlan}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600/10 border border-indigo-500/30 hover:bg-indigo-600/20 hover:border-indigo-500/50 text-indigo-400 rounded-xl text-sm font-medium transition-all"
        >
          <Sparkles className="w-4 h-4" />
          {t('actions.planNext2h')}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handlePushTomorrow}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500/50 text-amber-400 rounded-xl text-sm font-medium transition-all"
        >
          {pushed ? <CheckCircle className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
          {pushed ? 'Moved!' : t('actions.pushToTomorrow')}
        </motion.button>
      </div>

      <AnimatePresence>
        {plan && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-3 bg-indigo-600/10 border border-indigo-500/20 rounded-xl p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-indigo-400 text-sm font-semibold">
                <Clock className="w-4 h-4" />
                Next 2h Plan
              </div>
              <button onClick={() => setPlan(null)} className="text-zinc-500 hover:text-zinc-300 text-xs">
                close
              </button>
            </div>
            {plan.length === 0 ? (
              <p className="text-zinc-400 text-sm">No pending tasks for today.</p>
            ) : (
              <ol className="space-y-2">
                {plan.map((task, i) => (
                  <li key={task.id} className="flex items-start gap-2 text-sm">
                    <span className="text-indigo-500 font-bold shrink-0">{i + 1}.</span>
                    <span className="text-zinc-200">{task.title}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="text-xs text-zinc-500 mt-3">One at a time. No multitasking. Execute.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
