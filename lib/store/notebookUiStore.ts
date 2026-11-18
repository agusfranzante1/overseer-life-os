'use client'
/**
 * Cómo se ve el Cuaderno EN ESTE DISPOSITIVO: abierto o escondido en la
 * pestañita, al costado o flotando, su tamaño y dónde quedó la ventana.
 *
 * Solo localStorage, NO se sincroniza a propósito: la ventana flotante en
 * x=900 de la PC queda afuera de la pantalla de la notebook, y en el celu el
 * cuaderno siempre ocupa la pantalla entera. El contenido sí sincroniza
 * (`notebookStore`).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Papel } from './notebookStore'

export type ModoCuaderno = 'cerrado' | 'lateral' | 'flotante'
export type TonoPapel = 'crema' | 'blanco' | 'noche'
export type Letra = 'manuscrita' | 'clasica'

export interface Rect { x: number; y: number; w: number; h: number }

interface State {
  modo: ModoCuaderno
  /** Al cerrar se recuerda de dónde venía, para volver igual. */
  ultimoModo: 'lateral' | 'flotante'
  anchoLateral: number
  flotante: Rect | null
  /** Hoja abierta: id de una nota, o null = el diario en `fechaDiario`. */
  hojaId: string | null
  /** null = hoy (sigue siendo "hoy" aunque pase la medianoche). */
  fechaDiario: string | null
  papelDefault: Papel
  tono: TonoPapel
  letra: Letra
  set: (patch: Partial<Omit<State, 'set' | 'abrir' | 'cerrar'>>) => void
  abrir: (modo?: 'lateral' | 'flotante') => void
  cerrar: () => void
}

export const ANCHO_LATERAL_MIN = 300
export const ANCHO_LATERAL_MAX = 760

export const useNotebookUiStore = create<State>()(
  persist(
    (set, get) => ({
      modo: 'cerrado',
      ultimoModo: 'lateral',
      anchoLateral: 400,
      flotante: null,
      hojaId: null,
      fechaDiario: null,
      papelDefault: 'renglones',
      tono: 'crema',
      letra: 'manuscrita',
      set: (patch) => set(patch),
      abrir: (modo) => {
        const m = modo ?? get().ultimoModo
        set({ modo: m, ultimoModo: m })
      },
      cerrar: () => {
        const { modo } = get()
        set({ modo: 'cerrado', ultimoModo: modo === 'cerrado' ? get().ultimoModo : modo })
      },
    }),
    {
      name: 'overseer-notebook-ui',
      partialize: (s) => {
        const { set: _s, abrir: _a, cerrar: _c, ...rest } = s
        void _s; void _a; void _c
        return rest
      },
    },
  ),
)

/** Mete la ventana flotante adentro de la pantalla (la PC y la notebook tienen
 *  pantallas distintas, y una ventana que quedó afuera no se puede agarrar). */
export function encajarRect(r: Rect, vw: number, vh: number): Rect {
  const w = Math.min(Math.max(r.w, 340), vw - 16)
  const h = Math.min(Math.max(r.h, 320), vh - 16)
  const x = Math.min(Math.max(r.x, 8), vw - w - 8)
  const y = Math.min(Math.max(r.y, 8), vh - h - 8)
  return { x, y, w, h }
}

export function rectInicial(vw: number, vh: number): Rect {
  const w = Math.min(760, vw - 80)
  const h = Math.min(Math.round(vh * 0.84), vh - 40)
  return encajarRect({ x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w, h }, vw, vh)
}
