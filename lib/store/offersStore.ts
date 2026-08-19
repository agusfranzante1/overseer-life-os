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
import { type Block, emptyDoc, newId } from '@/lib/offers/blocks'

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
  /** Contador de versión MONOTÓNICO del `doc`. Sube +1 en cada edición del
   *  documento. El merge multi-device resuelve el `doc` por ESTE contador (no
   *  por `updatedAt`), así una diferencia de reloj entre dispositivos nunca
   *  deja que una copia vieja pise lo nuevo. La metadata (nombre/icon/orden)
   *  sigue resolviéndose por `updatedAt`. */
  docRev?: number
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
  /** Contador de versión monotónico del `doc` — ver `OfferSystem.docRev`. */
  docRev?: number
  order: number
  createdAt: string
  updatedAt: string
}

// ─── Semillas ────────────────────────────────────────────────────────────────
// El pipeline que describe el usuario: arranca en STH, si tracciona pasa a UGO,
// si no a No traccionó. "Stock" es el pozo de ofertas sin empezar y
// "Seleccionado" las elegidas para largar.

export interface OfferTemplate {
  id: string
  name: string
  doc: Block[]
  createdAt: string
  updatedAt: string
}

function cloneBlocksWithNewIds(blocks: Block[]): Block[] {
  return blocks.map((b) => ({
    id: newId(),
    type: b.type,
    text: b.text,
    ...(b.children ? { children: cloneBlocksWithNewIds(b.children) } : {}),
    ...(typeof b.collapsed === 'boolean' ? { collapsed: b.collapsed } : {}),
  }))
}

function blockHasContent(block: Block): boolean {
  if (block.text.trim().length > 0) return true
  if (block.type === 'toggle' || block.type === 'page') return true
  return (block.children ?? []).some(blockHasContent)
}

function docIsEmpty(doc: Block[] | undefined): boolean {
  if (!doc || doc.length === 0) return true
  return !doc.some(blockHasContent)
}

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
  // IDs FIJOS (no genId()): las etapas ya los tenían fijos, pero categorías y
  // geos usaban ids random → cada dispositivo sembraba ids distintos para las
  // MISMAS categorías, y las selecciones de las ofertas (categoryIds) no
  // resolvían en el otro device (caían al default). Con ids fijos, "Salud" es
  // `cat_salud` en todos lados y la selección sincroniza siempre.
  return [
    { id: 'cat_salud', name: 'Salud & Bienestar', color: '#ec4899' },
    { id: 'cat_alim', name: 'Alimentación', color: '#f59e0b' },
    { id: 'cat_manif', name: 'Manifestación', color: '#10b981' },
    { id: 'cat_crianza', name: 'Crianza', color: '#a855f7' },
  ]
}

function seedGeos(): OfferGeo[] {
  // IDs FIJOS por código (ver nota en seedCategories). "Español" = `geo_es` en
  // todos los dispositivos → la selección de idioma de una oferta sincroniza.
  return [
    { id: 'geo_es', code: 'ES', name: 'Español', color: '#f59e0b' },
    { id: 'geo_en', code: 'EN', name: 'Inglés', color: '#6366f1' },
    { id: 'geo_pt', code: 'PT', name: 'Portugués', color: '#10b981' },
  ]
}

/** Outbox LOCAL de borrados EXPLÍCITOS del usuario, pendientes de propagar al
 *  cloud (delete + tombstone). Es el corazón del "borrado por intención": el
 *  sync borra de la nube SOLO lo que está acá — nunca infiere borrados por
 *  ausencia (baseline − local), que es lo que borraba filas por una lista
 *  parcial. Vive local (no viaja como fila sincronizada); el push lo consume
 *  y lo limpia. */
export interface OffersPendingDeletes {
  systems: string[]
  offers: string[]
  templates: string[]
}

interface State {
  systems: OfferSystem[]
  offers: Offer[]
  templates: OfferTemplate[]
  stages: OfferStage[]
  categories: OfferCategory[]
  geos: OfferGeo[]
  /** Borrados explícitos pendientes de subir. Ver `OffersPendingDeletes`. */
  pendingDeletes: OffersPendingDeletes

