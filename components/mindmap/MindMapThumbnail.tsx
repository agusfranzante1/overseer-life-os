'use client'
import { useMemo, useId, memo } from 'react'
import { Network } from 'lucide-react'
import type { MindMap } from '@/lib/store/mindmapStore'
import { buildEdgePath, computeEdgeEndpoints } from './edgeGeometry'

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
export const MindMapThumbnail = memo(function MindMapThumbnail({
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

  // Escala aproximada de la miniatura (tarjeta de ~300px de ancho): sirve para
  // que el trazo no quede ni grueso ni invisible, y para decidir si el texto se lee.
  const approxScale = Math.min(300 / geom.contentW, height / geom.contentH)
  const strokeFactor = Math.max(0.5, Math.min(3, 1 / approxScale))
  // El texto de cada nodo es un bloque HTML adentro del SVG: carísimo de
  // maquetar. Solo lo dibujamos si a este tamaño se llega a leer (letra de 14
  // que queda en ~5px o más); en un mapa grande la miniatura muestra la forma.
  const showText = 14 * approxScale >= 5

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
        className="relative z-10 transition-opacity duration-200"
        // El hover se resuelve en el contenedor: cambiar el color de cada nodo
        // obligaba a redibujar y repintar el mapa entero al pasar el mouse.
        style={{ opacity: hover ? 1 : 0.85 }}
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
        </defs>

        <ThumbContent
          nodes={map.nodes}
          edges={map.edges}
          strokeFactor={strokeFactor}
          showText={showText}
          arrowId={arrowId}
        />
      </svg>

      {/* Subtle node count badge bottom-right */}
      <div className="absolute bottom-2 right-2 z-20 px-2 py-0.5 rounded-md bg-zinc-900/70 backdrop-blur border border-zinc-800 text-[9px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1 pointer-events-none">
        <span>{map.nodes.length}</span>
        <span className="text-zinc-600">·</span>
        <span>{map.edges.length}</span>
      </div>
    </div>
  )
})

// Geometry helpers extracted to ./edgeGeometry.ts so canvas + thumbnail
// share the same path math (no drift between live editor and previews).

const DEFAULT_THUMB_COLOR = DEFAULT_NODE_COLOR

/** Nodos y flechas de la miniatura. Memo propio: el hover y los re-renders de
 *  la lista no lo tocan; solo se redibuja si cambian los nodos o las flechas. */
const ThumbContent = memo(function ThumbContent({ nodes, edges, strokeFactor, showText, arrowId }: {
  nodes: MindMap['nodes']
  edges: MindMap['edges']
  strokeFactor: number
  showText: boolean
  arrowId: string
}) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return (
    <>
      {/* Edges UNDER nodes — same path computation as the live canvas so
          the preview mirrors the real shape (straight/curved/orthogonal). */}
      {edges.map((edge) => {
        const fromNode = byId.get(edge.fromNodeId)
        const toNode = byId.get(edge.toNodeId)
        if (!fromNode || !toNode) return null
        const { start, end } = computeEdgeEndpoints(fromNode, toNode)
        return (
          <path
            key={edge.id}
            d={buildEdgePath(start, end, edge.shape ?? 'straight')}
            stroke="#71717a"
            strokeWidth={1.5 * strokeFactor}
            fill="none"
            markerEnd={`url(#${arrowId})`}
            opacity={0.75}
          />
        )
      })}

      {nodes.map((node) => {
        const color = node.color ?? DEFAULT_THUMB_COLOR
        const rx = node.shape === 'circle' ? node.height / 2 : Math.min(12, node.height / 4)
        // Nodo imagen — miniatura recortada a los bordes (o al círculo).
        if (node.imageUrl) {
          return (
            <foreignObject
              key={node.id}
              x={node.x} y={node.y}
              width={node.width} height={node.height}
              style={{ pointerEvents: 'none' }}
            >
              <div
                style={{
                  width: '100%', height: '100%', overflow: 'hidden',
                  borderRadius: node.shape === 'circle' ? '50%' : `${rx}px`,
                  border: `${2 * strokeFactor}px solid ${color}DD`,
                } as React.CSSProperties}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={node.imageUrl}
                  alt=""
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: node.imageFit ?? 'cover', display: 'block' }}
                />
              </div>
            </foreignObject>
          )
        }
        const fontSize = Math.max(10, Math.min(14, node.height * 0.22))
        return (
          <g key={node.id}>
            <rect
              x={node.x} y={node.y}
              width={node.width} height={node.height}
              rx={rx}
              fill={color + '25'}
              stroke={color + 'DD'}
              strokeWidth={2 * strokeFactor}
            />
            {/* Texto — foreignObject para tener wrap y line-clamp de HTML (el
                <text> de SVG no corta líneas). Solo si a este tamaño se lee. */}
            {showText && (
              <foreignObject
                x={node.x} y={node.y}
                width={node.width} height={node.height}
                style={{ pointerEvents: 'none' }}
              >
                <div
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
            )}
          </g>
        )
      })}
    </>
  )
})
