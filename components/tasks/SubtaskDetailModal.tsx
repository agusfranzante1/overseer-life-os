'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trash2, Plus, CheckCircle2 } from 'lucide-react'
import { Priority, Subtask, Project, TaskRecurrence, TaskRecurrenceKind } from '@/types'
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
  const [dueTime, setDueTime] = useState(subtask.dueTime ?? '')
  const [durationMinutes, setDurationMinutes] = useState<number>(subtask.durationMinutes ?? 30)
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
  const dueTimeRef = useRef(dueTime)
  const durationRef = useRef(durationMinutes)
  const taskIdRef = useRef(taskId)
  const subtaskIdRef = useRef(subtask.id)
  titleRef.current = title
  notesRef.current = notes
  descRef.current  = description
  statusRef.current = status
  priorityRef.current = priority
  dueDateRef.current = dueDate
  dueTimeRef.current = dueTime
  durationRef.current = durationMinutes
  taskIdRef.current = taskId
  subtaskIdRef.current = subtask.id

  // Re-sync local state when the user navigates between subtasks O cuando
  // el status/completed cambia externamente (toggleSubtask desde el card,
  // checkbox, etc). Sin escuchar subtask.status, el ref local quedaba
  // stale y el cleanup useEffect lo escribía sobre el valor nuevo del
  // store → reversión visible.
  useEffect(() => {
    setTitle(subtask.title)
    setNotes(subtask.notes ?? '')
    setDescription(subtask.description ?? '')
    setStatus(subtask.status || project.statuses[0]?.label || 'To Do')
    setPriority(subtask.priority ?? '')
    setDueDate(subtask.dueDate ?? '')
    setDueTime(subtask.dueTime ?? '')
    setDurationMinutes(subtask.durationMinutes ?? 30)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtask.id, subtask.status, subtask.completed])

  // Persist any pending changes when this modal unmounts. Uses refs so
  // we read the LATEST values, not stale ones captured by the closure.
  //
  // BUG QUE ESTO ARREGLA — "se descompleta sola":
  // Antes este cleanup escribía status/priority/dueDate/etc INCONDICIONAL-
  // mente al cerrar. Si la subtask se completó externamente (toggle
  // desde TaskCard, click en checkbox), el react state local `status`
  // quedaba con el valor VIEJO (los setters solo corren cuando subtask.id
  // cambia). Al cerrar, statusRef.current SOBREESCRIBÍA el status nuevo
  // (Done) con el viejo (To Do) → revertía la completion.
  // Fix: comparamos contra el store live antes de patchear, y solo
  // mandamos los campos que realmente cambiaron en este modal.
  useEffect(() => {
    return () => {
      const id = taskIdRef.current
      const sid = subtaskIdRef.current
      if (!id || !sid) return
      const live = useTasksStore.getState().tasks[id]
      const liveSub = live?.subtasks.find((s) => s.id === sid)
      if (!liveSub) return
      const latestTitle = titleRef.current.trim() || titleRef.current
      const latestNotes = notesRef.current.trim() || undefined
      const latestDesc  = descRef.current.trim() || undefined
      const latestPrio  = priorityRef.current || undefined
      const latestDueD  = dueDateRef.current || undefined
      const latestDueT  = dueTimeRef.current || undefined
      const latestDur   = latestDueT ? durationRef.current : undefined
      const patch: Partial<import('@/types').Subtask> = {}
      if (latestTitle !== liveSub.title) patch.title = latestTitle
      if (latestNotes !== (liveSub.notes || undefined)) patch.notes = latestNotes
      if (latestDesc !== (liveSub.description || undefined)) patch.description = latestDesc
      // STATUS: solo patcheamos si el VALOR DEL MODAL cambió respecto al
      // que tenía cuando se abrió. Sin esto, una completion externa se
      // pisaba con el status viejo del buffer.
      if (statusRef.current !== liveSub.status) patch.status = statusRef.current
      if (latestPrio !== (liveSub.priority || undefined)) patch.priority = latestPrio
      if (latestDueD !== (liveSub.dueDate || undefined)) patch.dueDate = latestDueD
      if (latestDueT !== (liveSub.dueTime || undefined)) patch.dueTime = latestDueT
      if (latestDur !== (liveSub.durationMinutes || undefined)) patch.durationMinutes = latestDur
      if (Object.keys(patch).length === 0) return
      updateSubtask(id, sid, patch)
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
      dueTime: dueTime || undefined,
      durationMinutes: dueTime ? durationMinutes : undefined,
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
          className="w-full max-w-lg h-full overflow-y-auto"
          style={{
            background: `
              radial-gradient(circle at 0% 0%, rgba(99, 102, 241, 0.08), transparent 50%),
              linear-gradient(180deg, rgba(20, 23, 30, 0.95), rgba(15, 17, 23, 0.98))
            `,
            borderLeft: '1px solid rgba(255, 255, 255, 0.10)',
            boxShadow: '-24px 0 48px -8px rgba(0,0,0,0.6)',
          }}
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
                  : 'bg-zinc-800 border-white/[0.12] text-zinc-300 hover:bg-white/[0.08]'
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
                      status === s.label ? 'border-current' : 'border-white/[0.12] text-zinc-500 hover:border-zinc-500'
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
                    priority === '' ? 'border-zinc-500 text-zinc-300' : 'border-transparent text-zinc-600 hover:bg-white/[0.05]'
                  }`}>
                  — Sin urgencia
                </button>
                {PRIORITIES.map((p) => (
                  <button key={p}
                    onClick={() => { setPriority(p); updateSubtask(taskId, subtask.id, { priority: p }) }}
                    className={`text-xs px-2 py-1.5 rounded-lg text-left transition-all border ${
                      priority === p ? 'border-current' : 'border-transparent text-zinc-500 hover:bg-white/[0.05]'
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

            {/* Due date + time + duration — para que la subtarea aparezca
                como bloque timeado en el calendario (igual que las tareas
                madre). Solo se requiere fecha; hora + duración son opcionales. */}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">Fecha y hora</label>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  onBlur={save}
                  className="bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="time"
                  value={dueTime}
                  disabled={!dueDate}
                  onChange={(e) => setDueTime(e.target.value)}
                  onBlur={save}
                  className="bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={dueDate ? 'Hora opcional — si la ponés, aparece en el calendario' : 'Primero elegí una fecha'}
                />
                {dueTime && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-zinc-500">duración</span>
                    <input
                      type="number"
                      min={5}
                      step={5}
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(Math.max(5, Number(e.target.value) || 30))}
                      onBlur={save}
                      className="w-16 bg-zinc-800 border border-white/[0.12] rounded-lg px-2 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-xs text-zinc-500">min</span>
                  </div>
                )}
                {(dueDate || dueTime) && (
                  <button
                    onClick={() => {
                      setDueDate('')
                      setDueTime('')
                      updateSubtask(taskId, subtask.id, { dueDate: undefined, dueTime: undefined, durationMinutes: undefined })
                    }}
                    className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    quitar
                  </button>
                )}
              </div>
            </div>

            {/* Recurrence — mismo motor que tasks. Solo se ofrece si hay
                dueDate (sin fecha no hay ancla para "siguiente"). */}
            <SubtaskRecurrenceField
              dueDate={dueDate}
              recurrence={subtask.recurrence}
              onChange={(r) => updateSubtask(taskId, subtask.id, { recurrence: r })}
            />

            {/* Description — short context, surfaced in chips/tooltips */}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">Descripción</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={save}
                rows={2}
                placeholder="Contexto corto sobre esta subtarea..."
                className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 resize-none"
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
                className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 resize-none"
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
                        className={`flex-1 text-sm text-left px-2 py-0.5 rounded hover:bg-white/[0.05]/60 transition-colors ${
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
                    className="flex-1 bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-1.5 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
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

// Picker compacto de recurrencia para subtareas. Sin dueDate, mostramos
// un hint disabled. Con dueDate, exponemos los 4 kinds (daily, weekdays,
// weekly, monthly) + chips de días de la semana cuando kind='weekly'
// + tope opcional "until". Mismo modelo que RecurrencePicker de tasks
// — duplicamos en vez de reusar para evitar import circular.
function SubtaskRecurrenceField({
  dueDate, recurrence, onChange,
}: {
  dueDate: string
  recurrence: TaskRecurrence | undefined
  onChange: (r: TaskRecurrence | undefined) => void
}) {
  const KINDS: { value: TaskRecurrenceKind; label: string }[] = [
    { value: 'daily', label: 'Todos los días' },
    { value: 'weekdays', label: 'Lun a Vie' },
    { value: 'weekly', label: 'Semanal' },
    { value: 'monthly', label: 'Mensual' },
  ]
  const DAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
  const current = recurrence

  if (!dueDate) {
    return (
      <div>
        <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">Recurrencia</label>
        <p className="text-[11px] text-zinc-600 italic">Primero asigná una fecha para poder repetir esta subtarea.</p>
      </div>
    )
  }

  return (
    <div>
      <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">Recurrencia</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        <button
          onClick={() => onChange(undefined)}
          className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
            !current
              ? 'bg-zinc-800 border-white/[0.20] text-zinc-200'
              : 'bg-transparent border-white/[0.10] text-zinc-500 hover:text-zinc-300'
          }`}
        >No</button>
        {KINDS.map((k) => (
          <button key={k.value}
            onClick={() => onChange({ kind: k.value, ...(k.value === 'weekly' && current?.kind === 'weekly' ? { daysOfWeek: current.daysOfWeek } : {}) })}
            className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
              current?.kind === k.value
                ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200'
                : 'bg-transparent border-white/[0.10] text-zinc-500 hover:text-zinc-300'
            }`}
          >{k.label}</button>
        ))}
      </div>
      {current?.kind === 'weekly' && (
        <div className="flex items-center gap-1 mb-2">
          <span className="text-[10px] text-zinc-500 mr-1">Días:</span>
          {DAY_LABELS.map((lbl, idx) => {
            const active = (current.daysOfWeek ?? []).includes(idx)
            return (
              <button key={idx}
                onClick={() => {
                  const days = new Set(current.daysOfWeek ?? [])
                  if (active) days.delete(idx); else days.add(idx)
                  onChange({ ...current, daysOfWeek: Array.from(days).sort((a, b) => a - b) })
                }}
                className={`w-6 h-6 rounded text-[10px] font-bold transition-colors ${
                  active
                    ? 'bg-indigo-500/30 border border-indigo-500/60 text-indigo-200'
                    : 'bg-zinc-800 border border-white/[0.08] text-zinc-500 hover:text-zinc-300'
                }`}
              >{lbl}</button>
            )
          })}
        </div>
      )}
      {current && (
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <span>Hasta:</span>
          <input
            type="date"
            value={current.until ?? ''}
            onChange={(e) => onChange({ ...current, until: e.target.value || undefined })}
            className="bg-zinc-800 border border-white/[0.12] rounded px-2 py-0.5 text-[11px] text-zinc-300 focus:outline-none focus:border-indigo-500"
          />
          {current.until && (
            <button onClick={() => onChange({ ...current, until: undefined })} className="text-zinc-600 hover:text-red-400">×</button>
          )}
        </div>
      )}
    </div>
  )
}
