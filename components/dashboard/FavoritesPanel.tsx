'use client'
import { useState } from 'react'
import { Plus, X, Star, ExternalLink, Pencil, Check, Trash2 } from 'lucide-react'
import { useFavoritesStore, type Favorite } from '@/lib/store/favoritesStore'

/** Panel de favoritos del dashboard — links externos que el usuario quiere
 *  tener a un click (tipo barra de marcadores del browser, pero como widget
 *  del dashboard). Cada favorito muestra emoji + label y abre la URL en
 *  pestaña nueva al clickear.
 *
 *  Estado: lista de favoritos persistida en `useFavoritesStore`. Ediciones
 *  inline (click en el lápiz). Reorder por drag-and-drop nativo HTML5. */
export function FavoritesPanel() {
  const favorites = useFavoritesStore((s) => s.favorites)
  const addFavorite = useFavoritesStore((s) => s.addFavorite)
  const updateFavorite = useFavoritesStore((s) => s.updateFavorite)
  const removeFavorite = useFavoritesStore((s) => s.removeFavorite)
  const reorderFavorites = useFavoritesStore((s) => s.reorderFavorites)

  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Drag-and-drop state
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const handleDragStart = (id: string) => (e: React.DragEvent) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', id) } catch { /* noop */ }
  }
  const handleDragOver = (id: string) => (e: React.DragEvent) => {
    e.preventDefault()
    if (dragId && dragId !== id) setOverId(id)
  }
  const handleDrop = (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault()
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return }
    const ids = favorites.map((f) => f.id)
    const fromIdx = ids.indexOf(dragId)
    const toIdx = ids.indexOf(targetId)
    if (fromIdx < 0 || toIdx < 0) return
    const reordered = [...ids]
    reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, dragId)
    reorderFavorites(reordered)
    setDragId(null)
    setOverId(null)
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-white">Favoritos</h2>
          <span className="text-[10px] font-mono text-zinc-600">
            {favorites.length} {favorites.length === 1 ? 'link' : 'links'}
          </span>
        </div>
        <button
          onClick={() => setAdding(true)}
          title="Agregar favorito"
          className="text-xs text-amber-300/80 hover:text-amber-200 hover:bg-amber-500/10 transition-colors px-2 py-1 rounded-lg flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar
        </button>
      </div>

      {adding && (
        <FavoriteForm
          onCancel={() => setAdding(false)}
          onSubmit={({ label, url, emoji }) => {
            if (label.trim() && url.trim()) {
              addFavorite({ label, url, emoji })
            }
            setAdding(false)
          }}
        />
      )}

      {favorites.length === 0 && !adding ? (
        <div className="text-center py-6 text-xs text-zinc-600 italic">
          Sin favoritos todavía. Click en <strong>Agregar</strong> para crear tu primer link.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-3">
          {favorites.map((fav) => (
            <FavoriteTile
              key={fav.id}
              fav={fav}
              isEditing={editingId === fav.id}
              isDragging={dragId === fav.id}
              isDropTarget={overId === fav.id && dragId !== fav.id}
              onStartEdit={() => setEditingId(fav.id)}
              onCancelEdit={() => setEditingId(null)}
              onSave={(patch) => { updateFavorite(fav.id, patch); setEditingId(null) }}
              onRemove={() => { removeFavorite(fav.id); setEditingId(null) }}
              onDragStart={handleDragStart(fav.id)}
              onDragOver={handleDragOver(fav.id)}
              onDrop={handleDrop(fav.id)}
              onDragEnd={() => { setDragId(null); setOverId(null) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FavoriteTile({
  fav, isEditing, isDragging, isDropTarget,
  onStartEdit, onCancelEdit, onSave, onRemove,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  fav: Favorite
  isEditing: boolean
  isDragging: boolean
  isDropTarget: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (patch: { label: string; url: string; emoji?: string }) => void
  onRemove: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
}) {
  if (isEditing) {
    return (
      <div className="col-span-2 md:col-span-3 lg:col-span-4">
        <FavoriteForm
          initial={fav}
          onCancel={onCancelEdit}
          onSubmit={onSave}
          onDelete={onRemove}
        />
      </div>
    )
  }
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group relative bg-black/30 border rounded-xl transition-all ${
        isDragging
          ? 'border-amber-500/40 opacity-50'
          : isDropTarget
            ? 'border-amber-500/60 bg-amber-500/5'
            : 'border-white/[0.08] hover:border-amber-500/30'
      }`}
    >
      <a
        href={fav.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block p-3 cursor-pointer"
        title={fav.url}
      >
        <div className="flex items-center gap-2">
          <span className="text-base shrink-0">{fav.emoji || '🔗'}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-zinc-200 truncate">{fav.label}</p>
            <p className="text-[10px] text-zinc-600 truncate flex items-center gap-0.5">
              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{fav.url.replace(/^https?:\/\//, '')}</span>
            </p>
          </div>
        </div>
      </a>
      <button
        onClick={(e) => { e.stopPropagation(); onStartEdit() }}
        title="Editar"
        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-amber-300 hover:bg-amber-500/10 transition-all rounded p-1"
      >
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  )
}

function FavoriteForm({
  initial, onCancel, onSubmit, onDelete,
}: {
  initial?: Favorite
  onCancel: () => void
  onSubmit: (args: { label: string; url: string; emoji?: string }) => void
  onDelete?: () => void
}) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? '')

  const canSave = label.trim().length > 0 && url.trim().length > 0

  return (
    <div className="bg-black/40 border border-amber-500/30 rounded-xl p-3 space-y-2">
      <div className="grid grid-cols-[60px_1fr] gap-2">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="🔗"
          maxLength={4}
          className="text-center bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1.5 text-base focus:outline-none focus:border-amber-500/40"
        />
        <input
          autoFocus={!initial}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Nombre del link (ej: Notion · Reviews)"
          className="bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-amber-500/40"
        />
      </div>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://..."
        className="w-full bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-amber-500/40"
      />
      <div className="flex items-center justify-between gap-2 pt-1">
        {onDelete ? (
          <button
            onClick={onDelete}
            title="Eliminar favorito"
            className="text-[10px] text-zinc-500 hover:text-red-300 hover:bg-red-500/10 transition-colors px-2 py-1 rounded flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" /> Eliminar
          </button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Cancelar
          </button>
          <button
            onClick={() => canSave && onSubmit({ label, url, emoji })}
            disabled={!canSave}
            className="text-[10px] font-semibold text-amber-200 hover:bg-amber-500/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-2 py-1 rounded flex items-center gap-1 border border-amber-500/30"
          >
            <Check className="w-3 h-3" /> {initial ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}
