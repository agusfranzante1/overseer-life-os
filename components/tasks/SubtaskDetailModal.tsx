'use client'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Trash2 } from 'lucide-react'
import { Priority, Subtask, Project } from '@/types'
import { PRIORITY_COLORS } from '@/lib/utils/constants'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useTranslation } from '@/hooks/useTranslation'

interface Props {
  taskId: string
  subtask: Subtask
  project: Project        // parent task's project — used for status options
  parentTitle: string     // title of the parent task (for breadcrumb context)
  parentSubtaskTitle?: string  // if this subtask itself has a parent subtask
  onClose: () => void
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']

export function SubtaskDetailModal({ taskId, subtask, project, parentTitle, parentSubtaskTitle, onClose }: Props) {
  const { updateSubtask, deleteSubtask, toggleSubtask } = useTasksStore()
  const { t } = useTranslation()

  const [title, setTitle]   = useState(subtask.title)
  const [notes, setNotes]   = useState(subtask.notes ?? '')
  const [status, setStatus] = useState(subtask.status || project.statuses[0]?.label || 'To Do')
  const [priority, setPriority] = useState<Priority | ''>(subtask.priority ?? '')

  // Save on blur of inputs (live save)
  useEffect(() => {
    return () => {
      // On unmount, persist any pending change
      updateSubtask(taskId, subtask.id, {
        title: title.trim() || subtask.title,
        notes: notes.trim() || undefined,
        status,
        priority: priority || undefined,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = () => {
    updateSubtask(taskId, subtask.id, {
      title: title.trim() || subtask.title,
      notes: notes.trim() || undefined,
      status,
      priority: priority || undefined,
    })
  }

  const handleDelete = () => {
    if (!confirm(`¿Eliminar la subtarea "${subtask.title}"?`)) return
    deleteSubtask(taskId, subtask.id)
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-end"
    >
      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 h-full overflow-y-auto"
      >
        <div className="p-6 space-y-5">
          {/* Breadcrumb */}
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 flex items-center flex-wrap gap-1">
            <span>{project.name}</span>
            <span>›</span>
            <span className="text-zinc-400 truncate max-w-[200px]">{parentTitle}</span>
            {parentSubtaskTitle && (
              <>
                <span>›</span>
                <span className="text-zinc-400 truncate max-w-[160px]">{parentSubtaskTitle}</span>
              </>
            )}
            <span className="ml-auto text-indigo-400">Subtarea</span>
          </div>

          {/* Title + close */}
          <div className="flex items-start justify-between gap-3">
            <textarea
              ref={(el) => {
                if (el) {
                  el.style.height = 'auto'
                  el.style.height = el.scrollHeight + 'px'
                }
              }}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                e.currentTarget.style.height = 'auto'
                e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'
              }}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  e.currentTarget.blur()
                }
              }}
              rows={1}
              className="flex-1 bg-transparent text-lg font-bold text-white focus:outline-none border-b border-transparent focus:border-indigo-500 pb-1 resize-none leading-tight overflow-hidden"
            />
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 shrink-0 mt-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Completed toggle */}
          <button
            onClick={() => { toggleSubtask(taskId, subtask.id) }}
            className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg border transition-colors ${
              subtask.completed
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
            }`}>
            <span className="text-sm font-bold">{subtask.completed ? '✓ Completada' : 'Marcar como completada'}</span>
          </button>

          {/* Status */}
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">{t('tasks.status')}</label>
            <div className="grid grid-cols-2 gap-1">
              {project.statuses.map((s) => (
                <button key={s.id}
                  onClick={() => { setStatus(s.label); updateSubtask(taskId, subtask.id, { status: s.label }) }}
                  className={`text-xs px-2 py-1.5 rounded-lg text-left transition-all border ${
                    status === s.label ? 'border-current' : 'border-transparent text-zinc-500 hover:bg-zinc-800'
                  }`}
                  style={status === s.label ? {
                    backgroundColor: s.color + '20',
                    borderColor: s.color,
                    color: s.color,
                  } : {}}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">{t('tasks.priority')}</label>
            <div className="grid grid-cols-5 gap-1">
              <button
                onClick={() => { setPriority(''); updateSubtask(taskId, subtask.id, { priority: undefined }) }}
                className={`text-xs px-2 py-1.5 rounded-lg transition-all border ${
                  priority === '' ? 'border-zinc-500 text-zinc-300' : 'border-transparent text-zinc-600 hover:bg-zinc-800'
                }`}>
                —
              </button>
              {PRIORITIES.map((p) => (
                <button key={p}
                  onClick={() => { setPriority(p); updateSubtask(taskId, subtask.id, { priority: p }) }}
                  className={`text-xs px-2 py-1.5 rounded-lg transition-all border ${
                    priority === p ? 'border-current' : 'border-transparent text-zinc-500 hover:bg-zinc-800'
                  }`}
                  style={priority === p ? {
                    backgroundColor: PRIORITY_COLORS[p] + '20',
                    borderColor: PRIORITY_COLORS[p],
                    color: PRIORITY_COLORS[p],
                  } : {}}>
                  {t(`tasks.priorities.${p}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">{t('tasks.notes')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={save}
              rows={5}
              placeholder="Notas, contexto, links..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Delete */}
          <button
            onClick={handleDelete}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 text-sm font-semibold transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Eliminar subtarea
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
