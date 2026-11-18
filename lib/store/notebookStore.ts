'use client'
/**
 * Cuaderno — el anotador que vive al costado de la pantalla, en todas las
 * secciones (`components/notebook/NotebookDock.tsx`).
 *
 * Dos clases de hoja:
 *  - `dia`: la hoja del diario de ese día. Id DETERMINISTA `nb_dia_<fecha>`,
 *    así dos dispositivos que escriben el mismo día convergen en UNA hoja en
 *    vez de sumar dos copias (mismo criterio que `plan_<fecha>`).
 *  - `nota`: hojas sueltas con título (listas, ideas, lo que sea).
 *
 * Cada hoja guarda su texto, el tipo de papel (renglones, puntos, cuadrícula,
 * liso) y sus sticky notes. Las stickies viajan ADENTRO de la hoja: se editan
 * juntas y se resuelven juntas (LWW por `updatedAt` de la hoja).
 *
 * Sync: una fila por hoja en `notebook_pages` (patrón por-fila, payload jsonb).
 * Regla de oro: TODA mutación bumpea `updatedAt`.
 *
 * Lo que NO va acá: si el cuaderno está abierto, de qué lado, de qué tamaño o
 * dónde quedó la ventana flotante. Eso depende de la pantalla de cada
 * dispositivo y vive en `notebookUiStore` (solo localStorage).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function genId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4) }
function nowISO() { return new Date().toISOString() }
export function hoyLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type Papel = 'renglones' | 'puntos' | 'cuadricula' | 'liso'
export const PAPELES: Papel[] = ['renglones', 'puntos', 'cuadricula', 'liso']

export type ColorSticky = 'amarillo' | 'rosa' | 'celeste' | 'verde' | 'lila'
export const COLORES_STICKY: ColorSticky[] = ['amarillo', 'rosa', 'celeste', 'verde', 'lila']

export interface Sticky {
  id: string
  texto: string
  color: ColorSticky
  /** Posición horizontal como FRACCIÓN del ancho de la hoja (0–1): el cuaderno
   *  cambia de ancho (lateral, flotante, celu) y en píxeles se saldría. */
  x: number
  /** Posición vertical en px desde el borde de arriba de la hoja. */
  y: number
  /** Inclinación en grados (−4 a 4): que parezca pegada a mano. */
  rot: number
}

export type TipoHoja = 'dia' | 'nota'

export interface HojaCuaderno {
  id: string
  tipo: TipoHoja
  /** `dia`: el día de la hoja. `nota`: el día en que se creó. YYYY-MM-DD local. */
  fecha: string
  /** Solo las `nota` lo usan; las del diario se titulan con su fecha. */
  titulo: string
  texto: string
  papel: Papel
  stickies: Sticky[]
  createdAt: string
  updatedAt: string
}

export const idDia = (fecha: string) => `nb_dia_${fecha}`

type CamposHoja = Partial<Pick<HojaCuaderno, 'titulo' | 'texto' | 'papel'>>

interface State {
  hojas: HojaCuaderno[]
  /** Escribe en la hoja del día; la crea si todavía no existe (las hojas del
   *  diario no se crean al mirarlas, recién cuando se escribe algo). */
  editarDia: (fecha: string, patch: CamposHoja, papelDefault: Papel) => void
  crearNota: (papel: Papel, titulo?: string) => string
  editarHoja: (id: string, patch: CamposHoja) => void
  borrarHoja: (id: string) => void
  agregarSticky: (hojaId: string, s: Omit<Sticky, 'id'>) => string
  editarSticky: (hojaId: string, stickyId: string, patch: Partial<Omit<Sticky, 'id'>>) => void
  borrarSticky: (hojaId: string, stickyId: string) => void
}

function nuevaHoja(tipo: TipoHoja, fecha: string, papel: Papel, id = genId()): HojaCuaderno {
  const now = nowISO()
  return { id, tipo, fecha, titulo: '', texto: '', papel, stickies: [], createdAt: now, updatedAt: now }
}

