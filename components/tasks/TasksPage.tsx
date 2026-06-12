'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useTaskSnapshotsStore } from '@/lib/store/taskSnapshotsStore'
import { useTranslation } from '@/hooks/useTranslation'
import { Task, Project } from '@/types'
import { TaskCard } from './TaskCard'
import { TaskDetail } from './TaskDetail'
import { BreakdownModal } from './BreakdownModal'
import {
  Plus, FolderOpen, X, ChevronDown, ChevronRight, ChevronLeft, ChevronUp, Filter, Wand2, LayoutList, Columns3,
  Pencil, Trash2, MoreHorizontal, ArrowUpDown, RotateCcw, Check, Menu, Repeat,
} from 'lucide-react'
import { PROJECT_COLORS } from '@/lib/utils/constants'
import { effectivePriority } from '@/lib/utils/taskPriority'

/** Drawer wrapper that closes when the user swipes left more than 60px.
 *  Falls back to a plain div (no swipe handlers) when `enableSwipe` is
 *  false — desktop doesn't need this. The Y offset bounded to small values
 *  so vertical scroll inside the drawer still works normally.
 *
 *  Renders translate-X live so the user sees the drawer follow their finger
 *  before deciding to commit or snap back. */
function SwipeableDrawer({
  onSwipeClose, enableSwipe, className, children,
}: {
  onSwipeClose: () => void
  enableSwipe: boolean
  className?: string
  children: React.ReactNode
}) {
  const startXRef = useRef<number | null>(null)
  const startYRef = useRef<number | null>(null)
  const horizontalRef = useRef<boolean>(false)
  const [dragX, setDragX] = useState(0)

  if (!enableSwipe) {
    return <div className={className}>{children}</div>
  }

  return (
    <div
      className={className}
      style={{ transform: `translateX(${dragX}px)`, transition: dragX === 0 ? 'transform 0.18s ease-out' : 'none' }}
      onTouchStart={(e) => {
        const t = e.touches[0]
        startXRef.current = t.clientX
        startYRef.current = t.clientY
        horizontalRef.current = false
      }}
      onTouchMove={(e) => {
        if (startXRef.current === null || startYRef.current === null) return
        const t = e.touches[0]
        const dx = t.clientX - startXRef.current
        const dy = t.clientY - startYRef.current
        // Detect dominant direction once and lock it. Without this, a small
        // horizontal jitter on a vertical scroll would close the drawer.
        if (!horizontalRef.current && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
          // Vertical scroll — disengage drag entirely for this gesture.
          startXRef.current = null
          startYRef.current = null
          return
        }
        if (Math.abs(dx) > 8) horizontalRef.current = true
        if (horizontalRef.current) {
          // Only allow leftward drag (negative).
          setDragX(Math.min(0, dx))
        }
      }}
      onTouchEnd={() => {
        if (dragX < -60) {
          onSwipeClose()
        }
        setDragX(0)
        startXRef.current = null
        startYRef.current = null
        horizontalRef.current = false
      }}
    >
      {children}
    </div>
  )
}

function ProjectForm({ onAdd, onClose, t }: {
  onAdd: (name: string, description?: string) => void
  onClose: () => void
  t: (k: string) => string
}) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onAdd(name.trim(), desc.trim() || undefined); onClose() } }}
      className="bg-zinc-800 border border-white/[0.12] rounded-xl p-4 space-y-3"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('tasks.projectName')}
        className="w-full bg-white/[0.03] border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
      />
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder={`${t('tasks.description')} (${t('common.optional')})`}
        className="w-full bg-white/[0.03] border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
      />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="text-sm text-zinc-500 hover:text-zinc-300 px-3 py-1.5">
          {t('common.cancel')}
        </button>
        <button type="submit" className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors">
          {t('tasks.create')}
        </button>
      </div>
    </form>
  )
}

function NewTaskForm({ projectId, statuses, onAdd, onClose, t }: {
  projectId: string
  statuses: { id: string; label: string }[]
  onAdd: (title: string, projectId: string, status: string) => void
  onClose: () => void
  t: (k: string) => string
}) {
  const [title, setTitle] = useState('')
  const [justSaved, setJustSaved] = useState(false)

  // Single source of truth for "actually save the task". Called from BOTH
  // form onSubmit AND from the explicit Enter handler on the input.
  // On mobile, some soft keyboards' Enter doesn't reliably trigger form
  // submit, so we wire both paths and let whichever fires first win.
  const handleSave = () => {
    const trimmed = title.trim()
    if (!trimmed) {
      onClose()
      return
    }
    onAdd(trimmed, projectId, statuses[0]?.label ?? 'To Do')
    // Stay open so the user can keep adding tasks in a streak — clearing
    // the input is enough feedback. Briefly flash a checkmark to confirm.
    setTitle('')
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 1200)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        handleSave()
      }}
      className="flex items-stretch gap-1.5 mt-2"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('tasks.taskTitle')}
        // Hint the mobile keyboard to show "done"/return instead of next.
        enterKeyHint="done"
        autoCapitalize="sentences"
        autoComplete="off"
        // Belt-and-suspenders: some mobile keyboards' Enter blurs the input
        // without firing onSubmit on the form. Catch it here as well.
        onKeyDown={(e) => {
          if (e.key === 'Escape') { onClose(); return }
          if (e.key === 'Enter') {
            e.preventDefault()
            handleSave()
          }
        }}
        className="flex-1 min-w-0 bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
      />
      <button
        type="submit"
        title="Agregar (Enter)"
        className={`shrink-0 px-3 py-2 rounded-lg text-white text-xs font-semibold transition-all flex items-center gap-1 ${
          justSaved ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700'
        }`}
      >
        {justSaved ? <><Check className="w-3.5 h-3.5" /> ¡Listo!</> : <><Plus className="w-3.5 h-3.5" /> {t('tasks.create')}</>}
      </button>
      <button type="button" onClick={onClose}
        title="Cerrar (Esc)"
        className="shrink-0 px-2 py-2 text-zinc-500 hover:text-zinc-300 active:text-zinc-200">
        <X className="w-4 h-4" />
      </button>
    </form>
  )
}

// ─── Project Header — editable name/description + actions menu ────────────────

function ProjectHeader({ project, onRename, onUpdateDescription, onUpdateColor, onDelete }: {
  project: Project
  onRename: (name: string) => void
  onUpdateDescription: (description: string) => void
  onUpdateColor: (color: string) => void
  onDelete: () => void
}) {
  const [editingName, setEditingName] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [nameDraft, setNameDraft] = useState(project.name)
  const [descDraft, setDescDraft] = useState(project.description ?? '')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Resync drafts when the active project changes
  useEffect(() => { setNameDraft(project.name) }, [project.id, project.name])
  useEffect(() => { setDescDraft(project.description ?? '') }, [project.id, project.description])

  // Close the kebab menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const commitName = () => {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== project.name) onRename(trimmed)
    else setNameDraft(project.name)
    setEditingName(false)
  }
  const commitDesc = () => {
    const trimmed = descDraft.trim()
    if (trimmed !== (project.description ?? '')) onUpdateDescription(trimmed)
    setEditingDesc(false)
  }

  return (
    <div className="group">
      <div className="flex items-center gap-2 mb-1">
        <ColorDot color={project.color} onChange={onUpdateColor} />

        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitName() }
              if (e.key === 'Escape') { setNameDraft(project.name); setEditingName(false) }
            }}
            className="text-xl font-bold bg-transparent border-b border-indigo-500 text-white focus:outline-none px-0 py-0.5 min-w-0 flex-1"
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            title="Click para renombrar"
            className="text-xl font-bold text-white hover:text-indigo-300 transition-colors text-left truncate"
          >
            {project.name}
          </button>
        )}

        {project.isSystemProject && (
          <span
            className="text-[9px] font-mono uppercase tracking-wider text-fuchsia-300 bg-fuchsia-500/15 border border-fuchsia-500/30 px-1.5 py-0.5 rounded shrink-0"
            title={`Proyecto del sistema (${project.systemProjectKey ?? 'system'}) — gestionado automáticamente`}
          >
            sistema
          </span>
        )}
        {project.systemProjectKey === 'spi' && (
          <Link
            href="/spi"
            className="text-[10px] text-fuchsia-300/80 hover:text-fuchsia-200 hover:bg-fuchsia-500/10 px-2 py-0.5 rounded transition-colors shrink-0 flex items-center gap-1"
            title="Volver a la pestaña SPI"
          >
            ♾️ ir a SPI
          </Link>
        )}

        <button
          onClick={() => setEditingName(true)}
          title="Renombrar"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-zinc-200"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>

        <div className="relative ml-auto" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            title="Más"
            className="text-zinc-500 hover:text-zinc-200 p-1 rounded hover:bg-white/[0.05] transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-white/[0.03] border border-white/[0.12] rounded-lg shadow-xl py-1">
              <button
                onClick={() => { setMenuOpen(false); setEditingName(true) }}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.05] flex items-center gap-2"
              >
                <Pencil className="w-3.5 h-3.5" /> Renombrar
              </button>
              <button
                onClick={() => { setMenuOpen(false); setEditingDesc(true) }}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.05] flex items-center gap-2"
              >
                <Pencil className="w-3.5 h-3.5" /> Editar descripción
              </button>
              {!project.isSystemProject && (
                <>
                  <div className="my-1 border-t border-white/[0.08]" />
                  <button
                    onClick={() => { setMenuOpen(false); onDelete() }}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar proyecto
                  </button>
                </>
              )}
              {project.isSystemProject && (
                <>
                  <div className="my-1 border-t border-white/[0.08]" />
                  <div className="px-3 py-1.5 text-[10px] text-fuchsia-400/70 italic">
                    Proyecto del sistema — no se puede eliminar
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {editingDesc ? (
        <textarea
          autoFocus
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          onBlur={commitDesc}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitDesc() }
            if (e.key === 'Escape') { setDescDraft(project.description ?? ''); setEditingDesc(false) }
          }}
          rows={2}
          placeholder="Descripción del proyecto..."
          className="w-full bg-transparent text-sm text-zinc-400 border-b border-indigo-500 focus:outline-none resize-none px-0 py-0.5"
        />
      ) : project.description ? (
        <button
          onClick={() => setEditingDesc(true)}
          title="Click para editar descripción"
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors text-left"
        >
          {project.description}
        </button>
      ) : (
        <button
          onClick={() => setEditingDesc(true)}
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors opacity-0 group-hover:opacity-100"
        >
          + agregar descripción
        </button>
      )}
    </div>
  )
}

