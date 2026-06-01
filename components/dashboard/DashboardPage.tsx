'use client'
import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '@/lib/store/appStore'
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
import { GripVertical, LayoutGrid, RotateCcw, Check, Eye, EyeOff } from 'lucide-react'

function getGreeting(hour: number): string {
  if (hour < 12) return 'Buenos días'
  if (hour < 18) return 'Buenas tardes'
  return 'Buenas noches'
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
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-center">
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
      className="p-6 space-y-5 max-w-none"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-zinc-500 text-sm">{dateStr}</p>
          <h1 className="text-2xl font-bold text-white">{greeting}</h1>
        </div>
        <div className="flex items-center gap-2">
          <DayTypeSelector />
          {/* Layout edit toggle */}
          <button
            onClick={() => setEditMode((v) => !v)}
            title={editMode ? 'Salir del modo edición' : 'Reordenar widgets'}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
              editMode
                ? 'bg-indigo-500/15 border border-indigo-500/40 text-indigo-300'
                : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600'
            }`}
          >
            {editMode ? <Check className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
            {editMode ? 'Listo' : 'Reordenar'}
          </button>
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

      {/* Widgets in order */}
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
    </motion.div>
  )
}
