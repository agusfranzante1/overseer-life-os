'use client'
import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FlaskConical, Plus, ChevronRight, ChevronLeft, ChevronDown, Trophy, Search, Sparkles, Check, X, Wand2, RotateCcw, Trash2, Pencil } from 'lucide-react'
import { CustomExerciseBuilder } from './CustomExerciseBuilder'
import { CustomCategoryBuilder } from './CustomCategoryBuilder'
import { useLabStore } from '@/lib/store/labStore'
import { LAB_CATEGORIES } from '@/lib/lab/templates'
import { useExercisesByCategory, findExerciseCombined as findExercise, useAllCategories, findCategoryCombined as findCategory } from '@/lib/store/labStore'
import type { LabCategory, LabExercise, LabSession, LabBelief } from '@/lib/lab/types'
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

  // Launches the Reencuadre exercise pre-filled with the belief text, and
  // links the session back to the belief so the runner can offer "marcar
  // creencia como resuelta" on close.
  const handleLaunchWithBelief = (beliefId: string, beliefText: string) => {
    const dd = new Date().getDate().toString().padStart(2, '0')
    const mm = (new Date().getMonth() + 1).toString().padStart(2, '0')
    const id = createSession({
      exerciseKey: 'reencuadre-complejo',
      title: `Reencuadre · "${beliefText.slice(0, 40)}${beliefText.length > 40 ? '…' : ''}" · ${dd}/${mm}`,
      linkedBeliefId: beliefId,
      initialValues: {
        __root: { pensamiento_inicial: beliefText },
      },
    })
    if (id) setView({ kind: 'session', sessionId: id })
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      {/* Back nav — TOP-LEFT, own row, only when we're deeper than the home
          view. Sits above everything else so it aligns visually with the
          left-anchored collapse chevrons / actions throughout the page. */}
      {view.kind !== 'home' && (
        <button
          onClick={() => setView({ kind: 'home' })}
          className="text-xs text-zinc-400 hover:text-zinc-100 active:text-zinc-100 px-2.5 py-1.5 rounded-lg hover:bg-zinc-900 active:bg-zinc-800 transition-colors flex items-center gap-1.5 -ml-2.5"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Volver al laboratorio
        </button>
      )}

      {/* Page header — only shown in home view. When the user is inside a
          category or running an exercise, the back nav above + the
          category/exercise's own title carry all the context they need.
          The repeated "Laboratorio" was just visual noise. */}
      {view.kind === 'home' && (
        <header>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-fuchsia-400" />
            Laboratorio
          </h1>
          <p className="text-xs text-zinc-500 mt-1 max-w-xl">
            Tu espacio para trabajar la mente. Creencias, emociones, pensamientos, identidad,
            problemas, inercia. Cada sesión queda guardada para volver y profundizar.
          </p>
        </header>
      )}

      {view.kind === 'home' && (
        <HomeViewWithCustom
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
          onLaunchWithBelief={handleLaunchWithBelief}
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

/** Wrapper sobre HomeView que: (1) le inyecta las categorías combinadas
 *  (built-in + custom desde el store), y (2) le agrega un slot para crear
 *  nuevas categorías custom. Mantiene HomeView abajo intacto para no
 *  romper el render existente. */
function HomeViewWithCustom(props: {
  openSessions: LabSession[]
  closedSessions: LabSession[]
  onOpenCategory: (key: string) => void
  onOpenSession: (id: string) => void
  onLaunch: (exerciseKey: string) => void
}) {
  const categories = useAllCategories()
  const [showBuilder, setShowBuilder] = useState<{ existing?: LabCategory | null } | null>(null)
  const updateCustomCategory = useLabStore((s) => s.updateCustomCategory)
  const removeCustomCategory = useLabStore((s) => s.removeCustomCategory)
  const addCustomCategory = useLabStore((s) => s.addCustomCategory)

  return (
    <>
      <HomeView
        {...props}
        categories={categories}
        onEditCategory={(cat) => setShowBuilder({ existing: cat })}
        onCreateCategory={() => setShowBuilder({ existing: null })}
      />
      <AnimatePresence>
        {showBuilder && (
          <CustomCategoryBuilder
            existing={showBuilder.existing ?? null}
            onSave={(payload) => {
              if (showBuilder.existing) updateCustomCategory(showBuilder.existing.key, payload)
              else addCustomCategory(payload)
              setShowBuilder(null)
            }}
            onDelete={showBuilder.existing && showBuilder.existing.key.startsWith('cat_')
              ? () => {
                  const ok = removeCustomCategory(showBuilder.existing!.key)
                  if (!ok) {
                    alert('No se puede eliminar: hay ejercicios custom adentro. Movelos o eliminalos primero.')
                    return
                  }
                  setShowBuilder(null)
                }
              : undefined}
            onClose={() => setShowBuilder(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

function HomeView({
  categories, openSessions, closedSessions, onOpenCategory, onOpenSession, onLaunch,
  onEditCategory, onCreateCategory,
}: {
  categories: LabCategory[]
  openSessions: LabSession[]
  closedSessions: LabSession[]
  onOpenCategory: (key: string) => void
  onOpenSession: (id: string) => void
  onLaunch: (exerciseKey: string) => void
  /** Si está, las cards de categorías custom muestran un botón ✏️ */
  onEditCategory?: (cat: LabCategory) => void
  /** Si está, aparece una "+ Nueva categoría" card después del grid. */
  onCreateCategory?: () => void
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
            const isCustomCat = cat.key.startsWith('cat_')
            return (
              <CategoryCard
                key={cat.key}
                category={cat}
                sessionCount={catSessions.length}
                isCustom={isCustomCat}
                onClick={() => onOpenCategory(cat.key)}
                onQuickStart={(exKey) => onLaunch(exKey)}
                onEdit={isCustomCat && onEditCategory ? () => onEditCategory(cat) : undefined}
              />
            )
          })}
          {onCreateCategory && (
            <button onClick={onCreateCategory}
              className="rounded-2xl border-2 border-dashed border-zinc-700 hover:border-violet-500/60 hover:bg-violet-500/[0.04] text-zinc-500 hover:text-violet-300 transition-all flex flex-col items-center justify-center min-h-[120px] gap-1.5">
              <Plus className="w-6 h-6" />
              <span className="text-xs font-semibold">Nueva categoría</span>
              <span className="text-[10px] text-zinc-600">Armá tu propio pabellón</span>
            </button>
          )}
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
  category, sessionCount, onClick, onQuickStart, isCustom, onEdit,
}: {
  category: LabCategory
  sessionCount: number
  onClick: () => void
  onQuickStart: (exerciseKey: string) => void
  isCustom?: boolean
  onEdit?: () => void
}) {
  const exs = useExercisesByCategory(category.key)
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative rounded-2xl border-2 transition-all duration-200 overflow-hidden cursor-pointer"
      style={{
        background: hover ? category.color + '22' : category.color + '08',
        borderColor: hover ? category.color + '90' : category.color + '30',
        boxShadow: hover ? `0 10px 30px -10px ${category.color}55, inset 0 1px 0 ${category.color}30` : 'none',
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      {onEdit && (
        <button
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-md text-zinc-500 hover:text-violet-300 hover:bg-black/30 transition-colors"
          title="Editar categoría"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
      <button onClick={onClick} className="w-full text-left p-4 transition-colors">
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="text-2xl transition-transform duration-200" style={{ transform: hover ? 'scale(1.15) rotate(-4deg)' : 'scale(1)' }}>
            {category.emoji}
          </span>
          <span className="text-[10px] font-mono flex items-center gap-2"
            style={{ color: hover ? category.color : '#71717a' }}>
            {isCustom && (
              <span className="px-1.5 py-0.5 rounded border bg-violet-500/10 border-violet-500/30 text-violet-300 text-[9px] uppercase tracking-wider">custom</span>
            )}
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

// ─── BELIEFS LIST ────────────────────────────────────────────────────────────
//
// First-class catalog of beliefs the user has detected. Renders ABOVE the
// exercises in the Creencias category. Three sections (collapsible):
//   • 🔴 Detectadas — to work on
//   • 🟡 En proceso — currently being reframed
//   • ✅ Resueltas — closed with an insight
//
// Each row has a "Trabajar con Reencuadre" CTA that launches the Reencuadre
// exercise pre-filled with the belief text and linked back to the belief.

function BeliefsList({ accent, onWorkOn }: {
  accent: string
  onWorkOn: (beliefId: string, beliefText: string) => void
}) {
  const beliefs = useLabStore((s) => s.beliefs)
  const addBelief = useLabStore((s) => s.addBelief)
  const setBeliefStatus = useLabStore((s) => s.setBeliefStatus)
  const updateBelief = useLabStore((s) => s.updateBelief)
  const removeBelief = useLabStore((s) => s.removeBelief)

  const [draft, setDraft] = useState('')
  const [showResolved, setShowResolved] = useState(false)

  const myBeliefs = useMemo(() =>
    beliefs.filter((b) => b.categoryKey === 'creencias'),
    [beliefs]
  )
  const detected = myBeliefs.filter((b) => b.status === 'open')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const working = myBeliefs.filter((b) => b.status === 'working')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const resolved = myBeliefs.filter((b) => b.status === 'resolved')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const handleAdd = () => {
    const t = draft.trim()
    if (!t) return
    addBelief(t)
    setDraft('')
  }

  return (
    <section className="rounded-2xl border p-4 sm:p-5"
      style={{ background: accent + '0D', borderColor: accent + '40' }}>
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4" style={{ color: accent }} />
        <h3 className="text-sm font-bold" style={{ color: accent }}>Tus Creencias</h3>
        <span className="text-[10px] font-mono text-zinc-500 ml-auto">
          {detected.length} · {working.length} · {resolved.length}
        </span>
      </div>
      <p className="text-[11px] text-zinc-400 italic leading-relaxed mb-3">
        Catálogo de las creencias que vas detectando. Agregalas a mano abajo, o
        usá el <strong className="text-zinc-300">Diagnóstico de Creencias</strong> para que te las
        despierte un cuestionario guiado. Para trabajar una, tocá &quot;Reencuadre&quot; y se abre el
        ejercicio con la frase pre-cargada.
      </p>

      {/* Quick add */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleAdd() }}
        className="flex items-stretch gap-1.5 mb-4"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder='Escribí una creencia… ej: "el dinero es difícil"'
          enterKeyHint="done"
          autoComplete="off"
          className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
        />
        <button type="submit"
          disabled={!draft.trim()}
          className="shrink-0 px-3 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40 transition-colors flex items-center gap-1"
          style={{
            background: accent + (draft.trim() ? '' : '80'),
          }}
        >
          <Plus className="w-3.5 h-3.5" /> Agregar
        </button>
      </form>

      {/* Detected */}
      {detected.length > 0 && (
        <BeliefGroup
          title="🔴 Detectadas"
          subtitle="Para trabajar con Reencuadre"
          beliefs={detected}
          accent={accent}
          onWorkOn={onWorkOn}
          onResolve={(id, insight) => setBeliefStatus(id, 'resolved', insight)}
          onSetWorking={(id) => setBeliefStatus(id, 'working')}
          onEdit={(id, text) => updateBelief(id, { text })}
          onRemove={removeBelief}
        />
      )}

      {/* Working */}
      {working.length > 0 && (
        <BeliefGroup
          title="🟡 En proceso"
          subtitle="Trabajándolas activamente"
          beliefs={working}
          accent={accent}
          onWorkOn={onWorkOn}
          onResolve={(id, insight) => setBeliefStatus(id, 'resolved', insight)}
          onSetOpen={(id) => setBeliefStatus(id, 'open')}
          onEdit={(id, text) => updateBelief(id, { text })}
          onRemove={removeBelief}
        />
      )}

      {/* Resolved — collapsed by default */}
      {resolved.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowResolved((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-emerald-400 hover:text-emerald-300 transition-colors">
            {showResolved ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            ✅ Resueltas · {resolved.length}
          </button>
          <AnimatePresence initial={false}>
            {showResolved && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden">
                <div className="pt-2">
                  <BeliefGroup
                    title=""
                    subtitle=""
                    beliefs={resolved}
                    accent={accent}
                    onWorkOn={onWorkOn}
                    onReopen={(id) => setBeliefStatus(id, 'open')}
                    onEdit={(id, text) => updateBelief(id, { text })}
                    onRemove={removeBelief}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Empty state */}
      {myBeliefs.length === 0 && (
        <div className="text-center py-4 text-[11px] text-zinc-600 italic border border-dashed border-zinc-800 rounded-lg">
          Tu catálogo está vacío. Empezá agregando una arriba o corré el Diagnóstico.
        </div>
      )}
    </section>
  )
}

function BeliefGroup({
  title, subtitle, beliefs, accent,
  onWorkOn, onResolve, onSetWorking, onSetOpen, onReopen, onEdit, onRemove,
}: {
  title: string
  subtitle: string
  beliefs: LabBelief[]
  accent: string
  onWorkOn: (id: string, text: string) => void
  onResolve?: (id: string, insight: string) => void
  onSetWorking?: (id: string) => void
  onSetOpen?: (id: string) => void
  onReopen?: (id: string) => void
  onEdit: (id: string, text: string) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="space-y-1.5 mt-3">
      {title && (
        <div className="flex items-baseline gap-2 mb-1">
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">{title}</p>
          {subtitle && <p className="text-[10px] text-zinc-600">{subtitle}</p>}
        </div>
      )}
      {beliefs.map((b) => (
        <BeliefRow key={b.id} belief={b} accent={accent}
          onWorkOn={onWorkOn}
          onResolve={onResolve}
          onSetWorking={onSetWorking}
          onSetOpen={onSetOpen}
          onReopen={onReopen}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      ))}
    </div>
  )
}

function BeliefRow({
  belief, accent,
  onWorkOn, onResolve, onSetWorking, onSetOpen, onReopen, onEdit, onRemove,
}: {
  belief: LabBelief
  accent: string
  onWorkOn: (id: string, text: string) => void
  onResolve?: (id: string, insight: string) => void
  onSetWorking?: (id: string) => void
  onSetOpen?: (id: string) => void
  onReopen?: (id: string) => void
  onEdit: (id: string, text: string) => void
  onRemove: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(belief.text)
  const [showResolveForm, setShowResolveForm] = useState(false)
  const [insightDraft, setInsightDraft] = useState('')

  const isResolved = belief.status === 'resolved'

  return (
    <div className="rounded-lg border bg-zinc-900/60 p-2.5"
      style={{ borderColor: isResolved ? '#10b98140' : '#27272a' }}>
      <div className="flex items-start gap-2">
        {/* Status dot */}
        <span className="mt-1.5 w-2 h-2 rounded-full shrink-0"
          style={{
            background: belief.status === 'open' ? '#ef4444'
                      : belief.status === 'working' ? '#eab308'
                      : '#10b981',
          }}
        />

        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { onEdit(belief.id, draft.trim() || belief.text); setEditing(false) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { onEdit(belief.id, draft.trim() || belief.text); setEditing(false) }
                if (e.key === 'Escape') { setDraft(belief.text); setEditing(false) }
              }}
              className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
            />
          ) : (
            <button onClick={() => setEditing(true)} className="text-sm text-zinc-200 text-left leading-snug break-words hover:text-zinc-100">
              {belief.text}
            </button>
          )}
          {belief.insight && (
            <p className="text-[10px] text-emerald-400/90 italic mt-1 leading-relaxed">
              💡 {belief.insight}
            </p>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-1 shrink-0">
          {!isResolved && (
            <button
              onClick={() => onWorkOn(belief.id, belief.text)}
              title="Abrir Reencuadre con esta creencia pre-cargada"
              className="text-[10px] px-2 py-1 rounded-md font-semibold text-white transition-colors flex items-center gap-1"
              style={{ background: accent }}
            >
              <Wand2 className="w-3 h-3" /> Reencuadre
            </button>
          )}
          {belief.status === 'open' && onSetWorking && (
            <button onClick={() => onSetWorking(belief.id)} title="Marcar como en proceso"
              className="p-1.5 rounded text-yellow-400 hover:bg-yellow-500/10">
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          )}
          {belief.status === 'working' && onSetOpen && (
            <button onClick={() => onSetOpen(belief.id)} title="Volver a detectada"
              className="p-1.5 rounded text-zinc-400 hover:bg-zinc-800">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          {!isResolved && onResolve && (
            <button onClick={() => setShowResolveForm((v) => !v)} title="Marcar como resuelta"
              className="p-1.5 rounded text-emerald-400 hover:bg-emerald-500/10">
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          {isResolved && onReopen && (
            <button onClick={() => onReopen(belief.id)} title="Reabrir"
              className="p-1.5 rounded text-zinc-400 hover:bg-zinc-800">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => { if (confirm(`¿Borrar la creencia "${belief.text}"?`)) onRemove(belief.id) }}
            title="Borrar"
            className="p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Inline resolve form */}
      <AnimatePresence>
        {showResolveForm && onResolve && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-2">
            <div className="flex items-stretch gap-1.5 pt-2 border-t border-zinc-800">
              <input
                autoFocus
                value={insightDraft}
                onChange={(e) => setInsightDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { onResolve(belief.id, insightDraft.trim()); setShowResolveForm(false); setInsightDraft('') }
                  if (e.key === 'Escape') { setShowResolveForm(false); setInsightDraft('') }
                }}
                placeholder="Insight final (opcional) — qué te llevás de esto"
                className="flex-1 min-w-0 bg-zinc-950 border border-emerald-500/40 rounded px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
              />
              <button onClick={() => { onResolve(belief.id, insightDraft.trim()); setShowResolveForm(false); setInsightDraft('') }}
                className="shrink-0 px-2 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold">
                Resolver
              </button>
              <button onClick={() => { setShowResolveForm(false); setInsightDraft('') }}
                className="shrink-0 px-2 py-1.5 text-zinc-500 hover:text-zinc-300">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── CATEGORY VIEW ───────────────────────────────────────────────────────────

function CategoryView({
  categoryKey, sessions, onLaunch, onLaunchWithBelief, onOpenSession, onBack,
}: {
  categoryKey: string
  sessions: LabSession[]
  onLaunch: (exerciseKey: string) => void
  onLaunchWithBelief: (beliefId: string, beliefText: string) => void
  onOpenSession: (id: string) => void
  onBack: () => void
}) {
  const category = findCategory(categoryKey)
  const exs = useExercisesByCategory(categoryKey)
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

      {/* Tu lista de Creencias — solo en el pabellón de creencias. Vive
          arriba de los ejercicios para que sea el FIRST CLASS citizen del
          pabellón: agregás creencias acá (a mano o desde el Diagnóstico),
          y desde acá las lanzás al Reencuadre con un click. */}
      {categoryKey === 'creencias' && (
        <BeliefsList accent={category.color} onWorkOn={onLaunchWithBelief} />
      )}

      {/* Exercises */}
      <CategoryExercisesSection
        category={category}
        exercises={exs}
        sessions={sessions}
        onLaunch={onLaunch}
      />

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

// ─── EXERCISES SECTION + custom builder trigger ───────────────────────
function CategoryExercisesSection({
  category, exercises, sessions, onLaunch,
}: {
  category: LabCategory
  exercises: LabExercise[]
  sessions: LabSession[]
  onLaunch: (exerciseKey: string) => void
}) {
  const [showBuilder, setShowBuilder] = useState<{ existing?: LabExercise | null } | null>(null)
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          Ejercicios disponibles
        </p>
        <button
          onClick={() => setShowBuilder({ existing: null })}
          className="text-[10px] font-semibold px-2 py-1 rounded-md border border-dashed transition-colors flex items-center gap-1"
          style={{ borderColor: category.color + '55', color: category.color }}
        >
          + Nuevo ejercicio
        </button>
      </div>
      <div className="space-y-2">
        {exercises.map((ex) => (
          <ExerciseRow
            key={ex.key}
            exercise={ex}
            accent={category.color}
            sessionCountForThis={sessions.filter((s) => s.exerciseKey === ex.key).length}
            onLaunch={() => onLaunch(ex.key)}
            onEdit={ex.key.startsWith('custom_') ? () => setShowBuilder({ existing: ex }) : undefined}
          />
        ))}
      </div>
      <AnimatePresence>
        {showBuilder && (
          <CustomExerciseBuilder
            existing={showBuilder.existing ?? null}
            defaultCategoryKey={category.key}
            onClose={() => setShowBuilder(null)}
          />
        )}
      </AnimatePresence>
    </section>
  )
}

// ─── ROW HELPERS ─────────────────────────────────────────────────────────────

function ExerciseRow({
  exercise, accent, sessionCountForThis, onLaunch, onEdit,
}: {
  exercise: LabExercise
  accent: string
  sessionCountForThis: number
  onLaunch: () => void
  onEdit?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [hover, setHover] = useState(false)
  return (
    <div className="relative rounded-xl overflow-hidden border-2 transition-all duration-150"
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
            {exercise.key.startsWith('custom_') && (
              <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border bg-violet-500/10 border-violet-500/30 text-violet-300">
                custom
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
      {onEdit && (
        <button
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          className="absolute top-3 right-9 text-zinc-500 hover:text-violet-300 transition-colors p-1 shrink-0 z-10"
          title="Editar ejercicio"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
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
