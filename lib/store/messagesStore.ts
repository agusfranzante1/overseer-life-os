'use client'
/**
 * Mensajes para Claude — el buzón de lo que el usuario le dicta a un chat de
 * Claude para que se lo pase a OTRO ("mandale a Karla que…").
 *
 * Antes esto se guardaba como una Decisión con una línea "Para <chat>: …" al
 * final, y se mezclaba con las decisiones de verdad. Ahora es su propio
 * dominio: lo escribe el chat de claude.ai por el bridge (`upsert_record`,
 * dominio `mensajes`), lo reparte el "cartero" (la tarea programada del Buzón)
 * y el mismo cartero lo marca `entregado`. La app solo lo muestra y deja
 * marcarlo a mano.
 *
 * Sync: una fila por mensaje en `claude_messages` (patrón por-fila, igual que
 * herramientas y decisiones). Regla de oro: TODA mutación bumpea `updatedAt` →
 * el merge LWW nunca pisa una edición local con una copia remota vieja.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function genId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4) }
function nowISO() { return new Date().toISOString() }
function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type EstadoMensaje = 'pendiente' | 'entregado'

export interface MensajeClaude {
  id: string
  /** Nombre del chat destino, tal como lo dice el usuario ("Karla Final"). */
  para: string
  texto: string
  /** Día en que se dictó, YYYY-MM-DD en la zona del usuario. */
  fecha: string
  /** De dónde vino: 'voz' (dictado desde el celu), 'app', lo que mande el bridge. */
  origen: string
  estado: EstadoMensaje
  /** Cuándo lo entregó el cartero (ISO). Sin entregar = undefined. */
  entregadoEn?: string
  createdAt: string
  updatedAt: string
}

type EditableFields = 'para' | 'texto' | 'fecha' | 'origen'

interface State {
  mensajes: MensajeClaude[]
  addMensaje: (args: Partial<Pick<MensajeClaude, EditableFields>>) => string
  updateMensaje: (id: string, patch: Partial<Pick<MensajeClaude, EditableFields>>) => void
  /** Marca entregado (con la hora) o lo devuelve a pendiente. */
  setEstado: (id: string, estado: EstadoMensaje) => void
  removeMensaje: (id: string) => void
}

export const useMessagesStore = create<State>()(
  persist(
    (set) => ({
      mensajes: [],

      addMensaje: (args) => {
        const id = genId()
        const now = nowISO()
        const m: MensajeClaude = {
          id,
          para: args.para?.trim() ?? '',
          texto: args.texto ?? '',
          fecha: args.fecha ?? todayLocal(),
          origen: args.origen ?? 'app',
          estado: 'pendiente',
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ mensajes: [m, ...s.mensajes] }))
        return id
      },

      updateMensaje: (id, patch) => set((s) => ({
        mensajes: s.mensajes.map((m) => m.id !== id ? m : { ...m, ...patch, updatedAt: nowISO() }),
      })),

      setEstado: (id, estado) => set((s) => ({
        mensajes: s.mensajes.map((m) => m.id !== id ? m : {
          ...m,
          estado,
          entregadoEn: estado === 'entregado' ? (m.entregadoEn ?? nowISO()) : undefined,
          updatedAt: nowISO(),
        }),
      })),

      removeMensaje: (id) => set((s) => ({ mensajes: s.mensajes.filter((m) => m.id !== id) })),
    }),
    {
      name: 'overseer-claude-messages',
      partialize: (s) => ({ mensajes: s.mensajes }),
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.mensajes)) state.mensajes = []
      },
    },
  ),
)

// ─── Helpers puros (con test en messagesStore.test.ts) ───────────────────────

/** Los destinos que ya existen, sin repetir (sin distinguir mayúsculas) y en
 *  orden alfabético: para los chips de filtro y para ofrecerlos al escribir. */
export function destinos(mensajes: MensajeClaude[]): string[] {
  const byKey = new Map<string, string>()
  for (const m of mensajes) {
    const p = m.para.trim()
    if (p && !byKey.has(p.toLowerCase())) byKey.set(p.toLowerCase(), p)
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b))
}

export interface FiltroMensajes {
  estado?: EstadoMensaje | 'todos'
  /** Destino exacto (sin distinguir mayúsculas). Vacío/'todos' = cualquiera. */
  para?: string
  query?: string
}

export function filtrarMensajes(mensajes: MensajeClaude[], f: FiltroMensajes): MensajeClaude[] {
  const q = (f.query ?? '').trim().toLowerCase()
  const para = (f.para ?? '').trim().toLowerCase()
  return mensajes.filter((m) => {
    if (f.estado && f.estado !== 'todos' && m.estado !== f.estado) return false
    if (para && para !== 'todos' && m.para.trim().toLowerCase() !== para) return false
    if (q && !`${m.para} ${m.texto}`.toLowerCase().includes(q)) return false
    return true
  })
}

/** Pendientes arriba (lo que falta entregar es lo que importa); adentro de
 *  cada grupo, lo más nuevo primero. */
export function ordenarMensajes(mensajes: MensajeClaude[]): MensajeClaude[] {
  return [...mensajes].sort((a, b) => {
    if (a.estado !== b.estado) return a.estado === 'pendiente' ? -1 : 1
    return b.createdAt.localeCompare(a.createdAt)
  })
}
