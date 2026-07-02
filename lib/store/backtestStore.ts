'use client'
/**
 * Store de BACKTESTING — planilla schema-driven para testear estrategias.
 *
 * Modelo conceptual (calcado del workflow del usuario en Google Sheets):
 *   - Cada "hoja" (BacktestSet) es una estrategia/experimento (ej. EDGECORE).
 *   - Las COLUMNAS las define el usuario (label + tipo + opciones con color).
 *     Agregar un parámetro nuevo ("¿sacó liquidez?", "modelo de entrada") es
 *     un click, no un cambio de código.
 *   - Algunas columnas tienen un ROL ('date' | 'result') — los charts y stats
 *     leen por rol, así funcionan sin importar cómo se llame la columna.
 *   - Las filas son un Record<columnId, valor>.
 *
 * Sync: cada set viaja como UN blob JSONB (tabla `trading_backtests`,
 * mismo patrón que mindmaps). LWW por updatedAt + tombstones.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function genId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4) }
function nowISO() { return new Date().toISOString() }
function todayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type BacktestColumnType =
  | 'text'        // libre (comentarios, notas)
  | 'number'      // R, ratios — se colorea por signo (verde/rojo/ámbar)
  | 'select'      // dropdown de opciones con color (Modelo, Bias, Noticia…)
  | 'multiselect' // varias opciones a la vez (Liq 4H: "Sí" + "Fvg")
  | 'date'        // fecha del trade — muestra el día de la semana solo
  | 'time'        // hora/franja ("11:00-11:30") — texto corto
  | 'link'        // URL clickeable (charts de fxr-snapshot, TradingView…)
  | 'boolean'     // Sí/No

/** Qué alimenta los charts/stats del LAB:
 *   - 'date'   → ordena la equity curve y agrupa por día
 *   - 'result' → el número que se acumula (tu R). Una columna por set.  */
export type BacktestColumnRole = 'date' | 'result' | 'none'

export interface BacktestSelectOption {
  value: string
  /** Hex del chip. Sin color → gris neutro. */
  color?: string
}

export interface BacktestColumn {
  id: string
  label: string
  type: BacktestColumnType
  role?: BacktestColumnRole
  /** Opciones para select/multiselect. Editables desde el header. */
  options?: BacktestSelectOption[]
  /** Ancho en px. Sin definir → default por tipo. */
  width?: number
}

export type BacktestCellValue = string | number | boolean | string[] | null

export interface BacktestRow {
  id: string
  values: Record<string, BacktestCellValue>
  createdAt: string
  updatedAt: string
}

export interface BacktestSet {
  id: string
  name: string
  color: string
  /** Link opcional a una Strategy del tradingStore (comparar backtest vs real). */
  strategyId?: string
  notes?: string
  columns: BacktestColumn[]
  rows: BacktestRow[]
  createdAt: string
  updatedAt: string
}

// ─── Paleta para opciones de select (misma vibra que NODE_PALETTE) ───────────

export const OPTION_PALETTE = [
  '#10b981', '#ef4444', '#f59e0b', '#6366f1', '#3b82f6',
  '#ec4899', '#a855f7', '#14b8a6', '#f97316', '#71717a',
]

export const SET_PALETTE = [
  '#10b981', '#6366f1', '#f59e0b', '#ef4444', '#3b82f6',
  '#ec4899', '#a855f7', '#14b8a6',
]

/** Ancho default de una columna según su tipo (px). */
export function defaultColumnWidth(type: BacktestColumnType): number {
  switch (type) {
    case 'date':        return 112
    case 'number':      return 84
    case 'select':      return 140
    case 'multiselect': return 170
    case 'time':        return 104
    case 'link':        return 130
    case 'boolean':     return 84
    case 'text':        return 240
  }
}

// ─── Columnas default — calcadas de la planilla iFVG Masters del usuario ─────

/** Genera las columnas semilla con ids frescos (para que dos sets no compartan
 *  columnIds). El día de la semana NO es columna: se deriva de la fecha y se
 *  muestra dentro de la celda date. */
