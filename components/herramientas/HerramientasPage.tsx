'use client'
import { useState, useMemo, useSyncExternalStore } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wrench, Plus, Trash2, Star, X, Search, ExternalLink, Tag } from 'lucide-react'
import {
  useToolsStore, sortTools, filterTools, toolCategories, toolHost, type Tool,
} from '@/lib/store/toolsStore'

/** `false` en SSR / primer paint, `true` tras hidratar — el store persiste
 *  desde localStorage sincrónicamente en el cliente, así que sin este guard el
 *  primer render del cliente diverge del HTML del server. */
const noopSubscribe = () => () => {}
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

export function HerramientasPage() {
  const tools = useToolsStore((s) => s.tools)
  const addTool = useToolsStore((s) => s.addTool)
  const removeTool = useToolsStore((s) => s.removeTool)

  const [openId, setOpenId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | 'todas'>('todas')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const mounted = useHydrated()

  const categories = useMemo(() => toolCategories(tools), [tools])
  const visible = useMemo(
    () => sortTools(filterTools(tools, { query, category, onlyFavorites })),
    [tools, query, category, onlyFavorites],
  )
  const filtrando = query.trim() !== '' || category !== 'todas' || onlyFavorites

  const handleNew = () => {
    // Si estás parado en una categoría, la nueva nace ahí: es lo que esperás.
    const id = addTool(category !== 'todas' ? { category } : undefined)
    setOpenId(id)
  }

  if (!mounted) {
    return <div className="p-6"><div className="h-10 w-52 bg-white/[0.03] rounded-xl animate-pulse" /></div>
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1.5">
          <h1 className="font-heading text-4xl md:text-5xl font-bold tracking-tight leading-none flex items-center gap-3.5">
            <span
              className="shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, color-mix(in srgb, var(--app-accent) 24%, transparent), color-mix(in srgb, var(--app-accent) 8%, transparent))',
                border: '1px solid color-mix(in srgb, var(--app-accent) 38%, transparent)',
                boxShadow: '0 0 28px -8px color-mix(in srgb, var(--app-accent) 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.10)',
              }}
            >
              <Wrench className="w-6 h-6 md:w-7 md:h-7" style={{ color: 'var(--app-accent)' }} />
            </span>
            <span className="text-hero pb-1">Herramientas</span>
          </h1>
          <p className="text-[13px] text-zinc-500">
            Con qué se hace cada cosa: edición, personajes con IA, voces. El link, la categoría y para qué sirve.
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.97 }}
          onClick={handleNew}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
          style={{
            background: 'linear-gradient(135deg, color-mix(in srgb, var(--app-accent) 85%, transparent), color-mix(in srgb, var(--app-accent) 55%, transparent))',
            boxShadow: '0 8px 24px -12px color-mix(in srgb, var(--app-accent) 90%, transparent)',
          }}
        >
          <Plus className="w-4 h-4" /> Nueva herramienta
        </motion.button>
      </div>

      {/* Filtros */}
      {tools.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, categoría o notas…"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[color:color-mix(in_srgb,var(--app-accent)_45%,transparent)]"
              />
            </div>
            <button
              onClick={() => setOnlyFavorites((v) => !v)}
              title="Ver solo las favoritas"
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-semibold border transition-colors ${
                onlyFavorites
                  ? 'bg-amber-400/15 border-amber-400/40 text-amber-300'
                  : 'bg-white/[0.03] border-white/[0.08] text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${onlyFavorites ? 'fill-amber-300' : ''}`} /> Favoritas
            </button>
          </div>

          {/* Categorías como chips: son las que el usuario ya creó */}
          {categories.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <CategoryChip label="Todas" active={category === 'todas'} onClick={() => setCategory('todas')} />
              {categories.map((c) => (
                <CategoryChip key={c} label={c} active={category === c} onClick={() => setCategory(category === c ? 'todas' : c)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lista */}
      {tools.length === 0 ? (
        <div className="text-center py-20 px-8 rounded-2xl border border-dashed border-zinc-700 bg-white/[0.02]">
          <Wrench className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-zinc-300 mb-1">Todavía no guardaste ninguna herramienta</p>
          <p className="text-xs text-zinc-500 leading-relaxed max-w-sm mx-auto">
            Cuando encuentres algo que sirve — un editor, un generador de personajes, una voz —
            guardalo acá con el link y para qué es. Las categorías las armás vos.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-14 px-8 rounded-2xl border border-dashed border-zinc-800 bg-white/[0.02]">
          <p className="text-sm text-zinc-400">Ninguna herramienta coincide con el filtro.</p>
          <button onClick={() => { setQuery(''); setCategory('todas'); setOnlyFavorites(false) }}
            className="mt-2 text-xs text-zinc-500 hover:text-white underline underline-offset-4">
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrando && (
            <p className="text-[11px] font-mono text-zinc-600">
              {visible.length} de {tools.length}
            </p>
          )}
          {visible.map((t) => (
            <ToolCard
              key={t.id}
              tool={t}
              categories={categories}
              open={openId === t.id}
              onToggle={() => setOpenId((id) => (id === t.id ? null : t.id))}
              onDelete={() => {
                if (confirm('¿Borrar esta herramienta? No se puede deshacer.')) {
                  removeTool(t.id)
                  if (openId === t.id) setOpenId(null)
                }
              }}
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors"
      style={{
        background: active ? 'color-mix(in srgb, var(--app-accent) 18%, transparent)' : 'rgba(255,255,255,0.03)',
        borderColor: active ? 'color-mix(in srgb, var(--app-accent) 45%, transparent)' : 'rgba(255,255,255,0.08)',
        color: active ? 'var(--app-accent)' : '#a1a1aa',
      }}
    >
      {label}
    </button>
  )
}

// ─── Card (colapsada = resumen · abierta = editor) ───────────────────────────

function ToolCard({ tool, categories, open, onToggle, onDelete }: {
  tool: Tool
  categories: string[]
  open: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const updateTool = useToolsStore((s) => s.updateTool)
  const toggleFavorite = useToolsStore((s) => s.toggleFavorite)
  const host = toolHost(tool.url)
  const preview = tool.notes.trim().split('\n')[0]?.slice(0, 140) ?? ''

  return (
    <motion.div
      layout
      className="rounded-2xl overflow-hidden transition-colors"
      style={{
        background: 'var(--card-bg)',
        border: `1px solid ${tool.favorite ? 'rgba(251,191,36,0.35)' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      <div className="flex items-center gap-3 px-5 py-4 cursor-pointer group" onClick={onToggle}>
        <div
          className="shrink-0 flex items-center justify-center w-12 h-12 rounded-xl"
          style={{
            background: 'color-mix(in srgb, var(--app-accent) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--app-accent) 28%, transparent)',
          }}
        >
          <Wrench className="w-5 h-5" style={{ color: 'var(--app-accent)' }} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-white truncate flex items-center gap-1.5">
            {tool.favorite && <Star className="w-3.5 h-3.5 shrink-0 text-amber-300 fill-amber-300" />}
            {tool.name.trim() || <span className="text-zinc-500 italic font-normal">Sin nombre</span>}
          </p>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            {tool.category.trim() && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                style={{
                  background: 'color-mix(in srgb, var(--app-accent) 12%, transparent)',
                  color: 'var(--app-accent)',
                  border: '1px solid color-mix(in srgb, var(--app-accent) 35%, transparent)',
                }}>
                {tool.category}
              </span>
            )}
            {host && <span className="text-[11px] text-zinc-500 truncate">{host}</span>}
          </div>
          {!open && preview && <p className="text-[13px] text-zinc-400 truncate mt-0.5">{preview}</p>}
        </div>

        {/* El link es lo que más se usa: siempre visible, no solo al abrir */}
        {tool.url && (
          <a
            href={tool.url} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Abrir"
            className="shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-all"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); toggleFavorite(tool.id) }}
          title={tool.favorite ? 'Quitar de favoritas' : 'Marcar como favorita'}
          className={`shrink-0 p-1.5 rounded-lg transition-all ${
            tool.favorite ? 'text-amber-300' : 'text-zinc-600 hover:text-amber-300 opacity-0 group-hover:opacity-100'
          }`}
        >
          <Star className={`w-4 h-4 ${tool.favorite ? 'fill-amber-300' : ''}`} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="Borrar herramienta"
          className="shrink-0 p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-4 space-y-3 border-t border-white/[0.06]">
              <input
                value={tool.name}
                onChange={(e) => updateTool(tool.id, { name: e.target.value })}
                placeholder="¿Cómo se llama?"
                className="w-full bg-transparent text-lg font-semibold text-white placeholder-zinc-600 focus:outline-none"
              />

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Link</label>
                <input
                  value={tool.url}
                  onChange={(e) => updateTool(tool.id, { url: e.target.value })}
                  placeholder="https://…"
                  inputMode="url"
                  className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[14px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[color:color-mix(in_srgb,var(--app-accent)_45%,transparent)]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                  <Tag className="w-3 h-3" /> Categoría
                </label>
                <input
                  value={tool.category}
                  onChange={(e) => updateTool(tool.id, { category: e.target.value })}
                  placeholder="Edición de video, Personajes IA, Voces…"
                  list={`tool-categories-${tool.id}`}
                  className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[14px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[color:color-mix(in_srgb,var(--app-accent)_45%,transparent)]"
                />
                {/* Las que ya existen, para no escribir "Edicion" y "Edición" como dos */}
                <datalist id={`tool-categories-${tool.id}`}>
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Para qué sirve</label>
                <textarea
                  value={tool.notes}
                  onChange={(e) => updateTool(tool.id, { notes: e.target.value })}
                  placeholder="Qué hace, cómo la usás, qué tiene de bueno…"
                  rows={4}
                  className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-4 py-3 text-[14px] text-zinc-200 leading-relaxed placeholder-zinc-600 focus:outline-none focus:border-[color:color-mix(in_srgb,var(--app-accent)_45%,transparent)] resize-y"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-zinc-600">se guarda solo</span>
                <button onClick={onToggle}
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white px-2.5 py-1 rounded-lg hover:bg-white/[0.05] transition-colors">
                  <X className="w-3 h-3" /> Cerrar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
