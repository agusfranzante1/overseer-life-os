'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Task, Project, Priority } from '@/types'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useTranslation } from '@/hooks/useTranslation'
import { X, Plus, Trash2, CheckCircle2 } from 'lucide-react'
import { PRIORITY_COLORS } from '@/lib/utils/constants'

interface Props {
  task: Task | null
  project: Project | null
  onClose: () => void
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']

export function TaskDetail({ task, project, onClose }: Props) {
  const { updateTask, addSubtask, toggleSubtask, deleteSubtask, updateSubtask, projects } = useTasksStore()
  const { t } = useTranslation()
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [newSubtask, setNewSubtask] = useState('')

  useEffect(() => {
    if (task) {
      setEditTitle(task.title)
      setEditDesc(task.description ?? '')
      setEditNotes(task.notes ?? '')
    }
  }, [task?.id])

  if (!task || !project) return null

  const save = () => {
    updateTask(task.id, { title: editTitle, description: editDesc, notes: editNotes })
  }

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSubtask.trim()) return
    addSubtask(task.id, newSubtask.trim())
    setNewSubtask('')
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-40 flex justify-end"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-zinc-900 border-l border-zinc-800 h-full overflow-y-auto"
        >
          <div className="p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <textarea
                ref={(el) => {
                  // Auto-grow vertically so the entire title is always visible
                  if (el) {
                    el.style.height = 'auto'
                    el.style.height = el.scrollHeight + 'px'
                  }
                }}
                value={editTitle}
                onChange={(e) => {
                  setEditTitle(e.target.value)
                  // Resize as the user types
                  e.currentTarget.style.height = 'auto'
                  e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'
                }}
                onBlur={save}
                onKeyDown={(e) => {
                  // Enter saves; Shift+Enter inserts a newline if you really need one
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    e.currentTarget.blur()
                  }
                }}
                rows={1}
                className="flex-1 bg-transparent text-xl font-bold text-white focus:outline-none border-b border-transparent focus:border-indigo-500 pb-1 transition-colors resize-none leading-tight overflow-hidden"
              />
              <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0 mt-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Project */}
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: project.color }} />
              <span className="text-sm text-zinc-400">{project.name}</span>
            </div>

            {/* Status */}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">{t('tasks.status')}</label>
              <div className="flex flex-wrap gap-2">
                {project.statuses.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => updateTask(task.id, { status: s.label })}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-all font-medium ${
                      task.status === s.label ? 'border-current' : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'
                    }`}
                    style={task.status === s.label ? {
                      backgroundColor: s.color + '20',
                      borderColor: s.color,
                      color: s.color,
                    } : {}}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority + Importance */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">{t('tasks.priority')}</label>
                <div className="flex flex-col gap-1">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      onClick={() => updateTask(task.id, { priority: p })}
                      className={`text-xs px-2 py-1.5 rounded-lg text-left transition-all border ${
                        task.priority === p ? 'border-current' : 'border-transparent text-zinc-500 hover:bg-zinc-800'
                      }`}
                      style={task.priority === p ? {
                        backgroundColor: PRIORITY_COLORS[p] + '20',
                        borderColor: PRIORITY_COLORS[p],
                        color: PRIORITY_COLORS[p],
                      } : {}}
                    >
                      {t(`tasks.priorities.${p}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Schedule */}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">Schedule</label>
              <div className="flex gap-2">
                {(['today', 'tomorrow'] as const).map((day) => (
                  <button
                    key={day}
                    onClick={() => updateTask(task.id, { scheduledFor: day })}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      task.scheduledFor === day
                        ? 'border-indigo-500 bg-indigo-500/20 text-indigo-400'
                        : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'
                    }`}
                  >
                    {day === 'today' ? t('tasks.today') : 'Tomorrow'}
                  </button>
                ))}
              </div>
            </div>

            {/* Due date */}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">{t('tasks.dueDate')}</label>
              <input
                type="date"
                value={task.dueDate ?? ''}
                onChange={(e) => updateTask(task.id, { dueDate: e.target.value || undefined })}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 w-full"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">{t('tasks.description')}</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                onBlur={save}
                rows={3}
                placeholder="Optional description..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            {/* Subtasks */}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">{t('tasks.subtasks')}</label>
              <div className="space-y-1.5 mb-2">
                {task.subtasks.map((sub) => (
                  <SubtaskRow
                    key={sub.id}
                    title={sub.title}
                    completed={sub.completed}
                    onToggle={() => toggleSubtask(task.id, sub.id)}
                    onRename={(newTitle) => {
                      const t = newTitle.trim()
                      if (t && t !== sub.title) updateSubtask(task.id, sub.id, { title: t })
                    }}
                    onDelete={() => deleteSubtask(task.id, sub.id)}
                  />
                ))}
              </div>
              <form onSubmit={handleAddSubtask} className="flex items-center gap-2">
                <input
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  placeholder={t('tasks.addSubtask')}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="text-zinc-500 hover:text-indigo-400 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </form>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">{t('tasks.notes')}</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                onBlur={save}
                rows={3}
                placeholder="Notes..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Subtask Row (click title to rename) ──────────────────────────────────────

interface SubtaskRowProps {
  title: string
  completed: boolean
  onToggle: () => void
  onRename: (newTitle: string) => void
  onDelete: () => void
}

function SubtaskRow({ title, completed, onToggle, onRename, onDelete }: SubtaskRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)

  // Re-sync draft when external title changes
  useEffect(() => { if (!editing) setDraft(title) }, [title, editing])

  const commit = () => {
    setEditing(false)
    onRename(draft)
  }

  return (
    <div className="flex items-center gap-2 group">
      <button onClick={onToggle}>
        <CheckCircle2
          className={`w-4 h-4 transition-colors ${
            completed ? 'text-emerald-400' : 'text-zinc-600 hover:text-zinc-400'
          }`}
        />
      </button>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setDraft(title); setEditing(false) }
          }}
          className={`flex-1 bg-zinc-800 border border-indigo-500 rounded px-2 py-0.5 text-sm focus:outline-none ${
            completed ? 'line-through text-zinc-500' : 'text-zinc-200'
          }`}
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          title="Click para editar"
          className={`flex-1 text-sm text-left px-2 py-0.5 rounded hover:bg-zinc-800/60 transition-colors ${
            completed ? 'line-through text-zinc-500' : 'text-zinc-300'
          }`}
        >
          {title}
        </button>
      )}

      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}
