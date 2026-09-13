'use client'
/**
 * Herramientas — el catálogo de herramientas que usás o querés probar:
 * edición de video, personajes con IA, voces, lo que sea. Cada una con su
 * link, su categoría y una nota de para qué sirve.
 *
 * No es el backlog de YouTube (eso es "qué ver"): esto es "con qué se hace".
 * Un video-tutorial entra acá cuando lo que importa es la HERRAMIENTA que
 * muestra, no el video en sí.
 *
 * Las categorías son texto libre: el usuario las inventa a medida que agrega
 * ("Edición de video", "Personajes IA"…) y la UI le ofrece las que ya existen.
 * No hay lista fija a propósito — la taxonomía es suya, no del sistema.
 *
 * Sync: una fila por herramienta en `tools` (patrón por-fila, igual que
 * decisiones y journal). Regla de oro: TODA mutación bumpea `updatedAt` → el
 * merge LWW nunca pisa una edición local con una copia remota vieja.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function genId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4) }
function nowISO() { return new Date().toISOString() }

export interface Tool {
  id: string
  /** Nombre de la herramienta. Es lo que se ve en la lista. */
  name: string
  /** Link: la web de la herramienta, o el video/tutorial donde la viste. */
  url: string
  /** Texto libre. Vacío = sin categoría. */
  category: string
  /** Para qué la usás, cómo, qué tiene de bueno. */
  notes: string
  favorite: boolean
  createdAt: string
  updatedAt: string
}

type EditableFields = 'name' | 'url' | 'category' | 'notes' | 'favorite'

interface State {
  tools: Tool[]
  /** Crea una herramienta y devuelve su id para abrirla en edición enseguida. */
  addTool: (args?: Partial<Pick<Tool, EditableFields>>) => string
  updateTool: (id: string, patch: Partial<Pick<Tool, EditableFields>>) => void
  removeTool: (id: string) => void
  toggleFavorite: (id: string) => void
}

export const useToolsStore = create<State>()(
  persist(
    (set) => ({
      tools: [],

      addTool: (args) => {
        const id = genId()
        const now = nowISO()
        const tool: Tool = {
          id,
          name: args?.name ?? '',
          url: args?.url ?? '',
          category: args?.category ?? '',
          notes: args?.notes ?? '',
          favorite: args?.favorite ?? false,
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ tools: [tool, ...s.tools] }))
        return id
      },

      updateTool: (id, patch) => set((s) => ({
        tools: s.tools.map((t) => t.id !== id ? t : { ...t, ...patch, updatedAt: nowISO() }),
      })),

      removeTool: (id) => set((s) => ({ tools: s.tools.filter((t) => t.id !== id) })),

      toggleFavorite: (id) => set((s) => ({
        tools: s.tools.map((t) => t.id !== id ? t : { ...t, favorite: !t.favorite, updatedAt: nowISO() }),
      })),
    }),
    {
      name: 'overseer-tools',
      partialize: (s) => ({ tools: s.tools }),
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.tools)) state.tools = []
      },
    },
  ),
)

// ─── Helpers puros (con test en toolsStore.test.ts) ─────────────────────────

/** Las categorías que existen hoy, sin repetir y en orden alfabético. Sirve
 *  para ofrecerlas al cargar una nueva: la taxonomía la arma el usuario. */
export function toolCategories(tools: Tool[]): string[] {
  const set = new Set<string>()
  for (const t of tools) {
    const c = t.category.trim()
    if (c) set.add(c)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export interface ToolFilters {
  category?: string | 'todas'
  onlyFavorites?: boolean
  /** Busca en nombre, categoría, notas y url (case-insensitive). */
  query?: string
}

export function filterTools(tools: Tool[], f: ToolFilters): Tool[] {
  const q = (f.query ?? '').trim().toLowerCase()
  return tools.filter((t) => {
    if (f.category && f.category !== 'todas' && t.category.trim() !== f.category) return false
    if (f.onlyFavorites && !t.favorite) return false
    if (q && !`${t.name} ${t.category} ${t.notes} ${t.url}`.toLowerCase().includes(q)) return false
    return true
  })
}

/** Favoritas primero, y adentro de cada grupo las más nuevas arriba. Acá SÍ se
 *  suben las favoritas al tope (al revés que en Decisiones): un catálogo no
 *  tiene línea de tiempo que cuidar, y lo que más usás tiene que estar a mano. */
export function sortTools(tools: Tool[]): Tool[] {
  return [...tools].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
    return b.createdAt.localeCompare(a.createdAt)
  })
}

/** Dominio legible de una URL ("youtube.com", "vibecut.ai"). Vacío si no parsea. */
export function toolHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
