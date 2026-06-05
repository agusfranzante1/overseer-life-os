'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trash2, Plus, CheckCircle2 } from 'lucide-react'
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
  const { tasks, updateSubtask, deleteSubtask, toggleSubtask, addSubtask } = useTasksStore()
  const { t, tStatus } = useTranslation()

  const [title, setTitle]   = useState(subtask.title)
  const [notes, setNotes]   = useState(subtask.notes ?? '')
  const [description, setDescription] = useState(subtask.description ?? '')
  const [status, setStatus] = useState(subtask.status || project.statuses[0]?.label || 'To Do')
  const [priority, setPriority] = useState<Priority | ''>(subtask.priority ?? '')
  const [dueDate, setDueDate] = useState(subtask.dueDate ?? '')
  const [newChildTitle, setNewChildTitle] = useState('')
  const [openChildId, setOpenChildId] = useState<string | null>(null)

  // ── Refs that always hold the LATEST values ──
  // Critical because the cleanup useEffect below runs with empty deps.
  // Without refs, the cleanup would capture INITIAL closures of `title`,
  // `notes`, etc., and on unmount it would write the OLD values back —
  // overwriting whatever the user just typed. THIS WAS THE BUG.
  const titleRef = useRef(title)
  const notesRef = useRef(notes)
  const descRef  = useRef(description)
  const statusRef = useRef(status)
  const priorityRef = useRef(priority)
  const dueDateRef = useRef(dueDate)
  const taskIdRef = useRef(taskId)
  const subtaskIdRef = useRef(subtask.id)
  titleRef.current = title
  notesRef.current = notes
  descRef.current  = description
  statusRef.current = status
  priorityRef.current = priority
  dueDateRef.current = dueDate
  taskIdRef.current = taskId
  subtaskIdRef.current = subtask.id

  // Re-sync local state when the user navigates between subtasks
  useEffect(() => {
    setTitle(subtask.title)
    setNotes(subtask.notes ?? '')
    setDescription(subtask.description ?? '')
    setStatus(subtask.status || project.statuses[0]?.label || 'To Do')
    setPriority(subtask.priority ?? '')
    setDueDate(subtask.dueDate ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtask.id])

  // Persist any pending changes when this modal unmounts. Uses refs so
  // we read the LATEST values, not stale ones captured by the closure.
  useEffect(() => {
    return () => {
      const latestTitle = titleRef.current
      updateSubtask(taskIdRef.current, subtaskIdRef.current, {
        title: latestTitle.trim() || latestTitle,
        notes: notesRef.current.trim() || undefined,
        description: descRef.current.trim() || undefined,
        status: statusRef.current,
        priority: priorityRef.current || undefined,
        dueDate: dueDateRef.current || undefined,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = () => {
    updateSubtask(taskId, subtask.id, {
      title: title.trim() || subtask.title,
      notes: notes.trim() || undefined,
      description: description.trim() || undefined,
      status,
      priority: priority || undefined,
      dueDate: dueDate || undefined,
    })
  }

  const handleDelete = () => {
    if (!confirm(`¿Eliminar la subtarea "${subtask.title}"?`)) return
    deleteSubtask(taskId, subtask.id)
    onClose()
  }

  // Find direct child subtasks (1 level only — Subtask.parentId is single-depth)
  const parentTask = tasks[taskId]
  const children = (parentTask?.subtasks ?? [])
    .filter((s) => s.parentId === subtask.id)
    .sort((a, b) => a.order - b.order)

  const handleAddChild = (e: React.FormEvent) => {
    e.preventDefault()
    const t = newChildTitle.trim()
    if (!t) return
    addSubtask(taskId, t, subtask.id)
    setNewChildTitle('')
  }

  const openChild = openChildId ? children.find((c) => c.id === openChildId) : null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end"
      >
        <motion.div
          initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-zinc-900 border-l border-zinc-800 h-full overflow-y-auto"
        >
          <div className="p-6 space-y-5">
            {/* Breadcrumb */}
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 flex items-center flex-wrap gap-1">
              <span style={{ color: project.color }}>●</span>
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
                  const v = e.target.value
                  setTitle(v)
                  // Persist on every keystroke too — belt + suspenders
                  // (the unmount cleanup also commits, but this catches
                  // any edge case where the cleanup might not fire).
                  updateSubtask(taskId, subtask.id, { title: v })
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
                className="flex-1 bg-transparent text-xl font-bold text-white focus:outline-none border-b border-transparent focus:border-indigo-500 pb-1 resize-none leading-tight overflow-hidden"
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
              <div className="flex flex-wrap gap-2">
                {project.statuses.map((s) => (
                  <button key={s.id}
                    onClick={() => { setStatus(s.label); updateSubtask(taskId, subtask.id, { status: s.label }) }}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-all font-medium ${
                      status === s.label ? 'border-current' : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'
                    }`}
                    style={status === s.label ? {
                      backgroundColor: s.color + '20',
                      borderColor: s.color,
                      color: s.color,
                    } : {}}>
                    {tStatus(s.label)}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">{t('tasks.priority')}</label>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => { setPriority(''); updateSubtask(taskId, subtask.id, { priority: undefined }) }}
                  className={`text-xs px-2 py-1.5 rounded-lg text-left transition-all border ${
                    priority === '' ? 'border-zinc-500 text-zinc-300' : 'border-transparent text-zinc-600 hover:bg-zinc-800'
                  }`}>
                  — Sin urgencia
                </button>
                {PRIORITIES.map((p) => (
                  <button key={p}
                    onClick={() => { setPriority(p); updateSubtask(taskId, subtask.id, { priority: p }) }}
                    className={`text-xs px-2 py-1.5 rounded-lg text-left transition-all border ${
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

            {/* Due date — for sub-project deadlines within a project */}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">Fecha de entrega</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  onBlur={save}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
                />
                {dueDate && (
                  <button
                    onClick={() => { setDueDate(''); updateSubtask(taskId, subtask.id, { dueDate: undefined }) }}
                    className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    quitar
                  </button>
                )}
              </div>
            </div>

            {/* Description — short context, surfaced in chips/tooltips */}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">Descripción</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={save}
                rows={2}
                placeholder="Contexto corto sobre esta subtarea..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 resize-none"
              />
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

            {/* Child subtasks (only 1 level — Subtask.parentId is single-depth) */}
            {!parentSubtaskTitle && (
              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">Sub-subtareas</label>
                <div className="space-y-1.5 mb-2">
                  {children.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 group">
                      <button onClick={() => toggleSubtask(taskId, c.id)}>
                        <CheckCircle2 className={`w-4 h-4 transition-colors ${
                          c.completed ? 'text-emerald-400' : 'text-zinc-600 hover:text-zinc-400'
                        }`} />
                      </button>
                      <button
                        onClick={() => setOpenChildId(c.id)}
                        title="Abrir detalle"
                        className={`flex-1 text-sm text-left px-2 py-0.5 rounded hover:bg-zinc-800/60 transition-colors ${
                          c.completed ? 'line-through text-zinc-500' : 'text-zinc-300'
                        }`}
                      >
                        {c.title}
                      </button>
                      <button
                        onClick={() => deleteSubtask(taskId, c.id)}
                        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleAddChild} className="flex items-center gap-2">
                  <input
                    value={newChildTitle}
                    onChange={(e) => setNewChildTitle(e.target.value)}
                    placeholder="Agregar sub-subtarea..."
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                  />
                  <button type="submit" className="text-zinc-500 hover:text-indigo-400 transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}

            {/* Delete */}
            <button
              onClick={handleDelete}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 text-sm font-semibold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Eliminar subtarea
            </button>
          </div>
        </motion.div>

        {/* Nested child subtask modal (1 level deep) */}
        {openChild && (
          <SubtaskDetailModal
            taskId={taskId}
            subtask={openChild}
            project={project}
            parentTitle={parentTitle}
            parentSubtaskTitle={subtask.title}
            onClose={() => setOpenChildId(null)}
          />
        )}
      </motion.div>
    </AnimatePresence>
  )
}
