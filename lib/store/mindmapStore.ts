'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Visual shape used to render a node.
 *   - 'rect'   → rounded rectangle (default, current behavior)
 *   - 'circle' → ellipse inscribed in the bounding box (becomes a true
 *                circle when width === height) */
export type MindMapNodeShape = 'rect' | 'circle'

export interface MindMapNode {
  id: string
  x: number          // canvas coords (top-left of the bounding box)
  y: number
  width: number      // explicit so drag math is clean
  height: number
  text: string
  /** Optional accent color (border / text). Defaults to indigo. */
  color?: string
  /** Optional shape. Undefined = 'rect' for back-compat with maps created
   *  before this field existed. */
  shape?: MindMapNodeShape
  /** Optional text size in pixels. Undefined = 14 (text-sm) for back-compat
   *  with maps created before this field existed. The user can bump it from
   *  the toolbar; auto-grow logic factors it into the measured height. */
  fontSize?: number
}

/** Visual shape used to render the connector between two nodes.
 *   - 'straight'    → direct line, single break point at midpoint
 *   - 'curved'      → smooth cubic bezier, break point at curve midpoint
 *   - 'orthogonal'  → L-shape elbow with right-angle corners (break points
 *                     at each corner); default 90° for now, 45° chamfers
 *                     could be added later as a sub-variant. */
export type MindMapEdgeShape = 'straight' | 'curved' | 'orthogonal'

export interface MindMapEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  shape?: MindMapEdgeShape  // undefined = 'straight' (back-compat)
  /** Punto de pliegue (bend / waypoint) opcional en COORDENADAS DE CONTENT.
   *  Cuando está definido, el path se rutea a través de este punto en
   *  vez de ir directo. Aplica a 'straight' (polyline) y 'curved'
   *  (bezier cuadrático con bend como control). 'orthogonal' por ahora
   *  ignora el bend — su ruteo en L se calcula del medio del eje
   *  dominante y no tiene sentido pisarlo con un waypoint libre. */
  bend?: { x: number; y: number }
}

export interface MindMap {
  id: string
  title: string
  nodes: MindMapNode[]
  edges: MindMapEdge[]
  createdAt: string
  updatedAt: string
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const NODE_DEFAULT_WIDTH = 160
const NODE_DEFAULT_HEIGHT = 64

export const NODE_PALETTE = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  '#ec4899', '#a855f7', '#14b8a6', '#f97316', '#facc15',
]

// ─── Store ────────────────────────────────────────────────────────────────────

interface MindMapState {
  maps: MindMap[]

  // Map-level CRUD
  createMap: (title?: string) => string
  renameMap: (mapId: string, title: string) => void
  deleteMap: (mapId: string) => void

  // Node CRUD
  addNode: (mapId: string, args: { x: number; y: number; text?: string; color?: string }) => string
  updateNode: (mapId: string, nodeId: string, patch: Partial<Omit<MindMapNode, 'id'>>) => void
  removeNode: (mapId: string, nodeId: string) => void
  /** Duplicate a node — copy text, color, shape, dimensions, fontSize. The
   *  copy is offset (x+24, y+24) so it doesn't sit exactly on top of the
   *  original. Returns the new node's id (or null if the source doesn't
   *  exist). Edges are NOT copied — too easy to accidentally clone a
   *  whole subgraph; the user can wire connections explicitly. */
  duplicateNode: (mapId: string, nodeId: string) => string | null

  // Edge CRUD
  addEdge: (mapId: string, fromNodeId: string, toNodeId: string) => string | null
  removeEdge: (mapId: string, edgeId: string) => void
  /** Change the visual shape of an existing edge (straight / curved / orthogonal). */
  setEdgeShape: (mapId: string, edgeId: string, shape: MindMapEdgeShape) => void
  /** Setea (o limpia, con `undefined`) el bend point de una edge. Cuando
   *  el usuario arrastra el círculo-breakpoint, su nueva posición se
   *  persiste acá. Pasar `undefined` resetea al midpoint calculado. */
  setEdgeBend: (mapId: string, edgeId: string, bend: { x: number; y: number } | undefined) => void
  /** Change the visual shape of a node (rect / circle). */
  setNodeShape: (mapId: string, nodeId: string, shape: MindMapNodeShape) => void
  /** Change the text size of a node, in pixels. Pass `undefined` to reset
   *  to the default (14px). */
  setNodeFontSize: (mapId: string, nodeId: string, fontSize: number | undefined) => void

  // Selectors
  getMap: (mapId: string) => MindMap | null
}

function touch(map: MindMap): MindMap {
  return { ...map, updatedAt: new Date().toISOString() }
}

