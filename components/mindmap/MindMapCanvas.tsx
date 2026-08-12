'use client'
import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import {
  Trash2, Palette, Plus, X, Hand, MousePointer2, Minus, Spline, CornerDownRight, ZoomIn, ZoomOut, Square, Circle, Type, Copy, Link2, Image as ImageIcon, Loader2,
  Brackets, Braces, Parentheses, RotateCw, Undo2,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
} from 'lucide-react'
import {
  useMindMapStore, NODE_PALETTE,
  type MindMapNode, type MindMapEdge, type MindMapEdgeShape, type MindMapNodeShape,
  type MindMapAlignMode, type MindMapDistributeAxis,
  type MindMapShape, type MindMapShapeKind,
} from '@/lib/store/mindmapStore'
import { uploadMindmapImage } from '@/lib/mindmap/imageUpload'
import { bracketPath, type BracketKind, type BracketDir } from '@/lib/mindmap/brackets'
import { computeSnap, unionRect, SNAP_TOLERANCE_PX, type AlignGuide, type SnapRect } from '@/lib/mindmap/snapping'
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
/** Lado máximo (px de content) con el que arranca un nodo imagen recién
 *  subido. La caja se escala manteniendo el aspect ratio de la imagen para
 *  que entre cómoda en pantalla; después el usuario la redimensiona a gusto. */
