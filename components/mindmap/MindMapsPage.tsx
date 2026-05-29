'use client'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Network, Plus, Pencil, Trash2, ChevronLeft } from 'lucide-react'
import { useMindMapStore } from '@/lib/store/mindmapStore'
import { MindMapCanvas } from './MindMapCanvas'

export function MindMapsPage() {
  const maps = useMindMapStore((s) => s.maps)
  const createMap = useMindMapStore((s) => s.createMap)
  const renameMap = useMindMapStore((s) => s.renameMap)
  const deleteMap = useMindMapStore((s) => s.deleteMap)

  // Current view — list of maps OR a specific map's canvas. Persisted to
  // localStorage so a refresh doesn't kick you out of the map you were
  // working on.
  const [activeId, setActiveId] = useState<string | null>(null)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('overseer-mindmap-active')
      if (saved) setActiveId(saved)
    } catch { /* noop */ }
  }, [])
  useEffect(() => {
    try {
      if (activeId) localStorage.setItem('overseer-mindmap-active', activeId)
      else localStorage.removeItem('overseer-mindmap-active')
    } catch { /* noop */ }
  }, [activeId])

  // If activeId references a deleted map, fall back to list view.
  const activeMap = activeId ? maps.find((m) => m.id === activeId) ?? null : null
  useEffect(() => {
    if (activeId && !activeMap) setActiveId(null)
  }, [activeId, activeMap])

  if (activeMap) {
    return (
      <div className="h-[calc(100vh-60px)] flex flex-col">
        {/* Back nav + title */}
        <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center gap-3">
          <button
            onClick={() => setActiveId(null)}
            className="text-xs text-zinc-400 hover:text-zinc-100 active:text-zinc-100 px-2.5 py-1.5 rounded-lg hover:bg-zinc-900 active:bg-zinc-800 transition-colors flex items-center gap-1.5"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Mapas
          </button>
          <RenameableTitle
            title={activeMap.title}
            onRename={(t) => renameMap(activeMap.id, t)}
          />
          <div className="ml-auto text-[10px] font-mono text-zinc-500">
            {activeMap.nodes.length} nodos · {activeMap.edges.length} conexiones
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <MindMapCanvas mapId={activeMap.id} />
        </div>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Network className="w-6 h-6 text-indigo-400" />
            Mapas Mentales
          </h1>
          <p className="text-xs text-zinc-500 mt-1 max-w-xl">
            Un canvas simple para organizar ideas en forma de diagrama. Doble-click en el lienzo
            crea una caja, doble-click en una caja edita su texto, arrastrala para moverla, y desde
            el botón &quot;conectar&quot; armás flechas entre dos cajas.
          </p>
        </div>
        <button
          onClick={() => {
            const id = createMap()
            setActiveId(id)
          }}
          className="px-3 py-2 bg-indigo-500/15 border border-indigo-500/40 hover:bg-indigo-500/25 active:bg-indigo-500/30 text-indigo-300 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Nuevo mapa
        </button>
      </header>

      {maps.length === 0 ? (
        <div className="bg-zinc-950/40 border border-zinc-800 border-dashed rounded-2xl p-10 text-center">
          <Network className="w-10 h-10 text-indigo-400/60 mx-auto mb-3" />
          <p className="text-sm font-semibold text-zinc-200 mb-1">Sin mapas todavía</p>
          <p className="text-xs text-zinc-500 mb-5 max-w-md mx-auto">
            Empezá uno nuevo y diagramá una idea. Útil para planear, ver relaciones entre conceptos,
            o desbloquear pensamiento bloqueado escribiendo a mano alzada.
          </p>
          <button
            onClick={() => { const id = createMap(); setActiveId(id) }}
            className="px-4 py-2 bg-indigo-500/15 border border-indigo-500/40 hover:bg-indigo-500/25 text-indigo-300 rounded-lg text-sm font-semibold transition-all inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Crear mi primer mapa
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {maps
            .slice()
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((m) => (
              <MapCard
                key={m.id}
                title={m.title}
                nodeCount={m.nodes.length}
                edgeCount={m.edges.length}
                updatedAt={m.updatedAt}
                onOpen={() => setActiveId(m.id)}
                onRename={(t) => renameMap(m.id, t)}
                onDelete={() => {
                  if (confirm(`¿Borrar el mapa "${m.title}"? Esta acción no se puede deshacer.`)) {
                    deleteMap(m.id)
                  }
                }}
              />
            ))}
        </div>
      )}
    </motion.div>
  )
}

function RenameableTitle({ title, onRename }: { title: string; onRename: (t: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  useEffect(() => { setDraft(title) }, [title])

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onRename(draft.trim() || title); setEditing(false) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { onRename(draft.trim() || title); setEditing(false) }
          if (e.key === 'Escape') { setDraft(title); setEditing(false) }
        }}
        className="bg-zinc-900 border border-indigo-500/50 rounded px-2 py-1 text-sm font-semibold text-zinc-100 focus:outline-none focus:border-indigo-400"
      />
    )
  }
  return (
    <button
      onClick={() => setEditing(true)}
      title="Click para renombrar"
      className="text-sm font-semibold text-zinc-100 hover:text-indigo-300 transition-colors px-1"
    >
      {title}
    </button>
  )
}

function MapCard({
  title, nodeCount, edgeCount, updatedAt, onOpen, onRename, onDelete,
}: {
  title: string
  nodeCount: number
  edgeCount: number
  updatedAt: string
  onOpen: () => void
  onRename: (t: string) => void
  onDelete: () => void
}) {
  const [hover, setHover] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  useEffect(() => { setDraft(title) }, [title])

  const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000)
  const ago = days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days}d`

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="rounded-2xl border-2 transition-all duration-150 cursor-pointer"
      style={{
        background: hover ? '#6366f120' : '#09090b80',
        borderColor: hover ? '#6366f1AA' : '#27272a',
        boxShadow: hover ? '0 8px 24px -8px #6366f140' : 'none',
        transform: hover ? 'translateY(-2px)' : 'none',
      }}
    >
      <button onClick={onOpen} className="w-full text-left p-4">
        <div className="flex items-center gap-2 mb-1">
          <Network className="w-4 h-4 text-indigo-400" />
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => { onRename(draft.trim() || title); setEditing(false) }}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') { onRename(draft.trim() || title); setEditing(false) }
                if (e.key === 'Escape') { setDraft(title); setEditing(false) }
              }}
              className="flex-1 bg-zinc-900 border-b border-indigo-500/50 text-sm font-bold text-zinc-100 focus:outline-none px-1"
            />
          ) : (
            <p className="text-sm font-bold text-zinc-100 flex-1 truncate">{title}</p>
          )}
        </div>
        <p className="text-[10px] font-mono text-zinc-500">
          {nodeCount} nodos · {edgeCount} conexiones · {ago}
        </p>
      </button>
      <div className="px-4 pb-3 flex gap-2 items-center justify-end">
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(true) }}
          className="text-[10px] text-zinc-500 hover:text-zinc-200 active:text-zinc-100 px-2 py-1 rounded hover:bg-zinc-900 transition-colors flex items-center gap-1"
        >
          <Pencil className="w-3 h-3" /> Renombrar
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="text-[10px] text-zinc-600 hover:text-red-400 px-2 py-1 rounded hover:bg-red-500/10 transition-colors flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" /> Borrar
        </button>
      </div>
    </div>
  )
}
