'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Carrera, Materia, Parcial, Tema, TemaItem } from '@/lib/study/types'

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
function now(): string {
  return new Date().toISOString()
}

// ─── State ──────────────────────────────────────────────────────────────────

interface StudyState {
  carreras: Carrera[]
  materias: Materia[]
  parciales: Parcial[]
  temas: Tema[]

  // ── Carrera ──
  addCarrera: (args: { name: string; icon?: string; color?: string; institucion?: string }) => string
  updateCarrera: (id: string, patch: Partial<Omit<Carrera, 'id' | 'createdAt'>>) => void
  deleteCarrera: (id: string) => void

  // ── Materia ──
  addMateria: (args: { carreraId: string; name: string; icon?: string; color?: string; profesor?: string; codigo?: string; cuatrimestre?: string; mode?: 'checklist' | 'conceptos' }) => string
  updateMateria: (id: string, patch: Partial<Omit<Materia, 'id' | 'carreraId' | 'createdAt'>>) => void
  deleteMateria: (id: string) => void

  // ── Parcial ──
  addParcial: (args: { materiaId: string; label: string; examDate?: string }) => string
  updateParcial: (id: string, patch: Partial<Omit<Parcial, 'id' | 'materiaId' | 'createdAt'>>) => void
  deleteParcial: (id: string) => void

  // ── Tema ──
  addTema: (args: { parcialId: string; title: string }) => string
  updateTema: (id: string, patch: Partial<Omit<Tema, 'id' | 'parcialId' | 'createdAt' | 'items'>>) => void
  toggleTema: (id: string) => void
  deleteTema: (id: string) => void