const IMAGE_NODE_MAX_START = 260

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
export function MindMapCanvas({ mapId, onOpenMap }: { mapId: string; onOpenMap?: (mapId: string) => void }) {
  const map = useMindMapStore((s) => s.maps.find((m) => m.id === mapId)) ?? null
  // Lista de mapas para el picker del `@` (vincular un nodo a otro mapa).
  const allMaps = useMindMapStore((s) => s.maps)
  const createMap = useMindMapStore((s) => s.createMap)
  const addNode = useMindMapStore((s) => s.addNode)
  const updateNode = useMindMapStore((s) => s.updateNode)
  const removeNode = useMindMapStore((s) => s.removeNode)
  const addShape = useMindMapStore((s) => s.addShape)
  const updateShape = useMindMapStore((s) => s.updateShape)
  const removeShape = useMindMapStore((s) => s.removeShape)
  const addEdge = useMindMapStore((s) => s.addEdge)
  const removeEdge = useMindMapStore((s) => s.removeEdge)
  const setEdgeShape = useMindMapStore((s) => s.setEdgeShape)
  const setEdgeBend = useMindMapStore((s) => s.setEdgeBend)
  const setEdgeAnchor = useMindMapStore((s) => s.setEdgeAnchor)
  const setNodeShape = useMindMapStore((s) => s.setNodeShape)
  const setNodeFontSize = useMindMapStore((s) => s.setNodeFontSize)
  const alignNodes = useMindMapStore((s) => s.alignNodes)
  const distributeNodes = useMindMapStore((s) => s.distributeNodes)
  const duplicateNode = useMindMapStore((s) => s.duplicateNode)
  const pasteSubgraph = useMindMapStore((s) => s.pasteSubgraph)
  const undo = useMindMapStore((s) => s.undo)
  const canUndo = useMindMapStore((s) => s.undoSnapshot?.mapId === mapId)

  // Selection — either a node or an edge.
  // Selection model:
  //   - `selectedNodeIds`: array de nodos seleccionados (multi-select).
  //     0 = nada, 1 = "primary node" (la toolbar muestra color/forma/etc),
  //     2+ = multi (drag mueve todos juntos, delete borra todos).
  //   - `selection`: SOLO usa kind='edge' ahora. La selección de nodos
  //     migró a `selectedNodeIds`. Mantenemos `kind` para que el resto
  //     del código que lee edges no se rompa.
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [selection, setSelection] = useState<{ kind: 'edge' | 'shape'; id: string } | null>(null)
  // Formas seleccionadas (multi). Van aparte de `selectedNodeIds` porque son
  // otra entidad, pero se mueven y se borran JUNTO con los nodos: así se puede
  // agarrar un marco con todo lo que encierra y moverlo o borrarlo de una.
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([])
  // Helper para reemplazar el patrón viejo "seleccionar un solo nodo".
  const selectOnlyNode = (id: string) => {
    setSelection(null)
    setSelectedShapeIds([])
    setSelectedNodeIds([id])
  }
  // Helper para limpiar TODO (deselect global).
  const clearSelection = () => {
    setSelection(null)
    setSelectedNodeIds([])
    setSelectedShapeIds([])
  }
  // Box-select: el usuario arrastra desde el lienzo vacío para dibujar
  // un rectángulo de selección. Coordenadas en SCREEN px (no content),
  // así el rectángulo visible no se distorsiona con el zoom.
  const [boxSelect, setBoxSelect] = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null)
  const boxSelectRef = useRef<typeof boxSelect>(null)
  useEffect(() => { boxSelectRef.current = boxSelect }, [boxSelect])
  // Spacebar para forzar PAN cuando la acción default sería box-select.
  // (Estilo Figma/Miro.) Right-mouse o middle-mouse drag también panea.
  const spaceHeldRef = useRef(false)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const t = e.target as HTMLElement | null
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
        spaceHeldRef.current = true
        if (canvasRef.current) canvasRef.current.style.cursor = 'grab'
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false
        if (canvasRef.current) canvasRef.current.style.cursor = ''
      }
    }
    // Si el usuario pierde foco con Space presionado (alt-tab, click fuera),
    // el keyup nunca dispara y el ref se queda "stuck" en true. Lo limpiamos
    // proactivamente al perder visibilidad / foco.
    const clearStuck = () => {
      spaceHeldRef.current = false
      if (canvasRef.current) canvasRef.current.style.cursor = ''
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clearStuck)
    document.addEventListener('visibilitychange', clearStuck)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clearStuck)
      document.removeEventListener('visibilitychange', clearStuck)
    }
  }, [])
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  // Líneas de alineación mostradas mientras se arrastra un nodo. Vacío = sin drag.
  const [alignGuides, setAlignGuides] = useState<AlignGuide[]>([])
  // Hover (one node at a time) — drives the "+" connector affordance.
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  // Feedback efímero al copiar (Ctrl+C) — muestra "Copiado N nodos" un rato.
  const [copyFlash, setCopyFlash] = useState<string | null>(null)
  // Subida de imagen en curso — bloquea doble-subida y muestra un chip "Subiendo…".
  const [uploadingImage, setUploadingImage] = useState(false)
  const imageInputRef = useRef<HTMLInputElement | null>(null)

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
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchingRef = useRef(false)
  const pinchStartRef = useRef<{
    distance: number
    zoom: number
    pan: { x: number; y: number }
  } | null>(null)
  const suppressPinchClickRef = useRef(false)

  const isPinchInteractionActive = () => pinchingRef.current || activePointersRef.current.size >= 2
  const shouldSuppressPinchClick = () => isPinchInteractionActive() || suppressPinchClickRef.current

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const activePointers = activePointersRef.current

    const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y)
    const twoPointers = () => {
      const points = Array.from(activePointers.values())
      return points.length === 2 ? [points[0], points[1]] as const : null
    }
    const cancelCompetingGestures = () => {
      dragPanRef.current = null
      if (boxSelectRef.current) {
        boxSelectRef.current = null
        setBoxSelect(null)
      }
      setAlignGuides([])
    }
    const capturePinchPointers = () => {
      for (const pointerId of activePointers.keys()) {
        try { el.setPointerCapture(pointerId) } catch { /* noop */ }
      }
    }
    const releasePinchPointers = () => {
      for (const pointerId of activePointers.keys()) {
        try {
          if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)
        } catch { /* noop */ }
      }
    }
    const beginPinch = () => {
      const pair = twoPointers()
      if (!pair) return
      const d = distance(pair[0], pair[1])
      if (d <= 0) return
      pinchingRef.current = true
      suppressPinchClickRef.current = true
      pinchStartRef.current = {
        distance: d,
        zoom: zoomRef.current,
        pan: panRef.current,
      }
      cancelCompetingGestures()
      capturePinchPointers()
    }
    const applyPinch = () => {
      const pair = twoPointers()
      const start = pinchStartRef.current
      if (!pair || !start || start.distance <= 0 || start.zoom <= 0) return

      const rect = el.getBoundingClientRect()
      const currentDistance = distance(pair[0], pair[1])
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, start.zoom * (currentDistance / start.distance)))
      const ratio = newZoom / start.zoom
      const anchorX = (pair[0].x + pair[1].x) / 2 - rect.left
      const anchorY = (pair[0].y + pair[1].y) / 2 - rect.top
      const nextPan = {
        x: anchorX - (anchorX - start.pan.x) * ratio,
        y: anchorY - (anchorY - start.pan.y) * ratio,
      }

      zoomRef.current = newZoom
      panRef.current = nextPan
      setZoom(newZoom)
      setPan(nextPan)
    }
    const endPinch = () => {
      releasePinchPointers()
      pinchingRef.current = false
      pinchStartRef.current = null
      suppressPinchClickRef.current = true
      cancelCompetingGestures()
    }

    const onPointerDown = (e: PointerEvent) => {
      if (activePointers.size === 0 && !pinchingRef.current) suppressPinchClickRef.current = false
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (activePointers.size === 2) {
        e.preventDefault()
        beginPinch()
        applyPinch()
      } else if (activePointers.size > 2) {
        e.preventDefault()
        pinchingRef.current = true
        suppressPinchClickRef.current = true
        pinchStartRef.current = null
        cancelCompetingGestures()
      }
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!activePointers.has(e.pointerId)) return
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (activePointers.size >= 2) {
        e.preventDefault()
        if (activePointers.size === 2) {
          if (!pinchingRef.current || !pinchStartRef.current) beginPinch()
          applyPinch()
        } else {
          pinchingRef.current = true
          suppressPinchClickRef.current = true
          cancelCompetingGestures()
        }
      }
    }
    const onPointerEnd = (e: PointerEvent) => {
      if (!activePointers.has(e.pointerId)) return
      activePointers.delete(e.pointerId)
      if (activePointers.size === 2) {
        beginPinch()
        applyPinch()
      } else if (activePointers.size < 2) {
        if (pinchingRef.current || pinchStartRef.current) {
          e.preventDefault()
          endPinch()
        }
      }
    }

    const options: AddEventListenerOptions = { capture: true, passive: false }
    el.addEventListener('pointerdown', onPointerDown, options)
    el.addEventListener('pointermove', onPointerMove, options)
    el.addEventListener('pointerup', onPointerEnd, options)
    el.addEventListener('pointercancel', onPointerEnd, options)
    window.addEventListener('pointerup', onPointerEnd, options)
    window.addEventListener('pointercancel', onPointerEnd, options)
    return () => {
      releasePinchPointers()
      el.removeEventListener('pointerdown', onPointerDown, true)
      el.removeEventListener('pointermove', onPointerMove, true)
      el.removeEventListener('pointerup', onPointerEnd, true)
      el.removeEventListener('pointercancel', onPointerEnd, true)
      window.removeEventListener('pointerup', onPointerEnd, true)
      window.removeEventListener('pointercancel', onPointerEnd, true)
      activePointers.clear()
      pinchingRef.current = false
      pinchStartRef.current = null
    }
  }, [])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (pinchingRef.current) {
        dragPanRef.current = null
        if (boxSelectRef.current) {
          boxSelectRef.current = null
          setBoxSelect(null)
        }
        return
      }
      if (dragPanRef.current) {
        const d = dragPanRef.current
        setPan({
          x: d.panStartX + (e.clientX - d.pointerStartX),
          y: d.panStartY + (e.clientY - d.pointerStartY),
        })
      }
      if (boxSelectRef.current) {
        setBoxSelect((prev) => prev ? { ...prev, ex: e.clientX, ey: e.clientY } : null)
      }
    }
    const onUp = () => {
      dragPanRef.current = null
      // Commit del box-select: si el rectángulo es chico (<4px ambos
      // ejes) → tratamos como click vacío (deseleccionar todo, ya lo hicimos
      // en down). Si es grande → seleccionamos nodos que INTERSECTAN.
      const box = boxSelectRef.current
      if (box) {
        const minX = Math.min(box.sx, box.ex)
        const maxX = Math.max(box.sx, box.ex)
        const minY = Math.min(box.sy, box.ey)
        const maxY = Math.max(box.sy, box.ey)
        const movedEnough = (maxX - minX) > 4 || (maxY - minY) > 4
        if (movedEnough) {
          // Convertir el rectángulo de SCREEN coords a CONTENT coords
          // (donde viven node.x/y). Usamos el screenToContent helper
          // pero por dentro hace `(client - rect.left - pan) / zoom`.
          const rect = canvasRef.current?.getBoundingClientRect()
          if (rect) {
            const z = zoomRef.current
            const p = panRef.current
            const cMinX = (minX - rect.left - p.x) / z
            const cMaxX = (maxX - rect.left - p.x) / z
            const cMinY = (minY - rect.top - p.y) / z
            const cMaxY = (maxY - rect.top - p.y) / z
            // Selección por INTERSECCIÓN: cualquier nodo cuya bounding
            // box toque el rectángulo se selecciona. Más permisivo que
            // "contención total" — el usuario rara vez encierra cosas
            // perfectas y se frustra si las que tocó el borde no entran.
            const hits: string[] = []
            for (const n of (map?.nodes ?? [])) {
              const nMaxX = n.x + n.width
              const nMaxY = n.y + n.height
              const intersects = !(nMaxX < cMinX || n.x > cMaxX || nMaxY < cMinY || n.y > cMaxY)
              if (intersects) hits.push(n.id)
            }
            setSelectedNodeIds(hits)

            // Las formas se agarran por CONTENCIÓN, no por intersección como
            // los nodos: un marco que encierra varios nodos intersecta
            // cualquier box-select que se haga adentro suyo, y se lo llevaría
            // puesto sin que el usuario lo pidiera. Exigiendo encerrarlo
            // entero, seleccionar un par de nodos de adentro no lo toca, y
            // rodear todo el conjunto sí se lleva el marco con su contenido.
            const shapeHits: string[] = []
            for (const sh of (map?.shapes ?? [])) {
              const sMinX = Math.min(sh.x, sh.x + sh.width)
              const sMaxX = Math.max(sh.x, sh.x + sh.width)
              const sMinY = Math.min(sh.y, sh.y + sh.height)
              const sMaxY = Math.max(sh.y, sh.y + sh.height)
              const contained = sMinX >= cMinX && sMaxX <= cMaxX && sMinY >= cMinY && sMaxY <= cMaxY
              if (contained) shapeHits.push(sh.id)
            }
            setSelectedShapeIds(shapeHits)
            setSelection(null)
          }
        }
        setBoxSelect(null)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map?.nodes])

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
        clearSelection()
        return
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      // Nodos + formas — borrar TODA la selección de una. Van juntos a
      // propósito: si encerraste un marco con sus nodos, Supr se lleva el
      // conjunto entero, que es lo que uno espera.
      if (selectedNodeIds.length > 0 || selectedShapeIds.length > 0) {
        e.preventDefault()
        for (const id of selectedNodeIds) removeNode(mapId, id)
        for (const id of selectedShapeIds) removeShape(mapId, id)
        setSelectedNodeIds([])
        setSelectedShapeIds([])
        return
      }
      // Edge selected
      if (selection?.kind === 'edge') {
        e.preventDefault()
        removeEdge(mapId, selection.id)
        setSelection(null)
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selection, selectedNodeIds, selectedShapeIds, drawingFromId, mapId, removeNode, removeEdge, removeShape])

  // Copiar / Pegar (Ctrl/Cmd + C / V) — copia los nodos seleccionados MÁS las
  // líneas internas (edges con ambos extremos seleccionados) a un "portapapeles"
  // en localStorage, así se puede pegar en OTRO mapa (sobrevive la navegación y
  // el reload). Pegar genera ids nuevos, remapea las líneas y selecciona lo
  // pegado para que puedas moverlo enseguida.
  useEffect(() => {
    const CLIP_KEY = 'overseer-mindmap-clipboard'
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const target = e.target as HTMLElement | null
      // Si estás editando texto, dejá que Ctrl+C/V actúen sobre el texto.
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const key = e.key.toLowerCase()

      // Ctrl/Cmd+Z → deshacer el último cambio (1 solo nivel). Shift+Z lo
      // ignoramos (no hay redo, por diseño).
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        const had = useMindMapStore.getState().undoSnapshot?.mapId === mapId
        undo()
        if (had) {
          setCopyFlash('Deshice el último cambio')
          setTimeout(() => setCopyFlash(null), 1500)
        }
        return
      }

      if (key === 'c') {
        if (!map || selectedNodeIds.length === 0) return
        e.preventDefault()
        const idset = new Set(selectedNodeIds)
        const nodes = map.nodes.filter((n) => idset.has(n.id))
        const edges = map.edges.filter((ed) => idset.has(ed.fromNodeId) && idset.has(ed.toNodeId))
        try {
          localStorage.setItem(CLIP_KEY, JSON.stringify({ nodes, edges, copiedAt: Date.now() }))
          setCopyFlash(`Copiado: ${nodes.length} nodo${nodes.length === 1 ? '' : 's'}${edges.length ? ` · ${edges.length} línea${edges.length === 1 ? '' : 's'}` : ''}`)
          setTimeout(() => setCopyFlash(null), 1500)
        } catch { /* quota / privacidad — best-effort */ }
        return
      }

      if (key === 'v') {
        let payload: { nodes?: MindMapNode[]; edges?: MindMapEdge[] } | null = null
        try { payload = JSON.parse(localStorage.getItem(CLIP_KEY) || 'null') } catch { payload = null }
        if (!payload || !Array.isArray(payload.nodes) || payload.nodes.length === 0) return
        e.preventDefault()
        const newIds = pasteSubgraph(mapId, { nodes: payload.nodes, edges: payload.edges ?? [] })
        if (newIds.length > 0) {
          setSelection(null)
          setSelectedNodeIds(newIds)
          setCopyFlash(`Pegado: ${newIds.length} nodo${newIds.length === 1 ? '' : 's'}`)
          setTimeout(() => setCopyFlash(null), 1500)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [map, selectedNodeIds, mapId, pasteSubgraph, undo])

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

  // ── Subir una imagen → crear un "nodo imagen" centrado en el viewport ──
  // Sube el archivo a Supabase Storage (no base64 — ver imageUpload.ts) y crea
  // un nodo cuya caja arranca con el aspect ratio de la imagen. Después es
  // movible/redimensionable como cualquier nodo.
  const handleImageFile = async (file: File) => {
    if (!file || uploadingImage) return
    setUploadingImage(true)
    try {
      const { url, path, width, height } = await uploadMindmapImage(file, mapId)
      // Dimensiones iniciales de la caja: escalar manteniendo el ratio para
      // que el lado mayor sea IMAGE_NODE_MAX_START. Si no pudimos medir la
      // imagen (compresión falló), usamos un 4:3 razonable.
      let w = IMAGE_NODE_MAX_START
      let h = Math.round(IMAGE_NODE_MAX_START * 0.72)
      if (width > 0 && height > 0) {
        const scale = Math.min(1, IMAGE_NODE_MAX_START / Math.max(width, height))
        w = Math.max(NODE_MIN_WIDTH, Math.round(width * scale))
        h = Math.max(NODE_MIN_HEIGHT, Math.round(height * scale))
      }
      // Centro del viewport en coords de content (respeta pan + zoom).
      const rect = canvasRef.current?.getBoundingClientRect()
      const center = rect
        ? screenToContent(rect.left + rect.width / 2, rect.top + rect.height / 2)
        : null
      const cx = center?.x ?? 0
      const cy = center?.y ?? 0
      const id = addNode(mapId, {
        x: cx - w / 2, y: cy - h / 2, width: w, height: h,
        imageUrl: url, imagePath: path, imageFit: 'cover',
      })
      selectOnlyNode(id)
      setCopyFlash('Imagen agregada')
      setTimeout(() => setCopyFlash(null), 1500)
    } catch {
      // uploadMindmapImage ya disparó el toast con el detalle del error.
    } finally {
      setUploadingImage(false)
    }
  }

  // ── Empty-canvas pointer-down ──
  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return
    if (isPinchInteractionActive()) {
      e.preventDefault()
      return
    }
    if (drawingFromId) {
      // Drawing + click en lienzo vacío → CREAR un nodo nuevo donde se
      // hizo click y conectarlo automáticamente desde el origen.
      const p = screenToContent(e.clientX, e.clientY)
      if (p) {
        const newId = addNode(mapId, { x: p.x - 80, y: p.y - 32 })
        if (newId) {
          addEdge(mapId, drawingFromId, newId)
          selectOnlyNode(newId)
          setEditingNodeId(newId)
        }
      }
      setDrawingFromId(null)
      setCursorPos(null)
      return
    }

    // Box-SELECT: SHIFT + drag en lienzo vacío (estándar Figma/Miro).
    // Mientras tenés Shift presionado, el cursor cambió a crosshair y
    // sabés que vas a dibujar un rectángulo de selección.
    if (e.shiftKey) {
      clearSelection()
      setBoxSelect({ sx: e.clientX, sy: e.clientY, ex: e.clientX, ey: e.clientY })
      return
    }

    // Default: PAN (mantenemos el muscle memory del usuario que arrastra
    // libremente el lienzo para moverlo). También accesible con space,
    // middle-mouse y right-click para teclado-only / mouse pros.
    clearSelection()
    dragPanRef.current = {
      pointerStartX: e.clientX, pointerStartY: e.clientY,
      panStartX: pan.x, panStartY: pan.y,
    }
  }

  // ── Mouse move on the canvas — track cursor for the ghost edge ──
  const onCanvasPointerMove = (e: React.PointerEvent) => {
    if (pinchingRef.current) return
    if (!drawingFromId) return
    const p = screenToContent(e.clientX, e.clientY)
    if (p) setCursorPos(p)
  }

  // ── Double-click empty canvas → create node ──
  const onCanvasDoubleClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return
    if (shouldSuppressPinchClick()) return
    const p = screenToContent(e.clientX, e.clientY)
    if (!p) return
    const id = addNode(mapId, { x: p.x - 80, y: p.y - 32 })
    selectOnlyNode(id)
    setEditingNodeId(id)
  }

  // ── Click on a node ──
  // If drawing → commit edge. Else → just select (drag is also handled).
  // Shift/Cmd/Ctrl + click → TOGGLE en la selección múltiple (add/remove).
  const handleNodeClick = (nodeId: string, modifiers?: { multi?: boolean }) => {
    if (shouldSuppressPinchClick()) return
    if (drawingFromId) {
      if (drawingFromId !== nodeId) {
        addEdge(mapId, drawingFromId, nodeId)
      }
      setDrawingFromId(null)
      setCursorPos(null)
      return
    }
    if (modifiers?.multi) {
      setSelection(null)
      setSelectedNodeIds((prev) =>
        prev.includes(nodeId) ? prev.filter((x) => x !== nodeId) : [...prev, nodeId]
      )
      return
    }
    selectOnlyNode(nodeId)
  }

  // ── Click the "+" handle below a hovered/selected node → start drawing ──
  const startDrawingFrom = (node: MindMapNode) => {
    if (isPinchInteractionActive()) return
    clearSelection()
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
    if (pinchingRef.current) return
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
    if (shouldSuppressPinchClick()) return
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
          selectOnlyNode(newId)
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
    if (isPinchInteractionActive()) return
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
      if (pinchingRef.current) return
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

  /** Drag de un handle de extremo (anchor "from" o "to"). El user
   *  arrastra y el endpoint se snappea al borde más cercano del nodo,
   *  permitiendo elegir manualmente dónde sale/llega la flecha al nodo
   *  (útil para evitar que dos flechas se superpongan). */
  const startEdgeAnchorDrag = (e: React.PointerEvent, edgeId: string, side: 'from' | 'to') => {
    e.stopPropagation()
    e.preventDefault()
    if (isPinchInteractionActive()) return
    setSelection({ kind: 'edge', id: edgeId })
    const pointerId = e.pointerId
    const el = e.currentTarget as SVGElement
    try { el.setPointerCapture(pointerId) } catch { /* noop */ }

    const apply = (ev: PointerEvent) => {
      const p = screenToContent(ev.clientX, ev.clientY)
      if (p) setEdgeAnchor(mapId, edgeId, side, p)
    }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      if (pinchingRef.current) return
      apply(ev)
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      try { el.releasePointerCapture(pointerId) } catch { /* noop */ }
      apply(ev)
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
    if (isPinchInteractionActive()) return
    selectOnlyNode(node.id)

    const startClientX = e.clientX
    const startClientY = e.clientY
    const startW = node.width
    const startH = node.height
    const isCircle = node.shape === 'circle'
    // El bracket se redimensiona LIBRE en ancho y alto (puede ser flaco y alto,
    // o ancho y bajo). No tiene texto que lo condicione.
    const isBracketNode = node.shape === 'bracket'
    // Los nodos imagen (no-círculo / no-texto) conservan su aspect ratio al
    // redimensionar para que la foto nunca se deforme. El círculo ya fuerza
    // 1:1 más abajo; "solo texto" se comporta como rect aunque tenga imagen.
    const isAspectLocked = !!node.imageUrl && !isCircle && node.shape !== 'text'
    const aspect = startH > 0 ? startW / startH : 1
    const pointerId = e.pointerId
    const el = e.currentTarget as HTMLElement

    try { el.setPointerCapture(pointerId) } catch { /* noop */ }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      if (pinchingRef.current) return
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
      } else if (isAspectLocked) {
        // El ancho manda; la altura se deriva del aspect. Si la altura cae
        // por debajo del mínimo, invertimos (la altura manda) para no romper
        // la proporción contra el piso de tamaño.
        let w = Math.max(NODE_MIN_WIDTH, startW + dx)
        let h = w / aspect
        if (h < NODE_MIN_HEIGHT) { h = NODE_MIN_HEIGHT; w = h * aspect }
        updateNode(mapId, node.id, { width: Math.round(w), height: Math.round(h) })
      } else if (isBracketNode) {
        // Bracket: ancho y alto libres (mínimos chicos porque suelen ser flacos).
        const w = Math.max(24, startW + dx)
        const h = Math.max(24, startH + dy)
        updateNode(mapId, node.id, { width: w, height: h })
      } else {
        // Nodo de texto: SOLO ancho manual. La altura la maneja 100% el
        // auto-grow del texto (crece con el contenido / los enters). Así el
        // texto nunca se desborda por un alto seteado a mano demasiado chico.
        const w = Math.max(NODE_MIN_WIDTH, startW + dx)
        updateNode(mapId, node.id, { width: w })
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

  /** Mover o redimensionar una forma libre. `handle` dice qué se agarró:
   *  'move' = el trazo (arrastra la forma entera); las esquinas redimensionan
   *  el bounding box; 'start'/'end' mueven las puntas de una línea. */
  const startShapeDrag = (
    e: React.PointerEvent,
    shape: MindMapShape,
    handle: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'start' | 'end',
  ) => {
    e.stopPropagation()
    if (isPinchInteractionActive()) {
      e.preventDefault()
      return
    }

    // Si la forma YA era parte de una selección múltiple, arrastrarla mueve
    // todo el conjunto (nodos incluidos). Si no lo era, se pasa a seleccionar
    // solo esta, igual que al clickear un nodo suelto.
    const inSelection = selectedShapeIds.includes(shape.id)
    const groupMove = handle === 'move' && inSelection && (selectedShapeIds.length > 1 || selectedNodeIds.length > 0)
    const groupShapes = groupMove
      ? (map?.shapes ?? []).filter((sh) => selectedShapeIds.includes(sh.id)).map((sh) => ({ id: sh.id, x: sh.x, y: sh.y }))
      : []
    const groupNodes = groupMove
      ? (map?.nodes ?? []).filter((n) => selectedNodeIds.includes(n.id)).map((n) => ({ id: n.id, x: n.x, y: n.y }))
      : []
    if (!groupMove) {
      setSelectedNodeIds([])
      setSelectedShapeIds([shape.id])
      setSelection(null)
    }

    const s0 = { x: shape.x, y: shape.y, width: shape.width, height: shape.height }
    const startClientX = e.clientX
    const startClientY = e.clientY
    const pointerId = e.pointerId
    const el = e.currentTarget as SVGElement
    try { el.setPointerCapture(pointerId) } catch { /* noop */ }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      if (pinchingRef.current) return
      const z = zoomRef.current
      const dx = (ev.clientX - startClientX) / z
      const dy = (ev.clientY - startClientY) / z
      let patch: Partial<MindMapShape>
      switch (handle) {
        case 'move':  patch = { x: s0.x + dx, y: s0.y + dy }; break
        // Punta inicial de una línea: se mueve el origen y el delta compensa
        // para que la otra punta quede quieta.
        case 'start': patch = { x: s0.x + dx, y: s0.y + dy, width: s0.width - dx, height: s0.height - dy }; break
        case 'end':   patch = { width: s0.width + dx, height: s0.height + dy }; break
        case 'nw':    patch = { x: s0.x + dx, y: s0.y + dy, width: s0.width - dx, height: s0.height - dy }; break
        case 'ne':    patch = { y: s0.y + dy, width: s0.width + dx, height: s0.height - dy }; break
        case 'sw':    patch = { x: s0.x + dx, width: s0.width - dx, height: s0.height + dy }; break
        case 'se':    patch = { width: s0.width + dx, height: s0.height + dy }; break
      }
      updateShape(mapId, shape.id, patch)

      // Arrastre de conjunto: el mismo delta al resto de lo seleccionado.
      if (groupMove) {
        for (const sh of groupShapes) {
          if (sh.id === shape.id) continue
          updateShape(mapId, sh.id, { x: sh.x + dx, y: sh.y + dy })
        }
        for (const n of groupNodes) {
          updateNode(mapId, n.id, { x: n.x + dx, y: n.y + dy })
        }
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
    if (isPinchInteractionActive()) {
      e.preventDefault()
      return
    }
    if (drawingFromId) {
      // While drawing, treat tap on node as "commit edge" instead of drag.
      handleNodeClick(node.id)
      return
    }

    // Multi-drag: si el nodo clickeado YA estaba en la selección múltiple,
    // movemos TODOS los seleccionados por el mismo delta. Si no estaba,
    // tratamos como "click + drag normal" → seleccionamos solo este y
    // movemos solo este.
    const isModifierClick = e.shiftKey || e.metaKey || e.ctrlKey
    const isAlreadySelected = selectedNodeIds.includes(node.id)
    let movingIds: string[]
    if (isModifierClick) {
      // Shift+drag NUNCA mueve — solo toggle de selección (lo manejará el click handler).
      // Sin embargo el click handler corre en onClick, no acá. Dejamos el drag
      // como noop si se está mod-clickeando — el pointer-up va a soltar y
      // el click se procesa normal.
      return
    }
    if (isAlreadySelected && selectedNodeIds.length > 1) {
      movingIds = selectedNodeIds
    } else {
      // Click sobre nodo no-seleccionado → seleccionar SOLO este y mover.
      selectOnlyNode(node.id)
      movingIds = [node.id]
    }

    // Snapshot de posiciones iniciales para calcular deltas — necesario
    // porque map.nodes cambia en cada update y necesitamos la referencia
    // del momento del pointerdown.
    const startPositions = new Map<string, { x: number; y: number }>()
    // Medidas de los nodos que se mueven — las necesitamos para armar la caja
    // que se alinea contra los vecinos.
    const movingDims = new Map<string, { width: number; height: number }>()
    for (const id of movingIds) {
      const n = map?.nodes.find((m) => m.id === id)
      if (n) {
        startPositions.set(id, { x: n.x, y: n.y })
        movingDims.set(id, { width: n.width, height: n.height })
      }
    }

    // Snapshot de bends y anchors de las edges TOCADAS por la movida —
    // sin esto al mover un nodo las flechas con bend/anchor quedaban
    // ancladas en su posición vieja, dando la sensación de que "no
    // siguen". Trasladamos por el mismo delta del drag.
    const movingSet = new Set(movingIds)

    // Formas que viajan con la selección. Solo cuando el nodo agarrado es
    // parte de la multi-selección: si clickeaste un nodo suelto, mover una
    // forma que quedó seleccionada de antes sería un efecto sorpresa.
    const movingShapes = (isAlreadySelected && selectedNodeIds.length > 1) || selectedShapeIds.length > 0
      ? (map?.shapes ?? []).filter((sh) => selectedShapeIds.includes(sh.id)).map((sh) => ({ id: sh.id, x: sh.x, y: sh.y }))
      : []

    // Vecinos contra los que alinear. Se calculan UNA vez al empezar el drag:
    // los nodos que no se mueven no cambian durante el arrastre.
    const otherRects: SnapRect[] = (map?.nodes ?? [])
      .filter((n) => !movingSet.has(n.id))
      .map((n) => ({ x: n.x, y: n.y, width: n.width, height: n.height }))

    const startBends = new Map<string, { x: number; y: number }>()
    const startFromAnchors = new Map<string, { x: number; y: number }>()
    const startToAnchors = new Map<string, { x: number; y: number }>()
    for (const edge of map?.edges ?? []) {
      const touchesFrom = movingSet.has(edge.fromNodeId)
      const touchesTo = movingSet.has(edge.toNodeId)
      if (!touchesFrom && !touchesTo) continue
      if (edge.bend) startBends.set(edge.id, { ...edge.bend })
      if (edge.fromAnchor && touchesFrom) startFromAnchors.set(edge.id, { ...edge.fromAnchor })
      if (edge.toAnchor && touchesTo) startToAnchors.set(edge.id, { ...edge.toAnchor })
    }

    const startClientX = e.clientX
    const startClientY = e.clientY
    const pointerId = e.pointerId
    const el = e.currentTarget as HTMLElement
    let hasMoved = false

    try { el.setPointerCapture(pointerId) } catch { /* noop */ }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      if (pinchingRef.current) return
      const dx = ev.clientX - startClientX
      const dy = ev.clientY - startClientY
      if (!hasMoved && Math.hypot(dx, dy) < 4) return
      hasMoved = true
      const z = zoomRef.current
      let cdx = dx / z
      let cdy = dy / z

      // ── Alignment guides ──
      // Enganchamos la caja envolvente de lo que se mueve contra los vecinos.
      // Los ejes son independientes: podés quedar alineado en X contra el nodo
      // de arriba y en Y contra el de la izquierda. Con ALT apretado se
      // desactiva (escape hatch para posicionar libre).
      let guides: AlignGuide[] = []
      if (!ev.altKey) {
        const rawRects: SnapRect[] = []
        for (const [id, start] of startPositions) {
          const d = movingDims.get(id)
          if (d) rawRects.push({ x: start.x + cdx, y: start.y + cdy, width: d.width, height: d.height })
        }
        const box = unionRect(rawRects)
        if (box) {
          // La tolerancia es en px de PANTALLA: dividida por el zoom, el
          // enganche se siente igual de "fuerte" con el canvas cerca o lejos.
          const snap = computeSnap(box, otherRects, SNAP_TOLERANCE_PX / z)
          cdx += snap.dx
          cdy += snap.dy
          guides = snap.guides
        }
      }
      setAlignGuides(guides)

      // Aplicar el MISMO delta a TODOS los nodos que estamos moviendo.
      // Si es uno solo, es el comportamiento de antes. Si son varios,
      // se mueven juntos manteniendo su disposición relativa.
      for (const [id, start] of startPositions) {
        updateNode(mapId, id, { x: start.x + cdx, y: start.y + cdy })
      }
      // Mismo delta para las formas seleccionadas: el marco acompaña a lo que
      // encierra en vez de quedarse atrás.
      for (const sh of movingShapes) {
        updateShape(mapId, sh.id, { x: sh.x + cdx, y: sh.y + cdy })
      }
      // Aplicar el mismo delta a bend + anchors de las edges tocadas —
      // así las flechas con waypoint custom siguen al nodo en vez de
      // quedarse fijas. Idempotente; el snapshot está fijo.
      for (const [edgeId, b] of startBends) {
        setEdgeBend(mapId, edgeId, { x: b.x + cdx, y: b.y + cdy })
      }
      for (const [edgeId, a] of startFromAnchors) {
        setEdgeAnchor(mapId, edgeId, 'from', { x: a.x + cdx, y: a.y + cdy })
      }
      for (const [edgeId, a] of startToAnchors) {
        setEdgeAnchor(mapId, edgeId, 'to', { x: a.x + cdx, y: a.y + cdy })
      }
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      setAlignGuides([])   // las guías solo viven durante el arrastre
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
  // Toolbar muestra el color/forma/font solo cuando hay UN nodo en
  // la selección. Multi-selección NO se edita por toolbar (deselect
  // y reselect el que querés cambiar).
  const selectedNode = selectedNodeIds.length === 1
    ? map.nodes.find((n) => n.id === selectedNodeIds[0]) ?? null
    : null

  return (
    <div className="relative h-full bg-zinc-950 flex flex-col">
      {/* Toolbar */}
      <Toolbar
        selectedNode={selectedNode}
        selectedEdge={selectedEdge}
        selectedNodeCount={selectedNodeIds.length}
        selectedNodesColor={map.nodes.find((n) => n.id === selectedNodeIds[0])?.color ?? DEFAULT_NODE_COLOR}
        onAlign={(mode) => alignNodes(mapId, selectedNodeIds, mode)}
        onDistribute={(axis) => distributeNodes(mapId, selectedNodeIds, axis)}
        onChangeNodeColor={(color) => {
          // Aplica color a TODOS los nodos seleccionados (1 o N).
          for (const id of selectedNodeIds) updateNode(mapId, id, { color })
        }}
        onChangeNodeShape={(shape) => {
          for (const id of selectedNodeIds) {
            setNodeShape(mapId, id, shape)
            if (shape === 'bracket') {
              const n = map.nodes.find((x) => x.id === id)
              const patch: Partial<MindMapNode> = {}
              if (!n?.bracketKind) patch.bracketKind = 'square'
              if (!n?.bracketDir) patch.bracketDir = 'left'
              // Si venía de una caja ancha/baja, lo hacemos vertical y flaco.
              if (n && n.height <= n.width) { patch.width = 46; patch.height = 170 }
              if (Object.keys(patch).length) updateNode(mapId, id, patch)
            }
          }
        }}
        onChangeBracketKind={(kind) => {
          for (const id of selectedNodeIds) updateNode(mapId, id, { bracketKind: kind })
        }}
        onChangeBracketDir={(dir) => {
          for (const id of selectedNodeIds) updateNode(mapId, id, { bracketDir: dir })
        }}
        onChangeNodeFontSize={(fontSize) => {
          for (const id of selectedNodeIds) setNodeFontSize(mapId, id, fontSize)
        }}
        onChangeEdgeShape={(shape) => {
          if (selection?.kind === 'edge') setEdgeShape(mapId, selection.id, shape)
        }}
        onDeleteSelection={() => {
          // Borrar TODOS los nodos seleccionados + la edge si hay.
          if (selectedNodeIds.length > 0) {
            for (const id of selectedNodeIds) removeNode(mapId, id)
            setSelectedNodeIds([])
            return
          }
          if (selection?.kind === 'edge') {
            removeEdge(mapId, selection.id)
            setSelection(null)
          }
        }}
        onAddNode={() => {
          const rect = canvasRef.current?.getBoundingClientRect()
          const cx = rect ? rect.width / 2 - pan.x - 80 : 100
          const cy = rect ? rect.height / 2 - pan.y - 32 : 100
          const id = addNode(mapId, { x: cx, y: cy })
          selectOnlyNode(id)
          setEditingNodeId(id)
        }}
        onAddShape={(kind) => {
          // Nace centrada en la vista y con buen tamaño para encerrar un par
          // de nodos; después se ajusta arrastrando los handles.
          const rect = canvasRef.current?.getBoundingClientRect()
          const w = kind === 'line' ? 320 : 360
          const h = kind === 'line' ? 0 : 240
          const cx = rect ? (rect.width / 2 - pan.x) / zoom - w / 2 : 100
          const cy = rect ? (rect.height / 2 - pan.y) / zoom - h / 2 : 100
          const id = addShape(mapId, { kind, x: cx, y: cy, width: w, height: h })
          setSelectedNodeIds([])
          setSelection(null)
          setSelectedShapeIds([id])
        }}
        onAddImage={() => imageInputRef.current?.click()}
        uploadingImage={uploadingImage}
        onUndo={() => { undo(); clearSelection() }}
        canUndo={canUndo}
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
        onContextMenu={(e) => e.preventDefault()}
        className={`flex-1 relative overflow-hidden select-none ${
          drawingFromId ? 'cursor-crosshair' : dragPanRef.current ? 'cursor-grabbing' : boxSelect ? 'cursor-crosshair' : 'cursor-grab'
        }`}
        style={{
          // Estilo "Miro": lienzo crema cálido con grid de puntos sutil oscuro.
          background: '#F6F4E9',
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.08) 1px, transparent 0)',
          backgroundSize: '24px 24px',
          backgroundPosition: `${pan.x % 24}px ${pan.y % 24}px`,
          touchAction: 'none',
        }}
      >
        {/* Capa de FORMAS LIBRES — va primera para quedar por debajo de las
            flechas y los nodos.

            Lo importante acá es el hit-testing: cada forma se pinta con
            fill="none" y solo el TRAZO recibe clicks (pointerEvents: 'stroke').
            Por eso clickear adentro del recuadro no lo selecciona: el evento
            pasa de largo hasta el nodo que haya ahí. Para agarrar la forma hay
            que clickear su borde, tal cual un editor de diagramas.

            El <svg> tiene pointer-events:none; los hijos lo reactivan de a uno,
            así los huecos entre formas tampoco bloquean el pan del lienzo. */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ overflow: 'visible' }}
        >
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {(map.shapes ?? []).map((sh) => (
              <ShapeItem
                key={sh.id}
                shape={sh}
                selected={selectedShapeIds.includes(sh.id)}
                zoom={zoom}
                onHandleDown={startShapeDrag}
              />
            ))}
          </g>
        </svg>

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
              const { start, end } = computeEdgeEndpoints(fromNode, toNode, edge.bend, edge.fromAnchor, edge.toAnchor)
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
                      if (isPinchInteractionActive()) return
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
                  {/* Endpoint handles — solo cuando la edge está seleccionada.
                      Arrastrar mueve el punto de conexión en el nodo a un
                      lugar específico (anchor custom). Doble-click resetea
                      al auto-cálculo. */}
                  {isSelected && (
                    <>
                      <circle
                        cx={start.x} cy={start.y}
                        r={5}
                        fill="#34d399" stroke="#0a0a0b" strokeWidth={1.5}
                        className="pointer-events-auto cursor-move"
                        style={{ touchAction: 'none' }}
                        onPointerDown={(e) => startEdgeAnchorDrag(e, edge.id, 'from')}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          setEdgeAnchor(mapId, edge.id, 'from', undefined)
                        }}
                      >
                        <title>Arrastrá para mover el punto de salida · doble-click para auto</title>
                      </circle>
                      <circle
                        cx={end.x} cy={end.y}
                        r={5}
                        fill="#34d399" stroke="#0a0a0b" strokeWidth={1.5}
                        className="pointer-events-auto cursor-move"
                        style={{ touchAction: 'none' }}
                        onPointerDown={(e) => startEdgeAnchorDrag(e, edge.id, 'to')}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          setEdgeAnchor(mapId, edge.id, 'to', undefined)
                        }}
                      >
                        <title>Arrastrá para mover el punto de llegada · doble-click para auto</title>
                      </circle>
                    </>
                  )}
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
            const isSelected = selectedNodeIds.includes(node.id)
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
                  if (newId) selectOnlyNode(newId)
                }}
                onClick={(modifierKey) => handleNodeClick(node.id, { multi: modifierKey })}
                onDoubleClick={() => {
                  // Imágenes y brackets no tienen texto editable — doble-click
                  // solo selecciona (no abre textarea). "Solo texto" sí abre
                  // edición aunque el nodo conserve una imagen vieja.
                  if ((node.imageUrl && node.shape !== 'text') || node.shape === 'bracket') { selectOnlyNode(node.id); return }
                  setEditingNodeId(node.id)
                  selectOnlyNode(node.id)
                }}
                onTextChange={(text) => updateNode(mapId, node.id, { text })}
                onEndEdit={() => setEditingNodeId(null)}
                allMaps={allMaps}
                currentMapId={mapId}
                onLinkMap={(linkedMapId) => updateNode(mapId, node.id, { linkedMapId })}
                onCreateMap={(title) => createMap(title)}
                onOpenMap={onOpenMap}
                onHover={(hover) => setHoveredNodeId(hover ? node.id : (h) => (h === node.id ? null : h) as null)}
                onStartConnect={() => startDrawingFrom(node)}
                onConnectorMove={handleConnectorMove}
                onConnectorDrop={(cx, cy) => handleConnectorDrop(node.id, cx, cy)}
              />
            )
          })}
        </div>

        {/* Alignment guides — por encima de nodos y flechas, igual que en
            Figma. Comparten el transform de pan+zoom, así que se dibujan en
            coordenadas de canvas. El strokeWidth se divide por el zoom para
            que la línea se vea siempre de 1px real. */}
        {alignGuides.length > 0 && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ overflow: 'visible' }}
          >
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              {alignGuides.map((g, i) => (
                <line
                  key={`${g.axis}-${g.pos}-${i}`}
                  x1={g.axis === 'x' ? g.pos : g.start}
                  y1={g.axis === 'x' ? g.start : g.pos}
                  x2={g.axis === 'x' ? g.pos : g.end}
                  y2={g.axis === 'x' ? g.end : g.pos}
                  // La del centro va llena y en violeta; las de los bordes
                  // punteadas y rosas. Con nodos del mismo tamaño salen las
                  // tres juntas y así se distingue cuál es cuál.
                  stroke={g.center ? '#8b5cf6' : '#ec4899'}
                  strokeWidth={1 / zoom}
                  strokeDasharray={g.center ? undefined : `${4 / zoom} ${3 / zoom}`}
                  shapeRendering="crispEdges"
                />
              ))}
            </g>
          </svg>
        )}

        {/* Box-select overlay — rectángulo de selección visible mientras
            el usuario arrastra desde lienzo vacío. Coordenadas en SCREEN
            px (relativas a la viewport), pero el div está dentro del
            container del canvas que es relative, así que lo posicionamos
            con left/top respecto al canvas. */}
        {boxSelect && (() => {
          const rect = canvasRef.current?.getBoundingClientRect()
          if (!rect) return null
          const minX = Math.min(boxSelect.sx, boxSelect.ex) - rect.left
          const maxX = Math.max(boxSelect.sx, boxSelect.ex) - rect.left
          const minY = Math.min(boxSelect.sy, boxSelect.ey) - rect.top
          const maxY = Math.max(boxSelect.sy, boxSelect.ey) - rect.top
          return (
            <div
              className="absolute pointer-events-none border-2 border-dashed border-indigo-400 bg-indigo-500/15 rounded"
              style={{
                left: minX,
                top: minY,
                width: maxX - minX,
                height: maxY - minY,
                boxShadow: '0 0 12px rgba(99,102,241,0.4)',
              }}
            />
          )
        })()}

        {/* Input oculto para subir imágenes — lo dispara el botón "Imagen" de
            la toolbar. Reseteamos value tras elegir para poder re-subir el
            mismo archivo. */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleImageFile(file)
            e.target.value = ''
          }}
        />

        {/* Chip "Subiendo imagen…" mientras corre la subida. */}
        {uploadingImage && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/50 text-indigo-200 text-xs font-semibold shadow-lg pointer-events-none flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Subiendo imagen…
          </div>
        )}

        {/* Feedback efímero de copiar/pegar (Ctrl+C / Ctrl+V). */}
        {copyFlash && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 text-xs font-semibold shadow-lg pointer-events-none">
            {copyFlash}
          </div>
        )}

        {/* Counter de multi-selección — chip flotante arriba a la izquierda
            que muestra cuántos nodos hay seleccionados. Visible solo con 2+. */}
        {selectedNodeIds.length > 1 && (
          <div className="absolute top-14 left-3 z-30 px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/40 text-indigo-200 text-[11px] font-mono">
            {selectedNodeIds.length} nodos seleccionados · Ctrl+C copiar · Supr borrar
          </div>
        )}

        {/* Hint del atajo de selección múltiple — bottom-left, sutil. */}
        {selectedNodeIds.length === 0 && !boxSelect && !drawingFromId && (
          <div className="absolute bottom-3 left-3 z-20 px-2 py-1 rounded text-[10px] font-mono text-zinc-600 bg-zinc-950/60 backdrop-blur pointer-events-none">
            Shift + arrastrar = selección múltiple · arrastrar = mover lienzo
          </div>
        )}

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

