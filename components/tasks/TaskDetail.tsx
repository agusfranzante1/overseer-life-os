'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Task, Project, Priority } from '@/types'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useTranslation } from '@/hooks/useTranslation'
import { X, Plus, Trash2, CheckCircle2, ChevronRight, ArrowRightLeft, Check, GitMerge } from 'lucide-react'
import { PRIORITY_COLORS } from '@/lib/utils/constants'
import { SubtaskDetailModal } from './SubtaskDetailModal'

interface Props {
  task: Task | null
  project: Project | null
  onClose: () => void
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']

export function TaskDetail({ task, project, onClose }: Props) {
  const { updateTask, addSubtask, toggleSubtask, deleteSubtask, updateSubtask, moveTask, projects, tasks, convertTaskToSubtask } = useTasksStore()
  const { t } = useTranslation()
  // Read the task LIVE from the store so edits reflect immediately.
  const liveTask = useTasksStore((s) => (task ? s.tasks[task.id] : undefined))
  const effective = liveTask ?? task

  // ── Buffered local state for the text inputs ──
  // We use local state for the VISIBLE value (so cursor position is
  // stable and the user always sees exactly what they typed), and mirror
  // every change to the store. Refs hold the latest values so a final
  // commit-on-unmount can fire even if React batched a pending change.
  const [titleBuf, setTitleBuf] = useState(effective?.title ?? '')
  const [descBuf,  setDescBuf]  = useState(effective?.description ?? '')
  const [notesBuf, setNotesBuf] = useState(effective?.notes ?? '')
  const titleRef = useRef(titleBuf)
  const descRef  = useRef(descBuf)
  const notesRef = useRef(notesBuf)
  const taskIdRef = useRef(task?.id)
  titleRef.current = titleBuf
  descRef.current  = descBuf
  notesRef.current = notesBuf
  taskIdRef.current = effective?.id

  // When the user navigates to a DIFFERENT task, re-seed the buffers
  // from the new task's stored values. Identity-only check (task.id)
  // — we don't want to overwrite while the user is typing on the
  // current task.
  useEffect(() => {
    setTitleBuf(effective?.title ?? '')
    setDescBuf(effective?.description ?? '')
    setNotesBuf(effective?.notes ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id])

  // Final safety net: when this component unmounts, commit any text
  // that might still be in the buffer but not yet persisted (e.g. if
  // the modal closed in the same React tick as a keystroke).
  useEffect(() => {
    return () => {
      const id = taskIdRef.current
      if (!id) return
      updateTask(id, {
        title: titleRef.current,
        description: descRef.current || undefined,
        notes: notesRef.current || undefined,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [newSubtask, setNewSubtask] = useState('')
  const [openSubtaskId, setOpenSubtaskId] = useState<string | null>(null)
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  // Separate menu for "convert this task into a subtask of another". Lives
  // alongside the project-move menu but does a different operation: it
  // doesn't move the task across projects, it merges it INTO another task
  // (this task disappears as a top-level entity, becomes a subtask).
  const [showMergeMenu, setShowMergeMenu] = useState(false)

  if (!effective || !project) return null

  // Aliases used below so the JSX reads naturally.
  const editTitle = titleBuf
  const editDesc  = descBuf
  const editNotes = notesBuf

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSubtask.trim()) return
    addSubtask(effective.id, newSubtask.trim())
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
                  const v = e.target.value
                  setTitleBuf(v)                                 // visible buffer
                  updateTask(effective.id, { title: v })          // persist to store
                  // Resize as the user types
                  e.currentTarget.style.height = 'auto'
                  e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'
                }}
                onKeyDown={(e) => {
                  // Enter just blurs (no special save needed — already saved on every keystroke).
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

            {/* Project — click to move task to another project */}
            <div className="relative">
              <button
                onClick={() => setShowMoveMenu((v) => !v)}
                className="flex items-center gap-2 group hover:bg-zinc-800/40 px-2 py-1 -mx-2 rounded-md transition-colors"
                title="Click para mover a otro proyecto"
              >
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: project.color }} />
                <span className="text-sm text-zinc-400 group-hover:text-zinc-200 transition-colors">{project.name}</span>
                <ArrowRightLeft className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
              </button>
              {showMoveMenu && (
                <>
                  {/* Click-outside catcher */}
                  <div className="fixed inset-0 z-10" onClick={() => setShowMoveMenu(false)} />
                  <div className="absolute left-0 top-full mt-1.5 z-20 min-w-[220px] bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1 max-h-72 overflow-y-auto">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-3 py-2 border-b border-zinc-800">
                      Mover a proyecto
                    </p>
                    {Object.values(projects)
                      .filter((p) => !p.archived)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((p) => {
                        const isCurrent = p.id === project.id
                        return (
                          <button
                            key={p.id}
                            disabled={isCurrent}
                            onClick={() => {
                              if (isCurrent) return
                              moveTask(effective.id, p.id)
                              setShowMoveMenu(false)
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                              isCurrent
                                ? 'text-zinc-500 cursor-default'
                                : 'text-zinc-200 hover:bg-zinc-800'
                            }`}
                          >
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                            <span className="flex-1 truncate">{p.name}</span>
                            {p.isSystemProject && (
                              <span className="text-[9px] font-mono uppercase text-fuchsia-400/70 px-1 bg-fuchsia-500/10 rounded">sistema</span>
                            )}
                            {isCurrent && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
                          </button>
                        )
                      })}
                  </div>
                </>
              )}
            </div>

            {/* Convert into subtask of another task — same UI pattern as the
                project move menu above. Lists all OTHER non-archived tasks
                in this project as targets. The current task (plus its own
                subtasks) gets nested as a single subtree inside the chosen
                target task and disappears from the top level. */}
            <div className="relative">
              <button
                onClick={() => setShowMergeMenu((v) => !v)}
                className="flex items-center gap-2 group hover:bg-zinc-800/40 px-2 py-1 -mx-2 rounded-md transition-colors"
                title="Convertir esta tarea en subtarea de otra"
              >
                <GitMerge className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                <span className="text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  Mover dentro de otra tarea
                </span>
                <ChevronRight className={`w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-transform ${showMergeMenu ? 'rotate-90' : ''}`} />
              </button>
              {showMergeMenu && (() => {
                // Only show tasks from the SAME project (the user expectation
                // is "merge with a sibling"). Filter out the current task and
                // any archived ones. Sort by title for predictability.
                const candidates = Object.values(tasks)
                  .filter((t) => t.projectId === project.id && t.id !== effective.id && !t.archivedAt)
                  .sort((a, b) => a.title.localeCompare(b.title))
                return (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMergeMenu(false)} />
                    <div className="absolute left-0 top-full mt-1.5 z-20 min-w-[260px] bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1 max-h-72 overflow-y-auto">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-3 py-2 border-b border-zinc-800">
                        Anidar dentro de…
                      </p>
                      {candidates.length === 0 && (
                        <p className="text-xs text-zinc-600 italic text-center px-3 py-4">
                          No hay otras tareas en este proyecto
                        </p>
                      )}
                      {candidates.map((tk) => (
                        <button
                          key={tk.id}
                          onClick={() => {
                            const subCount = tk.subtasks.filter((s) => !s.archivedAt).length
                            const hasOwnSubs = effective.subtasks.some((s) => !s.archivedAt)
                            const confirmMsg = hasOwnSubs
                              ? `¿Mover "${effective.title}" (con sus subtareas) dentro de "${tk.title}"? Las subtareas anidadas se aplanan a un solo nivel.`
                              : `¿Mover "${effective.title}" dentro de "${tk.title}"?`
                            if (!confirm(confirmMsg)) return
                            convertTaskToSubtask(effective.id, tk.id)
                            setShowMergeMenu(false)
                            onClose()
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
                        >
                          <CheckCircle2 className="w-3 h-3 text-zinc-600 shrink-0" />
                          <span className="flex-1 truncate">{tk.title}</span>
                          <span className="text-[10px] font-mono text-zinc-600 shrink-0">
                            {tk.subtasks.filter((s) => !s.archivedAt).length} sub
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )
              })()}
            </div>

            {/* Status */}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">{t('tasks.status')}</label>
              <div className="flex flex-wrap gap-2">
                {project.statuses.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => updateTask(effective.id, { status: s.label })}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-all font-medium ${
                      effective.status === s.label ? 'border-current' : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'
                    }`}
                    style={effective.status === s.label ? {
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
                      onClick={() => updateTask(effective.id, { priority: p })}
                      className={`text-xs px-2 py-1.5 rounded-lg text-left transition-all border ${
                        effective.priority === p ? 'border-current' : 'border-transparent text-zinc-500 hover:bg-zinc-800'
                      }`}
                      style={effective.priority === p ? {
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
                    onClick={() => updateTask(effective.id, { scheduledFor: day })}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      effective.scheduledFor === day
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
                value={effective.dueDate ?? ''}
                onChange={(e) => updateTask(effective.id, { dueDate: e.target.value || undefined })}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 w-full"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">{t('tasks.description')}</label>
              <textarea
                value={editDesc}
                onChange={(e) => {
                  const v = e.target.value
                  setDescBuf(v)                                  // visible buffer
                  updateTask(effective.id, { description: v })   // persist to store
                }}
                rows={3}
                placeholder="Optional description..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            {/* Subtasks */}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">{t('tasks.subtasks')}</label>
              <div className="space-y-1.5 mb-2">
                {effective.subtasks.filter((s) => !s.parentId).map((sub) => (
                  <SubtaskRow
                    key={sub.id}
                    title={sub.title}
                    completed={sub.completed}
                    onToggle={() => toggleSubtask(effective.id, sub.id)}
                    onRename={(newTitle) => {
                      const t = newTitle.trim()
                      if (t && t !== sub.title) updateSubtask(effective.id, sub.id, { title: t })
                    }}
                    onOpenDetail={() => setOpenSubtaskId(sub.id)}
                    onDelete={() => deleteSubtask(effective.id, sub.id)}
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
                onChange={(e) => {
                  const v = e.target.value
                  setNotesBuf(v)                                 // visible buffer
                  updateTask(effective.id, { notes: v })         // persist to store
                }}
                rows={3}
                placeholder="Notes..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>
          </div>
        </motion.div>

        {/* Nested subtask detail modal */}
        {openSubtaskId && (() => {
          const sub = effective.subtasks.find((s) => s.id === openSubtaskId)
          if (!sub) return null
          return (
            <SubtaskDetailModal
              taskId={effective.id}
              subtask={sub}
              project={project}
              parentTitle={effective.title}
              onClose={() => setOpenSubtaskId(null)}
            />
          )
        })()}
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
  onOpenDetail: () => void
  onDelete: () => void
}

function SubtaskRow({ title, completed, onToggle, onRename, onOpenDetail, onDelete }: SubtaskRowProps) {
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
          onClick={onOpenDetail}
          onDoubleClick={() => setEditing(true)}
          title="Click para abrir detalle · doble click para renombrar inline"
          className={`flex-1 text-sm text-left px-2 py-0.5 rounded hover:bg-zinc-800/60 transition-colors ${
            completed ? 'line-through text-zinc-500' : 'text-zinc-300'
          }`}
        >
          {title}
        </button>
      )}

      <button
        onClick={onOpenDetail}
        title="Abrir detalle"
        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-indigo-400 transition-all"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}
