'use client'
import { useState, useRef, useEffect } from 'react'
import { Trash2, Palette, Plus, X, Hand, MousePointer2, Minus, Spline, CornerDownRight } from 'lucide-react'
import {
  useMindMapStore, NODE_PALETTE,
  type MindMapNode, type MindMapEdgeShape,
} from '@/lib/store/mindmapStore'
import {
  buildEdgePath, computeEdgeEndpoints, computeDrawingEndpoints, computeEdgeBreakpoints,
} from './edgeGeometry'

const DEFAULT_NODE_COLOR = '#6366f1'

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

  const canvasRef = useRef<HTMLDivElement | null>(null)

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
  // that node.x/y live in — i.e. canvas-local minus the pan offset).
  const screenToContent = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: clientX - rect.left - pan.x,
      y: clientY - rect.top - pan.y,
    }
  }

  // ── Empty-canvas pointer-down ──
  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return
    setSelection(null)
    if (drawingFromId) {
      // Clicked empty space while drawing → cancel.
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

  // ── Robust pointer-capture node drag with movement threshold ──
  // Click vs drag distinguished by 4px hysteresis.
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
      if (!hasMoved && Math.hypot(dx, dy) < 4) return
      hasMoved = true
      updateNode(mapId, node.id, { x: startNodeX + dx, y: startNodeY + dy })
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
        onResetPan={() => setPan({ x: 0, y: 0 })}
      />

      {/* Drawing mode banner */}
      {drawingFromId && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2">
          <CornerDownRight className="w-3 h-3" />
          Tocá el nodo destino para crear la flecha
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
          <g transform={`translate(${pan.x} ${pan.y})`}>
            {map.edges.map((edge) => {
              const fromNode = map.nodes.find((n) => n.id === edge.fromNodeId)
              const toNode = map.nodes.find((n) => n.id === edge.toNodeId)
              if (!fromNode || !toNode) return null
              const isSelected = selection?.kind === 'edge' && selection.id === edge.id
              const shape = edge.shape ?? 'straight'
              const { start, end } = computeEdgeEndpoints(fromNode, toNode)
              const path = buildEdgePath(start, end, shape)
              const breakpoints = isSelected ? computeEdgeBreakpoints(start, end, shape) : []
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
                  {/* Break-point markers (visible only when selected) */}
                  {breakpoints.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x} cy={p.y} r={4}
                      fill="#a78bfa" stroke="#0a0a0b" strokeWidth={1.5}
                      className="pointer-events-none"
                    />
                  ))}
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

        {/* Nodes layer — absolute positioned divs on top of the SVG */}
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
              pan={pan}
              selected={isSelected}
              drawingMode={drawingFromId !== null}
              editing={editingNodeId === node.id}
              showPlus={showPlus}
              onPointerDown={(e) => startNodeDrag(e, node)}
              onClick={() => handleNodeClick(node.id)}
              onDoubleClick={() => {
                setEditingNodeId(node.id)
                setSelection({ kind: 'node', id: node.id })
              }}
              onTextChange={(text) => updateNode(mapId, node.id, { text })}
              onEndEdit={() => setEditingNodeId(null)}
              onHover={(hover) => setHoveredNodeId(hover ? node.id : (h) => (h === node.id ? null : h) as null)}
              onStartConnect={() => startDrawingFrom(node)}
            />
          )
        })}

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
  onChangeNodeColor, onChangeEdgeShape, onDeleteSelection, onAddNode, onResetPan,
}: {
  selectedNode: MindMapNode | null
  selectedEdge: { id: string; shape?: MindMapEdgeShape } | null
  onChangeNodeColor: (color: string) => void
  onChangeEdgeShape: (shape: MindMapEdgeShape) => void
  onDeleteSelection: () => void
  onAddNode: () => void
  onResetPan: () => void
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
        title="Centrar vista"
        className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 active:bg-zinc-800 p-1.5 rounded-lg transition-colors"
      >
        <Hand className="w-3.5 h-3.5" />
      </button>

      {/* Selection-dependent actions */}
      {(selectedNode || selectedEdge) && (
        <>
          <div className="w-px h-5 bg-zinc-800 mx-1" />
          {selectedNode && (
            <ColorPickerInline
              currentColor={selectedNode.color ?? DEFAULT_NODE_COLOR}
              onChange={onChangeNodeColor}
            />
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
  onPointerDown, onClick, onDoubleClick, onTextChange, onEndEdit,
  onHover, onStartConnect,
}: {
  node: MindMapNode
  pan: { x: number; y: number }
  selected: boolean
  drawingMode: boolean
  editing: boolean
  showPlus: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onClick: () => void
  onDoubleClick: () => void
  onTextChange: (text: string) => void
  onEndEdit: () => void
  onHover: (hover: boolean) => void
  onStartConnect: () => void
}) {
  const color = node.color ?? DEFAULT_NODE_COLOR
  const borderColor = selected ? color : color + '70'

  const [draft, setDraft] = useState(node.text)
  useEffect(() => { setDraft(node.text) }, [node.text, editing])

  return (
    <>
      <div
        onPointerDown={onPointerDown}
        onClick={(e) => { e.stopPropagation(); onClick() }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick() }}
        onPointerEnter={() => onHover(true)}
        onPointerLeave={() => onHover(false)}
        className="absolute rounded-2xl border-2 shadow-lg transition-shadow"
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
            autoFocus
            value={draft}
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
            className="w-full h-full bg-transparent text-sm text-zinc-100 font-medium text-center p-2 focus:outline-none resize-none leading-snug"
            style={{ color }}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-center px-2 text-sm font-medium leading-snug select-none break-words"
            style={{ color }}
          >
            {node.text || <span className="opacity-50 italic">(vacío)</span>}
          </div>
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
          }}
          title="Crear flecha desde este nodo"
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
