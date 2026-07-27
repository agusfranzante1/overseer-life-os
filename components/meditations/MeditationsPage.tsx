'use client'
import { useState, useMemo, useSyncExternalStore } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wind, Plus, Trash2, Star, X, Music, ExternalLink,
} from 'lucide-react'
import {
  useMeditationsStore, sortMeditations, MEDITATION_CATEGORIES,
  type Meditation,
} from '@/lib/store/meditationsStore'

/** `false` en SSR / primer paint, `true` tras hidratar — mismo guard que
 *  JournalPage. El store persiste desde localStorage sincrónicamente en el
 *  cliente; sin este guard el primer render del cliente diverge del server. */
const noopSubscribe = () => () => {}
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

/** Filtro especial "solo favoritas" (además de las categorías reales). */
const FAV_FILTER = '__fav__'

export function MeditationsPage() {
  const meditations = useMeditationsStore((s) => s.meditations)
  const addMeditation = useMeditationsStore((s) => s.addMeditation)
  const removeMeditation = useMeditationsStore((s) => s.removeMeditation)

  const [openId, setOpenId] = useState<string | null>(null)
  const [filter, setFilter] = useState<string | null>(null) // null = todas
  const mounted = useHydrated()

  const sorted = useMemo(() => sortMeditations(meditations), [meditations])

  // Categorías realmente en uso (para los chips de filtro), en orden de preset
  // primero y luego las custom que el usuario haya escrito.
  const usedCategories = useMemo(() => {
    const present = new Set(meditations.map((m) => m.category).filter(Boolean))
    const ordered = MEDITATION_CATEGORIES.filter((c) => present.has(c))
    const extras = [...present].filter((c) => !MEDITATION_CATEGORIES.includes(c as typeof MEDITATION_CATEGORIES[number]))
    return [...ordered, ...extras]
  }, [meditations])

  const favCount = useMemo(() => meditations.filter((m) => m.favorite).length, [meditations])

  const visible = useMemo(() => {
    if (!filter) return sorted
    if (filter === FAV_FILTER) return sorted.filter((m) => m.favorite)
    return sorted.filter((m) => m.category === filter)
  }, [sorted, filter])

  const handleNew = () => {
    const id = addMeditation({ category: filter && filter !== FAV_FILTER ? filter : undefined })
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
              <Wind className="w-6 h-6 md:w-7 md:h-7" style={{ color: 'var(--app-accent)' }} />
            </span>
            <span className="text-hero pb-1">Meditaciones</span>
          </h1>
          <p className="text-[13px] text-zinc-500">Tu biblioteca de meditaciones y respiraciones. Cargá las que quieras, marcá tus favoritas y se sincronizan entre tus dispositivos.</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.97 }}
          onClick={handleNew}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
          style={{
            background: 'linear-gradient(135deg, var(--app-accent), color-mix(in srgb, var(--app-accent) 60%, #8b5cf6))',
            boxShadow: '0 0 24px -8px color-mix(in srgb, var(--app-accent) 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}
        >
          <Plus className="w-4 h-4" /> Nueva meditación
        </motion.button>
      </div>

      {/* Filtros por categoría / favoritas */}
      {meditations.length > 0 && (usedCategories.length > 1 || favCount > 0) && (
        <div className="flex items-center gap-2 flex-wrap">
          <FilterChip label="Todas" active={filter === null} onClick={() => setFilter(null)} />
          {favCount > 0 && (
            <FilterChip
              label={`★ Favoritas (${favCount})`}
              active={filter === FAV_FILTER}
              onClick={() => setFilter((f) => (f === FAV_FILTER ? null : FAV_FILTER))}
            />
          )}
          {usedCategories.map((c) => (
            <FilterChip key={c} label={c} active={filter === c} onClick={() => setFilter((f) => (f === c ? null : c))} />
          ))}
        </div>
      )}

      {/* Lista */}
      {visible.length === 0 ? (
        <div className="text-center py-20 px-8 rounded-2xl border border-dashed border-zinc-700 bg-white/[0.02]">
          <Wind className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-zinc-300 mb-1">
            {meditations.length === 0 ? 'Todavía no cargaste ninguna meditación' : 'No hay meditaciones en este filtro'}
          </p>
          <p className="text-xs text-zinc-500 leading-relaxed max-w-sm mx-auto">
            {meditations.length === 0
              ? 'Creá tu primera: ponele un título, elegí una categoría (respiración, sueño…), escribí el guión y, si querés, pegá un enlace de audio.'
              : 'Probá con otro filtro o creá una nueva.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((med) => (
            <MeditationCard
              key={med.id}
              med={med}
              open={openId === med.id}
              onToggle={() => setOpenId((id) => (id === med.id ? null : med.id))}
              onDelete={() => {
                if (confirm('¿Borrar esta meditación? No se puede deshacer.')) {
                  removeMeditation(med.id)
                  if (openId === med.id) setOpenId(null)
                }
              }}
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ─── Chip de filtro ───────────────────────────────────────────────────────

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        active
          ? 'text-white border-transparent'
          : 'bg-white/[0.03] border-white/[0.10] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
      }`}
      style={active ? {
        background: 'color-mix(in srgb, var(--app-accent) 22%, transparent)',
        borderColor: 'color-mix(in srgb, var(--app-accent) 45%, transparent)',
        color: 'var(--app-accent)',
      } : undefined}
    >
      {label}
    </button>
  )
}

// ─── Card (colapsada = preview · abierta = editor) ─────────────────────────

function MeditationCard({ med, open, onToggle, onDelete }: {
  med: Meditation
  open: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const updateMeditation = useMeditationsStore((s) => s.updateMeditation)
  const toggleFavorite = useMeditationsStore((s) => s.toggleFavorite)

  const preview = med.script.trim().split('\n')[0]?.slice(0, 140) ?? ''

  return (
    <motion.div
      layout
      className="rounded-2xl overflow-hidden transition-colors"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      {/* Cabecera clickeable */}
      <div className="flex items-center gap-3 px-5 py-4 cursor-pointer group" onClick={onToggle}>
        {/* Estrella de favorito */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleFavorite(med.id) }}
          title={med.favorite ? 'Quitar de favoritas' : 'Marcar como favorita'}
          className={`shrink-0 p-1.5 rounded-lg transition-colors ${
            med.favorite ? 'text-amber-400 hover:text-amber-300' : 'text-zinc-600 hover:text-amber-400'
          }`}
        >
          <Star className="w-5 h-5" fill={med.favorite ? 'currentColor' : 'none'} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-semibold text-white truncate">
              {med.title.trim() || <span className="text-zinc-500 italic font-normal">Sin título</span>}
            </p>
            {med.audioUrl && <Music className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {med.category && (
              <span
                className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  background: 'color-mix(in srgb, var(--app-accent) 12%, transparent)',
                  color: 'var(--app-accent)',
                }}
              >
                {med.category}
              </span>
            )}
            {!open && preview && <p className="text-[13px] text-zinc-400 truncate">{preview}</p>}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="Borrar meditación"
          className="shrink-0 p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Editor expandido */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 space-y-3 border-t border-white/[0.06]">
              {/* Título */}
              <input
                value={med.title}
                onChange={(e) => updateMeditation(med.id, { title: e.target.value })}
                placeholder="Título de la meditación…"
                className="w-full bg-transparent text-lg font-semibold text-white placeholder-zinc-600 focus:outline-none pt-3"
              />

              {/* Categoría — select con presets + opción de escribir la propia */}
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs text-zinc-500 shrink-0">Categoría</label>
                <select
                  value={MEDITATION_CATEGORIES.includes(med.category as typeof MEDITATION_CATEGORIES[number]) ? med.category : '__custom__'}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') { updateMeditation(med.id, { category: '' }); return }
                    updateMeditation(med.id, { category: e.target.value })
                  }}
                  className="bg-zinc-900 border border-white/[0.12] rounded-lg px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-[var(--app-accent)]"
                >
                  {MEDITATION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value="__custom__">Otra (escribir)…</option>
                </select>
                {!MEDITATION_CATEGORIES.includes(med.category as typeof MEDITATION_CATEGORIES[number]) && (
                  <input
                    value={med.category}
                    onChange={(e) => updateMeditation(med.id, { category: e.target.value })}
                    placeholder="Categoría propia…"
                    className="bg-zinc-900 border border-white/[0.12] rounded-lg px-2 py-1 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[var(--app-accent)]"
                  />
                )}
              </div>

              {/* Guión / texto */}
              <textarea
                value={med.script}
                onChange={(e) => updateMeditation(med.id, { script: e.target.value })}
                placeholder="Escribí el guión de la meditación, la técnica de respiración, los pasos…"
                rows={8}
                className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-4 py-3 text-[15px] text-zinc-200 leading-relaxed placeholder-zinc-600 focus:outline-none focus:border-[color:color-mix(in_srgb,var(--app-accent)_45%,transparent)] resize-y"
              />

              {/* Enlace / audio */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Music className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <input
                    value={med.audioUrl ?? ''}
                    onChange={(e) => updateMeditation(med.id, { audioUrl: e.target.value.trim() || undefined })}
                    placeholder="Enlace de audio (YouTube, Spotify, mp3…) — opcional"
                    className="w-full bg-transparent text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none border-b border-white/[0.08] focus:border-[var(--app-accent)] py-1"
                  />
                </div>
                {med.audioUrl && <AudioEmbed url={med.audioUrl} />}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-zinc-600">
                  {med.script.length} caracteres · se guarda solo
                </span>
                <button
                  onClick={onToggle}
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white px-2.5 py-1 rounded-lg hover:bg-white/[0.05] transition-colors"
                >
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

// ─── Embed de audio ────────────────────────────────────────────────────────
// Reconoce YouTube / Spotify (iframe) y archivos de audio directos (<audio>).
// Para cualquier otra cosa, un enlace simple "Abrir ↗".

function AudioEmbed({ url }: { url: string }) {
  const embed = useMemo(() => resolveEmbed(url), [url])

  if (embed.kind === 'iframe') {
    return (
      <iframe
        src={embed.src}
        className="w-full rounded-xl border border-white/[0.08]"
        style={{ height: embed.height }}
        allow="autoplay; encrypted-media; clipboard-write; picture-in-picture"
        loading="lazy"
        title="Audio de la meditación"
      />
    )
  }
  if (embed.kind === 'audio') {
    return <audio src={embed.src} controls className="w-full" />
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-[var(--app-accent)] transition-colors"
    >
      <ExternalLink className="w-3 h-3" /> Abrir audio
    </a>
  )
}

type Embed =
  | { kind: 'iframe'; src: string; height: number }
  | { kind: 'audio'; src: string }
  | { kind: 'link' }

function resolveEmbed(raw: string): Embed {
  const url = raw.trim()
  if (!url) return { kind: 'link' }

  // YouTube — youtu.be/ID o youtube.com/watch?v=ID
  const yt = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(url)
  if (yt) return { kind: 'iframe', src: `https://www.youtube.com/embed/${yt[1]}`, height: 200 }

  // Spotify — track/episode/playlist/show
  const sp = /open\.spotify\.com\/(track|episode|playlist|show|album)\/([A-Za-z0-9]+)/.exec(url)
  if (sp) return { kind: 'iframe', src: `https://open.spotify.com/embed/${sp[1]}/${sp[2]}`, height: 152 }

  // SoundCloud → usa su player embebible.
  if (/soundcloud\.com\//.test(url)) {
    return { kind: 'iframe', src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23a855f7&auto_play=false`, height: 166 }
  }

  // Archivo de audio directo.
  if (/\.(mp3|ogg|wav|m4a|aac|flac)(\?.*)?$/i.test(url)) return { kind: 'audio', src: url }

  return { kind: 'link' }
}
