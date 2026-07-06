'use client'
import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '@/lib/store/appStore'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { MetricsPanel } from './MetricsPanel'
import { IdealScheduleCard } from './IdealScheduleCard'
import { DailyPriorities } from './DailyPriorities'
import { DailyReflection } from './DailyReflection'
import { DailyAgendaCard } from './DailyAgendaCard'
import { format } from 'date-fns'
import { GripVertical, LayoutGrid, RotateCcw, Check, Eye, EyeOff } from 'lucide-react'

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
    id: 'day-metrics',
    label: 'Métricas diarias',
    render: () => <MetricsPanel compact />,
  },
  {
    id: 'daily-priorities',
    label: '⚡ Prioridades de hoy',
    render: () => <DailyPriorities />,
  },
  {
    id: 'daily-reflection',
    label: '✨ Reflexión + mood del día',
    render: () => <DailyReflection />,
  },
  {
    id: 'daily-view',
    label: 'Tu día · agenda',
    render: () => <DailyAgendaCard />,
  },
  {
    id: 'ideal-schedule',
    label: 'Horarios ideales',
    render: () => <IdealScheduleCard />,
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

  // Reloj en vivo — detalle "command center" del header. Arranca vacío en
  // SSR/primer paint (sin mismatch de hidratación) y se llena en el effect.
  const [clock, setClock] = useState('')
  useEffect(() => {
    const tick = () => setClock(format(new Date(), 'HH:mm'))
    tick()
    const id = setInterval(tick, 15_000)
    return () => clearInterval(id)
  }, [])

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
          radial-gradient(900px 600px at 15% 0%, rgba(99, 102, 241, 0.13), transparent 55%),
          radial-gradient(700px 500px at 100% 100%, rgba(139, 92, 246, 0.10), transparent 50%)
        `,
      }}
    >
      {/* Header hero — fecha en mono microcaps con dot de acento, saludo
          grande en display font con gradiente, y reloj en vivo a la
          derecha. Vibe "command center" sin agregar ruido. */}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-500 mb-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background: 'var(--app-accent)',
                boxShadow: '0 0 8px color-mix(in srgb, var(--app-accent) 80%, transparent)',
              }}
            />
            {dateStr}
          </p>
          <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight truncate text-hero pb-0.5">
            {greeting}, {displayName}
          </h1>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          {/* Reloj en vivo — display font, tabular. Vacío hasta montar. */}
          {clock && (
            <span className="hidden sm:block font-heading text-3xl font-light text-zinc-400 tabular-nums tracking-tight select-none">
              {clock}
            </span>
          )}
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
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-white/[0.08] text-zinc-300 transition-colors"
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
