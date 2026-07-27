'use client'
/**
 * Lienzo de CONCEPTOS de una materia — mapa mental libre.
 *
 * Cada concepto es un nodo que se arrastra por el canvas (pan + zoom estilo
 * Figma/Miro). Colapsado muestra título + autor; se despliega para leer/editar
 * el cuerpo. Los conceptos se agrupan por ÁREA (color) y se mueven entre áreas
 * desde un selector en la tarjeta. Leyenda de áreas a la izquierda.
 *
 * Reusa los patrones de MindMapCanvas (transform pan/zoom + pointer-capture
 * drag), pero con nodos-tarjeta a medida en vez de cajas de texto.
 */
import { useRef, useState, useEffect, useCallback, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Plus, Trash2, ZoomIn, ZoomOut, Hand, Pencil, ChevronDown, ChevronUp,
  Tag, User, Check, UserPlus, StickyNote, RotateCcw, Users,
} from 'lucide-react'
import { useConceptStore } from '@/lib/store/conceptStore'
import { useStudyStore } from '@/lib/store/studyStore'
import { AREA_PALETTE, NODE_W_DEFAULT, NODE_W_MIN, NODE_W_MAX, type Concept, type ConceptArea, type ConceptSource, type MapNote } from '@/lib/study/concepts'
import type { StudyAuthor } from '@/lib/study/types'

const ZOOM_MIN = 0.35
const ZOOM_MAX = 2.5
const NODE_WIDTH = NODE_W_DEFAULT
// Referencia estable para cuando la carrera aún no tiene autores (evita re-renders).
const EMPTY_AUTHORS: StudyAuthor[] = []

/** Nombre a mostrar de un aporte: resuelve `authorId` contra el registro de la
 *  carrera (así renombrar un autor propaga), con fallback al `author` guardado. */
function sourceAuthorName(src: ConceptSource, authors: StudyAuthor[]): string {
  return (src.authorId ? authors.find((a) => a.id === src.authorId)?.name : undefined) ?? src.author ?? ''
}
/** Etiqueta corta de autores del concepto (resuelta contra el registro). */
function resolvedAuthorsLabel(sources: ConceptSource[], authors: StudyAuthor[]): string {
  const names = sources.map((s) => sourceAuthorName(s, authors).trim()).filter(Boolean)
  if (names.length === 0) return ''
  if (names.length <= 2) return names.join(' · ')
  return `${names[0]} · ${names[1]} +${names.length - 2}`
}

