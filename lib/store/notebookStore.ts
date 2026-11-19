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
  /** Fijada: aparece en todas las hojas del diario desde el día de su hoja. */
  fijo?: boolean
}

export type ColorTapa =
  | 'violeta' | 'medianoche' | 'borgona' | 'bosque' | 'oceano'
  | 'caramelo' | 'mostaza' | 'rosa' | 'arena' | 'grafito'
export const COLORES_TAPA: ColorTapa[] = ['violeta', 'medianoche', 'borgona', 'bosque', 'oceano', 'caramelo', 'mostaza', 'rosa', 'arena', 'grafito']

export type EstiloTapa = 'cuero' | 'tela' | 'estrellas' | 'rayas'
export const ESTILOS_TAPA: EstiloTapa[] = ['cuero', 'tela', 'estrellas', 'rayas']

/** La tapa del cuaderno. Es una PREFERENCIA (no una hoja): viaja en el blob
 *  `app_preferences` (`notebookTapa`), mergeada por campo como el resto. */
export interface TapaCuaderno {
  color: ColorTapa
  estilo: EstiloTapa
  /** Lo que va grabado en la tapa. */
  nombre: string
}
export const TAPA_DEFAULT: TapaCuaderno = { color: 'violeta', estilo: 'cuero', nombre: 'Cuaderno' }

export function sanitizeTapa(raw: unknown): TapaCuaderno {
  const p = (raw ?? {}) as Partial<TapaCuaderno>
  return {
    color: COLORES_TAPA.includes(p.color as ColorTapa) ? (p.color as ColorTapa) : TAPA_DEFAULT.color,
    estilo: ESTILOS_TAPA.includes(p.estilo as EstiloTapa) ? (p.estilo as EstiloTapa) : TAPA_DEFAULT.estilo,
    nombre: typeof p.nombre === 'string' ? p.nombre.slice(0, 40) : TAPA_DEFAULT.nombre,
  }
}

/** Texto escrito en cualquier lugar de la hoja (no solo seguido desde arriba). */
export interface BloqueTexto {
  id: string
  /** Fracción del ancho de la hoja (0–1), igual que las stickies. */
  x: number
  /** px desde arriba de la hoja, SIEMPRE múltiplo del renglón: así el texto cae sobre la línea. */
  y: number
  texto: string
  /** Como en Notion: texto común, tarea con tilde, o viñeta. Sin valor = texto. */
  tipo?: TipoRenglon
  /** Solo tareas: tildada (se ve tachada). */
  hecho?: boolean
  /** Fijado: aparece en todas las hojas del diario desde el día de su hoja. */
  fijo?: boolean
}

export type TipoRenglon = 'texto' | 'tarea' | 'vineta'

export type Tinta = 'tinta' | 'azul' | 'rojo' | 'violeta' | 'verde'
export const TINTAS: Tinta[] = ['tinta', 'azul', 'rojo', 'violeta', 'verde']

/** Una línea recta trazada con la regla. x como fracción del ancho, y en px. */
export interface Trazo {
  id: string
  x1: number; y1: number
  x2: number; y2: number
  tinta: Tinta
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
  bloques: BloqueTexto[]
  trazos: Trazo[]
  createdAt: string
  updatedAt: string
}

export const idDia = (fecha: string) => `nb_dia_${fecha}`

type CamposHoja = Partial<Pick<HojaCuaderno, 'titulo' | 'texto' | 'papel'>>

interface State {
  hojas: HojaCuaderno[]
  tapa: TapaCuaderno
  setTapa: (patch: Partial<TapaCuaderno>) => void
  /** Escribe en la hoja del día; la crea si todavía no existe (las hojas del
   *  diario no se crean al mirarlas, recién cuando se escribe algo). */
  editarDia: (fecha: string, patch: CamposHoja, papelDefault: Papel) => void
  crearNota: (papel: Papel, titulo?: string) => string
  editarHoja: (id: string, patch: CamposHoja) => void
  borrarHoja: (id: string) => void
  agregarSticky: (hojaId: string, s: Omit<Sticky, 'id'>) => string
  editarSticky: (hojaId: string, stickyId: string, patch: Partial<Omit<Sticky, 'id'>>) => void
  borrarSticky: (hojaId: string, stickyId: string) => void
  agregarBloque: (hojaId: string, b: Omit<BloqueTexto, 'id'>) => string
  /** Enter: un renglón nuevo justo debajo; si ya hay algo ahí en esa columna, lo de abajo baja un renglón. */
  insertarRenglon: (hojaId: string, b: Omit<BloqueTexto, 'id'>) => string
  /** El texto corrido de antes (`texto`) pasa a renglones sueltos. */
  pasarTextoARenglones: (hojaId: string, x: number) => void
  editarBloque: (hojaId: string, bloqueId: string, patch: Partial<Omit<BloqueTexto, 'id'>>) => void
  borrarBloque: (hojaId: string, bloqueId: string) => void
  agregarTrazo: (hojaId: string, t: Omit<Trazo, 'id'>) => string
  borrarTrazo: (hojaId: string, trazoId: string) => void
}

