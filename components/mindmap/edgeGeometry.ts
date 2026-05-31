/** Geometry helpers for mind map edges — shared between MindMapCanvas
 *  (live editor) and MindMapThumbnail (preview render). Keeping this in one
 *  place ensures the thumbnail always matches the canvas exactly.
 *
 *  All functions take node positions in CONTENT coordinates. Pan/zoom is
 *  applied at the SVG transform level, NOT here. */

import type { MindMapNode, MindMapEdgeShape } from '@/lib/store/mindmapStore'

export type Pt = { x: number; y: number }

/** Endpoints anchored to the BORDERS of each node (not the centers).
 *  Without this, arrowheads would hide behind the target node. Handles
 *  both rectangular and circular (ellipse) node shapes — see
 *  `intersectNodeBorder` for the dispatch. */
export function computeEdgeEndpoints(from: MindMapNode, to: MindMapNode) {
  const fromCx = from.x + from.width / 2
  const fromCy = from.y + from.height / 2
  const toCx = to.x + to.width / 2
  const toCy = to.y + to.height / 2
  return {
    start: intersectNodeBorder(fromCx, fromCy, toCx, toCy, from),
    end:   intersectNodeBorder(toCx, toCy, fromCx, fromCy, to),
  }
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
 *  straight line, smooth cubic bezier, or orthogonal L-elbow. */
export function buildEdgePath(start: Pt, end: Pt, shape: MindMapEdgeShape): string {
  switch (shape) {
    case 'curved': {
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
      return `M ${start.x} ${start.y} L ${end.x} ${end.y}`
  }
}

/** Locations of the visual "break points" along the path. These get
 *  rendered as small circles when an edge is selected so the user sees
 *  where the line bends. Returned in canvas coords (no pan applied).
 *
 *  Not draggable in v1 — purely visual. */
export function computeEdgeBreakpoints(start: Pt, end: Pt, shape: MindMapEdgeShape): Pt[] {
  switch (shape) {
    case 'curved': {
      // Curve midpoint approximation — quadratic midpoint of the dominant
      // axis. Close enough visually for a single marker.
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