export function makeDefaultColumns(): BacktestColumn[] {
  const biasOptions: BacktestSelectOption[] = [
    { value: 'Alcista', color: '#10b981' },
    { value: 'Bajista', color: '#ef4444' },
    { value: 'Neutro',  color: '#71717a' },
  ]
  return [
    { id: genId(), label: 'Fecha',      type: 'date',   role: 'date' },
    { id: genId(), label: 'R Liq',      type: 'number', role: 'result' },
    { id: genId(), label: 'R 1:2',      type: 'number' },
    { id: genId(), label: 'Noticia',    type: 'select', options: [
      { value: 'NO NEWS', color: '#71717a' },
      { value: 'NFP', color: '#ef4444' },
      { value: 'CPI', color: '#f59e0b' },
      { value: 'FOMC', color: '#a855f7' },
      { value: 'PMI', color: '#3b82f6' },
    ] },
    { id: genId(), label: 'Hora',       type: 'time' },
    { id: genId(), label: 'Modelo',     type: 'select', options: [
      { value: 'iFVG Continuación', color: '#6366f1' },
      { value: '3 velas iFVG', color: '#3b82f6' },
      { value: 'Bias', color: '#14b8a6' },
      { value: 'Pre-sesión', color: '#f59e0b' },
      { value: '3er Trade', color: '#ec4899' },
    ] },
    { id: genId(), label: 'Tipo',       type: 'select', options: [] },
    { id: genId(), label: 'Bias 4H',    type: 'select', options: biasOptions.map((o) => ({ ...o })) },
    { id: genId(), label: 'Bias 1H',    type: 'select', options: biasOptions.map((o) => ({ ...o })) },
    { id: genId(), label: 'Bias 15m',   type: 'select', options: biasOptions.map((o) => ({ ...o })) },
    { id: genId(), label: 'Bias Ln-NY', type: 'select', options: biasOptions.map((o) => ({ ...o })) },
    { id: genId(), label: 'Liq. 4H?',   type: 'multiselect', options: [
      { value: 'Sí', color: '#10b981' },
      { value: 'No', color: '#ef4444' },
      { value: 'Fvg', color: '#3b82f6' },
      { value: 'Alto/Bajo', color: '#f59e0b' },
      { value: 'Gira FVG', color: '#a855f7' },
    ] },
    { id: genId(), label: 'Ejecución',  type: 'link' },
    { id: genId(), label: 'Link 4h',    type: 'link' },
    { id: genId(), label: 'Bias notas', type: 'text' },
    { id: genId(), label: 'Comentario', type: 'text' },
  ]
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface State {
  sets: BacktestSet[]

  // Sets (hojas)
  addSet: (args: { name: string; color?: string; strategyId?: string }) => string
  updateSet: (setId: string, patch: Partial<Pick<BacktestSet, 'name' | 'color' | 'strategyId' | 'notes'>>) => void
  removeSet: (setId: string) => void

  // Columnas
  addColumn: (setId: string, col: Omit<BacktestColumn, 'id'>, afterColumnId?: string) => string
  updateColumn: (setId: string, columnId: string, patch: Partial<Omit<BacktestColumn, 'id'>>) => void
  removeColumn: (setId: string, columnId: string) => void
  /** Mueve la columna una posición (-1 = izquierda, +1 = derecha). */
  moveColumn: (setId: string, columnId: string, dir: -1 | 1) => void
  /** Marca esta columna como 'result' (y desmarca cualquier otra). */
  setResultColumn: (setId: string, columnId: string) => void
  /** Renombra una opción de select/multiselect Y remapea los valores ya
   *  cargados en las filas — sin esto, renombrar una opción dejaría celdas
   *  huérfanas apuntando al string viejo (el clásico bug de Sheets). */
  renameSelectOption: (setId: string, columnId: string, oldValue: string, newValue: string) => void

  // Filas
  addRow: (setId: string, values?: Record<string, BacktestCellValue>) => string
  duplicateRow: (setId: string, rowId: string) => string | null
  removeRow: (setId: string, rowId: string) => void
  setCell: (setId: string, rowId: string, columnId: string, value: BacktestCellValue) => void
}

function touch(s: BacktestSet): BacktestSet {
  return { ...s, updatedAt: nowISO() }
}

export const useBacktestStore = create<State>()(
  persist(
    (set, get) => ({
      sets: [],

      addSet: ({ name, color, strategyId }) => {
        const id = genId()
        const now = nowISO()
        const newSet: BacktestSet = {
          id,
          name: name.trim() || `Hoja ${get().sets.length + 1}`,
          color: color ?? SET_PALETTE[get().sets.length % SET_PALETTE.length],
          strategyId,
          columns: makeDefaultColumns(),
          rows: [],
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ sets: [...s.sets, newSet] }))
        return id
      },

      updateSet: (setId, patch) => set((s) => ({
        sets: s.sets.map((x) => x.id !== setId ? x : touch({ ...x, ...patch })),
      })),

      removeSet: (setId) => set((s) => ({ sets: s.sets.filter((x) => x.id !== setId) })),

      addColumn: (setId, col, afterColumnId) => {
        const id = genId()
        set((s) => ({
          sets: s.sets.map((x) => {
            if (x.id !== setId) return x
            const newCol: BacktestColumn = { ...col, id }
            const idx = afterColumnId ? x.columns.findIndex((c) => c.id === afterColumnId) : -1
            const columns = [...x.columns]
            columns.splice(idx >= 0 ? idx + 1 : columns.length, 0, newCol)
            return touch({ ...x, columns })
          }),
        }))
        return id
      },

      updateColumn: (setId, columnId, patch) => set((s) => ({
        sets: s.sets.map((x) => x.id !== setId ? x : touch({
          ...x,
          columns: x.columns.map((c) => c.id !== columnId ? c : { ...c, ...patch }),
        })),
      })),

      removeColumn: (setId, columnId) => set((s) => ({
        sets: s.sets.map((x) => {
          if (x.id !== setId) return x
          return touch({
            ...x,
            columns: x.columns.filter((c) => c.id !== columnId),
            // Limpieza: sacar el valor de esa columna de todas las filas para
            // que el payload no acumule basura huérfana.
            rows: x.rows.map((r) => {
              if (!(columnId in r.values)) return r
              const values = { ...r.values }
              delete values[columnId]
              return { ...r, values }
            }),
          })
        }),
      })),

      moveColumn: (setId, columnId, dir) => set((s) => ({
        sets: s.sets.map((x) => {
          if (x.id !== setId) return x
          const idx = x.columns.findIndex((c) => c.id === columnId)
          const to = idx + dir
          if (idx < 0 || to < 0 || to >= x.columns.length) return x
          const columns = [...x.columns]
          const [c] = columns.splice(idx, 1)
          columns.splice(to, 0, c)
          return touch({ ...x, columns })
        }),
      })),

      setResultColumn: (setId, columnId) => set((s) => ({
        sets: s.sets.map((x) => x.id !== setId ? x : touch({
          ...x,
          columns: x.columns.map((c) => {
            if (c.id === columnId) return { ...c, role: 'result' as const }
            if (c.role === 'result') { const next = { ...c }; delete next.role; return next }
            return c
          }),
        })),
      })),

      renameSelectOption: (setId, columnId, oldValue, newValue) => {
        const v = newValue.trim()
        if (!v || v === oldValue) return
        set((s) => ({
          sets: s.sets.map((x) => x.id !== setId ? x : touch({
            ...x,
            columns: x.columns.map((c) => c.id !== columnId ? c : {
              ...c,
              options: (c.options ?? []).map((o) => o.value === oldValue ? { ...o, value: v } : o),
            }),
            rows: x.rows.map((r) => {
              const raw = r.values[columnId]
              if (Array.isArray(raw) && raw.includes(oldValue)) {
                return { ...r, values: { ...r.values, [columnId]: raw.map((it) => it === oldValue ? v : it) } }
              }
              if (raw === oldValue) {
                return { ...r, values: { ...r.values, [columnId]: v } }
              }
              return r
            }),
          })),
        }))
      },

      addRow: (setId, values) => {
        const id = genId()
        const now = nowISO()
        set((s) => ({
          sets: s.sets.map((x) => {
            if (x.id !== setId) return x
            // Semilla: la columna date arranca en HOY para que cargar el
            // trade del día sea un solo click menos.
            const seeded: Record<string, BacktestCellValue> = { ...(values ?? {}) }
            const dateCol = x.columns.find((c) => c.role === 'date')
            if (dateCol && seeded[dateCol.id] === undefined) seeded[dateCol.id] = todayYmd()
            const row: BacktestRow = { id, values: seeded, createdAt: now, updatedAt: now }
            return touch({ ...x, rows: [...x.rows, row] })
          }),
        }))
        return id
      },

      duplicateRow: (setId, rowId) => {
        const src = get().sets.find((x) => x.id === setId)?.rows.find((r) => r.id === rowId)
        if (!src) return null
        const id = genId()
        const now = nowISO()
        set((s) => ({
          sets: s.sets.map((x) => {
            if (x.id !== setId) return x
            const idx = x.rows.findIndex((r) => r.id === rowId)
            const rows = [...x.rows]
            rows.splice(idx + 1, 0, { id, values: { ...src.values }, createdAt: now, updatedAt: now })
            return touch({ ...x, rows })
          }),
        }))
        return id
      },

      removeRow: (setId, rowId) => set((s) => ({
        sets: s.sets.map((x) => x.id !== setId ? x : touch({
          ...x, rows: x.rows.filter((r) => r.id !== rowId),
        })),
      })),

      setCell: (setId, rowId, columnId, value) => set((s) => ({
        sets: s.sets.map((x) => x.id !== setId ? x : touch({
          ...x,
          rows: x.rows.map((r) => {
            if (r.id !== rowId) return r
            const values = { ...r.values }
            if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
              delete values[columnId]
            } else {
              values[columnId] = value
            }
            return { ...r, values, updatedAt: nowISO() }
          }),
        })),
      })),
    }),
    {
      name: 'overseer-backtest',
      partialize: (s) => ({ sets: s.sets }),
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.sets)) state.sets = []
      },
    },
  ),
)

