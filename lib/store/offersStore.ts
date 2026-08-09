'use client'
/**
 * CRM de OFERTAS.
 *
 * Modelo:
 *   Sistema (ej. "Offer System: DRM") → tiene sus ofertas y su documento libre.
 *   Oferta  → nombre + etapa + categorías + GEOs donde está corriendo.
 *   Etapa   → el pipeline: Stock → STH → si tracciona UGO, si no No traccionó.
 *   Categoría / GEO → tablas editables por el usuario, con color.
 *
 * Todo se persiste en localStorage y sincroniza multi-device (una fila por
 * entidad en `offer_*`, mismo patrón por-fila que meditaciones y journal).
 *
 * Regla de oro del sync: TODA mutación bumpea `updatedAt`.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type Block, emptyDoc } from '@/lib/offers/blocks'

function genId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4) }
function nowISO() { return new Date().toISOString() }

/** Paleta para chips de etapa, categoría y GEO. */
export const OFFER_PALETTE = [
  '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#a855f7',
  '#06b6d4', '#ef4444', '#84cc16', '#f97316', '#64748b',
] as const

export interface OfferStage {
  id: string
  name: string
  color: string
  order: number
  /** Etapa terminal de descarte — se muestra apagada en los tableros. */
  discard?: boolean
}

export interface OfferCategory { id: string; name: string; color: string }
export interface OfferGeo { id: string; code: string; name: string; color: string }

export interface OfferSystem {
  id: string
  name: string
  icon: string
  order: number
  /** Documento libre debajo de la tabla (bloques tipo Notion). */
  doc: Block[]
  createdAt: string
  updatedAt: string
}

export interface Offer {
  id: string
  systemId: string
  name: string
  stageId: string
  categoryIds: string[]
  geoIds: string[]
  /** Nota corta opcional (la que en Notion es el número al costado). */
  score?: number
  /** Documento propio de la oferta: espionaje, keywords, resumen de
   *  problemática, lo que sea. Mismos bloques que el del sistema. */
  doc?: Block[]
  order: number
  createdAt: string
  updatedAt: string
}

// ─── Semillas ────────────────────────────────────────────────────────────────
// El pipeline que describe el usuario: arranca en STH, si tracciona pasa a UGO,
// si no a No traccionó. "Stock" es el pozo de ofertas sin empezar y
// "Seleccionado" las elegidas para largar.

function seedStages(): OfferStage[] {
  return [
    { id: 'stage_stock', name: 'Stock', color: '#64748b', order: 0 },
    { id: 'stage_sel', name: 'Seleccionado', color: '#f59e0b', order: 1 },
    { id: 'stage_sth', name: 'STH', color: '#06b6d4', order: 2 },
    { id: 'stage_ugo', name: 'UGO (backend)', color: '#10b981', order: 3 },
    { id: 'stage_no', name: 'No traccionó', color: '#ef4444', order: 4, discard: true },
  ]
}

function seedCategories(): OfferCategory[] {
  return [
    { id: genId(), name: 'Salud & Bienestar', color: '#ec4899' },
    { id: genId(), name: 'Alimentación', color: '#f59e0b' },
    { id: genId(), name: 'Manifestación', color: '#10b981' },
    { id: genId(), name: 'Crianza', color: '#a855f7' },
  ]
}

function seedGeos(): OfferGeo[] {
  return [
    { id: genId(), code: 'ES', name: 'Español', color: '#f59e0b' },
    { id: genId(), code: 'EN', name: 'Inglés', color: '#6366f1' },
    { id: genId(), code: 'PT', name: 'Portugués', color: '#10b981' },
  ]
}

interface State {
  systems: OfferSystem[]
  offers: Offer[]
  stages: OfferStage[]
  categories: OfferCategory[]
  geos: OfferGeo[]

  addSystem: (name: string) => string
  updateSystem: (id: string, patch: Partial<Pick<OfferSystem, 'name' | 'icon'>>) => void
  removeSystem: (id: string) => void
  setSystemDoc: (id: string, doc: Block[]) => void

  addOffer: (systemId: string, name: string, stageId?: string) => string
  updateOffer: (id: string, patch: Partial<Pick<Offer, 'name' | 'stageId' | 'categoryIds' | 'geoIds' | 'score'>>) => void
  removeOffer: (id: string) => void
  setOfferDoc: (id: string, doc: Block[]) => void
  /** Alterna una categoría o un GEO en la oferta (agrega si falta, saca si está). */
  toggleOfferCategory: (id: string, categoryId: string) => void
  toggleOfferGeo: (id: string, geoId: string) => void

  addStage: (name: string) => void
  updateStage: (id: string, patch: Partial<Omit<OfferStage, 'id'>>) => void
  removeStage: (id: string) => void

  addCategory: (name: string) => void
  updateCategory: (id: string, patch: Partial<Omit<OfferCategory, 'id'>>) => void
  removeCategory: (id: string) => void

  addGeo: (code: string, name: string) => void
  updateGeo: (id: string, patch: Partial<Omit<OfferGeo, 'id'>>) => void
  removeGeo: (id: string) => void
}

const pick = (i: number) => OFFER_PALETTE[i % OFFER_PALETTE.length]