function nuevaHoja(tipo: TipoHoja, fecha: string, papel: Papel, id = genId()): HojaCuaderno {
  const now = nowISO()
  return { id, tipo, fecha, titulo: '', texto: '', papel, stickies: [], bloques: [], trazos: [], createdAt: now, updatedAt: now }
}

export const useNotebookStore = create<State>()(
  persist(
    (set, get) => ({
      hojas: [],
      tapa: TAPA_DEFAULT,

      setTapa: (patch) => set((s) => ({ tapa: sanitizeTapa({ ...s.tapa, ...patch }) })),

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

      agregarBloque: (hojaId, b) => {
        const id = genId()
        set((st) => ({ hojas: st.hojas.map((h) => h.id !== hojaId ? h : { ...h, bloques: [...(h.bloques ?? []), { ...b, id }], updatedAt: nowISO() }) }))
        return id
      },
      insertarRenglon: (hojaId, b) => {
        const id = genId()
        set((st) => ({ hojas: st.hojas.map((h) => h.id !== hojaId ? h
          : { ...h, bloques: insertarEnColumna(h.bloques ?? [], { ...b, id }), updatedAt: nowISO() }) }))
        return id
      },
      pasarTextoARenglones: (hojaId, x) => set((st) => ({
        hojas: st.hojas.map((h) => h.id !== hojaId || !h.texto.trim() ? h : {
          ...h,
          texto: '',
          bloques: [...textoABloques(h.texto, x, LINEA_CUADERNO * 2), ...(h.bloques ?? [])],
          updatedAt: nowISO(),
        }),
      })),
      editarBloque: (hojaId, bloqueId, patch) => set((st) => ({
        hojas: st.hojas.map((h) => h.id !== hojaId ? h : {
          ...h, bloques: (h.bloques ?? []).map((x) => x.id !== bloqueId ? x : { ...x, ...patch }), updatedAt: nowISO(),
        }),
      })),
      borrarBloque: (hojaId, bloqueId) => set((st) => ({
        hojas: st.hojas.map((h) => h.id !== hojaId ? h
          : { ...h, bloques: (h.bloques ?? []).filter((x) => x.id !== bloqueId), updatedAt: nowISO() }),
      })),
      agregarTrazo: (hojaId, t) => {
        const id = genId()
        set((st) => ({ hojas: st.hojas.map((h) => h.id !== hojaId ? h : { ...h, trazos: [...(h.trazos ?? []), { ...t, id }], updatedAt: nowISO() }) }))
        return id
      },
      borrarTrazo: (hojaId, trazoId) => set((st) => ({
        hojas: st.hojas.map((h) => h.id !== hojaId ? h
          : { ...h, trazos: (h.trazos ?? []).filter((x) => x.id !== trazoId), updatedAt: nowISO() }),
      })),
    }),
    {
      name: 'overseer-notebook',
      partialize: (s) => ({ hojas: s.hojas, tapa: s.tapa }),
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.hojas)) state.hojas = []
        // Hojas guardadas antes de que existieran bloques y trazos.
        if (state) state.hojas = state.hojas.map((h) => ({ ...h, bloques: h.bloques ?? [], trazos: h.trazos ?? [] }))
        if (state) state.tapa = sanitizeTapa(state.tapa)
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
        ...(s.fijo ? { fijo: true } : {}),
      })),
    bloques: (Array.isArray(p.bloques) ? p.bloques : [])
      .filter((b): b is BloqueTexto => !!b && typeof b === 'object' && typeof (b as BloqueTexto).id === 'string')
      .map((b) => ({
        id: b.id,
        x: Math.min(1, Math.max(0, num(b.x, 0.1))),
        y: Math.max(0, num(b.y, 60)),
        texto: typeof b.texto === 'string' ? b.texto : '',
        ...(b.tipo === 'tarea' || b.tipo === 'vineta' ? { tipo: b.tipo } : {}),
        ...(b.tipo === 'tarea' && b.hecho ? { hecho: true } : {}),
        ...(b.fijo ? { fijo: true } : {}),
      })),
    trazos: (Array.isArray(p.trazos) ? p.trazos : [])
      .filter((t): t is Trazo => !!t && typeof t === 'object' && typeof (t as Trazo).id === 'string')
      .map((t) => ({
        id: t.id,
        x1: Math.min(1, Math.max(0, num(t.x1, 0))), y1: Math.max(0, num(t.y1, 0)),
        x2: Math.min(1, Math.max(0, num(t.x2, 0))), y2: Math.max(0, num(t.y2, 0)),
        tinta: TINTAS.includes(t.tinta) ? t.tinta : 'tinta',
      })),
    createdAt: typeof p.createdAt === 'string' ? p.createdAt : now,
    updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : now,
  }
}

