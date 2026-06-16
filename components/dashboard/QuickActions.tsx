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
      <h2 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.2em] mb-3">
        {t('dashboard.quickActions')}
      </h2>
      <div className="flex flex-wrap gap-3">
        {/* Plan próximas 2h — botón principal con gradient violeta */}
        <motion.button
          whileHover={{ scale: 1.03, y: -1 }}
          whileTap={{ scale: 0.97 }}
          onClick={handlePlan}
          className="flex items-center gap-2.5 px-5 py-3 rounded-2xl text-sm font-semibold text-white transition-all"
          style={{
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            boxShadow: '0 0 24px -8px rgba(99,102,241,0.55), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}
        >
          <Sparkles className="w-4 h-4" />
          {t('actions.planNext2h')}
        </motion.button>

        {/* Push to tomorrow — glass con border amber sutil */}
        <motion.button
          whileHover={{ scale: 1.03, y: -1 }}
          whileTap={{ scale: 0.97 }}
          onClick={handlePushTomorrow}
          className="flex items-center gap-2.5 px-5 py-3 rounded-2xl text-sm font-medium transition-all"
          style={{
            background: 'var(--card-bg)',
            border: `1px solid ${pushed ? 'rgba(16, 185, 129, 0.5)' : 'rgba(245, 158, 11, 0.35)'}`,
            color: pushed ? '#34d399' : '#fbbf24',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
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
