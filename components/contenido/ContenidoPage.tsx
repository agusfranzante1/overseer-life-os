'use client'
import { useState, useMemo, useRef, useLayoutEffect, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, Target, Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Plus, Trash2, X, BookOpen, Layers, Zap, Pencil, Send, Check,
  Image as ImageIcon, Upload, Loader2,
} from 'lucide-react'
import { useContentStore, buildAIContentPrompt } from '@/lib/store/contentStore'
import {
  FORMAT_LABELS, MOMENT_LABELS, STAGE_LABELS, STORY_STAGE_LABELS, STORY_STAGE_ORDER,
  ANGLE_SUGGESTIONS, NETWORK_META,
} from '@/types/content'
import type {
  ContentItem, ContentFormat, ContentMomentType, ContentStageId, StoryStageId, StoryFrame,
  ContentProfile, PostCycleAction, ContentNetwork,
  VisualStyleCategory, VisualStyleImage,
} from '@/types/content'
import { uploadVisualImage, deleteVisualImage } from '@/lib/content/visualUpload'

type Tab = 'estrategia' | 'mes' | 'calendario' | 'pipeline' | 'estilo'

const ALL_NETWORKS: ContentNetwork[] = [
  'instagram', 'tiktok', 'youtube', 'linkedin', 'x',
  'newsletter', 'website', 'podcast', 'other',
]

// Helpers para persistir UI state en localStorage. La selección de perfil
// activo ya se persiste via Zustand persist (overseer-content); estos
// guardan la PREFERENCIA visual (tab abierta, mes, filtro de red, filtro
// de perfil) que es ortogonal al perfil del que estás editando.
const LS_TAB = 'overseer-contenido-tab'
const LS_MONTH = 'overseer-contenido-month'
const LS_NETWORK_FILTER = 'overseer-contenido-network-filter'
const LS_PROFILE_FILTER = 'overseer-contenido-profile-filter'
const LS_TAB_ORDER = 'overseer-contenido-tab-order'
const LS_PIPELINE_MODE = 'overseer-contenido-pipeline-mode'