  addSystem: (name: string) => string
  updateSystem: (id: string, patch: Partial<Pick<OfferSystem, 'name' | 'icon'>>) => void
  removeSystem: (id: string) => void
  setSystemDoc: (id: string, doc: Block[]) => void

  /** Consume ids del outbox de borrados (los llama el sync tras subirlos). */
  clearPendingDeletes: (kind: keyof OffersPendingDeletes, ids: string[]) => void

  addOffer: (systemId: string, name: string, stageId?: string) => string
  updateOffer: (id: string, patch: Partial<Pick<Offer, 'name' | 'stageId' | 'categoryIds' | 'geoIds' | 'score'>>) => void
  removeOffer: (id: string) => void
  setOfferDoc: (id: string, doc: Block[]) => void
  saveOfferAsTemplate: (offerId: string, name: string) => string | null
  applyTemplate: (offerId: string, templateId: string) => void
  renameTemplate: (id: string, name: string) => void
  removeTemplate: (id: string) => void
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

  /** Heal one-shot idempotente: remapea categorías/geos SEMBRADAS que quedaron
   *  con id random (datos viejos) a los ids fijos, y actualiza las referencias
   *  de las ofertas (categoryIds/geoIds). Deduplica si ya existe el id fijo.
   *  Corre en cada mount; si ya está todo canónico, es no-op. Arregla que las
   *  selecciones de idioma/categoría no sincronizaban entre dispositivos. */
  normalizeSeedCatalogIds: () => void
}

const pick = (i: number) => OFFER_PALETTE[i % OFFER_PALETTE.length]

