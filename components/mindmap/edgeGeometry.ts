/** Geometry helpers for mind map edges — shared between MindMapCanvas
 *  (live editor) and MindMapThumbnail (preview render). Keeping this in one
 *  place ensures the thumbnail always matches the canvas exactly.
 *
 *  All functions take node positions in CONTENT coordinates. Pan/zoom is
 *  applied at the SVG transform level, NOT here. */

import type { MindMapNode, MindMapEdge, MindMapEdgeShape } from '@/lib/store/mindmapStore'

export type Pt = { x: number; y: number }

/** Endpoints anchored to the BORDERS of each node (not the centers).
 *  Without this, arrowheads would hide behind the target node. Handles
 *  both rectangular and circular (ellipse) node shapes — see
 *  `intersectNodeBorder` for the dispatch.
 *
 *  Si la edge tiene un `bend` definido, lo usamos como "punto remoto"
 *  desde cada extremo (en vez del centro del otro nodo) para calcular
 *  la intersección de borde. Así la flecha sale apuntando hacia el
 *  bend, no hacia el otro nodo — lo que da una salida natural cuando
 *  el usuario tira el waypoint a un costado. */
export function computeEdgeEndpoints(
  from: MindMapNode,
  to: MindMapNode,
  bend?: Pt,
  fromAnchor?: Pt,
  toAnchor?: Pt,
) {
  const fromCx = from.x + from.width / 2
  const fromCy = from.y + from.height / 2
  const toCx = to.x + to.width / 2
  const toCy = to.y + to.height / 2
  // Si hay anchor custom para el extremo "from": clamping al borde del
  // nodo from para que el endpoint quede pegado al borde y no flotando.
  // Igual para "to". Si no hay anchor, calculamos por intersección desde
  // el centro hacia el bend (o hacia el otro nodo si no hay bend).
  const start = fromAnchor
    ? clampToNodeBorder(fromAnchor, from)
    : (() => {
        const startTarget = bend ?? { x: toCx, y: toCy }
        return intersectNodeBorder(fromCx, fromCy, startTarget.x, startTarget.y, from)
      })()
  const end = toAnchor
    ? clampToNodeBorder(toAnchor, to)
    : (() => {
        const endTarget = bend ?? { x: fromCx, y: fromCy }
        return intersectNodeBorder(toCx, toCy, endTarget.x, endTarget.y, to)
      })()
  return { start, end }
}

/** Dado un punto cualquiera (típicamente cerca del nodo) y un nodo,
 *  devuelve el punto más cercano en el borde del nodo. Sirve para
 *  snappear el anchor draggeado por el user al perímetro del nodo. */
function clampToNodeBorder(pt: Pt, node: MindMapNode): Pt {
  if (node.shape === 'circle') {
    const cx = node.x + node.width / 2
    const cy = node.y + node.height / 2
    const dx = pt.x - cx
    const dy = pt.y - cy
    if (dx === 0 && dy === 0) return { x: cx + node.width / 2, y: cy }
    return intersectEllipse(cx, cy, pt.x, pt.y, node)
  }
  // Rect: clamp al rectángulo, luego proyectamos al borde más cercano.
  const x0 = node.x
  const y0 = node.y
  const x1 = node.x + node.width
  const y1 = node.y + node.height
  const cx = Math.max(x0, Math.min(x1, pt.x))
  const cy = Math.max(y0, Math.min(y1, pt.y))
  // Distance to each edge — pick the closest.
  const dLeft = cx - x0
  const dRight = x1 - cx
  const dTop = cy - y0
  const dBottom = y1 - cy
  const minD = Math.min(dLeft, dRight, dTop, dBottom)
  if (minD === dLeft) return { x: x0, y: cy }
  if (minD === dRight) return { x: x1, y: cy }
  if (minD === dTop) return { x: cx, y: y0 }
  return { x: cx, y: y1 }
}

/** Endpoint for an IN-PROGRESS edge (one end is a node, the other is the
 *  cursor). The cursor end stays as-is; the node end is anchored to its
 *  border so the ghost arrow doesn't poke through the source node. */
