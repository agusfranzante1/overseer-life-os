'use client'
import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FlaskConical, Plus, ChevronRight, ChevronDown, Trophy, Search } from 'lucide-react'
import { useLabStore } from '@/lib/store/labStore'
import { LAB_CATEGORIES, exercisesByCategory, findCategory, findExercise } from '@/lib/lab/templates'
import type { LabCategory, LabExercise, LabSession } from '@/lib/lab/types'
import { ExerciseRunner } from './ExerciseRunner'

type View =
  | { kind: 'home' }
  | { kind: 'category'; categoryKey: string }
  | { kind: 'session'; sessionId: string }

export function LabPage() {
  const sessions = useLabStore((s) => s.sessions)
  const createSession = useLabStore((s) => s.createSession)

  // View routing — local state, no URL changes for v1.
  const [view, setView] = useState<View>({ kind: 'home' })

  // Persist last view in localStorage so a refresh doesn't kick you out
  // of a session you were working on.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('overseer-lab-view')
      if (raw) {
        const parsed = JSON.parse(raw) as View
        if (parsed && typeof parsed === 'object' && parsed.kind) setView(parsed)
      }
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem('overseer-lab-view', JSON.stringify(view)) } catch { /* ignore */ }
  }, [view])

  // Quick aggregates for the home view
  const openSessions = useMemo(() =>
    sessions.filter((s) => s.status === 'open').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [sessions]
  )
  const closedSessions = useMemo(() =>
    sessions.filter((s) => s.status === 'closed').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [sessions]
  )

  const handleLaunch = (exerciseKey: string) => {
    const id = createSession({ exerciseKey })
    if (id) setView({ kind: 'session', sessionId: id })
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-fuchsia-400" />
            Laboratorio
          </h1>
          <p className="text-xs text-zinc-500 mt-1 max-w-xl">
            Tu espacio para trabajar la mente. Creencias, emociones, pensamientos, identidad,
            problemas, inercia. Cada sesión queda guardada para volver y profundizar.
          </p>
        </div>
        {view.kind !== 'home' && (
          <button onClick={() => setView({ kind: 'home' })}
            className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors">
            ← Volver al laboratorio
          </button>
        )}
      </header>

      {view.kind === 'home' && (
        <HomeView
          categories={LAB_CATEGORIES}
          openSessions={openSessions}
          closedSessions={closedSessions}
          onOpenCategory={(key) => setView({ kind: 'category', categoryKey: key })}
          onOpenSession={(id) => setView({ kind: 'session', sessionId: id })}
          onLaunch={handleLaunch}
        />
      )}

      {view.kind === 'category' && (
        <CategoryView
          categoryKey={view.categoryKey}
          sessions={sessions.filter((s) => s.categoryKey === view.categoryKey)}
          onLaunch={handleLaunch}
          onOpenSession={(id) => setView({ kind: 'session', sessionId: id })}
          onBack={() => setView({ kind: 'home' })}
        />
      )}

      {view.kind === 'session' && (
        <ExerciseRunner sessionId={view.sessionId} onBack={() => setView({ kind: 'home' })} />
      )}
    </div>
  )
}

// ─── HOME VIEW ───────────────────────────────────────────────────────────────

