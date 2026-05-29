'use client'
import { useMemo, useId } from 'react'
import { Network } from 'lucide-react'
import type { MindMap, MindMapNode } from '@/lib/store/mindmapStore'

const DEFAULT_NODE_COLOR = '#6366f1'

/** Live SVG thumbnail of a mind map. Renders the actual nodes (as filled
 *  rounded rectangles) and edges (as lines with arrowheads), scaled to fit
 *  the preview area while preserving aspect ratio.
 *
 *  Goals:
 *   - Looks like the real canvas, just shrunken
 *   - Updates live as the user edits (no stored thumbnail PNG — just a
 *     reactive render from the live state)
 *   - Handles edge cases: empty map, single node, very wide/tall maps */
export function MindMapThumbnail({
  map, height = 140, hover = false,
}: {
  map: MindMap
  height?: number
  hover?: boolean
}) {
  // Unique-per-instance ids for SVG defs so arrowhead markers don't collide
  // when multiple thumbnails render on the same page.
  const reactId = useId().replace(/:/g, '_')
  const arrowId = `arrow_${reactId}`
  const arrowHoverId = `arrow_h_${reactId}`
  const gridId = `grid_${reactId}`

  // Geometry: compute the content bounding box, scale to fit, center.
  const geom = useMemo(() => {
    if (map.nodes.length === 0) return null

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of map.nodes) {
      if (n.x < minX) minX = n.x
      if (n.y < minY) minY = n.y
      if (n.x + n.width  > maxX) maxX = n.x + n.width
      if (n.y + n.height > maxY) maxY = n.y + n.height
    }

    // Pad the bounding box a bit so nodes don't kiss the edges.
    const PAD = 24
    minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD

    const contentW = Math.max(1, maxX - minX)
    const contentH = Math.max(1, maxY - minY)

    return { minX, minY, contentW, contentH }
  }, [map.nodes])

  // The visible area uses viewBox in CONTENT coordinates so we don't have
  // to manually scale every coord — SVG handles it. preserveAspectRatio
  // 'xMidYMid meet' centers + fits without distortion.

  if (!geom) {
    // Empty state — same height as the populated state so cards align.
    return (
      <div
        style={{ height }}
        className="w-full bg-zinc-950 flex items-center justify-center border-b border-zinc-800/60"
      >
        <div className="text-center">
          <Network className="w-6 h-6 text-zinc-700 mx-auto" />
          <p className="text-[10px] font-mono text-zinc-700 mt-1">vacío · click para empezar</p>
        </div>
      </div>
    )
  }

  // Scale info — needed so strokes don't look too thick when zoomed out
  // and don't disappear when zoomed in.
  const scale = Math.min(/* heuristic for stroke compensation */ 1, 1)
  // Actually we compute an approximate scale factor from the content size
  // vs typical card width (~300) so stroke widths look consistent.
  const approxScale = 300 / geom.contentW
  const strokeFactor = Math.max(0.5, Math.min(3, 1 / approxScale))

  return (
    <div
      style={{ height }}
      className="w-full bg-zinc-950 border-b border-zinc-800/60 overflow-hidden relative transition-all"
    >
      {/* Subtle dot grid — mirrors the real canvas aesthetic */}
      <div
        className="absolute inset-0 opacity-50 transition-opacity"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #1f1f23 1px, transparent 0)',
          backgroundSize: '14px 14px',
        }}
      />

      {/* Soft brand-color glow that intensifies on hover */}
      <div
        className="absolute inset-0 transition-opacity"
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(99,102,241,0.10) 0%, transparent 65%)',
          opacity: hover ? 1 : 0.5,
        }}
      />

      <svg
        viewBox={`${geom.minX} ${geom.minY} ${geom.contentW} ${geom.contentH}`}
        preserveAspectRatio="xMidYMid meet"
        width="100%"
        height="100%"
        className="relative z-10"
      >
        <defs>
          <marker
            id={arrowId}
            viewBox="0 0 10 10"
            refX={9} refY={5}
            markerWidth={6} markerHeight={6}
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#71717a" />
          </marker>
          <marker
            id={arrowHoverId}
            viewBox="0 0 10 10"
            refX={9} refY={5}
            markerWidth={6} markerHeight={6}
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#a78bfa" />
          </marker>
          {/* Soft glow for nodes — pure CSS approach via SVG filter */}
          <filter id={gridId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={6 * strokeFactor} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Edges UNDER nodes so arrowheads visually land on the node border */}
        {map.edges.map((edge) => {
          const from = map.nodes.find((n) => n.id === edge.fromNodeId)
          const to   = map.nodes.find((n) => n.id === edge.toNodeId)
          if (!from || !to) return null
          const { start, end } = computeEndpoints(from, to)
          return (
            <line
              key={edge.id}
              x1={start.x} y1={start.y}
              x2={end.x}   y2={end.y}
              stroke={hover ? '#a78bfa' : '#52525b'}
              strokeWidth={1.5 * strokeFactor}
              markerEnd={`url(#${hover ? arrowHoverId : arrowId})`}
              opacity={hover ? 0.9 : 0.65}
              style={{ transition: 'stroke 0.2s, opacity 0.2s' }}
            />
          )
        })}

        {/* Nodes — filled rounded rectangles with their accent color +
            the actual text content rendered inside via foreignObject (which
            gives us real HTML/CSS text rendering, including wrap, clamp
            and centering, INSIDE the SVG viewBox). */}
        {map.nodes.map((node) => {
          const color = node.color ?? DEFAULT_NODE_COLOR
          // Font size in CONTENT units. The viewBox handles the scale-down
          // when the thumbnail shrinks. ~12-14 in content coords ends up
          // perfectly legible at thumbnail scale.
          const fontSize = Math.max(10, Math.min(14, node.height * 0.22))
          return (
            <g key={node.id}>
              {/* Subtle glow halo — fades out without hover */}
              <rect
                x={node.x} y={node.y}
                width={node.width} height={node.height}
                rx={Math.min(12, node.height / 4)}
                fill={color}
                opacity={hover ? 0.18 : 0.08}
                filter={`url(#${gridId})`}
                style={{ transition: 'opacity 0.2s' }}
              />
              {/* The actual rectangle */}
              <rect
                x={node.x} y={node.y}
                width={node.width} height={node.height}
                rx={Math.min(12, node.height / 4)}
                fill={color + '25'}
                stroke={color + (hover ? 'FF' : 'BB')}
                strokeWidth={2 * strokeFactor}
                style={{ transition: 'stroke 0.2s' }}
              />
              {/* Text content — foreignObject lets us use real HTML text
                  rendering with wrap and line-clamp inside SVG. SVG <text>
                  alone doesn't auto-wrap, which would mean long ideas spill
                  out of their rectangle. */}
              <foreignObject
                x={node.x} y={node.y}
                width={node.width} height={node.height}
                style={{ pointerEvents: 'none' }}
              >
                <div
                  // React/JSX handles the SVG → HTML namespace transition
                  // for foreignObject children automatically — no need
                  // to set xmlns explicitly (and React rejects it on div).
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: `${node.height * 0.1}px ${node.width * 0.08}px`,
                    fontFamily: 'inherit',
                    overflow: 'hidden',
                  } as React.CSSProperties}
                >
                  <span
                    style={{
                      color,
                      fontSize: `${fontSize}px`,
                      fontWeight: 600,
                      lineHeight: 1.15,
                      wordBreak: 'break-word',
                      // Line clamp so very long ideas don't visually
                      // explode the proportions of the thumbnail.
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical' as const,
                      overflow: 'hidden',
                    }}
                  >
                    {node.text || '·'}
                  </span>
                </div>
              </foreignObject>
            </g>
          )
        })}
      </svg>

      {/* Subtle node count badge bottom-right */}
      <div className="absolute bottom-2 right-2 z-20 px-2 py-0.5 rounded-md bg-zinc-900/70 backdrop-blur border border-zinc-800 text-[9px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1 pointer-events-none">
        <span>{map.nodes.length}</span>
        <span className="text-zinc-600">·</span>
        <span>{map.edges.length}</span>
      </div>
    </div>
  )
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

/** Compute arrow endpoints on the BORDERS of two rectangles. Same logic as
 *  the main canvas — keeps the thumbnail visually consistent. */
function computeEndpoints(from: MindMapNode, to: MindMapNode) {
  const fromCx = from.x + from.width / 2
  const fromCy = from.y + from.height / 2
  const toCx = to.x + to.width / 2
  const toCy = to.y + to.height / 2

  return {
    start: intersectRect(fromCx, fromCy, toCx, toCy, from),
    end:   intersectRect(toCx, toCy, fromCx, fromCy, to),
  }
}

function intersectRect(
  cx: number, cy: number,
  otherX: number, otherY: number,
  node: MindMapNode,
): { x: number; y: number } {
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