// Inline color picker — small dot that opens a swatches popover
function ColorDot({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Cambiar color del proyecto"
        className="w-3 h-3 rounded-full ring-offset-2 ring-offset-zinc-950 hover:ring-2 hover:ring-zinc-600 transition-all"
        style={{ backgroundColor: color }}
      />
      {open && (
        <div className="absolute left-0 top-full mt-2 z-20 p-3 bg-white/[0.03] border border-white/[0.12] rounded-xl shadow-2xl">
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">Color del proyecto</p>
          <div className="grid grid-cols-5 gap-2">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => { onChange(c); setOpen(false) }}
                title={c}
                className={`w-7 h-7 rounded-md transition-all ${
                  color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : 'hover:scale-110 hover:shadow-lg'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Sort mode used for list view, Kanban view, AND subtasks within each
// TaskCard. El mismo modo se propaga a los tres niveles (madre +
// subtask1 + subtask2). Para subtasks vive en `sortSubtasks` (util
// compartido). Acá mantenemos solo el sort de tasks top-level.
import type { KanbanSort } from '@/lib/utils/taskSort'

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function sortTasks(
  tasks: Task[],
  mode: KanbanSort,
  // Status order map: status label → numeric order. When sorting "by status" we
  // use the project's defined order if available. When tasks come from
  // multiple projects (All Projects view), the caller can pass null and we
  // fall back to alphabetical-by-status.
  statusOrder: Map<string, number> | null = null,
): Task[] {
  const arr = [...tasks]

  // Tiebreaker dentro del mismo bucket (misma prioridad, mismo status, etc).
  // Por convención del usuario: las tareas RECIÉN AGREGADAS se quedan al
  // final, las viejas arriba. Usa createdAt ascendente (más viejas primero).
  const ageTiebreak = (a: Task, b: Task) => a.createdAt.localeCompare(b.createdAt)

  // Dentro del mismo bucket de prioridad: tarea CON dueDate pesa más que
  // tarea sin nada. Entre dos con fecha, la más próxima primero (hoy >
  // mañana > la semana que viene). Esto evita el caso donde una tarea con
  // "vence hoy" queda por debajo de dos tareas sin urgencia ni fecha.
  const dueDateTiebreak = (a: Task, b: Task): number => {
    if (!a.dueDate && !b.dueDate) return 0
    if (!a.dueDate) return 1   // a sin fecha → abajo
    if (!b.dueDate) return -1  // b sin fecha → abajo
    return a.dueDate.localeCompare(b.dueDate)
  }

  // Mode-specific comparator (sin la regla "completadas arriba" que se
  // aplica como override después).
  const byMode = (a: Task, b: Task): number => {
    switch (mode) {
      case 'priority': {
        const pdiff = (PRIORITY_RANK[effectivePriority(a)] ?? 9) - (PRIORITY_RANK[effectivePriority(b)] ?? 9)
        if (pdiff !== 0) return pdiff
        const dd = dueDateTiebreak(a, b)
        if (dd !== 0) return dd
        return ageTiebreak(a, b)
      }
      case 'priorityAsc': {
        const pdiff = (PRIORITY_RANK[effectivePriority(b)] ?? 9) - (PRIORITY_RANK[effectivePriority(a)] ?? 9)
        if (pdiff !== 0) return pdiff
        const dd = dueDateTiebreak(a, b)
        if (dd !== 0) return dd
        return ageTiebreak(a, b)
      }
      case 'status': {
        if (statusOrder) {
          const oa = statusOrder.get(a.status) ?? 999
          const ob = statusOrder.get(b.status) ?? 999
          if (oa !== ob) return oa - ob
        }
        const sd = a.status.localeCompare(b.status)
        return sd !== 0 ? sd : ageTiebreak(a, b)
      }
      case 'statusReverse': {
        if (statusOrder) {
          const oa = statusOrder.get(a.status) ?? 999
          const ob = statusOrder.get(b.status) ?? 999
          if (oa !== ob) return ob - oa
        }
        const sd = b.status.localeCompare(a.status)
        return sd !== 0 ? sd : ageTiebreak(a, b)
      }
      case 'dueDate': {
        if (!a.dueDate && !b.dueDate) return ageTiebreak(a, b)
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        const dd = a.dueDate.localeCompare(b.dueDate)
        return dd !== 0 ? dd : ageTiebreak(a, b)
      }
      case 'alphabetical': {
        const td = a.title.localeCompare(b.title)
        return td !== 0 ? td : ageTiebreak(a, b)
      }
      case 'newest':
        return b.createdAt.localeCompare(a.createdAt)
      case 'oldest':
        return a.createdAt.localeCompare(b.createdAt)
      case 'manual':
      default:
        // En manual respetamos la posición del array (que el store
        // mantiene vía taskIds, con append al final en addTask).
        return 0
    }
  }

  return arr.sort((a, b) => {
    // Regla #1 (override siempre): las COMPLETADAS van arriba del todo
    // dentro de cada proyecto. Mirrors `sortSubtasks` para que tasks y
    // subtasks se comporten igual visualmente.
    const aDone = !!a.completedAt
    const bDone = !!b.completedAt
    if (aDone !== bDone) return aDone ? -1 : 1
    // Regla #2: dentro del bucket, comparator del modo activo.
    return byMode(a, b)
  })
}

// Sentinel — when selectedProjectId equals this, we're in the archive view
// instead of looking at a real project. Picked an unlikely-to-collide string.
const ARCHIVE_SENTINEL = '__archive__'
const RECURRING_SENTINEL = '__recurring__'

export function TasksPage() {
  const tasksStoreApi = useTasksStore()
  const {
    projects, tasks, selectedProjectId, setSelectedProject, addProject, addTask,
    updateProject, deleteProject,
  } = tasksStoreApi

  // Backfill one-shot del buffer recurrente: las tareas recurrentes
  // creadas antes de esta versión solo tienen 1 instancia visible. Al
  // entrar a /tasks llamamos ensureRecurringBuffer para cada tarea
  // recurrente activa, así la semana actual + la próxima quedan
  // visibles al toque. Idempotente: si ya están las fechas no duplica.
  // Corre 1 vez por mount.
  //
  // weeksAhead=2 — match con addTask/updateTask para que toda recurrente
  // activa siempre tenga "esta semana + próxima" precargadas, sin importar
  // por qué camino se renovó la cadena.
  useEffect(() => {
    const heads = Object.values(tasksStoreApi.tasks).filter(
      (t) => t.recurrence && t.dueDate && !t.archivedAt && !t.completedAt,
    )
    for (const t of heads) {
      tasksStoreApi.ensureRecurringBuffer(t.id, 14, 2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const { t, tStatus } = useTranslation()
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [newTaskProjectId, setNewTaskProjectId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showBreakdown, setShowBreakdown] = useState<{ task?: Task | null } | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>(() => {
    if (typeof window === 'undefined') return 'list'
    return (localStorage.getItem('overseer-tasks-view') as 'list' | 'kanban') ?? 'list'
  })
  const changeView = (v: 'list' | 'kanban') => {
    setViewMode(v)
    if (typeof window !== 'undefined') localStorage.setItem('overseer-tasks-view', v)
  }

  const [sortMode, setSortMode] = useState<KanbanSort>(() => {
    if (typeof window === 'undefined') return 'priority'
    return (localStorage.getItem('overseer-tasks-kanban-sort') as KanbanSort) ?? 'priority'
  })
  const changeSort = (s: KanbanSort) => {
    setSortMode(s)
    if (typeof window !== 'undefined') localStorage.setItem('overseer-tasks-kanban-sort', s)
  }

  const [projectsPanelCollapsed, setProjectsPanelCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    // On mobile, default to COLLAPSED — the inline w-64 panel eats most of
    // the screen otherwise. User can swipe/tap to open it as a drawer.
    if (window.matchMedia('(max-width: 639px)').matches) return true
    return localStorage.getItem('overseer-tasks-projects-collapsed') === '1'
  })
  const toggleProjectsPanel = () => {
    const next = !projectsPanelCollapsed
    setProjectsPanelCollapsed(next)
    if (typeof window !== 'undefined') localStorage.setItem('overseer-tasks-projects-collapsed', next ? '1' : '0')
  }

  // Detect mobile reactively. When in mobile, the expanded panel renders as
  // a fixed-position drawer overlay instead of an inline column.
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  // Helper used by project buttons — on mobile, auto-close drawer after
  // selecting a project (feels natural).
  const handleSelectProject = (id: string | null) => {
    setSelectedProject(id)
    if (isMobile) setProjectsPanelCollapsed(true)
  }
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  // ── Filter selections — PERSISTED to localStorage so they survive
  // page reloads / nav. The "general" set applies to the All-Projects
  // view; per-project sets are keyed by project id so each project
  // remembers its own filters independently. Clearing via the "limpiar"
  // button writes nulls back to the same key.
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  // Restore filters from localStorage on mount + whenever the user
  // switches between projects (or to/from the All-Projects view).
  const filterStorageKey = (() => {
    if (selectedProjectId === ARCHIVE_SENTINEL) return null  // archive view: no filters
    if (selectedProjectId === RECURRING_SENTINEL) return null  // recurring view: no filters
    return selectedProjectId
      ? `overseer-tasks-filters:project:${selectedProjectId}`
      : 'overseer-tasks-filters:all'
  })()

  // `loadedKey` tracks which key's filters we've finished loading for.
  // It prevents a race condition: when the key changes (e.g. navigating
  // between projects), the persist effect can fire BEFORE the load
  // effect's setState has propagated — which would overwrite the new
  // key's stored filters with the previous key's values. We skip the
  // persist until loadedKey === filterStorageKey.
  const [loadedKey, setLoadedKey] = useState<string | null>(null)

  useEffect(() => {
    if (!filterStorageKey || typeof window === 'undefined') {
      setStatusFilter(null); setPriorityFilter(null); setCategoryFilter(null)
      setLoadedKey(null)
      return
    }
    try {
      const raw = localStorage.getItem(filterStorageKey)
      if (!raw) {
        setStatusFilter(null); setPriorityFilter(null); setCategoryFilter(null)
      } else {
        const parsed = JSON.parse(raw) as { status?: string | null; priority?: string | null; category?: string | null }
        setStatusFilter(parsed.status ?? null)
        setPriorityFilter(parsed.priority ?? null)
        setCategoryFilter(parsed.category ?? null)
      }
    } catch {
      setStatusFilter(null); setPriorityFilter(null); setCategoryFilter(null)
    }
    setLoadedKey(filterStorageKey)
  }, [filterStorageKey])

  // Persist filter selections whenever they change — gated by loadedKey.
  useEffect(() => {
    if (loadedKey !== filterStorageKey) return  // load hasn't finished for this key
    if (!filterStorageKey || typeof window === 'undefined') return
    try {
      localStorage.setItem(filterStorageKey, JSON.stringify({
        status: statusFilter,
        priority: priorityFilter,
        category: categoryFilter,
      }))
    } catch { /* ignore quota errors */ }
  }, [loadedKey, filterStorageKey, statusFilter, priorityFilter, categoryFilter])

  // Proyectos top-level del task manager: excluimos los que tienen
  // parentProjectId (materias bajo "Estudios", piezas bajo "Contenido",
  // etc) para no mezclarlos con los proyectos regulares. Esos viven en
  // sus páginas especializadas (/estudio, /contenido) o dentro del
  // container abierto. Ordenados por `order` (manual) si está, sino
  // por createdAt (orden de inserción).
  const projectList = Object.values(projects)
    .filter((p) => !p.archived)
    .filter((p) => !p.parentProjectId)
    .sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) return a.order - b.order
      if (a.order !== undefined) return -1
      if (b.order !== undefined) return 1
      return a.createdAt.localeCompare(b.createdAt)
    })
  const inArchiveView = selectedProjectId === ARCHIVE_SENTINEL
  const inRecurringView = selectedProjectId === RECURRING_SENTINEL
  const activeProject = selectedProjectId && !inArchiveView && !inRecurringView ? projects[selectedProjectId] : null

  // Active (non-archived) tasks. Archive view uses its own filtered list.
  const getProjectTasks = (projectId: string) => {
    return Object.values(tasks).filter((t) => t.projectId === projectId && !t.archivedAt)
  }

  /** Project list re-sorted for the All-Projects view: projects with the
   *  most-urgent open task float to the top. This way a project with an
   *  URGENT or HIGH task never gets stuck at the bottom where you might
   *  miss it. Tiebreaker: existing project order (drag-and-drop).
   *
   *  Priority rank (higher = more urgent):
   *    urgent → 3 · high → 2 · medium → 1 · low / undefined → 0
   *  Done tasks are excluded — a completed urgent task doesn't bump
   *  the project anymore. */
  const PRIO_RANK: Record<string, number> = { urgent: 3, high: 2, medium: 1, low: 0 }
  /** Project list re-sorted: contamos CUÁNTAS open tasks de cada prioridad
   *  hay y comparamos vector-style (urgent count first, luego high, etc).
   *  Así un proyecto con 6 urgentes queda arriba de uno con 1 urgente —
   *  no solo "tiene urgentes" sino "tiene más". También consideramos la
   *  prioridad EFECTIVA (sube a 'high' si hija urgente) para que
   *  subtareas urgentes también empujen al padre arriba. */
  const projectListSortedByUrgency = useMemo(() => {
    const counts = new Map<string, [number, number, number, number]>() // [urgent, high, medium, low]
    for (const p of projectList) {
      const c: [number, number, number, number] = [0, 0, 0, 0]
      for (const t of getProjectTasks(p.id)) {
        const statusDef = p.statuses.find((st) => st.label === t.status)
        if (statusDef?.countsAsDone) continue
        const eff = effectivePriority(t)
        if (eff === 'urgent') c[0]++
        else if (eff === 'high') c[1]++
        else if (eff === 'medium') c[2]++
        else c[3]++
      }
      counts.set(p.id, c)
    }
    const indexed = projectList.map((p, i) => ({ p, i, c: counts.get(p.id)! }))
    indexed.sort((a, b) => {
      for (let k = 0; k < 4; k++) {
        if (b.c[k] !== a.c[k]) return b.c[k] - a.c[k]
      }
      return a.i - b.i
    })
    return indexed.map((x) => x.p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectList, tasks])

  // All archived tasks across projects, sorted newest-first by completedAt
  const archivedTasks = Object.values(tasks)
    .filter((t) => !!t.archivedAt)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))

  const passesFilters = (t: typeof tasks[string]) =>
    (statusFilter ? t.status === statusFilter : true) &&
    // Filtra por la prioridad EFECTIVA (escala a 'high' si tiene una
    // subtarea urgente abierta). Así una tarea madre con priority='low'
    // pero con sub1 urgent aparece cuando filtrás por "Alta".
    (priorityFilter ? effectivePriority(t) === priorityFilter : true) &&
    (categoryFilter ? (t.category ?? '') === categoryFilter : true)

  // Status order map for sortTasks: built from the active project's statuses
  // when a project is selected. In "All Projects" view we have no global
  // status order, so sortTasks falls back to alphabetical-by-status.
  const statusOrderMap = activeProject
    ? new Map(activeProject.statuses.map((s, i) => [s.label, i]))
    : null

  const displayedTasks = sortTasks(
    (activeProject
      ? getProjectTasks(activeProject.id)
      : Object.values(tasks).filter((t) => !t.archivedAt)
    ).filter(passesFilters),
    sortMode,
    statusOrderMap,
  )

  // All distinct categories used across (this project | all projects), for the filter dropdown
  const availableCategories = Array.from(new Set(
    (activeProject
      ? getProjectTasks(activeProject.id)
      : Object.values(tasks).filter((t) => !t.archivedAt)
    )
      .map((t) => t.category)
      .filter((c): c is string => !!c && c.trim().length > 0)
  )).sort()

  // All distinct status labels across all projects (used by the "All Projects"
  // status filter — each project has its own status set, so we union them).
  const availableStatuses = Array.from(new Set(
    Object.values(tasks)
      .filter((t) => !t.archivedAt)
      .map((t) => t.status)
      .filter((s): s is string => !!s && s.length > 0)
  )).sort()

  const toggleExpand = (id: string) =>
    setExpandedProjects((p) => ({ ...p, [id]: !p[id] }))

  const handleAddTask = (title: string, projectId: string, status: string) => {
    addTask({
      title,
      projectId,
      status,
      // Default to LOW priority — new tasks should start "off the radar"
      // unless the user explicitly bumps them. Importance also defaults to
      // low so the auto-sort doesn't surface every fresh capture to the top.
      priority: 'low',
      importance: 'low',
      subtasks: [],
      scheduledFor: 'today',
    })
  }

  const selectedTaskProject = selectedTask ? projects[selectedTask.projectId] : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      // `h-full` (was `h-[calc(100vh-60px)]`): the AppShell's main container
      // already sizes `flex-1 overflow-y-auto` to exactly the available
      // viewport space (accounting for the mobile top bar via the flex
      // layout). Hard-coding a 60px subtraction here was leaving a black
      // band at the bottom on routes that don't render a ChatBox.
      className="flex h-full overflow-hidden"
    >
      {/* Sidebar: Projects — collapsible */}
      {/* Collapsed icon rail — DESKTOP ONLY. On mobile we hide it entirely
          and instead show a sticky hamburger inside the main area (see below)
          since a 40px sidebar on a 360px phone is wasted estate. */}
      {projectsPanelCollapsed && (
        <div className="hidden sm:flex w-10 shrink-0 border-r border-white/[0.08] bg-black/30 flex-col items-center pt-4 gap-2">
          <button
            onClick={toggleProjectsPanel}
            title="Mostrar proyectos"
            className="w-7 h-7 rounded-lg bg-white/[0.03] hover:bg-white/[0.05] active:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {/* Project color dots — quick switcher */}
          <div className="flex flex-col gap-1.5 mt-3">
            <button onClick={() => setSelectedProject(null)} title={t('tasks.allProjects')}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                !selectedProjectId ? 'bg-zinc-800' : 'hover:bg-white/[0.03] active:bg-zinc-800'
              }`}>
              <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
            </button>
            {projectList.map((proj) => (
              <button key={proj.id} onClick={() => setSelectedProject(proj.id)}
                title={proj.name}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                  selectedProjectId === proj.id ? 'ring-2 ring-white/40' : 'hover:bg-white/[0.03] active:bg-zinc-800'
                }`}
                style={{ backgroundColor: `${proj.color}22` }}>
                <span className="text-[13px] font-bold leading-none" style={{ color: proj.color }}>
                  {proj.name.trim().charAt(0).toUpperCase() || '·'}
                </span>
              </button>
            ))}
            {/* Recurrentes + Papelera — entries colapsadas debajo del
                divisor. Recurrentes muestra todas las series con su head;
                el user edita o borra recurrencia desde ahí. */}
            <div className="mt-2 pt-2 border-t border-white/[0.08] w-full flex flex-col items-center gap-1.5">
              <button
                onClick={() => setSelectedProject(RECURRING_SENTINEL)}
                title="Recurrentes"
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                  inRecurringView ? 'bg-zinc-800 text-indigo-400' : 'text-zinc-500 hover:text-indigo-400 hover:bg-white/[0.03] active:bg-zinc-800'
                }`}
              >
                <Repeat className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setSelectedProject(ARCHIVE_SENTINEL)}
                title={`Papelera (${archivedTasks.length})`}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                  inArchiveView ? 'bg-zinc-800 text-amber-400' : 'text-zinc-500 hover:text-amber-400 hover:bg-white/[0.03] active:bg-zinc-800'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile floating "open projects" button — appears when collapsed.
          Sits at the top-left of the tasks viewport so it doesn't collide
          with the AppShell hamburger (which is at the top-left of the
          entire app on the sticky top bar). */}
      {projectsPanelCollapsed && (
        <button
          onClick={toggleProjectsPanel}
          aria-label="Mostrar proyectos"
          className="sm:hidden fixed top-14 left-3 z-30 w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 shadow-lg shadow-indigo-900/40 text-white flex items-center justify-center transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
      )}

      {/* Expanded panel — DRAWER overlay on mobile (with backdrop +
          swipe-to-close), INLINE column on desktop. The user can dismiss
          with the backdrop, the X button, swiping left, or by selecting
          a project (auto-closes on mobile via handleSelectProject). */}
      {!projectsPanelCollapsed && (
        <>
          {/* Mobile backdrop — tap to dismiss */}
          <div
            onClick={toggleProjectsPanel}
            className="sm:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />
          <SwipeableDrawer
            onSwipeClose={toggleProjectsPanel}
            enableSwipe={isMobile}
            className="
              fixed sm:relative inset-y-0 left-0 z-40 sm:z-auto
              w-72 sm:w-64 shrink-0 border-r border-white/[0.08] overflow-y-auto bg-black/30 p-4 shadow-2xl sm:shadow-none
            "
          >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={toggleProjectsPanel} title="Ocultar panel"
              className="text-zinc-600 hover:text-zinc-200">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              {t('tasks.projects')}
            </h2>
          </div>
          <button
            onClick={() => setShowProjectForm(!showProjectForm)}
            className="text-zinc-500 hover:text-indigo-400 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {showProjectForm && (
          <div className="mb-3">
            <ProjectForm
              onAdd={(name, desc) => addProject({ name, description: desc })}
              onClose={() => setShowProjectForm(false)}
              t={t}
            />
          </div>
        )}

        {/* All projects */}
        <button
          onClick={() => handleSelectProject(null)}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors mb-1 ${
            !selectedProjectId ? 'bg-indigo-600/20 text-indigo-400' : 'text-zinc-400 hover:bg-white/[0.05] active:bg-zinc-700 hover:text-zinc-200'
          }`}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          {t('tasks.allProjects')}
          <span className="ml-auto text-xs text-zinc-600">{Object.values(tasks).length}</span>
        </button>

        {projectList.map((proj) => {
          const taskCount = getProjectTasks(proj.id).length
          const doneCount = getProjectTasks(proj.id).filter((t) =>
            proj.statuses.find((s) => s.label === t.status)?.countsAsDone
          ).length
          const isActive = selectedProjectId === proj.id

          const idx = projectList.findIndex((p) => p.id === proj.id)
          const isFirst = idx === 0
          const isLast = idx === projectList.length - 1
          return (
            <div key={proj.id} className="mb-1">
              <div className="flex items-center group">
                <button
                  onClick={() => handleSelectProject(isActive ? null : proj.id)}
                  className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-white/[0.05] active:bg-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: proj.color }} />
                  <span className="flex-1 text-left truncate">{proj.name}</span>
                  <span className="text-xs text-zinc-600">{doneCount}/{taskCount}</span>
                </button>
                {/* Flechitas para reordenar — solo al hover. Si llega a un
                    borde, queda disabled. Estado persiste vía `proj.order`
                    en el store. */}
                <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); tasksStoreApi.reorderProject(proj.id, -1) }}
                    disabled={isFirst}
                    className="text-zinc-600 hover:text-zinc-300 disabled:opacity-25 disabled:cursor-not-allowed p-0.5 leading-none"
                    title="Subir"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); tasksStoreApi.reorderProject(proj.id, 1) }}
                    disabled={isLast}
                    className="text-zinc-600 hover:text-zinc-300 disabled:opacity-25 disabled:cursor-not-allowed p-0.5 leading-none"
                    title="Bajar"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {projectList.length === 0 && !showProjectForm && (
          <p className="text-xs text-zinc-600 text-center py-4">{t('tasks.noProjects')}</p>
        )}

        {/* Recurrentes — entry para ver/editar todas las series. */}
        <div className="mt-3 pt-3 border-t border-white/[0.08] space-y-1">
          <button
            onClick={() => handleSelectProject(RECURRING_SENTINEL)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              inRecurringView
                ? 'bg-indigo-500/10 text-indigo-300'
                : 'text-zinc-400 hover:bg-white/[0.05] active:bg-zinc-700 hover:text-indigo-300'
            }`}
          >
            <Repeat className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 text-left truncate">Recurrentes</span>
          </button>
          <button
            onClick={() => handleSelectProject(ARCHIVE_SENTINEL)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              inArchiveView
                ? 'bg-amber-500/10 text-amber-300'
                : 'text-zinc-400 hover:bg-white/[0.05] active:bg-zinc-700 hover:text-amber-300'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 text-left truncate">Papelera</span>
            <span className="text-xs text-zinc-600 tabular-nums">{archivedTasks.length}</span>
          </button>
        </div>
      </SwipeableDrawer>
      </>
      )}

      {/* Main: Tasks (or Archive / Recurring view) */}
      <div className="flex-1 overflow-y-auto p-6">
        {inRecurringView ? (
          <RecurringView
            tasks={Object.values(tasks)}
            projects={projects}
            onOpenTask={(t) => setSelectedTask(t)}
            onClose={() => setSelectedProject(null)}
          />
        ) : inArchiveView ? (
          <ArchiveView
            archivedTasks={archivedTasks}
            projects={projects}
            onClose={() => setSelectedProject(null)}
            onRestore={(id) => tasksStoreApi.restoreFromArchive(id)}
            onDelete={(id) => tasksStoreApi.deletePermanently(id)}
            onEmpty={() => tasksStoreApi.emptyArchive()}
          />
        ) : (
        <>
        {/* Header — restructured into two rows for breathing room.
            Row 1: project identity + primary actions.
            Row 2: view controls (mode + sort + filters). */}
        <div className="mb-5 space-y-3">
          {/* Row 1 — Identity + actions */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {activeProject ? (
                <ProjectHeader
                  project={activeProject}
                  onRename={(name) => updateProject(activeProject.id, { name })}
                  onUpdateDescription={(description) => updateProject(activeProject.id, { description })}
                  onUpdateColor={(color) => updateProject(activeProject.id, { color })}
                  onDelete={() => {
                    if (confirm(`¿Eliminar el proyecto "${activeProject.name}" y todas sus tareas?`)) {
                      deleteProject(activeProject.id)
                      setSelectedProject(null)
                    }
                  }}
                />
              ) : (
                <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight leading-none">{t('tasks.title')}</h1>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <SnapshotControls />
              <button
                onClick={() => setShowBreakdown({ task: null })}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.04] border border-white/[0.08] hover:border-indigo-400/40 hover:bg-indigo-500/10 text-zinc-200 hover:text-indigo-200 rounded-xl text-sm font-medium transition-all"
                title="Pedile a la IA que desglose una tarea en sub-pasos"
              >
                <Wand2 className="w-4 h-4" />
                Desglosar con IA
              </button>
              <button
                onClick={() => setNewTaskProjectId(activeProject?.id ?? projectList[0]?.id ?? null)}
                className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  boxShadow: '0 0 24px -8px rgba(99,102,241,0.6), inset 0 1px 0 rgba(255,255,255,0.15)',
                }}
              >
                <Plus className="w-4 h-4" />
                {t('tasks.newTask')}
              </button>
            </div>
          </div>

          {/* Row 2 — View / Sort / Filter controls (clearly separated) */}
          <div className="flex items-center gap-x-5 gap-y-2 flex-wrap pt-3 border-t border-white/[0.08]">
            {/* View mode toggle (segmented control) */}
            <div className="flex items-center bg-white/[0.03] border border-white/[0.08] rounded-lg p-0.5">
              <button onClick={() => changeView('list')}
                title="Vista lista"
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                  viewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-200'
                }`}>
                <LayoutList className="w-3.5 h-3.5" /> Lista
              </button>
              <button onClick={() => changeView('kanban')}
                title="Vista Kanban"
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                  viewMode === 'kanban' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-200'
                }`}>
                <Columns3 className="w-3.5 h-3.5" /> Kanban
              </button>
            </div>

            {/* Ordenar — visible in BOTH views */}
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400/80" />
              <select
                value={sortMode}
                onChange={(e) => changeSort(e.target.value as KanbanSort)}
                title="Ordenar tareas por"
                className="bg-white/[0.03] border border-emerald-900/40 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="priority">Urgencia ↓ (urgente arriba)</option>
                <option value="priorityAsc">Urgencia ↑ (urgente abajo)</option>
                <option value="status">Estado ↓</option>
                <option value="statusReverse">Estado ↑</option>
                <option value="dueDate">Fecha límite</option>
                <option value="alphabetical">Alfabético</option>
                <option value="newest">Más recientes</option>
                <option value="oldest">Más antiguas</option>
                <option value="manual">Sin orden (creación)</option>
              </select>
            </div>

            {/* Filtrar — list view only (kanban filters by status implicitly per column) */}
            {viewMode === 'list' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Filter className="w-3.5 h-3.5 text-blue-400/80" />

                {activeProject ? (
                  <select
                    value={statusFilter ?? ''}
                    onChange={(e) => setStatusFilter(e.target.value || null)}
                    title="Filtrar por estado"
                    className="bg-white/[0.03] border border-blue-900/40 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">{t('tasks.status')}: {t('common.all')}</option>
                    {activeProject.statuses.map((s) => (
                      <option key={s.id} value={s.label}>{tStatus(s.label)}</option>
                    ))}
                  </select>
                ) : availableStatuses.length > 0 && (
                  <select
                    value={statusFilter ?? ''}
                    onChange={(e) => setStatusFilter(e.target.value || null)}
                    title="Filtrar por estado (todos los proyectos)"
                    className="bg-white/[0.03] border border-blue-900/40 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Estado: todos</option>
                    {availableStatuses.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}

                <select
                  value={priorityFilter ?? ''}
                  onChange={(e) => setPriorityFilter(e.target.value || null)}
                  title="Filtrar por urgencia"
                  className="bg-white/[0.03] border border-blue-900/40 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Urgencia: toda</option>
                  <option value="urgent">Urgente</option>
                  <option value="high">Alta</option>
                  <option value="medium">Media</option>
                  <option value="low">Baja</option>
                </select>

                {availableCategories.length > 0 && (
                  <select
                    value={categoryFilter ?? ''}
                    onChange={(e) => setCategoryFilter(e.target.value || null)}
                    title="Filtrar por tipo"
                    className="bg-white/[0.03] border border-blue-900/40 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Tipo: todos</option>
                    {availableCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                )}

                {(statusFilter || priorityFilter || categoryFilter) && (
                  <button
                    onClick={() => { setStatusFilter(null); setPriorityFilter(null); setCategoryFilter(null) }}
                    title="Limpiar filtros"
                    className="text-[10px] font-mono uppercase tracking-wider text-blue-300 hover:text-blue-100 px-2 py-1 rounded hover:bg-blue-500/10 transition-colors"
                  >
                    limpiar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Top-of-page form — ONLY for the single-project KANBAN view.
            In list view the form lives at the bottom of the task list now
            (next to the inline "+ Nueva tarea" trigger). In All-Projects view
            it lives inside each project section. */}
        {newTaskProjectId && activeProject && viewMode === 'kanban' && (
          <div className="mb-4">
            <NewTaskForm
              projectId={newTaskProjectId}
              statuses={projects[newTaskProjectId]?.statuses ?? []}
              onAdd={handleAddTask}
              onClose={() => setNewTaskProjectId(null)}
              t={t}
            />
          </div>
        )}

        {/* Task list */}
        {activeProject ? (
          viewMode === 'kanban' ? (
            <KanbanBoard
              project={activeProject}
              // Apply priority/category filters before passing to kanban.
              // (Status filter is intentionally not applied here — each column
              // already represents one status, so it'd be confusing.)
              tasks={getProjectTasks(activeProject.id).filter((t) =>
                // Misma lógica que `passesFilters`: usa la prioridad
                // efectiva (escala a 'high' por subtarea urgente).
                (priorityFilter ? effectivePriority(t) === priorityFilter : true) &&
                (categoryFilter ? (t.category ?? '') === categoryFilter : true)
              )}
              sortMode={sortMode}
              onTaskClick={(t) => setSelectedTask(t)}
            />
          ) : (
            // Single project list view — same affordance as the All-Projects
            // sections: an always-visible "+ Nueva tarea en X" trigger at the
            // bottom. Tapping it swaps to the inline NewTaskForm in the same
            // slot. Removes the friction of having to scroll all the way up
            // to the top "+ tarea" button.
            <div className="space-y-2">
              {displayedTasks.length === 0 ? (
                <div className="text-center py-12 text-zinc-600">
                  <p>{t('tasks.noTasks')}</p>
                </div>
              ) : (
                displayedTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    project={activeProject}
                    onClick={() => setSelectedTask(task)}
                    subtaskSortMode={sortMode}
                  />
                ))
              )}
              {/* Bottom inline add — mirrors the per-project section pattern
                  used in the All-Projects view. When the user taps the top
                  "+ tarea" button, the same newTaskProjectId state opens the
                  form here too (we only render ONE form at a time, prioritizing
                  the bottom slot which is what the user actually expects). */}
              {newTaskProjectId === activeProject.id ? (
                <NewTaskForm
                  projectId={activeProject.id}
                  statuses={activeProject.statuses}
                  onAdd={handleAddTask}
                  onClose={() => setNewTaskProjectId(null)}
                  t={t}
                />
              ) : (
                <button
                  onClick={() => setNewTaskProjectId(activeProject.id)}
                  className="w-full text-left text-xs text-zinc-600 hover:text-indigo-300 hover:bg-indigo-500/5 active:bg-indigo-500/10 px-3 py-2.5 rounded-lg transition-colors flex items-center gap-2 opacity-60 hover:opacity-100 border border-dashed border-white/[0.08] hover:border-indigo-500/40"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nueva tarea en {activeProject.name}
                </button>
              )}
            </div>
          )
        ) : viewMode === 'kanban' ? (
          <AllProjectsKanban
            projects={projectList}
            // Pre-filter and pre-sort for All Projects kanban. Each column will
            // still split by status internally, so sort is applied first to
            // give a stable cross-project order within each status bucket.
            tasks={sortTasks(
              Object.values(tasks).filter((t) => !t.archivedAt).filter(passesFilters),
              sortMode,
              null,
            )}
            sortMode={sortMode}
            onTaskClick={(tk) => setSelectedTask(tk)}
          />
        ) : (
          // All projects grouped view — apply filters and sort PER project so
          // the toolbar controls actually take effect in the cross-project view.
          // Projects are ordered by HIGHEST priority of any open task they
          // contain so urgent stuff floats to the top and never gets buried.
          <div className="space-y-6">
            {projectListSortedByUrgency.map((proj) => {
              const projStatusOrder = new Map(proj.statuses.map((s, i) => [s.label, i]))
              const projTasks = sortTasks(
                getProjectTasks(proj.id).filter(passesFilters),
                sortMode,
                projStatusOrder,
              )
              const totalInProject = getProjectTasks(proj.id).length
              const expanded = expandedProjects[proj.id] !== false
              const done = projTasks.filter((t) =>
                proj.statuses.find((s) => s.label === t.status)?.countsAsDone
              ).length

              // Hide project section entirely if filters leave it empty AND
              // there ARE filters applied — otherwise empty projects (no
              // filter) keep showing so the user can still add tasks there.
              const anyFilterActive = !!(statusFilter || priorityFilter || categoryFilter)
              if (anyFilterActive && projTasks.length === 0) return null

              return (
                <div key={proj.id} className="group/section">
                  <div className="flex items-center gap-3 mb-3">
                    <button
                      onClick={() => toggleExpand(proj.id)}
                      className="flex items-center gap-2 flex-1"
                    >
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: proj.color }} />
                      <span className="text-sm font-semibold text-zinc-300">{proj.name}</span>
                      <span className="text-xs text-zinc-600">
                        {projTasks.length === totalInProject
                          ? `${done}/${totalInProject}`
                          : `${projTasks.length} de ${totalInProject}`}
                      </span>
                      {expanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />}
                    </button>
                    <button
                      onClick={() => {
                        // Form lives inside the expanded section now (at the
                        // bottom). If the project is collapsed, expand it
                        // first or the form would be hidden.
                        if (!expanded) toggleExpand(proj.id)
                        setNewTaskProjectId(proj.id)
                      }}
                      title={`Agregar tarea a ${proj.name}`}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-zinc-500 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors opacity-60 group-hover/section:opacity-100"
                      style={{ borderColor: `${proj.color}40` }}
                    >
                      <Plus className="w-3 h-3" />
                      <span className="hidden sm:inline">tarea</span>
                    </button>
                  </div>

                  {/* Form moved BELOW the task list — see inside AnimatePresence.
                      Used to render here at the top which was visually
                      confusing (new tasks actually get appended to the end). */}

                  <AnimatePresence>
                    {expanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="space-y-2 overflow-hidden"
                      >
                        {projTasks.length === 0 ? (
                          // Empty-state "agregar una" button OR the form
                          // itself if the user already clicked it.
                          newTaskProjectId === proj.id ? (
                            <NewTaskForm
                              projectId={proj.id}
                              statuses={proj.statuses}
                              onAdd={handleAddTask}
                              onClose={() => setNewTaskProjectId(null)}
                              t={t}
                            />
                          ) : (
                            <button
                              onClick={() => setNewTaskProjectId(proj.id)}
                              className="w-full text-left text-xs text-zinc-600 hover:text-indigo-300 hover:bg-indigo-500/5 pl-5 py-2 rounded-lg transition-colors flex items-center gap-2"
                            >
                              <Plus className="w-3 h-3" />
                              {t('tasks.noTasks')} — agregar una
                            </button>
                          )
                        ) : (
                          <>
                            {projTasks.map((task) => (
                              <TaskCard
                                key={task.id}
                                task={task}
                                project={proj}
                                onClick={() => setSelectedTask(task)}
                                subtaskSortMode={sortMode}
                              />
                            ))}
                            {/* The "add new task" affordance lives at the
                                BOTTOM of each project's list — matches where
                                the task actually ends up after creation.
                                Toggles between the subtle footer button and
                                the actual NewTaskForm in the same slot. */}
                            {newTaskProjectId === proj.id ? (
                              <NewTaskForm
                                projectId={proj.id}
                                statuses={proj.statuses}
                                onAdd={handleAddTask}
                                onClose={() => setNewTaskProjectId(null)}
                                t={t}
                              />
                            ) : (
                              <button
                                onClick={() => setNewTaskProjectId(proj.id)}
                                className="w-full text-left text-xs text-zinc-600 hover:text-indigo-300 hover:bg-indigo-500/5 px-3 py-2 rounded-lg transition-colors flex items-center gap-2 opacity-50 hover:opacity-100"
                              >
                                <Plus className="w-3 h-3" />
                                Nueva tarea en {proj.name}
                              </button>
                            )}
                          </>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        )}
        </>
        )}
      </div>

      {/* Task detail drawer */}
      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          project={selectedTaskProject}
          onClose={() => setSelectedTask(null)}
        />
      )}

      {/* AI Breakdown modal */}
      <AnimatePresence>
        {showBreakdown && (
          <BreakdownModal
            initialTask={showBreakdown.task ?? null}
            onClose={() => setShowBreakdown(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Kanban for a single project ─────────────────────────────────────────────

// ─── Recurring View (todas las series recurrentes) ───────────────────────────

/** Describe una regla de recurrencia en lenguaje humano corto. */
function describeRecurrence(r: import('@/types').TaskRecurrence): string {
  switch (r.kind) {
    case 'daily':    return 'Todos los días'
    case 'weekdays': return 'Lun → Vie'
    case 'weekly': {
      if (!r.daysOfWeek || r.daysOfWeek.length === 0) return 'Semanal'
      const labels = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
      const sorted = [...r.daysOfWeek].sort((a, b) => a - b)
      return `Semanal · ${sorted.map((d) => labels[d] ?? '?').join(' ')}`
    }
    case 'monthly':  return 'Mensual'
    default:         return 'Recurrente'
  }
}

/** Normaliza un título para matching de series: trim, lowercase, sin
 *  acentos. Sin esto, "Deep Thinking" y "deep thinking" se mostraban
 *  como dos series separadas porque el grouping era strict-equal. */
function normalizeTitle(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

type SeriesEntry =
  | {
      kind: 'task'
      key: string
      head: Task
      future: Task[]
    }
  | {
      kind: 'subtask'
      key: string
      parentTask: Task
      head: import('@/types').Subtask
      future: import('@/types').Subtask[]
    }

/** Vista "todas las tareas recurrentes" — una fila por serie. Cubre
 *  series de TAREAS TOP-LEVEL (matched por projectId + título normalizado)
 *  Y series de SUBTAREAS (matched por parentTaskId + título normalizado),
 *  porque las subtareas tienen su propio sistema de recurrence con spawn
 *  de hermanas dentro de la misma madre.
 *
 *  HEAD = instancia con `dueDate` más vieja no archivada. Es "la que
 *  manda" — borrar su recurrencia + nukear futuras detiene la cadena. */
function RecurringView({
  tasks, projects, onOpenTask, onClose,
}: {
  tasks: Task[]
  projects: Record<string, Project>
  onOpenTask: (t: Task) => void
  onClose: () => void
}) {
  const updateTask = useTasksStore((s) => s.updateTask)
  const updateSubtask = useTasksStore((s) => s.updateSubtask)
  const rebuildRecurringChain = useTasksStore((s) => s.rebuildRecurringChain)
  const deleteTask = useTasksStore((s) => s.deleteTask)
  const deleteSubtask = useTasksStore((s) => s.deleteSubtask)
  const mergeRecurringSeries = useTasksStore((s) => s.mergeRecurringSeries)

  // Picker para "unificar serie": guarda el headId source y el user elige
  // la target en un mini-modal. La unificación reasigna recurringHeadId.
  const [mergeSource, setMergeSource] = useState<null | { headId: string; title: string }>(null)

  const series: SeriesEntry[] = useMemo(() => {
    // ── 1) Series de TAREAS top-level.
    //    Permisivo a propósito: incluimos archivadas también — una madre
    //    archivada antes de que el modelo de "madre persistente" existiera
    //    (o archivada a mano por el user) sigue siendo el ancla de su
    //    serie. La vista la muestra con un badge "ARCHIVADA" para que el
    //    user sepa pero pueda actuar sobre la serie igual.
    const tasksById = new Map<string, Task>()
    for (const t of tasks) tasksById.set(t.id, t)
    const taskMap = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.recurrence) continue
      const key = t.recurringHeadId
        ? `head::${t.recurringHeadId}`
        : `legacy::${t.projectId}::${normalizeTitle(t.title)}`
      if (!taskMap.has(key)) taskMap.set(key, [])
      taskMap.get(key)!.push(t)
    }
    const taskSeries: SeriesEntry[] = Array.from(taskMap.entries()).map(([key, items]) => {
      // La MADRE explícita (recurringHeadId === id). Si no está en el
      // grupo (puede haber sido archivada o sin migrar), la madre efectiva
      // es la instancia con dueDate más vieja.
      const sorted = [...items].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
      const explicitMotherId = key.startsWith('head::') ? key.slice('head::'.length) : null
      const explicitMother = explicitMotherId
        ? sorted.find((t) => t.id === explicitMotherId) ?? tasksById.get(explicitMotherId)
        : null
      const head = explicitMother ?? sorted[0]
      const future = sorted.filter((t) => t.id !== head.id)
      return { kind: 'task' as const, key, head, future }
    })

    // ── 2) Series de SUBTASKS. Las hermanas viven dentro de la misma
    //    task madre — key: parentTaskId + título normalizado.
    //    Permisivo: incluimos subtasks recurrentes incluso si su task
    //    padre o ellas mismas están archivadas. Una subtask recurrente
    //    cuyo padre quedó archivado igual querés poder gestionarla.
    const subMap = new Map<string, { parent: Task; subs: import('@/types').Subtask[] }>()
    for (const t of tasks) {
      for (const sub of t.subtasks ?? []) {
        if (!sub.recurrence) continue
        const key = `subtask::${t.id}::${normalizeTitle(sub.title)}`
        if (!subMap.has(key)) subMap.set(key, { parent: t, subs: [] })
        subMap.get(key)!.subs.push(sub)
      }
    }
    const subSeries: SeriesEntry[] = Array.from(subMap.entries()).map(([key, { parent, subs }]) => {
      const sorted = [...subs].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
      return { kind: 'subtask' as const, key, parentTask: parent, head: sorted[0], future: sorted.slice(1) }
    })

    // ── 3) Ordenar todo por proyecto → título.
    const all = [...taskSeries, ...subSeries]
    return all.sort((a, b) => {
      const projA = a.kind === 'task' ? projects[a.head.projectId] : projects[a.parentTask.projectId]
      const projB = b.kind === 'task' ? projects[b.head.projectId] : projects[b.parentTask.projectId]
      const pa = projA?.name ?? ''
      const pb = projB?.name ?? ''
      if (pa !== pb) return pa.localeCompare(pb)
      const ta = a.head.title
      const tb = b.head.title
      return ta.localeCompare(tb)
    })
  }, [tasks, projects])

  const handleStopRecurrence = (entry: SeriesEntry) => {
    const title = entry.head.title
    const futureCount = entry.future.length
    const msg = futureCount > 0
      ? `¿Eliminar la recurrencia de "${title}"?\n\nVan a desaparecer ${futureCount} instancia${futureCount > 1 ? 's' : ''} futura${futureCount > 1 ? 's' : ''} todavía no completada${futureCount > 1 ? 's' : ''}. El HEAD se mantiene (sin recurrencia) y las completadas pasadas siguen en el historial.`
      : `¿Eliminar la recurrencia de "${title}"?\n\nEl HEAD se mantiene pero ya no se va a repetir.`
    if (!confirm(msg)) return
    if (entry.kind === 'task') {
      // Orden importa: limpiar recurrence ANTES de rebuildRecurringChain
      // — el post-set ensureBuffer dentro de rebuild re-genera la cadena
      // si la head todavía tiene recurrence. Con recurrence ya limpia,
      // no-opea. El filtro de futuras mira recurrence de CADA hija así
      // que las sigue encontrando igual.
      updateTask(entry.head.id, { recurrence: undefined })
      rebuildRecurringChain(entry.head.id)
    } else {
      // Subtarea: borramos recurrence del head + las hermanas futuras no
      // completadas. No hay equivalent a rebuildRecurringChain para
      // subtareas — las borramos a mano con deleteSubtask.
      updateSubtask(entry.parentTask.id, entry.head.id, { recurrence: undefined })
      for (const sub of entry.future) {
        if (sub.completedAt) continue  // no tocar las completadas pasadas
        deleteSubtask(entry.parentTask.id, sub.id)
      }
    }
  }

  const handleDeleteSeriesCompletely = (entry: SeriesEntry) => {
    const title = entry.head.title
    const futureCount = entry.future.length
    if (!confirm(`¿Eliminar la serie "${title}" COMPLETA (head + ${futureCount} futura${futureCount !== 1 ? 's' : ''})? No se puede deshacer salvo restaurando desde la papelera.`)) return
    if (entry.kind === 'task') {
      updateTask(entry.head.id, { recurrence: undefined })
      rebuildRecurringChain(entry.head.id)
      deleteTask(entry.head.id)
    } else {
      // Subtarea: borrar la madre y todas las futuras hermanas (incluso
      // las completadas no archivadas — el user pidió borrar TODO).
      updateSubtask(entry.parentTask.id, entry.head.id, { recurrence: undefined })
      for (const sub of entry.future) {
        deleteSubtask(entry.parentTask.id, sub.id)
      }
      deleteSubtask(entry.parentTask.id, entry.head.id)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
            <Repeat className="w-5 h-5 text-indigo-300" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Tareas recurrentes</h2>
            <p className="text-xs text-zinc-500">
              {series.length} serie{series.length !== 1 ? 's' : ''} activa{series.length !== 1 ? 's' : ''}
              {' · '}
              <span className="text-zinc-400">la head manda — borrar su recurrencia detiene la cadena</span>
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
          <X className="w-5 h-5" />
        </button>
      </div>

      {series.length === 0 ? (
        <div className="bg-white/[0.03] border border-dashed border-white/[0.10] rounded-2xl p-10 text-center">
          <Repeat className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-400">No hay tareas recurrentes todavía.</p>
          <p className="text-[11px] text-zinc-600 mt-1">
            Creá una tarea con fecha, abrí el detalle y elegí una recurrencia (Diaria, Semanal, etc.) — va a aparecer acá.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {series.map((entry) => {
            const head = entry.head
            const proj = entry.kind === 'task'
              ? projects[entry.head.projectId]
              : projects[entry.parentTask.projectId]
            const recDesc = head.recurrence ? describeRecurrence(head.recurrence) : ''
            const futureCount = entry.future.length
            return (
              <div
                key={entry.key}
                className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-3 flex items-start gap-3 hover:border-white/[0.16] transition-colors"
                style={{ borderLeft: `3px solid ${proj?.color ?? '#6366f1'}` }}
              >
                <button
                  onClick={() => {
                    // Task → abrir TaskDetail del head.
                    // Subtask → abrir TaskDetail de la madre (no hay
                    // modal exclusivo de subtask accesible desde acá; el
                    // user expande las subtasks dentro del detail).
                    if (entry.kind === 'task') onOpenTask(entry.head)
                    else onOpenTask(entry.parentTask)
                  }}
                  className="flex-1 min-w-0 text-left"
                  title={entry.kind === 'task'
                    ? 'Editar el HEAD (cambios al título/hora/etc. solo aplican a la head — las futuras ya están materializadas)'
                    : 'Abre la tarea madre — desde el detalle podés editar la subtarea recurrente HEAD'}
                >
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {entry.kind === 'subtask' && (
                      <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-700/40 border border-white/[0.08] text-zinc-400">
                        subtarea
                      </span>
                    )}
                    <span className="text-sm font-medium text-zinc-100 truncate">{head.title}</span>
                    <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">
                      <Repeat className="w-2.5 h-2.5 inline-block mr-1 -mt-0.5" />
                      {recDesc}
                    </span>
                    {head.archivedAt && (
                      <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300" title="La madre está archivada — la serie sigue persistiendo acá. Borrá la serie con 'Borrar todo' para limpiarla.">
                        archivada
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 flex-wrap">
                    <span style={{ color: proj?.color ?? '#6366f1' }}>{proj?.name ?? 'Sin proyecto'}</span>
                    {entry.kind === 'subtask' && (
                      <>
                        <span className="text-zinc-700">·</span>
                        <span className="text-zinc-400 italic">en &quot;{entry.parentTask.title}&quot;</span>
                      </>
                    )}
                    {head.dueDate && (
                      <>
                        <span className="text-zinc-700">·</span>
                        <span>head: {head.dueDate}{head.dueTime ? ` ${head.dueTime}` : ''}</span>
                      </>
                    )}
                    {futureCount > 0 && (
                      <>
                        <span className="text-zinc-700">·</span>
                        <span className="text-zinc-400">{futureCount} próxima{futureCount !== 1 ? 's' : ''}</span>
                      </>
                    )}
                    {head.recurrence?.until && (
                      <>
                        <span className="text-zinc-700">·</span>
                        <span className="text-amber-400/70">hasta {head.recurrence.until}</span>
                      </>
                    )}
                    {/* ID corto del head — necesario para diferenciar
                        cuando dos series tienen títulos casi iguales. */}
                    <span className="text-zinc-700">·</span>
                    <span className="font-mono text-zinc-600" title={`Head ID: ${head.id}`}>
                      #{head.id.slice(0, 6)}
                    </span>
                  </div>
                </button>
                <div className="flex flex-col gap-1 shrink-0">
                  {/* "Unificar" solo aplica a series de TAREAS top-level
                      (las de subtask viven dentro de una madre task,
                      el merge entre ellas requiere otro modelo). */}
                  {entry.kind === 'task' && (
                    <button
                      onClick={() => setMergeSource({ headId: entry.head.id, title: entry.head.title })}
                      title="Unir esta serie con otra (útil cuando una serie se partió en dos por un rename)"
                      className="text-[10px] font-semibold px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 transition-colors"
                    >
                      Unificar
                    </button>
                  )}
                  <button
                    onClick={() => handleStopRecurrence(entry)}
                    title="Borrar la recurrencia (mantiene el HEAD, elimina las futuras instancias)"
                    className="text-[10px] font-semibold px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-colors"
                  >
                    Detener recurrencia
                  </button>
                  <button
                    onClick={() => handleDeleteSeriesCompletely(entry)}
                    title="Borrar la serie completa (head + futuras). Las completadas pasadas siguen en el historial."
                    className="text-[10px] font-semibold px-2 py-1 rounded bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 transition-colors"
                  >
                    Borrar todo
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Picker para unificar series — el user eligió cuál source y
          tiene que elegir la target. Reasignamos todos los recurringHeadId
          de la source para que apunten a la target. La source mother
          pasa a ser una hija más. Después de unificar, si el user quiere
          el mismo título en todas, edita la madre target. */}
      {mergeSource && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => setMergeSource(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-zinc-900/95 border border-white/[0.10] rounded-2xl shadow-2xl p-5"
          >
            <h3 className="text-sm font-bold text-white mb-1">
              Unificar &quot;{mergeSource.title}&quot; con otra serie
            </h3>
            <p className="text-xs text-zinc-500 mb-4">
              Las tareas de esta serie van a pasar a depender de la madre que elijas. Sirve para arreglar series partidas por renames legacy.
            </p>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {series
                .filter((e) => e.kind === 'task' && e.head.id !== mergeSource.headId)
                .map((e) => {
                  if (e.kind !== 'task') return null
                  const proj = projects[e.head.projectId]
                  return (
                    <button
                      key={e.key}
                      onClick={() => {
                        const n = mergeRecurringSeries(mergeSource.headId, e.head.id)
                        setMergeSource(null)
                        if (n > 0) {
                          // Feedback minimal — el row del view se re-renderea
                          // solo porque el store cambió.
                          console.log(`[recurrentes] ${n} task(s) reasignadas a ${e.head.title}`)
                        }
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] hover:border-indigo-500/40 hover:bg-indigo-500/10 transition-colors text-left"
                      style={{ borderLeft: `3px solid ${proj?.color ?? '#6366f1'}` }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-100 truncate">{e.head.title}</p>
                        <p className="text-[10px] text-zinc-500">
                          {proj?.name ?? 'Sin proyecto'} · {1 + e.future.length} instancia{e.future.length !== 0 ? 's' : ''} · #{e.head.id.slice(0, 6)}
                        </p>
                      </div>
                    </button>
                  )
                })}
              {series.filter((e) => e.kind === 'task' && e.head.id !== mergeSource.headId).length === 0 && (
                <p className="text-xs text-zinc-500 text-center py-4">
                  No hay otras series para unificar.
                </p>
              )}
            </div>
            <button
              onClick={() => setMergeSource(null)}
              className="w-full mt-3 px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Cancelar
            </button>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  )
}

// ─── Archive View (papelera de completadas) ──────────────────────────────────

function ArchiveView({
  archivedTasks, projects, onClose, onRestore, onDelete, onEmpty,
}: {
  archivedTasks: Task[]
  projects: Record<string, Project>
  onClose: () => void
  onRestore: (id: string) => void
  onDelete: (id: string) => void
  onEmpty: () => void
}) {
  const handleEmpty = () => {
    if (archivedTasks.length === 0) return
    if (!confirm(`¿Eliminar permanentemente ${archivedTasks.length} tarea${archivedTasks.length !== 1 ? 's' : ''} archivada${archivedTasks.length !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) return
    onEmpty()
  }
  const handleDelete = (id: string, title: string) => {
    if (!confirm(`¿Eliminar permanentemente "${title}"? No se puede deshacer.`)) return
    onDelete(id)
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Trash2 className="w-5 h-5 text-amber-400" />
            <h1 className="text-3xl font-bold text-white tracking-tight">Papelera</h1>
            <span className="text-xs text-zinc-500 tabular-nums">
              ({archivedTasks.length} tarea{archivedTasks.length !== 1 ? 's' : ''})
            </span>
          </div>
          <p className="text-sm text-zinc-500">
            Tareas completadas que pasaron al archivo. Recuperalas o eliminalas para liberar espacio.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.12] text-zinc-400 hover:text-white rounded-lg text-sm transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Volver
          </button>
          {archivedTasks.length > 0 && (
            <button
              onClick={handleEmpty}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/30 hover:border-red-500/50 text-red-400 rounded-lg text-sm font-semibold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Vaciar papelera
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {archivedTasks.length === 0 && (
        <div className="text-center py-16 text-zinc-600">
          <Trash2 className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
          <p className="text-sm">La papelera está vacía.</p>
          <p className="text-xs text-zinc-700 mt-1">
            Las tareas completadas aparecerán acá al día siguiente.
          </p>
        </div>
      )}

      {/* List */}
      <div className="space-y-1.5">
        {archivedTasks.map((task) => {
          const proj = projects[task.projectId]
          const completedDate = task.completedAt
            ? new Date(task.completedAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—'
          return (
            <div
              key={task.id}
              className="group flex items-center gap-3 px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg hover:border-white/[0.12] transition-colors"
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: proj?.color ?? '#71717a' }}
                title={proj?.name ?? 'Proyecto eliminado'}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-300 truncate">{task.title}</p>
                <p className="text-[10px] font-mono text-zinc-600">
                  {proj?.name ?? 'sin proyecto'} · completada {completedDate}
                </p>
              </div>
              <button
                onClick={() => onRestore(task.id)}
                title="Recuperar — vuelve a tus tareas activas"
                className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-300 text-xs transition-all"
              >
                <RotateCcw className="w-3 h-3" /> Recuperar
              </button>
              <button
                onClick={() => handleDelete(task.id, task.title)}
                title="Eliminar permanentemente"
                className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function KanbanBoard({ project, tasks, sortMode, onTaskClick }: { project: Project; tasks: Task[]; sortMode: KanbanSort; onTaskClick: (t: Task) => void }) {
  const { updateTask } = useTasksStore()
  const { tStatus } = useTranslation()
  const [dragId, setDragId] = useState<string | null>(null)
  const columns = project.statuses.slice().sort((a, b) => a.order - b.order)
  // Estado de columnas ocultas — persistido por proyecto en localStorage
  // para que la preferencia sobreviva a reloads y sea independiente entre
  // proyectos (puede que en un proyecto quieras ocultar "Pausado" pero en
  // otro no). La key incluye el proj.id para esa separación.
  const storageKey = `overseer-kanban-hidden:${project.id}`
  const [hidden, setHidden] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = window.localStorage.getItem(storageKey)
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch { return new Set() }
  })
  const toggleHidden = (label: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label); else next.add(label)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, JSON.stringify(Array.from(next)))
      }
      return next
    })
  }

  const tasksByStatus = (label: string) => sortTasks(tasks.filter((t) => t.status === label), sortMode)
  const visibleColumns = columns.filter((c) => !hidden.has(c.label))

  return (
    <div className="space-y-2">
      {/* Barra de toggles para ocultar/mostrar columnas. Por defecto todas
          aparecen; click en una la oculta (queda en ghost). Re-click la
          devuelve. Sirve para enfocarte en menos columnas a la vez sin
          perder el contexto. */}
      <div className="flex items-center gap-1.5 flex-wrap pb-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mr-1">Columnas:</span>
        {columns.map((col) => {
          const isHidden = hidden.has(col.label)
          return (
            <button
              key={col.id}
              onClick={() => toggleHidden(col.label)}
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all flex items-center gap-1"
              style={{
                background: isHidden ? 'transparent' : `${col.color}20`,
                borderColor: isHidden ? 'rgba(255,255,255,0.10)' : col.color,
                color: isHidden ? '#71717a' : col.color,
                textDecoration: isHidden ? 'line-through' : 'none',
                opacity: isHidden ? 0.5 : 1,
              }}
              title={isHidden ? 'Click para mostrar' : 'Click para ocultar'}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: col.color }} />
              {tStatus(col.label)}
            </button>
          )
        })}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {visibleColumns.map((col) => {
            const colTasks = tasksByStatus(col.label)
            return (
              <div key={col.id}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragId) {
                    updateTask(dragId, { status: col.label })
                    setDragId(null)
                  }
                }}
                className="w-[22rem] shrink-0 bg-black/30 border border-white/[0.08] rounded-2xl p-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                    <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: col.color }}>{tStatus(col.label)}</h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-zinc-600">{colTasks.length}</span>
                    <button
                      onClick={() => toggleHidden(col.label)}
                      className="text-zinc-600 hover:text-zinc-300 transition-colors"
                      title="Ocultar esta columna"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {colTasks.length === 0 ? (
                    <p className="text-[10px] text-zinc-700 text-center py-4 italic">drop here</p>
                  ) : (
                    colTasks.map((task) => (
                      <div key={task.id}
                        draggable
                        onDragStart={() => setDragId(task.id)}
                        onDragEnd={() => setDragId(null)}
                        style={{ opacity: dragId === task.id ? 0.4 : 1, cursor: 'grab' }}>
                        <TaskCard task={task} project={project} onClick={() => onTaskClick(task)} subtaskSortMode={sortMode} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Kanban for ALL projects — groups by globally-shared status name ──────────

function AllProjectsKanban({ projects, tasks, sortMode, onTaskClick }: { projects: Project[]; tasks: Task[]; sortMode: KanbanSort; onTaskClick: (t: Task) => void }) {
  const { updateTask } = useTasksStore()
  const { tStatus } = useTranslation()
  const [dragId, setDragId] = useState<string | null>(null)
  // Misma key independiente para el All Projects kanban — separa la
  // preferencia de columnas ocultas del "por proyecto" individual.
  const storageKey = `overseer-kanban-hidden:__all__`
  const [hidden, setHidden] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = window.localStorage.getItem(storageKey)
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch { return new Set() }
  })
  const toggleHidden = (label: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(label.toLowerCase())) next.delete(label.toLowerCase())
      else next.add(label.toLowerCase())
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, JSON.stringify(Array.from(next)))
      }
      return next
    })
  }

  // Aggregate ALL unique status labels across projects (case-insensitive merge)
  const uniqueStatuses = (() => {
    const seen = new Map<string, { label: string; color: string }>()
    for (const p of projects) {
      for (const s of p.statuses) {
        const key = s.label.toLowerCase()
        if (!seen.has(key)) seen.set(key, { label: s.label, color: s.color })
      }
    }
    return Array.from(seen.values())
  })()

  const tasksByStatus = (label: string) =>
    sortTasks(tasks.filter((t) => t.status.toLowerCase() === label.toLowerCase()), sortMode)
  const visibleStatuses = uniqueStatuses.filter((c) => !hidden.has(c.label.toLowerCase()))

  return (
    <div className="space-y-2">
      {/* Toggles para ocultar columnas — mismo patrón que KanbanBoard. */}
      <div className="flex items-center gap-1.5 flex-wrap pb-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mr-1">Columnas:</span>
        {uniqueStatuses.map((col) => {
          const isHidden = hidden.has(col.label.toLowerCase())
          return (
            <button
              key={col.label}
              onClick={() => toggleHidden(col.label)}
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all flex items-center gap-1"
              style={{
                background: isHidden ? 'transparent' : `${col.color}20`,
                borderColor: isHidden ? 'rgba(255,255,255,0.10)' : col.color,
                color: isHidden ? '#71717a' : col.color,
                textDecoration: isHidden ? 'line-through' : 'none',
                opacity: isHidden ? 0.5 : 1,
              }}
              title={isHidden ? 'Click para mostrar' : 'Click para ocultar'}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: col.color }} />
              {tStatus(col.label)}
            </button>
          )
        })}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {visibleStatuses.map((col) => {
            const colTasks = tasksByStatus(col.label)
            return (
              <div key={col.label}
                onDragOver={(e) => { e.preventDefault() }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragId) {
                    updateTask(dragId, { status: col.label })
                    setDragId(null)
                  }
                }}
                className="w-[22rem] shrink-0 bg-black/30 border border-white/[0.08] rounded-2xl p-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                    <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: col.color }}>{tStatus(col.label)}</h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-zinc-600">{colTasks.length}</span>
                    <button
                      onClick={() => toggleHidden(col.label)}
                      className="text-zinc-600 hover:text-zinc-300 transition-colors"
                      title="Ocultar esta columna"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {colTasks.length === 0 ? (
                    <p className="text-[10px] text-zinc-700 text-center py-4 italic">drop here</p>
                  ) : (
                    colTasks.map((task) => {
                      const proj = projects.find((p) => p.id === task.projectId)
                      if (!proj) return null
                      return (
                        <div key={task.id}
                          draggable
                          onDragStart={() => setDragId(task.id)}
                          onDragEnd={() => setDragId(null)}
                          style={{ opacity: dragId === task.id ? 0.4 : 1, cursor: 'grab' }}>
                          <TaskCard task={task} project={proj} onClick={() => onTaskClick(task)} showProjectBadge subtaskSortMode={sortMode} />
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Snapshot manual — "Guardar ahora" / "Cargar última versión"
//
// El user clickea "Guardar ahora" para crear un punto fijo de
// proyectos+tareas antes de probar algo riesgoso o de moverse a otro
// dispositivo. "Cargar última versión" abre un dropdown con los
// snapshots locales+remotos para restaurar el que quiera. Sirve como
// red de seguridad contra bugs de sync o cambios destructivos.
// ────────────────────────────────────────────────────────────────────────
function SnapshotControls() {
  const { snapshots, saveNow, restore, remove, pullRemote } = useTaskSnapshotsStore()
  const [busy, setBusy] = useState<'saving' | 'pulling' | null>(null)
  const [openList, setOpenList] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const showFeedback = (msg: string) => {
    setFeedback(msg)
    setTimeout(() => setFeedback(null), 2500)
  }

  const handleSave = async () => {
    setBusy('saving')
    try {
      const label = window.prompt('Etiqueta opcional para este snapshot (ej. "antes de probar X"):', '')?.trim() || undefined
      await saveNow(label)
      showFeedback('✓ Guardado')
    } finally {
      setBusy(null)
    }
  }

  const handleOpenList = async () => {
    if (!openList) {
      setBusy('pulling')
      await pullRemote().catch(() => undefined)
      setBusy(null)
    }
    setOpenList((v) => !v)
  }

  const handleRestore = (snapId: string, label?: string, createdAt?: string) => {
    const when = createdAt ? new Date(createdAt).toLocaleString() : '?'
    if (!confirm(`Reemplazar TODOS los proyectos y tareas con el snapshot "${label ?? when}"?\n\nEsto sobreescribe lo que tenés ahora. (los datos actuales NO se guardan automáticamente — guardá un snapshot antes si querés volver)`)) return
    const ok = restore(snapId)
    showFeedback(ok ? '✓ Restaurado' : '⚠ No se pudo restaurar')
    setOpenList(false)
  }

  return (
    <div className="relative flex items-center gap-1.5">
      <button
        onClick={handleSave}
        disabled={busy === 'saving'}
        title="Guardar copia inmutable de proyectos+tareas (local + remota)"
        className="flex items-center gap-1.5 px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50 text-emerald-200 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
      >
        💾 {busy === 'saving' ? 'Guardando…' : 'Guardar ahora'}
      </button>
      <button
        onClick={handleOpenList}
        title="Ver snapshots y restaurar una versión anterior"
        className="flex items-center gap-1.5 px-3 py-2.5 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500/50 text-amber-200 rounded-xl text-xs font-semibold transition-all"
      >
        ⏮ Cargar versión
      </button>

      {feedback && (
        <span className="absolute -bottom-7 right-0 text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-white/[0.12] text-zinc-300 whitespace-nowrap">
          {feedback}
        </span>
      )}

      {openList && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpenList(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-80 max-h-96 overflow-y-auto rounded-xl border border-white/[0.12] shadow-2xl"
            style={{ background: '#11151c', boxShadow: '0 10px 32px -8px rgba(0,0,0,0.75)' }}
          >
            <div className="p-3 border-b border-white/[0.08] flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Snapshots</span>
              <span className="text-[10px] text-zinc-500">{busy === 'pulling' ? 'Sincronizando…' : `${snapshots.length} guardados`}</span>
            </div>
            {snapshots.length === 0 ? (
              <div className="p-4 text-xs text-zinc-500 text-center">
                No hay snapshots todavía.<br />Tocá "Guardar ahora" para crear el primero.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {snapshots.map((s) => {
                  const projCount = Object.keys(s.projects).length
                  const taskCount = Object.keys(s.tasks).length
                  return (
                    <div key={s.id} className="px-3 py-2.5 hover:bg-white/[0.03] flex items-center gap-2 group">
                      <button
                        onClick={() => handleRestore(s.id, s.label, s.createdAt)}
                        className="flex-1 text-left"
                      >
                        <div className="text-xs font-semibold text-zinc-200 truncate">
                          {s.label ?? new Date(s.createdAt).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-zinc-500 flex items-center gap-2 mt-0.5">
                          {s.label && <span>{new Date(s.createdAt).toLocaleString()}</span>}
                          <span>· {projCount} proyectos · {taskCount} tareas</span>
                        </div>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); if (confirm('¿Borrar este snapshot?')) remove(s.id) }}
                        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 p-1"
                        title="Borrar snapshot"
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