// ─── Métricas puras (mismo estilo que tradingStore) ───────────────────────────
//
// Todas operan sobre (rows, columns) ya FILTRADOS por el caller — el panel LAB
// aplica los filtros de parámetros antes y estas funciones no saben de filtros.

/** Columna que acumulan los charts (rol 'result', fallback primera number). */
export function getResultColumn(columns: BacktestColumn[]): BacktestColumn | null {
  return columns.find((c) => c.role === 'result')
    ?? columns.find((c) => c.type === 'number')
    ?? null
}

export function getDateColumn(columns: BacktestColumn[]): BacktestColumn | null {
  return columns.find((c) => c.role === 'date')
    ?? columns.find((c) => c.type === 'date')
    ?? null
}

/** Valor numérico de la celda result (null si vacío o no-numérico). */
export function cellNumber(row: BacktestRow, columnId: string): number | null {
  const v = row.values[columnId]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Filas ordenadas por la columna fecha (las sin fecha van al final, por createdAt). */
export function sortRowsByDate(rows: BacktestRow[], dateColumnId: string | null): BacktestRow[] {
  return [...rows].sort((a, b) => {
    const da = dateColumnId ? String(a.values[dateColumnId] ?? '') : ''
    const db = dateColumnId ? String(b.values[dateColumnId] ?? '') : ''
    if (da && db && da !== db) return da.localeCompare(db)
    if (da && !db) return -1
    if (!da && db) return 1
    return a.createdAt.localeCompare(b.createdAt)
  })
}

export interface BacktestStats {
  count: number          // filas con result numérico
  wins: number
  losses: number
  breakevens: number
  winRate: number        // % sobre wins+losses (BE excluido, estándar en trading)
  totalR: number
  avgR: number
  profitFactor: number | null
  expectancy: number     // = avgR (por trade), lo exponemos con nombre propio
  maxDrawdownR: number   // pico-a-valle de la curva acumulada, en R
  bestR: number | null
  worstR: number | null
}

export function computeStats(rows: BacktestRow[], resultColumnId: string): BacktestStats {
  const values: number[] = []
  for (const r of rows) {
    const n = cellNumber(r, resultColumnId)
    if (n !== null) values.push(n)
  }
  const wins = values.filter((v) => v > 0).length
  const losses = values.filter((v) => v < 0).length
  const breakevens = values.filter((v) => v === 0).length
  const totalR = values.reduce((s, v) => s + v, 0)
  const grossWin = values.filter((v) => v > 0).reduce((s, v) => s + v, 0)
  const grossLoss = Math.abs(values.filter((v) => v < 0).reduce((s, v) => s + v, 0))
  const decided = wins + losses

  // Max drawdown de la curva acumulada
  let peak = 0, equity = 0, maxDD = 0
  for (const v of values) {
    equity += v
    if (equity > peak) peak = equity
    const dd = peak - equity
    if (dd > maxDD) maxDD = dd
  }

  const round2 = (n: number) => Math.round(n * 100) / 100
  return {
    count: values.length,
    wins, losses, breakevens,
    winRate: decided > 0 ? round2((wins / decided) * 100) : 0,
    totalR: round2(totalR),
    avgR: values.length > 0 ? round2(totalR / values.length) : 0,
    profitFactor: grossLoss > 0 ? round2(grossWin / grossLoss) : (grossWin > 0 ? 99 : null),
    expectancy: values.length > 0 ? round2(totalR / values.length) : 0,
    maxDrawdownR: round2(maxDD),
    bestR: values.length > 0 ? Math.max(...values) : null,
    worstR: values.length > 0 ? Math.min(...values) : null,
  }
}

/** Equity curve acumulada en R, ordenada por fecha. */
export function getEquityCurveR(
  rows: BacktestRow[], resultColumnId: string, dateColumnId: string | null,
): { idx: number; date: string; equity: number }[] {
  const sorted = sortRowsByDate(rows, dateColumnId)
  const out: { idx: number; date: string; equity: number }[] = []
  let running = 0
  for (const r of sorted) {
    const n = cellNumber(r, resultColumnId)
    if (n === null) continue
    running += n
    out.push({
      idx: out.length + 1,
      date: dateColumnId ? String(r.values[dateColumnId] ?? '') : '',
      equity: Math.round(running * 100) / 100,
    })
  }
  return out
}

export interface BreakdownEntry {
  value: string
  color?: string
  count: number
  wins: number
  losses: number
  winRate: number
  totalR: number
  avgR: number
}

/** Corazón del LAB: agrupa las filas por el valor de UNA columna paramétrica
 *  (select/multiselect/boolean) y calcula stats por grupo. Una fila multiselect
 *  cuenta en CADA una de sus opciones. Responde "¿qué Modelo rinde mejor?",
 *  "¿qué pasa después de sacar liquidez?", "¿cómo cambia con noticia?". */
export function getBreakdown(
  rows: BacktestRow[], byColumn: BacktestColumn, resultColumnId: string,
): BreakdownEntry[] {
  const groups = new Map<string, number[]>()
  for (const r of rows) {
    const n = cellNumber(r, resultColumnId)
    if (n === null) continue
    const raw = r.values[byColumn.id]
    let keys: string[]
    if (Array.isArray(raw)) keys = raw.map(String)
    else if (typeof raw === 'boolean') keys = [raw ? 'Sí' : 'No']
    else if (raw !== null && raw !== undefined && String(raw).trim() !== '') keys = [String(raw)]
    else keys = ['(vacío)']
    for (const k of keys) {
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(n)
    }
  }
  const round2 = (x: number) => Math.round(x * 100) / 100
  const colorFor = (value: string): string | undefined =>
    byColumn.options?.find((o) => o.value === value)?.color
  const out: BreakdownEntry[] = []
  for (const [value, vals] of groups) {
    const wins = vals.filter((v) => v > 0).length
    const losses = vals.filter((v) => v < 0).length
    const decided = wins + losses
    const totalR = vals.reduce((s, v) => s + v, 0)
    out.push({
      value,
      color: colorFor(value),
      count: vals.length,
      wins, losses,
      winRate: decided > 0 ? round2((wins / decided) * 100) : 0,
      totalR: round2(totalR),
      avgR: round2(totalR / vals.length),
    })
  }
  // Más operadas primero — lo más significativo arriba.
  return out.sort((a, b) => b.count - a.count)
}

/** Histograma de resultados en buckets de R (para ver la distribución). */
export function getRDistribution(
  rows: BacktestRow[], resultColumnId: string,
): { bucket: string; from: number; count: number }[] {
  const values: number[] = []
  for (const r of rows) {
    const n = cellNumber(r, resultColumnId)
    if (n !== null) values.push(n)
  }
  if (values.length === 0) return []
  const buckets = new Map<number, number>()
  for (const v of values) {
    const b = Math.floor(v) // bucket [n, n+1)
    buckets.set(b, (buckets.get(b) ?? 0) + 1)
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([from, count]) => ({ bucket: `${from} a ${from + 1}R`, from, count }))
}

/** Aplica filtros de parámetros: Record<columnId, valores aceptados>. Una fila
 *  pasa si para CADA filtro su valor (o alguno, en multiselect) está incluido. */
export function filterRows(
  rows: BacktestRow[], filters: Record<string, string[]>,
): BacktestRow[] {
  const active = Object.entries(filters).filter(([, vals]) => vals.length > 0)
  if (active.length === 0) return rows
  return rows.filter((r) => active.every(([colId, accepted]) => {
    const raw = r.values[colId]
    if (Array.isArray(raw)) return raw.some((v) => accepted.includes(String(v)))
    if (typeof raw === 'boolean') return accepted.includes(raw ? 'Sí' : 'No')
    if (raw === null || raw === undefined || String(raw).trim() === '') return accepted.includes('(vacío)')
    return accepted.includes(String(raw))
  }))
}
