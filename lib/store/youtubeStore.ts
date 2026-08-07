'use client'
/**
 * YouTube — cola personal de videos para ver, en formato kanban.
 *
 * Cada item es un link de YouTube con título, categoría, notas y un estado
 * ('Por ver' / 'Viendo' / 'Visto'). Se persiste en localStorage y sincroniza
 * multi-device (una fila por item en `youtube_items`, mismo patrón por-fila
 * que meditaciones y journal).
 *
 * Regla de oro del sync: TODA mutación bumpea `updatedAt` → el merge LWW
 * nunca pisa una edición local con una copia remota vieja.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function genId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4) }
function nowISO() { return new Date().toISOString() }

/** Columnas del kanban, en orden de izquierda a derecha. */
export const YOUTUBE_STATUSES = ['backlog', 'watching', 'done'] as const
export type YoutubeStatus = (typeof YOUTUBE_STATUSES)[number]

export const YOUTUBE_STATUS_LABEL: Record<YoutubeStatus, string> = {
  backlog: 'Por ver',
  watching: 'Viendo',
  done: 'Visto',
}

/** Categorías sugeridas. Lista abierta — son solo los presets del selector. */
export const YOUTUBE_CATEGORIES = [
  'General',
  'Trading',
  'Programación',
  'Negocios',
  'Salud',
  'Mentalidad',
  'Ocio',
] as const

export interface YoutubeItem {
  id: string
  /** Título que muestra la tarjeta. Si el usuario no pone nada, cae al link. */
  title: string
  /** URL original tal como la pegó el usuario (se guarda cruda). */
  url: string
  /** Id de video ya parseado. null = el link no era un video de YouTube; el
   *  item igual se guarda, pero sin reproductor ni miniatura. */
  videoId: string | null
  status: YoutubeStatus
  category: string
  notes?: string
  favorite: boolean
  createdAt: string
  updatedAt: string
  /** Cuándo pasó a 'Visto'. Se limpia si vuelve atrás. */
  completedAt?: string
}

type EditableFields = Pick<YoutubeItem, 'title' | 'url' | 'videoId' | 'category' | 'notes' | 'favorite'>

interface State {
  items: YoutubeItem[]

  addItem: (args: { url: string; videoId: string | null } & Partial<Pick<YoutubeItem, 'title' | 'category' | 'notes' | 'status'>>) => string
  updateItem: (id: string, patch: Partial<EditableFields>) => void
  /** Mueve entre columnas. Al pasar a 'Visto' sella completedAt; al sacarlo
   *  de 'Visto' lo limpia, para que el contador de avance no mienta. */
  setStatus: (id: string, status: YoutubeStatus) => void
  toggleFavorite: (id: string) => void
  removeItem: (id: string) => void
}

export const useYoutubeStore = create<State>()(
  persist(
    (set) => ({
      items: [],

      addItem: (args) => {
        const id = genId()
        const now = nowISO()
        const item: YoutubeItem = {
          id,
          title: args.title?.trim() || '',
          url: args.url.trim(),
          videoId: args.videoId,
          status: args.status ?? 'backlog',
          category: args.category ?? YOUTUBE_CATEGORIES[0],
          ...(args.notes ? { notes: args.notes } : {}),
          favorite: false,
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ items: [item, ...s.items] }))
        return id
      },

      updateItem: (id, patch) => set((s) => ({
        items: s.items.map((it) => it.id !== id ? it : { ...it, ...patch, updatedAt: nowISO() }),
      })),

      setStatus: (id, status) => set((s) => ({
        items: s.items.map((it) => {
          if (it.id !== id) return it
          const next: YoutubeItem = { ...it, status, updatedAt: nowISO() }
          if (status === 'done') next.completedAt = nowISO()
          else delete next.completedAt
          return next
        }),
      })),

      toggleFavorite: (id) => set((s) => ({
        items: s.items.map((it) => it.id !== id ? it : { ...it, favorite: !it.favorite, updatedAt: nowISO() }),
      })),

      removeItem: (id) => set((s) => ({ items: s.items.filter((it) => it.id !== id) })),
    }),
    {
      name: 'overseer-youtube',
      partialize: (s) => ({ items: s.items }),
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.items)) state.items = []
      },
    },
  ),
)

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Orden dentro de una columna: favoritos primero, después los más nuevos. */
export function sortYoutubeItems(items: YoutubeItem[]): YoutubeItem[] {
  return [...items].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
    return b.createdAt.localeCompare(a.createdAt)
  })
}
