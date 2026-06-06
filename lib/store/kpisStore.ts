'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { KPIDefinition, KPIKind } from '@/lib/kpi/types'

function genId(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3)
}
function nowIso(): string {
  return new Date().toISOString()
}
function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface State {
  /** La library — todas las definiciones de KPI del usuario. Los archivados
   *  quedan acá también; los componentes que listan filtran por `archivedAt`. */
  definitions: KPIDefinition[]

  /** CRUD ───────────────────────────────────────────────────────── */
  addKpi: (input: Omit<KPIDefinition, 'id' | 'createdAt' | 'updatedAt' | 'activatedAt'>) => string
  updateKpi: (id: string, patch: Partial<Omit<KPIDefinition, 'id' | 'createdAt'>>) => void
  archiveKpi: (id: string) => void
  unarchiveKpi: (id: string) => void
  /** Borrado real — usar con cuidado, los valores históricos en sesiones
   *  cerradas seguirían existiendo pero quedarían huérfanos sin def. */
  deleteKpi: (id: string) => void

  /** Selectors ─────────────────────────────────────────────────── */
  /** Todos los KPIs activos (no archivados). */
  activeKpis: () => KPIDefinition[]
  /** KPIs activos cuya `activatedAt` cae ANTES o EN la fecha dada (YYYY-MM-DD).
   *  Usar para listar los KPIs aplicables a una semana SPI específica
   *  por `weekStartDate` — un KPI agregado el 15/03 no aparece en la
   *  semana del 1/03 (porque no existía aún). */
  activeKpisAt: (weekStartDate: string) => KPIDefinition[]
  /** KPIs activos de un área específica. */
  kpisByArea: (areaKey: string) => KPIDefinition[]
  /** Lookup por id — devuelve también archivados, para historial. */
  getKpi: (id: string) => KPIDefinition | null
}

