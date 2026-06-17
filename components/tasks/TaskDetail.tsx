'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Task, Project, Priority, TaskRecurrence, TaskRecurrenceKind } from '@/types'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useTranslation } from '@/hooks/useTranslation'
import { X, Plus, Trash2, CheckCircle2, ChevronRight, ArrowRightLeft, Check, GitMerge, Repeat, Bell, Copy } from 'lucide-react'
import { PRIORITY_COLORS } from '@/lib/utils/constants'
import { SubtaskDetailModal } from './SubtaskDetailModal'
import { recurrenceLabel } from '@/lib/utils/taskRecurrence'
import { sortSubtasks, type KanbanSort } from '@/lib/utils/taskSort'

interface Props {
  task: Task | null
  project: Project | null
  onClose: () => void
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']

export function TaskDetail({ task, project, onClose }: Props) {
  const { updateTask, addSubtask, toggleSubtask, deleteSubtask, updateSubtask, moveTask, projects, tasks, convertTaskToSubtask, duplicateTask, deleteTask } = useTasksStore()
  const { t, tStatus } = useTranslation()
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
  //
  // IMPORTANTE: solo escribimos al store si los buffers REALMENTE
  // difieren del valor actual. Antes esto disparaba un updateTask
  // incondicional al cerrar el modal, lo que generaba un push spurious
  // que podía pisar otros cambios (p. ej. una completeTask reciente
  // si el push llegaba antes que el pull devolviera el estado nuevo).
  useEffect(() => {
    return () => {
      const id = taskIdRef.current
      if (!id) return
      // Leemos el estado vivo al momento del unmount para comparar.
      const current = useTasksStore.getState().tasks[id]
      if (!current) return
      const patch: Partial<import('@/types').Task> = {}
      const newTitle = titleRef.current
      const newDesc  = descRef.current || undefined
      const newNotes = notesRef.current || undefined
      if (newTitle !== current.title) patch.title = newTitle
      if (newDesc !== (current.description || undefined)) patch.description = newDesc
      if (newNotes !== (current.notes || undefined)) patch.notes = newNotes
      if (Object.keys(patch).length === 0) return  // nada cambió → no spurious update
      updateTask(id, patch)
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

  // ── Scope prompt para edits sobre INSTANCIA HIJA recurrente ──
  // Si el user edita campos propagables (title, dueTime, durationMinutes,
  // description) en una HIJA, al cerrar el modal le preguntamos:
  // "solo esta instancia" o "toda la serie". Si elige "toda la serie",
  // el patch va a la madre y la lógica de updateTask propaga al resto.
  //
  // Patrón inspirado en GCal — la pregunta solo aparece si hubo cambios.
  type PropFields = 'title' | 'dueTime' | 'durationMinutes' | 'description'
  const isRecurringChild = !!(effective && effective.recurringHeadId && effective.recurringHeadId !== effective.id)
  // Snapshot ORIGINAL — capturamos los valores al abrir el modal y al
  // cambiar de tarea. Sirven de baseline para detectar diff al cerrar.
  const originalSnapshotRef = useRef<Record<PropFields, unknown>>({
    title: effective?.title,
    dueTime: effective?.dueTime,
    durationMinutes: effective?.durationMinutes,
    description: effective?.description,
  })
  useEffect(() => {
    originalSnapshotRef.current = {
      title: effective?.title,
      dueTime: effective?.dueTime,
      durationMinutes: effective?.durationMinutes,
      description: effective?.description,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id])

  const [scopePrompt, setScopePrompt] = useState<null | {
    motherId: string
    patch: Partial<Task>
  }>(null)

  /** Cierra el modal con el flujo correcto: si la task editada es una
   *  hija recurrente y hubo cambios en campos propagables, mostramos el
   *  scope prompt antes de cerrar. */
  const requestClose = () => {
    if (!effective) { onClose(); return }
    if (!isRecurringChild) { onClose(); return }
    const motherId = effective.recurringHeadId
    if (!motherId) { onClose(); return }
    // Diff vs snapshot original.
    const orig = originalSnapshotRef.current
    const patch: Partial<Task> = {}
    if (effective.title !== orig.title) patch.title = effective.title
    if (effective.dueTime !== orig.dueTime) patch.dueTime = effective.dueTime
    if (effective.durationMinutes !== orig.durationMinutes) patch.durationMinutes = effective.durationMinutes
    if ((effective.description ?? undefined) !== (orig.description ?? undefined)) patch.description = effective.description
    if (Object.keys(patch).length === 0) { onClose(); return }
    setScopePrompt({ motherId, patch })
  }

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

  // Pegar varios renglones → una subtarea por línea no-vacía.
  const handleSubtaskPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const lines = e.clipboardData.getData('text').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length > 1) {
      e.preventDefault()
      for (const line of lines) addSubtask(effective.id, line)
      setNewSubtask('')
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex justify-end"
        onClick={requestClose}
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg h-full overflow-y-auto"
          style={{
            // Panel lateral con glow violeta sutil desde la sup-izq +
            // glass base. Más prominente que el bg-white/[0.03] anterior.
            background: `
              radial-gradient(circle at 0% 0%, rgba(99, 102, 241, 0.08), transparent 50%),
              linear-gradient(180deg, rgba(20, 23, 30, 0.95), rgba(15, 17, 23, 0.98))
            `,
            borderLeft: '1px solid rgba(255, 255, 255, 0.10)',
            boxShadow: '-24px 0 48px -8px rgba(0,0,0,0.6)',
          }}
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
              {/* Duplicar task con todas sus subtareas — plantilla de
                  proceso. Cierra el modal y abre... bueno, no abre nada:
                  el user verá la copia en la lista del proyecto. */}
              <button
                onClick={() => {
                  const newId = duplicateTask(effective.id)
                  if (newId) onClose()
                }}
                className="text-zinc-500 hover:text-indigo-300 transition-colors shrink-0 mt-1"
                title="Duplicar tarea con todas sus subtareas (plantilla de proceso)"
              >
                <Copy className="w-5 h-5" />
              </button>
              {/* Eliminar — la única forma de borrar una tarea era ir al
                  task manager. Lo agregamos acá para poder eliminar
                  también desde calendario y desde cualquier otro lugar
                  que abra el detalle. Confirm antes de actuar. */}
              <button
                onClick={() => {
                  if (confirm(`¿Eliminar "${effective.title}" y todas sus subtareas?`)) {
                    deleteTask(effective.id)
                    onClose()
                  }
                }}
                className="text-zinc-500 hover:text-red-400 transition-colors shrink-0 mt-1"
                title="Eliminar tarea"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button onClick={requestClose} className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0 mt-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Banner "instancia recurrente" — solo cuando es una hija
                (recurringHeadId apunta a otra task). Avisa al user que
                los cambios pueden aplicarse a "solo esta" o "toda la
                serie" cuando cierre el modal. */}
            {isRecurringChild && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-indigo-500/8 border border-indigo-500/25 text-[11px] text-indigo-200/90">
                <Repeat className="w-3.5 h-3.5 mt-0.5 shrink-0 text-indigo-300" />
                <div>
                  <p className="font-semibold">Instancia de una serie recurrente</p>
                  <p className="text-[10px] text-indigo-300/70 mt-0.5">
                    Al cerrar te vamos a preguntar si los cambios (título, hora, duración, descripción) aplican a esta sola o a toda la serie.
                  </p>
                </div>
              </div>
            )}

            {/* Project — click to move task to another project */}
            <div className="relative">
              <button
                onClick={() => setShowMoveMenu((v) => !v)}
                className="flex items-center gap-2 group hover:bg-white/[0.05]/40 px-2 py-1 -mx-2 rounded-md transition-colors"
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
                  <div className="absolute left-0 top-full mt-1.5 z-20 min-w-[220px] bg-white/[0.03] border border-white/[0.12] rounded-lg shadow-2xl py-1 max-h-72 overflow-y-auto">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-3 py-2 border-b border-white/[0.08]">
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
                                : 'text-zinc-200 hover:bg-white/[0.05]'
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
                className="flex items-center gap-2 group hover:bg-white/[0.05]/40 px-2 py-1 -mx-2 rounded-md transition-colors"
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
                    <div className="absolute left-0 top-full mt-1.5 z-20 min-w-[260px] bg-white/[0.03] border border-white/[0.12] rounded-lg shadow-2xl py-1 max-h-72 overflow-y-auto">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-3 py-2 border-b border-white/[0.08]">
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
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/[0.05] transition-colors"
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
                      effective.status === s.label ? 'border-current' : 'border-white/[0.12] text-zinc-500 hover:border-zinc-500'
                    }`}
                    style={effective.status === s.label ? {
                      backgroundColor: s.color + '20',
                      borderColor: s.color,
                      color: s.color,
                    } : {}}
                  >
                    {tStatus(s.label)}
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
                        effective.priority === p ? 'border-current' : 'border-transparent text-zinc-500 hover:bg-white/[0.05]'
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
                        : 'border-white/[0.12] text-zinc-500 hover:border-zinc-500'
                    }`}
                  >
                    {day === 'today' ? t('tasks.today') : 'Tomorrow'}
                  </button>
                ))}
              </div>
            </div>

            {/* Due date + time + recurrence + notify lead time */}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">{t('tasks.dueDate')}</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={effective.dueDate ?? ''}
                  onChange={(e) => updateTask(effective.id, { dueDate: e.target.value || undefined })}
                  className="bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 flex-1"
                />
                <input
                  type="time"
                  value={effective.dueTime ?? ''}
                  onChange={(e) => updateTask(effective.id, { dueTime: e.target.value || undefined })}
                  disabled={!effective.dueDate}
                  title={effective.dueDate ? 'Hora opcional — habilita notificaciones con hora exacta y agrega al calendario' : 'Elegí primero una fecha'}
                  className="bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 w-28 disabled:opacity-40"
                />
              </div>
              {/* Botón "TRAER A HOY" — explícito y MANUAL. Solo aparece
                  cuando la tarea tiene fecha. Editar dueDate/dueTime ya
                  NO marca tardía automáticamente; el user puede reagendar
                  tranquilo. Este botón es la ÚNICA forma de flaggear
                  como tardía.
                    - Si la fecha era OTRO día (vencida clásica): mueve
                      dueDate a hoy + marca tardía con la fecha original.
                    - Si la fecha era HOY pero pasó el horario: ajusta
                      el dueTime a la hora actual + marca tardía.
                    - Si la tarea ya está en hoy y a futuro: igual
                      permite marcar como tardía (caso "ya empecé y se
                      me pasó por horas, lo cuento como tardía"). */}
              {effective.dueDate && (() => {
                const [y, m, d] = effective.dueDate.split('-').map(Number)
                const due = new Date(y, m - 1, d); due.setHours(0, 0, 0, 0)
                const today = new Date(); today.setHours(0, 0, 0, 0)
                const isDateOverdue = due.getTime() < today.getTime()
                const now = new Date()
                const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
                const nowHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
                return (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {!effective.rescheduledFrom && (
                      <button
                        onClick={() => {
                          // Captura la fecha (y hora si la había) original
                          // como referencia de cuándo era.
                          const original = effective.dueTime
                            ? `${effective.dueDate} ${effective.dueTime}`
                            : effective.dueDate
                          updateTask(effective.id, {
                            rescheduledFrom: original,
                            dueDate: todayYmd,
                            // Solo arrastramos a "ahora" la dueTime si la
                            // tarea ya tenía horario — si no tenía, no
                            // ponemos uno (sigue siendo to-do del día).
                            ...(effective.dueTime ? { dueTime: nowHm } : {}),
                          })
                        }}
                        title={isDateOverdue
                          ? 'No la hiciste el día que correspondía — la traemos a HOY y queda marcada como tardía'
                          : 'Marcar manualmente como tardía y traer a la hora actual'}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors bg-amber-500/10 border border-amber-500/40 text-amber-300 hover:bg-amber-500/20"
                      >
                        ⏱ Traer a HOY (marcar TARDÍA)
                      </button>
                    )}
                    {effective.rescheduledFrom && (
                      <span className="text-[10px] font-mono px-2 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                        ⚠ TARDÍA · era {effective.rescheduledFrom}
                        <button
                          onClick={() => updateTask(effective.id, { rescheduledFrom: undefined })}
                          className="ml-1.5 text-amber-400/60 hover:text-amber-200"
                          title="Quitar marca de tardía"
                        >×</button>
                      </span>
                    )}
                  </div>
                )
              })()}

              {/* Duration — solo aplica con dueTime. Sin hora una tarea es
                  to-do del día, no tiene duración. Default 1 hora. */}
              {effective.dueDate && effective.dueTime && (
                <div className="mt-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Duración</label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {[15, 30, 60, 90, 120].map((m) => {
                      const active = (effective.durationMinutes ?? 60) === m
                      return (
                        <button
                          key={m}
                          onClick={() => updateTask(effective.id, { durationMinutes: m })}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                            active
                              ? 'bg-indigo-500/20 border border-indigo-500/50 text-indigo-200'
                              : 'bg-zinc-800 border border-white/[0.12] text-zinc-400 hover:border-zinc-600'
                          }`}
                        >
                          {m < 60 ? `${m}m` : m === 60 ? '1h' : `${m / 60}h`}
                        </button>
                      )
                    })}
                    <input
                      type="number"
                      min={5} max={1440} step={5}
                      value={effective.durationMinutes ?? 60}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        if (Number.isFinite(v) && v > 0) updateTask(effective.id, { durationMinutes: v })
                      }}
                      className="w-20 bg-zinc-800 border border-white/[0.12] rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
                      title="Minutos custom"
                    />
                    <span className="text-[10px] text-zinc-600 self-center">min</span>
                  </div>
                </div>
              )}
            </div>

            {/* Recurrence */}
            <RecurrencePicker
              recurrence={effective.recurrence}
              onChange={(r) => updateTask(effective.id, { recurrence: r })}
              hasDueDate={!!effective.dueDate}
            />

            {/* Notify lead time (per-task override) — solo aplica si hay
                dueDate, porque sin fecha no hay nada que notificar. */}
            {effective.dueDate && (
              <NotifyLeadTimePicker
                notifyBeforeMinutes={effective.notifyBeforeMinutes}
                onChange={(m) => updateTask(effective.id, { notifyBeforeMinutes: m })}
              />
            )}

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
                className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            {/* Subtasks */}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">{t('tasks.subtasks')}</label>
              <div className="space-y-1.5 mb-2">
                {/* Sorted con el mismo modo elegido en la TasksPage para
                    consistencia (leído de localStorage). Default 'priority'
                    porque es el modo más usado y "urgente arriba" tiene
                    sentido cuando estás trabajando en una tarea. */}
                {(() => {
                  const mode: KanbanSort = typeof window !== 'undefined'
                    ? ((localStorage.getItem('overseer-tasks-kanban-sort') as KanbanSort) ?? 'priority')
                    : 'priority'
                  const roots = sortSubtasks(
                    effective.subtasks.filter((s) => !s.parentId && !s.archivedAt),
                    mode,
                    project,
                  )
                  return roots.map((sub) => (
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
                  ))
                })()}
              </div>
              <form onSubmit={handleAddSubtask} className="flex items-center gap-2">
                <input
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onPaste={handleSubtaskPaste}
                  placeholder={t('tasks.addSubtask')}
                  className="flex-1 bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-1.5 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
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
                className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 resize-none"
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

      {/* Scope prompt — pregunta "solo esta instancia" o "toda la serie"
          al cerrar el modal cuando estabas editando una HIJA recurrente
          y hubo cambios en campos propagables. Mismo patrón que el move/
          delete-scope de eventos GCal en CalendarPage. */}
      {scopePrompt && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => setScopePrompt(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-zinc-900/95 border border-white/[0.10] rounded-2xl shadow-2xl p-5"
          >
            <h3 className="text-sm font-bold text-white mb-1">
              Cambios en una instancia recurrente
            </h3>
            <p className="text-xs text-zinc-500 mb-4">
              Editaste {Object.keys(scopePrompt.patch).length} campo{Object.keys(scopePrompt.patch).length > 1 ? 's' : ''} de esta instancia. ¿Aplicar solo a esta o a toda la serie?
            </p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  // "Solo esta" — los cambios ya están aplicados a la
                  // hija (live edit). No hacemos nada más.
                  setScopePrompt(null)
                  onClose()
                }}
                className="w-full text-left px-3 py-2.5 bg-zinc-800 hover:bg-white/[0.08] rounded-lg text-sm text-zinc-200 transition-colors"
              >
                📌 Solo esta instancia
                <p className="text-[10px] text-zinc-500 mt-0.5">Los cambios quedan locales a esta tarea. Las hermanas y la madre no se tocan.</p>
              </button>
              <button
                onClick={() => {
                  // "Toda la serie" — re-aplicamos el patch a la MADRE.
                  // El updateTask propaga a hijas con dueDate >= today
                  // (incluyendo esta misma, que ya tiene los valores
                  // nuevos — la propagación es no-op sobre ella).
                  const { motherId, patch } = scopePrompt
                  updateTask(motherId, patch)
                  setScopePrompt(null)
                  onClose()
                }}
                className="w-full text-left px-3 py-2.5 bg-indigo-500/15 border border-indigo-500/40 hover:bg-indigo-500/25 rounded-lg text-sm text-indigo-300 transition-colors"
              >
                🔁 Toda la serie
                <p className="text-[10px] text-indigo-400/70 mt-0.5">Los cambios van a la madre y se propagan a las hijas próximas (dueDate ≥ hoy). Las pasadas no se tocan.</p>
              </button>
              <button
                onClick={() => setScopePrompt(null)}
                className="w-full px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Seguir editando
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
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
          className={`flex-1 text-sm text-left px-2 py-0.5 rounded hover:bg-white/[0.05]/60 transition-colors ${
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

// ─── RecurrencePicker ────────────────────────────────────────────────
/** Picker para configurar la regla de recurrencia de una tarea. Si la
 *  tarea no tiene dueDate, el picker queda deshabilitado con un hint —
 *  la recurrencia depende de tener una fecha base para calcular la
 *  próxima instancia. */
const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function RecurrencePicker({
  recurrence, onChange, hasDueDate,
}: {
  recurrence: TaskRecurrence | undefined
  onChange: (r: TaskRecurrence | undefined) => void
  hasDueDate: boolean
}) {
  const kind: TaskRecurrenceKind | 'none' = recurrence?.kind ?? 'none'
  const daysOfWeek = recurrence?.daysOfWeek ?? []

  const setKind = (k: TaskRecurrenceKind | 'none') => {
    if (k === 'none') return onChange(undefined)
    if (k === 'weekly') return onChange({ kind: 'weekly', daysOfWeek: daysOfWeek.length > 0 ? daysOfWeek : undefined, until: recurrence?.until })
    onChange({ kind: k, until: recurrence?.until })
  }
  const toggleDay = (d: number) => {
    const current = recurrence?.daysOfWeek ?? []
    const next = current.includes(d) ? current.filter((x) => x !== d) : [...current, d].sort()
    onChange({ ...(recurrence ?? { kind: 'weekly' }), kind: 'weekly', daysOfWeek: next.length > 0 ? next : undefined })
  }
  const setUntil = (until: string | undefined) => {
    if (!recurrence) return
    onChange({ ...recurrence, until })
  }

  const options: { value: TaskRecurrenceKind | 'none'; label: string }[] = [
    { value: 'none',     label: 'Sin repetición' },
    { value: 'daily',    label: 'Todos los días' },
    { value: 'weekdays', label: 'Lun-Vie' },
    { value: 'weekly',   label: 'Semanal · día(s)' },
    { value: 'monthly',  label: 'Cada mes' },
  ]

  return (
    <div>
      <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
        <Repeat className="w-3 h-3" /> Recurrencia
      </label>
      {!hasDueDate ? (
        <p className="text-[11px] text-zinc-600 italic">
          Asigná una fecha de vencimiento para habilitar la recurrencia.
        </p>
      ) : (
        <>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as TaskRecurrenceKind | 'none')}
            className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {kind === 'weekly' && (
            <div className="mt-2 flex flex-wrap gap-1">
              {DAY_LABELS.map((label, i) => {
                const active = daysOfWeek.includes(i)
                return (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className={`px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-colors ${
                      active ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'bg-white/[0.03] text-zinc-500 border border-white/[0.08] hover:border-white/[0.12]'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
              {daysOfWeek.length === 0 && (
                <p className="text-[10px] text-zinc-600 italic basis-full mt-1">
                  Sin días seleccionados → usa el día de la fecha base.
                </p>
              )}
            </div>
          )}

          {kind !== 'none' && (
            <div className="mt-2 flex items-center gap-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 whitespace-nowrap">
                Termina el
              </label>
              <input
                type="date"
                value={recurrence?.until ?? ''}
                onChange={(e) => setUntil(e.target.value || undefined)}
                className="flex-1 bg-zinc-800 border border-white/[0.12] rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
              />
              {recurrence?.until && (
                <button
                  onClick={() => setUntil(undefined)}
                  title="Repetir indefinidamente"
                  className="text-zinc-500 hover:text-zinc-200 p-1"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {recurrence && (
            <p className="text-[10px] text-zinc-600 mt-2 italic leading-relaxed">
              Te creamos solo las instancias de la semana en curso (<span className="text-zinc-400">{recurrenceLabel(recurrence)}</span>) —
              1 si es semanal, hasta 5 si es Lun-Vie, hasta 7 si es diaria, según los días que caen.
              Completar una NO crea otra. La semana siguiente se arma sola cuando abrís la app después del domingo.
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ─── NotifyLeadTimePicker ────────────────────────────────────────────
/** Override por-tarea del lead time de notificación. `undefined` = usar
 *  el global de Settings (notificationPrefs.taskDueLeadMinutes). Lista
 *  cerrada de opciones para evitar valores raros. */
const LEAD_TIME_OPTIONS: { value: number | undefined; label: string }[] = [
  { value: undefined, label: 'Usar default global' },
  { value: 0,         label: 'En el momento' },
  { value: 5,         label: '5 min antes' },
  { value: 15,        label: '15 min antes' },
  { value: 30,        label: '30 min antes' },
  { value: 60,        label: '1 hora antes' },
  { value: 120,       label: '2 horas antes' },
  { value: 240,       label: '4 horas antes' },
  { value: 24 * 60,   label: '1 día antes' },
  { value: 48 * 60,   label: '2 días antes' },
]

function NotifyLeadTimePicker({
  notifyBeforeMinutes, onChange,
}: {
  notifyBeforeMinutes: number | undefined
  onChange: (m: number | undefined) => void
}) {
  // El value del select usa string para que `undefined` quepa.
  const stringValue = notifyBeforeMinutes === undefined ? 'global' : String(notifyBeforeMinutes)
  return (
    <div>
      <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
        <Bell className="w-3 h-3" /> Notificarme
      </label>
      <select
        value={stringValue}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === 'global' ? undefined : parseInt(v, 10))
        }}
        className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
      >
        {LEAD_TIME_OPTIONS.map((o) => (
          <option key={o.value === undefined ? 'global' : o.value} value={o.value === undefined ? 'global' : String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      <p className="text-[10px] text-zinc-600 mt-1 italic">
        Sobrescribe el ajuste global de notificaciones para esta tarea.
      </p>
    </div>
  )
}
