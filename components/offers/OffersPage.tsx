'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Rocket, Plus, Trash2, Settings2, Globe, X, Check, ChevronRight, Tag, GitBranch, Search,
} from 'lucide-react'
import {
  useOffersStore, OFFER_PALETTE,
  type Offer, type OfferStage, type OfferCategory, type OfferGeo,
} from '@/lib/store/offersStore'
import { OfferDoc } from './OfferDoc'
import { type Block, emptyDoc } from '@/lib/offers/blocks'

type View = 'board' | 'geo'

export function OffersPage() {
  const st = useOffersStore()
  const {
    systems, offers, stages, categories, geos,
    addSystem, updateSystem, removeSystem, setSystemDoc,
    addOffer, updateOffer, removeOffer, toggleOfferCategory, toggleOfferGeo, setOfferDoc,
  } = st

  const sortedStages = stages.slice().sort((a, b) => a.order - b.order)
  const [activeSystemId, setActiveSystemId] = useState<string | null>(null)
  const system = systems.find((s) => s.id === activeSystemId) ?? systems[0] ?? null

  const [view, setView] = useState<View>('board')
  const [stageFilter, setStageFilter] = useState<string | null>(null)  // null = ALL
  const [query, setQuery] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const [editingOffer, setEditingOffer] = useState<string | null>(null)
  const [openOfferId, setOpenOfferId] = useState<string | null>(null)
  const [activeGeoId, setActiveGeoId] = useState<string | null>(null)

  const catById = new Map(categories.map((c) => [c.id, c]))
  const geoById = new Map(geos.map((g) => [g.id, g]))
  const stageById = new Map(stages.map((s) => [s.id, s]))

  const systemOffers = offers.filter((o) => o.systemId === system?.id)
  const q = query.trim().toLowerCase()
  const visible = systemOffers
    .filter((o) => (stageFilter === null || o.stageId === stageFilter))
    .filter((o) => !q || o.name.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => a.order - b.order)

  // ── Sin ningún sistema todavía ──
  if (!system) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="max-w-7xl mx-auto px-4 py-6">
        <Header onNew={() => setActiveSystemId(addSystem('Offer System: DRM'))} />
        <div className="mt-8 bg-zinc-950/40 border border-zinc-800 border-dashed rounded-2xl p-12 text-center">
          <Rocket className="w-10 h-10 text-violet-400/60 mx-auto mb-3" />
          <p className="text-sm font-semibold text-zinc-200 mb-1">Sin sistemas de ofertas</p>
          <p className="text-xs text-zinc-500 mb-5 max-w-sm mx-auto">
            Un sistema agrupa las ofertas de un negocio y su pipeline. Empezá creando uno.
          </p>
          <button
            onClick={() => setActiveSystemId(addSystem('Offer System: DRM'))}
            className="px-4 py-2 bg-violet-500/15 border border-violet-500/40 hover:bg-violet-500/25 text-violet-300 rounded-lg text-sm font-semibold transition-all inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Crear el primero
          </button>
        </div>
      </motion.div>
    )
  }

  // ── Detalle de una oferta ──
  const openOffer = openOfferId ? offers.find((o) => o.id === openOfferId) ?? null : null
  if (openOffer) {
    return (
      <OfferDetail
        offer={openOffer}
        systemName={system.name}
        stages={sortedStages}
        categories={categories}
        geos={geos}
        onBack={() => setOpenOfferId(null)}
        onPatch={(p) => updateOffer(openOffer.id, p)}
        onToggleCat={(id) => toggleOfferCategory(openOffer.id, id)}
        onToggleGeo={(id) => toggleOfferGeo(openOffer.id, id)}
        onDoc={(d) => setOfferDoc(openOffer.id, d)}
        onDelete={() => {
          if (confirm(`¿Borrar "${openOffer.name || 'esta oferta'}"?`)) {
            removeOffer(openOffer.id); setOpenOfferId(null)
          }
        }}
      />
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <Header onNew={() => setActiveSystemId(addSystem('Nuevo sistema'))} />

      {/* Selector de sistemas — chips tipo breadcrumb */}
      {systems.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {systems.map((s) => (
            <button
              key={s.id}
              onClick={() => { setActiveSystemId(s.id); setStageFilter(null) }}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                s.id === system.id
                  ? 'bg-violet-500/15 border-violet-500/40 text-violet-200 font-semibold'
                  : 'border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
              }`}
            >
              <span>{s.icon}</span>{s.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Tarjeta del sistema ── */}
      <section className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/60 to-zinc-950/60 overflow-hidden">
        {/* Encabezado */}
        <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center gap-2.5 flex-wrap">
          <span className="text-lg leading-none">{system.icon}</span>
          <input
            value={system.name}
            onChange={(e) => updateSystem(system.id, { name: e.target.value })}
            className="bg-transparent text-sm font-bold text-zinc-100 outline-none focus:bg-white/[0.04] rounded px-1.5 py-0.5 transition-colors min-w-[12rem]"
          />
          <span className="text-[10px] text-zinc-600 tabular-nums">
            {systemOffers.length} {systemOffers.length === 1 ? 'oferta' : 'ofertas'}
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-600 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar…"
                className="w-36 bg-zinc-900/80 border border-zinc-800 focus:border-violet-500/50 rounded-lg pl-7 pr-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition-colors"
              />
            </div>
            <ViewToggle view={view} onChange={setView} />
            <button
              onClick={() => setShowConfig(true)}
              title="Editar etapas, categorías y GEOs"
              className="text-zinc-500 hover:text-violet-300 hover:bg-zinc-800 p-1.5 rounded-lg transition-colors"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (confirm(`¿Borrar "${system.name}" y sus ${systemOffers.length} ofertas?`)) {
                  removeSystem(system.id); setActiveSystemId(null)
                }
              }}
              title="Borrar sistema"
              className="text-zinc-600 hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {view === 'board' ? (
          <>
            {/* Pestañas por etapa */}
            <div className="px-3 py-2 border-b border-zinc-800/60 flex items-center gap-1 flex-wrap">
              <StageTab
                label="ALL"
                count={systemOffers.length}
                active={stageFilter === null}
                onClick={() => setStageFilter(null)}
              />
              {sortedStages.map((s) => (
                <StageTab
                  key={s.id}
                  label={s.name}
                  color={s.color}
                  count={systemOffers.filter((o) => o.stageId === s.id).length}
                  active={stageFilter === s.id}
                  onClick={() => setStageFilter(s.id)}
                />
              ))}
            </div>

            {/* Filas */}
            <div className="divide-y divide-zinc-800/50">
              {visible.map((o) => (
                <OfferRow
                  key={o.id}
                  offer={o}
                  stage={stageById.get(o.stageId)}
                  categories={o.categoryIds.map((id) => catById.get(id)).filter(Boolean) as OfferCategory[]}
                  geos={o.geoIds.map((id) => geoById.get(id)).filter(Boolean) as OfferGeo[]}
                  onOpen={() => setOpenOfferId(o.id)}
                  onRename={(name) => updateOffer(o.id, { name })}
                />
              ))}
              {visible.length === 0 && (
                <p className="text-xs text-zinc-600 text-center py-10">
                  {q ? 'Nada coincide con la búsqueda' : 'Sin ofertas en esta etapa'}
                </p>
              )}
            </div>

            <button
              onClick={() => setOpenOfferId(addOffer(system.id, '', stageFilter ?? undefined))}
              className="w-full text-xs text-zinc-600 hover:text-violet-300 hover:bg-violet-500/[0.06] py-2.5 transition-colors flex items-center justify-center gap-1.5 border-t border-zinc-800/50"
            >
              <Plus className="w-3.5 h-3.5" /> Nueva oferta
            </button>
          </>
        ) : (
          <GeoView
            geos={geos}
            offers={systemOffers}
            stageById={stageById}
            catById={catById}
            activeGeoId={activeGeoId}
            onPickGeo={setActiveGeoId}
            onOpenOffer={setOpenOfferId}
          />
        )}
      </section>

      {/* ── Documento libre ──
          Ocupa TODO el ancho del área de contenido: `-mx-4` cancela el padding
          del contenedor, y no hay borde lateral ni caja para que se sienta una
          hoja y no una tarjeta.
          NO se usa `w-screen`: mide contra la ventana, y como el área de
          contenido está corrida por el sidebar, la sección se salía por la
          derecha. */}
      <section className="-mx-4 border-t border-zinc-800/60 bg-zinc-950/40 mt-2">
        <div className="px-6 py-5">
          <h2 className="text-[10px] uppercase tracking-wider text-zinc-600 mb-3">Notas del sistema</h2>
          <OfferDoc doc={system.doc} onChange={(next) => setSystemDoc(system.id, next)} />
          <p className="text-[10px] text-zinc-700 mt-3">
            Seleccioná un texto para convertirlo en viñeta, desplegable o página.
          </p>
        </div>
      </section>

      {showConfig && <ConfigPanel onClose={() => setShowConfig(false)} />}
      {editingOffer && (() => {
        const o = offers.find((x) => x.id === editingOffer)
        if (!o) return null
        return (
          <OfferModal
            offer={o}
            stages={sortedStages}
            categories={categories}
            geos={geos}
            onClose={() => setEditingOffer(null)}
            onPatch={(p) => updateOffer(o.id, p)}
            onToggleCat={(id) => toggleOfferCategory(o.id, id)}
            onToggleGeo={(id) => toggleOfferGeo(o.id, id)}
            onDelete={() => { removeOffer(o.id); setEditingOffer(null) }}
          />
        )
      })()}
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function Header({ onNew }: { onNew: () => void }) {
  return (
    <header className="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
          <Rocket className="w-6 h-6 text-violet-400" />
          Ofertas
        </h1>
        <p className="text-xs text-zinc-500 mt-1 max-w-xl">
          El pipeline de tus ofertas: de Stock a STH, y si tracciona a UGO. Clasificalas por
          categoría y mirá qué está corriendo en cada GEO.
        </p>
      </div>
      <button
        onClick={onNew}
        className="px-3 py-2 bg-violet-500/15 border border-violet-500/40 hover:bg-violet-500/25 active:bg-violet-500/30 text-violet-300 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5"
      >
        <Plus className="w-4 h-4" /> Nuevo sistema
      </button>
    </header>
  )
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="flex items-center bg-zinc-900/80 border border-zinc-800 rounded-lg p-0.5">
      {([['board', 'Tablero', GitBranch], ['geo', 'GEOs', Globe]] as const).map(([k, label, Icon]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`text-[11px] px-2 py-1 rounded-md transition-colors flex items-center gap-1 ${
            view === k ? 'bg-violet-500/20 text-violet-200' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Icon className="w-3 h-3" /> {label}
        </button>
      ))}
    </div>
  )
}

function StageTab({ label, count, active, color, onClick }: {
  label: string; count: number; active: boolean; color?: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 border ${
        active ? 'text-white font-semibold' : 'text-zinc-500 hover:text-zinc-200 border-transparent hover:bg-zinc-800/60'
      }`}
      style={active ? { background: `${color ?? '#8b5cf6'}22`, borderColor: `${color ?? '#8b5cf6'}66` } : undefined}
    >
      {color && <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
      {label}
      <span className="text-[10px] text-zinc-500 tabular-nums">{count}</span>
    </button>
  )
}

function Chip({ label, color, dim }: { label: string; color: string; dim?: boolean }) {
  return (
    <span
      className="text-[10px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap"
      style={{
        background: `${color}${dim ? '14' : '22'}`,
        border: `1px solid ${color}${dim ? '33' : '55'}`,
        color: dim ? `${color}bb` : color,
      }}
    >
      {label}
    </span>
  )
}

function OfferRow({ offer, stage, categories, geos, onOpen, onRename }: {
  offer: Offer
  stage?: OfferStage
  categories: OfferCategory[]
  geos: OfferGeo[]
  onOpen: () => void
  onRename: (name: string) => void
}) {
  return (
    <div className={`group flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.03] transition-colors ${stage?.discard ? 'opacity-55' : ''}`}>
      <button onClick={onOpen} className="shrink-0" title="Cambiar etapa">
        <Chip label={stage?.name ?? '—'} color={stage?.color ?? '#64748b'} />
      </button>
      <input
        value={offer.name}
        onChange={(e) => onRename(e.target.value)}
        placeholder="Nombre de la oferta"
        className="flex-1 min-w-0 bg-transparent text-sm text-zinc-200 placeholder-zinc-700 outline-none focus:bg-white/[0.04] rounded px-1.5 py-0.5 transition-colors"
      />
      <div className="flex items-center gap-1 shrink-0">
        {geos.map((g) => <Chip key={g.id} label={g.code} color={g.color} dim />)}
        {categories.map((c) => <Chip key={c.id} label={c.name} color={c.color} />)}
        {offer.score !== undefined && (
          <span className="text-[10px] font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-md px-1.5 py-0.5 tabular-nums">
            {offer.score}
          </span>
        )}
        <button
          onClick={onOpen}
          className="text-zinc-700 group-hover:text-zinc-400 hover:!text-violet-300 p-0.5 rounded transition-colors"
          title="Abrir"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function GeoView({ geos, offers, stageById, catById, activeGeoId, onPickGeo, onOpenOffer }: {
  geos: OfferGeo[]
  offers: Offer[]
  stageById: Map<string, OfferStage>
  catById: Map<string, OfferCategory>
  activeGeoId: string | null
  onPickGeo: (id: string | null) => void
  onOpenOffer: (id: string) => void
}) {
  const active = geos.find((g) => g.id === activeGeoId) ?? null
  const running = active ? offers.filter((o) => o.geoIds.includes(active.id)) : []

  return (
    <div className="p-3">
      {/* Grilla de GEOs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
        {geos.map((g) => {
          const n = offers.filter((o) => o.geoIds.includes(g.id)).length
          const on = active?.id === g.id
          return (
            <button
              key={g.id}
              onClick={() => onPickGeo(on ? null : g.id)}
              className="rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5"
              style={{
                background: on ? `${g.color}1a` : 'rgba(255,255,255,0.02)',
                borderColor: on ? `${g.color}80` : 'rgba(255,255,255,0.07)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-sm font-bold" style={{ color: g.color }}>{g.code}</span>
                <Globe className="w-3 h-3 text-zinc-600 ml-auto" />
              </div>
              <p className="text-[11px] text-zinc-400 truncate">{g.name}</p>
              <p className="text-[10px] text-zinc-600 tabular-nums mt-0.5">
                {n} {n === 1 ? 'oferta' : 'ofertas'}
              </p>
            </button>
          )
        })}
        {geos.length === 0 && (
          <p className="col-span-full text-xs text-zinc-600 text-center py-8">
            Sin GEOs. Agregalos desde el ícono de ajustes.
          </p>
        )}
      </div>

      {/* Ofertas del GEO elegido */}
      {active && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-800/70 flex items-center gap-2">
            <span className="text-xs font-bold" style={{ color: active.color }}>{active.code}</span>
            <span className="text-xs text-zinc-400">{active.name}</span>
            <span className="text-[10px] text-zinc-600 ml-auto tabular-nums">{running.length} corriendo</span>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {running.map((o) => {
              const stage = stageById.get(o.stageId)
              return (
                <button
                  key={o.id}
                  onClick={() => onOpenOffer(o.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.03] transition-colors text-left"
                >
                  <Chip label={stage?.name ?? '—'} color={stage?.color ?? '#64748b'} />
                  <span className="flex-1 text-sm text-zinc-200 truncate">{o.name || 'Sin nombre'}</span>
                  {o.categoryIds.map((id) => {
                    const c = catById.get(id)
                    return c ? <Chip key={id} label={c.name} color={c.color} /> : null
                  })}
                </button>
              )
            })}
            {running.length === 0 && (
              <p className="text-xs text-zinc-600 text-center py-8">Nada corriendo en {active.code}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function OfferModal({ offer, stages, categories, geos, onClose, onPatch, onToggleCat, onToggleGeo, onDelete }: {
  offer: Offer
  stages: OfferStage[]
  categories: OfferCategory[]
  geos: OfferGeo[]
  onClose: () => void
  onPatch: (p: Partial<Offer>) => void
  onToggleCat: (id: string) => void
  onToggleGeo: (id: string) => void
  onDelete: () => void
}) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <Rocket className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-bold text-zinc-100 flex-1">Oferta</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 p-1"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-4">
          <input
            autoFocus
            value={offer.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            placeholder="Nombre de la oferta"
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500/50 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors"
          />

          <Field label="Etapa">
            <div className="flex flex-wrap gap-1.5">
              {stages.map((s) => (
                <button key={s.id} onClick={() => onPatch({ stageId: s.id })}
                  className={offer.stageId === s.id ? 'ring-2 ring-offset-2 ring-offset-zinc-950 rounded-md' : ''}
                  style={offer.stageId === s.id ? { boxShadow: `0 0 0 2px ${s.color}` } : undefined}>
                  <Chip label={s.name} color={s.color} dim={offer.stageId !== s.id} />
                </button>
              ))}
            </div>
          </Field>

          <Field label="Categorías">
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button key={c.id} onClick={() => onToggleCat(c.id)}>
                  <Chip label={c.name} color={c.color} dim={!offer.categoryIds.includes(c.id)} />
                </button>
              ))}
              {categories.length === 0 && <p className="text-xs text-zinc-600">Sin categorías todavía.</p>}
            </div>
          </Field>

          <Field label="GEOs donde está corriendo">
            <div className="flex flex-wrap gap-1.5">
              {geos.map((g) => (
                <button key={g.id} onClick={() => onToggleGeo(g.id)}>
                  <Chip label={`${g.code} · ${g.name}`} color={g.color} dim={!offer.geoIds.includes(g.id)} />
                </button>
              ))}
              {geos.length === 0 && <p className="text-xs text-zinc-600">Sin GEOs todavía.</p>}
            </div>
          </Field>

          <Field label="Número (opcional)">
            <input
              type="number"
              value={offer.score ?? ''}
              onChange={(e) => onPatch({ score: e.target.value === '' ? undefined : Number(e.target.value) })}
              placeholder="—"
              className="w-24 bg-zinc-900 border border-zinc-800 focus:border-violet-500/50 rounded-lg px-2 py-1.5 text-sm text-zinc-100 outline-none transition-colors"
            />
          </Field>
        </div>

        <div className="px-4 py-3 border-t border-zinc-800 flex justify-between">
          <button
            onClick={() => { if (confirm(`¿Borrar "${offer.name || 'esta oferta'}"?`)) onDelete() }}
            className="text-xs text-zinc-600 hover:text-red-400 px-2 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" /> Borrar
          </button>
          <button onClick={onClose} className="text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-lg transition-colors">
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1.5">{label}</p>
      {children}
    </div>
  )
}

/** Panel de tablas editables: etapas, categorías y GEOs. */
function ConfigPanel({ onClose }: { onClose: () => void }) {
  const {
    stages, categories, geos,
    addStage, updateStage, removeStage,
    addCategory, updateCategory, removeCategory,
    addGeo, updateGeo, removeGeo,
  } = useOffersStore()
  const [tab, setTab] = useState<'stages' | 'cats' | 'geos'>('stages')
  const [draft, setDraft] = useState('')
  const [draftCode, setDraftCode] = useState('')

  const add = () => {
    if (tab === 'stages' && draft.trim()) addStage(draft)
    if (tab === 'cats' && draft.trim()) addCategory(draft)
    if (tab === 'geos' && draftCode.trim()) addGeo(draftCode, draft || draftCode)
    setDraft(''); setDraftCode('')
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-bold text-zinc-100 flex-1">Etapas, categorías y GEOs</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 p-1"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-3 py-2 border-b border-zinc-800/70 flex gap-1">
          {([['stages', 'Etapas', GitBranch], ['cats', 'Categorías', Tag], ['geos', 'GEOs', Globe]] as const).map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`text-[11px] px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                tab === k ? 'bg-violet-500/15 text-violet-200 font-semibold' : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="p-3 overflow-y-auto space-y-1.5 flex-1">
          {tab === 'stages' && stages.slice().sort((a, b) => a.order - b.order).map((s) => (
            <Row key={s.id} color={s.color} onColor={(c) => updateStage(s.id, { color: c })} onDelete={() => removeStage(s.id)}>
              <input value={s.name} onChange={(e) => updateStage(s.id, { name: e.target.value })}
                className="flex-1 bg-transparent text-sm text-zinc-200 outline-none min-w-0" />
              <label className="text-[10px] text-zinc-500 flex items-center gap-1 shrink-0 cursor-pointer">
                <input type="checkbox" checked={!!s.discard} onChange={(e) => updateStage(s.id, { discard: e.target.checked })}
                  className="accent-red-500" />
                descarte
              </label>
            </Row>
          ))}
          {tab === 'cats' && categories.map((c) => (
            <Row key={c.id} color={c.color} onColor={(x) => updateCategory(c.id, { color: x })} onDelete={() => removeCategory(c.id)}>
              <input value={c.name} onChange={(e) => updateCategory(c.id, { name: e.target.value })}
                className="flex-1 bg-transparent text-sm text-zinc-200 outline-none min-w-0" />
            </Row>
          ))}
          {tab === 'geos' && geos.map((g) => (
            <Row key={g.id} color={g.color} onColor={(x) => updateGeo(g.id, { color: x })} onDelete={() => removeGeo(g.id)}>
              <input value={g.code} onChange={(e) => updateGeo(g.id, { code: e.target.value.toUpperCase() })}
                className="w-12 bg-transparent text-sm font-bold text-zinc-200 outline-none shrink-0" />
              <input value={g.name} onChange={(e) => updateGeo(g.id, { name: e.target.value })}
                className="flex-1 bg-transparent text-sm text-zinc-400 outline-none min-w-0" />
            </Row>
          ))}
        </div>

        <div className="px-3 py-3 border-t border-zinc-800 flex gap-1.5">
          {tab === 'geos' && (
            <input value={draftCode} onChange={(e) => setDraftCode(e.target.value.toUpperCase())} placeholder="ES"
              className="w-16 bg-zinc-900 border border-zinc-800 focus:border-violet-500/50 rounded-lg px-2 py-1.5 text-xs text-zinc-100 outline-none" />
          )}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            placeholder={tab === 'stages' ? 'Nueva etapa' : tab === 'cats' ? 'Nueva categoría' : 'Nombre del GEO'}
            className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-violet-500/50 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 outline-none"
          />
          <button onClick={add} className="text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> Agregar
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ color, onColor, onDelete, children }: {
  color: string; onColor: (c: string) => void; onDelete: () => void; children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="group flex items-center gap-2 bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 py-2">
      <div className="relative shrink-0">
        <button onClick={() => setOpen((v) => !v)} className="w-4 h-4 rounded-md border border-white/20" style={{ background: color }} title="Color" />
        {open && (
          <div className="absolute left-0 top-6 z-10 bg-zinc-900 border border-zinc-700 rounded-lg p-1.5 grid grid-cols-5 gap-1 shadow-2xl">
            {OFFER_PALETTE.map((c) => (
              <button key={c} onClick={() => { onColor(c); setOpen(false) }}
                className="w-4 h-4 rounded-md border border-white/20 hover:scale-110 transition-transform" style={{ background: c }} />
            ))}
          </div>
        )}
      </div>
      {children}
      <button onClick={onDelete} className="shrink-0 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

/** Detalle de una oferta: propiedades arriba y su documento propio abajo,
 *  a todo el ancho. Es la vista donde se guardan el espionaje, las keywords,
 *  el resumen de problemática, etc. */
function OfferDetail({ offer, systemName, stages, categories, geos, onBack, onPatch, onToggleCat, onToggleGeo, onDoc, onDelete }: {
  offer: Offer
  systemName: string
  stages: OfferStage[]
  categories: OfferCategory[]
  geos: OfferGeo[]
  onBack: () => void
  onPatch: (p: Partial<Offer>) => void
  onToggleCat: (id: string) => void
  onToggleGeo: (id: string) => void
  onDoc: (doc: Block[]) => void
  onDelete: () => void
}) {
  const stage = stages.find((s) => s.id === offer.stageId)
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="pb-10">
      <div className="max-w-4xl mx-auto px-6 pt-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs mb-4">
          <button onClick={onBack} className="text-zinc-500 hover:text-zinc-200 transition-colors flex items-center gap-1">
            <Rocket className="w-3.5 h-3.5" /> {systemName}
          </button>
          <ChevronRight className="w-3 h-3 text-zinc-700" />
          <span className="text-zinc-300 font-semibold truncate">{offer.name || 'Sin nombre'}</span>
          <button
            onClick={onDelete}
            title="Borrar oferta"
            className="ml-auto text-zinc-700 hover:text-red-400 p-1 rounded transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Título grande, editable */}
        <input
          value={offer.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder="Sin nombre"
          className="w-full bg-transparent text-3xl font-bold text-zinc-100 placeholder-zinc-700 outline-none mb-5"
        />

        {/* Propiedades — una fila por atributo, como en Notion */}
        <div className="space-y-1 mb-6">
          <PropRow icon={<GitBranch className="w-3.5 h-3.5" />} label="Estado">
            <div className="flex flex-wrap gap-1.5">
              {stages.map((s) => (
                <button key={s.id} onClick={() => onPatch({ stageId: s.id })}>
                  <Chip label={s.name} color={s.color} dim={offer.stageId !== s.id} />
                </button>
              ))}
            </div>
          </PropRow>

          <PropRow icon={<Tag className="w-3.5 h-3.5" />} label="Etiquetas">
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button key={c.id} onClick={() => onToggleCat(c.id)}>
                  <Chip label={c.name} color={c.color} dim={!offer.categoryIds.includes(c.id)} />
                </button>
              ))}
              {categories.length === 0 && <span className="text-xs text-zinc-600">Vacío</span>}
            </div>
          </PropRow>

          <PropRow icon={<Globe className="w-3.5 h-3.5" />} label="GEOs">
            <div className="flex flex-wrap gap-1.5">
              {geos.map((g) => (
                <button key={g.id} onClick={() => onToggleGeo(g.id)}>
                  <Chip label={`${g.code} · ${g.name}`} color={g.color} dim={!offer.geoIds.includes(g.id)} />
                </button>
              ))}
              {geos.length === 0 && <span className="text-xs text-zinc-600">Vacío</span>}
            </div>
          </PropRow>

          <PropRow icon={<Search className="w-3.5 h-3.5" />} label="Escala">
            <input
              type="number"
              value={offer.score ?? ''}
              onChange={(e) => onPatch({ score: e.target.value === '' ? undefined : Number(e.target.value) })}
              placeholder="Vacío"
              className="w-24 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:bg-white/[0.04] rounded px-1.5 py-0.5 transition-colors"
            />
          </PropRow>
        </div>

        {stage?.discard && (
          <p className="text-[11px] text-red-300/80 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
            Esta oferta está marcada como descartada.
          </p>
        )}
      </div>

      {/* Documento de la oferta — a todo el ancho, sin bordes laterales */}
      <div className="border-t border-zinc-800/60 bg-zinc-950/40">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <OfferDoc doc={offer.doc ?? emptyDoc()} onChange={onDoc} />
          <p className="text-[10px] text-zinc-700 mt-3">
            Seleccioná un texto para convertirlo en viñeta, desplegable o página.
          </p>
        </div>
      </div>
    </motion.div>
  )
}

function PropRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5 rounded-lg hover:bg-white/[0.02] px-1.5 transition-colors">
      <span className="flex items-center gap-2 text-xs text-zinc-500 w-28 shrink-0 pt-1">
        {icon}{label}
      </span>
      <div className="flex-1 min-w-0 pt-0.5">{children}</div>
    </div>
  )
}