  // ── Ítems del tema (sub-checklist) ──
  addTemaItem: (temaId: string, text: string) => void
  updateTemaItem: (temaId: string, itemId: string, patch: Partial<Omit<TemaItem, 'id'>>) => void
  toggleTemaItem: (temaId: string, itemId: string) => void
  deleteTemaItem: (temaId: string, itemId: string) => void
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useStudyStore = create<StudyState>()(
  persist(
    (set, get) => ({
      carreras: [],
      materias: [],
      parciales: [],
      temas: [],

      // ── Carrera ──────────────────────────────────────────────────────────
      addCarrera: ({ name, icon, color, institucion }) => {
        const id = genId()
        const ts = now()
        const c: Carrera = {
          id, name: name.trim(), icon, color, institucion,
          sortOrder: get().carreras.length, createdAt: ts, updatedAt: ts,
        }
        set((s) => ({ carreras: [...s.carreras, c] }))
        return id
      },
      updateCarrera: (id, patch) => set((s) => ({
        carreras: s.carreras.map((c) => c.id !== id ? c : { ...c, ...patch, updatedAt: now() }),
      })),
      deleteCarrera: (id) => set((s) => {
        // Cascada: materias → parciales → temas de esta carrera.
        const matIds = new Set(s.materias.filter((m) => m.carreraId === id).map((m) => m.id))
        const parIds = new Set(s.parciales.filter((p) => matIds.has(p.materiaId)).map((p) => p.id))
        return {
          carreras: s.carreras.filter((c) => c.id !== id),
          materias: s.materias.filter((m) => m.carreraId !== id),
          parciales: s.parciales.filter((p) => !matIds.has(p.materiaId)),
          temas: s.temas.filter((t) => !parIds.has(t.parcialId)),
        }
      }),

      // ── Materia ──────────────────────────────────────────────────────────
      addMateria: ({ carreraId, name, icon, color, profesor, codigo, cuatrimestre, mode }) => {
        const id = genId()
        const ts = now()
        const m: Materia = {
          id, carreraId, name: name.trim(), icon, color, profesor, codigo, cuatrimestre,
          ...(mode && mode !== 'checklist' ? { mode } : {}),
          sortOrder: get().materias.filter((x) => x.carreraId === carreraId).length,
          createdAt: ts, updatedAt: ts,
        }
        set((s) => ({ materias: [...s.materias, m] }))
        return id
      },
      updateMateria: (id, patch) => set((s) => ({
        materias: s.materias.map((m) => m.id !== id ? m : { ...m, ...patch, updatedAt: now() }),
      })),
      deleteMateria: (id) => set((s) => {
        const parIds = new Set(s.parciales.filter((p) => p.materiaId === id).map((p) => p.id))
        return {
          materias: s.materias.filter((m) => m.id !== id),
          parciales: s.parciales.filter((p) => p.materiaId !== id),
          temas: s.temas.filter((t) => !parIds.has(t.parcialId)),
        }
      }),

      // ── Parcial ──────────────────────────────────────────────────────────
      addParcial: ({ materiaId, label, examDate }) => {
        const id = genId()
        const ts = now()
        const p: Parcial = {
          id, materiaId, label: label.trim(), examDate,
          sortOrder: get().parciales.filter((x) => x.materiaId === materiaId).length,
          createdAt: ts, updatedAt: ts,
        }
        set((s) => ({ parciales: [...s.parciales, p] }))
        return id
      },
      updateParcial: (id, patch) => set((s) => ({
        parciales: s.parciales.map((p) => p.id !== id ? p : { ...p, ...patch, updatedAt: now() }),
      })),
      deleteParcial: (id) => set((s) => ({
        parciales: s.parciales.filter((p) => p.id !== id),
        temas: s.temas.filter((t) => t.parcialId !== id),
      })),

      // ── Tema ─────────────────────────────────────────────────────────────
      addTema: ({ parcialId, title }) => {
        const id = genId()
        const ts = now()
        const t: Tema = {
          id, parcialId, title: title.trim(), done: false, items: [],
          sortOrder: get().temas.filter((x) => x.parcialId === parcialId).length,
          createdAt: ts, updatedAt: ts,
        }
        set((s) => ({ temas: [...s.temas, t] }))
        return id
      },
      updateTema: (id, patch) => set((s) => ({
        temas: s.temas.map((t) => t.id !== id ? t : { ...t, ...patch, updatedAt: now() }),
      })),
      toggleTema: (id) => set((s) => ({
        temas: s.temas.map((t) => t.id !== id ? t : { ...t, done: !t.done, updatedAt: now() }),
      })),
      deleteTema: (id) => set((s) => ({ temas: s.temas.filter((t) => t.id !== id) })),

      // ── Ítems del tema ───────────────────────────────────────────────────
      addTemaItem: (temaId, text) => set((s) => ({
        temas: s.temas.map((t) => {
          if (t.id !== temaId) return t
          const item: TemaItem = { id: genId(), text: text.trim(), done: false, sortOrder: t.items.length }
          return { ...t, items: [...t.items, item], updatedAt: now() }
        }),
      })),
      updateTemaItem: (temaId, itemId, patch) => set((s) => ({
        temas: s.temas.map((t) => t.id !== temaId ? t : {
          ...t,
          items: t.items.map((i) => i.id !== itemId ? i : { ...i, ...patch }),
          updatedAt: now(),
        }),
      })),
      toggleTemaItem: (temaId, itemId) => set((s) => ({
        temas: s.temas.map((t) => t.id !== temaId ? t : {
          ...t,
          items: t.items.map((i) => i.id !== itemId ? i : { ...i, done: !i.done }),
          updatedAt: now(),
        }),
      })),
      deleteTemaItem: (temaId, itemId) => set((s) => ({
        temas: s.temas.map((t) => t.id !== temaId ? t : {
          ...t,
          items: t.items.filter((i) => i.id !== itemId),
          updatedAt: now(),
        }),
      })),
    }),
    {
      name: 'overseer-study',
      partialize: (s) => ({
        carreras: s.carreras, materias: s.materias, parciales: s.parciales, temas: s.temas,
      }),
      onRehydrateStorage: () => (state) => {
        // Defensa: si algún array vino corrupto del storage, lo normalizamos.
        if (!state) return
        if (!Array.isArray(state.carreras)) state.carreras = []
        if (!Array.isArray(state.materias)) state.materias = []
        if (!Array.isArray(state.parciales)) state.parciales = []
        if (!Array.isArray(state.temas)) state.temas = []
      },
    }
  )
)
