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
import type { ConceptMap, ConceptArea, Concept, ConceptSource, MapNote } from '@/lib/study/concepts'
import { AREA_PALETTE, makeDefaultAreas, normalizeConcept, migrateMapNotes, NODE_W_DEFAULT, NODE_W_MIN, NODE_W_MAX } from '@/lib/study/concepts'
import type { Materia, Tema } from '@/lib/study/types'
import { useStudyStore } from '@/lib/store/studyStore'

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
function nowISO(): string { return new Date().toISOString() }

const NODE_W = 200  // ancho de referencia de una tarjeta (para colocar la primera)
const DERIVED_CONCEPT_PREFIX = 'study_parcial_concept_'
const DERIVED_NOTE_PREFIX = 'study_tema_note_'

function derivedConceptId(parcialId: string): string {
  return `${DERIVED_CONCEPT_PREFIX}${parcialId}`
}

function derivedNoteId(temaId: string): string {
  return `${DERIVED_NOTE_PREFIX}${temaId}`
}

function byStudyOrder<T extends { sortOrder: number; createdAt: string; id: string }>(a: T, b: T): number {
  return a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

export function materiaUsesConceptMap(materia: Pick<Materia, 'mode'> | null | undefined): boolean {
  // La UI actual permite conceptos en materias legacy sin `mode`; `checklist`
  // explícito queda fuera del puente para no crear mapas derivados ahí.
  return !!materia && materia.mode !== 'checklist'
}

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
  updateConcept: (materiaId: string, conceptId: string, patch: Partial<Pick<Concept, 'title' | 'areaId'>>) => void
  moveConcept: (materiaId: string, conceptId: string, x: number, y: number) => void
  /** Ajusta el ancho de la tarjeta (px), clampeado a [NODE_W_MIN, NODE_W_MAX]. */
  resizeConcept: (materiaId: string, conceptId: string, w: number) => void
  removeConcept: (materiaId: string, conceptId: string) => void
  /** Marca/desmarca un concepto como estudiado (alimenta la vista Progreso). */
  toggleStudied: (materiaId: string, conceptId: string, studied?: boolean) => void

  // ── Nodos NOTA (resúmenes de texto libre a nivel materia) ──
  addNoteNode: (materiaId: string, args?: { x?: number; y?: number; text?: string }) => string
  updateNoteNode: (materiaId: string, noteId: string, text: string) => void
  moveNoteNode: (materiaId: string, noteId: string, x: number, y: number) => void
  resizeNoteNode: (materiaId: string, noteId: string, w: number) => void
  removeNoteNode: (materiaId: string, noteId: string) => void

  // ── Aportes (autores) de un concepto ──
  addSource: (materiaId: string, conceptId: string, author?: string) => string
  updateSource: (materiaId: string, conceptId: string, sourceId: string, patch: Partial<Pick<ConceptSource, 'author' | 'authorId' | 'body'>>) => void
  removeSource: (materiaId: string, conceptId: string, sourceId: string) => void
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
              // Arranca con UN aporte (vacío o con el autor pasado) para que la
              // tarjeta ya tenga dónde escribir.
              sources: [{ id: genId(), author: args?.author ?? '', body: '' }],
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
      resizeConcept: (materiaId, conceptId, w) => set((s) => ({
        maps: mapOver(s.maps, materiaId, (m) => ({
          ...m,
          concepts: m.concepts.map((c) => (c.id === conceptId
            ? { ...c, w: Math.max(NODE_W_MIN, Math.min(NODE_W_MAX, Math.round(w))), updatedAt: nowISO() }
            : c)),
        })),
      })),
      removeConcept: (materiaId, conceptId) => set((s) => ({
        maps: mapOver(s.maps, materiaId, (m) => ({
          ...m,
          concepts: m.concepts.filter((c) => c.id !== conceptId),
        })),
      })),
      toggleStudied: (materiaId, conceptId, studied) => set((s) => ({
        maps: mapOver(s.maps, materiaId, (m) => ({
          ...m,
          concepts: m.concepts.map((c) => (c.id === conceptId ? { ...c, studied: studied ?? !c.studied, updatedAt: nowISO() } : c)),
        })),
      })),

      // ── Nodos NOTA ─────────────────────────────────────────────────────
      addNoteNode: (materiaId, args) => {
        const id = genId()
        const ts = nowISO()
        set((s) => ({
          maps: mapOver(s.maps, materiaId, (m) => {
            const n = (m.noteNodes ?? []).length
            const x = args?.x ?? 120 + (n % 4) * 240
            const y = args?.y ?? 120 + Math.floor(n / 4) * 160
            const note: MapNote = { id, text: args?.text ?? '', x, y, createdAt: ts, updatedAt: ts }
            return { ...m, noteNodes: [...(m.noteNodes ?? []), note] }
          }),
        }))
        return id
      },
      updateNoteNode: (materiaId, noteId, text) => set((s) => ({
        maps: mapOver(s.maps, materiaId, (m) => ({
          ...m,
          noteNodes: (m.noteNodes ?? []).map((n) => (n.id === noteId ? { ...n, text, updatedAt: nowISO() } : n)),
        })),
      })),
      moveNoteNode: (materiaId, noteId, x, y) => set((s) => ({
        maps: mapOver(s.maps, materiaId, (m) => ({
          ...m,
          noteNodes: (m.noteNodes ?? []).map((n) => (n.id === noteId ? { ...n, x, y, updatedAt: nowISO() } : n)),
        })),
      })),
      resizeNoteNode: (materiaId, noteId, w) => set((s) => ({
        maps: mapOver(s.maps, materiaId, (m) => ({
          ...m,
          noteNodes: (m.noteNodes ?? []).map((n) => (n.id === noteId
            ? { ...n, w: Math.max(NODE_W_MIN, Math.min(NODE_W_MAX, Math.round(w))), updatedAt: nowISO() }
            : n)),
        })),
      })),
      removeNoteNode: (materiaId, noteId) => set((s) => ({
        maps: mapOver(s.maps, materiaId, (m) => ({
          ...m,
          noteNodes: (m.noteNodes ?? []).filter((n) => n.id !== noteId),
        })),
      })),

      // ── Aportes ────────────────────────────────────────────────────────
      addSource: (materiaId, conceptId, author) => {
        const sid = genId()
        set((s) => ({
          maps: mapOver(s.maps, materiaId, (m) => ({
            ...m,
            concepts: m.concepts.map((c) => (c.id !== conceptId ? c : {
              ...c,
              sources: [...(c.sources ?? []), { id: sid, author: author ?? '', body: '' }],
              updatedAt: nowISO(),
            })),
          })),
        }))
        return sid
      },
      updateSource: (materiaId, conceptId, sourceId, patch) => set((s) => ({
        maps: mapOver(s.maps, materiaId, (m) => ({
          ...m,
          concepts: m.concepts.map((c) => (c.id !== conceptId ? c : {
            ...c,
            sources: (c.sources ?? []).map((src) => (src.id === sourceId ? { ...src, ...patch } : src)),
            updatedAt: nowISO(),
          })),
        })),
      })),
      removeSource: (materiaId, conceptId, sourceId) => set((s) => ({
        maps: mapOver(s.maps, materiaId, (m) => ({
          ...m,
          concepts: m.concepts.map((c) => {
            if (c.id !== conceptId) return c
            const next = (c.sources ?? []).filter((src) => src.id !== sourceId)
            // Nunca dejar un concepto sin ningún aporte → mantener uno vacío.
            return { ...c, sources: next.length > 0 ? next : [{ id: genId(), author: '', body: '' }], updatedAt: nowISO() }
          }),
        })),
      })),
    }),
    {
      name: 'overseer-concepts',
      partialize: (s) => ({ maps: s.maps }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (!Array.isArray(state.maps)) { state.maps = []; return }
        // Migración de conceptos legacy (author/body sueltos → sources[]).
        for (const m of state.maps) {
          if (Array.isArray(m.concepts)) m.concepts = m.concepts.map((c) => normalizeConcept(c, genId))
        }
        // Migración de notas: el texto que antes vivía DENTRO del concepto
        // (`concept.notes`) pasa a ser un nodo NOTA independiente del mapa.
        state.maps = state.maps.map((m) => migrateMapNotes(m, genId))
      },
    },
  ),
)