export const useKpisStore = create<State>()(
  persist(
    (set, get) => ({
      definitions: [],

      addKpi: (input) => {
        const id = genId()
        const now = nowIso()
        // `activatedAt` se setea al día de hoy → las semanas SPI cuyo
        // sábado sea anterior NO van a mostrar este KPI. Empieza a contar
        // desde la semana en curso. El usuario puede backdate-arlo desde
        // editar si quiere retroactividad.
        const def: KPIDefinition = {
          ...input,
          id,
          createdAt: now,
          updatedAt: now,
          activatedAt: todayYmd(),
        }
        set((s) => ({ definitions: [...s.definitions, def] }))

        // Auto-activar en la sesión SPI de la semana en curso.
        //
        // Sin esto, un KPI creado desde la página /kpis (library view)
        // quedaba "huérfano" — aparecía en library pero el scoreboard
        // mostraba "Sin KPIs activos esta semana". El user tenía que ir
        // a "Editar KPIs" del scoreboard y activarlo a mano. UX confusa.
        //
        // (Los KPIs creados desde los chips de SPI ya hacen esto desde
        // el componente, pero está OK ser idempotente — agregar dos
        // veces el mismo id no rompe nada porque chequeamos `includes`.)
        //
        // Hacemos lazy require por ESM circular dep: spiStore importa
        // kpisStore. Si importáramos useSPIStore en top-level, sería un
        // ciclo. En runtime el módulo ya está cargado cuando se llama
        // addKpi, así que dynamic import es seguro.
        if (typeof window !== 'undefined') {
          import('./spiStore').then(({ useSPIStore, activeWeekAnchorYmd }) => {
            const spi = useSPIStore.getState()
            // Auto-activamos un KPI recién creado en la sesión cuya
            // semana Mon→Sun está EN CURSO. Antes usábamos lastSaturdayYmd
            // que devuelve hoy si hoy es sábado, pero el sábado es el
            // ritual de planificación de la PRÓXIMA semana — los KPIs
            // semanales viven en la sesión del sábado ANTERIOR.
            const target = activeWeekAnchorYmd()

            // Resolución de "qué sesión activar":
            //   1. activeSession SI Y SOLO SI es de la semana en curso.
            //      Esto evita el bug donde el user está editando una
            //      sesión vieja y los KPIs nuevos terminaban activados
            //      en esa semana vieja, no en la actual.
            //   2. Fallback: sesión más recientemente actualizada con
            //      weekStartDate === target. Maneja el caso de
            //      múltiples sesiones para la misma semana (dups por
            //      sync multi-device, history viejo, etc.).
            let session = null
            if (spi.activeSessionId) {
              const active = spi.sessions.find((s) => s.id === spi.activeSessionId)
              if (active && active.weekStartDate === target) session = active
            }
            if (!session) {
              const matching = spi.sessions
                .filter((s) => s.weekStartDate === target)
                .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
              session = matching[0] ?? null
            }
            if (!session) return

            const currentIds = session.selectedKpiIds ?? []
            if (!currentIds.includes(id)) {
              spi.setSessionKpis(session.id, [...currentIds, id])
            }
          }).catch(() => { /* noop — el KPI quedó en library igual */ })
        }

        return id
      },

      updateKpi: (id, patch) => set((s) => ({
        definitions: s.definitions.map((d) =>
          d.id !== id ? d : { ...d, ...patch, updatedAt: nowIso() }
        ),
      })),

      archiveKpi: (id) => set((s) => ({
        definitions: s.definitions.map((d) =>
          d.id !== id ? d : { ...d, archivedAt: nowIso(), updatedAt: nowIso() }
        ),
      })),

      unarchiveKpi: (id) => set((s) => ({
        definitions: s.definitions.map((d) => {
          if (d.id !== id) return d
          // Borramos archivedAt explícitamente (no podemos asignar undefined
          // sin destructurar el objeto).
          const { archivedAt: _gone, ...rest } = d
          return { ...rest, updatedAt: nowIso() }
        }),
      })),

      deleteKpi: (id) => set((s) => ({
        definitions: s.definitions.filter((d) => d.id !== id),
      })),

      activeKpis: () => get().definitions.filter((d) => !d.archivedAt),

      activeKpisAt: (weekStartDate) => get().definitions.filter(
        (d) => !d.archivedAt && d.activatedAt <= weekStartDate
      ),

      kpisByArea: (areaKey) => get().definitions.filter(
        (d) => !d.archivedAt && d.areaKey === areaKey
      ),

      getKpi: (id) => get().definitions.find((d) => d.id === id) ?? null,
    }),
    {
      name: 'overseer-kpis',
      partialize: (s) => ({ definitions: s.definitions }),
      onRehydrateStorage: () => (state) => {
        if (!state || !Array.isArray(state.definitions)) {
          if (state) state.definitions = []
          return
        }
        // Migración v1 → v2: agregar `activatedAt` a KPIs viejos que no
        // lo tienen. Usamos el día del createdAt como activación, así
        // mantienen su histórico tal cual estaba.
        state.definitions = state.definitions.map((d) => {
          if (d.activatedAt) return d
          const createdDay = (d.createdAt ?? new Date().toISOString()).slice(0, 10)
          return { ...d, activatedAt: createdDay }
        })
      },
    }
  )
)

/** Helpers de parsing — el storage usa strings para alinearse con
 *  `session.values`. Estos centralizan la conversión por kind. */

export function parseKpiValue(raw: string, kind: KPIKind): number {
  if (!raw) return 0
  if (kind === 'boolean') {
    // Acepta '1', 'true', 'yes', 'si' como TRUE; cualquier otra cosa false.
    const lower = raw.toLowerCase().trim()
    return (lower === '1' || lower === 'true' || lower === 'yes' || lower === 'si' || lower === 'sí') ? 1 : 0
  }
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : 0
}

export function serializeKpiValue(value: number, kind: KPIKind): string {
  if (kind === 'boolean') return value > 0 ? '1' : '0'
  return String(value)
}

/** % de cumplimiento sobre target. Devuelve null si no hay target o si
 *  target es 0 (división por cero). Capeado a 100 para que valores que
 *  pasan el target no rompan barras. */
export function kpiCompletionPct(value: number, target: number | undefined, kind: KPIKind): number | null {
  if (kind === 'boolean') return value > 0 ? 100 : 0
  if (!target || target <= 0) return null
  return Math.min(100, Math.round((value / target) * 100))
}
