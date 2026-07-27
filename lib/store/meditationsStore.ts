'use client'
/**
 * Meditaciones — biblioteca personal de meditaciones y prácticas de
 * respiración.
 *
 * Cada meditación tiene un título, un guión/texto libre, una categoría
 * (respiración, sueño, foco, etc.), un flag de favorito (para destacar las
 * mejores) y opcionalmente un enlace/audio embebido (YouTube, Spotify, mp3…).
 * Todo se persiste en localStorage y sincroniza multi-device (una fila por
 * meditación en `meditation_entries`, mismo patrón por-fila que journal).
 *
 * Regla de oro del sync: TODA mutación bumpea `updatedAt` → el merge LWW
 * nunca pisa una edición local con una copia remota vieja.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function genId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4) }
function nowISO() { return new Date().toISOString() }

/** Categorías sugeridas. Es una lista abierta — el usuario puede escribir la
 *  que quiera; estas son solo los presets que aparecen en el selector. */
export const MEDITATION_CATEGORIES = [
  'Respiración',
  'Sueño',
  'Foco',
  'Ansiedad',
  'Gratitud',
  'Body scan',
  'Visualización',
  'Otra',
] as const

export interface Meditation {
  id: string
  title: string
  /** Guión / texto libre de la meditación. */
  script: string
  /** Categoría (respiración, sueño, etc.). Libre — default 'Respiración'. */
  category: string
  /** Destacada por el usuario como una de las mejores. */
  favorite: boolean
  /** Enlace o audio embebido opcional (YouTube, Spotify, mp3, etc.). */
  audioUrl?: string
  createdAt: string
  updatedAt: string
}

interface State {
  meditations: Meditation[]

  /** Crea una meditación (opcionalmente pre-cargada) y devuelve su id para
   *  abrirla en edición enseguida. */
  addMeditation: (args?: Partial<Pick<Meditation, 'title' | 'script' | 'category' | 'favorite' | 'audioUrl'>>) => string
  updateMeditation: (id: string, patch: Partial<Pick<Meditation, 'title' | 'script' | 'category' | 'favorite' | 'audioUrl'>>) => void
  toggleFavorite: (id: string) => void
  removeMeditation: (id: string) => void
}

export const useMeditationsStore = create<State>()(
  persist(
    (set) => ({
      meditations: [],

      addMeditation: (args) => {
        const id = genId()
        const now = nowISO()
        const med: Meditation = {
          id,
          title: args?.title ?? '',
          script: args?.script ?? '',
          category: args?.category ?? MEDITATION_CATEGORIES[0],
          favorite: args?.favorite ?? false,
          ...(args?.audioUrl ? { audioUrl: args.audioUrl } : {}),
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ meditations: [med, ...s.meditations] }))
        return id
      },

      updateMeditation: (id, patch) => set((s) => ({
        meditations: s.meditations.map((m) => m.id !== id ? m : { ...m, ...patch, updatedAt: nowISO() }),
      })),

      toggleFavorite: (id) => set((s) => ({
        meditations: s.meditations.map((m) => m.id !== id ? m : { ...m, favorite: !m.favorite, updatedAt: nowISO() }),
      })),

      removeMeditation: (id) => set((s) => ({ meditations: s.meditations.filter((m) => m.id !== id) })),
    }),
    {
      name: 'overseer-meditations',
      partialize: (s) => ({ meditations: s.meditations }),
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.meditations)) state.meditations = []
      },
    },
  ),
)

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Orden que ve el usuario: favoritas primero, luego por fecha de creación
 *  (más nuevas arriba). */
export function sortMeditations(meds: Meditation[]): Meditation[] {
  return [...meds].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
    return b.createdAt.localeCompare(a.createdAt)
  })
}