export function computeDrawingEndpoints(from: MindMapNode, cursor: Pt) {
  const fromCx = from.x + from.width / 2
  const fromCy = from.y + from.height / 2
  return {
    start: intersectNodeBorder(fromCx, fromCy, cursor.x, cursor.y, from),
    end: cursor,
  }
}

/** Dispatch: rectangle border vs ellipse border depending on node.shape. */
function intersectNodeBorder(
  cx: number, cy: number,
  otherX: number, otherY: number,
  node: MindMapNode,
): Pt {
  if (node.shape === 'circle') return intersectEllipse(cx, cy, otherX, otherY, node)
  return intersectRect(cx, cy, otherX, otherY, node)
}

/** Intersect the line from (cx,cy) → (otherX,otherY) with the ellipse
 *  inscribed in `node`'s bounding box. For a circle (width === height),
 *  this is just a circle border intersection.
 *
 *  Parametric: (cx + t·dx, cy + t·dy) lies on the ellipse when
 *    (t·dx / a)² + (t·dy / b)² = 1, where a = width/2, b = height/2.
 *    ⇒ t = 1 / √((dx/a)² + (dy/b)²). */
function intersectEllipse(
  cx: number, cy: number,
  otherX: number, otherY: number,
  node: MindMapNode,
): Pt {
  const a = node.width / 2
  const b = node.height / 2
  // (cx, cy) is the rect's center, but for ellipse we need the ELLIPSE
  // center which is the same point (the ellipse is inscribed in the box).
  // But the caller passes the rectangle's top-left x,y plus we computed
  // center from there. Re-derive here just to be explicit.
  const centerX = node.x + a
  const centerY = node.y + b
  const dx = otherX - centerX
  const dy = otherY - centerY
  if (dx === 0 && dy === 0) return { x: centerX, y: centerY }
  if (a === 0 || b === 0) return { x: centerX, y: centerY }
  const t = 1 / Math.sqrt((dx / a) ** 2 + (dy / b) ** 2)
  return { x: centerX + t * dx, y: centerY + t * dy }
}

/** SVG `d` attribute for an edge. The shape determines whether we draw a
 *  straight line, smooth cubic bezier, or orthogonal L-elbow. Si la edge
 *  tiene un `bend` (punto-pliegue custom), el ruteo lo respeta:
 *   - straight  → polyline `start → bend → end`
 *   - curved    → quadratic bezier con `bend` como control point
 *   - orthogonal → ignora el bend (su L se calcula del eje dominante;
 *                   meter un waypoint libre rompería los 90°). */
export function buildEdgePath(start: Pt, end: Pt, shape: MindMapEdgeShape, bend?: Pt): string {
  switch (shape) {
    case 'curved': {
      if (bend) {
        // Quadratic bezier con bend como control point — la curva pasa
        // CERCA del bend (no exactamente por él, por la definición del
        // bezier cuadrático) pero responde de forma intuitiva al drag.
        return `M ${start.x} ${start.y} Q ${bend.x} ${bend.y}, ${end.x} ${end.y}`
      }
      // Cubic bezier with control points extended in the dominant axis
      // direction. Mimics react-flow's "smoothstep" connector — clean,
      // never crosses itself, looks organic.
      const dx = end.x - start.x
      const dy = end.y - start.y
      const horizontalBias = Math.abs(dx) > Math.abs(dy)
      // Control distance scales with the line length, capped so giant maps
      // don't end up with kilometre-long handles that lose tension.
      const offset = Math.max(40, Math.min(160, Math.hypot(dx, dy) * 0.4))
      let c1x: number, c1y: number, c2x: number, c2y: number
      if (horizontalBias) {
        c1x = start.x + Math.sign(dx) * offset; c1y = start.y
        c2x = end.x - Math.sign(dx) * offset;   c2y = end.y
      } else {
        c1x = start.x; c1y = start.y + Math.sign(dy) * offset
        c2x = end.x;   c2y = end.y - Math.sign(dy) * offset
      }
      return `M ${start.x} ${start.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${end.x} ${end.y}`
    }
    case 'orthogonal': {
      // L-elbow with one corner at the midpoint of the dominant axis. The
      // corner picks the bigger delta as its routing axis so the path
      // hugs the natural direction between nodes.
      const dx = end.x - start.x
      const dy = end.y - start.y
      if (Math.abs(dx) >= Math.abs(dy)) {
        // Horizontal first, then vertical → two corners at (midX, startY)
        // and (midX, endY).
        const midX = (start.x + end.x) / 2
        return `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`
      } else {
        const midY = (start.y + end.y) / 2
        return `M ${start.x} ${start.y} L ${start.x} ${midY} L ${end.x} ${midY} L ${end.x} ${end.y}`
      }
    }
    case 'straight':
    default:
      if (bend) {
        // Polyline: start → bend → end. Da el efecto de "doblar" la
        // recta donde el usuario tiró el waypoint.
        return `M ${start.x} ${start.y} L ${bend.x} ${bend.y} L ${end.x} ${end.y}`
      }
      return `M ${start.x} ${start.y} L ${end.x} ${end.y}`
  }
}