function HomeView({
  categories, openSessions, closedSessions, onOpenCategory, onOpenSession, onLaunch,
}: {
  categories: LabCategory[]
  openSessions: LabSession[]
  closedSessions: LabSession[]
  onOpenCategory: (key: string) => void
  onOpenSession: (id: string) => void
  onLaunch: (exerciseKey: string) => void
}) {
  const [search, setSearch] = useState('')
  const [showAllHistory, setShowAllHistory] = useState(false)
  const HISTORY_LIMIT = 5

  const searchLower = search.trim().toLowerCase()
  const filteredOpen = searchLower
    ? openSessions.filter((s) => s.title.toLowerCase().includes(searchLower))
    : openSessions
  const filteredClosed = searchLower
    ? closedSessions.filter((s) => s.title.toLowerCase().includes(searchLower) || (s.outcome ?? '').toLowerCase().includes(searchLower))
    : closedSessions
  const visibleClosed = showAllHistory ? filteredClosed : filteredClosed.slice(0, HISTORY_LIMIT)

  return (
    <div className="space-y-6">
      {/* Open sessions on top — the user's "live work" */}
      {filteredOpen.length > 0 && (
        <section>
          <p className="text-[10px] font-mono uppercase tracking-wider text-blue-400/80 mb-2">
            Sesiones en progreso · {filteredOpen.length}
          </p>
          <div className="space-y-2">
            {filteredOpen.map((s) => (
              <SessionRow key={s.id} session={s} onOpen={() => onOpenSession(s.id)} />
            ))}
          </div>
        </section>
      )}

      {/* Categories grid */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            Pabellones del laboratorio
          </p>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-600 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar sesiones..."
              className="bg-zinc-900 border border-zinc-800 rounded-lg pl-7 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 w-48"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {categories.map((cat) => {
            const catSessions = openSessions.concat(closedSessions).filter((s) => s.categoryKey === cat.key)
            return (
              <CategoryCard
                key={cat.key}
                category={cat}
                sessionCount={catSessions.length}
                onClick={() => onOpenCategory(cat.key)}
                onQuickStart={(exKey) => onLaunch(exKey)}
              />
            )
          })}
        </div>
      </section>

      {/* Closed history — collapsible, capped */}
      {filteredClosed.length > 0 && (
        <section>
          <p className="text-[10px] font-mono uppercase tracking-wider text-emerald-400/80 mb-2 flex items-center gap-1.5">
            <Trophy className="w-3 h-3" /> Historial · {filteredClosed.length} cerradas
          </p>
          <div className="space-y-2">
            {visibleClosed.map((s) => (
              <SessionRow key={s.id} session={s} onOpen={() => onOpenSession(s.id)} />
            ))}
            {filteredClosed.length > HISTORY_LIMIT && (
              <button onClick={() => setShowAllHistory((v) => !v)}
                className="w-full text-[11px] text-zinc-500 hover:text-zinc-300 py-2 border border-dashed border-zinc-800 rounded-lg transition-colors">
                {showAllHistory ? `↑ Ver menos` : `Ver las ${filteredClosed.length - HISTORY_LIMIT} restantes ↓`}
              </button>
            )}
          </div>
        </section>
      )}

      {/* Empty state */}
      {openSessions.length === 0 && closedSessions.length === 0 && (
        <div className="bg-zinc-950/40 border border-zinc-800 border-dashed rounded-2xl p-8 text-center">
          <FlaskConical className="w-10 h-10 text-fuchsia-400/60 mx-auto mb-3" />
          <p className="text-sm font-semibold text-zinc-200 mb-1">Tu laboratorio está limpio</p>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            Elegí un pabellón arriba y arrancá tu primera sesión. Cada ejercicio guarda tu trabajo
            automático — podés volver, profundizar y cerrar con un outcome cuando termine.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── CATEGORY CARD ───────────────────────────────────────────────────────────

function CategoryCard({
  category, sessionCount, onClick, onQuickStart,
}: {
  category: LabCategory
  sessionCount: number
  onClick: () => void
  onQuickStart: (exerciseKey: string) => void
}) {
  const exs = exercisesByCategory(category.key)
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="rounded-2xl border-2 transition-all duration-200 overflow-hidden cursor-pointer"
      style={{
        background: hover ? category.color + '22' : category.color + '08',
        borderColor: hover ? category.color + '90' : category.color + '30',
        boxShadow: hover ? `0 10px 30px -10px ${category.color}55, inset 0 1px 0 ${category.color}30` : 'none',
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      <button onClick={onClick} className="w-full text-left p-4 transition-colors">
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="text-2xl transition-transform duration-200" style={{ transform: hover ? 'scale(1.15) rotate(-4deg)' : 'scale(1)' }}>
            {category.emoji}
          </span>
          <span className="text-[10px] font-mono"
            style={{ color: hover ? category.color : '#71717a' }}>
            {sessionCount} {sessionCount === 1 ? 'sesión' : 'sesiones'}
          </span>
        </div>
        <h3 className="text-base font-bold mb-1 transition-colors"
          style={{ color: hover ? category.color : '#f4f4f5' }}>
          {category.title}
        </h3>
        <p className="text-[11px] text-zinc-300 italic leading-relaxed">{category.tagline}</p>
      </button>
      <div className="border-t-2 px-3 py-2 flex flex-wrap gap-1.5"
        style={{ borderColor: category.color + (hover ? '50' : '20') }}>
        {exs.slice(0, 3).map((ex) => (
          <QuickStartChip key={ex.key} ex={ex} accent={category.color}
            onClick={(e) => { e.stopPropagation(); onQuickStart(ex.key) }}
          />
        ))}
        {exs.length > 3 && (
          <button onClick={onClick}
            className="text-[10px] px-2 py-1 rounded transition-colors flex items-center gap-0.5"
            style={{ color: hover ? category.color : '#71717a' }}>
            +{exs.length - 3} más <ChevronRight className="w-2.5 h-2.5" />
          </button>
        )}
      </div>
    </div>
  )
}

/** Small chip used inside CategoryCard for quick-start. Bright on hover
 *  with the category accent so it pops over the dark bg. */
function QuickStartChip({
  ex, accent, onClick,
}: { ex: LabExercise; accent: string; onClick: (e: React.MouseEvent) => void }) {
  const [chipHover, setChipHover] = useState(false)
  return (
    <button
      onMouseEnter={() => setChipHover(true)}
      onMouseLeave={() => setChipHover(false)}
      onClick={onClick}
      title={`Iniciar: ${ex.title}`}
      className="text-[10px] px-2 py-1 rounded-md border transition-all duration-150 flex items-center gap-1 font-medium"
      style={{
        background: chipHover ? accent + '30' : 'rgba(24, 24, 27, 0.6)',
        borderColor: chipHover ? accent + 'AA' : '#3f3f46',
        color: chipHover ? '#ffffff' : '#a1a1aa',
        transform: chipHover ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      <Plus className="w-2.5 h-2.5" /> {ex.emoji} {ex.title.length > 24 ? ex.title.slice(0, 22) + '…' : ex.title}
    </button>
  )
}

// ─── CATEGORY VIEW ───────────────────────────────────────────────────────────

function CategoryView({
  categoryKey, sessions, onLaunch, onOpenSession, onBack,
}: {
  categoryKey: string
  sessions: LabSession[]
  onLaunch: (exerciseKey: string) => void
  onOpenSession: (id: string) => void
  onBack: () => void
}) {
  const category = findCategory(categoryKey)
  const exs = exercisesByCategory(categoryKey)
  if (!category) return (
    <div className="text-center text-sm text-zinc-500">
      Pabellón no encontrado. <button onClick={onBack} className="text-indigo-400 hover:text-indigo-300">Volver</button>
    </div>
  )

  const openCount = sessions.filter((s) => s.status === 'open').length
  const closedCount = sessions.filter((s) => s.status === 'closed').length

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl border p-5"
        style={{ background: category.color + '12', borderColor: category.color + '40' }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">{category.emoji}</span>
          <h2 className="text-lg font-bold" style={{ color: category.color }}>{category.title}</h2>
        </div>
        <p className="text-sm text-zinc-200 mb-2">{category.tagline}</p>
        {category.intro && (
          <p className="text-xs text-zinc-400 italic leading-relaxed">{category.intro}</p>
        )}
        <div className="flex items-center gap-3 mt-3 text-[10px] font-mono uppercase tracking-wider">
          <span className="text-blue-400">{openCount} en progreso</span>
          <span className="text-emerald-400">{closedCount} cerradas</span>
        </div>
      </div>

      {/* Exercises */}
      <section>
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
          Ejercicios disponibles
        </p>
        <div className="space-y-2">
          {exs.map((ex) => (
            <ExerciseRow
              key={ex.key}
              exercise={ex}
              accent={category.color}
              sessionCountForThis={sessions.filter((s) => s.exerciseKey === ex.key).length}
              onLaunch={() => onLaunch(ex.key)}
            />
          ))}
        </div>
      </section>

      {/* Sessions in this category */}
      {sessions.length > 0 && (
        <section>
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
            Sesiones de este pabellón
          </p>
          <div className="space-y-2">
            {sessions
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .map((s) => (
                <SessionRow key={s.id} session={s} onOpen={() => onOpenSession(s.id)} />
              ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── ROW HELPERS ─────────────────────────────────────────────────────────────

function ExerciseRow({
  exercise, accent, sessionCountForThis, onLaunch,
}: {
  exercise: LabExercise
  accent: string
  sessionCountForThis: number
  onLaunch: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [hover, setHover] = useState(false)
  return (
    <div className="rounded-xl overflow-hidden border-2 transition-all duration-150"
      style={{
        background: hover || expanded ? accent + '12' : 'rgba(9, 9, 11, 0.4)',
        borderColor: hover || expanded ? accent + '70' : '#27272a',
        boxShadow: hover ? `0 4px 16px -4px ${accent}40` : 'none',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-start gap-3 text-left transition-colors">
        <span className="text-xl shrink-0">{exercise.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-zinc-100">{exercise.title}</h4>
            {exercise.isQuick && (
              <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-500/30 text-amber-300">
                rápido
              </span>
            )}
            {sessionCountForThis > 0 && (
              <span className="text-[10px] font-mono text-zinc-600">· {sessionCountForThis} corridas</span>
            )}
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">{exercise.shortDescription}</p>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-zinc-500 mt-1" /> : <ChevronRight className="w-4 h-4 text-zinc-500 mt-1" />}
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="px-4 pb-4 pt-1 border-t border-zinc-800/60 space-y-2">
              {exercise.intro && (
                <p className="text-xs text-zinc-400 italic leading-relaxed">{exercise.intro}</p>
              )}
              {exercise.steps && exercise.steps.length > 0 && (
                <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">
                  Pasos · {exercise.steps.map((s) => s.title).join(' → ')}
                </p>
              )}
              <button
                onClick={onLaunch}
                className="w-full px-3 py-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors"
                style={{
                  background: accent + '18',
                  borderColor: accent + '50',
                  color: accent,
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Iniciar nueva sesión
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SessionRow({ session, onOpen }: { session: LabSession; onOpen: () => void }) {
  const ex = findExercise(session.exerciseKey)
  const cat = findCategory(session.categoryKey)
  const isClosed = session.status === 'closed'
  const isArchived = session.status === 'archived'
  const [hover, setHover] = useState(false)

  // Format updatedAt → "hace X días" minimal
  const days = Math.floor((Date.now() - new Date(session.updatedAt).getTime()) / 86400000)
  const ago = days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days}d`

  // Accent color: category color if available, fallback to status palette.
  const accent = cat?.color ?? (isClosed ? '#10b981' : isArchived ? '#71717a' : '#3b82f6')

  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="w-full text-left rounded-xl border-2 p-3 flex items-center gap-3 transition-all duration-150 group"
      style={{
        background: hover ? accent + '1A' : isClosed ? accent + '08' : isArchived ? 'rgba(24,24,27,0.4)' : 'rgba(9,9,11,0.4)',
        borderColor: hover ? accent + 'AA' : isClosed ? accent + '30' : isArchived ? '#27272a' : accent + '40',
        opacity: isArchived && !hover ? 0.6 : 1,
        boxShadow: hover ? `0 4px 16px -4px ${accent}50` : 'none',
        transform: hover ? 'translateX(2px)' : 'translateX(0)',
      }}
    >
      <span className="text-lg shrink-0 transition-transform" style={{ transform: hover ? 'scale(1.15)' : 'scale(1)' }}>
        {ex?.emoji ?? '🧪'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold truncate transition-colors"
            style={{ color: hover ? '#ffffff' : '#f4f4f5' }}>
            {session.title}
          </p>
          {cat && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
              style={{ borderColor: cat.color + (hover ? '80' : '40'), color: cat.color, background: cat.color + (hover ? '25' : '10') }}>
              {cat.emoji} {cat.title}
            </span>
          )}
        </div>
        <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
          {ex?.title ?? '(ejercicio eliminado)'} · {ago}
          {isClosed && session.outcome && ' · ✅ outcome guardado'}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 transition-all"
        style={{
          color: hover ? accent : '#52525b',
          transform: hover ? 'translateX(3px)' : 'translateX(0)',
        }}
      />
    </button>
  )
}