/** Reconcilia Estudio → mapa de conceptos de una materia.
 *
 *  - Parcial → Concept con `parcialId`.
 *  - Tema    → MapNote con `temaId`.
 *
 *  Idempotente y conservador: solo crea/renombra/elimina nodos derivados; los
 *  nodos libres del usuario (sin `parcialId`/`temaId`) no se tocan jamás.
 */
export function reconcileStudyConceptMap(materiaId: string): void {
  const study = useStudyStore.getState()
  const materia = study.materias.find((m) => m.id === materiaId)
  if (!materiaUsesConceptMap(materia)) return

  const parciales = study.parciales
    .filter((p) => p.materiaId === materiaId)
    .sort(byStudyOrder)
  const parcialById = new Map(parciales.map((p) => [p.id, p]))
  const temas = study.temas
    .filter((t) => parcialById.has(t.parcialId))
    .sort(byStudyOrder)
  const temaById = new Map(temas.map((t) => [t.id, t]))

  useConceptStore.getState().ensureMap(materiaId)
  useConceptStore.setState((state) => {
    const mapIndex = state.maps.findIndex((m) => m.materiaId === materiaId)
    if (mapIndex < 0) return state

    const map = state.maps[mapIndex]
    const ts = nowISO()
    let changed = false

    const conceptsByParcial = new Map<string, Concept>()
    const seenParcialIds = new Set<string>()
    let concepts = map.concepts.filter((concept) => {
      if (!concept.parcialId) return true
      if (!parcialById.has(concept.parcialId)) { changed = true; return false }
      if (seenParcialIds.has(concept.parcialId)) { changed = true; return false }
      seenParcialIds.add(concept.parcialId)
      conceptsByParcial.set(concept.parcialId, concept)
      return true
    })

    concepts = concepts.map((concept) => {
      if (!concept.parcialId) return concept
      const parcial = parcialById.get(concept.parcialId)
      if (!parcial || concept.title === parcial.label) return concept
      changed = true
      const next = { ...concept, title: parcial.label, updatedAt: ts }
      conceptsByParcial.set(concept.parcialId, next)
      return next
    })

    parciales.forEach((parcial, index) => {
      if (conceptsByParcial.has(parcial.id)) return
      const col = index % 3
      const row = Math.floor(index / 3)
      const concept: Concept = {
        id: derivedConceptId(parcial.id),
        parcialId: parcial.id,
        areaId: map.areas[0]?.id ?? null,
        title: parcial.label,
        sources: [],
        x: 80 + col * 360,
        y: 90 + row * 320,
        w: NODE_W_DEFAULT,
        createdAt: ts,
        updatedAt: ts,
      }
      concepts.push(concept)
      conceptsByParcial.set(parcial.id, concept)
      changed = true
    })

    const temasByParcial = new Map<string, Tema[]>()
    for (const tema of temas) {
      const list = temasByParcial.get(tema.parcialId) ?? []
      list.push(tema)
      temasByParcial.set(tema.parcialId, list)
    }

    const notesByTema = new Map<string, MapNote>()
    const seenTemaIds = new Set<string>()
    let noteNodes = (map.noteNodes ?? []).filter((note) => {
      if (!note.temaId) return true
      if (!temaById.has(note.temaId)) { changed = true; return false }
      if (seenTemaIds.has(note.temaId)) { changed = true; return false }
      seenTemaIds.add(note.temaId)
      notesByTema.set(note.temaId, note)
      return true
    })

    noteNodes = noteNodes.map((note) => {
      if (!note.temaId) return note
      const tema = temaById.get(note.temaId)
      if (!tema || note.text === tema.title) return note
      changed = true
      const next = { ...note, text: tema.title, updatedAt: ts }
      notesByTema.set(note.temaId, next)
      return next
    })

    for (const parcial of parciales) {
      const concept = conceptsByParcial.get(parcial.id)
      if (!concept) continue
      const parcialTemas = temasByParcial.get(parcial.id) ?? []
      parcialTemas.forEach((tema, index) => {
        if (notesByTema.has(tema.id)) return
        const col = Math.floor(index / 5)
        const row = index % 5
        const note: MapNote = {
          id: derivedNoteId(tema.id),
          temaId: tema.id,
          text: tema.title,
          x: concept.x + (concept.w ?? NODE_W_DEFAULT) + 48 + col * 248,
          y: concept.y + row * 92,
          w: NODE_W_DEFAULT,
          createdAt: ts,
          updatedAt: ts,
        }
        noteNodes.push(note)
        notesByTema.set(tema.id, note)
        changed = true
      })
    }

    if (!changed) return state
    const maps = state.maps.slice()
    maps[mapIndex] = { ...map, concepts, noteNodes, updatedAt: ts }
    return { maps }
  })
}