export const useOffersStore = create<State>()(
  persist(
    (set, get) => ({
      systems: [],
      offers: [],
      templates: [],
      stages: seedStages(),
      categories: seedCategories(),
      geos: seedGeos(),
      pendingDeletes: { systems: [], offers: [], templates: [] },

      clearPendingDeletes: (kind, ids) => set((s) => ({
        pendingDeletes: {
          ...s.pendingDeletes,
          [kind]: s.pendingDeletes[kind].filter((x) => !ids.includes(x)),
        },
      })),

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
      removeSystem: (id) => set((s) => {
        // Las ofertas del sistema se van con él: registramos SUS ids también
        // en el outbox para que el sync las borre explícitamente del cloud.
        const removedOfferIds = s.offers.filter((o) => o.systemId === id).map((o) => o.id)
        return {
          systems: s.systems.filter((x) => x.id !== id),
          offers: s.offers.filter((o) => o.systemId !== id),
          pendingDeletes: {
            ...s.pendingDeletes,
            systems: [...s.pendingDeletes.systems, id],
            offers: [...s.pendingDeletes.offers, ...removedOfferIds],
          },
        }
      }),
      setSystemDoc: (id, doc) => set((s) => ({
        systems: s.systems.map((x) => x.id !== id ? x : { ...x, doc, docRev: (x.docRev ?? 0) + 1, updatedAt: nowISO() }),
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
      removeOffer: (id) => set((s) => ({
        offers: s.offers.filter((o) => o.id !== id),
        pendingDeletes: { ...s.pendingDeletes, offers: [...s.pendingDeletes.offers, id] },
      })),
      setOfferDoc: (id, doc) => set((s) => ({
        offers: s.offers.map((o) => o.id !== id ? o : { ...o, doc, docRev: (o.docRev ?? 0) + 1, updatedAt: nowISO() }),
      })),
      saveOfferAsTemplate: (offerId, name) => {
        const offer = get().offers.find((o) => o.id === offerId)
        if (!offer) return null
        const id = genId()
        const now = nowISO()
        const sourceDoc = Array.isArray(offer.doc) ? offer.doc : emptyDoc()
        set((s) => ({
          templates: [...s.templates, {
            id,
            name: name.trim() || 'Plantilla',
            doc: cloneBlocksWithNewIds(sourceDoc),
            createdAt: now,
            updatedAt: now,
          }],
        }))
        return id
      },
      applyTemplate: (offerId, templateId) => {
        const template = get().templates.find((t) => t.id === templateId)
        if (!template) return
        set((s) => ({
          offers: s.offers.map((o) => {
            if (o.id !== offerId) return o
            const currentDoc = Array.isArray(o.doc) ? o.doc : emptyDoc()
            const freshDoc = cloneBlocksWithNewIds(template.doc)
            return {
              ...o,
              doc: docIsEmpty(currentDoc) ? freshDoc : [...currentDoc, ...freshDoc],
              docRev: (o.docRev ?? 0) + 1,
              updatedAt: nowISO(),
            }
          }),
        }))
      },
      renameTemplate: (id, name) => set((s) => ({
        templates: s.templates.map((t) => t.id !== id ? t : { ...t, name: name.trim() || 'Plantilla', updatedAt: nowISO() }),
      })),
      removeTemplate: (id) => set((s) => ({
        templates: s.templates.filter((t) => t.id !== id),
        pendingDeletes: { ...s.pendingDeletes, templates: [...s.pendingDeletes.templates, id] },
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

      normalizeSeedCatalogIds: () => set((s) => {
        const norm = (t: string) => (t ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        // Claves ESTABLES: categorías por nombre, geos por código.
        const CAT_CANON: Record<string, string> = {
          'salud & bienestar': 'cat_salud', 'alimentacion': 'cat_alim',
          'manifestacion': 'cat_manif', 'crianza': 'cat_crianza',
        }
        const GEO_CANON: Record<string, string> = { es: 'geo_es', en: 'geo_en', pt: 'geo_pt' }

        const idRemap = new Map<string, string>()

        const catSeen = new Set<string>()
        const categories: OfferCategory[] = []
        for (const c of s.categories) {
          const canon = CAT_CANON[norm(c.name)]
          if (canon && c.id !== canon) idRemap.set(c.id, canon)
          const finalId = canon ?? c.id
          if (canon) { if (catSeen.has(canon)) continue; catSeen.add(canon) }   // dedup el fijo
          categories.push(finalId === c.id ? c : { ...c, id: finalId })
        }

        const geoSeen = new Set<string>()
        const geos: OfferGeo[] = []
        for (const g of s.geos) {
          const canon = GEO_CANON[norm(g.code)]
          if (canon && g.id !== canon) idRemap.set(g.id, canon)
          const finalId = canon ?? g.id
          if (canon) { if (geoSeen.has(canon)) continue; geoSeen.add(canon) }
          geos.push(finalId === g.id ? g : { ...g, id: finalId })
        }

        if (idRemap.size === 0) return {}   // ya canónico → no-op idempotente

        const mapId = (id: string) => idRemap.get(id) ?? id
        const dedupe = (arr: string[]) => [...new Set(arr.map(mapId))]
        // NO bumpeamos updatedAt: el heal es determinista (mismos ids fijos en
        // todo dispositivo), así cada device converge solo sin pelear el LWW.
        const offers = s.offers.map((o) => {
          const nextCats = dedupe(o.categoryIds)
          const nextGeos = dedupe(o.geoIds)
          const changed = nextCats.join() !== o.categoryIds.join() || nextGeos.join() !== o.geoIds.join()
          return changed ? { ...o, categoryIds: nextCats, geoIds: nextGeos } : o
        })
        return { categories, geos, offers }
      }),
    }),
    {
      name: 'overseer-offers',
      partialize: (s) => ({
        systems: s.systems, offers: s.offers, templates: s.templates,
        stages: s.stages, categories: s.categories, geos: s.geos,
        pendingDeletes: s.pendingDeletes,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // Defensas por si el storage quedó a medias.
        if (!state.pendingDeletes || typeof state.pendingDeletes !== 'object') {
          state.pendingDeletes = { systems: [], offers: [], templates: [] }
        } else {
          // Cada lista defensiva (storage viejo sin alguna clave).
          state.pendingDeletes = {
            systems: Array.isArray(state.pendingDeletes.systems) ? state.pendingDeletes.systems : [],
            offers: Array.isArray(state.pendingDeletes.offers) ? state.pendingDeletes.offers : [],
            templates: Array.isArray(state.pendingDeletes.templates) ? state.pendingDeletes.templates : [],
          }
        }
        if (!Array.isArray(state.systems)) state.systems = []
        if (!Array.isArray(state.offers)) state.offers = []
        if (!Array.isArray(state.templates)) state.templates = []
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
