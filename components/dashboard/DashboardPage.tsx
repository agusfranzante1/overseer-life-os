'use client'
import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '@/lib/store/appStore'
import { useHabitsStore } from '@/lib/store/habitsStore'
import { useTasksStore } from '@/lib/store/tasksStore'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { DayRing } from './DayRing'
import { GoalTicker } from './GoalTicker'
import { MetricsPanel } from './MetricsPanel'
import { DayTypeSelector } from './DayTypeSelector'
import { TodayTaskList } from './TodayTaskList'
import { TomorrowPlanBlock } from './TomorrowPlanBlock'
import { QuickActions } from './QuickActions'
import { IdealScheduleCard } from './IdealScheduleCard'
import { DailyGoals } from './DailyGoals'
import { FavoritesPanel } from './FavoritesPanel'
import { format } from 'date-fns'
import { GripVertical, LayoutGrid, RotateCcw, Check, Eye, EyeOff, Battery, Activity, Flame } from 'lucide-react'

function getGreeting(hour: number): string {
  if (hour < 12) return 'Buenos días'
  if (hour < 18) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Extrae el nombre del email del usuario para personalizar el saludo
 *  ("Hi Isabella" style del mockup). Toma la parte antes del @,
 *  saca números, deja la primera letra capitalizada. Fallback: "vos". */
function getDisplayName(email: string | null | undefined): string {
  if (!email) return 'vos'
  const local = email.split('@')[0] ?? ''
  // Quitamos años/dígitos y separadores comunes.
  const cleaned = local.replace(/[0-9._-]+/g, ' ').trim()
  const first = cleaned.split(' ')[0] ?? ''
  if (!first) return 'vos'
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

// ─── Widget registry ──────────────────────────────────────────────────────────

interface WidgetDef {
  id: string
  label: string
  /** Render the widget — sidebarCollapsed is passed in case the widget needs it */
  render: () => React.ReactNode
}

const WIDGETS: WidgetDef[] = [
  {
    id: 'goal-ticker',
    label: 'Goal Ticker',
    render: () => <GoalTicker />,
  },
  {
    id: 'day-ring-metrics',
    label: 'Day Ring + Métricas',
    render: () => (
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-5 items-start">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <DayRing />
        </div>
        <MetricsPanel />
      </div>
    ),
  },
  {
    id: 'quick-actions',
    label: 'Acciones rápidas',
    render: () => <QuickActions />,
  },
  {
    id: 'daily-goals',
    label: 'Objetivos diarios',
    render: () => <DailyGoals />,
  },
  {
    id: 'tasks',
    label: 'Tareas — Hoy + Mañana',
    render: () => (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <TodayTaskList />
        <TomorrowPlanBlock />
      </div>
    ),
  },
  {
    id: 'ideal-schedule',
    label: 'Horarios ideales',
    render: () => <IdealScheduleCard />,
  },
  {
    id: 'favorites',
    label: 'Favoritos · links rápidos',
    render: () => <FavoritesPanel />,
  },
]

const DEFAULT_ORDER = WIDGETS.map((w) => w.id)
const STORAGE_KEY_ORDER = 'overseer-dashboard-order'
const STORAGE_KEY_HIDDEN = 'overseer-dashboard-hidden'

function loadOrder(): string[] {
  if (typeof window === 'undefined') return DEFAULT_ORDER
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ORDER)
    if (!raw) return DEFAULT_ORDER
    const parsed = JSON.parse(raw) as string[]
    // Ensure all known widgets are present; append any missing at the end
    const known = new Set(DEFAULT_ORDER)
    const valid = parsed.filter((id) => known.has(id))
    for (const id of DEFAULT_ORDER) if (!valid.includes(id)) valid.push(id)
    return valid
  } catch { return DEFAULT_ORDER }
}