/** Id corto para frames de historias (no necesitamos el genId del store acá). */
function genFrameId(): string {
  return `frame_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function readLS<T extends string>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try { return (window.localStorage.getItem(key) as T | null) ?? fallback } catch { return fallback }
}
function writeLS(key: string, value: string) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(key, value) } catch { /* noop */ }
}

// Definición (label + icono) de cada tab. El ORDEN visual lo decide el user
// (drag-and-drop, persistido en LS_TAB_ORDER); acá solo está el default.
const TAB_DEFS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'estrategia',  label: 'ADN de marca',   icon: <Target className="w-3.5 h-3.5" /> },
  { key: 'mes',         label: 'Mes en curso',   icon: <BookOpen className="w-3.5 h-3.5" /> },
  { key: 'calendario',  label: 'Calendario',     icon: <CalendarIcon className="w-3.5 h-3.5" /> },
  { key: 'pipeline',    label: 'Pipeline',       icon: <Layers className="w-3.5 h-3.5" /> },
  { key: 'estilo',      label: 'Estilo visual',  icon: <ImageIcon className="w-3.5 h-3.5" /> },
]
const DEFAULT_TAB_ORDER: Tab[] = TAB_DEFS.map((t) => t.key)

/** Normaliza el orden guardado: conserva solo keys válidas (sin duplicados) y
 *  agrega al final cualquier tab nueva que no estuviera guardada (forward-compat). */
function sanitizeTabOrder(raw: string): Tab[] {
  let parsed: unknown = null
  try { parsed = JSON.parse(raw) } catch { /* default abajo */ }
  const valid = new Set<Tab>(DEFAULT_TAB_ORDER)
  const seen = new Set<Tab>()
  const out: Tab[] = []
  if (Array.isArray(parsed)) {
    for (const k of parsed) {
      if (typeof k === 'string' && valid.has(k as Tab) && !seen.has(k as Tab)) { out.push(k as Tab); seen.add(k as Tab) }
    }
  }
  for (const k of DEFAULT_TAB_ORDER) if (!seen.has(k)) out.push(k)
  return out
}

export function ContenidoPage() {
  const [tab, setTabState] = useState<Tab>(() => readLS<Tab>(LS_TAB, 'estrategia'))
  const setTab = (t: Tab) => { setTabState(t); writeLS(LS_TAB, t) }
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null)
  const [creatingForDay, setCreatingForDay] = useState<string | null>(null)
  const [networkFilter, setNetworkFilterState] = useState<ContentNetwork | 'all'>(() => readLS<ContentNetwork | 'all'>(LS_NETWORK_FILTER, 'all'))
  const setNetworkFilter = (n: ContentNetwork | 'all') => { setNetworkFilterState(n); writeLS(LS_NETWORK_FILTER, n) }
  // El perfil seleccionado es UNO SOLO y vive en el store (`currentProfileId`):
  // elegirlo en cualquier tab (ADN, Calendario, Pipeline) lo mantiene constante
  // al cambiar de tab. `profileFilter` ya NO elige perfil — solo decide, en
  // Calendario/Pipeline, si se ve ESE perfil ('current') o TODOS ('all').
  // (Valores viejos con un id puntual se normalizan a 'current'.)
  const [profileFilter, setProfileFilterState] = useState<'all' | 'current'>(
    () => (readLS<string>(LS_PROFILE_FILTER, 'current') === 'all' ? 'all' : 'current'),
  )
  const setProfileFilter = (p: 'all' | 'current') => { setProfileFilterState(p); writeLS(LS_PROFILE_FILTER, p) }
  const [currentMonth, setCurrentMonthState] = useState(() => {
    const fallback = (() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })()
    return readLS(LS_MONTH, fallback)
  })
  const setCurrentMonth = (m: string) => { setCurrentMonthState(m); writeLS(LS_MONTH, m) }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 sm:p-6 space-y-5 w-full"
    >
      <Header
        tab={tab} setTab={setTab}
        currentMonth={currentMonth} setCurrentMonth={setCurrentMonth}
        networkFilter={networkFilter} setNetworkFilter={setNetworkFilter}
      />
      <ProfileBar
        showAllToggle={tab === 'calendario' || tab === 'pipeline'}
        profileFilter={profileFilter}
        setProfileFilter={setProfileFilter}
      />

      <AnimatePresence mode="wait">
        {tab === 'estrategia' && (
          <motion.div key="t1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <EstrategiaTab />
          </motion.div>
        )}
        {tab === 'mes' && (
          <motion.div key="t2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <MesTab monthYmd={currentMonth} />
          </motion.div>
        )}
        {tab === 'calendario' && (
          <motion.div key="t3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <CalendarioTab
              monthYmd={currentMonth}
              networkFilter={networkFilter}
              profileFilter={profileFilter}
              onEditItem={setEditingItem}
              onCreateForDay={setCreatingForDay}
            />
          </motion.div>
        )}
        {tab === 'pipeline' && (
          <motion.div key="t4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <PipelineTab networkFilter={networkFilter} profileFilter={profileFilter} onEditItem={setEditingItem} />
          </motion.div>
        )}
        {tab === 'estilo' && (
          <motion.div key="t5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <EstiloVisualTab />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(editingItem || creatingForDay) && (
          <ItemModal
            item={editingItem}
            defaultDate={creatingForDay ?? undefined}
            monthYmd={currentMonth}
            onClose={() => { setEditingItem(null); setCreatingForDay(null) }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ───────────────────────────────────────────────────────────────────
// HEADER + tabs + network filter
// ───────────────────────────────────────────────────────────────────
function Header({
  tab, setTab, currentMonth, setCurrentMonth, networkFilter, setNetworkFilter,
}: {
  tab: Tab; setTab: (t: Tab) => void
  currentMonth: string; setCurrentMonth: (m: string) => void
  networkFilter: ContentNetwork | 'all'; setNetworkFilter: (n: ContentNetwork | 'all') => void
}) {
  // Orden de tabs reordenable por el user (drag-and-drop), persistido. Se lee
  // en un effect (no en el init) para no romper la hidratación SSR.
  const [tabOrder, setTabOrderState] = useState<Tab[]>(DEFAULT_TAB_ORDER)
  useEffect(() => { setTabOrderState(sanitizeTabOrder(readLS(LS_TAB_ORDER, ''))) }, [])
  const setTabOrder = (order: Tab[]) => { setTabOrderState(order); writeLS(LS_TAB_ORDER, JSON.stringify(order)) }
  const [dragTab, setDragTab] = useState<Tab | null>(null)
  const moveTab = (from: Tab, to: Tab) => {
    if (from === to) return
    const arr = tabOrder.filter((k) => k !== from)
    const idx = arr.indexOf(to)
    arr.splice(idx < 0 ? arr.length : idx, 0, from)
    setTabOrder(arr)
  }

  const shiftMonth = (delta: number) => {
    const [y, m] = currentMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const monthLabel = (() => {
    const [y, m] = currentMonth.split('-').map(Number)
    const d = new Date(y, m - 1, 1)
    return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  })()

  const profile = useContentStore((s) => s.profiles.find((p) => p.id === s.currentProfileId))
  const profileNetworks = profile?.networks ?? []
  const filterableNetworks = [...profileNetworks]
  // En el calendario/pipeline mostramos los chips de filtro de red
  const showNetworkFilter = tab === 'calendario' || tab === 'pipeline'

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Content Strategy</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Perfil → ADN → Pilares → Campaña → Foco semanal → Pieza diaria. Cada post es una célula visible de tu pensamiento estratégico.
          </p>
        </div>
        {(tab === 'mes' || tab === 'calendario') && (
          <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.08] rounded-xl p-0.5">
            <button onClick={() => shiftMonth(-1)} className="p-1.5 hover:bg-white/[0.05] rounded-lg text-zinc-400">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-3 text-xs font-semibold text-zinc-200 capitalize min-w-[120px] text-center">
              {monthLabel}
            </span>
            <button onClick={() => shiftMonth(1)} className="p-1.5 hover:bg-white/[0.05] rounded-lg text-zinc-400">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Tabs — arrastrá una pestaña para reordenarlas (orden persistido). */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] -mb-2 flex-wrap">
        {tabOrder.map((key) => {
          const def = TAB_DEFS.find((d) => d.key === key)
          if (!def) return null
          return (
            <button
              key={key}
              draggable
              onDragStart={(e) => { setDragTab(key); e.dataTransfer.effectAllowed = 'move' }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
              onDrop={(e) => { e.preventDefault(); if (dragTab) moveTab(dragTab, key); setDragTab(null) }}
              onDragEnd={() => setDragTab(null)}
              onClick={() => setTab(key)}
              title="Arrastrá para reordenar"
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-grab active:cursor-grabbing ${
                dragTab === key ? 'opacity-40' : ''
              } ${
                tab === key
                  ? 'border-violet-400 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {def.icon}{def.label}
            </button>
          )
        })}
      </div>

      {/* Network filter chips — solo en calendario/pipeline */}
      {showNetworkFilter && filterableNetworks.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">Red:</span>
          <button
            onClick={() => setNetworkFilter('all')}
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
              networkFilter === 'all'
                ? 'bg-white/[0.08] border-white/[0.16] text-zinc-100'
                : 'bg-transparent border-white/[0.08] text-zinc-500 hover:text-zinc-300'
            }`}
          >Todas</button>
          {filterableNetworks.map((n) => {
            const meta = NETWORK_META[n]
            const active = networkFilter === n
            return (
              <button
                key={n}
                onClick={() => setNetworkFilter(n)}
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors flex items-center gap-1"
                style={{
                  background: active ? `${meta.color}20` : 'transparent',
                  borderColor: active ? meta.color : 'var(--surface-fill)',
                  color: active ? meta.color : '#71717a',
                }}
              >
                <span>{meta.icon}</span>{meta.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────
// Profile bar — chips de perfiles + crear/editar
// ───────────────────────────────────────────────────────────────────
function ProfileBar({
  showAllToggle, profileFilter, setProfileFilter,
}: {
  showAllToggle?: boolean
  profileFilter?: 'all' | 'current'
  setProfileFilter?: (p: 'all' | 'current') => void
} = {}) {
  const profiles = useContentStore((s) => s.profiles)
  const currentProfileId = useContentStore((s) => s.currentProfileId)
  const setCurrentProfile = useContentStore((s) => s.setCurrentProfile)
  const addProfile = useContentStore((s) => s.addProfile)
  const updateProfile = useContentStore((s) => s.updateProfile)
  const removeProfile = useContentStore((s) => s.removeProfile)
  const [editing, setEditing] = useState<ContentProfile | null>(null)
  const [creating, setCreating] = useState(false)

  // El chip SIEMPRE setea el perfil activo del store (fuente única de verdad),
  // en cualquier tab → la selección se mantiene constante entre ADN, Calendario
  // y Pipeline. En Calendario/Pipeline, además, elegir un perfil sale del modo
  // "Todos". El botón "Todos" solo cambia la vista, no el perfil seleccionado.
  const handleChipClick = (profileId: string) => {
    setCurrentProfile(profileId)
    if (showAllToggle && setProfileFilter) setProfileFilter('current')
  }
  const isActive = (profileId: string) => {
    // En modo "Todos" ningún chip queda resaltado (el resaltado va al botón Todos).
    if (showAllToggle && profileFilter === 'all') return false
    return profileId === currentProfileId
  }

  return (
    <div className="flex items-center gap-2 flex-wrap p-2 rounded-xl bg-white/[0.02] border border-white/[0.06]">
      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mr-1">Perfil:</span>
      {showAllToggle && setProfileFilter && (
        <button
          onClick={() => setProfileFilter('all')}
          className="px-3 py-1 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5"
          style={{
            background: profileFilter === 'all' ? 'var(--surface-fill)' : 'transparent',
            borderColor: profileFilter === 'all' ? 'rgba(255,255,255,0.30)' : 'var(--surface-fill)',
            color: profileFilter === 'all' ? '#fff' : '#a1a1aa',
          }}
        >
          🌐 Todos
        </button>
      )}
      {profiles.map((p) => {
        const active = isActive(p.id)
        return (
          <div key={p.id} className="flex items-center group">
            <button
              onClick={() => handleChipClick(p.id)}
              className="px-3 py-1 rounded-l-lg text-xs font-semibold border transition-colors flex items-center gap-1.5"
              style={{
                background: active ? `${p.color}25` : 'transparent',
                borderColor: active ? p.color : 'var(--surface-fill)',
                color: active ? '#fff' : '#a1a1aa',
              }}
            >
              <span>{p.icon ?? '·'}</span>{p.name}
            </button>
            {p.id === currentProfileId && (
              <button
                onClick={() => setEditing(p)}
                className="px-1.5 py-1 rounded-r-lg border-y border-r text-xs hover:bg-white/[0.05]"
                style={{ borderColor: p.color, color: '#a1a1aa' }}
                title="Editar perfil"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
        )
      })}
      <button
        onClick={() => setCreating(true)}
        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-dashed border-white/[0.10] text-zinc-500 hover:text-violet-300 hover:border-violet-400/40 transition-colors flex items-center gap-1"
      >
        <Plus className="w-3 h-3" /> Nuevo perfil
      </button>

      <AnimatePresence>
        {creating && (
          <ProfileModal
            onSave={(name, color, icon, networks) => {
              addProfile({ name, color, icon, networks })
              setCreating(false)
            }}
            onClose={() => setCreating(false)}
          />
        )}
        {editing && (
          <ProfileModal
            profile={editing}
            onSave={(name, color, icon, networks) => {
              updateProfile(editing.id, { name, color, icon, networks })
              setEditing(null)
            }}
            onDelete={profiles.length > 1 ? () => {
              if (confirm(`¿Eliminar el perfil "${editing.name}" y TODO su contenido (items + campañas)?`)) {
                removeProfile(editing.id)
                setEditing(null)
              }
            } : undefined}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function ProfileModal({
  profile, onSave, onDelete, onClose,
}: {
  profile?: ContentProfile
  onSave: (name: string, color: string, icon: string, networks: ContentNetwork[]) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(profile?.name ?? '')
  const [color, setColor] = useState(profile?.color ?? '#a855f7')
  const [icon, setIcon] = useState(profile?.icon ?? '🧑‍🎨')
  const [networks, setNetworks] = useState<ContentNetwork[]>(profile?.networks ?? ['instagram'])

  const toggleNetwork = (n: ContentNetwork) => {
    setNetworks((arr) => arr.includes(n) ? arr.filter((x) => x !== n) : [...arr, n])
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.97, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-white/[0.10] rounded-2xl w-full max-w-md p-5 space-y-4"
      >
        <h2 className="text-base font-semibold text-white">{profile ? 'Editar perfil' : 'Nuevo perfil'}</h2>
        <div className="space-y-3">
          <FormField label="Nombre">
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Color">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                className="w-full h-9 bg-zinc-800 border border-white/[0.12] rounded-lg cursor-pointer" />
            </FormField>
            <FormField label="Icono (emoji)">
              <input value={icon} onChange={(e) => setIcon(e.target.value)}
                className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500" />
            </FormField>
          </div>
          <FormField label="Redes activas">
            <div className="flex gap-1.5 flex-wrap">
              {ALL_NETWORKS.map((n) => {
                const meta = NETWORK_META[n]
                const active = networks.includes(n)
                return (
                  <button key={n} onClick={() => toggleNetwork(n)}
                    className="px-2 py-1 rounded-full text-[11px] font-semibold border transition-colors flex items-center gap-1"
                    style={{
                      background: active ? `${meta.color}20` : 'transparent',
                      borderColor: active ? meta.color : 'rgba(255,255,255,0.10)',
                      color: active ? meta.color : '#71717a',
                    }}>
                    <span>{meta.icon}</span>{meta.label}
                  </button>
                )
              })}
            </div>
          </FormField>
        </div>
        <div className="flex gap-2 items-center pt-2 border-t border-white/[0.06]">
          {onDelete && (
            <button onClick={onDelete} className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition-colors flex items-center gap-1.5">
              <Trash2 className="w-3 h-3" /> Eliminar
            </button>
          )}
          <button onClick={onClose} className="ml-auto px-3 py-2 rounded-lg bg-zinc-800 hover:bg-white/[0.08] text-zinc-300 text-xs font-semibold transition-colors">
            Cancelar
          </button>
          <button onClick={() => { if (!name.trim()) return; onSave(name.trim(), color, icon, networks) }}
            className="px-3 py-2 rounded-lg bg-violet-500/20 border border-violet-500/40 hover:bg-violet-500/30 text-violet-200 text-xs font-bold transition-colors">
            Guardar
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ───────────────────────────────────────────────────────────────────
// TAB 1: Estrategia / ADN — del perfil activo
// ───────────────────────────────────────────────────────────────────
function EstrategiaTab() {
  const profile = useContentStore((s) => s.profiles.find((p) => p.id === s.currentProfileId))
  const updateActiveBrandDNA = useContentStore((s) => s.updateActiveBrandDNA)
  if (!profile) return null
  const brandDNA = profile.brandDNA

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card title="Auditoría e Insights" subtitle="Detectá tu diferencial.">
        <TextField label="Diferencial" hint="Qué te vuelve distinto."
          value={brandDNA.differential}
          onChange={(v) => updateActiveBrandDNA({ differential: v })} />
        <TextField label="Tensión que resolvés en el mercado" hint="Qué problema/dolor existente atacás."
          value={brandDNA.marketTension}
          onChange={(v) => updateActiveBrandDNA({ marketTension: v })} />
        <TextField label="Deseo que representás" hint="A qué aspiración apuntás."
          value={brandDNA.desire}
          onChange={(v) => updateActiveBrandDNA({ desire: v })} />
      </Card>

      <Card title="Sistema implícito" subtitle="El 'software interno' que guía el criterio estético y narrativo.">
        <TextField label="Intereses" value={brandDNA.interests} onChange={(v) => updateActiveBrandDNA({ interests: v })} />
        <TextField label="Obsesiones" value={brandDNA.obsessions} onChange={(v) => updateActiveBrandDNA({ obsessions: v })} />
        <TextField label="Miedos" value={brandDNA.fears} onChange={(v) => updateActiveBrandDNA({ fears: v })} />
        <TextField label="Referencias" hint="Gente, libros, marcas, lugares."
          value={brandDNA.references} onChange={(v) => updateActiveBrandDNA({ references: v })} />
      </Card>

      <Card title="Problema específico" subtitle="Qué solucionás, cómo y a quién.">
        <TextField label="Qué problema solucionás" value={brandDNA.problem} onChange={(v) => updateActiveBrandDNA({ problem: v })} />
        <TextField label="De qué forma específica" value={brandDNA.solutionApproach} onChange={(v) => updateActiveBrandDNA({ solutionApproach: v })} />
        <TextField label="A quién" value={brandDNA.audience} onChange={(v) => updateActiveBrandDNA({ audience: v })} />
      </Card>

      <PillarsSection />
    </div>
  )
}

function PillarsSection() {
  const profile = useContentStore((s) => s.profiles.find((p) => p.id === s.currentProfileId))
  const addPillar = useContentStore((s) => s.addPillar)
  const updatePillar = useContentStore((s) => s.updatePillar)
  const removePillar = useContentStore((s) => s.removePillar)
  const resetPillars = useContentStore((s) => s.resetActivePillars)
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newDesc, setNewDesc] = useState('')

  if (!profile) return null
  const pillars = profile.brandDNA.pillars

  return (
    <Card
      title="Pilares de comunicación"
      subtitle="Equilibrá autoridad y conexión humana."
      right={
        <button onClick={resetPillars} className="text-[10px] text-zinc-500 hover:text-zinc-300">
          Reset a default
        </button>
      }
    >
      <div className="space-y-2">
        {pillars.sort((a, b) => a.order - b.order).map((p) => (
          <div key={p.id} className="flex items-start gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] group">
            <input
              type="color"
              value={p.color}
              onChange={(e) => updatePillar(p.id, { color: e.target.value })}
              className="w-6 h-6 rounded cursor-pointer shrink-0"
            />
            <div className="flex-1 min-w-0 space-y-1">
              <input
                value={p.label}
                onChange={(e) => updatePillar(p.id, { label: e.target.value })}
                className="w-full bg-transparent text-sm font-semibold text-white focus:outline-none border-b border-transparent focus:border-violet-500"
              />
              <textarea
                value={p.description}
                onChange={(e) => updatePillar(p.id, { description: e.target.value })}
                rows={2}
                className="w-full bg-transparent text-xs text-zinc-400 focus:outline-none resize-none"
                placeholder="Para qué sirve este pilar..."
              />
              {/* Mapa de conocimiento — colapsable, autogrow. Acá listás
                  los temas, ideas, sub-pilares, marcos que abordás en
                  este pilar. Notion-style. */}
              <KnowledgeMapField
                color={p.color}
                pillarId={p.id}
                value={p.knowledgeMap ?? ''}
                onChange={(v) => updatePillar(p.id, { knowledgeMap: v })}
              />
            </div>
            <button
              onClick={() => { if (confirm(`¿Eliminar el pilar "${p.label}"?`)) removePillar(p.id) }}
              className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 p-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {creating ? (
        <div className="space-y-2 p-3 rounded-xl bg-violet-500/[0.05] border border-violet-500/30">
          <input
            placeholder="Nombre del pilar"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="w-full bg-zinc-800 border border-white/[0.12] rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500"
          />
          <textarea
            placeholder="Para qué sirve"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            rows={2}
            className="w-full bg-zinc-800 border border-white/[0.12] rounded px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-violet-500 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (!newLabel.trim()) return
                addPillar({ label: newLabel.trim(), description: newDesc.trim(), color: '#a855f7' })
                setNewLabel(''); setNewDesc(''); setCreating(false)
              }}
              className="px-3 py-1 rounded bg-violet-500/20 border border-violet-500/40 text-violet-200 text-xs font-semibold"
            >Agregar</button>
            <button onClick={() => { setCreating(false); setNewLabel(''); setNewDesc('') }} className="text-xs text-zinc-500">Cancelar</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="text-xs text-zinc-500 hover:text-violet-300 flex items-center gap-1.5 px-2 py-1"
        >
          <Plus className="w-3 h-3" /> Agregar pilar custom
        </button>
      )}
    </Card>
  )
}

// ───────────────────────────────────────────────────────────────────
// TAB 2: Mes en curso — campaña + roadmap 30 días + foco semanal
// ───────────────────────────────────────────────────────────────────
function MesTab({ monthYmd }: { monthYmd: string }) {
  const currentProfileId = useContentStore((s) => s.currentProfileId)
  const getCampaign = useContentStore((s) => s.getCampaignForMonth)
  const addCampaign = useContentStore((s) => s.addCampaign)
  const updateCampaign = useContentStore((s) => s.updateCampaign)
  const removeCampaign = useContentStore((s) => s.removeCampaign)
  const addWeeklyFocus = useContentStore((s) => s.addWeeklyFocus)
  const updateWeeklyFocus = useContentStore((s) => s.updateWeeklyFocus)
  const removeWeeklyFocus = useContentStore((s) => s.removeWeeklyFocus)

  const campaign = getCampaign(monthYmd)

  const mondays = useMemo(() => {
    const [y, m] = monthYmd.split('-').map(Number)
    const firstDay = new Date(y, m - 1, 1)
    const result: string[] = []
    const cursor = new Date(firstDay)
    while (cursor.getDay() !== 1) cursor.setDate(cursor.getDate() + 1)
    while (cursor.getMonth() === m - 1) {
      result.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`)
      cursor.setDate(cursor.getDate() + 7)
    }
    return result
  }, [monthYmd])

  if (!campaign) {
    return (
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-8 text-center max-w-2xl mx-auto">
        <Sparkles className="w-10 h-10 text-violet-400/60 mx-auto mb-3" />
        <h2 className="text-base font-semibold text-white mb-2">No hay campaña para este mes</h2>
        <p className="text-xs text-zinc-500 mb-5 max-w-md mx-auto">
          Cada mes empezás con UN gran objetivo o intención. Después se descompone en focos semanales.
        </p>
        <button
          onClick={() => addCampaign({ profileId: currentProfileId, monthYmd, title: 'Nueva campaña', goal: '' })}
          className="px-4 py-2 rounded-xl bg-violet-500/20 border border-violet-500/40 hover:bg-violet-500/30 text-violet-200 text-sm font-semibold transition-colors"
        >
          <Plus className="w-3.5 h-3.5 inline mr-1" /> Crear campaña del mes
        </button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <div className="space-y-5">
        <Card
          title="Campaña del mes"
          subtitle="La intención macro que organiza todo el mes."
          right={
            <button
              onClick={() => { if (confirm('¿Eliminar la campaña?')) removeCampaign(campaign.id) }}
              className="text-[10px] text-zinc-500 hover:text-red-400"
            >Eliminar</button>
          }
        >
          <TextField label="Título" value={campaign.title} onChange={(v) => updateCampaign(campaign.id, { title: v })} />
          <TextField label="Objetivo / Intención" value={campaign.goal} onChange={(v) => updateCampaign(campaign.id, { goal: v })} multiline />
        </Card>

        <Card title="Roadmap 30 días" subtitle="Insights / Calendarización / Producción / Análisis.">
          <RoadmapPhase num={1} title="Insights"
            hint="Hipótesis estratégica del mes."
            value={campaign.hypothesis ?? ''}
            onChange={(v) => updateCampaign(campaign.id, { hypothesis: v })} />
          <RoadmapPhase num={2} title="Calendarización"
            hint="Pulir guiones, formatos, agendar."
            value={campaign.collectedInsights ?? ''}
            onChange={(v) => updateCampaign(campaign.id, { collectedInsights: v })} />
          <RoadmapPhase num={3} title="Producción / Posting"
            hint="Grabar, editar, publicar. Movés en Pipeline."
            value={''} onChange={() => undefined} readOnly />
          <RoadmapPhase num={4} title="Análisis y optimización"
            hint="Qué funcionó."
            value={campaign.whatWorked ?? ''}
            onChange={(v) => updateCampaign(campaign.id, { whatWorked: v })}
            renderExtras={
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                <TextField label="Lo que no funcionó" value={campaign.whatDidntWork ?? ''} onChange={(v) => updateCampaign(campaign.id, { whatDidntWork: v })} multiline />
                <TextField label="Foco para el mes que viene" value={campaign.nextMonthFocus ?? ''} onChange={(v) => updateCampaign(campaign.id, { nextMonthFocus: v })} multiline />
              </div>
            } />
        </Card>
      </div>

      <div className="space-y-5">
        <Card title="Foco por semana" subtitle="Tema central derivado de la campaña.">
          <div className="space-y-2">
            {mondays.map((mondayYmd) => {
              const existing = campaign.weeklyFoci.find((f) => f.weekStartYmd === mondayYmd)
              const monday = (() => {
                const [y, m, d] = mondayYmd.split('-').map(Number)
                return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
              })()
              return (
                <div key={mondayYmd} className="flex items-start gap-2 group">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 w-16 shrink-0 mt-2">{monday}</div>
                  <textarea
                    value={existing?.theme ?? ''}
                    onChange={(e) => {
                      if (existing) updateWeeklyFocus(campaign.id, existing.id, e.target.value)
                      else addWeeklyFocus(campaign.id, mondayYmd, e.target.value)
                    }}
                    placeholder="Tema central de la semana..."
                    rows={1}
                    className="flex-1 bg-white/[0.02] border border-white/[0.06] rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500/40 resize-none"
                    style={{ minHeight: '32px' }}
                  />
                  {existing && (
                    <button onClick={() => removeWeeklyFocus(campaign.id, existing.id)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 p-1 mt-1">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </Card>

        <GenerarPromptCard monthYmd={monthYmd} />
      </div>
    </div>
  )
}

function RoadmapPhase({
  num, title, hint, value, onChange, readOnly, renderExtras,
}: {
  num: number; title: string; hint: string; value: string
  onChange: (v: string) => void; readOnly?: boolean
  renderExtras?: React.ReactNode
}) {
  return (
    <div className="border-l-2 border-violet-500/30 pl-3 py-1">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-violet-300 bg-violet-500/15 border border-violet-500/30 rounded px-1.5 py-0.5">Sem {num}</span>
        <span className="text-sm font-semibold text-zinc-200">{title}</span>
      </div>
      <p className="text-[10px] text-zinc-500 mb-2">{hint}</p>
      {!readOnly && (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3}
          className="w-full bg-white/[0.02] border border-white/[0.06] rounded px-2 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-violet-500/40 resize-none" />
      )}
      {renderExtras}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────
// Generar prompt IA — multi-perfil + opcional foco de red
// ───────────────────────────────────────────────────────────────────
function GenerarPromptCard({ monthYmd }: { monthYmd: string }) {
  const profiles = useContentStore((s) => s.profiles)
  const campaigns = useContentStore((s) => s.campaigns)
  const items = useContentStore((s) => s.items)
  const currentProfileId = useContentStore((s) => s.currentProfileId)
  const profile = profiles.find((p) => p.id === currentProfileId)
  const [copied, setCopied] = useState(false)
  const [targetItems, setTargetItems] = useState(10)
  const [weekStart, setWeekStart] = useState<string>('')
  const [networkFocus, setNetworkFocus] = useState<ContentNetwork | ''>('')

  const handleCopy = async () => {
    const prompt = buildAIContentPrompt(
      { profiles, campaigns, items },
      {
        profileId: currentProfileId,
        monthYmd,
        weekStartYmd: weekStart || undefined,
        targetItemCount: targetItems,
        network: networkFocus || undefined,
      },
    )
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true); setTimeout(() => setCopied(false), 2500)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = prompt; document.body.appendChild(ta); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
      setCopied(true); setTimeout(() => setCopied(false), 2500)
    }
  }

  return (
    <Card
      title="Generar prompt para IA"
      subtitle="Compila ADN del perfil activo + campaña + foco semanal en un prompt listo para pegar en ChatGPT/Claude."
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span>Cantidad</span>
          <input type="number" min={1} max={50} value={targetItems}
            onChange={(e) => setTargetItems(Number(e.target.value) || 10)}
            className="w-14 bg-zinc-800 border border-white/[0.12] rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-violet-500" />
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span>Semana</span>
          <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)}
            className="bg-zinc-800 border border-white/[0.12] rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-violet-500 w-full" />
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span>Red foco</span>
          <select value={networkFocus} onChange={(e) => setNetworkFocus(e.target.value as ContentNetwork | '')}
            className="bg-zinc-800 border border-white/[0.12] rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-violet-500 w-full">
            <option value="">Mixto</option>
            {(profile?.networks ?? []).map((n) => <option key={n} value={n}>{NETWORK_META[n].label}</option>)}
          </select>
        </div>
      </div>
      <button
        onClick={handleCopy}
        className="w-full mt-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:brightness-110 text-white text-sm font-semibold transition-all flex items-center gap-2 justify-center"
        style={{ boxShadow: '0 0 24px -8px rgba(168, 85, 247, 0.6)' }}
      >
        {copied ? <><Sparkles className="w-3.5 h-3.5" /> ¡Copiado al portapapeles!</> : <>🤖 Copiar prompt para IA</>}
      </button>
    </Card>
  )
}

// ───────────────────────────────────────────────────────────────────
// TAB 3: Calendario mensual — full width, filtrable por red
// ───────────────────────────────────────────────────────────────────
function CalendarioTab({
  monthYmd, networkFilter, profileFilter, onEditItem, onCreateForDay,
}: { monthYmd: string; networkFilter: ContentNetwork | 'all'
     profileFilter: string
     onEditItem: (i: ContentItem) => void; onCreateForDay: (d: string) => void }) {
  const items = useContentStore((s) => s.items)
  const profiles = useContentStore((s) => s.profiles)
  const currentProfileId = useContentStore((s) => s.currentProfileId)
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles])
  // showAllProfiles = filter to 'all'; viewProfileId = single profile filter.
  const showAllProfiles = profileFilter === 'all'
  const viewProfileId = profileFilter === 'current' ? currentProfileId : profileFilter === 'all' ? null : profileFilter
  // Cuando ves "todos", los pilares del perfil activo son los que se
  // usan para los chips de pillar — pero como cada item carga su
  // propio profileId, buscamos los pillars dinámicamente por item via
  // pillarByItem (item.profileId → pillar.id → pillar).
  const activeProfile = profiles.find((p) => p.id === currentProfileId)
  const fallbackPillars = activeProfile?.brandDNA.pillars ?? []

  const days = useMemo(() => {
    const [y, m] = monthYmd.split('-').map(Number)
    const first = new Date(y, m - 1, 1)
    const last = new Date(y, m, 0)
    const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1
    const total = last.getDate()
    const cells: { date: Date | null; ymd: string | null }[] = []
    for (let i = 0; i < startDay; i++) cells.push({ date: null, ymd: null })
    for (let d = 1; d <= total; d++) {
      const dt = new Date(y, m - 1, d)
      cells.push({ date: dt, ymd: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, ymd: null })
    return cells
  }, [monthYmd])

  const itemsByDay = useMemo(() => {
    const map = new Map<string, ContentItem[]>()
    for (const it of items) {
      if (!showAllProfiles && viewProfileId && it.profileId !== viewProfileId) continue
      if (networkFilter !== 'all' && it.network !== networkFilter) continue
      if (!it.scheduledYmd.startsWith(monthYmd)) continue
      if (!map.has(it.scheduledYmd)) map.set(it.scheduledYmd, [])
      map.get(it.scheduledYmd)!.push(it)
    }
    return map
  }, [items, monthYmd, showAllProfiles, viewProfileId, networkFilter])

  // Buscador de pillar respeta el perfil REAL del item — así cuando
  // estás en "todos", los chips se pintan con el color correcto sin
  // que importe el perfil activo.
  const pillarByItem = (it: ContentItem) => {
    const ownProfile = profileById.get(it.profileId)
    const ownPillars = ownProfile?.brandDNA.pillars ?? fallbackPillars
    return ownPillars.find((p) => p.id === it.pillarId)
  }
  const today = new Date()
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
          <div key={d} className="text-center py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((cell, i) => {
          const isToday = cell.ymd === todayYmd
          const cellItems = cell.ymd ? itemsByDay.get(cell.ymd) ?? [] : []
          return (
            <div
              key={i}
              className={`min-h-[140px] rounded-lg border p-2 transition-colors group ${
                cell.ymd
                  ? isToday
                    ? 'bg-violet-500/[0.06] border-violet-500/40 hover:border-violet-500/60'
                    : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]'
                  : 'bg-transparent border-transparent'
              }`}
            >
              {cell.date && cell.ymd && (
                <>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-semibold ${isToday ? 'text-violet-200' : 'text-zinc-500'}`}>
                      {cell.date.getDate()}
                    </span>
                    <button
                      onClick={() => onCreateForDay(cell.ymd!)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-violet-300 transition-all"
                      title="Agregar pieza"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {cellItems.map((it) => {
                      const pillar = pillarByItem(it)
                      const color = pillar?.color ?? '#71717a'
                      const stage = STAGE_LABELS[it.stage]
                      const netMeta = NETWORK_META[it.network]
                      const ownerProfile = profileById.get(it.profileId)
                      return (
                        <button
                          key={it.id}
                          onClick={() => onEditItem(it)}
                          title={ownerProfile ? `${ownerProfile.name} · ${it.title}` : it.title}
                          className="w-full text-left rounded px-1.5 py-1 transition-all hover:brightness-125 relative"
                          style={{
                            background: `${color}15`,
                            borderLeft: `2px solid ${color}`,
                            // Borde superior con el color del perfil — visible
                            // cuando estás en "Todos" para distinguir de un vistazo.
                            ...(showAllProfiles && ownerProfile
                              ? { borderTop: `2px solid ${ownerProfile.color}` }
                              : {}),
                          }}
                        >
                          <div className="flex items-center gap-1 mb-0.5">
                            {showAllProfiles && ownerProfile && (
                              <span className="text-[10px] shrink-0" title={ownerProfile.name}>{ownerProfile.icon ?? '·'}</span>
                            )}
                            <span className="text-[10px]" style={{ color: netMeta.color }}>{netMeta.icon}</span>
                            <div className="text-[10px] font-semibold text-zinc-200 truncate flex-1 min-w-0">
                              {it.title || '(sin título)'}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-[8px]">
                            <span style={{ color }}>{FORMAT_LABELS[it.format]}</span>
                            <span className="text-zinc-600">·</span>
                            <span style={{ color: stage.color }}>{stage.label}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────
// TAB 4: Pipeline (kanban por etapa)
// ───────────────────────────────────────────────────────────────────
function PipelineTab({
  networkFilter, profileFilter, onEditItem,
}: { networkFilter: ContentNetwork | 'all'; profileFilter: string; onEditItem: (i: ContentItem) => void }) {
  const items = useContentStore((s) => s.items)
  const profiles = useContentStore((s) => s.profiles)
  const currentProfileId = useContentStore((s) => s.currentProfileId)
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles])
  const showAllProfiles = profileFilter === 'all'
  const viewProfileId = profileFilter === 'current' ? currentProfileId : profileFilter === 'all' ? null : profileFilter
  const activeProfile = profiles.find((p) => p.id === currentProfileId)
  const fallbackPillars = activeProfile?.brandDNA.pillars ?? []
  const setItemStage = useContentStore((s) => s.setItemStage)
  const addItem = useContentStore((s) => s.addItem)
  const [dragId, setDragId] = useState<string | null>(null)
  // Para el quick-add: qué columna tiene el input abierto.
  const [addingStage, setAddingStage] = useState<ContentStageId | null>(null)
  // Modo del tablero: 'general' (reels/carruseles/etc) o 'historias'
  // (pipeline propio de Instagram Stories). Persistido en LS.
  const [pipelineMode, setPipelineModeState] = useState<'general' | 'historias'>(
    () => (readLS<string>(LS_PIPELINE_MODE, 'general') === 'historias' ? 'historias' : 'general'),
  )
  const setPipelineMode = (m: 'general' | 'historias') => { setPipelineModeState(m); writeLS(LS_PIPELINE_MODE, m) }
  const stages: ContentStageId[] = ['idea', 'script', 'recording', 'editing', 'scheduled', 'published']
  const pillarByItem = (it: ContentItem) => {
    const ownProfile = profileById.get(it.profileId)
    const ownPillars = ownProfile?.brandDNA.pillars ?? fallbackPillars
    return ownPillars.find((p) => p.id === it.pillarId)
  }

  // El board General excluye las historias — viven en su propio tablero
  // (modo 'historias') para no duplicarlas ni mezclar dos estilos de
  // creación con etapas distintas.
  const filteredItems = items.filter((it) =>
    (showAllProfiles || (viewProfileId && it.profileId === viewProfileId))
    && (networkFilter === 'all' || it.network === networkFilter)
    && it.format !== 'stories'
  )

  // Defaults para el quick-add: si el filtro de red está fijado, lo
  // respetamos; si no, usamos la primera red del perfil. Profile: el
  // perfil del filtro si está fijado, sino el actual (cuando es 'all'
  // caemos al actual también — no podemos crear sin uno).
  const targetProfileId = showAllProfiles ? currentProfileId : (viewProfileId ?? currentProfileId)
  const targetProfile = profileById.get(targetProfileId) ?? activeProfile
  const targetNetwork: ContentNetwork = networkFilter !== 'all'
    ? networkFilter
    : (targetProfile?.networks?.[0] ?? 'instagram')
  const targetPillarId = targetProfile?.brandDNA.pillars[0]?.id ?? ''
  const todayYmd = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  function quickAdd(stage: ContentStageId, title: string) {
    const t = title.trim()
    if (!t) return
    addItem({
      profileId: targetProfileId,
      network: targetNetwork,
      pillarId: targetPillarId,
      scheduledYmd: todayYmd,
      format: 'reel',
      angle: 'Educativo',
      momentType: 'talk',
      hook: '',
      title: t,
      script: '',
      hashtags: '',
      stage,
    })
  }

  return (
    <div className="space-y-3">
      {/* Toggle General / Historias — dos pipelines distintos sobre el
          mismo set de items (mutuamente excluyentes por formato). */}
      <div className="inline-flex items-center bg-black/30 border border-white/[0.08] rounded-xl p-1 gap-1">
        {([
          { key: 'general' as const, label: 'General' },
          { key: 'historias' as const, label: '📸 Historias' },
        ]).map((m) => {
          const active = pipelineMode === m.key
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setPipelineMode(m.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                active ? 'bg-violet-500/25 text-violet-200' : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              {m.label}
            </button>
          )
        })}
      </div>

      {pipelineMode === 'historias' ? (
        <HistoriasBoard
          networkFilter={networkFilter}
          profileFilter={profileFilter}
          onEditItem={onEditItem}
        />
      ) : (
    <div className="overflow-x-auto pb-3">
      <div className="flex gap-3 min-w-max">
        {stages.map((stage) => {
          const stageMeta = STAGE_LABELS[stage]
          const stageItems = filteredItems.filter((it) => it.stage === stage)
          return (
            <div
              key={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId) { setItemStage(dragId, stage); setDragId(null) }
              }}
              className="w-72 shrink-0 bg-black/30 border border-white/[0.08] rounded-2xl p-3"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: stageMeta.color }} />
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: stageMeta.color }}>
                    {stageMeta.label}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-zinc-600">{stageItems.length}</span>
                  <button
                    type="button"
                    onClick={() => setAddingStage((cur) => cur === stage ? null : stage)}
                    title={`Agregar pieza en ${stageMeta.label}`}
                    className="w-5 h-5 flex items-center justify-center rounded transition-colors"
                    style={{
                      color: addingStage === stage ? '#fff' : stageMeta.color,
                      background: addingStage === stage ? `${stageMeta.color}40` : `${stageMeta.color}15`,
                    }}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {addingStage === stage && (
                <QuickAddRow
                  stageColor={stageMeta.color}
                  onSubmit={(title) => { quickAdd(stage, title) }}
                  onClose={() => setAddingStage(null)}
                />
              )}

              <div className="space-y-2">
                {stageItems.length === 0 ? (
                  <p className="text-[10px] text-zinc-700 text-center py-4 italic">vacío</p>
                ) : (
                  stageItems.map((it) => {
                    const pillar = pillarByItem(it)
                    const color = pillar?.color ?? '#71717a'
                    const netMeta = NETWORK_META[it.network]
                    const ownerProfile = profileById.get(it.profileId)
                    return (
                      <div
                        key={it.id}
                        draggable
                        onDragStart={() => setDragId(it.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => onEditItem(it)}
                        title={ownerProfile ? `${ownerProfile.name} · ${it.title}` : it.title}
                        className="rounded-lg p-2.5 cursor-pointer transition-all hover:brightness-125"
                        style={{
                          background: `${color}10`,
                          borderLeft: `3px solid ${color}`,
                          opacity: dragId === it.id ? 0.4 : 1,
                          ...(showAllProfiles && ownerProfile
                            ? { borderTop: `2px solid ${ownerProfile.color}` }
                            : {}),
                        }}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          {showAllProfiles && ownerProfile && (
                            <span
                              className="text-[10px] font-semibold px-1 py-0.5 rounded shrink-0"
                              style={{ background: `${ownerProfile.color}25`, color: ownerProfile.color }}
                              title={ownerProfile.name}
                            >
                              {ownerProfile.icon ?? '·'} {ownerProfile.name}
                            </span>
                          )}
                          <span className="text-xs" style={{ color: netMeta.color }}>{netMeta.icon}</span>
                          <div className="text-xs font-semibold text-zinc-200 line-clamp-2 flex-1 min-w-0">
                            {it.title || '(sin título)'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[9px] text-zinc-500">
                          <span>{it.scheduledYmd}</span>
                          <span>·</span>
                          <span>{FORMAT_LABELS[it.format]}</span>
                        </div>
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
      )}
    </div>
  )
}

// Input inline para crear una pieza rápido en una columna del pipeline.
// Enter → guarda, Esc o blur vacío → cierra. Shift+Enter o "Otra" mantiene
// el input abierto para cargar varias seguidas.
function QuickAddRow({
  stageColor, onSubmit, onClose,
}: { stageColor: string; onSubmit: (title: string) => void; onClose: () => void }) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    inputRef.current?.focus()
  }, [])

  function commit(keepOpen: boolean) {
    const t = value.trim()
    if (!t) {
      if (!keepOpen) onClose()
      return
    }
    onSubmit(t)
    setValue('')
    if (!keepOpen) onClose()
    else inputRef.current?.focus()
  }

  return (
    <div
      className="mb-2 rounded-lg p-2 border"
      style={{ background: `${stageColor}10`, borderColor: `${stageColor}40` }}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { if (!value.trim()) onClose() }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(e.shiftKey) }
          if (e.key === 'Escape') { e.preventDefault(); onClose() }
        }}
        placeholder="Título de la idea…"
        className="w-full bg-transparent text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none"
      />
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-[9px] font-mono text-zinc-600">
          Enter · Shift+Enter para otra · Esc para cerrar
        </p>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); commit(false) }}
          disabled={!value.trim()}
          className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded disabled:opacity-30"
          style={{ color: stageColor, background: `${stageColor}25` }}
        >
          + Agregar
        </button>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────
// Tablero de Historias — pipeline propio (idea → diseño → cta →
// programado → publicado) sobre los items con format === 'stories'.
// Mismo lenguaje visual que el board General pero con su forma de avanzar.
// ───────────────────────────────────────────────────────────────────
function HistoriasBoard({
  networkFilter, profileFilter, onEditItem,
}: { networkFilter: ContentNetwork | 'all'; profileFilter: string; onEditItem: (i: ContentItem) => void }) {
  const items = useContentStore((s) => s.items)
  const profiles = useContentStore((s) => s.profiles)
  const currentProfileId = useContentStore((s) => s.currentProfileId)
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles])
  const showAllProfiles = profileFilter === 'all'
  const viewProfileId = profileFilter === 'current' ? currentProfileId : profileFilter === 'all' ? null : profileFilter
  const activeProfile = profiles.find((p) => p.id === currentProfileId)
  const fallbackPillars = activeProfile?.brandDNA.pillars ?? []
  const setItemStoryStage = useContentStore((s) => s.setItemStoryStage)
  const addItem = useContentStore((s) => s.addItem)
  const [dragId, setDragId] = useState<string | null>(null)
  const [addingStage, setAddingStage] = useState<StoryStageId | null>(null)

  const pillarByItem = (it: ContentItem) => {
    const ownProfile = profileById.get(it.profileId)
    const ownPillars = ownProfile?.brandDNA.pillars ?? fallbackPillars
    return ownPillars.find((p) => p.id === it.pillarId)
  }

  // Solo historias, respetando los filtros de perfil/red del tab.
  const storyItems = items.filter((it) =>
    it.format === 'stories'
    && (showAllProfiles || (viewProfileId && it.profileId === viewProfileId))
    && (networkFilter === 'all' || it.network === networkFilter)
  )

  // Defaults para el quick-add (mismo criterio que PipelineTab).
  const targetProfileId = showAllProfiles ? currentProfileId : (viewProfileId ?? currentProfileId)
  const targetProfile = profileById.get(targetProfileId) ?? activeProfile
  // Las historias son de Instagram por naturaleza; si el filtro de red está
  // fijado lo respetamos, si no caemos a instagram.
  const targetNetwork: ContentNetwork = networkFilter !== 'all' ? networkFilter : 'instagram'
  const targetPillarId = targetProfile?.brandDNA.pillars[0]?.id ?? ''
  const todayYmd = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  function quickAdd(storyStage: StoryStageId, title: string) {
    const t = title.trim()
    if (!t) return
    addItem({
      profileId: targetProfileId,
      network: targetNetwork,
      pillarId: targetPillarId,
      scheduledYmd: todayYmd,
      format: 'stories',
      angle: 'Personal / Historia',
      momentType: 'live-moment',
      hook: '',
      title: t,
      script: '',
      hashtags: '',
      frames: [],
      cta: '',
      storyStage,
      stage: 'idea',
    })
  }

  return (
    <div className="overflow-x-auto pb-3">
      <div className="flex gap-3 min-w-max">
        {STORY_STAGE_ORDER.map((storyStage) => {
          const stageMeta = STORY_STAGE_LABELS[storyStage]
          const stageItems = storyItems.filter((it) => (it.storyStage ?? 'idea') === storyStage)
          return (
            <div
              key={storyStage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId) { setItemStoryStage(dragId, storyStage); setDragId(null) }
              }}
              className="w-72 shrink-0 bg-black/30 border border-white/[0.08] rounded-2xl p-3"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: stageMeta.color }} />
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: stageMeta.color }}>
                    {stageMeta.label}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-zinc-600">{stageItems.length}</span>
                  <button
                    type="button"
                    onClick={() => setAddingStage((cur) => cur === storyStage ? null : storyStage)}
                    title={`Agregar historia en ${stageMeta.label}`}
                    className="w-5 h-5 flex items-center justify-center rounded transition-colors"
                    style={{
                      color: addingStage === storyStage ? '#fff' : stageMeta.color,
                      background: addingStage === storyStage ? `${stageMeta.color}40` : `${stageMeta.color}15`,
                    }}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {addingStage === storyStage && (
                <QuickAddRow
                  stageColor={stageMeta.color}
                  onSubmit={(title) => { quickAdd(storyStage, title) }}
                  onClose={() => setAddingStage(null)}
                />
              )}

              <div className="space-y-2">
                {stageItems.length === 0 ? (
                  <p className="text-[10px] text-zinc-700 text-center py-4 italic">vacío</p>
                ) : (
                  stageItems.map((it) => {
                    const pillar = pillarByItem(it)
                    const color = pillar?.color ?? '#71717a'
                    const netMeta = NETWORK_META[it.network]
                    const ownerProfile = profileById.get(it.profileId)
                    const frames = it.frames ?? []
                    const framesDone = frames.filter((f) => f.done).length
                    const hasCta = !!it.cta?.trim()
                    return (
                      <div
                        key={it.id}
                        draggable
                        onDragStart={() => setDragId(it.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => onEditItem(it)}
                        title={ownerProfile ? `${ownerProfile.name} · ${it.title}` : it.title}
                        className="rounded-lg p-2.5 cursor-pointer transition-all hover:brightness-125"
                        style={{
                          background: `${color}10`,
                          borderLeft: `3px solid ${color}`,
                          opacity: dragId === it.id ? 0.4 : 1,
                          ...(showAllProfiles && ownerProfile
                            ? { borderTop: `2px solid ${ownerProfile.color}` }
                            : {}),
                        }}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          {showAllProfiles && ownerProfile && (
                            <span
                              className="text-[10px] font-semibold px-1 py-0.5 rounded shrink-0"
                              style={{ background: `${ownerProfile.color}25`, color: ownerProfile.color }}
                              title={ownerProfile.name}
                            >
                              {ownerProfile.icon ?? '·'} {ownerProfile.name}
                            </span>
                          )}
                          <span className="text-xs" style={{ color: netMeta.color }}>{netMeta.icon}</span>
                          <div className="text-xs font-semibold text-zinc-200 line-clamp-2 flex-1 min-w-0">
                            {it.title || '(sin título)'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[9px] text-zinc-500 flex-wrap">
                          <span>{it.scheduledYmd}</span>
                          <span>·</span>
                          <span title="slides listos / total">
                            🖼 {framesDone}/{frames.length} slides
                          </span>
                          {hasCta && (
                            <span className="text-amber-400/90" title={`CTA: ${it.cta}`}>🔗 CTA</span>
                          )}
                        </div>
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
  )
}

// ───────────────────────────────────────────────────────────────────
// Modal de item — crear/editar
// ───────────────────────────────────────────────────────────────────
function ItemModal({
  item, defaultDate, monthYmd, onClose,
}: { item: ContentItem | null; defaultDate?: string; monthYmd: string; onClose: () => void }) {
  const addItem = useContentStore((s) => s.addItem)
  const updateItem = useContentStore((s) => s.updateItem)
  const removeItem = useContentStore((s) => s.removeItem)
  const currentProfileId = useContentStore((s) => s.currentProfileId)
  const profile = useContentStore((s) => s.profiles.find((p) => p.id === s.currentProfileId))
  const pillars = profile?.brandDNA.pillars ?? []
  const campaign = useContentStore((s) => s.getCampaignForMonth(monthYmd))
  const profileNetworks = profile?.networks ?? ['instagram']

  const [draft, setDraft] = useState<Partial<ContentItem>>(
    item ?? {
      profileId: currentProfileId,
      network: profileNetworks[0] ?? 'instagram',
      pillarId: pillars[0]?.id ?? '',
      scheduledYmd: defaultDate ?? `${monthYmd}-01`,
      format: 'reel',
      momentType: 'talk',
      angle: 'Educativo',
      hook: '',
      title: '',
      script: '',
      hashtags: '',
      stage: 'idea',
      campaignId: campaign?.id,
    }
  )

  const setF = <K extends keyof ContentItem>(k: K, v: ContentItem[K]) => setDraft((d) => ({ ...d, [k]: v }))

  // ── Historias: el editor cambia de cara cuando el formato es 'stories'.
  //    Se arma como carrusel de frames (nota + listo) + un CTA, sin guion.
  const isStory = draft.format === 'stories'
  const frames: StoryFrame[] = draft.frames ?? []
  const setFrames = (next: StoryFrame[]) => setF('frames', next)
  const addFrame = () => setFrames([...frames, { id: genFrameId(), note: '', done: false }])
  const updateFrame = (id: string, patch: Partial<StoryFrame>) =>
    setFrames(frames.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  const removeFrame = (id: string) => setFrames(frames.filter((f) => f.id !== id))
  const moveFrame = (id: string, dir: -1 | 1) => {
    const idx = frames.findIndex((f) => f.id === id)
    if (idx < 0) return
    const to = idx + dir
    if (to < 0 || to >= frames.length) return
    const next = [...frames]
    ;[next[idx], next[to]] = [next[to], next[idx]]
    setFrames(next)
  }

  const handleSave = () => {
    if (!draft.title?.trim() && !draft.hook?.trim()) {
      alert('Poné al menos un título o un hook para guardar.')
      return
    }
    if (item) {
      updateItem(item.id, draft)
    } else {
      addItem({
        profileId: currentProfileId,
        network: draft.network ?? 'instagram',
        pillarId: draft.pillarId ?? pillars[0]?.id ?? '',
        scheduledYmd: draft.scheduledYmd ?? defaultDate ?? `${monthYmd}-01`,
        scheduledTime: draft.scheduledTime,
        format: draft.format ?? 'reel',
        angle: draft.angle ?? 'Educativo',
        momentType: draft.momentType ?? 'talk',
        hook: draft.hook ?? '',
        title: draft.title ?? '',
        script: draft.script ?? '',
        hashtags: draft.hashtags ?? '',
        notes: draft.notes,
        stage: draft.stage ?? 'idea',
        // Campos de Historias — solo relevantes con format === 'stories'.
        frames: draft.frames,
        cta: draft.cta,
        storyStage: draft.format === 'stories' ? (draft.storyStage ?? 'idea') : undefined,
        campaignId: draft.campaignId,
        weekFocusId: draft.weekFocusId,
      })
    }
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.97, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-white/[0.10] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white truncate">
              {item ? 'Editar pieza' : 'Nueva pieza'}
            </h2>
            <p className="text-[10px] text-zinc-500">
              {profile?.name} · {draft.scheduledYmd}{draft.scheduledTime ? ` · ${draft.scheduledTime}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {/* Red + Fecha + Hora */}
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Red">
              <select value={draft.network ?? 'instagram'} onChange={(e) => setF('network', e.target.value as ContentNetwork)}
                className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500">
                {profileNetworks.map((n) => <option key={n} value={n}>{NETWORK_META[n].icon} {NETWORK_META[n].label}</option>)}
              </select>
            </FormField>
            <FormField label="Fecha">
              <input type="date" value={draft.scheduledYmd ?? ''} onChange={(e) => setF('scheduledYmd', e.target.value)}
                className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500" />
            </FormField>
            <FormField label="Hora (opcional)">
              <input type="time" value={draft.scheduledTime ?? ''} onChange={(e) => setF('scheduledTime', e.target.value || undefined)}
                className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500" />
            </FormField>
          </div>

          {/* Pilar + foco semanal */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Pilar">
              <select value={draft.pillarId ?? ''} onChange={(e) => setF('pillarId', e.target.value)}
                className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500">
                {pillars.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </FormField>
            <FormField label="Foco semanal (opcional)">
              <select value={draft.weekFocusId ?? ''} onChange={(e) => setF('weekFocusId', e.target.value || undefined)}
                className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500">
                <option value="">— sin foco —</option>
                {campaign?.weeklyFoci.map((f) => <option key={f.id} value={f.id}>{f.weekStartYmd} · {f.theme.slice(0, 30) || '(sin tema)'}</option>)}
              </select>
            </FormField>
          </div>

          {/* Formato + tipo + ángulo */}
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Formato">
              <select value={draft.format ?? 'reel'} onChange={(e) => setF('format', e.target.value as ContentFormat)}
                className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500">
                {Object.entries(FORMAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </FormField>
            {!isStory && (
              <FormField label="Tipo de momento">
                <select value={draft.momentType ?? 'talk'} onChange={(e) => setF('momentType', e.target.value as ContentMomentType)}
                  className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500">
                  {Object.entries(MOMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </FormField>
            )}
            <FormField label="Ángulo">
              <input list="angle-options" value={draft.angle ?? ''} onChange={(e) => setF('angle', e.target.value)}
                className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500" />
              <datalist id="angle-options">
                {ANGLE_SUGGESTIONS.map((a) => <option key={a} value={a} />)}
              </datalist>
            </FormField>
          </div>

          {!isStory && (
            <FormField label="Hook (primeros 3 segundos)" hint="Lo más importante. Define si te miran o te pasan.">
              <textarea value={draft.hook ?? ''} onChange={(e) => setF('hook', e.target.value)} rows={2}
                className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500 resize-none" />
            </FormField>
          )}
          <FormField label="Título / Encabezado">
            <input value={draft.title ?? ''} onChange={(e) => setF('title', e.target.value)}
              className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500" />
          </FormField>
          {isStory ? (
            <>
              {/* Frames de la historia — se arma como un carrusel: cada slide
                  es una nota (qué va en esa imagen) + un check de "listo". */}
              <FormField label="Slides de la historia" hint="Armá el carrusel: una nota por slide + tildá cuando la imagen esté lista.">
                <div className="space-y-1.5">
                  {frames.length === 0 && (
                    <p className="text-[11px] text-zinc-600 italic px-1 py-2">
                      Todavía no agregaste slides. Tocá &quot;+ Agregar slide&quot;.
                    </p>
                  )}
                  {frames.map((f, idx) => (
                    <div key={f.id} className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-zinc-600 w-5 text-right shrink-0">{idx + 1}.</span>
                      <button
                        type="button"
                        onClick={() => updateFrame(f.id, { done: !f.done })}
                        title={f.done ? 'Marcar como no listo' : 'Marcar imagen como lista'}
                        className="shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors"
                        style={{
                          borderColor: f.done ? '#10b981' : 'rgba(255,255,255,0.18)',
                          background: f.done ? '#10b98125' : 'transparent',
                          color: f.done ? '#10b981' : '#71717a',
                        }}
                      >
                        {f.done && <Check className="w-3 h-3" />}
                      </button>
                      <input
                        value={f.note}
                        onChange={(e) => updateFrame(f.id, { note: e.target.value })}
                        placeholder={`Slide ${idx + 1} — qué muestra`}
                        className={`flex-1 min-w-0 bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-violet-500 ${f.done ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}
                      />
                      <div className="flex items-center shrink-0">
                        <button type="button" onClick={() => moveFrame(f.id, -1)} disabled={idx === 0}
                          title="Subir" className="text-zinc-600 hover:text-zinc-200 disabled:opacity-25 disabled:cursor-not-allowed p-0.5">
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => moveFrame(f.id, 1)} disabled={idx === frames.length - 1}
                          title="Bajar" className="text-zinc-600 hover:text-zinc-200 disabled:opacity-25 disabled:cursor-not-allowed p-0.5">
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => removeFrame(f.id)}
                          title="Eliminar slide" className="text-zinc-600 hover:text-red-400 p-0.5">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addFrame}
                    className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-violet-300 hover:text-violet-200 px-2 py-1 rounded-lg bg-violet-500/10 border border-violet-500/30 hover:bg-violet-500/20 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar slide
                  </button>
                </div>
              </FormField>
              <FormField label="CTA (call-to-action)" hint="El cierre de la historia: qué querés que haga la persona.">
                <input value={draft.cta ?? ''} onChange={(e) => setF('cta', e.target.value)}
                  placeholder="Ej. Mandá DM 'QUIERO', Deslizá ↑, Respondé la encuesta…"
                  className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500" />
              </FormField>
            </>
          ) : (
            <FormField label="Guion / Texto">
              <textarea value={draft.script ?? ''} onChange={(e) => setF('script', e.target.value)} rows={5}
                className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500 resize-none" />
            </FormField>
          )}
          <FormField label="Hashtags">
            <input value={draft.hashtags ?? ''} onChange={(e) => setF('hashtags', e.target.value)}
              placeholder="#estrategia #creatividad"
              className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-violet-500" />
          </FormField>
          <FormField label="Notas / Referencias visuales">
            <textarea value={draft.notes ?? ''} onChange={(e) => setF('notes', e.target.value)} rows={2}
              className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-violet-500 resize-none" />
          </FormField>

          <FormField label={isStory ? 'Etapa de la historia' : 'Etapa de producción'}>
            <div className="flex gap-1 flex-wrap">
              {isStory ? (
                STORY_STAGE_ORDER.map((s) => {
                  const meta = STORY_STAGE_LABELS[s]
                  const active = (draft.storyStage ?? 'idea') === s
                  return (
                    <button key={s} onClick={() => setF('storyStage', s)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors`}
                      style={{
                        borderColor: active ? meta.color : 'rgba(255,255,255,0.1)',
                        background: active ? `${meta.color}25` : 'transparent',
                        color: active ? meta.color : '#a1a1aa',
                      }}>
                      {meta.label}
                    </button>
                  )
                })
              ) : (
                (Object.keys(STAGE_LABELS) as ContentStageId[]).map((s) => {
                  const meta = STAGE_LABELS[s]
                  const active = draft.stage === s
                  return (
                    <button key={s} onClick={() => setF('stage', s)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors`}
                      style={{
                        borderColor: active ? meta.color : 'rgba(255,255,255,0.1)',
                        background: active ? `${meta.color}25` : 'transparent',
                        color: active ? meta.color : '#a1a1aa',
                      }}>
                      {meta.label}
                    </button>
                  )
                })
              )}
            </div>
          </FormField>

          {(isStory ? draft.storyStage === 'published' : draft.stage === 'published') && (
            <div className="pt-3 border-t border-white/[0.06] space-y-3">
              <h3 className="text-xs font-semibold text-emerald-300 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5" /> Performance post-publicación
              </h3>
              <div className="grid grid-cols-5 gap-2">
                {(['views', 'likes', 'comments', 'saves', 'shares'] as const).map((k) => (
                  <FormField key={k} label={k}>
                    <input type="number" min={0} value={(draft[k] as number | undefined) ?? ''}
                      onChange={(e) => setF(k, e.target.value === '' ? undefined : Number(e.target.value))}
                      className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500" />
                  </FormField>
                ))}
              </div>
              <FormField label="Notas cualitativas">
                <textarea value={draft.qualitativeNotes ?? ''} onChange={(e) => setF('qualitativeNotes', e.target.value)} rows={2}
                  className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500 resize-none" />
              </FormField>
              <FormField label="URL publicado">
                <input type="url" value={draft.publishedUrl ?? ''} onChange={(e) => setF('publishedUrl', e.target.value || undefined)}
                  className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500" />
              </FormField>
              <FormField label="Decisión para próximo ciclo">
                <div className="flex gap-1.5">
                  {(['repeat', 'improve', 'delete', 'undecided'] as PostCycleAction[]).map((a) => {
                    const label = { repeat: 'Repetir', improve: 'Mejorar', delete: 'Eliminar', undecided: 'Sin decidir' }[a]
                    const color = { repeat: '#10b981', improve: '#f59e0b', delete: '#ef4444', undecided: '#71717a' }[a]
                    const active = draft.postCycleAction === a
                    return (
                      <button key={a} onClick={() => setF('postCycleAction', a)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors"
                        style={{
                          borderColor: active ? color : 'rgba(255,255,255,0.1)',
                          background: active ? `${color}25` : 'transparent',
                          color: active ? color : '#a1a1aa',
                        }}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </FormField>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 p-4 border-t border-white/[0.06]">
          {item && (
            <button onClick={() => { if (confirm('¿Eliminar esta pieza?')) { removeItem(item.id); onClose() } }}
              className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 text-sm font-semibold transition-colors flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5" /> Eliminar
            </button>
          )}
          <button onClick={onClose} className="ml-auto px-4 py-2 rounded-lg bg-zinc-800 hover:bg-white/[0.08] text-zinc-300 text-sm font-semibold transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-violet-500/20 border border-violet-500/40 hover:bg-violet-500/30 text-violet-200 text-sm font-bold transition-colors">
            Guardar
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ───────────────────────────────────────────────────────────────────
// Reusable atoms
// ───────────────────────────────────────────────────────────────────
function Card({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/[0.025] border border-white/[0.08] p-5"
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {subtitle && <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function TextField({
  label, hint, value, onChange, multiline,
}: { label: string; hint?: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <FormField label={label} hint={hint}>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2}
          className="w-full bg-white/[0.02] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full bg-white/[0.02] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500" />
      )}
    </FormField>
  )
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-zinc-600 mt-1 italic">{hint}</p>}
    </div>
  )
}

/** Mapa de conocimiento por pilar — sección colapsable con textarea
 *  autogrow. Es el intermedio entre el ADN macro y las piezas concretas.
 *  El user lista temas, ideas, sub-pilares, marcos, conceptos que
 *  efectivamente toca dentro del pilar. Notion-style hoja en blanco.
 *
 *  Por qué colapsable y no siempre visible: cuando el user no escribió
 *  nada, mostrar el área en blanco ensucia. Toggle minimalista que se
 *  expande cuando hay contenido o cuando el user lo abre.  */
function KnowledgeMapField({
  color, pillarId, value, onChange,
}: { color: string; pillarId: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(() => value.trim().length > 0)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Para mandar ideas al pipeline: necesitamos el profile activo (los
  // items se asocian al perfil + pilar) y la lista actual de items para
  // poder marcar como "ya enviadas" las líneas que ya tienen una pieza
  // creada con el mismo título dentro del pilar (cualquier stage, así
  // si la moviste a 'script' o 'editing' sigue contando como mandada).
  const currentProfileId = useContentStore((s) => s.currentProfileId)
  const items = useContentStore((s) => s.items)
  const addItem = useContentStore((s) => s.addItem)
  const profile = useContentStore((s) => s.profiles.find((p) => p.id === s.currentProfileId))
  const defaultNetwork: ContentNetwork = profile?.networks?.[0] ?? 'instagram'

  // Auto-grow: cada vez que cambia el valor, ajustamos altura al
  // scrollHeight para que el textarea crezca con el contenido.
  useLayoutEffect(() => {
    if (!open || !taRef.current) return
    taRef.current.style.height = 'auto'
    taRef.current.style.height = `${taRef.current.scrollHeight}px`
  }, [value, open])

  // Líneas no vacías, normalizadas: quita bullets sueltos ("- ", "• ", "* ")
  // del principio para que la idea quede limpia en el pipeline.
  const lines = useMemo(() => {
    return value
      .split('\n')
      .map((l) => l.replace(/^\s*(?:[-*•]\s+)?/, '').trim())
      .filter((l) => l.length > 0)
  }, [value])

  // Set de títulos ya enviados al pipeline (matched por profile + pilar +
  // título normalizado en minúsculas). Cualquier stage cuenta.
  const sentTitles = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) {
      if (it.profileId !== currentProfileId) continue
      if (it.pillarId !== pillarId) continue
      if (!it.title) continue
      set.add(it.title.trim().toLowerCase())
    }
    return set
  }, [items, currentProfileId, pillarId])

  const todayYmd = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  function sendLine(line: string) {
    if (sentTitles.has(line.toLowerCase())) return
    addItem({
      profileId: currentProfileId,
      network: defaultNetwork,
      pillarId,
      scheduledYmd: todayYmd,
      format: 'reel',
      angle: 'Educativo',
      momentType: 'talk',
      hook: '',
      title: line,
      script: '',
      hashtags: '',
      stage: 'idea',
    })
  }

  function sendAllPending() {
    for (const l of lines) {
      if (!sentTitles.has(l.toLowerCase())) sendLine(l)
    }
  }

  const pendingCount = lines.filter((l) => !sentTitles.has(l.toLowerCase())).length

  return (
    <div className="mt-2 border-t border-white/[0.05] pt-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider hover:opacity-80 transition-opacity"
          style={{ color }}
        >
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Mapa de conocimiento
          {!open && lines.length > 0 && (
            <span className="text-zinc-600 normal-case font-sans tracking-normal">
              · {lines.length} {lines.length === 1 ? 'idea' : 'ideas'}
              {pendingCount > 0 && (
                <span className="text-violet-400/80"> · {pendingCount} sin enviar</span>
              )}
            </span>
          )}
        </button>
        {open && pendingCount > 0 && (
          <button
            type="button"
            onClick={sendAllPending}
            title={`Mandar las ${pendingCount} ideas pendientes al Pipeline`}
            className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded text-violet-300 hover:text-white hover:bg-violet-500/20 border border-violet-500/30 transition-colors"
          >
            <Send className="w-2.5 h-2.5" /> Mandar {pendingCount}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-1.5 space-y-2">
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Temas, ideas, sub-pilares, marcos, conceptos que tocás en este pilar.\n\nUna línea por idea — la lista crece con vos.\n\nEjemplos:\n- frameworks que usás\n- preguntas recurrentes\n- mini-tesis que defendés`}
            className="w-full bg-black/30 border border-white/[0.06] rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-violet-500/40 resize-none overflow-hidden leading-relaxed"
            style={{ minHeight: '60px' }}
          />

          {lines.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-600 px-1">
                Mandar al Pipeline
              </p>
              {lines.map((line, idx) => {
                const sent = sentTitles.has(line.toLowerCase())
                return (
                  <div
                    key={`${idx}-${line}`}
                    className="group flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-white/[0.03] transition-colors"
                  >
                    <span className={`flex-1 min-w-0 truncate text-xs ${sent ? 'text-zinc-600 line-through' : 'text-zinc-400'}`}>
                      {line}
                    </span>
                    {sent ? (
                      <span
                        title="Ya está en el pipeline"
                        className="flex-shrink-0 flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-emerald-500/60"
                      >
                        <Check className="w-2.5 h-2.5" /> en pipeline
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => sendLine(line)}
                        title="Mandar al Pipeline como idea"
                        className="flex-shrink-0 flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded text-zinc-500 hover:text-violet-200 hover:bg-violet-500/15 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Send className="w-2.5 h-2.5" /> Pipeline
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────
// ESTILO VISUAL — mood board por perfil (categorías + imágenes)
// ───────────────────────────────────────────────────────────────────
function EstiloVisualTab() {
  const profile = useContentStore((s) => s.profiles.find((p) => p.id === s.currentProfileId))
  const addVisualCategory = useContentStore((s) => s.addVisualCategory)
  const [newCat, setNewCat] = useState('')
  const [lightbox, setLightbox] = useState<VisualStyleImage | null>(null)

  if (!profile) return null
  const categories = profile.visualStyle ?? []

  const submitCat = () => {
    const n = newCat.trim()
    if (!n) return
    addVisualCategory(profile.id, n)
    setNewCat('')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-zinc-500 max-w-xl">
          Referencias visuales de <span className="text-zinc-300">{profile.name}</span>. Creá categorías
          (ej. <em>Estilo videos</em>, <em>Estilo portadas</em>) y subí imágenes para armar el mood board.
        </p>
        <div className="flex items-center gap-2">
          <input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitCat() }}
            placeholder="Nueva categoría…"
            className="bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
          />
          <button onClick={submitCat}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-violet-400/40 text-violet-200 bg-violet-500/15 hover:bg-violet-500/25 transition-colors flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Categoría
          </button>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="rounded-2xl p-10 text-center border border-dashed border-white/[0.10] bg-white/[0.02]">
          <ImageIcon className="w-10 h-10 text-violet-400/60 mx-auto mb-3" />
          <p className="text-sm font-semibold text-zinc-200 mb-1">Sin estilo visual todavía</p>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            Creá tu primera categoría (ej. &quot;Estilo portadas&quot;) y empezá a subir imágenes de referencia.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => (
            <VisualCategoryBlock key={cat.id} profileId={profile.id} category={cat} onOpenImage={setLightbox} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-zinc-300 hover:text-white"><X className="w-6 h-6" /></button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox.url} alt={lightbox.caption ?? 'referencia'} className="max-w-full max-h-[88vh] object-contain rounded-lg shadow-2xl" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function VisualCategoryBlock({
  profileId, category, onOpenImage,
}: {
  profileId: string
  category: VisualStyleCategory
  onOpenImage: (img: VisualStyleImage) => void
}) {
  const renameVisualCategory = useContentStore((s) => s.renameVisualCategory)
  const removeVisualCategory = useContentStore((s) => s.removeVisualCategory)
  const addVisualImage = useContentStore((s) => s.addVisualImage)
  const removeVisualImage = useContentStore((s) => s.removeVisualImage)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(category.name)
  const [uploading, setUploading] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (arr.length === 0) return
    setUploading((c) => c + arr.length)
    await Promise.allSettled(arr.map(async (f) => {
      try {
        const img = await uploadVisualImage(f, profileId, category.id)
        addVisualImage(profileId, category.id, img)
      } catch {
        /* el helper ya dispara el toast de error */
      } finally {
        setUploading((c) => Math.max(0, c - 1))
      }
    }))
    if (fileRef.current) fileRef.current.value = ''
  }

  const onDeleteImage = (img: VisualStyleImage) => {
    removeVisualImage(profileId, category.id, img.id) // optimista en UI
    void deleteVisualImage(img.path)                   // best-effort en la nube
  }

  const saveName = () => { renameVisualCategory(profileId, category.id, name); setRenaming(false) }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
      <div className="flex items-center gap-2">
        {renaming ? (
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setName(category.name); setRenaming(false) } }}
            onBlur={saveName}
            className="bg-zinc-800 border border-white/[0.12] rounded-lg px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:border-violet-500" />
        ) : (
          <button onClick={() => { setName(category.name); setRenaming(true) }} className="text-sm font-semibold text-white hover:text-violet-200 transition-colors">
            {category.name}
          </button>
        )}
        <span className="text-[11px] text-zinc-500">{category.images.length} {category.images.length === 1 ? 'imagen' : 'imágenes'}</span>
        {uploading > 0 && (
          <span className="text-[11px] text-violet-300 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> subiendo {uploading}…</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => fileRef.current?.click()}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-violet-400/40 text-violet-200 bg-violet-500/15 hover:bg-violet-500/25 transition-colors flex items-center gap-1.5">
            <Upload className="w-3 h-3" /> Subir
          </button>
          <button onClick={() => { if (confirm(`¿Eliminar la categoría "${category.name}" y sus ${category.images.length} imágenes?`)) { for (const img of category.images) void deleteVisualImage(img.path); removeVisualCategory(profileId, category.id) } }}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Eliminar categoría">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => onFiles(e.target.files)} />
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {category.images.map((img) => (
          <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border border-white/[0.08] bg-zinc-900">
            <button onClick={() => onOpenImage(img)} className="w-full h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.caption ?? 'referencia'} loading="lazy" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
            </button>
            <button onClick={() => onDeleteImage(img)}
              className="absolute top-1 right-1 p-1 rounded-md bg-black/60 text-zinc-300 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all" title="Eliminar">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {/* Placeholders de carga */}
        {Array.from({ length: uploading }).map((_, i) => (
          <div key={`up-${i}`} className="aspect-square rounded-lg border border-dashed border-violet-400/30 bg-violet-500/5 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-violet-400/70 animate-spin" />
          </div>
        ))}
        {/* Tile de subir */}
        <button onClick={() => fileRef.current?.click()}
          className="aspect-square rounded-lg border border-dashed border-white/[0.12] text-zinc-500 hover:text-violet-300 hover:border-violet-400/40 transition-colors flex flex-col items-center justify-center gap-1">
          <Upload className="w-5 h-5" />
          <span className="text-[10px]">Subir</span>
        </button>
      </div>
    </div>
  )
}