export const useOffersStore = create<State>()(
  persist(
    (set, get) => ({
      systems: [],
      offers: [],
      stages: seedStages(),
      categories: seedCategories(),
      geos: seedGeos(),

      addSystem: (name) => {
        const id = genId()
        const now = nowISO()
        set((s) => ({
          systems: [...s.systems, {
            id, name: name.trim() || 'Nuevo sistema', icon: '⚙️',
            order: s.systems.length, doc: emptyDoc(), createdAt: now, updatedAt: now,
          }],
        }))
        return id
      },
      updateSystem: (id, patch) => set((s) => ({
        systems: s.systems.map((x) => x.id !== id ? x : { ...x, ...patch, updatedAt: nowISO() }),
      })),
      removeSystem: (id) => set((s) => ({
        systems: s.systems.filter((x) => x.id !== id),
        // Las ofertas del sistema se van con él: no tienen sentido sueltas.
        offers: s.offers.filter((o) => o.systemId !== id),
      })),
      setSystemDoc: (id, doc) => set((s) => ({
        systems: s.systems.map((x) => x.id !== id ? x : { ...x, doc, updatedAt: nowISO() }),
      })),

      addOffer: (systemId, name, stageId) => {
        const id = genId()
        const now = nowISO()
        const firstStage = stageId ?? get().stages.slice().sort((a, b) => a.order - b.order)[0]?.id ?? 'stage_stock'
        set((s) => ({
          offers: [...s.offers, {
            id, systemId, name: name.trim() || 'Nueva oferta', stageId: firstStage,
            categoryIds: [], geoIds: [],
            order: s.offers.filter((o) => o.systemId === systemId).length,
            createdAt: now, updatedAt: now,
          }],
        }))
        return id
      },
      updateOffer: (id, patch) => set((s) => ({
        offers: s.offers.map((o) => o.id !== id ? o : { ...o, ...patch, updatedAt: nowISO() }),
      })),
      removeOffer: (id) => set((s) => ({ offers: s.offers.filter((o) => o.id !== id) })),
      setOfferDoc: (id, doc) => set((s) => ({
        offers: s.offers.map((o) => o.id !== id ? o : { ...o, doc, updatedAt: nowISO() }),
      })),
      toggleOfferCategory: (id, categoryId) => set((s) => ({
        offers: s.offers.map((o) => {
          if (o.id !== id) return o
          const has = o.categoryIds.includes(categoryId)
          return {
            ...o,
            categoryIds: has ? o.categoryIds.filter((c) => c !== categoryId) : [...o.categoryIds, categoryId],
            updatedAt: nowISO(),
          }
        }),
      })),
      toggleOfferGeo: (id, geoId) => set((s) => ({
        offers: s.offers.map((o) => {
          if (o.id !== id) return o
          const has = o.geoIds.includes(geoId)
          return {
            ...o,
            geoIds: has ? o.geoIds.filter((g) => g !== geoId) : [...o.geoIds, geoId],
            updatedAt: nowISO(),
          }
        }),
      })),

      addStage: (name) => set((s) => ({
        stages: [...s.stages, { id: genId(), name: name.trim() || 'Etapa', color: pick(s.stages.length), order: s.stages.length }],
      })),
      updateStage: (id, patch) => set((s) => ({
        stages: s.stages.map((x) => x.id !== id ? x : { ...x, ...patch }),
      })),
      removeStage: (id) => set((s) => {
        if (s.stages.length <= 1) return {}   // siempre queda una
        const fallback = s.stages.find((x) => x.id !== id)!.id
        return {
          stages: s.stages.filter((x) => x.id !== id),
          // Las ofertas que estaban ahí no se pierden: caen a otra etapa.
          offers: s.offers.map((o) => o.stageId !== id ? o : { ...o, stageId: fallback, updatedAt: nowISO() }),
        }
      }),

      addCategory: (name) => set((s) => ({
        categories: [...s.categories, { id: genId(), name: name.trim() || 'Categoría', color: pick(s.categories.length) }],
      })),
      updateCategory: (id, patch) => set((s) => ({
        categories: s.categories.map((c) => c.id !== id ? c : { ...c, ...patch }),
      })),
      removeCategory: (id) => set((s) => ({
        categories: s.categories.filter((c) => c.id !== id),
        offers: s.offers.map((o) => !o.categoryIds.includes(id) ? o : { ...o, categoryIds: o.categoryIds.filter((c) => c !== id), updatedAt: nowISO() }),
      })),

      addGeo: (code, name) => set((s) => ({
        geos: [...s.geos, { id: genId(), code: code.trim().toUpperCase() || 'XX', name: name.trim() || code, color: pick(s.geos.length) }],
      })),
      updateGeo: (id, patch) => set((s) => ({
        geos: s.geos.map((g) => g.id !== id ? g : { ...g, ...patch }),
      })),
      removeGeo: (id) => set((s) => ({
        geos: s.geos.filter((g) => g.id !== id),
        offers: s.offers.map((o) => !o.geoIds.includes(id) ? o : { ...o, geoIds: o.geoIds.filter((g) => g !== id), updatedAt: nowISO() }),
      })),
    }),
    {
      name: 'overseer-offers',
      partialize: (s) => ({
        systems: s.systems, offers: s.offers,
        stages: s.stages, categories: s.categories, geos: s.geos,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // Defensas por si el storage quedó a medias.
        if (!Array.isArray(state.systems)) state.systems = []
        if (!Array.isArray(state.offers)) state.offers = []
        if (!Array.isArray(state.stages) || state.stages.length === 0) state.stages = seedStages()
        // Si el campo NO EXISTE (storage viejo o a medias) se reponen las
        // semillas. Si existe pero está vacío, se respeta: significa que el
        // usuario las borró a propósito y no queremos resucitárselas.
        if (!Array.isArray(state.categories)) state.categories = seedCategories()
        if (!Array.isArray(state.geos)) state.geos = seedGeos()
      },
    },
  ),
)