function loadHidden(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HIDDEN)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch { return new Set() }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  useAppStore() // ensure store hydration for child widgets
  const now = new Date()
  const greeting = getGreeting(now.getHours())
  const dateStr = format(now, 'EEEE, MMMM d')

  // Nombre para personalizar el saludo ("Hi <name>" del mockup).
  // Lo levantamos del email de Supabase auth — Async + cache local así
  // no re-fetcheamos en cada render.
  const [displayName, setDisplayName] = useState<string>('vos')
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await getSupabaseBrowser().auth.getUser()
        if (cancelled) return
        setDisplayName(getDisplayName(data.user?.email))
      } catch { /* sin auth → fallback "vos" */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Stats de los chips superiores — % de hábitos de hoy + tareas pendientes.
  const habitsTodayPct = useHabitsStore((s) => {
    const today = new Date()
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const dow = today.getDay()
    // Hábitos esperados hoy: si targetDays está vacío → todos los días.
    const expected = s.habits.filter((h) => {
      const tgt = h.targetDays
      return !tgt || tgt.length === 0 || tgt.includes(dow)
    }).filter((h) => !h.skippedDates?.includes(dateKey))
    if (expected.length === 0) return null
    const done = expected.filter((h) => h.completedDates.includes(dateKey)).length
    return Math.round((done / expected.length) * 100)
  })
  const tasksOpenCount = useTasksStore((s) => {
    return Object.values(s.tasks).filter((t) => !t.archivedAt && !t.completedAt).length
  })

  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [editMode, setEditMode] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Drag state
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const draggedRef = useRef<string | null>(null)

  // Hydrate from localStorage on mount (avoid SSR mismatch)
  useEffect(() => {
    setMounted(true)
    setOrder(loadOrder())
    setHidden(loadHidden())
  }, [])

  const persistOrder = (next: string[]) => {
    setOrder(next)
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY_ORDER, JSON.stringify(next))
  }
  const persistHidden = (next: Set<string>) => {
    setHidden(next)
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY_HIDDEN, JSON.stringify(Array.from(next)))
  }

  const toggleHidden = (id: string) => {
    const next = new Set(hidden)
    if (next.has(id)) next.delete(id); else next.add(id)
    persistHidden(next)
  }

  const resetLayout = () => {
    persistOrder(DEFAULT_ORDER)
    persistHidden(new Set())
  }

  // DnD handlers
  const onDragStart = (id: string) => (e: React.DragEvent) => {
    draggedRef.current = id
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', id) } catch { /* noop */ }
  }
  const onDragOver = (id: string) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (overId !== id) setOverId(id)
  }
  const onDrop = (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault()
    const src = draggedRef.current
    if (!src || src === targetId) { resetDrag(); return }
    const next = order.filter((x) => x !== src)
    const idx = next.indexOf(targetId)
    next.splice(idx, 0, src)
    persistOrder(next)
    resetDrag()
  }
  const resetDrag = () => {
    draggedRef.current = null
    setDragId(null)
    setOverId(null)
  }

  // Render: use DEFAULT_ORDER until mounted to avoid hydration mismatch
  const renderOrder = mounted ? order : DEFAULT_ORDER

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative p-6 space-y-5 max-w-none min-h-full"
      style={{
        // Halos muy sutiles del mockup — apenas un toque violeta en
        // la diagonal para dar profundidad al navy-black del body.
        // Bajo intensidades porque ahora el contraste con los cards
        // (que llevan sus propios glows de color) tiene que dejarlos
        // protagonizar.
        background: `
          radial-gradient(900px 600px at 15% 0%, rgba(99, 102, 241, 0.06), transparent 55%),
          radial-gradient(700px 500px at 100% 100%, rgba(139, 92, 246, 0.05), transparent 50%)
        `,
      }}
    >
      {/* Header — mockup style: chips arriba pequeños, saludo MUY
          grande (text-5xl), subtítulo gris fino, día type chips a la
          derecha + botón reordenar. */}
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6">
        <div className="space-y-3 flex-1 min-w-0">
          {/* Status chips — pill pequeño con icono + label, glass sutil */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[12px] text-zinc-300 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1">
              <Flame className="w-3 h-3 text-orange-400" /> {tasksOpenCount} tareas
            </span>
            <span className="inline-flex items-center gap-1.5 text-[12px] text-zinc-400 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1">
              <Battery className="w-3 h-3 text-zinc-500" /> {dateStr}
            </span>
            {habitsTodayPct !== null && (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-zinc-300 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1">
                <Activity className="w-3 h-3 text-emerald-400" /> {habitsTodayPct}%
              </span>
            )}
          </div>
          {/* Saludo gigante — 4xl-5xl bold tight tracking */}
          <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight leading-[1.05]">
            {greeting},
            <br />
            {displayName}
          </h1>
          <p className="text-[13px] text-zinc-500 max-w-md">
            Que tengas un buen día. Tu sistema te espera.
          </p>
        </div>
        <div className="flex flex-col items-end gap-3 shrink-0">
          {/* Day type label arriba a la derecha como el mockup */}
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Day Type</p>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <DayTypeSelector />
            {/* Botón reordenar — glass sutil */}
            <button
              onClick={() => setEditMode((v) => !v)}
              title={editMode ? 'Salir del modo edición' : 'Reordenar widgets'}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-colors ${
                editMode
                  ? 'bg-indigo-500/20 border border-indigo-400/40 text-indigo-200'
                  : 'bg-white/[0.04] border border-white/[0.08] text-zinc-300 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              {editMode ? <Check className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
              {editMode ? 'Listo' : 'Reordenar'}
            </button>
          </div>
        </div>
      </div>

      {/* Edit-mode toolbar */}
      {editMode && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-3 space-y-3"
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-indigo-300">
              <GripVertical className="w-3 h-3 inline" /> Arrastrá los widgets para reordenar · tocá el ojo para ocultar/mostrar
            </p>
            <button
              onClick={resetLayout}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Restaurar default
            </button>
          </div>

          {/* Visibility list */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
            {WIDGETS.map((w) => {
              const isHidden = hidden.has(w.id)
              return (
                <button key={w.id} onClick={() => toggleHidden(w.id)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                    isHidden
                      ? 'bg-zinc-900 border border-zinc-800 text-zinc-600'
                      : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                  }`}>
                  {isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span className="truncate">{w.label}</span>
                </button>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Widgets in order — viven SUELTOS sobre el navy del body (no
          dentro de una superficie envolvente). Cada widget se renderiza
          con su propio glass/gradient, como las cards independientes
          del mockup. */}
      <div className="relative space-y-5">
        {renderOrder.map((id) => {
          const widget = WIDGETS.find((w) => w.id === id)
          if (!widget) return null
          if (!editMode && hidden.has(id)) return null

          const isDragging = dragId === id
          const isOver = overId === id && dragId !== id

          if (editMode) {
            return (
              <div
                key={id}
                draggable
                onDragStart={onDragStart(id)}
                onDragOver={onDragOver(id)}
                onDragLeave={() => setOverId((k) => k === id ? null : k)}
                onDrop={onDrop(id)}
                onDragEnd={resetDrag}
                className={`relative rounded-2xl border-2 border-dashed transition-all ${
                  isDragging
                    ? 'opacity-40 scale-[0.98] border-indigo-500/50'
                    : isOver
                      ? 'border-indigo-500'
                      : 'border-zinc-700'
                } ${hidden.has(id) ? 'opacity-50' : ''}`}
                style={{ cursor: 'grab' }}
              >
                {/* Drag handle / label bar */}
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-zinc-950/80 border-b border-zinc-800 rounded-t-2xl">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <GripVertical className="w-3.5 h-3.5 text-zinc-600" />
                    <span className="font-mono uppercase tracking-wider">{widget.label}</span>
                    {hidden.has(id) && <span className="text-[10px] text-red-400">[oculto]</span>}
                  </div>
                  <button onClick={() => toggleHidden(id)}
                    className="text-zinc-500 hover:text-zinc-200"
                    title={hidden.has(id) ? 'Mostrar' : 'Ocultar'}>
                    {hidden.has(id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
                <div className="p-2 pointer-events-none select-none">
                  {widget.render()}
                </div>
              </div>
            )
          }

          return <div key={id}>{widget.render()}</div>
        })}
      </div>
    </motion.div>
  )
}
