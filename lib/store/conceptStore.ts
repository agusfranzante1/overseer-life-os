'use client'
/**
 * Store del mapa de conceptos por materia (modo `conceptos`).
 * Un `ConceptMap` por materiaId. Sincroniza como fila JSONB (patrón mindmaps).
 *
 * Regla de oro del sync: TODA mutación bumpea `map.updatedAt` (touch) → el
 * merge LWW nunca pisa una edición local con una copia remota vieja.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ConceptMap, ConceptArea, Concept } from '@/lib/study/concepts'
import { AREA_PALETTE, makeDefaultAreas } from '@/lib/study/concepts'

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
function nowISO(): string { return new Date().toISOString() }

const NODE_W = 200  // ancho de referencia de una tarjeta (para colocar la primera)

interface State {
  maps: ConceptMap[]

  /** Devuelve el mapa de una materia (o null si no existe todavía). */
  getMap: (materiaId: string) => ConceptMap | null
  /** Crea el mapa de la materia si no existe. Idempotente. Devuelve el mapa. */
  ensureMap: (materiaId: string) => ConceptMap
  /** Borra el mapa de una materia (al borrar la materia o cambiarla de modo). */
  removeMap: (materiaId: string) => void

  // ── Áreas ──
  addArea: (materiaId: string, name: string) => string
  updateArea: (materiaId: string, areaId: string, patch: Partial<Omit<ConceptArea, 'id'>>) => void
  removeArea: (materiaId: string, areaId: string) => void

  // ── Conceptos ──
  addConcept: (materiaId: string, args?: { areaId?: string | null; x?: number; y?: number; title?: string; author?: string }) => string
  updateConcept: (materiaId: string, conceptId: string, patch: Partial<Pick<Concept, 'title' | 'author' | 'body' | 'areaId'>>) => void
  moveConcept: (materiaId: string, conceptId: string, x: number, y: number) => void
  removeConcept: (materiaId: string, conceptId: string) => void
}

/** Bump del updatedAt del mapa — toda mutación pasa por acá. */
function touch(m: ConceptMap): ConceptMap {
  return { ...m, updatedAt: nowISO() }
}

/** Aplica `fn` al mapa de `materiaId` dentro del array (con touch). */
function mapOver(maps: ConceptMap[], materiaId: string, fn: (m: ConceptMap) => ConceptMap): ConceptMap[] {
  return maps.map((m) => (m.materiaId === materiaId ? touch(fn(m)) : m))
}

export const useConceptStore = create<State>()(
  persist(
    (set, get) => ({
      maps: [],

      getMap: (materiaId) => get().maps.find((m) => m.materiaId === materiaId) ?? null,

      ensureMap: (materiaId) => {
        const existing = get().maps.find((m) => m.materiaId === materiaId)
        if (existing) return existing
        const ts = nowISO()
        const fresh: ConceptMap = {
          materiaId,
          areas: makeDefaultAreas(genId),
          concepts: [],
          createdAt: ts,
          updatedAt: ts,
        }
        set((s) => ({ maps: [...s.maps, fresh] }))
        return fresh
      },

      removeMap: (materiaId) => set((s) => ({ maps: s.maps.filter((m) => m.materiaId !== materiaId) })),

      // ── Áreas ──────────────────────────────────────────────────────────
      addArea: (materiaId, name) => {
        const id = genId()
        set((s) => ({
          maps: mapOver(s.maps, materiaId, (m) => ({
            ...m,
            areas: [...m.areas, { id, name: name.trim() || 'Área', color: AREA_PALETTE[m.areas.length % AREA_PALETTE.length] }],
          })),
        }))
        return id
      },
      updateArea: (materiaId, areaId, patch) => set((s) => ({
        maps: mapOver(s.maps, materiaId, (m) => ({
          ...m,
          areas: m.areas.map((a) => (a.id === areaId ? { ...a, ...patch } : a)),
        })),
      })),
      removeArea: (materiaId, areaId) => set((s) => ({
        maps: mapOver(s.maps, materiaId, (m) => ({
          ...m,
          areas: m.areas.filter((a) => a.id !== areaId),
          // Los conceptos del área borrada quedan sin área (no se borran).
          concepts: m.concepts.map((c) => (c.areaId === areaId ? { ...c, areaId: null, updatedAt: nowISO() } : c)),
        })),
      })),

      // ── Conceptos ──────────────────────────────────────────────────────
      addConcept: (materiaId, args) => {
        const id = genId()
        const ts = nowISO()
        set((s) => ({
          maps: mapOver(s.maps, materiaId, (m) => {
            // Colocación por default: en cascada suave para que no se apilen
            // exactamente encima al crear varios seguidos.
            const n = m.concepts.length
            const x = args?.x ?? 80 + (n % 5) * (NODE_W + 28)
            const y = args?.y ?? 80 + Math.floor(n / 5) * 150
            const concept: Concept = {
              id,
              areaId: args?.areaId ?? m.areas[0]?.id ?? null,
              title: args?.title ?? '',
              author: args?.author,
              body: '',
              x, y,
              createdAt: ts, updatedAt: ts,
            }
            return { ...m, concepts: [...m.concepts, concept] }
          }),
        }))
        return id
      },
      updateConcept: (materiaId, conceptId, patch) => set((s) => ({
        maps: mapOver(s.maps, materiaId, (m) => ({
          ...m,
          concepts: m.concepts.map((c) => (c.id === conceptId ? { ...c, ...patch, updatedAt: nowISO() } : c)),
        })),
      })),
      moveConcept: (materiaId, conceptId, x, y) => set((s) => ({
        maps: mapOver(s.maps, materiaId, (m) => ({
          ...m,
          concepts: m.concepts.map((c) => (c.id === conceptId ? { ...c, x, y, updatedAt: nowISO() } : c)),
        })),
      })),
      removeConcept: (materiaId, conceptId) => set((s) => ({
        maps: mapOver(s.maps, materiaId, (m) => ({
          ...m,
          concepts: m.concepts.filter((c) => c.id !== conceptId),
        })),
      })),
    }),
    {
      name: 'overseer-concepts',
      partialize: (s) => ({ maps: s.maps }),
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.maps)) state.maps = []
      },
    },
  ),
)