/** Una forma libre dibujada en la capa de abajo.
 *
 *  Se pintan DOS trazos superpuestos: el visible (fino, sin eventos) y uno
 *  transparente y grueso que es el que recibe los clicks. Así se puede agarrar
 *  el borde sin tener que acertarle a 2px. Ambos van con fill="none", que es lo
 *  que hace que el interior no sea clickeable y los nodos de adentro se sigan
 *  usando normal. */
function ShapeItem({ shape, selected, zoom, onHandleDown }: {
  shape: MindMapShape
  selected: boolean
  zoom: number
  onHandleDown: (
    e: React.PointerEvent,
    shape: MindMapShape,
    handle: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'start' | 'end',
  ) => void
}) {
  const stroke = selected ? '#818cf8' : (shape.color ?? '#71717a')
  const sw = shape.strokeWidth ?? 2
  const dash = shape.dashed ? '8 6' : undefined
  // Banda de agarre constante en pantalla (por eso ÷ zoom).
  const grab = sw + 14 / zoom
  // Redimensionar cruzando el lado opuesto deja width/height negativos, y
  // <rect>/<ellipse> no los aceptan: normalizamos.
  const rx = Math.min(shape.x, shape.x + shape.width)
  const ry = Math.min(shape.y, shape.y + shape.height)
  const rw = Math.abs(shape.width)
  const rh = Math.abs(shape.height)

  // Sin `ref`: es el único prop que no unifica entre line/ellipse/rect.
  const geom = (props: Omit<React.SVGProps<SVGGeometryElement>, 'ref'>) => {
    if (shape.kind === 'line') {
      return <line x1={shape.x} y1={shape.y} x2={shape.x + shape.width} y2={shape.y + shape.height} {...props} />
    }
    if (shape.kind === 'ellipse') {
      return <ellipse cx={rx + rw / 2} cy={ry + rh / 2} rx={rw / 2} ry={rh / 2} {...props} />
    }
    return <rect x={rx} y={ry} width={rw} height={rh} rx={12} {...props} />
  }

  // Handles: las puntas si es línea, las esquinas si es caja.
  const handles: { key: 'nw' | 'ne' | 'sw' | 'se' | 'start' | 'end'; cx: number; cy: number }[] =
    shape.kind === 'line'
      ? [
          { key: 'start', cx: shape.x, cy: shape.y },
          { key: 'end', cx: shape.x + shape.width, cy: shape.y + shape.height },
        ]
      : [
          { key: 'nw', cx: rx, cy: ry },
          { key: 'ne', cx: rx + rw, cy: ry },
          { key: 'sw', cx: rx, cy: ry + rh },
          { key: 'se', cx: rx + rw, cy: ry + rh },
        ]

  return (
    <g>
      {geom({ fill: 'none', stroke, strokeWidth: sw, strokeDasharray: dash, pointerEvents: 'none' })}
      {geom({
        fill: 'none',
        stroke: 'transparent',
        strokeWidth: grab,
        pointerEvents: 'stroke',
        style: { cursor: 'move' },
        onPointerDown: (e: React.PointerEvent) => onHandleDown(e, shape, 'move'),
      })}
      {selected && handles.map((h) => (
        <rect
          key={h.key}
          x={h.cx - 5 / zoom}
          y={h.cy - 5 / zoom}
          width={10 / zoom}
          height={10 / zoom}
          fill="#18181b"
          stroke="#818cf8"
          strokeWidth={1.5 / zoom}
          pointerEvents="all"
          style={{ cursor: 'nwse-resize' }}
          onPointerDown={(e) => onHandleDown(e, shape, h.key)}
        />
      ))}
    </g>
  )
}

