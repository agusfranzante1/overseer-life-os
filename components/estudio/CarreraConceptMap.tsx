'use client'
/**
 * Mapa de conceptos de una CARRERA entera — vista de pájaro (read-only).
 *
 * Junta los mapas de todas las materias en modo `conceptos` de la carrera y los
 * dibuja como un árbol jerárquico con flechas:
 *
 *   Carrera → Materia → Concepto → Autor (aporte)
 *
 * Auto-layout en columnas (las posiciones libres de cada materia NO se
 * fusionan; acá se recalcula un layout tidy-tree). Pan + zoom estilo Miro.
 * Es de solo lectura: para editar un concepto se entra a la materia.
 */
import { useRef, useState, useEffect, useMemo } from 'react'
import { Tag, User, GraduationCap, BookOpen } from 'lucide-react'
import { useConceptStore } from '@/lib/store/conceptStore'
import type { Materia } from '@/lib/study/types'
import { authorsLabel, type ConceptMap } from '@/lib/study/concepts'

const ZOOM_MIN = 0.2
const ZOOM_MAX = 1.8

// Columnas (x del borde izquierdo de cada nivel) y anchos por nivel.
const COL = { carrera: 40, materia: 360, concepto: 720, autor: 1090 }
const W = { carrera: 240, materia: 260, concepto: 280, autor: 300 }
const ROW_H = 66          // alto de fila por hoja (autor)
const MATERIA_GAP = 1.4   // filas extra de aire entre materias

type NodeKind = 'carrera' | 'materia' | 'concepto' | 'autor'
interface LNode {
  id: string
  kind: NodeKind
  x: number; y: number; w: number
  label: string
  sublabel?: string
  body?: string
  color: string
  studied?: boolean
}
interface LEdge { id: string; x1: number; y1: number; x2: number; y2: number; kind: 'tree' | 'autor'; color: string }

interface Layout { nodes: LNode[]; edges: LEdge[]; width: number; height: number }

/** Un aporte cuenta como nodo-autor solo si tiene autor o cuerpo escrito. */
function realSources(map: ConceptMap | null, conceptId: string) {
  const c = map?.concepts.find((x) => x.id === conceptId)
  return (c?.sources ?? []).filter((s) => s.author.trim() || s.body.trim())
}

function buildLayout(
  carrera: { name: string; icon?: string; color: string },
  materias: Materia[],
  getMap: (id: string) => ConceptMap | null,
): Layout {
  const nodes: LNode[] = []
  const edges: LEdge[] = []
  let row = 0
  const centerY = (rows: number[]) => rows.reduce((a, b) => a + b, 0) / (rows.length || 1)

  const materiaYs: number[] = []

  for (const mat of materias) {
    const map = getMap(mat.id)
    const concepts = [...(map?.concepts ?? [])].sort((a, b) => a.title.localeCompare(b.title))
    const matColor = mat.color ?? carrera.color
    const areaColorById = new Map((map?.areas ?? []).map((a) => [a.id, a.color]))

    const conceptYs: number[] = []
    if (concepts.length === 0) {
      // Materia sin conceptos todavía → hoja propia.
      const y = row * ROW_H; row += 1
      materiaYs.push(y)
      nodes.push({ id: `m:${mat.id}`, kind: 'materia', x: COL.materia, y, w: W.materia,
        label: mat.name, sublabel: 'Sin conceptos', color: matColor })
      row += MATERIA_GAP
      continue
    }

    for (const c of concepts) {
      const srcs = realSources(map, c.id)
      const cColor = c.areaId ? (areaColorById.get(c.areaId) ?? matColor) : matColor
      let cy: number
      if (srcs.length === 0) {
        cy = row * ROW_H; row += 1
      } else {
        const authorYs: number[] = []
        for (const s of srcs) {
          const ay = row * ROW_H; row += 1
          authorYs.push(ay)
          nodes.push({ id: `s:${c.id}:${s.id}`, kind: 'autor', x: COL.autor, y: ay, w: W.autor,
            label: s.author.trim() || 'Sin autor', body: s.body.trim() || undefined, color: cColor })
        }
        cy = centerY(authorYs)
        // Flechas concepto → autor (estilo distinto).
        for (const s of srcs) {
          const an = nodes.find((n) => n.id === `s:${c.id}:${s.id}`)!
          edges.push({ id: `e:${c.id}:${s.id}`, kind: 'autor', color: cColor,
            x1: COL.concepto + W.concepto, y1: cy + 18, x2: an.x, y2: an.y + 18 })
        }
      }
      conceptYs.push(cy)
      nodes.push({ id: `c:${c.id}`, kind: 'concepto', x: COL.concepto, y: cy, w: W.concepto,
        label: c.title.trim() || 'Sin título', sublabel: authorsLabel(c) || undefined,
        color: cColor, studied: c.studied })
      // Flecha materia → concepto.
      edges.push({ id: `e:m${mat.id}:c${c.id}`, kind: 'tree', color: matColor,
        x1: COL.materia + W.materia, y1: 0, x2: COL.concepto, y2: cy + 18 })
    }

    const my = centerY(conceptYs)
    materiaYs.push(my)
    nodes.push({ id: `m:${mat.id}`, kind: 'materia', x: COL.materia, y: my, w: W.materia,
      label: mat.name, sublabel: `${concepts.length} concepto${concepts.length === 1 ? '' : 's'}`, color: matColor })
    // Corregir y1 de las flechas materia→concepto (ya conocemos my).
    for (const e of edges) if (e.id.startsWith(`e:m${mat.id}:c`)) e.y1 = my + 18
    row += MATERIA_GAP
  }

  const cy = centerY(materiaYs)
  nodes.push({ id: `carrera`, kind: 'carrera', x: COL.carrera, y: cy, w: W.carrera,
    label: carrera.name, sublabel: `${materias.length} materia${materias.length === 1 ? '' : 's'}`, color: carrera.color })
  for (const mat of materias) {
    const mn = nodes.find((n) => n.id === `m:${mat.id}`)
    if (mn) edges.push({ id: `e:carrera:${mat.id}`, kind: 'tree', color: carrera.color,
      x1: COL.carrera + W.carrera, y1: cy + 18, x2: COL.materia, y2: mn.y + 18 })
  }

  const width = COL.autor + W.autor + 80
  const height = Math.max(row * ROW_H, 200) + 80
  return { nodes, edges, width, height }
}

