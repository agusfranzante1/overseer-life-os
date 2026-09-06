'use client'
/**
 * Decisiones — el registro de las decisiones que tomás, y de cómo salieron.
 *
 * No es un journal con otro nombre: acá lo que importa es poder VOLVER
 * después y marcar si la decisión fue correcta o no, y qué resultado dio.
 * Por eso el veredicto arranca en `pendiente` y se decide más tarde: una
 * decisión recién tomada todavía no tiene resultado, y forzar a juzgarla en
 * el momento sería inventar.
 *
 * Cada decisión puede colgar de un PROYECTO (los mismos de Tareas) para
 * después leer juntas todas las de un frente, y marcarse como IMPORTANTE
 * (⭐) para separar las que movieron la aguja del ruido de todos los días.
 *
 * Sync: una fila por decisión en `decisions` (patrón por-fila, igual que
 * journal). Regla de oro: TODA mutación bumpea `updatedAt` → el merge LWW
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

/** Cómo salió. `pendiente` = todavía no se sabe (el estado inicial). */
export type DecisionVerdict = 'pendiente' | 'correcta' | 'incorrecta'

export const VERDICTS: DecisionVerdict[] = ['pendiente', 'correcta', 'incorrecta']

export interface Decision {
  id: string
  /** Día en que se TOMÓ la decisión — "YYYY-MM-DD". Editable. */
  date: string
  /** La decisión en una línea. Es lo que se ve en la lista. */
  title: string
  /** El texto largo: el contexto, las opciones, por qué la tomaste. */
  body: string
  /** Qué resultado dio. Se completa después, cuando ya se sabe. */
  outcome: string
  verdict: DecisionVerdict
  /** ⭐ — las que querés tener a mano, separadas del ruido. */
  important: boolean
  /** Proyecto de Tareas al que pertenece. Opcional: hay decisiones que no
   *  son de ningún frente en particular. */
  projectId?: string
  createdAt: string
  updatedAt: string
}

type EditableFields = 'date' | 'title' | 'body' | 'outcome' | 'verdict' | 'important' | 'projectId'

interface State {
  decisions: Decision[]

  /** Crea una decisión (por default: hoy, pendiente, sin proyecto) y
   *  devuelve su id para abrirla en edición enseguida. */
  addDecision: (args?: Partial<Pick<Decision, EditableFields>>) => string
  updateDecision: (id: string, patch: Partial<Pick<Decision, EditableFields>>) => void
  removeDecision: (id: string) => void
  toggleImportant: (id: string) => void
  /** Marca el veredicto. Volver a tocar el mismo lo devuelve a `pendiente`
   *  — te equivocaste al marcarla y no hay que borrarla para arreglarlo. */
  cycleVerdict: (id: string, verdict: DecisionVerdict) => void
}

export const useDecisionsStore = create<State>()(
  persist(
    (set) => ({
      decisions: [],

      addDecision: (args) => {
        const id = genId()
        const now = nowISO()
        const decision: Decision = {
          id,
          date: args?.date ?? todayYmd(),
          title: args?.title ?? '',
          body: args?.body ?? '',
          outcome: args?.outcome ?? '',
          verdict: args?.verdict ?? 'pendiente',
          important: args?.important ?? false,
          projectId: args?.projectId,
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ decisions: [decision, ...s.decisions] }))
        return id
      },

      updateDecision: (id, patch) => set((s) => ({
        decisions: s.decisions.map((d) => d.id !== id ? d : { ...d, ...patch, updatedAt: nowISO() }),
      })),

      removeDecision: (id) => set((s) => ({ decisions: s.decisions.filter((d) => d.id !== id) })),

      toggleImportant: (id) => set((s) => ({
        decisions: s.decisions.map((d) => d.id !== id ? d : { ...d, important: !d.important, updatedAt: nowISO() }),
      })),

      cycleVerdict: (id, verdict) => set((s) => ({
        decisions: s.decisions.map((d) => {
          if (d.id !== id) return d
          const next: DecisionVerdict = d.verdict === verdict ? 'pendiente' : verdict
          return { ...d, verdict: next, updatedAt: nowISO() }
        }),
      })),
    }),
    {
      name: 'overseer-decisions',
      partialize: (s) => ({ decisions: s.decisions }),
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.decisions)) state.decisions = []
      },
    },
  ),
)

// ─── Helpers puros (con test en decisionsStore.test.ts) ──────────────────────

/** Orden cronológico DESCENDENTE (las últimas arriba) por fecha, y dentro del
 *  mismo día por createdAt. Las importantes NO se suben al tope: para eso está
 *  el filtro ⭐ — si no, se pierde la línea de tiempo. */
export function sortDecisions(decisions: Decision[]): Decision[] {
  return [...decisions].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    return b.createdAt.localeCompare(a.createdAt)
  })
}

export interface DecisionFilters {
  verdict?: DecisionVerdict | 'todas'
  projectId?: string | 'todos'
  onlyImportant?: boolean
  /** Busca en título, texto y resultado (case-insensitive). */
  query?: string
}

export function filterDecisions(decisions: Decision[], f: DecisionFilters): Decision[] {
  const q = (f.query ?? '').trim().toLowerCase()
  return decisions.filter((d) => {
    if (f.verdict && f.verdict !== 'todas' && d.verdict !== f.verdict) return false
    if (f.projectId && f.projectId !== 'todos' && d.projectId !== f.projectId) return false
    if (f.onlyImportant && !d.important) return false
    if (q && !`${d.title} ${d.body} ${d.outcome}`.toLowerCase().includes(q)) return false
    return true
  })
}

export interface DecisionStats {
  total: number
  correctas: number
  incorrectas: number
  pendientes: number
  /** % de acierto sobre las YA JUZGADAS (correctas + incorrectas). `null` si
   *  todavía no juzgaste ninguna: un 0% ahí sería mentira, no un dato. */
  aciertoPct: number | null
}

export function decisionStats(decisions: Decision[]): DecisionStats {
  const correctas = decisions.filter((d) => d.verdict === 'correcta').length
  const incorrectas = decisions.filter((d) => d.verdict === 'incorrecta').length
  const pendientes = decisions.filter((d) => d.verdict === 'pendiente').length
  const juzgadas = correctas + incorrectas
  return {
    total: decisions.length,
    correctas,
    incorrectas,
    pendientes,
    aciertoPct: juzgadas === 0 ? null : Math.round((correctas / juzgadas) * 100),
  }
}

/** Etiqueta legible de una fecha YYYY-MM-DD (ej. "lunes, 6 de julio de 2026").
 *  Construye el Date en hora LOCAL para no correrse un día por UTC. */
export function formatDecisionDate(ymd: string, locale = 'es-AR'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
  if (!m) return ymd
  const d = new Date(+m[1], +m[2] - 1, +m[3])
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
