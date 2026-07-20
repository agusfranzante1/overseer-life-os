'use client'
/**
 * My Journal — diario personal de aprendizajes.
 *
 * Cada entrada tiene una FECHA editable (auto = hoy al crear, pero se puede
 * cambiar si estás cargando algo de otro día), un título y un cuerpo libre.
 * Todo se persiste en localStorage y sincroniza multi-device (una fila por
 * entrada en `journal_entries`, patrón mindmaps por-fila).
 *
 * Regla de oro del sync: TODA mutación bumpea `updatedAt` → el merge LWW
 * nunca pisa una edición local con una copia remota vieja.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function genId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4) }
function nowISO() { return new Date().toISOString() }
function todayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface JournalEntry {
  id: string
  /** Día de la entrada — "YYYY-MM-DD". Editable (default = hoy al crear). */
  date: string
  title: string
  body: string
  createdAt: string
  updatedAt: string
}

interface State {
  entries: JournalEntry[]

  /** Crea una entrada vacía con la fecha de hoy y devuelve su id (para
   *  abrirla en edición enseguida). */
  addEntry: (args?: { date?: string; title?: string; body?: string }) => string
  updateEntry: (id: string, patch: Partial<Pick<JournalEntry, 'date' | 'title' | 'body'>>) => void
  removeEntry: (id: string) => void
}

export const useJournalStore = create<State>()(
  persist(
    (set) => ({
      entries: [],

      addEntry: (args) => {
        const id = genId()
        const now = nowISO()
        const entry: JournalEntry = {
          id,
          date: args?.date ?? todayYmd(),
          title: args?.title ?? '',
          body: args?.body ?? '',
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ entries: [entry, ...s.entries] }))
        return id
      },

      updateEntry: (id, patch) => set((s) => ({
        entries: s.entries.map((e) => e.id !== id ? e : { ...e, ...patch, updatedAt: nowISO() }),
      })),

      removeEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
    }),
    {
      name: 'overseer-journal',
      partialize: (s) => ({ entries: s.entries }),
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.entries)) state.entries = []
      },
    },
  ),
)

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Orden cronológico DESCENDENTE (más nuevas primero) por fecha, y dentro del
 *  mismo día por createdAt. Es el orden que ve el usuario en la lista. */
export function sortEntries(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    return b.createdAt.localeCompare(a.createdAt)
  })
}

/** Etiqueta legible de una fecha YYYY-MM-DD (ej. "lunes, 6 de julio de 2026").
 *  Construye el Date en hora local para no correrse un día por UTC. */
export function formatEntryDate(ymd: string, locale = 'es-AR'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
  if (!m) return ymd
  const d = new Date(+m[1], +m[2] - 1, +m[3])
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/** Serializa TODAS las entradas a texto plano (markdown liviano) para copiar y
 *  pegar en ChatGPT: ordenadas ASCENDENTE (viejas → nuevas) así se lee como una
 *  línea de tiempo del avance. Incluye la fecha de cada una. */
export function buildJournalExport(entries: JournalEntry[]): string {
  const chrono = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.createdAt.localeCompare(b.createdAt)
  })
  const blocks = chrono.map((e) => {
    const header = `## ${formatEntryDate(e.date)}${e.title.trim() ? ` — ${e.title.trim()}` : ''}`
    const body = e.body.trim() || '(sin texto)'
    return `${header}\n\n${body}`
  })
  return `# Mi Journal (${chrono.length} ${chrono.length === 1 ? 'entrada' : 'entradas'})\n\n${blocks.join('\n\n---\n\n')}`
}
