'use client'
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Trash2, Link2, Palette, Plus, X, Hand, MousePointer2 } from 'lucide-react'
import { useMindMapStore, NODE_PALETTE, type MindMapNode } from '@/lib/store/mindmapStore'

const DEFAULT_NODE_COLOR = '#6366f1'

/** The full mind-map editor for a single map. Renders an SVG layer for edges
 *  and absolute-positioned <div>s for nodes. Pan via Hand tool or
 *  empty-canvas drag; zoom not implemented (kept simple).
 *
 *  Interactions:
 *   - Double-click empty canvas → create node at that position
 *   - Single-click on node → select
 *   - Drag on node → move it
 *   - Double-click on node → edit text inline
 *   - "Connect" button → enter connect mode → click 2 nodes → arrow created
 *   - Delete key (when a node/edge is selected) → remove it (with confirm)
 *   - Click on edge → select edge
 */
export function MindMapCanvas({ mapId }: { mapId: string }) {
  const map = useMindMapStore((s) => s.maps.find((m) => m.id === mapId)) ?? null
  const addNode = useMindMapStore((s) => s.addNode)
  const updateNode = useMindMapStore((s) => s.updateNode)
  const removeNode = useMindMapStore((s) => s.removeNode)
  const addEdge = useMindMapStore((s) => s.addEdge)
  const removeEdge = useMindMapStore((s) => s.removeEdge)

  // Selection — either a node or an edge.
  const [selection, setSelection] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  // Connect mode: when active, next two node clicks create an edge between them.
  const [connectMode, setConnectMode] = useState(false)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)

  // Canvas pan offset — moves all nodes by this amount when rendering.
  // Lets the user drag the empty canvas to navigate. Click-and-drag-on-empty
  // pans; click-and-drag-on-node moves the node.
  const [pan, setPan] = useState({ x: 0, y: 0 })

  const canvasRef = useRef<HTMLDivElement | null>(null)

  // ─── Pointer-based pan for the CANVAS ──
  // Uses window-level listeners since the pan affects the whole canvas
  // and we want to keep panning even if the cursor briefly exits the area.
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

  // Delete-key shortcut. Only fires when the user has a selection AND
  // isn't actively editing text in an input/textarea.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selection) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      e.preventDefault()
      if (selection.kind === 'node') {
        removeNode(mapId, selection.id)
      } else {
        removeEdge(mapId, selection.id)
      }
      setSelection(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selection, mapId, removeNode, removeEdge])

  // Empty-canvas pointer-down → start a pan
  const onCanvasPointerDown = (e: React.PointerEvent) => {
    // Only start pan if the user clicked the BACKGROUND, not a node/edge.
    // `currentTarget === target` test is the simplest way to detect that.
    if (e.target !== e.currentTarget) return
    setSelection(null)
    if (connectMode) {
      // While in connect mode, clicking empty cancels.
      setConnectMode(false)
      setConnectFrom(null)
      return
    }
    dragPanRef.current = {
      pointerStartX: e.clientX, pointerStartY: e.clientY,
      panStartX: pan.x, panStartY: pan.y,
    }
  }

  const onCanvasDoubleClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return
    // Convert from screen coords to canvas coords (subtract canvas offset
    // AND the current pan, since nodes are stored without pan applied).
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left - pan.x - 80    // center the new node on cursor (160/2)
    const y = e.clientY - rect.top - pan.y - 32     // (64/2)
    const id = addNode(mapId, { x, y })
    setSelection({ kind: 'node', id })
    setEditingNodeId(id)
  }

  const handleNodeClick = useCallback((nodeId: string) => {
    if (connectMode) {
      if (!connectFrom) {
        setConnectFrom(nodeId)
      } else if (connectFrom !== nodeId) {
        addEdge(mapId, connectFrom, nodeId)
        setConnectMode(false)
        setConnectFrom(null)
      }
      return
    }
    // Selection is already handled in startNodeDrag (pointerdown). The
    // click handler is a safety net for cases where pointerdown didn't
    // fire (rare, e.g. screen readers / keyboard activation).
    setSelection({ kind: 'node', id: nodeId })
  }, [connectMode, connectFrom, addEdge, mapId])

  // Robust per-node drag using setPointerCapture — the canonical browser
  // pattern. The captured pointer keeps emitting move events to the SOURCE
  // element even if the cursor leaves it (which fixes drag breaking on
  // mobile when the finger leaves the rectangle). Also has a 4px movement
  // threshold so a quick tap counts as click (select), not as zero-pixel
  // drag, and so accidental microscopic mouse jitter doesn't move nodes.
  const startNodeDrag = (e: React.PointerEvent, node: MindMapNode) => {
    e.stopPropagation()
    if (connectMode) {
      handleNodeClick(node.id)
      return
    }
    // Always select on pointer-down so the toolbar shows the node's
    // actions immediately (color picker, delete).
    setSelection({ kind: 'node', id: node.id })

    const startClientX = e.clientX
    const startClientY = e.clientY
    const startNodeX = node.x
    const startNodeY = node.y
    const pointerId = e.pointerId
    const el = e.currentTarget as HTMLElement
    let hasMoved = false

    // Capture the pointer to this element so we get pointermove/up even
    // when the cursor leaves the node. Without this, dragging a node up
    // to the toolbar (or off-screen on mobile) would silently break drag.
    try { el.setPointerCapture(pointerId) } catch { /* noop */ }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const dx = ev.clientX - startClientX
      const dy = ev.clientY - startClientY
      // Hysteresis: only commit position changes after the user has
      // intentionally moved. Without this, micro-movements before pointerup
      // would mark the click as a drag (which suppresses click selection
      // on touch screens where the OS itself introduces tiny jitter).
      if (!hasMoved && Math.hypot(dx, dy) < 4) return
      hasMoved = true
      updateNode(mapId, node.id, {
        x: startNodeX + dx,
        y: startNodeY + dy,
      })
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

  return (
    <div className="relative h-full bg-zinc-950 flex flex-col">
      {/* Toolbar */}
      <Toolbar
        connectMode={connectMode}
        onToggleConnect={() => {
          setConnectMode((v) => !v)
          setConnectFrom(null)
        }}
        selection={selection}
        selectedNode={selection?.kind === 'node' ? map.nodes.find((n) => n.id === selection.id) ?? null : null}
        onChangeNodeColor={(color) => {
          if (selection?.kind === 'node') updateNode(mapId, selection.id, { color })
        }}
        onDeleteSelection={() => {
          if (!selection) return
          if (selection.kind === 'node') removeNode(mapId, selection.id)
          else removeEdge(mapId, selection.id)
          setSelection(null)
        }}
        onAddNode={() => {
          // Add at the visual center of the current view.
          const rect = canvasRef.current?.getBoundingClientRect()
          const cx = rect ? rect.width / 2 - pan.x - 80 : 100
          const cy = rect ? rect.height / 2 - pan.y - 32 : 100
          const id = addNode(mapId, { x: cx, y: cy })
          setSelection({ kind: 'node', id })
          setEditingNodeId(id)
        }}
        onResetPan={() => setPan({ x: 0, y: 0 })}
      />

      {/* Connect mode banner */}
      {connectMode && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2">
          <Link2 className="w-3 h-3" />
          {connectFrom
            ? 'Ahora tocá el nodo DESTINO'
            : 'Tocá el nodo ORIGEN'}
          <button onClick={() => { setConnectMode(false); setConnectFrom(null) }}
            className="ml-2 opacity-60 hover:opacity-100">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        onPointerDown={onCanvasPointerDown}
        onDoubleClick={onCanvasDoubleClick}
        className={`flex-1 relative overflow-hidden select-none ${
          connectMode ? 'cursor-crosshair' : dragPanRef.current ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, #27272a 1px, transparent 0)',
          backgroundSize: '24px 24px',
          backgroundPosition: `${pan.x % 24}px ${pan.y % 24}px`,
          touchAction: 'none',
        }}
      >
        {/* SVG layer for edges — sits BELOW the nodes via z-index. */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ overflow: 'visible' }}
        >
          {/* Arrowhead marker — reused by every edge. */}
          <defs>
            <marker
              id="mm-arrowhead"
              viewBox="0 0 10 10"
              refX="9" refY="5"
              markerWidth="6" markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#71717a" />
            </marker>
            <marker
              id="mm-arrowhead-active"
              viewBox="0 0 10 10"
              refX="9" refY="5"
              markerWidth="6" markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#a78bfa" />
            </marker>
          </defs>

          {map.edges.map((edge) => {
            const fromNode = map.nodes.find((n) => n.id === edge.fromNodeId)
            const toNode = map.nodes.find((n) => n.id === edge.toNodeId)
            if (!fromNode || !toNode) return null
            const isSelected = selection?.kind === 'edge' && selection.id === edge.id
            const path = computeArrowPath(fromNode, toNode, pan)
            return (
              <g key={edge.id}>
                {/* Wide invisible path for easier click targeting */}
                <path
                  d={path}
                  stroke="transparent" strokeWidth={14}
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
              </g>
            )
          })}
        </svg>

        {/* Nodes layer — absolute positioned divs, on top of the SVG. */}
        {map.nodes.map((node) => (
          <NodeBox
            key={node.id}
            node={node}
            pan={pan}
            selected={selection?.kind === 'node' && selection.id === node.id}
            connectMode={connectMode}
            isConnectSource={connectFrom === node.id}
            editing={editingNodeId === node.id}
            onPointerDown={(e) => startNodeDrag(e, node)}
            onClick={() => handleNodeClick(node.id)}
            onDoubleClick={() => { setEditingNodeId(node.id); setSelection({ kind: 'node', id: node.id }) }}
            onTextChange={(text) => updateNode(mapId, node.id, { text })}
            onEndEdit={() => setEditingNodeId(null)}
          />
        ))}

        {/* Empty state inside the canvas */}
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
  connectMode, onToggleConnect,
  selection, selectedNode, onChangeNodeColor, onDeleteSelection, onAddNode, onResetPan,
}: {
  connectMode: boolean
  onToggleConnect: () => void
  selection: { kind: 'node' | 'edge'; id: string } | null
  selectedNode: MindMapNode | null
  onChangeNodeColor: (color: string) => void
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
        onClick={onToggleConnect}
        title={connectMode ? 'Salir de modo conexión' : 'Conectar dos nodos con una flecha'}
        className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
          connectMode
            ? 'bg-amber-500/20 border border-amber-500/40 text-amber-200'
            : 'text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 active:bg-zinc-800'
        }`}
      >
        <Link2 className="w-3.5 h-3.5" /> Conectar
      </button>
      <button
        onClick={onResetPan}
        title="Centrar vista"
        className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 active:bg-zinc-800 p-1.5 rounded-lg transition-colors"
      >
        <Hand className="w-3.5 h-3.5" />
      </button>

      {/* Selection-dependent actions */}
      {selection && (
        <>
          <div className="w-px h-5 bg-zinc-800 mx-1" />
          {selectedNode && (
            <ColorPickerInline
              currentColor={selectedNode.color ?? DEFAULT_NODE_COLOR}
              onChange={onChangeNodeColor}
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

// ─── Node ────────────────────────────────────────────────────────────────────

function NodeBox({
  node, pan, selected, connectMode, isConnectSource, editing,
  onPointerDown, onClick, onDoubleClick, onTextChange, onEndEdit,
}: {
  node: MindMapNode
  pan: { x: number; y: number }
  selected: boolean
  connectMode: boolean
  isConnectSource: boolean
  editing: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onClick: () => void
  onDoubleClick: () => void
  onTextChange: (text: string) => void
  onEndEdit: () => void
}) {
  const color = node.color ?? DEFAULT_NODE_COLOR
  const borderColor = selected || isConnectSource
    ? color
    : color + '70'

  const [draft, setDraft] = useState(node.text)
  useEffect(() => { setDraft(node.text) }, [node.text, editing])

  return (
    <div
      onPointerDown={onPointerDown}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick() }}
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
          : isConnectSource
            ? `0 0 0 3px ${color}60`
            : `0 4px 14px -4px ${color}40`,
        cursor: connectMode ? 'crosshair' : editing ? 'text' : 'move',
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
  )
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

/** Compute an SVG path string for an edge between two nodes. The arrow goes
 *  from the BORDER of the source to the BORDER of the target (not center-to-
 *  center, which would hide the arrowhead under the target node).
 *
 *  We compute the intersection of the line between centers with each node's
 *  rectangle border to get the endpoints. */
function computeArrowPath(from: MindMapNode, to: MindMapNode, pan: { x: number; y: number }): string {
  const fromCx = from.x + pan.x + from.width / 2
  const fromCy = from.y + pan.y + from.height / 2
  const toCx = to.x + pan.x + to.width / 2
  const toCy = to.y + pan.y + to.height / 2

  const start = intersectRect(fromCx, fromCy, toCx, toCy, from, pan)
  const end = intersectRect(toCx, toCy, fromCx, fromCy, to, pan)

  return `M ${start.x} ${start.y} L ${end.x} ${end.y}`
}

/** Intersect the line from (cx,cy) → (otherX,otherY) with the rectangle
 *  of `node`, returning the point ON the border (not inside). */
function intersectRect(
  cx: number, cy: number,
  otherX: number, otherY: number,
  node: MindMapNode,
  pan: { x: number; y: number },
): { x: number; y: number } {
  const left = node.x + pan.x
  const top = node.y + pan.y
  const right = left + node.width
  const bottom = top + node.height

  const dx = otherX - cx
  const dy = otherY - cy

  if (dx === 0 && dy === 0) return { x: cx, y: cy }

  // Find the smallest positive t such that (cx + t*dx, cy + t*dy) lies on
  // one of the four sides of the rectangle.
  const ts: number[] = []
  if (dx !== 0) {
    ts.push((right - cx) / dx)
    ts.push((left - cx) / dx)
  }
  if (dy !== 0) {
    ts.push((bottom - cy) / dy)
    ts.push((top - cy) / dy)
  }
  let bestT = Infinity
  for (const t of ts) {
    if (t <= 0) continue
    const px = cx + t * dx
    const py = cy + t * dy
    // Allow tiny float-precision wiggle
    const tol = 0.001
    if (px >= left - tol && px <= right + tol && py >= top - tol && py <= bottom + tol) {
      if (t < bestT) bestT = t
    }
  }
  if (!Number.isFinite(bestT)) return { x: cx, y: cy }
  return { x: cx + bestT * dx, y: cy + bestT * dy }
}
