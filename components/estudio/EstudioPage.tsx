'use client'
import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, Plus, ChevronLeft, ChevronDown, ChevronRight,
  Pencil, Trash2, Calendar, X, BookOpen, Target,
} from 'lucide-react'
import { useTasksStore } from '@/lib/store/tasksStore'
import { TaskDetail } from '@/components/tasks/TaskDetail'
import type { Project, SubjectMeta, SubjectParcial, Task } from '@/types'

/** Genera un id corto para parciales. No usamos el genId del store
 *  porque no se exporta. Esto es suficiente para keys dentro del array. */
function genParcialId(): string {
  return 'pc_' + Math.random().toString(36).slice(2, 9)
}

// Paleta para nuevas materias — el user puede cambiarla después.
const SUBJECT_COLORS = [
  '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#a855f7',
  '#06b6d4', '#f97316', '#84cc16', '#ef4444', '#6366f1',
]

const SUBJECT_ICONS = ['📚', '📖', '🧮', '🔬', '🧪', '🧬', '⚖️', '🎨', '🎭', '🎼', '💻', '📐', '🗺️', '🏛️', '🧠']

export function EstudioPage() {
  const { projects, tasks, addProject, updateProject } = useTasksStore()
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Filtramos solo los proyectos type='subject' (las materias).
  const subjects = useMemo(() => {
    return Object.values(projects)
      .filter((p) => p.type === 'subject' && !p.archived)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [projects])

  // Migración one-shot: las materias creadas ANTES de tener el sistema
  // de container quedan top-level en el task manager. Las wireamos al
  // container "Estudios" en cuanto abrimos la página. Si todas ya están
  // wireadas, no toca nada. Idempotente. */
  useEffect(() => {
    const orphans = subjects.filter((s) => !s.parentProjectId)
    if (orphans.length === 0) return
    // Reusa container existente o crea uno.
    const existing = Object.values(projects).find(
      (p) => p.name === 'Estudios' && !p.parentProjectId && !p.archived,
    )
    const containerId = existing?.id ?? addProject({ name: 'Estudios', color: '#a855f7', description: undefined })
    if (!existing) updateProject(containerId, { icon: '🎓' })
    for (const o of orphans) {
      updateProject(o.id, { parentProjectId: containerId })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects.length])

  // Para cada materia computamos progreso: tasks done / total tasks (excluyendo archivadas).
  const subjectStats = useMemo(() => {
    const map = new Map<string, { total: number; done: number; pct: number }>()
    for (const subject of subjects) {
      const subjectTasks = subject.taskIds
        .map((id) => tasks[id])
        .filter((t): t is Task => !!t && !t.archivedAt)
      const total = subjectTasks.length
      const done = subjectTasks.filter((t) => !!t.completedAt).length
      const pct = total === 0 ? 0 : Math.round((done / total) * 100)
      map.set(subject.id, { total, done, pct })
    }
    return map
  }, [subjects, tasks])

  const selectedSubject = selectedSubjectId ? projects[selectedSubjectId] : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 space-y-6"
    >
      {selectedSubject && selectedSubject.type === 'subject' ? (
        <SubjectDetail
          subject={selectedSubject}
          onBack={() => setSelectedSubjectId(null)}
        />
      ) : (
        <>
          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight leading-none flex items-center gap-3">
                <GraduationCap className="w-8 h-8 text-fuchsia-400" />
                Estudio
              </h1>
              <p className="text-[13px] text-zinc-500">
                Materias, parciales y clases. Cada clase es una tarea del task manager.
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{
                background: 'linear-gradient(135deg, #d946ef, #a855f7)',
                boxShadow: '0 0 24px -8px rgba(217, 70, 239, 0.6), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
            >
              <Plus className="w-4 h-4" /> Nueva materia
            </motion.button>
          </div>

          {/* Grid de materias */}
          {subjects.length === 0 ? (
            <div
              className="rounded-2xl p-10 text-center"
              style={{
                background: 'var(--card-bg)',
                border: '1px dashed rgba(255, 255, 255, 0.10)',
              }}
            >
              <GraduationCap className="w-10 h-10 text-fuchsia-400/60 mx-auto mb-3" />
              <p className="text-sm font-semibold text-zinc-200 mb-1">Sin materias todavía</p>
              <p className="text-xs text-zinc-500 max-w-md mx-auto mb-4">
                Creá tu primera materia para empezar a organizar tus clases y parciales.
                Cada clase queda como una tarea del task manager con su fecha y duración.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-fuchsia-300 bg-fuchsia-500/15 border border-fuchsia-500/30 hover:bg-fuchsia-500/25 transition-all"
              >
                <Plus className="w-4 h-4" /> Crear materia
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {subjects.map((subject) => {
                const stats = subjectStats.get(subject.id) ?? { total: 0, done: 0, pct: 0 }
                return (
                  <SubjectCard
                    key={subject.id}
                    subject={subject}
                    stats={stats}
                    onClick={() => setSelectedSubjectId(subject.id)}
                    onDelete={() => {
                      // Confirm más detallado por el nivel de daño: la
                      // materia + sus clases (tareas hijas) se borran.
                      const taskCount = subject.taskIds.filter((id) => {
                        const t = tasks[id]
                        return t && !t.archivedAt
                      }).length
                      const detail = taskCount > 0
                        ? `\nEsto también elimina ${taskCount} clase${taskCount > 1 ? 's' : ''} de esta materia.`
                        : ''
                      if (confirm(`¿Eliminar la materia "${subject.name}"?${detail}\n\nNo se puede deshacer.`)) {
                        // Si estaba abierta como detail, cerrar antes de borrar.
                        if (selectedSubjectId === subject.id) setSelectedSubjectId(null)
                        useTasksStore.getState().deleteProject(subject.id)
                      }
                    }}
                  />
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Modal de crear materia */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateSubjectModal
            onClose={() => setShowCreateModal(false)}
            onCreated={(id) => {
              setShowCreateModal(false)
              setSelectedSubjectId(id)
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Subject Card ────────────────────────────────────────────────────

function SubjectCard({
  subject, stats, onClick, onDelete,
}: {
  subject: Project
  stats: { total: number; done: number; pct: number }
  onClick: () => void
  onDelete: () => void
}) {
  const meta = subject.subjectMeta
  const parciales = meta?.parciales ?? []
  return (
    <motion.div
      whileHover={{ scale: 1.01, y: -1 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className="relative group text-left rounded-2xl p-5 transition-all cursor-pointer"
      style={{
        background: `
          radial-gradient(circle at 0% 0%, ${subject.color}1f, transparent 50%),
          rgba(255, 255, 255, 0.025)
        `,
        borderTop: `2px solid ${subject.color}`,
        borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      }}
    >
      {/* Botón eliminar — solo al hover. Position absolute para no
          desarmar el layout de la card. stopPropagation para que el
          click no abra el detalle. */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        title="Eliminar materia"
        className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-red-400 hover:bg-red-500/10 z-10"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      <div className="flex items-start gap-3 mb-4">
        <div
          className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
          style={{
            background: `${subject.color}22`,
            border: `1px solid ${subject.color}40`,
          }}
        >
          <span>{subject.icon ?? '📚'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-white truncate">{subject.name}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
            {meta?.codigo && <span>{meta.codigo} · </span>}
            {meta?.cuatrimestre ?? meta?.institucion ?? 'Sin info'}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-zinc-500">
            {stats.done}/{stats.total} clases
          </span>
          <span className="font-mono font-semibold tabular-nums" style={{ color: subject.color }}>
            {stats.pct}%
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-fill)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${stats.pct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{
              background: `linear-gradient(90deg, ${subject.color}, ${subject.color}cc)`,
              boxShadow: `0 0 8px ${subject.color}88`,
            }}
          />
        </div>
      </div>

      {/* Parciales count */}
      {parciales.length > 0 && (
        <div className="flex items-center gap-1.5 mt-3 text-[10px] text-zinc-500">
          <Target className="w-3 h-3" />
          {parciales.length} {parciales.length === 1 ? 'parcial' : 'parciales'}
        </div>
      )}
    </motion.div>
  )
}

// ─── Subject Detail ──────────────────────────────────────────────────

function SubjectDetail({ subject, onBack }: { subject: Project; onBack: () => void }) {
  const { tasks, updateProject, addTask } = useTasksStore()
  const meta = subject.subjectMeta
  const parciales = useMemo(
    () => [...(meta?.parciales ?? [])].sort((a, b) => a.order - b.order),
    [meta?.parciales]
  )
  const [openParcialId, setOpenParcialId] = useState<string | null>(parciales[0]?.id ?? null)
  const [showAddParcial, setShowAddParcial] = useState(false)
  const [newParcialName, setNewParcialName] = useState('')
  const [showEditMeta, setShowEditMeta] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  // Tasks de esta materia, agrupadas por parcial (las sin parcialId van a "Sin parcial").
  const tasksByParcial = useMemo(() => {
    const map = new Map<string, Task[]>()
    map.set('__unassigned__', [])
    for (const p of parciales) map.set(p.id, [])
    for (const taskId of subject.taskIds) {
      const t = tasks[taskId]
      if (!t || t.archivedAt) continue
      const key = t.parcialId && map.has(t.parcialId) ? t.parcialId : '__unassigned__'
      map.get(key)!.push(t)
    }
    // Sort por dueDate dentro de cada parcial.
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    }
    return map
  }, [subject.taskIds, tasks, parciales])

  const addParcial = () => {
    const trimmed = newParcialName.trim()
    if (!trimmed) return
    const existing = meta?.parciales ?? []
    const newParcial: SubjectParcial = {
      id: genParcialId(),
      label: trimmed,
      order: existing.length,
    }
    const newMeta: SubjectMeta = {
      ...(meta ?? { parciales: [] }),
      parciales: [...existing, newParcial],
    }
    updateProject(subject.id, { subjectMeta: newMeta })
    setNewParcialName('')
    setShowAddParcial(false)
    setOpenParcialId(newParcial.id)
  }

  const removeParcial = (parcialId: string) => {
    if (!confirm('¿Eliminar parcial? Las clases asignadas vuelven a "Sin parcial".')) return
    const newMeta: SubjectMeta = {
      ...(meta ?? { parciales: [] }),
      parciales: (meta?.parciales ?? []).filter((p) => p.id !== parcialId),
    }
    updateProject(subject.id, { subjectMeta: newMeta })
    // Las tasks vinculadas a este parcial: limpiamos el parcialId.
    for (const taskId of subject.taskIds) {
      const t = tasks[taskId]
      if (t?.parcialId === parcialId) {
        useTasksStore.getState().updateTask(t.id, { parcialId: undefined })
      }
    }
  }

  const addClase = (parcialId: string | null) => {
    const titulo = prompt('Título de la clase / capítulo:')?.trim()
    if (!titulo) return
    const firstStatus = subject.statuses[0]?.label ?? 'To Do'
    addTask({
      projectId: subject.id,
      title: titulo,
      status: firstStatus,
      priority: 'medium',
      importance: 'medium',
      subtasks: [],
      parcialId: parcialId ?? undefined,
    })
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header de la materia */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <button
              onClick={onBack}
              className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid rgba(255, 255, 255, 0.10)',
              }}
              title="Volver"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div
              className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
              style={{
                background: `${subject.color}22`,
                border: `1px solid ${subject.color}40`,
              }}
            >
              <span>{subject.icon ?? '📚'}</span>
            </div>
            <div className="min-w-0 space-y-1">
              <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight leading-none truncate">
                {subject.name}
              </h1>
              <p className="text-[13px] text-zinc-500 truncate">
                {meta?.codigo && <span>{meta.codigo}</span>}
                {meta?.profesor && <span> · {meta.profesor}</span>}
                {meta?.cuatrimestre && <span> · {meta.cuatrimestre}</span>}
                {meta?.institucion && <span> · {meta.institucion}</span>}
                {!meta?.codigo && !meta?.profesor && !meta?.cuatrimestre && !meta?.institucion && (
                  <span className="italic">Sin info — click en editar para agregar profesor, código, cuatrimestre.</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEditMeta(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium text-zinc-300 hover:text-white transition-colors"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid rgba(255, 255, 255, 0.10)',
              }}
            >
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
            <button
              onClick={() => {
                const taskCount = subject.taskIds.filter((id) => {
                  const t = tasks[id]
                  return t && !t.archivedAt
                }).length
                const detail = taskCount > 0
                  ? `\nEsto también elimina ${taskCount} clase${taskCount > 1 ? 's' : ''} de esta materia.`
                  : ''
                if (confirm(`¿Eliminar la materia "${subject.name}"?${detail}\n\nNo se puede deshacer.`)) {
                  useTasksStore.getState().deleteProject(subject.id)
                  onBack()
                }
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium text-zinc-400 hover:text-red-300 transition-colors"
              style={{
                background: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid rgba(239, 68, 68, 0.20)',
              }}
              title="Eliminar materia"
            >
              <Trash2 className="w-3.5 h-3.5" /> Eliminar
            </button>
          </div>
        </div>

        {/* Parciales (collapsibles) */}
        <div className="space-y-3">
          {parciales.map((parcial) => {
            const parcialTasks = tasksByParcial.get(parcial.id) ?? []
            const done = parcialTasks.filter((t) => !!t.completedAt).length
            const total = parcialTasks.length
            const pct = total === 0 ? 0 : Math.round((done / total) * 100)
            const isOpen = openParcialId === parcial.id
            const color = parcial.color ?? subject.color
            return (
              <ParcialBlock
                key={parcial.id}
                parcial={parcial}
                color={color}
                tasks={parcialTasks}
                stats={{ done, total, pct }}
                isOpen={isOpen}
                onToggle={() => setOpenParcialId(isOpen ? null : parcial.id)}
                onAddClase={() => addClase(parcial.id)}
                onRemoveParcial={() => removeParcial(parcial.id)}
                onOpenTask={(t) => setSelectedTask(t)}
              />
            )
          })}

          {/* Sin parcial — solo si hay tasks ahí */}
          {(tasksByParcial.get('__unassigned__')?.length ?? 0) > 0 && (
            <ParcialBlock
              parcial={{ id: '__unassigned__', label: 'Sin parcial asignado', order: 9999 }}
              color="rgba(255, 255, 255, 0.20)"
              tasks={tasksByParcial.get('__unassigned__') ?? []}
              stats={(() => {
                const arr = tasksByParcial.get('__unassigned__') ?? []
                const done = arr.filter((t) => !!t.completedAt).length
                return { done, total: arr.length, pct: arr.length === 0 ? 0 : Math.round((done / arr.length) * 100) }
              })()}
              isOpen={openParcialId === '__unassigned__'}
              onToggle={() => setOpenParcialId(openParcialId === '__unassigned__' ? null : '__unassigned__')}
              onAddClase={() => addClase(null)}
              onRemoveParcial={null}
              onOpenTask={(t) => setSelectedTask(t)}
            />
          )}

          {/* + Nuevo parcial */}
          {showAddParcial ? (
            <div
              className="rounded-2xl p-4 flex items-center gap-2"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid rgba(255, 255, 255, 0.10)',
              }}
            >
              <input
                autoFocus
                value={newParcialName}
                onChange={(e) => setNewParcialName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addParcial()
                  if (e.key === 'Escape') { setShowAddParcial(false); setNewParcialName('') }
                }}
                placeholder='Ej. "Parcial 1", "Unidad 2 — Integrales", "Final"'
                className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-zinc-600"
              />
              <button
                onClick={addParcial}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-fuchsia-300 bg-fuchsia-500/15 border border-fuchsia-500/30 hover:bg-fuchsia-500/25 transition-all"
              >
                Agregar
              </button>
              <button
                onClick={() => { setShowAddParcial(false); setNewParcialName('') }}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddParcial(true)}
              className="w-full rounded-2xl py-3 text-[13px] font-medium text-zinc-400 hover:text-white transition-all flex items-center justify-center gap-2"
              style={{
                background: 'var(--card-bg)',
                border: '1px dashed rgba(255, 255, 255, 0.10)',
              }}
            >
              <Plus className="w-4 h-4" /> Agregar parcial
            </button>
          )}
        </div>
      </div>

      {/* Edit materia modal */}
      <AnimatePresence>
        {showEditMeta && (
          <EditSubjectMetaModal
            subject={subject}
            onClose={() => setShowEditMeta(false)}
          />
        )}
      </AnimatePresence>

      {/* TaskDetail modal */}
      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          project={subject}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </>
  )
}

// ─── Parcial Block ───────────────────────────────────────────────────

function ParcialBlock({
  parcial, color, tasks, stats, isOpen, onToggle, onAddClase, onRemoveParcial, onOpenTask,
}: {
  parcial: SubjectParcial
  color: string
  tasks: Task[]
  stats: { done: number; total: number; pct: number }
  isOpen: boolean
  onToggle: () => void
  onAddClase: () => void
  onRemoveParcial: (() => void) | null
  onOpenTask: (t: Task) => void
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        background: `
          radial-gradient(circle at 0% 0%, ${color}1a, transparent 50%),
          rgba(255, 255, 255, 0.025)
        `,
        borderLeft: `3px solid ${color}`,
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={onToggle} className="shrink-0 text-zinc-500 hover:text-zinc-200">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <button onClick={onToggle} className="flex-1 min-w-0 text-left">
          <p className="text-[14px] font-semibold text-white truncate">{parcial.label}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-3">
            <span>
              {stats.done}/{stats.total} clases
            </span>
            {parcial.examDate && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {parcial.examDate}
              </span>
            )}
          </p>
        </button>
        <span className="font-mono font-semibold tabular-nums text-[12px]" style={{ color }}>
          {stats.pct}%
        </span>
        {onRemoveParcial && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemoveParcial() }}
            className="text-zinc-600 hover:text-red-400 transition-colors"
            title="Eliminar parcial"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Mini progress bar */}
      <div className="px-5 pb-3">
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-fill)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${stats.pct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{ background: color }}
          />
        </div>
      </div>

      {/* Lista de clases */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 space-y-1.5">
              {tasks.length === 0 ? (
                <p className="text-[11px] text-zinc-600 italic py-2">Sin clases. Agregá la primera ↓</p>
              ) : (
                tasks.map((task) => (
                  <ClaseRow key={task.id} task={task} color={color} onOpen={() => onOpenTask(task)} />
                ))
              )}
              <button
                onClick={onAddClase}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] text-zinc-400 hover:text-white transition-all"
                style={{
                  background: 'var(--card-bg)',
                  border: '1px dashed rgba(255, 255, 255, 0.08)',
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Agregar clase
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Clase Row ───────────────────────────────────────────────────────

function ClaseRow({ task, color, onOpen }: { task: Task; color: string; onOpen: () => void }) {
  const { completeTask } = useTasksStore()
  const isDone = !!task.completedAt

  // Parse dueDate para mostrar.
  let dueLabel = ''
  if (task.dueDate) {
    const [y, m, d] = task.dueDate.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    dueLabel = date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', weekday: 'short' })
    if (task.dueTime) dueLabel += ` · ${task.dueTime}`
  }

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all"
      style={{
        background: isDone ? 'rgba(16, 185, 129, 0.06)' : 'var(--card-bg)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        opacity: isDone ? 0.7 : 1,
      }}
    >
      <button
        onClick={() => completeTask(task.id)}
        className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
          isDone ? 'text-emerald-400' : 'text-zinc-600 hover:text-emerald-400'
        }`}
        title={isDone ? 'Desmarcar' : 'Marcar como hecha'}
      >
        {isDone ? (
          <div
            className="w-3 h-3 rounded-full"
            style={{
              background: '#10b981',
              boxShadow: '0 0 6px rgba(16, 185, 129, 0.6)',
            }}
          />
        ) : (
          <div
            className="w-3 h-3 rounded-full"
            style={{ border: `1.5px solid ${color}88` }}
          />
        )}
      </button>
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <p className={`text-[13px] truncate ${isDone ? 'text-zinc-400 line-through' : 'text-zinc-200'}`}>
          {task.title}
        </p>
        {dueLabel && (
          <p className="text-[10px] text-zinc-600 mt-0.5 flex items-center gap-1">
            <Calendar className="w-2.5 h-2.5" /> {dueLabel}
          </p>
        )}
      </button>
      <button
        onClick={onOpen}
        className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors"
        title="Abrir detalle"
      >
        <BookOpen className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Create Subject Modal ────────────────────────────────────────────

/** Asegura que exista un proyecto raíz "Estudios" para colgar todas las
 *  materias debajo. Devuelve su id. Reusa el existente si ya está
 *  creado (busca por marker `type==='subject' && !parentProjectId` con
 *  nombre "Estudios" — convención simple). Así las materias no
 *  aparecen mezcladas en el task manager top-level. */
function useEnsureEstudiosContainer() {
  const { projects, addProject, updateProject } = useTasksStore()
  return () => {
    // Existente: marcado con name "Estudios" + sin parentProjectId.
    const existing = Object.values(projects).find(
      (p) => p.name === 'Estudios' && !p.parentProjectId && !p.archived,
    )
    if (existing) return existing.id
    const newId = addProject({ name: 'Estudios', color: '#a855f7', description: undefined })
    // Marcamos como container — no tiene type='subject' porque NO es una
    // materia, solo agrupa. Lo dejamos type='standard' para que si el user
    // quiere puede usarlo como proyecto normal también.
    updateProject(newId, { icon: '🎓' })
    return newId
  }
}

function CreateSubjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { addProject, updateProject } = useTasksStore()
  const ensureContainer = useEnsureEstudiosContainer()
  const [name, setName] = useState('')
  const [color, setColor] = useState(SUBJECT_COLORS[0])
  const [icon, setIcon] = useState(SUBJECT_ICONS[0])
  const [profesor, setProfesor] = useState('')
  const [codigo, setCodigo] = useState('')
  const [cuatrimestre, setCuatrimestre] = useState('')
  const [institucion, setInstitucion] = useState('')

  const handleCreate = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    // Aseguramos el container "Estudios" — si no existe lo crea, si
    // existe lo reusa. Las materias van debajo via parentProjectId, así
    // NO aparecen mezcladas en el task manager top-level.
    const containerId = ensureContainer()
    const id = addProject({ name: trimmed, color, description: undefined })
    // Inmediatamente actualizamos con type='subject' + meta + icon + parent.
    // addProject no acepta type/icon/parent en su signature minimalista, así
    // que vamos por updateProject.
    const meta: SubjectMeta = {
      profesor: profesor.trim() || undefined,
      codigo: codigo.trim() || undefined,
      cuatrimestre: cuatrimestre.trim() || undefined,
      institucion: institucion.trim() || undefined,
      parciales: [],
    }
    updateProject(id, {
      type: 'subject',
      icon,
      subjectMeta: meta,
      parentProjectId: containerId,
    })
    onCreated(id)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{
          background: `
            radial-gradient(circle at 0% 0%, rgba(217, 70, 239, 0.10), transparent 50%),
            linear-gradient(180deg, rgba(20, 23, 30, 0.98), rgba(15, 17, 23, 0.99))
          `,
          border: '1px solid rgba(255, 255, 255, 0.10)',
          boxShadow: '0 30px 80px -10px rgba(0,0,0,0.6)',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white">Nueva materia</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Nombre de la materia *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Análisis Matemático II"
              className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-fuchsia-500/40"
            />
          </div>

          {/* Icon picker */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Icono</label>
            <div className="flex flex-wrap gap-1.5">
              {SUBJECT_ICONS.map((ic) => (
                <button
                  key={ic}
                  onClick={() => setIcon(ic)}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${
                    icon === ic ? 'ring-2 ring-fuchsia-400' : ''
                  }`}
                  style={{
                    background: icon === ic ? 'rgba(217, 70, 239, 0.18)' : 'var(--card-bg)',
                    border: `1px solid ${icon === ic ? 'rgba(217, 70, 239, 0.40)' : 'rgba(255, 255, 255, 0.10)'}`,
                  }}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Color</label>
            <div className="flex flex-wrap gap-2">
              {SUBJECT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-all ${color === c ? 'ring-2 ring-white' : ''}`}
                  style={{ background: c, boxShadow: color === c ? `0 0 12px ${c}` : 'none' }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Meta — opcionales */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Profesor</label>
              <input
                value={profesor}
                onChange={(e) => setProfesor(e.target.value)}
                placeholder="Opcional"
                className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-fuchsia-500/40"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Código</label>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Opcional"
                className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-fuchsia-500/40"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Cuatrimestre</label>
              <input
                value={cuatrimestre}
                onChange={(e) => setCuatrimestre(e.target.value)}
                placeholder="Ej. 1C 2026"
                className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-fuchsia-500/40"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Institución</label>
              <input
                value={institucion}
                onChange={(e) => setInstitucion(e.target.value)}
                placeholder="Ej. UBA"
                className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-fuchsia-500/40"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-300 transition-colors"
            style={{
              background: 'var(--card-bg)',
              border: '1px solid rgba(255, 255, 255, 0.10)',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #d946ef, #a855f7)',
              boxShadow: '0 0 20px -6px rgba(217, 70, 239, 0.55), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            Crear materia
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Edit Subject Meta Modal ─────────────────────────────────────────

function EditSubjectMetaModal({ subject, onClose }: { subject: Project; onClose: () => void }) {
  const { updateProject } = useTasksStore()
  const meta = subject.subjectMeta
  const [name, setName] = useState(subject.name)
  const [color, setColor] = useState(subject.color)
  const [icon, setIcon] = useState(subject.icon ?? '📚')
  const [profesor, setProfesor] = useState(meta?.profesor ?? '')
  const [codigo, setCodigo] = useState(meta?.codigo ?? '')
  const [cuatrimestre, setCuatrimestre] = useState(meta?.cuatrimestre ?? '')
  const [institucion, setInstitucion] = useState(meta?.institucion ?? '')

  const save = () => {
    const newMeta: SubjectMeta = {
      ...(meta ?? { parciales: [] }),
      profesor: profesor.trim() || undefined,
      codigo: codigo.trim() || undefined,
      cuatrimestre: cuatrimestre.trim() || undefined,
      institucion: institucion.trim() || undefined,
    }
    updateProject(subject.id, {
      name: name.trim() || subject.name,
      color,
      icon,
      subjectMeta: newMeta,
    })
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{
          background: `
            radial-gradient(circle at 0% 0%, rgba(217, 70, 239, 0.10), transparent 50%),
            linear-gradient(180deg, rgba(20, 23, 30, 0.98), rgba(15, 17, 23, 0.99))
          `,
          border: '1px solid rgba(255, 255, 255, 0.10)',
          boxShadow: '0 30px 80px -10px rgba(0,0,0,0.6)',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white">Editar materia</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500/40"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Icono</label>
            <div className="flex flex-wrap gap-1.5">
              {SUBJECT_ICONS.map((ic) => (
                <button
                  key={ic}
                  onClick={() => setIcon(ic)}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${icon === ic ? 'ring-2 ring-fuchsia-400' : ''}`}
                  style={{
                    background: icon === ic ? 'rgba(217, 70, 239, 0.18)' : 'var(--card-bg)',
                    border: `1px solid ${icon === ic ? 'rgba(217, 70, 239, 0.40)' : 'rgba(255, 255, 255, 0.10)'}`,
                  }}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Color</label>
            <div className="flex flex-wrap gap-2">
              {SUBJECT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-all ${color === c ? 'ring-2 ring-white' : ''}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Profesor</label>
              <input value={profesor} onChange={(e) => setProfesor(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500/40" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Código</label>
              <input value={codigo} onChange={(e) => setCodigo(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500/40" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Cuatrimestre</label>
              <input value={cuatrimestre} onChange={(e) => setCuatrimestre(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500/40" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Institución</label>
              <input value={institucion} onChange={(e) => setInstitucion(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500/40" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-300"
            style={{
              background: 'var(--card-bg)',
              border: '1px solid rgba(255, 255, 255, 0.10)',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={save}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{
              background: 'linear-gradient(135deg, #d946ef, #a855f7)',
              boxShadow: '0 0 20px -6px rgba(217, 70, 239, 0.55), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            Guardar
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