/** Una hoja vacía no se muestra en el índice (el diario no se ensucia con los
 *  días que solo se miraron). */
export function hojaTieneAlgo(h: HojaCuaderno): boolean {
  return h.texto.trim().length > 0 || h.stickies.length > 0 || h.titulo.trim().length > 0
    || (h.bloques ?? []).some((b) => b.texto.trim()) || (h.trazos ?? []).length > 0
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
  // El texto de arriba primero; si está vacío, lo escrito más arriba en la hoja.
  const sueltos = [...(h.bloques ?? [])].sort((a, b) => a.y - b.y || a.x - b.x).map((b) => b.texto)
  const linea = [h.texto, ...sueltos].join('\n').split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? ''
  if (linea) return linea.length > max ? linea.slice(0, max - 1) + '…' : linea
  if (h.stickies.length > 0) return `${h.stickies.length} nota${h.stickies.length === 1 ? '' : 's'} pegada${h.stickies.length === 1 ? '' : 's'}`
  return ''
}

// ─── Renglones estilo Notion ────────────────────────────────────────────────

/** Alto de un renglón del cuaderno (lo mismo que `LINEA` en components/notebook/paper.ts). */
export const LINEA_CUADERNO = 30

/** ¿Escribió un atajo al principio del renglón? "[] " o "[ ] " = tarea, "[x] " =
 *  tarea hecha, "- ", "* " o "• " = viñeta. Devuelve el renglón sin el atajo. */
export function detectarAtajo(texto: string): { tipo: TipoRenglon; hecho: boolean; resto: string } | null {
  const m = /^(\[\s?\]|\[[xX]\]|[-*•])\s/.exec(texto)
  if (!m) return null
  const a = m[1]
  const resto = texto.slice(m[0].length)
  if (a.startsWith('[')) return { tipo: 'tarea', hecho: /x/i.test(a), resto }
  return { tipo: 'vineta', hecho: false, resto }
}

/** El texto corrido de antes pasa a un renglón por línea (con sus atajos). */
export function textoABloques(texto: string, x: number, y0: number): BloqueTexto[] {
  const out: BloqueTexto[] = []
  texto.split(/\r?\n/).forEach((linea, i) => {
    if (!linea.trim()) return
    const a = detectarAtajo(linea)
    out.push({
      id: genId(), x, y: y0 + i * LINEA_CUADERNO,
      texto: a ? a.resto : linea,
      ...(a && a.tipo !== 'texto' ? { tipo: a.tipo } : {}),
      ...(a?.hecho ? { hecho: true } : {}),
    })
  })
  return out
}

/** Mismo "columna" = arrancan casi en el mismo x (como una lista de Notion). */
const mismaColumna = (a: number, b: number) => Math.abs(a - b) < 0.12

/** Inserta un renglón; si en ese lugar ya hay otro de la misma columna, ese y
 *  todos los de abajo de esa columna bajan un renglón (como al apretar Enter
 *  en el medio de una lista). Puro, con test. */
export function insertarEnColumna(bloques: BloqueTexto[], nuevo: BloqueTexto): BloqueTexto[] {
  const ocupado = bloques.some((b) => b.y === nuevo.y && mismaColumna(b.x, nuevo.x))
  const movidos = !ocupado ? bloques : bloques.map((b) =>
    b.y >= nuevo.y && mismaColumna(b.x, nuevo.x) ? { ...b, y: b.y + LINEA_CUADERNO } : b)
  return [...movidos, nuevo]
}

export interface Fijado<T> { origen: string; item: T }

/** Lo fijado en OTRAS hojas que se ve en la hoja del diario `fecha`: renglones
 *  y stickies con `fijo`, de hojas del mismo día o anteriores. Puro, con test. */
export function fijadosPara(hojas: HojaCuaderno[], fecha: string, hojaActualId: string): {
  bloques: Fijado<BloqueTexto>[]; stickies: Fijado<Sticky>[]
} {
  const bloques: Fijado<BloqueTexto>[] = []
  const stickies: Fijado<Sticky>[] = []
  for (const h of hojas) {
    if (h.id === hojaActualId || h.fecha > fecha) continue
    for (const b of h.bloques ?? []) if (b.fijo) bloques.push({ origen: h.id, item: b })
    for (const s of h.stickies) if (s.fijo) stickies.push({ origen: h.id, item: s })
  }
  return { bloques, stickies }
}