function Toolbar({
  selectedNode, selectedEdge, selectedNodeCount, selectedNodesColor,
  onChangeNodeColor, onChangeNodeShape, onChangeBracketKind, onChangeBracketDir, onChangeNodeFontSize, onChangeEdgeShape, onAlign, onDistribute, onDeleteSelection, onAddNode, onAddShape, onAddImage, uploadingImage, onUndo, canUndo, onResetPan,
  zoom, onZoomIn, onZoomOut,
}: {
  selectedNode: MindMapNode | null
  selectedEdge: { id: string; shape?: MindMapEdgeShape } | null
  /** Cuántos nodos hay seleccionados — con 2+ aparece alinear + color. */
  selectedNodeCount: number
  /** Color del primer nodo seleccionado — solo para el swatch del picker en
   *  multi-selección (no hay un "color único" cuando son varios distintos). */
  selectedNodesColor: string
  onChangeNodeColor: (color: string) => void
  onChangeNodeShape: (shape: MindMapNodeShape) => void
  onChangeBracketKind: (kind: BracketKind) => void
  onChangeBracketDir: (dir: BracketDir) => void
  onChangeNodeFontSize: (fontSize: number | undefined) => void
  onChangeEdgeShape: (shape: MindMapEdgeShape) => void
  onAlign: (mode: MindMapAlignMode) => void
  onDistribute: (axis: MindMapDistributeAxis) => void
  onDeleteSelection: () => void
  onAddNode: () => void
  onAddShape: (kind: MindMapShapeKind) => void
  onAddImage: () => void
  uploadingImage: boolean
  onUndo: () => void
  canUndo: boolean
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
        onClick={onAddImage}
        disabled={uploadingImage}
        title="Agregar una imagen al mapa"
        className="text-xs text-zinc-300 hover:text-indigo-300 active:bg-zinc-800 px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-wait"
      >
        {uploadingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />} Imagen
      </button>
      {/* Formas libres — para encerrar grupos de nodos o separar zonas.
          Se dibujan sin relleno y por debajo de los nodos: el interior no
          recibe clicks, así que lo de adentro se sigue usando normal. */}
      <div className="flex items-center gap-0.5 border-l border-zinc-800 pl-1 ml-0.5">
        <button
          onClick={() => onAddShape('rect')}
          title="Recuadro para agrupar nodos — se selecciona desde el borde"
          className="text-zinc-400 hover:text-indigo-300 hover:bg-zinc-800 active:bg-zinc-800 p-1.5 rounded-lg transition-colors"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onAddShape('ellipse')}
          title="Óvalo para agrupar nodos — se selecciona desde el borde"
          className="text-zinc-400 hover:text-indigo-300 hover:bg-zinc-800 active:bg-zinc-800 p-1.5 rounded-lg transition-colors"
        >
          <Circle className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onAddShape('line')}
          title="Línea divisoria"
          className="text-zinc-400 hover:text-indigo-300 hover:bg-zinc-800 active:bg-zinc-800 p-1.5 rounded-lg transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
      </div>
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Deshacer el último cambio · Ctrl+Z"
        className="text-zinc-400 hover:text-indigo-300 hover:bg-zinc-800 active:bg-zinc-800 p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
      >
        <Undo2 className="w-3.5 h-3.5" />
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
              {/* Controles extra solo cuando el nodo es un bracket: tipo + dirección */}
              {selectedNode.shape === 'bracket' && (
                <BracketOptions
                  kind={selectedNode.bracketKind ?? 'square'}
                  dir={selectedNode.bracketDir ?? 'left'}
                  onChangeKind={onChangeBracketKind}
                  onChangeDir={onChangeBracketDir}
                />
              )}
              {/* La fuente no aplica a brackets (no tienen texto). */}
              {selectedNode.shape !== 'bracket' && (
                <FontSizePicker
                  current={selectedNode.fontSize ?? DEFAULT_FONT_SIZE}
                  onChange={onChangeNodeFontSize}
                />
              )}
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

      {/* Multi-selección (2+ nodos): color de todos a la vez + alinear/espaciar. */}
      {selectedNodeCount >= 2 && (
        <>
          <div className="w-px h-5 bg-zinc-800 mx-1" />
          <ColorPickerInline currentColor={selectedNodesColor} onChange={onChangeNodeColor} />
          <AlignControls count={selectedNodeCount} onAlign={onAlign} onDistribute={onDistribute} />
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

/** Grupo de botones de alineación / distribución, visible cuando hay 2+ nodos
 *  seleccionados. Alinea respecto a la bounding box de la selección. La
 *  distribución necesita 3+ (con 2 no hay "medio" que repartir → deshabilitada). */
function AlignControls({
  count, onAlign, onDistribute,
}: {
  count: number
  onAlign: (mode: MindMapAlignMode) => void
  onDistribute: (axis: MindMapDistributeAxis) => void
}) {
  const alignButtons: { mode: MindMapAlignMode; label: string; Icon: typeof AlignStartVertical }[] = [
    { mode: 'left',    label: 'Alinear a la izquierda',  Icon: AlignStartVertical },
    { mode: 'hcenter', label: 'Centrar horizontalmente',  Icon: AlignCenterVertical },
    { mode: 'right',   label: 'Alinear a la derecha',     Icon: AlignEndVertical },
    { mode: 'top',     label: 'Alinear arriba',           Icon: AlignStartHorizontal },
    { mode: 'vcenter', label: 'Centrar verticalmente',    Icon: AlignCenterHorizontal },
    { mode: 'bottom',  label: 'Alinear abajo',            Icon: AlignEndHorizontal },
  ]
  const canDistribute = count >= 3
  return (
    <div className="flex items-center gap-0.5 bg-zinc-950/60 border border-zinc-800 rounded-lg p-0.5">
      {alignButtons.map(({ mode, label, Icon }) => (
        <button
          key={mode}
          onClick={() => onAlign(mode)}
          title={label}
          onPointerDown={(e) => e.stopPropagation()}
          className="px-1.5 py-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 active:bg-zinc-800 transition-colors"
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
      <div className="w-px h-4 bg-zinc-800 mx-0.5" />
      <button
        onClick={() => canDistribute && onDistribute('horizontal')}
        disabled={!canDistribute}
        title={canDistribute ? 'Espaciar uniformemente en horizontal' : 'Espaciar uniformemente necesita 3+ nodos'}
        onPointerDown={(e) => e.stopPropagation()}
        className="px-1.5 py-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 active:bg-zinc-800 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
      >
        <AlignHorizontalDistributeCenter className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => canDistribute && onDistribute('vertical')}
        disabled={!canDistribute}
        title={canDistribute ? 'Espaciar uniformemente en vertical' : 'Espaciar uniformemente necesita 3+ nodos'}
        onPointerDown={(e) => e.stopPropagation()}
        className="px-1.5 py-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 active:bg-zinc-800 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
      >
        <AlignVerticalDistributeCenter className="w-3.5 h-3.5" />
      </button>
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
    { key: 'rect',    label: 'Rectángulo', Icon: Square },
    { key: 'circle',  label: 'Círculo',    Icon: Circle },
    { key: 'bracket', label: 'Corchete',   Icon: Brackets },
    { key: 'text',    label: 'Solo texto', Icon: Type },
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

/** Controles del bracket: tipo (corchete/llave/paréntesis) + botón que rota la
 *  dirección (left → top → right → bottom → left). Solo visible cuando el nodo
 *  seleccionado es un bracket. */
function BracketOptions({
  kind, dir, onChangeKind, onChangeDir,
}: {
  kind: BracketKind
  dir: BracketDir
  onChangeKind: (k: BracketKind) => void
  onChangeDir: (d: BracketDir) => void
}) {
  const kinds: { key: BracketKind; label: string; Icon: typeof Square }[] = [
    { key: 'square', label: 'Corchete [ ]',  Icon: Brackets },
    { key: 'curly',  label: 'Llave { }',      Icon: Braces },
    { key: 'round',  label: 'Paréntesis ( )', Icon: Parentheses },
  ]
  const rotate = () => {
    const order: BracketDir[] = ['left', 'top', 'right', 'bottom']
    const i = order.indexOf(dir)
    onChangeDir(order[(i + 1) % order.length])
  }
  return (
    <div className="flex items-center gap-0.5 bg-zinc-950/60 border border-zinc-800 rounded-lg p-0.5">
      {kinds.map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => onChangeKind(key)}
          title={label}
          onPointerDown={(e) => e.stopPropagation()}
          className={`px-1.5 py-1 rounded-md transition-colors ${
            kind === key ? 'bg-violet-500/25 text-violet-200' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
      <div className="w-px h-4 bg-zinc-800 mx-0.5" />
      <button
        onClick={rotate}
        title={`Rotar dirección (actual: ${dir})`}
        onPointerDown={(e) => e.stopPropagation()}
        className="px-1.5 py-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
      >
        <RotateCw className="w-3.5 h-3.5" />
      </button>
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
  allMaps, currentMapId, onLinkMap, onCreateMap, onOpenMap,
}: {
  node: MindMapNode
  pan: { x: number; y: number }
  selected: boolean
  drawingMode: boolean
  editing: boolean
  showPlus: boolean
  /** Mapas disponibles para vincular (picker del `@`). */
  allMaps: { id: string; title: string }[]
  currentMapId: string
  /** Setea (o limpia) el mapa vinculado de este nodo. */
  onLinkMap: (linkedMapId: string) => void
  /** Crea un mapa nuevo con ese título y devuelve su id. */
  onCreateMap: (title: string) => string
  /** Abre el mapa vinculado (navegación). */
  onOpenMap?: (mapId: string) => void
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
  /** modifier=true cuando shift/ctrl/cmd está held — multi-select toggle. */
  onClick: (modifier: boolean) => void
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
  const isTextOnly = node.shape === 'text'
  // "Nodo imagen": tiene foto → se renderiza la imagen en vez del texto, y el
  // auto-grow de altura (que mide el texto) queda desactivado. La variante
  // "solo texto" manda sobre la imagen para que realmente sea texto puro.
  const isImage = !!node.imageUrl && !isTextOnly
  // Los CÍRCULOS tampoco auto-crecen por texto: width y height están acoplados
  // (size = max(width, needed)), y realimentar el ancho con el alto del texto
  // producía un bucle de renders que nunca converge (el texto reflowa distinto
  // a cada ancho) → "Maximum update depth exceeded" al intentar achicarlos.
  // El tamaño del círculo lo maneja SOLO el handle de resize; el texto se
  // centra adentro. Esto arregla el crash al achicar un círculo.
  const isCircle = node.shape === 'circle'
  // Corchete/llave/paréntesis vectorizado: sin caja ni texto, solo el path SVG.
  const isBracket = node.shape === 'bracket'
  const bracketKind = node.bracketKind ?? 'square'
  const bracketDir = node.bracketDir ?? 'left'

  const [draft, setDraft] = useState(node.text)
  useEffect(() => { setDraft(node.text) }, [node.text, editing])

  // ── Mención `@` para vincular otro mapa ──────────────────────────────
  // {query, at} cuando hay una mención activa en el textarea; null si no.
  const [mention, setMention] = useState<{ query: string; at: number } | null>(null)
  const linkedMap = node.linkedMapId ? allMaps.find((m) => m.id === node.linkedMapId) : undefined

  // Mención activa = el último `@` al inicio o tras un espacio, sin espacio
  // entre el `@` y el cursor (así `mail@x` o `@user ` no la disparan).
  const detectMention = (text: string, cursor: number) => {
    const upto = text.slice(0, cursor)
    const at = upto.lastIndexOf('@')
    if (at < 0) return null
    const before = at === 0 ? ' ' : upto[at - 1]
    if (!/\s/.test(before)) return null
    const query = upto.slice(at + 1)
    if (/\s/.test(query)) return null
    return { query, at }
  }
  const handleDraftChange = (value: string, cursor: number) => {
    setDraft(value)
    setMention(detectMention(value, cursor))
  }
  const filteredMaps = mention
    ? allMaps.filter((m) => m.id !== currentMapId && m.title.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6)
    : []
  const applyLink = (linkedMapId: string, fallbackTitle: string) => {
    if (!mention) return
    const next = (draft.slice(0, mention.at) + draft.slice(mention.at + 1 + mention.query.length)).trim()
    const finalText = next || fallbackTitle
    setDraft(finalText)
    onTextChange(finalText)
    onLinkMap(linkedMapId)
    setMention(null)
  }
  const linkToMap = (m: { id: string; title: string }) => applyLink(m.id, m.title)
  const createAndLink = (title: string) => {
    const t = title.trim() || 'Nuevo mapa'
    applyLink(onCreateMap(t), t)
  }

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

  // Al entrar en edición, poner el cursor al FINAL del texto (no al inicio),
  // así se puede seguir escribiendo de una sin tener que reposicionar. El
  // `autoFocus` del textarea foca pero deja el caret al principio.
  useEffect(() => {
    if (!editing) return
    const ta = textareaRef.current
    if (!ta) return
    const len = ta.value.length
    ta.focus()
    ta.setSelectionRange(len, len)
  }, [editing])

  useLayoutEffect(() => {
    if (isImage || isCircle || isBracket) return  // imagen/círculo/bracket no auto-crecen por texto
    if (!editing) return
    const ta = textareaRef.current
    if (!ta) return
    // 1) Reset → scrollHeight reporta la altura natural (no la del box).
    const previousHeight = ta.style.height
    ta.style.height = 'auto'
    // 2) scrollHeight INCLUYE el padding del textarea (`p-2` = 16px total
    //    vertical) — no sumamos nada extra. Sumar padding adicional acá
    //    era lo que hacía la caja crecer ~16px en CADA cambio.
    const minHeight = isTextOnly ? Math.ceil(fontSize * 1.25) : NODE_MIN_HEIGHT
    const needed = Math.max(minHeight, ta.scrollHeight)
    // 3) Restaurar el inline style (vacío → vuelve a CSS `h-full`).
    ta.style.height = previousHeight
    // Sync up-and-down. `!==` en vez de `>` para que también achique
    // cuando el usuario borra texto.
    if (needed !== node.height) onAutoGrowHeightRef.current(needed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, editing, fontSize, node.width, isTextOnly])

  // Auto-fit (view-mode): si el texto cambia fuera del modo edit (cambio
  // de fontSize desde la toolbar, importación, etc.), también ajustamos.
  // Medimos el inner wrapper que tiene altura natural (NO el outer
  // h-full, que devolvería siempre la altura actual del box).
  const viewMeasureRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    if (isImage || isCircle || isBracket) return  // altura controlada por el resize (no por texto)
    if (editing) return
    const el = viewMeasureRef.current
    if (!el) return
    const needed = isTextOnly
      ? Math.max(Math.ceil(fontSize * 1.25), el.scrollHeight)
      : Math.max(NODE_MIN_HEIGHT, el.scrollHeight + NODE_TEXT_PADDING_Y)
    if (needed !== node.height) onAutoGrowHeightRef.current(needed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.text, fontSize, node.width, editing, isTextOnly])

  return (
    <>
      <div
        // Used by the drag-to-create-node flow on the `+` handle to detect
        // what node (if any) the user released the pointer over.
        data-node-id={node.id}
        onPointerDown={isTextOnly ? undefined : onPointerDown}
        onClick={isTextOnly ? undefined : (e) => { e.stopPropagation(); onClick(e.shiftKey || e.metaKey || e.ctrlKey) }}
        onDoubleClick={isTextOnly ? undefined : (e) => { e.stopPropagation(); onDoubleClick() }}
        onPointerEnter={isTextOnly ? undefined : () => onHover(true)}
        onPointerLeave={isTextOnly ? undefined : () => onHover(false)}
        className={`absolute transition-shadow ${isBracket || isTextOnly ? '' : 'border-2 shadow-lg'} ${
          node.shape === 'circle' ? 'rounded-full' : isBracket ? 'rounded-lg' : isTextOnly ? '' : 'rounded-2xl'
        }`}
        style={{
          left: node.x + pan.x,
          top: node.y + pan.y,
          width: node.width,
          height: node.height,
          // Estilo "Miro" (lienzo crema): tarjeta casi blanca con borde fino del
          // color de acento y sombra suave. Bracket y texto puro no tienen caja.
          background: isBracket || isTextOnly ? 'transparent' : 'rgba(255,255,255,0.82)',
          borderColor: isBracket || isTextOnly ? undefined : borderColor,
          boxShadow: isTextOnly
            ? 'none'
            : isBracket
            ? (selected ? `0 0 0 2px ${color}66` : 'none')
            : selected
              ? `0 0 0 3px ${color}55, 0 8px 20px -8px rgba(0,0,0,0.25)`
              : `0 2px 8px -2px rgba(0,0,0,0.12)`,
          cursor: drawingMode ? 'crosshair' : editing ? 'text' : 'move',
          pointerEvents: isTextOnly ? 'none' : undefined,
          touchAction: 'none',
        }}
      >
        {isBracket ? (
          <svg
            width={node.width}
            height={node.height}
            viewBox={`0 0 ${node.width} ${node.height}`}
            className="absolute inset-0 overflow-visible pointer-events-none"
          >
            <path
              d={bracketPath(bracketKind, bracketDir, node.width, node.height)}
              fill="none"
              stroke={color}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : isImage ? (
          // Imagen clipeada a los bordes redondeados (o al círculo). El
          // wrapper absolute inset-0 + overflow-hidden recorta la foto SIN
          // tapar los handles externos (resize / duplicar / "+"), que viven
          // fuera de la caja con offsets negativos.
          <div
            className={`absolute inset-0 overflow-hidden ${
              node.shape === 'circle' ? 'rounded-full' : 'rounded-2xl'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={node.imageUrl}
              alt=""
              draggable={false}
              className="w-full h-full select-none pointer-events-none"
              style={{ objectFit: node.imageFit ?? 'cover' }}
            />
          </div>
        ) : editing ? (
          <textarea
            data-node-id={isTextOnly ? node.id : undefined}
            ref={textareaRef}
            autoFocus
            value={draft}
            placeholder="Idea"
            onChange={(e) => handleDraftChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onBlur={() => { onTextChange(draft); onEndEdit() }}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') {
                // Si el menú de `@` está abierto, lo cerramos primero.
                if (mention) { setMention(null); return }
                setDraft(node.text); onEndEdit(); return
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                // Con el menú abierto + un mapa que matchea, Enter vincula.
                if (mention && filteredMaps.length > 0) { linkToMap(filteredMaps[0]); return }
                onTextChange(draft)
                onEndEdit()
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className={`w-full h-full bg-transparent font-heading font-bold text-center focus:outline-none resize-none leading-snug placeholder:opacity-40 placeholder:italic ${
              isTextOnly ? 'p-0' : 'p-2'
            }`}
            style={{ color: '#20202e', fontSize, pointerEvents: isTextOnly ? 'auto' : undefined }}
          />
        ) : (
          <div
            className={`w-full h-full flex items-center justify-center text-center font-heading font-bold leading-snug select-none break-words ${
              isTextOnly ? '' : 'px-2'
            }`}
            style={{ color: '#20202e', fontSize, pointerEvents: isTextOnly ? 'none' : undefined }}
          >
            {/* Inner wrapper with NATURAL height — this is the element the
                auto-grow effect measures. The outer flex container is h-full
                (= node.height), so measuring it would just echo back the
                current node height and loop forever. The inner div sits at
                full width but only as tall as the text needs to be, so
                `scrollHeight` returns the true content height. */}
            <div
              ref={viewMeasureRef}
              data-node-id={isTextOnly ? node.id : undefined}
              onPointerDown={isTextOnly ? onPointerDown : undefined}
              onClick={isTextOnly ? (e) => { e.stopPropagation(); onClick(e.shiftKey || e.metaKey || e.ctrlKey) } : undefined}
              onDoubleClick={isTextOnly ? (e) => { e.stopPropagation(); onDoubleClick() } : undefined}
              onPointerEnter={isTextOnly ? () => onHover(true) : undefined}
              onPointerLeave={isTextOnly ? () => onHover(false) : undefined}
              className={isTextOnly ? 'inline-block max-w-full whitespace-pre-wrap rounded-[3px]' : 'w-full'}
              style={isTextOnly ? {
                pointerEvents: 'auto',
                ...(selected ? { outline: `1px dashed ${color}99`, outlineOffset: 3 } : {}),
              } : undefined}
            >
              {/* Empty-text placeholder. Matches the textarea's placeholder
                  "Idea" so the visual is consistent between view and edit modes. */}
              {node.text || <span className="opacity-40 italic">Idea</span>}
            </div>
          </div>
        )}

        {/* Resize handle. Visible solo cuando el nodo está seleccionado y NO
            en edición. Para CÍRCULO/IMAGEN → esquina inferior-derecha (redimensiona
            proporcional/1:1). Para NODOS DE TEXTO → borde derecho-centro con
            cursor horizontal: SOLO cambia el ancho (la altura es automática). */}
        {selected && !editing && (
          isCircle || isImage || isBracket ? (
            <div
              onPointerDown={onResizeStart}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              title="Arrastrá para cambiar el tamaño"
              className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 bg-zinc-900 cursor-nwse-resize z-[5]"
              style={{ borderColor: color, touchAction: 'none', pointerEvents: isTextOnly ? 'auto' : undefined }}
            />
          ) : (
            <div
              onPointerDown={onResizeStart}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              title="Arrastrá para cambiar el ancho (la altura crece sola con el texto)"
              className="absolute top-1/2 -right-1 -translate-y-1/2 w-4 h-4 rounded-full border-2 bg-zinc-900 cursor-ew-resize z-[5]"
              style={{ borderColor: color, touchAction: 'none', pointerEvents: isTextOnly ? 'auto' : undefined }}
            />
          )
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
            style={{ borderColor: color, color, touchAction: 'none', pointerEvents: isTextOnly ? 'auto' : undefined }}
          >
            <Copy className="w-3 h-3" strokeWidth={2.5} />
          </button>
        )}

        {/* 🔗 Mapa vinculado — botón arriba-izquierda. Click abre el otro mapa.
            Si el mapa destino fue borrado, queda gris/inactivo. */}
        {node.linkedMapId && !editing && (
          <button
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault() }}
            onClick={(e) => { e.stopPropagation(); if (linkedMap && onOpenMap && node.linkedMapId) onOpenMap(node.linkedMapId) }}
            onDoubleClick={(e) => e.stopPropagation()}
            title={linkedMap ? `Abrir mapa "${linkedMap.title}"` : 'Mapa vinculado no encontrado'}
            className="absolute -top-2 -left-2 w-6 h-6 rounded-full border-2 bg-zinc-900 flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95 z-[6]"
            style={{ borderColor: linkedMap ? color : '#52525b', color: linkedMap ? color : '#52525b', touchAction: 'none', pointerEvents: isTextOnly ? 'auto' : undefined }}
          >
            <Link2 className="w-3 h-3" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Menú del `@` — vincular a otro mapa o seguir como texto. Anclado
          debajo del nodo. `onPointerDown preventDefault` evita robar el focus
          del textarea (si no, el blur cerraría la edición antes del click). */}
      {editing && mention && (
        <div
          onPointerDown={(e) => e.preventDefault()}
          className="absolute z-30 rounded-xl border border-white/[0.12] bg-zinc-900/95 backdrop-blur shadow-2xl py-1 overflow-hidden"
          style={{ left: node.x + pan.x, top: node.y + pan.y + node.height + 6, width: Math.max(node.width, 200) }}
        >
          <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500">Vincular un mapa</div>
          {filteredMaps.map((m) => (
            <button
              key={m.id}
              onClick={() => linkToMap(m)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs text-zinc-200 hover:bg-indigo-500/15 transition-colors"
            >
              <Link2 className="w-3 h-3 shrink-0 text-indigo-400" /> <span className="truncate">{m.title || '(sin título)'}</span>
            </button>
          ))}
          {filteredMaps.length === 0 && (
            <div className="px-2.5 py-1.5 text-[11px] text-zinc-600 italic">Ningún mapa coincide</div>
          )}
          <button
            onClick={() => setMention(null)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs text-zinc-400 hover:bg-white/[0.05] border-t border-white/[0.06] transition-colors"
          >
            <span className="font-bold text-[13px] leading-none">Aa</span> Solo texto (dejar el @)
          </button>
          {mention.query.trim() && (
            <button
              onClick={() => createAndLink(mention.query)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs text-emerald-300 hover:bg-emerald-500/15 border-t border-white/[0.06] transition-colors"
            >
              <Plus className="w-3 h-3 shrink-0" /> Crear mapa «<span className="truncate">{mention.query.trim()}</span>»
            </button>
          )}
        </div>
      )}

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
          className="absolute z-10 w-4 h-4 rounded-full border flex items-center justify-center shadow-md transition-transform hover:scale-125 active:scale-95"
          style={{
            // Button es 16×16px; centramos horizontalmente con offset 8,
            // y verticalmente lo apoyamos en el borde inferior con
            // offset 8 también (la mitad queda dentro del nodo, mitad
            // afuera — zona de overlap para que el cursor no pierda
            // hover al bajar).
            left: node.x + pan.x + node.width / 2 - 8,
            top: node.y + pan.y + node.height - 8,
            background: 'var(--app-bg)',
            borderColor: color,
            color,
            touchAction: 'none',
          }}
        >
          <Plus className="w-2.5 h-2.5" strokeWidth={2.5} />
        </button>
      )}
    </>
  )
}