/** Locations of the visual "break points" along the path. These get
 *  rendered as small circles when an edge is selected so the user sees
 *  donde la línea se dobla. Ahora son DRAGGABLES — arrastrar mueve el
 *  bend de la edge. Si la edge ya tiene un `bend` custom, se devuelve
 *  ése en vez del midpoint calculado, para que el círculo visible siga
 *  la nueva posición. */
export function computeEdgeBreakpoints(start: Pt, end: Pt, shape: MindMapEdgeShape, bend?: Pt): Pt[] {
  // 'straight' y 'curved' soportan bend custom; en ese caso el círculo
  // visible es exactamente el bend (la "manija" del waypoint).
  if (bend && (shape === 'straight' || shape === 'curved' || shape === undefined)) {
    return [bend]
  }
  switch (shape) {
    case 'curved': {
      return [{ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }]
    }
    case 'orthogonal': {
      const dx = end.x - start.x
      const dy = end.y - start.y
      if (Math.abs(dx) >= Math.abs(dy)) {
        const midX = (start.x + end.x) / 2
        return [
          { x: midX, y: start.y },
          { x: midX, y: end.y },
        ]
      } else {
        const midY = (start.y + end.y) / 2
        return [
          { x: start.x, y: midY },
          { x: end.x,   y: midY },
        ]
      }
    }
    case 'straight':
    default:
      return [{ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }]
  }
}

// MindMapEdge re-exported via import — TS workaround para que tsc no se
// queje de unused imports cuando los tipos no se usan acá.
export type { MindMapEdge }

/** Intersect the line from (cx,cy)→(otherX,otherY) with the rectangle of
 *  `node`, returning the point ON the border. If the line is degenerate
 *  (both points equal) the input center is returned unchanged. */
export function intersectRect(
  cx: number, cy: number,
  otherX: number, otherY: number,
  node: MindMapNode,
): Pt {
  const left = node.x
  const top = node.y
  const right = left + node.width
  const bottom = top + node.height

  const dx = otherX - cx
  const dy = otherY - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }

  const ts: number[] = []
  if (dx !== 0) { ts.push((right - cx) / dx); ts.push((left - cx) / dx) }
  if (dy !== 0) { ts.push((bottom - cy) / dy); ts.push((top - cy) / dy) }

  let bestT = Infinity
  const tol = 0.001
  for (const t of ts) {
    if (t <= 0) continue
    const px = cx + t * dx
    const py = cy + t * dy
    if (px >= left - tol && px <= right + tol && py >= top - tol && py <= bottom + tol) {
      if (t < bestT) bestT = t
    }
  }
  if (!Number.isFinite(bestT)) return { x: cx, y: cy }
  return { x: cx + bestT * dx, y: cy + bestT * dy }
}