export const useMindMapStore = create<MindMapState>()(
  persist(
    (set, get) => ({
      maps: [],

      createMap: (title) => {
        const now = new Date().toISOString()
        const id = genId()
        const map: MindMap = {
          id,
          title: title?.trim() || `Mapa ${get().maps.length + 1}`,
          nodes: [],
          edges: [],
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ maps: [map, ...s.maps] }))
        return id
      },

      renameMap: (mapId, title) => set((s) => ({
        maps: s.maps.map((m) => m.id !== mapId ? m : touch({ ...m, title: title.trim() || m.title })),
      })),

      deleteMap: (mapId) => set((s) => ({ maps: s.maps.filter((m) => m.id !== mapId) })),

      addNode: (mapId, args) => {
        const nodeId = genId()
        set((s) => ({
          maps: s.maps.map((m) => {
            if (m.id !== mapId) return m
            const newNode: MindMapNode = {
              id: nodeId,
              x: args.x, y: args.y,
              width: NODE_DEFAULT_WIDTH, height: NODE_DEFAULT_HEIGHT,
              // Default to empty. The view renders "Idea" as a placeholder
              // when text is empty so the box doesn't look broken, but the
              // edit textarea opens BLANK — no need for the user to delete
              // the literal word "Idea" before typing their actual idea.
              text: args.text ?? '',
              color: args.color,
            }
            return touch({ ...m, nodes: [...m.nodes, newNode] })
          }),
        }))
        return nodeId
      },

      updateNode: (mapId, nodeId, patch) => set((s) => ({
        maps: s.maps.map((m) => {
          if (m.id !== mapId) return m
          return touch({
            ...m,
            nodes: m.nodes.map((n) => n.id !== nodeId ? n : { ...n, ...patch }),
          })
        }),
      })),

      duplicateNode: (mapId, nodeId) => {
        const map = get().maps.find((m) => m.id === mapId)
        if (!map) return null
        const source = map.nodes.find((n) => n.id === nodeId)
        if (!source) return null
        const newId = genId()
        const copy: MindMapNode = {
          ...source,
          id: newId,
          x: source.x + 24,
          y: source.y + 24,
        }
        set((s) => ({
          maps: s.maps.map((m) => m.id !== mapId ? m : touch({ ...m, nodes: [...m.nodes, copy] })),
        }))
        return newId
      },

      removeNode: (mapId, nodeId) => set((s) => ({
        maps: s.maps.map((m) => {
          if (m.id !== mapId) return m
          return touch({
            ...m,
            nodes: m.nodes.filter((n) => n.id !== nodeId),
            // Cascade: any edge that touches this node dies too.
            edges: m.edges.filter((e) => e.fromNodeId !== nodeId && e.toNodeId !== nodeId),
          })
        }),
      })),

      addEdge: (mapId, fromNodeId, toNodeId) => {
        if (fromNodeId === toNodeId) return null
        const map = get().maps.find((m) => m.id === mapId)
        if (!map) return null
        // Dedupe — don't create a parallel edge if one already exists in
        // the same direction. (Reverse direction IS allowed — it's its own
        // edge with its own arrow.)
        if (map.edges.some((e) => e.fromNodeId === fromNodeId && e.toNodeId === toNodeId)) return null
        const id = genId()
        set((s) => ({
          maps: s.maps.map((m) => m.id !== mapId ? m : touch({
            ...m,
            edges: [...m.edges, { id, fromNodeId, toNodeId }],
          })),
        }))
        return id
      },

      removeEdge: (mapId, edgeId) => set((s) => ({
        maps: s.maps.map((m) => m.id !== mapId ? m : touch({
          ...m,
          edges: m.edges.filter((e) => e.id !== edgeId),
        })),
      })),

      setEdgeShape: (mapId, edgeId, shape) => set((s) => ({
        maps: s.maps.map((m) => m.id !== mapId ? m : touch({
          ...m,
          edges: m.edges.map((e) => e.id !== edgeId ? e : { ...e, shape }),
        })),
      })),

      setEdgeBend: (mapId, edgeId, bend) => set((s) => ({
        maps: s.maps.map((m) => m.id !== mapId ? m : touch({
          ...m,
          edges: m.edges.map((e) => {
            if (e.id !== edgeId) return e
            const next = { ...e }
            if (bend === undefined) delete next.bend
            else next.bend = bend
            return next
          }),
        })),
      })),

      setNodeFontSize: (mapId, nodeId, fontSize) => set((s) => ({
        maps: s.maps.map((m) => m.id !== mapId ? m : touch({
          ...m,
          nodes: m.nodes.map((n) => {
            if (n.id !== nodeId) return n
            // `undefined` clears the override → falls back to the default 14
            // via the `node.fontSize ?? 14` reads downstream.
            const next = { ...n }
            if (fontSize === undefined) delete next.fontSize
            else next.fontSize = fontSize
            return next
          }),
        })),
      })),

      setNodeShape: (mapId, nodeId, shape) => set((s) => ({
        maps: s.maps.map((m) => m.id !== mapId ? m : touch({
          ...m,
          nodes: m.nodes.map((n) => {
            if (n.id !== nodeId) return n
            if (shape === 'circle') {
              // Force SQUARE dimensions so the circle is a real circle, not
              // an elongated pill. We use `max(width, height)` with a 96px
              // floor so text fits comfortably. Default nodes are 160×64,
              // which without this would become a 160×64 elongated ellipse
              // (border-radius: 50% on a non-square rect = pill shape).
              const size = Math.max(n.width, n.height, 96)
              // Snap top-left so the circle stays centered on the previous
              // rectangle's center — otherwise turning a wide rect into a
              // square circle yanks it visually to the right.
              const cx = n.x + n.width / 2
              const cy = n.y + n.height / 2
              return { ...n, shape, width: size, height: size, x: cx - size / 2, y: cy - size / 2 }
            }
            // Going back to rect — keep whatever dimensions the user had.
            // (If the node was a square circle, it stays square as a rect;
            // user can edit if they want non-square later.)
            return { ...n, shape }
          }),
        })),
      })),

      getMap: (mapId) => get().maps.find((m) => m.id === mapId) ?? null,
    }),
    {
      name: 'overseer-mindmaps',
      partialize: (s) => ({ maps: s.maps }),
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.maps)) state.maps = []
      },
    }
  )
)
