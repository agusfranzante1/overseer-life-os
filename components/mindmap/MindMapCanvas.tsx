'use client'
import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { Trash2, Palette, Plus, X, Hand, MousePointer2, Minus, Spline, CornerDownRight, ZoomIn, ZoomOut, Square, Circle, Type, Copy } from 'lucide-react'
import {
  useMindMapStore, NODE_PALETTE,
  type MindMapNode, type MindMapEdgeShape, type MindMapNodeShape,
} from '@/lib/store/mindmapStore'
import {
  buildEdgePath, computeEdgeEndpoints, computeDrawingEndpoints, computeEdgeBreakpoints,
} from './edgeGeometry'

const DEFAULT_NODE_COLOR = '#6366f1'
const DEFAULT_FONT_SIZE = 14
/** Discrete font-size steps for the picker. Covers small "label" text up to
 *  a big section header. Keep the list short — fewer choices = faster decisions. */
const FONT_SIZE_STEPS = [10, 12, 14, 16, 20, 24, 32] as const
/** Padding around the text inside a node, in CSS pixels. Used by the
 *  auto-grow logic to compute the minimum node height that still fits the
 *  textarea's content + breathing room. */
const NODE_TEXT_PADDING_Y = 16   // 8px top + 8px bottom
const NODE_TEXT_PADDING_X = 16
/** Minimum dimensions enforced by the resize handle. Nodes smaller than
 *  this are unreadable and tend to be unselectable on touch. */
const NODE_MIN_WIDTH = 80
const NODE_MIN_HEIGHT = 48

/** Full mind-map editor for a single map.
 *
 *  Connection flow (NEW):
 *   - Hover over a node (or select it on touch) → "+" handle appears below it
 *   - Click "+" → enters drawing mode, ghost arrow follows the cursor
 *   - Click another node → edge created
 *   - Click empty canvas or press Escape → cancel drawing
 *
 *  Edge shapes:
 *   - Select an edge → toolbar shows 3 shape buttons
 *   - straight | curved | orthogonal
 *   - Break points render as small circles on the selected edge */
