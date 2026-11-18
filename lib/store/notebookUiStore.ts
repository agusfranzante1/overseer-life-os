'use client'
/**
 * Cómo se ve el Cuaderno EN ESTE DISPOSITIVO: escondido en la pestañita, con
 * la tapa cerrada o abierto; dónde quedó sobre la pantalla y de qué tamaño.
 *
 * Solo localStorage, NO se sincroniza a propósito: el cuaderno en x=1500 de la
 * PC queda afuera de la pantalla de la notebook, y en el celu ocupa la
 * pantalla entera. El contenido y la tapa sí sincronizan (`notebookStore`).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Papel } from './notebookStore'

/** oculto = solo la pestañita · tapa = el cuaderno cerrado · abierto = escribiendo */
export type ModoCuaderno = 'oculto' | 'tapa' | 'abierto'
export type TonoPapel = 'crema' | 'blanco' | 'noche'
export type Letra = 'manuscrita' | 'clasica'

export interface Rect { x: number; y: number; w: number; h: number }

interface Datos {
  modo: ModoCuaderno
  /** Al esconderlo se recuerda cómo estaba, para volver igual. */
  ultimoVisible: 'tapa' | 'abierto'
  /** Dónde está y qué tamaño tiene. null = todavía no se movió (arranca a la derecha). */
  rect: Rect | null
  /** Hoja abierta: id de una nota, o null = el diario en `fechaDiario`. */
  hojaId: string | null
  /** null = hoy (sigue siendo "hoy" aunque pase la medianoche). */
  fechaDiario: string | null
  papelDefault: Papel
  tono: TonoPapel
  letra: Letra
}

interface State extends Datos {
  set: (patch: Partial<Datos>) => void
  mostrar: () => void
  esconder: () => void
}

export const MIN_W = 320
export const MIN_H = 420

export const useNotebookUiStore = create<State>()(
  persist(
    (set, get) => ({
      modo: 'oculto',
      ultimoVisible: 'tapa',
      rect: null,
      hojaId: null,
      fechaDiario: null,
      papelDefault: 'renglones',
      tono: 'crema',
      letra: 'manuscrita',
      set: (patch) => set((s) => ({
        ...patch,
        ultimoVisible: patch.modo === 'tapa' || patch.modo === 'abierto' ? patch.modo : s.ultimoVisible,
      })),
      mostrar: () => set({ modo: get().ultimoVisible }),
      esconder: () => {
        const { modo, ultimoVisible } = get()
        set({ modo: 'oculto', ultimoVisible: modo === 'oculto' ? ultimoVisible : modo })
      },
    }),
    {
      name: 'overseer-notebook-ui',
      version: 1,
      partialize: (s) => {
        const { set: _s, mostrar: _m, esconder: _e, ...rest } = s
        void _s; void _m; void _e
        return rest
      },
      migrate: migrarUi,
    },
  ),
)

/** v0 tenía lateral/flotante/cerrado y un rect solo para la ventana flotante.
 *  Ahora el cuaderno siempre flota: se conserva esa posición. */
export function migrarUi(old: unknown, version: number): Datos {
  const o = (old ?? {}) as Record<string, unknown>
  if (version < 1) {
    const modoViejo = o.modo
    return {
      ...o,
      modo: modoViejo === 'lateral' || modoViejo === 'flotante' ? 'abierto' : 'oculto',
      ultimoVisible: 'abierto',
      rect: (o.flotante as Rect | null) ?? null,
    } as unknown as Datos
  }
  return o as unknown as Datos
}

/** Mete el cuaderno adentro de la pantalla (la PC y la notebook tienen
 *  pantallas distintas, y un cuaderno que quedó afuera no se puede agarrar). */
export function encajarRect(r: Rect, vw: number, vh: number): Rect {
  const w = Math.min(Math.max(r.w, MIN_W), vw - 16)
  const h = Math.min(Math.max(r.h, MIN_H), vh - 16)
  const x = Math.min(Math.max(r.x, 8), vw - w - 8)
  const y = Math.min(Math.max(r.y, 8), vh - h - 8)
  return { x, y, w, h }
}

/** Primera vez: tamaño A5 (1 : 1,41) contra el borde derecho, centrado en alto. */
export function rectInicial(vw: number, vh: number): Rect {
  const h = Math.min(660, vh - 60)
  const w = Math.min(Math.round(h / 1.41), vw - 40)
  return encajarRect({ x: vw - w - 36, y: Math.round((vh - h) / 2), w, h }, vw, vh)
}