export function CarreraConceptMap({
  carrera, materias, onOpenMateria,
}: {
  carrera: { name: string; icon?: string; color: string }
  materias: Materia[]
  onOpenMateria: (id: string) => void
}) {
  const maps = useConceptStore((s) => s.maps)
  const getMap = (id: string) => maps.find((m) => m.materiaId === id) ?? null

  const layout = useMemo(
    () => buildLayout(carrera, materias, getMap),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [carrera.name, carrera.color, carrera.icon, materias, maps],
  )

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [pan, setPan] = useState({ x: 40, y: 20 })
  const [zoom, setZoom] = useState(0.7)
  const zoomRef = useRef(zoom); useEffect(() => { zoomRef.current = zoom }, [zoom])
  const panRef = useRef(pan); useEffect(() => { panRef.current = pan }, [pan])
  const [openAuthor, setOpenAuthor] = useState<string | null>(null)

  // Pan arrastrando el lienzo.
  const dragRef = useRef<{ px: number; py: number; sx: number; sy: number } | null>(null)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current; if (!d) return
      setPan({ x: d.sx + (e.clientX - d.px), y: d.sy + (e.clientY - d.py) })
    }
    const onUp = () => { dragRef.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [])

  // Wheel zoom anclado al cursor.
  useEffect(() => {
    const el = canvasRef.current; if (!el) return
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
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.canvasbg) return
    setOpenAuthor(null)
    dragRef.current = { px: e.clientX, py: e.clientY, sx: pan.x, sy: pan.y }
  }

  const fit = () => { setPan({ x: 40, y: 20 }); setZoom(0.7) }

  return (
    <div
      ref={canvasRef}
      onPointerDown={onCanvasPointerDown}
      className="relative rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing h-[calc(100vh-260px)] min-h-[480px]"
      style={{
        border: '1px solid rgba(255,255,255,0.08)', background: 'var(--card-bg)',
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)',
        backgroundSize: '26px 26px', backgroundPosition: `${pan.x % 26}px ${pan.y % 26}px`,
        touchAction: 'none',
      }}
    >
      {/* Marca de fondo para capturar el pan aunque el click caiga en el SVG. */}
      <div data-canvasbg className="absolute inset-0" />

      {/* Toolbar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-zinc-900/95 backdrop-blur border border-zinc-800 rounded-xl p-1 shadow-2xl">
        <span className="text-[11px] font-semibold text-zinc-300 px-2">Carrera · vista de conceptos</span>
        <button onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z / 1.25))} className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 px-2 py-1 rounded-md text-xs">–</button>
        <span className="text-[10px] font-mono tabular-nums text-zinc-300 min-w-[34px] text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z * 1.25))} className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 px-2 py-1 rounded-md text-xs">+</button>
        <button onClick={fit} className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 px-2 py-1 rounded-md text-[11px]">Reset</button>
      </div>

      {/* Contenido transformado */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, transformOrigin: '0 0', transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        {/* Flechas */}
        <svg width={layout.width} height={layout.height} className="absolute top-0 left-0 pointer-events-none overflow-visible">
          <defs>
            <marker id="cc-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 Z" fill="currentColor" />
            </marker>
          </defs>
          {layout.edges.map((e) => {
            const midX = (e.x1 + e.x2) / 2
            const d = `M ${e.x1} ${e.y1} C ${midX} ${e.y1}, ${midX} ${e.y2}, ${e.x2} ${e.y2}`
            return (
              <path key={e.id} d={d} fill="none" stroke={e.color}
                strokeWidth={e.kind === 'autor' ? 1.2 : 1.8}
                strokeOpacity={e.kind === 'autor' ? 0.5 : 0.8}
                strokeDasharray={e.kind === 'autor' ? '4 3' : undefined}
                markerEnd="url(#cc-arrow)"
                style={{ color: e.color }} />
            )
          })}
        </svg>

        {/* Nodos */}
        {layout.nodes.map((n) => (
          <MapNode key={n.id} n={n}
            open={openAuthor === n.id}
            onToggle={() => n.kind === 'autor' ? setOpenAuthor((id) => id === n.id ? null : n.id) : undefined}
            onOpenMateria={n.kind === 'materia' ? () => onOpenMateria(n.id.slice(2)) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

function MapNode({ n, open, onToggle, onOpenMateria }: {
  n: LNode; open: boolean; onToggle?: () => void; onOpenMateria?: () => void
}) {
  const stop = (e: React.PointerEvent) => e.stopPropagation()
  const isCarrera = n.kind === 'carrera'
  const isMateria = n.kind === 'materia'
  const isAutor = n.kind === 'autor'
  const Icon = isCarrera ? GraduationCap : isMateria ? BookOpen : isAutor ? User : Tag

  return (
    <div
      onPointerDown={stop}
      onClick={() => { onToggle?.(); onOpenMateria?.() }}
      className={`absolute rounded-xl ${(isAutor || isMateria) ? 'cursor-pointer' : ''}`}
      style={{
        left: n.x, top: n.y, width: n.w,
        background: isCarrera ? `${n.color}20` : 'var(--surface-popover)',
        border: `1px solid ${n.color}${isCarrera ? 'aa' : '66'}`,
        boxShadow: isCarrera ? `0 0 0 1px ${n.color}44, 0 12px 32px -12px ${n.color}aa` : `0 4px 16px -8px ${n.color}55`,
      }}
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        {isAutor ? (
          <span className="mt-0.5 w-6 h-6 rounded-full shrink-0 flex items-center justify-center" style={{ background: `${n.color}22`, border: `1px solid ${n.color}55` }}>
            <User className="w-3 h-3" style={{ color: n.color }} />
          </span>
        ) : n.kind === 'concepto' && n.studied ? (
          <span className="mt-0.5 w-3.5 h-3.5 rounded-full shrink-0 bg-emerald-500" title="Estudiado" />
        ) : (
          <Icon className={`${isCarrera ? 'w-5 h-5' : 'w-4 h-4'} shrink-0 mt-0.5`} style={{ color: n.color }} />
        )}
        <div className="min-w-0 flex-1">
          <p className={`font-semibold leading-snug break-words ${isCarrera ? 'text-[15px] text-white' : 'text-[13px]'} ${n.kind === 'concepto' && n.studied ? 'text-zinc-400' : 'text-white'}`}>
            {n.label}
          </p>
          {n.sublabel && (
            <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{n.sublabel}</p>
          )}
          {isAutor && open && n.body && (
            <p className="text-[12px] text-zinc-300 leading-relaxed mt-1.5 whitespace-pre-wrap border-t border-white/[0.08] pt-1.5">{n.body}</p>
          )}
          {isAutor && !open && n.body && (
            <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1">{n.body}</p>
          )}
        </div>
      </div>
    </div>
  )
}
