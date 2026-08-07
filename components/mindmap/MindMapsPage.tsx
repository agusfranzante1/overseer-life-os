'use client'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Network, Plus, Pencil, Trash2, ChevronLeft, Folder, FolderPlus, Lock, X, Check } from 'lucide-react'
import { useMindMapStore, type MindMap, type MindMapFolder } from '@/lib/store/mindmapStore'
import { MindMapCanvas } from './MindMapCanvas'
import { MindMapThumbnail } from './MindMapThumbnail'

export function MindMapsPage() {
  const maps = useMindMapStore((s) => s.maps)
  const createMap = useMindMapStore((s) => s.createMap)
  const renameMap = useMindMapStore((s) => s.renameMap)
  const deleteMap = useMindMapStore((s) => s.deleteMap)
  const folders = useMindMapStore((s) => s.folders)
  const createFolder = useMindMapStore((s) => s.createFolder)
  const renameFolder = useMindMapStore((s) => s.renameFolder)
  const deleteFolder = useMindMapStore((s) => s.deleteFolder)
  const moveMapToFolder = useMindMapStore((s) => s.moveMapToFolder)

  // Pestaña activa. null = "General" (todos los mapas por más reciente).
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [creatingFolder, setCreatingFolder] = useState(false)

  // Current view — list of maps OR a specific map's canvas.
  // NO persistimos `activeId`: cada vez que el usuario entra a la sección
  // Mapas Mentales (cambio de pestaña, refresh, navegación) aterriza en
  // el menú principal de mapas, NO en el último que haya abierto. Si por
  // alguna razón quedó cacheado de una versión vieja, lo borramos al
  // montar para limpieza.
  const [activeId, setActiveId] = useState<string | null>(null)
  useEffect(() => {
    try { localStorage.removeItem('overseer-mindmap-active') } catch { /* noop */ }
  }, [])

  const sortedFolders = folders.slice().sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  const activeFolder = activeFolderId ? folders.find((f) => f.id === activeFolderId) ?? null : null
  // Si borraron la carpeta abierta (o llegó borrada de otro dispositivo),
  // caemos a General. Se DERIVA en render en vez de corregirlo con un effect:
  // sin effect no hay un frame intermedio mostrando una pestaña fantasma.
  const shownFolderId = activeFolder ? activeFolderId : null

  // General muestra TODOS por más reciente; una carpeta, solo los suyos.
  const visibleMaps = maps
    .filter((m) => shownFolderId === null || m.folderId === shownFolderId)
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

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
          <MindMapCanvas mapId={activeMap.id} onOpenMap={(id) => setActiveId(id)} />
        </div>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto px-4 py-6 space-y-5">
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
            // Si estás parado en una carpeta, el mapa nuevo nace ahí — que es
            // lo que uno espera al crear "dentro" de una carpeta.
            if (shownFolderId) moveMapToFolder(id, shownFolderId)
            setActiveId(id)
          }}
          className="px-3 py-2 bg-indigo-500/15 border border-indigo-500/40 hover:bg-indigo-500/25 active:bg-indigo-500/30 text-indigo-300 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Nuevo mapa
        </button>
      </header>

      {/* Pestañas: General (todos por más reciente) + una por carpeta. */}
      <div className="flex items-center gap-1.5 flex-wrap border-b border-zinc-800 pb-2">
        <FolderTab
          label="General"
          count={maps.length}
          active={shownFolderId === null}
          onClick={() => setActiveFolderId(null)}
        />
        {sortedFolders.map((f) => (
          <FolderTab
            key={f.id}
            label={f.name}
            count={maps.filter((m) => m.folderId === f.id).length}
            active={shownFolderId === f.id}
            locked={f.locked}
            onClick={() => setActiveFolderId(f.id)}
            onRename={f.locked ? undefined : (name) => renameFolder(f.id, name)}
            onDelete={f.locked ? undefined : () => {
              const n = maps.filter((m) => m.folderId === f.id).length
              const msg = n === 0
                ? `¿Borrar la carpeta "${f.name}"?`
                : `¿Borrar la carpeta "${f.name}"? Los ${n} mapas que tiene NO se borran: quedan sueltos y los seguís viendo en General.`
              if (confirm(msg)) deleteFolder(f.id)
            }}
          />
        ))}
        {creatingFolder ? (
          <NewFolderInput
            onCancel={() => setCreatingFolder(false)}
            onCreate={(name) => {
              const id = createFolder(name)
              setCreatingFolder(false)
              setActiveFolderId(id)
            }}
          />
        ) : (
          <button
            onClick={() => setCreatingFolder(true)}
            title="Crear una carpeta nueva"
            className="text-xs text-zinc-500 hover:text-indigo-300 hover:bg-zinc-800/60 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <FolderPlus className="w-3.5 h-3.5" /> Nueva carpeta
          </button>
        )}
      </div>

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
      ) : visibleMaps.length === 0 ? (
        <div className="bg-zinc-950/40 border border-zinc-800 border-dashed rounded-2xl p-8 text-center">
          <Folder className="w-8 h-8 text-indigo-400/50 mx-auto mb-2" />
          <p className="text-sm text-zinc-300 mb-1">
            La carpeta &quot;{activeFolder?.name}&quot; está vacía
          </p>
          <p className="text-xs text-zinc-500">
            Creá un mapa acá adentro, o movele uno desde General con el ícono de carpeta.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {visibleMaps.map((m) => (
            <MapCard
              key={m.id}
              map={m}
              folders={sortedFolders}
              // Los mapas de una carpeta bloqueada no se pueden mover.
              lockedInFolder={!!folders.find((f) => f.id === m.folderId)?.locked}
              onMoveToFolder={(fid) => moveMapToFolder(m.id, fid)}
              onOpen={() => setActiveId(m.id)}
              onRename={(t) => renameMap(m.id, t)}
              onDelete={() => {
                if (confirm(`¿Borrar el mapa "${m.title}"? Esta acción no se puede deshacer.`)) {
                  deleteMap(m.id)
                }
              }}
              // Los mapas de una carpeta bloqueada (los de Content Strategy)
              // no se borran: el store lo rechaza igual, pero no tiene
              // sentido ofrecer un botón que no va a hacer nada.
              canDelete={!folders.find((f) => f.id === m.folderId)?.locked}
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}

/** Pestaña de carpeta. Doble-click renombra (si no está bloqueada). El botón
 *  de borrar solo aparece en la pestaña activa, para no ensuciar la barra. */
function FolderTab({ label, count, active, locked, onClick, onRename, onDelete }: {
  label: string
  count: number
  active: boolean
  locked?: boolean
  onClick: () => void
  onRename?: (name: string) => void
  onDelete?: () => void
}) {
  const [editing, setEditing] = useState(false)
  // El borrador se siembra al ABRIR el editor (ver onDoubleClick), no con un
  // effect que lo resincroniza en cada render.
  const [draft, setDraft] = useState(label)

  if (editing && onRename) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onRename(draft); setEditing(false) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { onRename(draft); setEditing(false) }
          if (e.key === 'Escape') { setDraft(label); setEditing(false) }
        }}
        className="bg-zinc-900 border border-indigo-500/50 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 w-32 focus:outline-none focus:border-indigo-400"
      />
    )
  }

  return (
    <div className={`flex items-center rounded-lg transition-colors ${
      active ? 'bg-indigo-500/15 border border-indigo-500/40' : 'border border-transparent hover:bg-zinc-800/60'
    }`}>
      <button
        onClick={onClick}
        onDoubleClick={() => { if (onRename) { setDraft(label); setEditing(true) } }}
        title={onRename ? 'Doble-click para renombrar' : locked ? 'Carpeta fija — no se puede renombrar ni borrar' : undefined}
        className={`text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 ${
          active ? 'text-indigo-300 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        {locked ? <Lock className="w-3 h-3" /> : <Folder className="w-3.5 h-3.5" />}
        {label}
        <span className="text-[10px] text-zinc-500 tabular-nums">{count}</span>
      </button>
      {active && onDelete && (
        <button
          onClick={onDelete}
          title="Borrar carpeta (los mapas no se borran)"
          className="text-zinc-600 hover:text-red-400 px-1.5 py-1.5"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

function NewFolderInput({ onCreate, onCancel }: { onCreate: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const commit = () => {
    const n = name.trim()
    if (n) onCreate(n)
    else onCancel()
  }
  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre de la carpeta"
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') onCancel()
        }}
        className="bg-zinc-900 border border-indigo-500/50 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 w-40 focus:outline-none focus:border-indigo-400"
      />
      <button onClick={commit} title="Crear" className="text-emerald-400 hover:text-emerald-300 p-1">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button onClick={onCancel} title="Cancelar" className="text-zinc-500 hover:text-zinc-300 p-1">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

/** Menú para mandar un mapa a otra carpeta. */
function MoveToFolderMenu({ folders, currentFolderId, locked, onMove }: {
  folders: MindMapFolder[]
  currentFolderId?: string
  locked: boolean
  onMove: (folderId: string | null) => void
}) {
  const [open, setOpen] = useState(false)

  if (locked) {
    return (
      <span title="Este mapa vive en una carpeta fija y no se puede mover" className="text-zinc-600 p-1.5">
        <Lock className="w-3.5 h-3.5" />
      </span>
    )
  }
  if (folders.length === 0) return null

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        title="Mover a una carpeta"
        className="text-zinc-500 hover:text-indigo-300 p-1.5 rounded transition-colors"
      >
        <Folder className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          {/* Capa para cerrar al clickear afuera. */}
          <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
          <div className="absolute right-0 bottom-full mb-1 z-40 w-44 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1">
            <button
              onClick={(e) => { e.stopPropagation(); onMove(null); setOpen(false) }}
              className={`w-full text-left text-xs px-3 py-1.5 hover:bg-zinc-800 transition-colors ${
                !currentFolderId ? 'text-indigo-300' : 'text-zinc-300'
              }`}
            >
              Sin carpeta
            </button>
            {folders.filter((f) => !f.locked).map((f) => (
              <button
                key={f.id}
                onClick={(e) => { e.stopPropagation(); onMove(f.id); setOpen(false) }}
                className={`w-full text-left text-xs px-3 py-1.5 hover:bg-zinc-800 transition-colors truncate ${
                  currentFolderId === f.id ? 'text-indigo-300' : 'text-zinc-300'
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
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
  map, folders, lockedInFolder, canDelete, onMoveToFolder, onOpen, onRename, onDelete,
}: {
  map: MindMap
  folders: MindMapFolder[]
  lockedInFolder: boolean
  canDelete: boolean
  onMoveToFolder: (folderId: string | null) => void
  onOpen: () => void
  onRename: (t: string) => void
  onDelete: () => void
}) {
  const [hover, setHover] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(map.title)
  useEffect(() => { setDraft(map.title) }, [map.title])

  const days = Math.floor((Date.now() - new Date(map.updatedAt).getTime()) / 86400000)
  const ago = days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days}d`

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="rounded-2xl border-2 transition-all duration-150 cursor-pointer overflow-hidden"
      style={{
        background: hover ? '#6366f110' : 'var(--app-bg)',
        borderColor: hover ? '#6366f1AA' : 'rgba(var(--glass-tint), 0.12)',
        boxShadow: hover ? '0 12px 32px -10px #6366f150' : 'none',
        transform: hover ? 'translateY(-2px)' : 'none',
      }}
    >
      {/* Preview / thumbnail — live mini-render of the actual map content.
          Sits at the top of the card as the visual hook. Subtly brightens
          on hover via the wrapper's bg shift. */}
      {/* Alto reducido junto con el grid de 4 columnas: con tarjetas más
          angostas, 140px de preview dejaba la card muy apaisada. */}
      <button onClick={onOpen} className="block w-full">
        <MindMapThumbnail map={map} height={112} hover={hover} />
      </button>

      <button onClick={onOpen} className="w-full text-left px-3 pt-2.5 pb-1">
        <div className="flex items-center gap-2 mb-1">
          <Network className="w-4 h-4 text-indigo-400 shrink-0" />
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => { onRename(draft.trim() || map.title); setEditing(false) }}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') { onRename(draft.trim() || map.title); setEditing(false) }
                if (e.key === 'Escape') { setDraft(map.title); setEditing(false) }
              }}
              className="flex-1 bg-zinc-900 border-b border-indigo-500/50 text-sm font-bold text-zinc-100 focus:outline-none px-1"
            />
          ) : (
            <p className="text-sm font-bold text-zinc-100 flex-1 truncate">{map.title}</p>
          )}
        </div>
        <p className="text-[10px] font-mono text-zinc-500">
          {map.nodes.length} nodos · {map.edges.length} conexiones · {ago}
        </p>
      </button>

      <div className="px-3 pb-3 flex gap-1 items-center justify-end">
        <MoveToFolderMenu
          folders={folders}
          currentFolderId={map.folderId}
          locked={lockedInFolder}
          onMove={onMoveToFolder}
        />
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(true) }}
          className="text-[10px] text-zinc-500 hover:text-zinc-200 active:text-zinc-100 px-2 py-1 rounded hover:bg-zinc-900 transition-colors flex items-center gap-1"
        >
          <Pencil className="w-3 h-3" /> Renombrar
        </button>
        {canDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="text-[10px] text-zinc-600 hover:text-red-400 px-2 py-1 rounded hover:bg-red-500/10 transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" /> Borrar
          </button>
        )}
      </div>
    </div>
  )
}