export const useNotebookStore = create<State>()(
  persist(
    (set, get) => ({
      hojas: [],

      editarDia: (fecha, patch, papelDefault) => {
        const id = idDia(fecha)
        const existe = get().hojas.some((h) => h.id === id)
        if (existe) { get().editarHoja(id, patch); return }
        set((s) => ({ hojas: [{ ...nuevaHoja('dia', fecha, papelDefault, id), ...patch }, ...s.hojas] }))
      },

      crearNota: (papel, titulo = '') => {
        const h = { ...nuevaHoja('nota', hoyLocal(), papel), titulo }
        set((s) => ({ hojas: [h, ...s.hojas] }))
        return h.id
      },

      editarHoja: (id, patch) => set((s) => ({
        hojas: s.hojas.map((h) => h.id !== id ? h : { ...h, ...patch, updatedAt: nowISO() }),
      })),

      borrarHoja: (id) => set((s) => ({ hojas: s.hojas.filter((h) => h.id !== id) })),

      agregarSticky: (hojaId, s) => {
        const id = genId()
        set((st) => ({
          hojas: st.hojas.map((h) => h.id !== hojaId ? h
            : { ...h, stickies: [...h.stickies, { ...s, id }], updatedAt: nowISO() }),
        }))
        return id
      },

      editarSticky: (hojaId, stickyId, patch) => set((st) => ({
        hojas: st.hojas.map((h) => h.id !== hojaId ? h : {
          ...h,
          stickies: h.stickies.map((x) => x.id !== stickyId ? x : { ...x, ...patch }),
          updatedAt: nowISO(),
        }),
      })),

      borrarSticky: (hojaId, stickyId) => set((st) => ({
        hojas: st.hojas.map((h) => h.id !== hojaId ? h
          : { ...h, stickies: h.stickies.filter((x) => x.id !== stickyId), updatedAt: nowISO() }),
      })),
    }),
    {
      name: 'overseer-notebook',
      partialize: (s) => ({ hojas: s.hojas }),
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.hojas)) state.hojas = []
      },
    },
  ),
)

// ─── Helpers puros (con test en notebookStore.test.ts) ───────────────────────

const esPapel = (v: unknown): v is Papel => PAPELES.includes(v as Papel)
const esColor = (v: unknown): v is ColorSticky => COLORES_STICKY.includes(v as ColorSticky)
const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def)

/** Reconstruye una hoja campo por campo (lo usa el pull). OJO (BASE nº2): un
 *  campo que no esté acá SE BORRA al sincronizar, aunque el push lo mande. */
export function sanitizeHoja(raw: unknown): HojaCuaderno {
  const p = (raw ?? {}) as Partial<HojaCuaderno> & Record<string, unknown>
  const now = new Date().toISOString()
  const stickies = Array.isArray(p.stickies) ? p.stickies : []
  return {
    id: typeof p.id === 'string' ? p.id : '',
    tipo: p.tipo === 'nota' ? 'nota' : 'dia',
    fecha: typeof p.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha) ? p.fecha : (p.createdAt ?? now).slice(0, 10),
    titulo: typeof p.titulo === 'string' ? p.titulo : '',
    texto: typeof p.texto === 'string' ? p.texto : '',
    papel: esPapel(p.papel) ? p.papel : 'renglones',
    stickies: stickies
      .filter((s): s is Sticky => !!s && typeof s === 'object' && typeof (s as Sticky).id === 'string')
      .map((s) => ({
        id: s.id,
        texto: typeof s.texto === 'string' ? s.texto : '',
        color: esColor(s.color) ? s.color : 'amarillo',
        x: Math.min(1, Math.max(0, num(s.x, 0.1))),
        y: Math.max(0, num(s.y, 40)),
        rot: Math.min(4, Math.max(-4, num(s.rot, 0))),
      })),
    createdAt: typeof p.createdAt === 'string' ? p.createdAt : now,
    updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : now,
  }
}

/** Una hoja vacía no se muestra en el índice (el diario no se ensucia con los
 *  días que solo se miraron). */
export function hojaTieneAlgo(h: HojaCuaderno): boolean {
  return h.texto.trim().length > 0 || h.stickies.length > 0 || h.titulo.trim().length > 0
}

/** El índice: días del diario (más nuevo primero) y notas (última editada
 *  primero), sin las hojas vacías. */
export function indiceCuaderno(hojas: HojaCuaderno[]): { dias: HojaCuaderno[]; notas: HojaCuaderno[] } {
  const conAlgo = hojas.filter(hojaTieneAlgo)
  return {
    dias: conAlgo.filter((h) => h.tipo === 'dia').sort((a, b) => b.fecha.localeCompare(a.fecha)),
    notas: conAlgo.filter((h) => h.tipo === 'nota').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  }
}

/** Corre una fecha YYYY-MM-DD n días, en calendario local (sin pasar por UTC,
 *  que a la noche en Argentina ya es el día siguiente). */
export function correrDia(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return hoyLocal(new Date(y, m - 1, d + n))
}

/** Primera línea con texto, para el índice. */
export function resumenHoja(h: HojaCuaderno, max = 60): string {
  const linea = h.texto.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? ''
  if (linea) return linea.length > max ? linea.slice(0, max - 1) + '…' : linea
  if (h.stickies.length > 0) return `${h.stickies.length} nota${h.stickies.length === 1 ? '' : 's'} pegada${h.stickies.length === 1 ? '' : 's'}`
  return ''
}
