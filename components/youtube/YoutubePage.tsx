'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  SquarePlay, Plus, Trash2, Star, X, Play, ExternalLink, ChevronLeft, ChevronRight, Check,
} from 'lucide-react'
import {
  useYoutubeStore, sortYoutubeItems,
  YOUTUBE_STATUSES, YOUTUBE_STATUS_LABEL, YOUTUBE_CATEGORIES,
  type YoutubeItem, type YoutubeStatus,
} from '@/lib/store/youtubeStore'
import { extractYoutubeId, youtubeEmbedUrl, youtubeThumbnail } from '@/lib/youtube/parse'

export function YoutubePage() {
  const items = useYoutubeStore((s) => s.items)
  const addItem = useYoutubeStore((s) => s.addItem)
  const updateItem = useYoutubeStore((s) => s.updateItem)
  const setStatus = useYoutubeStore((s) => s.setStatus)
  const toggleFavorite = useYoutubeStore((s) => s.toggleFavorite)
  const removeItem = useYoutubeStore((s) => s.removeItem)

  const [adding, setAdding] = useState(false)
  const [playing, setPlaying] = useState<YoutubeItem | null>(null)
  // Item que se está arrastrando entre columnas (drag nativo de HTML5).
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStatus, setOverStatus] = useState<YoutubeStatus | null>(null)

  const doneCount = items.filter((i) => i.status === 'done').length
  const progress = items.length === 0 ? 0 : Math.round((doneCount / items.length) * 100)

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <SquarePlay className="w-6 h-6 text-red-400" />
            YouTube
          </h1>
          <p className="text-xs text-zinc-500 mt-1 max-w-xl">
            Tu cola de videos. Pegá un link, movelo entre columnas a medida que avanzás,
            y mirálo acá mismo sin salir de la app.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="px-3 py-2 bg-red-500/15 border border-red-500/40 hover:bg-red-500/25 active:bg-red-500/30 text-red-300 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Agregar video
        </button>
      </header>

      {/* Avance global — cuántos ya viste del total. */}
      {items.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-zinc-500 tabular-nums shrink-0">
            {doneCount}/{items.length} vistos · {progress}%
          </span>
        </div>
      )}

      {adding && (
        <AddForm
          onCancel={() => setAdding(false)}
          onAdd={(url, title, category) => {
            addItem({ url, videoId: extractYoutubeId(url), title, category })
            setAdding(false)
          }}
        />
      )}

      {items.length === 0 && !adding ? (
        <div className="bg-zinc-950/40 border border-zinc-800 border-dashed rounded-2xl p-10 text-center">
          <SquarePlay className="w-10 h-10 text-red-400/60 mx-auto mb-3" />
          <p className="text-sm font-semibold text-zinc-200 mb-1">Sin videos todavía</p>
          <p className="text-xs text-zinc-500 mb-5 max-w-md mx-auto">
            Pegá el link de un video que quieras ver y va a la columna &quot;Por ver&quot;.
          </p>
          <button
            onClick={() => setAdding(true)}
            className="px-4 py-2 bg-red-500/15 border border-red-500/40 hover:bg-red-500/25 text-red-300 rounded-lg text-sm font-semibold transition-all inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Agregar el primero
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {YOUTUBE_STATUSES.map((status) => {
            const colItems = sortYoutubeItems(items.filter((i) => i.status === status))
            return (
              <div
                key={status}
                onDragOver={(e) => { e.preventDefault(); setOverStatus(status) }}
                onDragLeave={() => setOverStatus((s) => (s === status ? null : s))}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragId) setStatus(dragId, status)
                  setDragId(null)
                  setOverStatus(null)
                }}
                className={`rounded-2xl border p-3 min-h-[200px] transition-colors ${
                  overStatus === status
                    ? 'border-red-500/50 bg-red-500/[0.06]'
                    : 'border-zinc-800 bg-zinc-950/40'
                }`}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
                    {YOUTUBE_STATUS_LABEL[status]}
                  </h2>
                  <span className="text-[10px] text-zinc-500 tabular-nums">{colItems.length}</span>
                </div>
                <div className="space-y-2">
                  {colItems.map((it) => (
                    <ItemCard
                      key={it.id}
                      item={it}
                      onDragStart={() => setDragId(it.id)}
                      onDragEnd={() => { setDragId(null); setOverStatus(null) }}
                      onPlay={() => setPlaying(it)}
                      onMove={(dir) => {
                        const i = YOUTUBE_STATUSES.indexOf(it.status)
                        const next = YOUTUBE_STATUSES[i + dir]
                        if (next) setStatus(it.id, next)
                      }}
                      onToggleFavorite={() => toggleFavorite(it.id)}
                      onRename={(title) => updateItem(it.id, { title })}
                      onDelete={() => {
                        if (confirm(`¿Sacar "${it.title || it.url}" de la lista?`)) removeItem(it.id)
                      }}
                    />
                  ))}
                  {colItems.length === 0 && (
                    <p className="text-[11px] text-zinc-600 text-center py-6">
                      {status === 'backlog' ? 'Nada pendiente' : status === 'watching' ? 'Nada en curso' : 'Nada visto todavía'}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {playing && (
        <PlayerModal
          item={playing}
          onClose={() => setPlaying(null)}
          onMarkDone={() => { setStatus(playing.id, 'done'); setPlaying(null) }}
        />
      )}
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function AddForm({ onAdd, onCancel }: {
  onAdd: (url: string, title: string, category: string) => void
  onCancel: () => void
}) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<string>(YOUTUBE_CATEGORIES[0])

  const videoId = extractYoutubeId(url)
  // Avisamos pero NO bloqueamos: el usuario puede querer guardar un link que
  // no es de YouTube (una playlist, un canal). Simplemente no habrá player.
  const looksWrong = url.trim().length > 0 && !videoId

  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-4 space-y-3">
      <div className="flex gap-3 items-start">
        {videoId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={youtubeThumbnail(videoId)} alt="" className="w-32 rounded-lg border border-zinc-800 shrink-0" />
        )}
        <div className="flex-1 space-y-2 min-w-0">
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Pegá el link de YouTube"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-red-500/60"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título (opcional)"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-red-500/60"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-red-500/60"
          >
            {YOUTUBE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      {looksWrong && (
        <p className="text-[11px] text-amber-400/90">
          No reconocí un video de YouTube en ese link. Lo podés guardar igual, pero no vas a poder verlo acá adentro.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5">
          Cancelar
        </button>
        <button
          onClick={() => { if (url.trim()) onAdd(url, title, category) }}
          disabled={!url.trim()}
          className="text-xs font-semibold bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          Agregar
        </button>
      </div>
    </div>
  )
}

function ItemCard({ item, onPlay, onMove, onToggleFavorite, onRename, onDelete, onDragStart, onDragEnd }: {
  item: YoutubeItem
  onPlay: () => void
  onMove: (dir: 1 | -1) => void
  onToggleFavorite: () => void
  onRename: (title: string) => void
  onDelete: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.title)
  const label = item.title || item.url
  const idx = YOUTUBE_STATUSES.indexOf(item.status)

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group bg-zinc-900/70 border border-zinc-800 hover:border-zinc-700 rounded-xl overflow-hidden transition-colors cursor-grab active:cursor-grabbing"
    >
      {item.videoId && (
        <button onClick={onPlay} className="block w-full relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={youtubeThumbnail(item.videoId)} alt="" className="w-full aspect-video object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
            <Play className="w-8 h-8 text-white drop-shadow" />
          </span>
        </button>
      )}
      <div className="p-2.5 space-y-2">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { onRename(draft.trim()); setEditing(false) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { onRename(draft.trim()); setEditing(false) }
              if (e.key === 'Escape') { setDraft(item.title); setEditing(false) }
            }}
            className="w-full bg-zinc-800 border border-red-500/50 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none"
          />
        ) : (
          <button
            onDoubleClick={() => { setDraft(item.title); setEditing(true) }}
            onClick={item.videoId ? onPlay : undefined}
            title={item.videoId ? 'Click para ver · doble-click para renombrar' : 'Doble-click para renombrar'}
            className="w-full text-left text-xs text-zinc-200 hover:text-white line-clamp-2 leading-snug"
          >
            {label}
          </button>
        )}

        <div className="flex items-center gap-1">
          <span className="text-[10px] text-zinc-500 truncate flex-1">{item.category}</span>
          <button
            onClick={onToggleFavorite}
            title={item.favorite ? 'Sacar de destacados' : 'Destacar'}
            className={item.favorite ? 'text-amber-400' : 'text-zinc-600 hover:text-amber-400'}
          >
            <Star className="w-3 h-3" fill={item.favorite ? 'currentColor' : 'none'} />
          </button>
          <a
            href={item.url} target="_blank" rel="noopener noreferrer"
            title="Abrir en YouTube"
            onClick={(e) => e.stopPropagation()}
            className="text-zinc-600 hover:text-zinc-300"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
          <button onClick={onDelete} title="Sacar de la lista" className="text-zinc-600 hover:text-red-400">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        {/* Mover entre columnas sin arrastrar — imprescindible en mobile,
            donde el drag nativo de HTML5 no funciona. */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onMove(-1)}
            disabled={idx === 0}
            title="Mover a la izquierda"
            className="flex-1 text-[10px] text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-25 disabled:hover:bg-transparent rounded py-1 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={idx === YOUTUBE_STATUSES.length - 1}
            title="Mover a la derecha"
            className="flex-1 text-[10px] text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-25 disabled:hover:bg-transparent rounded py-1 flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

function PlayerModal({ item, onClose, onMarkDone }: {
  item: YoutubeItem
  onClose: () => void
  onMarkDone: () => void
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800">
          <h2 className="text-sm text-zinc-200 truncate flex-1">{item.title || item.url}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        {item.videoId ? (
          <div className="aspect-video bg-black">
            <iframe
              src={youtubeEmbedUrl(item.videoId)}
              title={item.title || 'Video'}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <p className="p-8 text-center text-sm text-zinc-500">
            Este link no es un video de YouTube, así que no se puede reproducir acá.
          </p>
        )}
        <div className="flex justify-end gap-2 px-4 py-3">
          {item.status !== 'done' && (
            <button
              onClick={onMarkDone}
              className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" /> Marcar como visto
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