export function ConceptMapCanvas({ materiaId, accent }: { materiaId: string; accent: string }) {
  const ensureMap = useConceptStore((s) => s.ensureMap)
  const map = useConceptStore((s) => s.maps.find((m) => m.materiaId === materiaId) ?? null)
  const addConcept = useConceptStore((s) => s.addConcept)
  const moveConcept = useConceptStore((s) => s.moveConcept)
  const resizeConcept = useConceptStore((s) => s.resizeConcept)
  const addNoteNode = useConceptStore((s) => s.addNoteNode)
  const moveNoteNode = useConceptStore((s) => s.moveNoteNode)
  const resizeNoteNode = useConceptStore((s) => s.resizeNoteNode)

  // Carrera de esta materia + registro de autores (para las @menciones a
  // autores en los nodos NOTA y el panel de autores del sidebar).
  const carreraId = useStudyStore((s) => s.materias.find((m) => m.id === materiaId)?.carreraId ?? null)
  const carreraAuthors = useStudyStore((s) => (carreraId ? s.carreras.find((c) => c.id === carreraId)?.authors : undefined)) ?? EMPTY_AUTHORS

  // Asegurar que el mapa existe (una vez, al montar).
  useEffect(() => { ensureMap(materiaId) }, [materiaId, ensureMap])

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(zoom); useEffect(() => { zoomRef.current = zoom }, [zoom])
  const panRef = useRef(pan); useEffect(() => { panRef.current = pan }, [pan])

  const [openId, setOpenId] = useState<string | null>(null)
  const [areaFilter, setAreaFilter] = useState<string | null>(null)  // null = todas

  // ── Pan arrastrando el lienzo vacío ──
  const dragPanRef = useRef<{ px: number; py: number; sx: number; sy: number } | null>(null)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragPanRef.current
      if (!d) return
      setPan({ x: d.sx + (e.clientX - d.px), y: d.sy + (e.clientY - d.py) })
    }
    const onUp = () => { dragPanRef.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [])

  // ── Wheel zoom (anclado al cursor) ──
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top
      const intensity = Math.min(0.2, Math.abs(e.deltaY) * 0.0015)
      const factor = e.deltaY < 0 ? 1 + intensity : 1 / (1 + intensity)
      const oldZoom = zoomRef.current
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, oldZoom * factor))
      if (newZoom === oldZoom) return
      const ratio = newZoom / oldZoom
      const oldPan = panRef.current
      setPan({ x: sx - (sx - oldPan.x) * ratio, y: sy - (sy - oldPan.y) * ratio })
      setZoom(newZoom)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return
    setOpenId(null)
    dragPanRef.current = { px: e.clientX, py: e.clientY, sx: pan.x, sy: pan.y }
  }

  // ── Drag de un nodo (pointer capture) ──
  const startNodeDrag = useCallback((e: React.PointerEvent, concept: Concept) => {
    e.stopPropagation()
    const startX = e.clientX, startY = e.clientY
    const ox = concept.x, oy = concept.y
    const pointerId = e.pointerId
    const el = e.currentTarget as HTMLElement
    let moved = false
    try { el.setPointerCapture(pointerId) } catch { /* noop */ }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const z = zoomRef.current
      const dx = (ev.clientX - startX) / z, dy = (ev.clientY - startY) / z
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return
      moved = true
      moveConcept(materiaId, concept.id, ox + dx, oy + dy)
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      try { el.releasePointerCapture(pointerId) } catch { /* noop */ }
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }, [materiaId, moveConcept])

  // ── Resize del ancho de un nodo (handle borde derecho) ──
  const startNodeResize = useCallback((e: React.PointerEvent, concept: Concept) => {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const startW = concept.w ?? NODE_WIDTH
    const pointerId = e.pointerId
    const el = e.currentTarget as HTMLElement
    try { el.setPointerCapture(pointerId) } catch { /* noop */ }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const z = zoomRef.current
      const next = startW + (ev.clientX - startX) / z
      resizeConcept(materiaId, concept.id, Math.max(NODE_W_MIN, Math.min(NODE_W_MAX, next)))
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      try { el.releasePointerCapture(pointerId) } catch { /* noop */ }
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }, [materiaId, resizeConcept])

  // ── Drag / resize de un nodo NOTA (mismo patrón que los conceptos) ──
  const startNoteDrag = useCallback((e: React.PointerEvent, note: MapNote) => {
    e.stopPropagation()
    const startX = e.clientX, startY = e.clientY
    const ox = note.x, oy = note.y
    const pointerId = e.pointerId
    const el = e.currentTarget as HTMLElement
    let moved = false
    try { el.setPointerCapture(pointerId) } catch { /* noop */ }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const z = zoomRef.current
      const dx = (ev.clientX - startX) / z, dy = (ev.clientY - startY) / z
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return
      moved = true
      moveNoteNode(materiaId, note.id, ox + dx, oy + dy)
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      try { el.releasePointerCapture(pointerId) } catch { /* noop */ }
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }, [materiaId, moveNoteNode])

  const startNoteResize = useCallback((e: React.PointerEvent, note: MapNote) => {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const startW = note.w ?? NODE_WIDTH
    const pointerId = e.pointerId
    const el = e.currentTarget as HTMLElement
    try { el.setPointerCapture(pointerId) } catch { /* noop */ }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const z = zoomRef.current
      const next = startW + (ev.clientX - startX) / z
      resizeNoteNode(materiaId, note.id, Math.max(NODE_W_MIN, Math.min(NODE_W_MAX, next)))
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      try { el.releasePointerCapture(pointerId) } catch { /* noop */ }
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }, [materiaId, resizeNoteNode])

  if (!map) return null

  const areaById = new Map(map.areas.map((a) => [a.id, a]))
  const visibleConcepts = areaFilter ? map.concepts.filter((c) => c.areaId === areaFilter) : map.concepts

  const noteNodes = map.noteNodes ?? []

  const addConceptAtCenter = () => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const cx = rect ? (rect.width / 2 - pan.x) / zoom - NODE_WIDTH / 2 : 120
    const cy = rect ? (rect.height / 2 - pan.y) / zoom - 40 : 120
    const id = addConcept(materiaId, { x: cx, y: cy, areaId: areaFilter ?? undefined })
    setOpenId(id)
  }

  const addNoteAtCenter = () => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const cx = rect ? (rect.width / 2 - pan.x) / zoom - NODE_WIDTH / 2 : 120
    const cy = rect ? (rect.height / 2 - pan.y) / zoom - 40 : 120
    addNoteNode(materiaId, { x: cx, y: cy })
  }

  // Ir a un concepto por id (click en un link @concepto): lo centra y lo abre.
  // Si el filtro de área lo oculta, lo limpiamos para que se vea.
  const navigateToConcept = (conceptId: string) => {
    const c = map.concepts.find((x) => x.id === conceptId)
    if (!c) return
    if (areaFilter && c.areaId !== areaFilter) setAreaFilter(null)
    const rect = canvasRef.current?.getBoundingClientRect()
    if (rect) {
      setPan({ x: rect.width / 2 - (c.x + (c.w ?? NODE_WIDTH) / 2) * zoom, y: rect.height / 2 - (c.y + 30) * zoom })
    }
    setOpenId(conceptId)
  }

  const zoomBy = (mult: number) => {
    const el = canvasRef.current; if (!el) return
    const rect = el.getBoundingClientRect()
    const sx = rect.width / 2, sy = rect.height / 2
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * mult))
    if (newZoom === zoom) return
    const ratio = newZoom / zoom
    setPan({ x: sx - (sx - pan.x) * ratio, y: sy - (sy - pan.y) * ratio })
    setZoom(newZoom)
  }

  return (
    <div className="flex gap-3 h-[calc(100vh-220px)] min-h-[520px]">
      {/* ── Columna izquierda: áreas + autores ── */}
      <div className="w-52 shrink-0 flex flex-col gap-3 min-h-0">
        <AreaLegend
          materiaId={materiaId}
          areas={map.areas}
          accent={accent}
          areaFilter={areaFilter}
          setAreaFilter={setAreaFilter}
          countByArea={(id) => map.concepts.filter((c) => c.areaId === id).length}
          unassignedCount={map.concepts.filter((c) => !c.areaId).length}
          totalCount={map.concepts.length}
        />
        <AuthorsPanel carreraId={carreraId} authors={carreraAuthors} />
      </div>

      {/* ── Lienzo ── */}
      <div className="relative flex-1 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'var(--card-bg)' }}>
        {/* Toolbar flotante */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-zinc-900/95 backdrop-blur border border-zinc-800 rounded-xl p-1 shadow-2xl">
          <button onClick={addConceptAtCenter}
            className="text-xs font-semibold text-zinc-200 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Concepto
          </button>
          <button onClick={addNoteAtCenter} title="Agregar un nodo NOTA — resumen de texto libre con @ a conceptos y autores"
            className="text-xs font-semibold text-amber-300/90 hover:text-amber-200 px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-1.5">
            <StickyNote className="w-3.5 h-3.5" /> Nota
          </button>
          <button onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1) }} title="Centrar + 100%"
            className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 p-1.5 rounded-lg transition-colors">
            <Hand className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-0.5 bg-zinc-950/60 border border-zinc-800 rounded-lg p-0.5 ml-1">
            <button onClick={() => zoomBy(1 / 1.25)} className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 p-1 rounded-md"><ZoomOut className="w-3.5 h-3.5" /></button>
            <span className="text-[10px] font-mono tabular-nums text-zinc-300 px-1.5 min-w-[34px] text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => zoomBy(1.25)} className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 p-1 rounded-md"><ZoomIn className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        <div
          ref={canvasRef}
          onPointerDown={onCanvasPointerDown}
          className="absolute inset-0 overflow-hidden cursor-grab active:cursor-grabbing"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)',
            backgroundSize: '26px 26px',
            backgroundPosition: `${pan.x % 26}px ${pan.y % 26}px`,
            touchAction: 'none',
          }}
        >
          {/* Wrapper con el transform pan+zoom (0×0 para no capturar eventos) */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, transformOrigin: '0 0', transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            {visibleConcepts.map((c) => (
              <ConceptNode
                key={c.id}
                materiaId={materiaId}
                concept={c}
                area={c.areaId ? areaById.get(c.areaId) ?? null : null}
                areas={map.areas}
                open={openId === c.id}
                allConcepts={map.concepts}
                onNavigate={navigateToConcept}
                onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))}
                onPointerDownHeader={(e) => startNodeDrag(e, c)}
                onPointerDownResize={(e) => startNodeResize(e, c)}
              />
            ))}
            {/* Nodos NOTA — solo se muestran sin filtro de área (son del mapa,
                no pertenecen a un área). */}
            {areaFilter === null && noteNodes.map((n) => (
              <NoteNode
                key={n.id}
                materiaId={materiaId}
                note={n}
                allConcepts={map.concepts}
                authors={carreraAuthors}
                onNavigate={navigateToConcept}
                onPointerDownHeader={(e) => startNoteDrag(e, n)}
                onPointerDownResize={(e) => startNoteResize(e, n)}
              />
            ))}
          </div>

          {/* Empty state */}
          {map.concepts.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center max-w-sm px-6 py-8 bg-zinc-900/60 border border-dashed border-zinc-700 rounded-2xl">
                <Tag className="w-7 h-7 text-zinc-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-zinc-300 mb-1">Mapa de conceptos vacío</p>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Tocá <strong>&quot;+ Concepto&quot;</strong> para agregar el primero. Escribí el título, el autor y su explicación — después arrastralos y agrupalos por área.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Leyenda de áreas (izquierda) ─────────────────────────────────────────────

function AreaLegend({
  materiaId, areas, accent, areaFilter, setAreaFilter, countByArea, unassignedCount, totalCount,
}: {
  materiaId: string
  areas: ConceptArea[]
  accent: string
  areaFilter: string | null
  setAreaFilter: (id: string | null) => void
  countByArea: (id: string) => number
  unassignedCount: number
  totalCount: number
}) {
  const addArea = useConceptStore((s) => s.addArea)
  const updateArea = useConceptStore((s) => s.updateArea)
  const removeArea = useConceptStore((s) => s.removeArea)
  const [adding, setAdding] = useState('')
  const [editId, setEditId] = useState<string | null>(null)

  return (
    <div className="w-full flex-1 min-h-0 rounded-2xl p-3 flex flex-col gap-2 overflow-y-auto" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'var(--card-bg)' }}>
      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 px-1">Áreas</p>

      <button
        onClick={() => setAreaFilter(null)}
        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${areaFilter === null ? 'bg-white/[0.06] text-white' : 'text-zinc-400 hover:text-white hover:bg-white/[0.03]'}`}
      >
        <span className="font-semibold">Todas</span>
        <span className="text-[10px] font-mono text-zinc-500">{totalCount}</span>
      </button>

      {areas.map((a) => (
        <div key={a.id} className="group/area">
          {editId === a.id ? (
            <div className="flex items-center gap-1.5 px-1.5 py-1">
              <button
                onClick={() => {
                  const idx = AREA_PALETTE.indexOf(a.color)
                  updateArea(materiaId, a.id, { color: AREA_PALETTE[(idx + 1) % AREA_PALETTE.length] })
                }}
                title="Cambiar color"
                className="w-4 h-4 rounded-full shrink-0 border border-white/20"
                style={{ background: a.color }}
              />
              <input
                autoFocus defaultValue={a.name}
                onBlur={(e) => { updateArea(materiaId, a.id, { name: e.target.value.trim() || a.name }); setEditId(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditId(null) }}
                className="flex-1 min-w-0 bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-100 focus:outline-none"
              />
              <button onClick={() => { if (confirm(`¿Borrar el área "${a.name}"? Los conceptos quedan sin área (no se borran).`)) { removeArea(materiaId, a.id); setEditId(null) } }}
                className="p-0.5 text-zinc-600 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
            </div>
          ) : (
            <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${areaFilter === a.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}>
              <button onClick={() => setAreaFilter(areaFilter === a.id ? null : a.id)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: a.color, boxShadow: `0 0 6px ${a.color}88` }} />
                <span className={`truncate font-medium ${areaFilter === a.id ? 'text-white' : 'text-zinc-300'}`}>{a.name}</span>
              </button>
              <span className="text-[10px] font-mono text-zinc-500">{countByArea(a.id)}</span>
              <button onClick={() => setEditId(a.id)} title="Editar área" className="p-0.5 text-zinc-600 hover:text-zinc-200 opacity-0 group-hover/area:opacity-100 transition-opacity"><Pencil className="w-3 h-3" /></button>
            </div>
          )}
        </div>
      ))}

      {unassignedCount > 0 && (
        <div className="flex items-center gap-2 px-2.5 py-1 text-[11px] text-zinc-600">
          <span className="w-2.5 h-2.5 rounded-full border border-zinc-600" />
          <span className="flex-1">Sin área</span>
          <span className="font-mono">{unassignedCount}</span>
        </div>
      )}

      <div className="mt-1 flex items-center gap-1 border-t border-white/[0.06] pt-2">
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && adding.trim()) { addArea(materiaId, adding.trim()); setAdding('') } }}
          placeholder="Nueva área…"
          className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-[color:var(--accent)]"
          style={{ ['--accent' as string]: accent }}
        />
        <button onClick={() => { if (adding.trim()) { addArea(materiaId, adding.trim()); setAdding('') } }}
          className="p-1 rounded-md text-emerald-400 hover:bg-emerald-500/10"><Plus className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  )
}

// ─── Nodo-concepto ────────────────────────────────────────────────────────────

function ConceptNode({
  materiaId, concept, area, areas, open, allConcepts, onNavigate, onToggle, onPointerDownHeader, onPointerDownResize,
}: {
  materiaId: string
  concept: Concept
  area: ConceptArea | null
  areas: ConceptArea[]
  open: boolean
  allConcepts: Concept[]
  onNavigate: (conceptId: string) => void
  onToggle: () => void
  onPointerDownHeader: (e: React.PointerEvent) => void
  onPointerDownResize: (e: React.PointerEvent) => void
}) {
  const updateConcept = useConceptStore((s) => s.updateConcept)
  const removeConcept = useConceptStore((s) => s.removeConcept)
  const toggleStudied = useConceptStore((s) => s.toggleStudied)
  const addSource = useConceptStore((s) => s.addSource)
  const updateSource = useConceptStore((s) => s.updateSource)
  const removeSource = useConceptStore((s) => s.removeSource)
  // Carrera de esta materia + su registro de autores reutilizables.
  const carreraId = useStudyStore((s) => s.materias.find((m) => m.id === materiaId)?.carreraId ?? null)
  const carreraAuthors = useStudyStore((s) => s.carreras.find((c) => c.id === carreraId)?.authors) ?? EMPTY_AUTHORS
  const [areaMenu, setAreaMenu] = useState(false)
  const color = area?.color ?? '#71717a'
  const authorNames = resolvedAuthorsLabel(concept.sources ?? [], carreraAuthors)
  const sources = concept.sources ?? []

  return (
    <div
      className="absolute rounded-xl shadow-lg select-none"
      style={{
        left: concept.x, top: concept.y, width: concept.w ?? NODE_WIDTH,
        background: 'var(--surface-popover)',
        border: `1px solid ${color}${open ? 'cc' : '66'}`,
        boxShadow: open ? `0 0 0 1px ${color}55, 0 12px 32px -12px ${color}aa` : `0 4px 16px -6px ${color}66`,
      }}
    >
      {/* Handle de resize — borde derecho, ancho ajustable */}
      <div
        onPointerDown={onPointerDownResize}
        onClick={(e) => e.stopPropagation()}
        title="Arrastrar para ajustar el ancho"
        className="absolute top-0 right-0 h-full w-2 cursor-ew-resize z-10 group/resize flex items-center justify-center"
        style={{ touchAction: 'none' }}
      >
        <span className="h-8 w-1 rounded-full bg-white/15 group-hover/resize:bg-white/40 transition-colors" style={{ boxShadow: `0 0 6px ${color}66` }} />
      </div>
      {/* Cabecera — draggable + toggle */}
      <div
        onPointerDown={onPointerDownHeader}
        onClick={onToggle}
        className="flex items-start gap-2 px-3 py-2.5 cursor-move"
        style={{ touchAction: 'none' }}
      >
        {/* Tilde de estudiado (o dot del área si no está estudiado) */}
        {concept.studied ? (
          <span className="mt-0.5 w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center bg-emerald-500" title="Estudiado">
            <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
          </span>
        ) : (
          <span className="mt-0.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
        )}
        <div className="min-w-0 flex-1">
          <p className={`text-[13px] font-semibold leading-snug break-words ${concept.studied ? 'text-zinc-400' : 'text-white'}`}>
            {concept.title.trim() || <span className="text-zinc-500 italic font-normal">Sin título</span>}
          </p>
          {authorNames && (
            <p className="flex items-center gap-1 text-[11px] text-zinc-400 mt-0.5">
              <User className="w-3 h-3 shrink-0" style={{ color }} /> {authorNames}
            </p>
          )}
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5" />}
      </div>

      {/* Cuerpo desplegable */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-3 pb-3 pt-1 space-y-2 border-t border-white/[0.06]" onPointerDown={(e) => e.stopPropagation()}>
              <input
                value={concept.title}
                onChange={(e) => updateConcept(materiaId, concept.id, { title: e.target.value })}
                placeholder="Título del concepto"
                className="w-full bg-transparent text-[13px] font-semibold text-white placeholder-zinc-600 focus:outline-none"
              />

              {/* Estudiado */}
              <button
                onClick={() => toggleStudied(materiaId, concept.id)}
                className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg transition-colors ${
                  concept.studied ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300' : 'bg-white/[0.03] border border-white/[0.10] text-zinc-400 hover:text-white'
                }`}
              >
                <span className={`w-3.5 h-3.5 rounded flex items-center justify-center ${concept.studied ? 'bg-emerald-500' : 'border border-zinc-600'}`}>
                  {concept.studied && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </span>
                {concept.studied ? 'Estudiado' : 'Marcar como estudiado'}
              </button>

              {/* Aportes por autor */}
              <div className="space-y-2">
                {sources.map((src, i) => (
                  <div key={src.id} className="rounded-lg bg-zinc-950/50 border border-white/[0.07] p-2 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3 h-3 text-zinc-500 shrink-0" />
                      <AuthorInput
                        materiaId={materiaId}
                        conceptId={concept.id}
                        source={src}
                        carreraId={carreraId}
                        authors={carreraAuthors}
                      />
                      {sources.length > 1 && (
                        <button onClick={() => removeSource(materiaId, concept.id, src.id)} title="Quitar aporte"
                          className="p-0.5 text-zinc-600 hover:text-red-400 shrink-0"><Trash2 className="w-3 h-3" /></button>
                      )}
                    </div>
                    <RichText
                      value={src.body}
                      onSave={(v) => updateSource(materiaId, concept.id, src.id, { body: v })}
                      placeholder={i === 0 ? 'Explicación del concepto…' : 'La mirada de este autor…'}
                      allConcepts={allConcepts}
                      selfId={concept.id}
                      onNavigate={onNavigate}
                    />
                  </div>
                ))}
                <button
                  onClick={() => addSource(materiaId, concept.id)}
                  className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-white transition-colors"
                >
                  <UserPlus className="w-3 h-3" /> Agregar aporte de otro autor
                </button>
              </div>

              {/* Mover entre áreas + borrar */}
              <div className="flex items-center justify-between gap-2">
                <div className="relative">
                  <button
                    onClick={() => setAreaMenu((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg text-zinc-300 hover:text-white transition-colors"
                    style={{ background: `${color}18`, border: `1px solid ${color}44` }}
                  >
                    <Tag className="w-3 h-3" style={{ color }} />
                    {area?.name ?? 'Sin área'}
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </button>
                  {areaMenu && (
                    <div className="absolute bottom-full mb-1 left-0 z-30 min-w-[150px] bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1">
                      {areas.map((a) => (
                        <button key={a.id}
                          onClick={() => { updateConcept(materiaId, concept.id, { areaId: a.id }); setAreaMenu(false) }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-zinc-200 hover:bg-white/[0.06] transition-colors">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: a.color }} />
                          <span className="truncate">{a.name}</span>
                          {concept.areaId === a.id && <span className="ml-auto text-[10px]" style={{ color: a.color }}>✓</span>}
                        </button>
                      ))}
                      <button onClick={() => { updateConcept(materiaId, concept.id, { areaId: null }); setAreaMenu(false) }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-zinc-400 hover:bg-white/[0.06] border-t border-white/[0.06] transition-colors">
                        <span className="w-2.5 h-2.5 rounded-full border border-zinc-600 shrink-0" /> Sin área
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => { if (confirm('¿Borrar este concepto?')) removeConcept(materiaId, concept.id) }}
                  title="Borrar concepto"
                  className="p-1 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Cuerpo del aporte: click-para-editar + @menciones a conceptos ────────────

/** Renderiza el texto reemplazando los tokens de mención:
 *   - `[[conceptId]]` → link clickeable con el título ACTUAL del concepto
 *     (así renombrar propaga) que navega hacia él.
 *   - `((authorId))`  → chip con el nombre ACTUAL del autor (registro carrera).
 *  Ambos resuelven el nombre en vivo, así renombrar propaga a todas las notas. */
function renderBody(
  body: string,
  allConcepts: Concept[],
  onNavigate: (id: string) => void,
  authors: StudyAuthor[] = EMPTY_AUTHORS,
): ReactNode {
  const re = /\[\[([^\]]+)\]\]|\(\(([^)]+)\)\)/g
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) out.push(<span key={`t${k}`}>{body.slice(last, m.index)}</span>)
    if (m[1] !== undefined) {
      // Concepto
      const id = m[1]
      const c = allConcepts.find((x) => x.id === id)
      out.push(
        <button
          key={`l${k}`}
          onClick={(e) => { e.stopPropagation(); onNavigate(id) }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Ir al concepto"
          className="text-fuchsia-300 hover:text-fuchsia-200 underline decoration-fuchsia-400/40 hover:decoration-fuchsia-300 font-medium"
        >
          {c ? (c.title.trim() || 'concepto') : 'concepto?'}
        </button>,
      )
    } else {
      // Autor
      const id = m[2]
      const a = authors.find((x) => x.id === id)
      out.push(
        <span
          key={`a${k}`}
          className="inline-flex items-center gap-0.5 align-baseline text-sky-300 font-medium"
          title="Autor"
        >
          <User className="w-3 h-3" />{a ? (a.name.trim() || 'autor') : 'autor?'}
        </span>,
      )
    }
    last = re.lastIndex
    k++
  }
  if (last < body.length) out.push(<span key={`t${k}`}>{body.slice(last)}</span>)
  return out
}

type MentionSuggestion =
  | { kind: 'concept'; id: string; label: string }
  | { kind: 'author'; id: string; label: string }

function RichText({
  value, onSave, placeholder, allConcepts, selfId, onNavigate, authors, className,
}: {
  value: string
  onSave: (next: string) => void
  placeholder: string
  allConcepts: Concept[]
  selfId: string
  onNavigate: (conceptId: string) => void
  /** Si se pasan, el `@` también sugiere autores (se insertan como `((id))`). */
  authors?: StudyAuthor[]
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [mention, setMention] = useState<{ query: string; at: number } | null>(null)
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  const withAuthors = authors ?? EMPTY_AUTHORS

  const commit = () => {
    setEditing(false)
    setMention(null)
    if (draft !== value) onSave(draft)
  }

  const onChange = (value: string, cursor: number) => {
    setDraft(value)
    const before = value.slice(0, cursor)
    const m = before.match(/@([^\n@[\]]{0,40})$/)
    setMention(m ? { query: m[1], at: cursor - m[0].length } : null)
  }

  const insert = (sug: MentionSuggestion) => {
    if (!mention) return
    const token = sug.kind === 'concept' ? `[[${sug.id}]] ` : `((${sug.id})) `
    const next = draft.slice(0, mention.at) + token + draft.slice(mention.at + 1 + mention.query.length)
    setDraft(next)
    setMention(null)
    requestAnimationFrame(() => taRef.current?.focus())
  }

  const q = mention?.query.trim().toLowerCase() ?? ''
  const suggestions: MentionSuggestion[] = mention
    ? [
        ...allConcepts
          .filter((c) => c.id !== selfId && c.title.trim() && (q === '' || c.title.toLowerCase().includes(q)))
          .slice(0, 6)
          .map((c): MentionSuggestion => ({ kind: 'concept', id: c.id, label: c.title.trim() || 'Sin título' })),
        ...withAuthors
          .filter((a) => a.name.trim() && (q === '' || a.name.toLowerCase().includes(q)))
          .slice(0, 6)
          .map((a): MentionSuggestion => ({ kind: 'author', id: a.id, label: a.name.trim() })),
      ]
    : []

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        className={`w-full text-[12px] text-zinc-200 leading-relaxed cursor-text min-h-[2.25rem] whitespace-pre-wrap break-words ${className ?? ''}`}
      >
        {value.trim() ? renderBody(value, allConcepts, onNavigate, withAuthors) : <span className="text-zinc-600">{placeholder}</span>}
      </div>
    )
  }

  const hint = authors ? '@ enlaza concepto o autor' : '@ enlaza un concepto'
  return (
    <div className="relative">
      <textarea
        ref={taRef}
        autoFocus
        value={draft}
        onChange={(e) => onChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (mention && suggestions.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) {
            e.preventDefault(); insert(suggestions[0]); return
          }
          if (e.key === 'Escape') setMention(null)
        }}
        placeholder={`${placeholder}  ·  ${hint}`}
        rows={3}
        className="w-full bg-transparent text-[12px] text-zinc-200 leading-relaxed placeholder-zinc-600 focus:outline-none resize-y"
      />
      {mention && suggestions.length > 0 && (
        <div className="absolute z-40 left-0 top-full mt-0.5 min-w-[170px] max-h-44 overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1">
          <p className="px-2.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-zinc-600">Enlazar</p>
          {suggestions.map((sug) => (
            <button key={`${sug.kind}-${sug.id}`}
              onMouseDown={(e) => { e.preventDefault(); insert(sug) }}
              className="w-full flex items-center gap-1.5 px-2.5 py-1 text-left text-[12px] text-zinc-200 hover:bg-white/[0.06]">
              {sug.kind === 'concept'
                ? <Tag className="w-3 h-3 text-zinc-500 shrink-0" />
                : <User className="w-3 h-3 text-sky-400 shrink-0" />}
              <span className="truncate">{sug.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Nodo NOTA: resumen de texto libre con @conceptos y @autores ─────────────

function NoteNode({
  materiaId, note, allConcepts, authors, onNavigate, onPointerDownHeader, onPointerDownResize,
}: {
  materiaId: string
  note: MapNote
  allConcepts: Concept[]
  authors: StudyAuthor[]
  onNavigate: (conceptId: string) => void
  onPointerDownHeader: (e: React.PointerEvent) => void
  onPointerDownResize: (e: React.PointerEvent) => void
}) {
  const updateNoteNode = useConceptStore((s) => s.updateNoteNode)
  const removeNoteNode = useConceptStore((s) => s.removeNoteNode)
  const color = '#f59e0b'  // ámbar — distingue las notas de los conceptos

  return (
    <div
      className="absolute rounded-xl shadow-lg select-none"
      style={{
        left: note.x, top: note.y, width: note.w ?? NODE_WIDTH,
        background: 'linear-gradient(180deg, rgba(245,158,11,0.10), var(--surface-popover))',
        border: `1px solid ${color}66`,
        boxShadow: `0 4px 16px -6px ${color}66`,
      }}
    >
      {/* Handle de resize — borde derecho */}
      <div
        onPointerDown={onPointerDownResize}
        onClick={(e) => e.stopPropagation()}
        title="Arrastrar para ajustar el ancho"
        className="absolute top-0 right-0 h-full w-2 cursor-ew-resize z-10 group/resize flex items-center justify-center"
        style={{ touchAction: 'none' }}
      >
        <span className="h-8 w-1 rounded-full bg-white/15 group-hover/resize:bg-white/40 transition-colors" style={{ boxShadow: `0 0 6px ${color}66` }} />
      </div>
      {/* Cabecera — draggable */}
      <div
        onPointerDown={onPointerDownHeader}
        className="flex items-center gap-2 px-3 py-2 cursor-move"
        style={{ touchAction: 'none' }}
      >
        <StickyNote className="w-3.5 h-3.5 shrink-0" style={{ color }} />
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] flex-1" style={{ color: `${color}` }}>Nota</span>
        <button
          onClick={() => { if (confirm('¿Borrar esta nota?')) removeNoteNode(materiaId, note.id) }}
          title="Borrar nota"
          className="p-0.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* Cuerpo editable */}
      <div className="px-3 pb-3 pt-1 border-t border-white/[0.06]" onPointerDown={(e) => e.stopPropagation()}>
        <RichText
          value={note.text}
          onSave={(v) => updateNoteNode(materiaId, note.id, v)}
          placeholder="Resumen… escribí @ para enlazar conceptos y autores"
          allConcepts={allConcepts}
          selfId=""
          onNavigate={onNavigate}
          authors={authors}
        />
      </div>
    </div>
  )
}

// ─── Panel de autores del sidebar (registro de la carrera + recuperación) ─────

function AuthorsPanel({
  carreraId, authors,
}: {
  carreraId: string | null
  authors: StudyAuthor[]
}) {
  const addAuthor = useStudyStore((s) => s.addAuthor)
  const renameAuthor = useStudyStore((s) => s.renameAuthor)
  const removeAuthor = useStudyStore((s) => s.removeAuthor)
  const materias = useStudyStore((s) => s.materias)
  const maps = useConceptStore((s) => s.maps)
  const [adding, setAdding] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  // Recupera el registro desde los nombres de autor "denormalizados" que
  // siguen guardados en los aportes de los conceptos (útil si el registro se
  // borró pero los aportes conservan el nombre).
  const recover = () => {
    if (!carreraId) return
    const materiaIds = new Set(materias.filter((m) => m.carreraId === carreraId).map((m) => m.id))
    const names = new Set<string>()
    for (const m of maps) {
      if (!materiaIds.has(m.materiaId)) continue
      for (const c of m.concepts) {
        for (const src of c.sources ?? []) {
          const n = (src.author ?? '').trim()
          if (n) names.add(n)
        }
      }
    }
    const existing = new Set(authors.map((a) => a.name.trim().toLowerCase()))
    let added = 0
    for (const n of names) {
      if (!existing.has(n.toLowerCase())) { addAuthor(carreraId, n); added++ }
    }
    alert(added > 0
      ? `Recuperé ${added} autor${added === 1 ? '' : 'es'} desde los aportes de tus conceptos.`
      : 'No encontré autores nuevos para recuperar en los aportes de los conceptos.')
  }

  const submitAdd = () => {
    const n = adding.trim()
    if (!n || !carreraId) { setAdding(''); return }
    if (!authors.some((a) => a.name.trim().toLowerCase() === n.toLowerCase())) addAuthor(carreraId, n)
    setAdding('')
  }

  return (
    <div className="w-full shrink-0 max-h-[45%] rounded-2xl p-3 flex flex-col gap-2 overflow-y-auto" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'var(--card-bg)' }}>
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-1.5"><Users className="w-3 h-3" /> Autores</p>
        <button onClick={recover} disabled={!carreraId} title="Recuperar autores desde los aportes de los conceptos"
          className="p-1 rounded-md text-zinc-500 hover:text-amber-300 hover:bg-white/[0.05] disabled:opacity-30 transition-colors">
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>

      {authors.length === 0 && (
        <p className="text-[11px] text-zinc-600 leading-relaxed px-1">Sin autores todavía. Se crean al escribir el autor de un aporte, o tocá <RotateCcw className="w-2.5 h-2.5 inline" /> para recuperarlos.</p>
      )}

      {authors.map((a) => (
        <div key={a.id} className="group/author flex items-center gap-1.5">
          {editId === a.id ? (
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => { if (editName.trim() && carreraId) renameAuthor(carreraId, a.id, editName); setEditId(null) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { if (editName.trim() && carreraId) renameAuthor(carreraId, a.id, editName); setEditId(null) }
                if (e.key === 'Escape') setEditId(null)
              }}
              className="flex-1 min-w-0 bg-zinc-900 border border-white/[0.12] rounded px-1.5 py-0.5 text-[11px] text-zinc-100 focus:outline-none focus:border-sky-500/60"
            />
          ) : (
            <button
              onClick={() => { setEditId(a.id); setEditName(a.name) }}
              className="flex-1 min-w-0 flex items-center gap-1.5 text-left text-[11px] text-zinc-300 hover:text-white px-1 py-0.5 rounded hover:bg-white/[0.03] transition-colors"
              title="Renombrar autor"
            >
              <User className="w-3 h-3 text-sky-400 shrink-0" />
              <span className="truncate">{a.name.trim() || 'Sin nombre'}</span>
            </button>
          )}
          <button
            onClick={() => { if (carreraId && confirm(`¿Quitar a "${a.name}" del registro? Los aportes conservan el nombre.`)) removeAuthor(carreraId, a.id) }}
            title="Quitar autor"
            className="p-0.5 rounded text-zinc-600 hover:text-red-400 opacity-0 group-hover/author:opacity-100 transition-all shrink-0"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}

      {carreraId && (
        <div className="flex items-center gap-1.5 pt-1">
          <input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitAdd() }}
            onBlur={submitAdd}
            placeholder="+ Autor…"
            className="flex-1 min-w-0 bg-transparent border border-dashed border-white/[0.12] rounded px-1.5 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-500/50"
          />
        </div>
      )}
    </div>
  )
}

// ─── Autor con autocompletar (registro reutilizable de la carrera) ────────────

function AuthorInput({
  materiaId, conceptId, source, carreraId, authors,
}: {
  materiaId: string
  conceptId: string
  source: ConceptSource
  carreraId: string | null
  authors: StudyAuthor[]
}) {
  const updateSource = useConceptStore((s) => s.updateSource)
  const addAuthor = useStudyStore((s) => s.addAuthor)
  const resolvedName = sourceAuthorName(source, authors)
  const [draft, setDraft] = useState(resolvedName)
  const [open, setOpen] = useState(false)
  // Re-sincronizar si el nombre cambia desde afuera (renombre en el registro).
  useEffect(() => { setDraft(resolvedName) }, [resolvedName])

  const q = draft.trim().toLowerCase()
  const suggestions = authors
    .filter((a) => a.name.trim() && (q === '' || a.name.toLowerCase().includes(q)))
    .filter((a) => a.name.trim().toLowerCase() !== q)
    .slice(0, 6)

  const commit = (name: string) => {
    const n = name.trim()
    if (!n) { updateSource(materiaId, conceptId, source.id, { author: '', authorId: undefined }); return }
    const existing = authors.find((a) => a.name.trim().toLowerCase() === n.toLowerCase())
    const id = existing ? existing.id : (carreraId ? addAuthor(carreraId, n) : undefined)
    updateSource(materiaId, conceptId, source.id, { author: n, authorId: id })
  }
  const pick = (a: StudyAuthor) => {
    setDraft(a.name)
    updateSource(materiaId, conceptId, source.id, { author: a.name, authorId: a.id })
    setOpen(false)
  }

  return (
    <div className="relative flex-1 min-w-0">
      <input
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); commit(draft) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(draft); setOpen(false); (e.target as HTMLInputElement).blur() }
          if (e.key === 'Escape') { setOpen(false) }
        }}
        placeholder="Autor / fuente"
        className="w-full min-w-0 bg-transparent text-[12px] font-medium text-zinc-200 placeholder-zinc-600 focus:outline-none"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-40 top-full left-0 mt-1 min-w-[150px] max-h-40 overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1">
          <p className="px-2.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-zinc-600">Autores de la carrera</p>
          {suggestions.map((a) => (
            <button key={a.id}
              // onMouseDown (no onClick) para ganarle al onBlur del input.
              onMouseDown={(e) => { e.preventDefault(); pick(a) }}
              className="w-full flex items-center gap-1.5 px-2.5 py-1 text-left text-[12px] text-zinc-200 hover:bg-white/[0.06] transition-colors">
              <User className="w-3 h-3 text-zinc-500 shrink-0" /> <span className="truncate">{a.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
