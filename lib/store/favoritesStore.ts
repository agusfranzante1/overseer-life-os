'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Dashboard favorites — bookmarks a links externos que el usuario
 *  quiere tener a un click desde el dashboard. Tipo barra de marcadores,
 *  pero como un panel del Overseer. Click → abre URL en nueva pestaña.
 *
 *  Schema mínimo: cada favorito tiene id, nombre (label), url, y opcional
 *  emoji para identificarlo visualmente. Más adelante se puede agregar
 *  color de fondo, categorías, etc. */
export interface Favorite {
  id: string
  label: string
  url: string
  emoji?: string
  createdAt: string
}

interface State {
  favorites: Favorite[]
  addFavorite: (args: { label: string; url: string; emoji?: string }) => string
  updateFavorite: (id: string, patch: Partial<Omit<Favorite, 'id' | 'createdAt'>>) => void
  removeFavorite: (id: string) => void
  reorderFavorites: (orderedIds: string[]) => void
}

function genId() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3) }

/** Normaliza una URL para que `https://...` se asuma si el usuario solo
 *  pegó "google.com". Esto evita que el `<a href>` la trate como ruta
 *  relativa al dashboard. */
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^mailto:|^tel:|^sms:/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export const useFavoritesStore = create<State>()(
  persist(
    (set) => ({
      favorites: [],
      addFavorite: ({ label, url, emoji }) => {
        const id = genId()
        const fav: Favorite = {
          id,
          label: label.trim() || 'Sin nombre',
          url: normalizeUrl(url),
          emoji: emoji?.trim() || undefined,
          createdAt: new Date().toISOString(),
        }
        set((s) => ({ favorites: [...s.favorites, fav] }))
        return id
      },
      updateFavorite: (id, patch) => set((s) => ({
        favorites: s.favorites.map((f) => f.id === id
          ? { ...f, ...patch, url: patch.url !== undefined ? normalizeUrl(patch.url) : f.url }
          : f),
      })),
      removeFavorite: (id) => set((s) => ({ favorites: s.favorites.filter((f) => f.id !== id) })),
      reorderFavorites: (orderedIds) => set((s) => {
        const byId = new Map(s.favorites.map((f) => [f.id, f]))
        const reordered: Favorite[] = []
        const used = new Set<string>()
        for (const id of orderedIds) {
          const f = byId.get(id)
          if (f && !used.has(id)) { reordered.push(f); used.add(id) }
        }
        for (const f of s.favorites) if (!used.has(f.id)) reordered.push(f)
        return { favorites: reordered }
      }),
    }),
    { name: 'overseer-favorites' }
  )
)
