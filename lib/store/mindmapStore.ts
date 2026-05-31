'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MindMapNode {
  id: string
  x: number          // canvas coords (top-left of the rectangle)
  y: number
  width: number      // explicit so drag math is clean
  height: number
  text: string
  /** Optional accent color (border / text). Defaults to indigo. */
  color?: string
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

  // Edge CRUD
  addEdge: (mapId: string, fromNodeId: string, toNodeId: string) => string | null
  removeEdge: (mapId: string, edgeId: string) => void
  /** Change the visual shape of an existing edge (straight / curved / orthogonal). */
  setEdgeShape: (mapId: string, edgeId: string, shape: MindMapEdgeShape) => void

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
              text: args.text ?? 'Idea',
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