export function MindMapCanvas({ mapId }: { mapId: string }) {
  const map = useMindMapStore((s) => s.maps.find((m) => m.id === mapId)) ?? null
  const addNode = useMindMapStore((s) => s.addNode)
  const updateNode = useMindMapStore((s) => s.updateNode)
  const removeNode = useMindMapStore((s) => s.removeNode)
  const addEdge = useMindMapStore((s) => s.addEdge)
  const removeEdge = useMindMapStore((s) => s.removeEdge)
  const setEdgeShape = useMindMapStore((s) => s.setEdgeShape)
  const setEdgeBend = useMindMapStore((s) => s.setEdgeBend)
  const setNodeShape = useMindMapStore((s) => s.setNodeShape)
  const setNodeFontSize = useMindMapStore((s) => s.setNodeFontSize)
  const duplicateNode = useMindMapStore((s) => s.duplicateNode)

  // Selection — either a node or an edge.
  const [selection, setSelection] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  // Hover (one node at a time) — drives the "+" connector affordance.
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  // Drawing mode: an in-progress edge that follows the cursor. While
  // `drawingFromId` is non-null, the canvas tracks the cursor position
  // and renders a "ghost" arrow from the source node's border to the
  // cursor. The drawing ends when the user clicks another node (commit)
  // or the empty canvas / presses Escape (cancel).
  const [drawingFromId, setDrawingFromId] = useState<string | null>(null)
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)

  // Canvas pan offset — moves all nodes by this amount when rendering.
  const [pan, setPan] = useState({ x: 0, y: 0 })
  // Zoom factor — 1.0 = native, capped to a sensible range so you can't
  // accidentally wheel the content into a black hole or 50x size.
  const [zoom, setZoom] = useState(1)
  const ZOOM_MIN = 0.25
  const ZOOM_MAX = 3

  const canvasRef = useRef<HTMLDivElement | null>(null)

  // Refs that mirror zoom/pan so non-React handlers (the wheel listener,
  // node-drag move handler) read the LATEST values without needing to be
  // re-attached on every state change.
  const zoomRef = useRef(zoom)
  const panRef = useRef(pan)
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { panRef.current = pan }, [pan])

  // ─── Pan via dragging the empty canvas ──
  const dragPanRef = useRef<{
    pointerStartX: number
    pointerStartY: number
    panStartX: number
    panStartY: number
  } | null>(null)

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (dragPanRef.current) {
        const d = dragPanRef.current
        setPan({
          x: d.panStartX + (e.clientX - d.pointerStartX),
          y: d.panStartY + (e.clientY - d.pointerStartY),
        })
      }
    }
    const onUp = () => { dragPanRef.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  // ─── Wheel zoom ────────────────────────────────────────────────────
  // Attached as a NON-PASSIVE native listener so we can preventDefault and
  // stop the page from scrolling. React's synthetic wheel events are
  // passive-by-default in modern versions, so the only reliable way to
  // suppress the default is the native API.
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      // Cursor position relative to the canvas top-left, in SCREEN pixels.
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      // Exponential zoom step → feels smoother than linear at any scale.
      // Trackpad pinches send tiny deltas, mouse wheels send larger ones —
      // we scale the factor with the delta magnitude so both feel right.
      const intensity = Math.min(0.2, Math.abs(e.deltaY) * 0.0015)
      const factor = e.deltaY < 0 ? 1 + intensity : 1 / (1 + intensity)
      const oldZoom = zoomRef.current
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, oldZoom * factor))
      if (newZoom === oldZoom) return
      // Zoom-to-cursor: keep the content point under the cursor anchored
      // by re-deriving pan from the new zoom level.
      //   sx = panX + cx * zoom  →  cx = (sx - panX) / zoom
      //   After zoom: sx = newPanX + cx * newZoom
      //   ⇒ newPanX = sx - (sx - panX) * (newZoom / oldZoom)
      const ratio = newZoom / oldZoom
      const oldPan = panRef.current
      setPan({
        x: sx - (sx - oldPan.x) * ratio,
        y: sy - (sy - oldPan.y) * ratio,
      })
      setZoom(newZoom)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // Delete-key shortcut (when there's a selection AND we're not editing text).
  // Also doubles as the Escape handler for drawing mode.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.key === 'Escape') {
        if (drawingFromId) {
          setDrawingFromId(null)
          setCursorPos(null)
          return
        }
        setSelection(null)
        return
      }
      if (!selection) return
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      e.preventDefault()
      if (selection.kind === 'node') removeNode(mapId, selection.id)
      else removeEdge(mapId, selection.id)
      setSelection(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selection, drawingFromId, mapId, removeNode, removeEdge])

  // Convert a screen-space pointer event into CONTENT coords (the same space
  // that node.x/y live in — i.e. canvas-local, minus pan, divided by zoom).
  // Formula reverses the visual transform `translate(pan) scale(zoom)`:
  //   screen = pan + content * zoom  →  content = (screen - pan) / zoom
  const screenToContent = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    }
  }

  // ── Empty-canvas pointer-down ──
  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return
    setSelection(null)
    if (drawingFromId) {
      // Drawing + click en lienzo vacío → CREAR un nodo nuevo donde se
      // hizo click y conectarlo automáticamente desde el origen. Antes
      // este branch cancelaba el drawing, lo cual era confuso porque el
      // affordance natural es "tap acá y aparece la otra punta de la
      // flecha". Para cancelar el drawing seguís teniendo Escape.
      const p = screenToContent(e.clientX, e.clientY)
      if (p) {
        const newId = addNode(mapId, { x: p.x - 80, y: p.y - 32 })
        if (newId) {
          addEdge(mapId, drawingFromId, newId)
          setSelection({ kind: 'node', id: newId })
          setEditingNodeId(newId)
        }
      }
      setDrawingFromId(null)
      setCursorPos(null)
      return
    }
    dragPanRef.current = {
      pointerStartX: e.clientX, pointerStartY: e.clientY,
      panStartX: pan.x, panStartY: pan.y,
    }
  }

  // ── Mouse move on the canvas — track cursor for the ghost edge ──
  const onCanvasPointerMove = (e: React.PointerEvent) => {
    if (!drawingFromId) return
    const p = screenToContent(e.clientX, e.clientY)
    if (p) setCursorPos(p)
  }

  // ── Double-click empty canvas → create node ──
  const onCanvasDoubleClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return
    const p = screenToContent(e.clientX, e.clientY)
    if (!p) return
    const id = addNode(mapId, { x: p.x - 80, y: p.y - 32 })
    setSelection({ kind: 'node', id })
    setEditingNodeId(id)
  }

  // ── Click on a node ──
  // If drawing → commit edge. Else → just select (drag is also handled).
  const handleNodeClick = (nodeId: string) => {
    if (drawingFromId) {
      if (drawingFromId !== nodeId) {
        addEdge(mapId, drawingFromId, nodeId)
      }
      setDrawingFromId(null)
      setCursorPos(null)
      return
    }
    setSelection({ kind: 'node', id: nodeId })
  }

  // ── Click the "+" handle below a hovered/selected node → start drawing ──
  const startDrawingFrom = (node: MindMapNode) => {
    setSelection(null)
    setDrawingFromId(node.id)
    // Seed cursor at the node's bottom-center so the ghost line doesn't
    // jump from (0,0) until the user moves the mouse.
    setCursorPos({
      x: node.x + node.width / 2,
      y: node.y + node.height + 12,
    })
  }

  // ── Cursor reporting from the "+" pointer-capture drag ──
  // While the user holds the `+` and drags, pointer events are captured
  // by the button (not the canvas), so the canvas's own pointermove
  // doesn't fire. The NodeBox forwards client coords here so the ghost
  // arrow can keep tracking the cursor.
  const handleConnectorMove = (clientX: number, clientY: number) => {
    const p = screenToContent(clientX, clientY)
    if (p) setCursorPos(p)
  }

  // ── Release of the "+" drag → commit ──
  //
  //   - Released over an existing node (≠ source) → create an edge
  //   - Released on empty canvas → create a NEW node at the cursor and
  //     auto-connect it from the source. Open the new node for editing
  //     so the user can immediately type its label.
  //   - Released on the source itself or elsewhere weird → cancel.
  const handleConnectorDrop = (sourceNodeId: string, clientX: number, clientY: number) => {
    // Figure out what's under the cursor at release time. Looking up via
    // `elementFromPoint` is robust to nested transforms/zoom — the browser
    // does the inverse geometry for us.
    const targetEl = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    const nodeEl = targetEl?.closest?.('[data-node-id]') as HTMLElement | null
    const droppedNodeId = nodeEl?.getAttribute('data-node-id') ?? null

    if (droppedNodeId && droppedNodeId !== sourceNodeId) {
      addEdge(mapId, sourceNodeId, droppedNodeId)
    } else if (!droppedNodeId) {
      // Empty canvas → create a fresh node centered on the cursor and
      // auto-connect. Open it for editing so the next thing the user does
      // is type its label (no extra click needed).
      const p = screenToContent(clientX, clientY)
      if (p) {
        const newId = addNode(mapId, { x: p.x - 80, y: p.y - 32 })
        if (newId) {
          addEdge(mapId, sourceNodeId, newId)
          setSelection({ kind: 'node', id: newId })
          setEditingNodeId(newId)
        }
      }
    }
    setDrawingFromId(null)
    setCursorPos(null)
  }

  /** Drag de un breakpoint para mover el bend de una edge. Soportado para
   *  shape 'straight' y 'curved' — en 'orthogonal' los breakpoints son
   *  esquinas calculadas y no tiene sentido pisarlas con un waypoint
   *  arbitrario. El bend se guarda en CONTENT COORDS y se persiste solo
   *  al pointer-up para no spamear el store en cada pixel. */
  const startBendDrag = (e: React.PointerEvent, edgeId: string) => {
    e.stopPropagation()
    e.preventDefault()
    setSelection({ kind: 'edge', id: edgeId })
    const pointerId = e.pointerId
    const el = e.currentTarget as SVGElement
    try { el.setPointerCapture(pointerId) } catch { /* noop */ }

    const apply = (ev: PointerEvent) => {
      const p = screenToContent(ev.clientX, ev.clientY)
      if (p) setEdgeBend(mapId, edgeId, p)
    }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      apply(ev)
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      try { el.releasePointerCapture(pointerId) } catch { /* noop */ }
      apply(ev)  // commit final position
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
  }

  // ── Robust pointer-capture node drag with movement threshold ──
  // Click vs drag distinguished by 4px hysteresis.
  /** Drag the bottom-right resize handle of a node. Updates width/height
   *  live as the pointer moves. For circle-shaped nodes we lock the
   *  aspect ratio to 1:1 by averaging the deltas — otherwise resizing
   *  would turn the circle into an ellipse. */
  const startNodeResize = (e: React.PointerEvent, node: MindMapNode) => {
    e.stopPropagation()
    e.preventDefault()
    setSelection({ kind: 'node', id: node.id })

    const startClientX = e.clientX
    const startClientY = e.clientY
    const startW = node.width
    const startH = node.height
    const isCircle = node.shape === 'circle'
    const pointerId = e.pointerId
    const el = e.currentTarget as HTMLElement

    try { el.setPointerCapture(pointerId) } catch { /* noop */ }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const z = zoomRef.current
      const dx = (ev.clientX - startClientX) / z
      const dy = (ev.clientY - startClientY) / z
      if (isCircle) {
        // Lock to square: use the average of dx/dy so diagonal drags feel
        // natural. Could use Math.max for "follow the farthest finger";
        // average just feels less twitchy in practice.
        const delta = (dx + dy) / 2
        const size = Math.max(NODE_MIN_WIDTH, Math.max(NODE_MIN_HEIGHT, startW + delta))
        updateNode(mapId, node.id, { width: size, height: size })
      } else {
        const w = Math.max(NODE_MIN_WIDTH, startW + dx)
        const h = Math.max(NODE_MIN_HEIGHT, startH + dy)
        updateNode(mapId, node.id, { width: w, height: h })
      }
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      try { el.releasePointerCapture(pointerId) } catch { /* noop */ }
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
  }

  const startNodeDrag = (e: React.PointerEvent, node: MindMapNode) => {
    e.stopPropagation()
    if (drawingFromId) {
      // While drawing, treat tap on node as "commit edge" instead of drag.
      handleNodeClick(node.id)
      return
    }
    setSelection({ kind: 'node', id: node.id })

    const startClientX = e.clientX
    const startClientY = e.clientY
    const startNodeX = node.x
    const startNodeY = node.y
    const pointerId = e.pointerId
    const el = e.currentTarget as HTMLElement
    let hasMoved = false

    try { el.setPointerCapture(pointerId) } catch { /* noop */ }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const dx = ev.clientX - startClientX
      const dy = ev.clientY - startClientY
      // Still measure the click-vs-drag threshold in SCREEN pixels (4px feels
      // the same regardless of zoom). But translate the actual node delta
      // into CONTENT pixels by dividing by current zoom — otherwise dragging
      // a node 100 screen-px right while zoomed 2x would move it 100 in
      // content coords (which is 50 visual px), feeling sluggish.
      if (!hasMoved && Math.hypot(dx, dy) < 4) return
      hasMoved = true
      const z = zoomRef.current
      updateNode(mapId, node.id, { x: startNodeX + dx / z, y: startNodeY + dy / z })
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      try { el.releasePointerCapture(pointerId) } catch { /* noop */ }
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
  }

  if (!map) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-zinc-500">
        Mapa no encontrado.
      </div>
    )
  }

  const selectedEdge = selection?.kind === 'edge'
    ? map.edges.find((e) => e.id === selection.id) ?? null
    : null
  const selectedNode = selection?.kind === 'node'
    ? map.nodes.find((n) => n.id === selection.id) ?? null
    : null

  return (
    <div className="relative h-full bg-zinc-950 flex flex-col">
      {/* Toolbar */}
      <Toolbar
        selectedNode={selectedNode}
        selectedEdge={selectedEdge}
        onChangeNodeColor={(color) => {
          if (selection?.kind === 'node') updateNode(mapId, selection.id, { color })
        }}
        onChangeNodeShape={(shape) => {
          if (selection?.kind === 'node') setNodeShape(mapId, selection.id, shape)
        }}
        onChangeNodeFontSize={(fontSize) => {
          if (selection?.kind === 'node') setNodeFontSize(mapId, selection.id, fontSize)
        }}
        onChangeEdgeShape={(shape) => {
          if (selection?.kind === 'edge') setEdgeShape(mapId, selection.id, shape)
        }}
        onDeleteSelection={() => {
          if (!selection) return
          if (selection.kind === 'node') removeNode(mapId, selection.id)
          else removeEdge(mapId, selection.id)
          setSelection(null)
        }}
        onAddNode={() => {
          const rect = canvasRef.current?.getBoundingClientRect()
          const cx = rect ? rect.width / 2 - pan.x - 80 : 100
          const cy = rect ? rect.height / 2 - pan.y - 32 : 100
          const id = addNode(mapId, { x: cx, y: cy })
          setSelection({ kind: 'node', id })
          setEditingNodeId(id)
        }}
        onResetPan={() => { setPan({ x: 0, y: 0 }); setZoom(1) }}
        zoom={zoom}
        onZoomIn={() => {
          // Step 1.25× clamped — same idea as a discrete wheel tick but
          // centred on the current viewport for the button case (no cursor
          // to anchor to). Re-derives pan so the viewport center stays put.
          const el = canvasRef.current
          if (!el) return
          const rect = el.getBoundingClientRect()
          const sx = rect.width / 2
          const sy = rect.height / 2
          const newZoom = Math.min(ZOOM_MAX, zoom * 1.25)
          if (newZoom === zoom) return
          const ratio = newZoom / zoom
          setPan({ x: sx - (sx - pan.x) * ratio, y: sy - (sy - pan.y) * ratio })
          setZoom(newZoom)
        }}
        onZoomOut={() => {
          const el = canvasRef.current
          if (!el) return
          const rect = el.getBoundingClientRect()
          const sx = rect.width / 2
          const sy = rect.height / 2
          const newZoom = Math.max(ZOOM_MIN, zoom / 1.25)
          if (newZoom === zoom) return
          const ratio = newZoom / zoom
          setPan({ x: sx - (sx - pan.x) * ratio, y: sy - (sy - pan.y) * ratio })
          setZoom(newZoom)
        }}
      />

      {/* Drawing mode banner */}
      {drawingFromId && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2">
          <CornerDownRight className="w-3 h-3" />
          Tocá un nodo destino o el lienzo vacío para crear uno nuevo · Esc cancela
          <button
            onClick={() => { setDrawingFromId(null); setCursorPos(null) }}
            className="ml-2 opacity-60 hover:opacity-100"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onDoubleClick={onCanvasDoubleClick}
        className={`flex-1 relative overflow-hidden select-none ${
          drawingFromId ? 'cursor-crosshair' : dragPanRef.current ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #27272a 1px, transparent 0)',
          backgroundSize: '24px 24px',
          backgroundPosition: `${pan.x % 24}px ${pan.y % 24}px`,
          touchAction: 'none',
        }}
      >
        {/* SVG layer for edges. Lives in CONTENT coords (no pan applied to
            the math); the outer <g> transform applies the pan visually so
            edges follow the nodes when the user pans the canvas. */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ overflow: 'visible' }}
        >
          <defs>
            <marker
              id="mm-arrowhead"
              viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#71717a" />
            </marker>
            <marker
              id="mm-arrowhead-active"
              viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#a78bfa" />
            </marker>
            <marker
              id="mm-arrowhead-ghost"
              viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#fbbf24" />
            </marker>
          </defs>

          {/* All edge geometry is panned via a single transform. */}
          {/* Single transform on the group: translate (pan) + scale (zoom).
              Applied right-to-left (scale first, then translate) which means
              `pan` stays in screen pixels — that's intentional. The pan drag
              handler can keep writing screen pixels directly. */}
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {map.edges.map((edge) => {
              const fromNode = map.nodes.find((n) => n.id === edge.fromNodeId)
              const toNode = map.nodes.find((n) => n.id === edge.toNodeId)
              if (!fromNode || !toNode) return null
              const isSelected = selection?.kind === 'edge' && selection.id === edge.id
              const shape = edge.shape ?? 'straight'
              // Si la edge tiene bend custom, lo usamos para todo: el
              // anclaje de los endpoints (apuntan hacia el bend), el
              // path, y la posición del círculo-handle.
              const { start, end } = computeEdgeEndpoints(fromNode, toNode, edge.bend)
              const path = buildEdgePath(start, end, shape, edge.bend)
              const breakpoints = isSelected ? computeEdgeBreakpoints(start, end, shape, edge.bend) : []
              // Solo el primer breakpoint es draggable como "bend" en
              // straight/curved. Para orthogonal mostramos los corners
              // como visual-only (drag tendría que recalcular corners).
              const supportsBend = shape === 'straight' || shape === 'curved'
              return (
                <g key={edge.id}>
                  {/* Wide invisible hit area for easy clicking */}
                  <path
                    d={path}
                    stroke="transparent" strokeWidth={16}
                    fill="none"
                    className="pointer-events-auto cursor-pointer"
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      setSelection({ kind: 'edge', id: edge.id })
                    }}
                  />
                  {/* Visible stroke */}
                  <path
                    d={path}
                    stroke={isSelected ? '#a78bfa' : '#71717a'}
                    strokeWidth={isSelected ? 2.5 : 1.75}
                    fill="none"
                    markerEnd={isSelected ? 'url(#mm-arrowhead-active)' : 'url(#mm-arrowhead)'}
                    className="pointer-events-none"
                  />
                  {/* Break-point markers — el primero es draggable cuando
                      el shape soporta bend. Cursor "move" + radio mayor
                      como affordance visual. Doble-click resetea el bend
                      al midpoint calculado (limpia el waypoint custom). */}
                  {breakpoints.map((p, i) => {
                    const isDraggable = isSelected && supportsBend && i === 0
                    return (
                      <circle
                        key={i}
                        cx={p.x} cy={p.y}
                        r={isDraggable ? 6 : 4}
                        fill="#a78bfa" stroke="#0a0a0b" strokeWidth={1.5}
                        className={isDraggable ? 'pointer-events-auto cursor-move' : 'pointer-events-none'}
                        style={isDraggable ? { touchAction: 'none' } : undefined}
                        onPointerDown={isDraggable ? (e) => startBendDrag(e, edge.id) : undefined}
                        onDoubleClick={isDraggable ? (e) => {
                          e.stopPropagation()
                          setEdgeBend(mapId, edge.id, undefined)
                        } : undefined}
                      >
                        {isDraggable && (
                          <title>Arrastrá para doblar la flecha · doble-click para resetear</title>
                        )}
                      </circle>
                    )
                  })}
                </g>
              )
            })}

            {/* Ghost edge — the in-progress arrow that follows the cursor */}
            {drawingFromId && cursorPos && (() => {
              const fromNode = map.nodes.find((n) => n.id === drawingFromId)
              if (!fromNode) return null
              const { start, end } = computeDrawingEndpoints(fromNode, cursorPos)
              return (
                <path
                  d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
                  stroke="#fbbf24" strokeWidth={2}
                  strokeDasharray="6 4"
                  fill="none"
                  markerEnd="url(#mm-arrowhead-ghost)"
                  className="pointer-events-none"
                />
              )
            })()}
          </g>
        </svg>

        {/* Nodes layer — wrapped in a CSS-transformed div that mirrors the
            SVG group transform. This way pan + zoom apply uniformly to nodes
            AND edges with a single source of truth, and NodeBox doesn't need
            to know about zoom at all (it positions at raw node.x/y; the
            wrapper handles the visual transform). */}
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0,
            width: 0, height: 0,           // wrapper has no intrinsic size
            transformOrigin: '0 0',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            // No `pointer-events: none` here on purpose — that would cascade
            // to children and make nodes uninteractive. The 0×0 wrapper
            // itself can't catch events (no area), so we just let children
            // catch pointer events normally.
          }}
        >
          {map.nodes.map((node) => {
            const isSelected = selection?.kind === 'node' && selection.id === node.id
            const isHovered = hoveredNodeId === node.id
            // Show the "+" handle when hovered OR selected. Hide while editing
            // or while we're already drawing FROM this same node (no point).
            const showPlus = (isHovered || isSelected)
              && editingNodeId !== node.id
              && drawingFromId !== node.id
            return (
              <NodeBox
                key={node.id}
                node={node}
                // pan = 0 because the wrapper above already applies the
                // visual pan/zoom transform — NodeBox can stay zoom-unaware.
                pan={{ x: 0, y: 0 }}
                selected={isSelected}
                drawingMode={drawingFromId !== null}
                editing={editingNodeId === node.id}
                showPlus={showPlus}
                onPointerDown={(e) => startNodeDrag(e, node)}
                onResizeStart={(e) => startNodeResize(e, node)}
                onAutoGrowHeight={(height) => {
                  // Para nodos CIRCLE mantenemos width === height — si
                  // updateáramos solo height, el bounding box quedaría
                  // no-cuadrado y `rounded-full` lo rendería como pill
                  // (lo que el usuario percibe como "se volvió rectángulo").
                  // En ese caso usamos `max(width, height)` para que el
                  // texto siga entrando incluso si quedó más ancho que
                  // alto antes del auto-grow.
                  if (node.shape === 'circle') {
                    const size = Math.max(node.width, height)
                    updateNode(mapId, node.id, { width: size, height: size })
                  } else {
                    updateNode(mapId, node.id, { height })
                  }
                }}
                onDuplicate={() => {
                  const newId = duplicateNode(mapId, node.id)
                  if (newId) setSelection({ kind: 'node', id: newId })
                }}
                onClick={() => handleNodeClick(node.id)}
                onDoubleClick={() => {
                  setEditingNodeId(node.id)
                  setSelection({ kind: 'node', id: node.id })
                }}
                onTextChange={(text) => updateNode(mapId, node.id, { text })}
                onEndEdit={() => setEditingNodeId(null)}
                onHover={(hover) => setHoveredNodeId(hover ? node.id : (h) => (h === node.id ? null : h) as null)}
                onStartConnect={() => startDrawingFrom(node)}
                onConnectorMove={handleConnectorMove}
                onConnectorDrop={(cx, cy) => handleConnectorDrop(node.id, cx, cy)}
              />
            )
          })}
        </div>

        {/* Empty state */}
        {map.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center max-w-sm px-6 py-8 bg-zinc-900/60 border border-dashed border-zinc-700 rounded-2xl">
              <MousePointer2 className="w-7 h-7 text-zinc-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-zinc-300 mb-1">Empezá a diagramar</p>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                <strong>Doble-click</strong> en cualquier parte del lienzo para crear una caja, o
                tocá <strong>&quot;+ Nodo&quot;</strong> arriba.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

function Toolbar({
  selectedNode, selectedEdge,
  onChangeNodeColor, onChangeNodeShape, onChangeNodeFontSize, onChangeEdgeShape, onDeleteSelection, onAddNode, onResetPan,
  zoom, onZoomIn, onZoomOut,
}: {
  selectedNode: MindMapNode | null
  selectedEdge: { id: string; shape?: MindMapEdgeShape } | null
  onChangeNodeColor: (color: string) => void
  onChangeNodeShape: (shape: MindMapNodeShape) => void
  onChangeNodeFontSize: (fontSize: number | undefined) => void
  onChangeEdgeShape: (shape: MindMapEdgeShape) => void
  onDeleteSelection: () => void
  onAddNode: () => void
  onResetPan: () => void
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
}) {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-zinc-900/95 backdrop-blur border border-zinc-800 rounded-xl p-1 shadow-2xl">
      <button
        onClick={onAddNode}
        title="Agregar nodo en el centro"
        className="text-xs text-zinc-300 hover:text-indigo-300 active:bg-zinc-800 px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" /> Nodo
      </button>
      <button
        onClick={onResetPan}
        title="Centrar vista + resetear zoom a 100%"
        className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 active:bg-zinc-800 p-1.5 rounded-lg transition-colors"
      >
        <Hand className="w-3.5 h-3.5" />
      </button>

      {/* Zoom controls — wheel on the canvas also zooms (anchored to cursor),
          these are the explicit buttons for touch/keyboard users. The middle
          chip shows the current zoom % and is clickable to reset to 100%. */}
      <div className="flex items-center gap-0.5 bg-zinc-950/60 border border-zinc-800 rounded-lg p-0.5 ml-1">
        <button
          onClick={onZoomOut}
          title="Alejar"
          className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 active:bg-zinc-800 p-1 rounded-md transition-colors"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onResetPan}
          title="100%"
          className="text-[10px] font-mono tabular-nums text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 active:bg-zinc-800 px-1.5 py-1 rounded-md transition-colors min-w-[36px] text-center"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={onZoomIn}
          title="Acercar"
          className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 active:bg-zinc-800 p-1 rounded-md transition-colors"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Selection-dependent actions */}
      {(selectedNode || selectedEdge) && (
        <>
          <div className="w-px h-5 bg-zinc-800 mx-1" />
          {selectedNode && (
            <>
              <NodeShapePicker
                current={selectedNode.shape ?? 'rect'}
                onChange={onChangeNodeShape}
              />
              <FontSizePicker
                current={selectedNode.fontSize ?? DEFAULT_FONT_SIZE}
                onChange={onChangeNodeFontSize}
              />
              <ColorPickerInline
                currentColor={selectedNode.color ?? DEFAULT_NODE_COLOR}
                onChange={onChangeNodeColor}
              />
            </>
          )}
          {selectedEdge && (
            <EdgeShapePicker
              current={selectedEdge.shape ?? 'straight'}
              onChange={onChangeEdgeShape}
            />
          )}
          <button
            onClick={onDeleteSelection}
            title="Borrar selección (o Delete)"
            className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 p-1.5 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  )
}

function ColorPickerInline({ currentColor, onChange }: { currentColor: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Cambiar color"
        className="p-1.5 rounded-lg hover:bg-zinc-800 active:bg-zinc-800 transition-colors flex items-center justify-center"
      >
        <Palette className="w-3.5 h-3.5" style={{ color: currentColor }} />
      </button>
      {open && (
        <div
          className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-30 p-2 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl flex flex-wrap gap-1.5 max-w-[200px]"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {NODE_PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => { onChange(c); setOpen(false) }}
              className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${currentColor === c ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-900' : ''}`}
              style={{ background: c }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Three buttons to pick the visual shape of the selected edge. Icons mimic
 *  the actual shape so the meaning is obvious at a glance. */
/** Two buttons (Square / Circle) to pick the visual shape of the selected
 *  node. Matches the EdgeShapePicker pattern — small icons sized like the
 *  rest of the toolbar so it fits inline without overflowing. */
function NodeShapePicker({
  current, onChange,
}: { current: MindMapNodeShape; onChange: (s: MindMapNodeShape) => void }) {
  const buttons: { key: MindMapNodeShape; label: string; Icon: typeof Square }[] = [
    { key: 'rect',   label: 'Rectángulo', Icon: Square },
    { key: 'circle', label: 'Círculo',    Icon: Circle },
  ]
  return (
    <div className="flex items-center gap-0.5 bg-zinc-950/60 border border-zinc-800 rounded-lg p-0.5">
      {buttons.map(({ key, label, Icon }) => {
        const active = current === key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            title={label}
            onPointerDown={(e) => e.stopPropagation()}
            className={`px-1.5 py-1 rounded-md transition-colors ${
              active
                ? 'bg-violet-500/25 text-violet-200'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        )
      })}
    </div>
  )
}

/** Inline font-size picker — small button shows the current px, click to
 *  reveal a list of discrete sizes. Defaults to the global DEFAULT_FONT_SIZE
 *  (14) when the node has no `fontSize` set yet. */
function FontSizePicker({
  current, onChange,
}: { current: number; onChange: (fontSize: number | undefined) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onPointerDown={(e) => e.stopPropagation()}
        title="Tamaño del texto"
        className="px-1.5 py-1 rounded-md hover:bg-zinc-800 active:bg-zinc-800 transition-colors flex items-center gap-1 text-zinc-300 hover:text-zinc-100"
      >
        <Type className="w-3.5 h-3.5" />
        <span className="text-[10px] font-mono tabular-nums">{current}</span>
      </button>
      {open && (
        <div
          className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-30 p-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl flex flex-col gap-0.5 min-w-[60px]"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {FONT_SIZE_STEPS.map((size) => {
            const active = size === current
            return (
              <button
                key={size}
                onClick={() => {
                  // If user picks the default, store `undefined` so back-compat
                  // nodes (no field) and explicitly-defaulted nodes look the
                  // same in the JSON and in render.
                  onChange(size === DEFAULT_FONT_SIZE ? undefined : size)
                  setOpen(false)
                }}
                className={`px-2 py-1 rounded-md text-left transition-colors ${
                  active ? 'bg-violet-500/25 text-violet-200' : 'text-zinc-300 hover:bg-zinc-800'
                }`}
                style={{ fontSize: Math.min(size, 18) }}
              >
                {size}px
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EdgeShapePicker({
  current, onChange,
}: { current: MindMapEdgeShape; onChange: (s: MindMapEdgeShape) => void }) {
  const buttons: { key: MindMapEdgeShape; label: string; Icon: typeof Minus }[] = [
    { key: 'straight',   label: 'Recta',      Icon: Minus },
    { key: 'curved',     label: 'Redondeada', Icon: Spline },
    { key: 'orthogonal', label: 'Quebrada',   Icon: CornerDownRight },
  ]
  return (
    <div className="flex items-center gap-0.5 bg-zinc-950/60 border border-zinc-800 rounded-lg p-0.5">
      {buttons.map(({ key, label, Icon }) => {
        const active = current === key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            title={label}
            onPointerDown={(e) => e.stopPropagation()}
            className={`px-1.5 py-1 rounded-md transition-colors ${
              active
                ? 'bg-violet-500/25 text-violet-200'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        )
      })}
    </div>
  )
}

// ─── Node ────────────────────────────────────────────────────────────────────

function NodeBox({
  node, pan, selected, drawingMode, editing, showPlus,
  onPointerDown, onResizeStart, onAutoGrowHeight, onDuplicate, onClick, onDoubleClick, onTextChange, onEndEdit,
  onHover, onStartConnect, onConnectorMove, onConnectorDrop,
}: {
  node: MindMapNode
  pan: { x: number; y: number }
  selected: boolean
  drawingMode: boolean
  editing: boolean
  showPlus: boolean
  onPointerDown: (e: React.PointerEvent) => void
  /** Fired when the user grabs the bottom-right corner handle to resize.
   *  The parent owns the pointer-capture + delta math; this just kicks it off. */
  onResizeStart: (e: React.PointerEvent) => void
  /** Fired while editing when the textarea's content grows past the current
   *  height. Parent persists the new height to the store. */
  onAutoGrowHeight: (height: number) => void
  /** Fired when the user clicks the "duplicar" button (top-right on hover).
   *  Parent creates a copy of this node and selects the new one. */
  onDuplicate: () => void
  onClick: () => void
  onDoubleClick: () => void
  onTextChange: (text: string) => void
  onEndEdit: () => void
  onHover: (hover: boolean) => void
  onStartConnect: () => void
  /** Fired while the user holds the "+" handle and drags. Used by the
   *  parent to update the ghost-edge cursor position (we report client
   *  coords; the parent converts to content coords via screenToContent). */
  onConnectorMove: (clientX: number, clientY: number) => void
  /** Fired when the user RELEASES the "+" drag. The parent decides
   *  whether to wire to an existing node or spawn a fresh one. */
  onConnectorDrop: (clientX: number, clientY: number) => void
}) {
  const color = node.color ?? DEFAULT_NODE_COLOR
  const borderColor = selected ? color : color + '70'
  const fontSize = node.fontSize ?? DEFAULT_FONT_SIZE

  const [draft, setDraft] = useState(node.text)
  useEffect(() => { setDraft(node.text) }, [node.text, editing])

  // Auto-fit height: la altura del nodo SIGUE al contenido — crece al
  // tipear, decrece al borrar. Antes solo crecía (la idea original era
  // "recordar el tamaño que le diste"), pero el usuario prefiere que
  // sea estricto: caja ajustada al texto, ni más ni menos.
  //
  // El truco para auto-fit funcional en un textarea con `h-full`: ANTES
  // de leer `scrollHeight`, resetear `style.height = 'auto'`. Sin ese
  // reset, scrollHeight = altura actual del box (= node.height), no la
  // altura natural del contenido → en delete nunca decrece.
  //
  // Importante: `node.height` NO está en el dep array. El effect SETEA
  // height — depender de él re-dispararía el effect tras cada update y
  // (en el view-mode path) entraría en loop infinito.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const onAutoGrowHeightRef = useRef(onAutoGrowHeight)
  useEffect(() => { onAutoGrowHeightRef.current = onAutoGrowHeight }, [onAutoGrowHeight])

  useLayoutEffect(() => {
    if (!editing) return
    const ta = textareaRef.current
    if (!ta) return
    // 1) Reset → scrollHeight reporta la altura natural (no la del box).
    const previousHeight = ta.style.height
    ta.style.height = 'auto'
    // 2) scrollHeight INCLUYE el padding del textarea (`p-2` = 16px total
    //    vertical) — no sumamos nada extra. Sumar padding adicional acá
    //    era lo que hacía la caja crecer ~16px en CADA cambio.
    const needed = Math.max(NODE_MIN_HEIGHT, ta.scrollHeight)
    // 3) Restaurar el inline style (vacío → vuelve a CSS `h-full`).
    ta.style.height = previousHeight
    // Sync up-and-down. `!==` en vez de `>` para que también achique
    // cuando el usuario borra texto.
    if (needed !== node.height) onAutoGrowHeightRef.current(needed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, editing, fontSize, node.width])

  // Auto-fit (view-mode): si el texto cambia fuera del modo edit (cambio
  // de fontSize desde la toolbar, importación, etc.), también ajustamos.
  // Medimos el inner wrapper que tiene altura natural (NO el outer
  // h-full, que devolvería siempre la altura actual del box).
  const viewMeasureRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    if (editing) return
    const el = viewMeasureRef.current
    if (!el) return
    const needed = Math.max(NODE_MIN_HEIGHT, el.scrollHeight + NODE_TEXT_PADDING_Y)
    if (needed !== node.height) onAutoGrowHeightRef.current(needed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.text, fontSize, node.width, editing])

  return (
    <>
      <div
        // Used by the drag-to-create-node flow on the `+` handle to detect
        // what node (if any) the user released the pointer over.
        data-node-id={node.id}
        onPointerDown={onPointerDown}
        onClick={(e) => { e.stopPropagation(); onClick() }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick() }}
        onPointerEnter={() => onHover(true)}
        onPointerLeave={() => onHover(false)}
        className={`absolute border-2 shadow-lg transition-shadow ${
          node.shape === 'circle' ? 'rounded-full' : 'rounded-2xl'
        }`}
        style={{
          left: node.x + pan.x,
          top: node.y + pan.y,
          width: node.width,
          height: node.height,
          background: color + '18',
          borderColor,
          boxShadow: selected
            ? `0 0 0 3px ${color}40, 0 10px 24px -10px ${color}80`
            : `0 4px 14px -4px ${color}40`,
          cursor: drawingMode ? 'crosshair' : editing ? 'text' : 'move',
          touchAction: 'none',
        }}
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            autoFocus
            value={draft}
            placeholder="Idea"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { onTextChange(draft); onEndEdit() }}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') { setDraft(node.text); onEndEdit() }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onTextChange(draft)
                onEndEdit()
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="w-full h-full bg-transparent text-zinc-100 font-medium text-center p-2 focus:outline-none resize-none leading-snug placeholder:opacity-40 placeholder:italic"
            style={{ color, fontSize }}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-center px-2 font-medium leading-snug select-none break-words"
            style={{ color, fontSize }}
          >
            {/* Inner wrapper with NATURAL height — this is the element the
                auto-grow effect measures. The outer flex container is h-full
                (= node.height), so measuring it would just echo back the
                current node height and loop forever. The inner div sits at
                full width but only as tall as the text needs to be, so
                `scrollHeight` returns the true content height. */}
            <div ref={viewMeasureRef} className="w-full">
              {/* Empty-text placeholder. Matches the textarea's placeholder
                  "Idea" so the visual is consistent between view and edit modes. */}
              {node.text || <span className="opacity-40 italic">Idea</span>}
            </div>
          </div>
        )}

        {/* Resize handle — bottom-right corner. Visible only when the node
            is selected and NOT being edited (during edit, the focus is on
            the textarea — a stray pointer-down on the corner would steal
            the blur). For circles, dragging keeps width === height. */}
        {selected && !editing && (
          <div
            onPointerDown={onResizeStart}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            title="Arrastrá para cambiar el tamaño"
            className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 bg-zinc-900 cursor-nwse-resize z-[5]"
            style={{
              borderColor: color,
              touchAction: 'none',
            }}
          />
        )}

        {/* Duplicar — botón chico arriba a la derecha del nodo. Se muestra
            en hover/selected (mismo gate que el "+"). Click → copia todas
            las propiedades visuales del nodo y selecciona la copia. */}
        {showPlus && (
          <button
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault() }}
            onClick={(e) => { e.stopPropagation(); onDuplicate() }}
            onDoubleClick={(e) => e.stopPropagation()}
            title="Duplicar nodo"
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full border-2 bg-zinc-900 flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95 z-[5]"
            style={{ borderColor: color, color, touchAction: 'none' }}
          >
            <Copy className="w-3 h-3" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* "+" connector handle. Floats at the node's bottom-center, OVERLAPPING
          the node's bottom edge (top half is over the node, bottom half pokes
          below). The overlap is intentional: it eliminates the "gap" between
          node and button, so when the cursor moves down to click the +,
          there's no in-between moment where neither element is hovered.
          Without the overlap, the hover state would flicker to null and
          unmount the button before the user could reach it. */}
      {showPlus && (
        <button
          onPointerEnter={() => onHover(true)}
          onPointerLeave={() => onHover(false)}
          onPointerDown={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onStartConnect()

            // ── Drag-to-create flow ──
            // Capture the pointer to THIS button so we keep getting move
            // and up events even when the cursor leaves the button (which
            // it does instantly — the user is dragging out toward another
            // node or empty space).
            //
            // If the user just CLICKS without dragging (no move > 8px),
            // we leave drawing mode active. Then the existing "click on
            // a node to connect" pathway still works — same UX as before.
            // If they DRAG and release, we call onConnectorDrop which
            // either wires to whatever node is under the cursor at release,
            // or creates a fresh node there and auto-connects.
            const pointerId = e.pointerId
            const el = e.currentTarget as HTMLElement
            const startX = e.clientX
            const startY = e.clientY
            let hasDragged = false

            try { el.setPointerCapture(pointerId) } catch { /* noop */ }

            const onMove = (ev: PointerEvent) => {
              if (ev.pointerId !== pointerId) return
              const dx = ev.clientX - startX
              const dy = ev.clientY - startY
              if (Math.hypot(dx, dy) > 8) hasDragged = true
              // Forward cursor coords so the parent can keep the ghost
              // arrow tracking. Without this, the captured pointer events
              // never reach the canvas's own onPointerMove and the ghost
              // would freeze at its initial seed position.
              onConnectorMove(ev.clientX, ev.clientY)
            }
            const onUp = (ev: PointerEvent) => {
              if (ev.pointerId !== pointerId) return
              el.removeEventListener('pointermove', onMove)
              el.removeEventListener('pointerup', onUp)
              el.removeEventListener('pointercancel', onUp)
              try { el.releasePointerCapture(pointerId) } catch { /* noop */ }
              if (hasDragged) onConnectorDrop(ev.clientX, ev.clientY)
              // else: drawing mode stays active for the click-to-connect path
            }
            el.addEventListener('pointermove', onMove)
            el.addEventListener('pointerup', onUp)
            el.addEventListener('pointercancel', onUp)
          }}
          title="Arrastrá hasta otro nodo o al lienzo vacío para crear uno nuevo"
          className="absolute z-10 w-7 h-7 rounded-full border-2 flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95"
          style={{
            left: node.x + pan.x + node.width / 2 - 14,
            // -14 = the button's top is 14px above the node's bottom, so the
            // button straddles the bottom edge (overlap zone, no gap).
            top: node.y + pan.y + node.height - 14,
            background: '#09090b',
            borderColor: color,
            color,
            touchAction: 'none',
          }}
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
        </button>
      )}
    </>
  )
}
