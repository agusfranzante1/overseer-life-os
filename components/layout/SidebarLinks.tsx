'use client'
import { useState } from 'react'
import { Link2, Plus, X, Check, Trash2, Pencil, ChevronDown, ChevronRight } from 'lucide-react'
import { useFavoritesStore, type Favorite } from '@/lib/store/favoritesStore'

/** Accesos rápidos (enlaces) en el sidebar — para tener a un click los chats de
 *  ChatGPT, docs y cosas que estás trabajando en el momento. Reusa
 *  `useFavoritesStore` (persistido en localStorage). Solo se muestra con el
 *  sidebar expandido (`showLabels`); colapsado se oculta como las etiquetas. */
export function SidebarLinks({ showLabels }: { showLabels: boolean }) {
  const favorites = useFavoritesStore((s) => s.favorites)
  const addFavorite = useFavoritesStore((s) => s.addFavorite)
  const updateFavorite = useFavoritesStore((s) => s.updateFavorite)
  const removeFavorite = useFavoritesStore((s) => s.removeFavorite)

  const [open, setOpen] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  if (!showLabels) return null

  return (
    <div className="pt-2 mt-1 border-t border-white/[0.05]">
      {/* Header colapsable */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`flex-1 flex items-center gap-3 px-0 py-2 rounded-xl text-[13px] transition-colors ${open ? 'text-white' : 'text-zinc-500 hover:text-white'}`}
        >
          {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
          <Link2 className="w-4 h-4 shrink-0" />
          <span className="text-sm font-medium whitespace-nowrap flex-1 text-left">Enlaces</span>
          {favorites.length > 0 && (
            <span className="text-[10px] font-mono text-zinc-600">{favorites.length}</span>
          )}
        </button>
        <button
          onClick={() => { setOpen(true); setAdding(true); setEditingId(null) }}
          title="Guardar un enlace"
          className="p-1 rounded-lg text-zinc-500 hover:text-amber-300 hover:bg-amber-500/10 transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {open && (
        <div className="pl-1 pb-1 space-y-0.5">
          {adding && (
            <LinkForm
              onCancel={() => setAdding(false)}
              onSubmit={({ label, url, emoji }) => { addFavorite({ label, url, emoji }); setAdding(false) }}
            />
          )}

          {favorites.length === 0 && !adding && (
            <p className="text-[11px] text-zinc-600 italic px-1 py-1.5 leading-relaxed">
              Sin enlaces. Tocá <span className="text-amber-300/80">+</span> para guardar un chat de ChatGPT, un doc, lo que estés trabajando.
            </p>
          )}

          {favorites.map((fav) => (
            editingId === fav.id ? (
              <LinkForm
                key={fav.id}
                initial={fav}
                onCancel={() => setEditingId(null)}
                onSubmit={(patch) => { updateFavorite(fav.id, patch); setEditingId(null) }}
                onDelete={() => { removeFavorite(fav.id); setEditingId(null) }}
              />
            ) : (
              <div key={fav.id} className="group/link flex items-center gap-1.5 rounded-lg hover:bg-white/[0.03] transition-colors">
                <a
                  href={fav.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={fav.url}
                  className="flex-1 min-w-0 flex items-center gap-2 px-1.5 py-1.5"
                >
                  <span className="text-sm shrink-0">{fav.emoji || '🔗'}</span>
                  <span className="text-[12px] text-zinc-300 group-hover/link:text-white truncate">{fav.label}</span>
                </a>
                <button
                  onClick={() => { setEditingId(fav.id); setAdding(false) }}
                  title="Editar"
                  className="p-1 rounded text-zinc-600 hover:text-amber-300 opacity-0 group-hover/link:opacity-100 transition-all shrink-0"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}

/** Mini-form compacto para el sidebar (emoji · nombre · URL). */
function LinkForm({
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

  const submit = () => { if (canSave) onSubmit({ label, url, emoji }) }

  return (
    <div className="bg-black/40 border border-amber-500/30 rounded-xl p-2 space-y-1.5 my-1">
      <div className="grid grid-cols-[38px_1fr] gap-1.5">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="🔗"
          maxLength={4}
          className="text-center bg-white/[0.03] border border-white/[0.08] rounded px-1 py-1 text-sm focus:outline-none focus:border-amber-500/40"
        />
        <input
          autoFocus={!initial}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
          placeholder="Nombre (ej: GPT · Overseer)"
          className="bg-white/[0.03] border border-white/[0.08] rounded px-1.5 py-1 text-[12px] text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-amber-500/40"
        />
      </div>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
        placeholder="https://…"
        className="w-full bg-white/[0.03] border border-white/[0.08] rounded px-1.5 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-amber-500/40"
      />
      <div className="flex items-center justify-between gap-1.5">
        {onDelete ? (
          <button onClick={onDelete} title="Eliminar" className="text-[10px] text-zinc-500 hover:text-red-300 transition-colors px-1.5 py-0.5 rounded flex items-center gap-1">
            <Trash2 className="w-3 h-3" /> Eliminar
          </button>
        ) : <span />}
        <div className="flex items-center gap-1">
          <button onClick={onCancel} className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded flex items-center gap-1">
            <X className="w-3 h-3" /> Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!canSave}
            className="text-[10px] font-semibold text-amber-200 hover:bg-amber-500/15 disabled:opacity-40 disabled:cursor-not-allowed px-1.5 py-0.5 rounded flex items-center gap-1 border border-amber-500/30"
          >
            <Check className="w-3 h-3" /> {initial ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}
