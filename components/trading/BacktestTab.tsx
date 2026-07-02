'use client'
/**
 * BACKTESTING — planilla estilo Excel para testear estrategias + panel LAB.
 *
 * Diseño (calcado del workflow del usuario en Google Sheets):
 *   - Hojas (sets) arriba, como pestañas — cada una es una estrategia.
 *   - Tabla con columnas definidas por el usuario: selects con chips de
 *     colores, números R coloreados por signo (verde/rojo/ámbar), links,
 *     fechas con día de la semana. Enter en una celda baja a la siguiente
 *     fila (data-entry rápido, como en Sheets).
 *   - Filtros por columna paramétrica (funnel en el header) — filtran la
 *     tabla Y el LAB a la vez.
 *   - LAB: KPIs (win rate, avg R, profit factor, expectancy, max DD),
 *     equity curve en R, distribución de R, y breakdown por CUALQUIER
 *     parámetro ("¿qué modelo rinde mejor?", "¿y si sacó liquidez 4H?").
 *
 * Los popovers (dropdowns de celda, menú de columna, filtros) se renderizan
 * por PORTAL con posición fixed — si no, el overflow del contenedor de la
 * tabla los recortaría.
 */
import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  ReferenceLine, BarChart, Bar, Cell,
} from 'recharts'
import {
  Plus, Trash2, X, Pencil, ChevronDown, ChevronLeft, ChevronRight,
  ListFilter, FlaskConical, Copy, Sheet as SheetIcon, Target,
} from 'lucide-react'
import {
  useBacktestStore, defaultColumnWidth, computeStats, getEquityCurveR,
  getBreakdown, getRDistribution, filterRows, getResultColumn, getDateColumn,
  sortRowsByDate, cellNumber, OPTION_PALETTE, SET_PALETTE,
  type BacktestSet, type BacktestColumn, type BacktestRow, type BacktestCellValue,
  type BacktestColumnType,
} from '@/lib/store/backtestStore'

const LS_CURRENT_SET = 'overseer-backtest-current-set'
const LS_LAB_OPEN = 'overseer-backtest-lab-open'

const TYPE_LABELS: Record<BacktestColumnType, string> = {
  text: 'Texto', number: 'Número', select: 'Selección', multiselect: 'Multi-selección',
  date: 'Fecha', time: 'Hora', link: 'Link', boolean: 'Sí / No',
}

function readLS(key: string): string | null {
  if (typeof window === 'undefined') return null
  try { return window.localStorage.getItem(key) } catch { return null }
}
function writeLS(key: string, value: string) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(key, value) } catch { /* noop */ }
}

/** "2026-02-20" → { d: "20/2", wd: "vie" } para mostrar fecha + día juntos. */
function fmtDateCell(ymd: string): { d: string; wd: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
  if (!m) return null
  const dt = new Date(+m[1], +m[2] - 1, +m[3])
  return { d: `${+m[3]}/${+m[2]}`, wd: dt.toLocaleDateString('es-AR', { weekday: 'short' }) }
}

/** Números con coma decimal (es-AR), como la planilla: 2,00 / -1,00. */
function fmtNum(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function numColorClasses(n: number): string {
  if (n > 0) return 'bg-emerald-500/15 text-emerald-300'
  if (n < 0) return 'bg-red-500/15 text-red-300'
  return 'bg-amber-500/15 text-amber-200'
}

// ─── Popover por portal (inmune al clipping del scroll de la tabla) ───────────

function Popover({ anchor, onClose, width = 232, children }: {
  anchor: DOMRect
  onClose: () => void
  width?: number
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    // Scroll FUERA del popover → cerrar (el fixed quedaría desanclado de la celda).
    const onScroll = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return
      onClose()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose])
  if (typeof document === 'undefined') return null
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 12))
  const top = Math.min(anchor.bottom + 4, window.innerHeight - 60)
  return createPortal(
    <div
      ref={ref}
      className="fixed z-[100] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1"
      style={{ left, top, width, maxHeight: `min(420px, calc(100vh - ${top}px - 12px))`, overflowY: 'auto' }}
    >
      {children}
    </div>,
    document.body,
  )
}

// ─── Input inline de celda (commit en blur/Enter, Enter baja de fila) ─────────

function InlineInput({ initial, align, inputType, onCommit, onCommitNext, onCancel }: {
  initial: string
  align?: 'center' | 'left'
  inputType?: 'text' | 'date'
  onCommit: (v: string) => void
  onCommitNext: (v: string) => void
  onCancel: () => void
}) {
  const [v, setV] = useState(initial)
  const done = useRef(false)
  const finish = (fn: (val: string) => void, val: string) => {
    if (done.current) return
    done.current = true
    fn(val)
  }
  return (
    <input
      autoFocus
      type={inputType ?? 'text'}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => { if ((inputType ?? 'text') === 'text') e.target.select() }}
      onBlur={() => finish(onCommit, v)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') { e.preventDefault(); finish(onCommitNext, v) }
        if (e.key === 'Escape') finish(() => onCancel(), v)
      }}
      className={`w-full bg-zinc-800 border border-violet-500/60 rounded px-1.5 py-0.5 text-xs text-zinc-100 focus:outline-none ${
        align === 'center' ? 'text-center' : ''
      }`}
    />
  )
}

// ─── Chip de opción (select/multiselect) ──────────────────────────────────────

function OptionChip({ value, color, small }: { value: string; color?: string; small?: boolean }) {
  const c = color ?? '#71717a'
  return (
    <span
      className={`inline-flex items-center rounded font-semibold whitespace-nowrap ${
        small ? 'px-1 py-px text-[10px]' : 'px-1.5 py-0.5 text-[11px]'
      }`}
      style={{ background: `${c}22`, color: c === '#71717a' ? '#a1a1aa' : c }}
    >
      {value}
    </span>
  )
}

// ─── Tab principal ────────────────────────────────────────────────────────────

type PopoverState =
  | { kind: 'cell-select'; rowId: string; colId: string; rect: DOMRect }
  | { kind: 'col-menu'; colId: string; rect: DOMRect }
  | { kind: 'col-filter'; colId: string; rect: DOMRect }
  | { kind: 'add-col'; rect: DOMRect }
  | null

export function BacktestTab() {
  const sets = useBacktestStore((s) => s.sets)
  const addRow = useBacktestStore((s) => s.addRow)

  const [currentSetId, setCurrentSetIdState] = useState<string | null>(() => readLS(LS_CURRENT_SET))
  const setCurrentSetId = (id: string) => { setCurrentSetIdState(id); writeLS(LS_CURRENT_SET, id) }
  const current = sets.find((x) => x.id === currentSetId) ?? sets[0] ?? null

  const [labOpen, setLabOpenState] = useState<boolean>(() => readLS(LS_LAB_OPEN) !== '0')
  const setLabOpen = (v: boolean) => { setLabOpenState(v); writeLS(LS_LAB_OPEN, v ? '1' : '0') }

  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null)
  const [popover, setPopover] = useState<PopoverState>(null)
  const [filters, setFilters] = useState<Record<string, string[]>>({})
  const [setModal, setSetModal] = useState<'create' | BacktestSet | null>(null)

  // Cambiar de hoja limpia el estado efímero (filtros/edición son por-hoja).
  const switchSet = (id: string) => {
    setCurrentSetId(id)
    setEditingCell(null)
    setPopover(null)
    setFilters({})
  }

  const visibleRows = useMemo(
    () => current ? filterRows(current.rows, filters) : [],
    [current, filters],
  )
  const activeFilterCount = Object.values(filters).filter((v) => v.length > 0).length

  const handleAddTrade = () => {
    if (!current) return
    const rowId = addRow(current.id)
    // Abrir la edición en la primera columna que no venga pre-cargada (la
    // fecha se siembra con HOY) — un click menos para cargar el trade.
    const firstEditable = current.columns.find((c) => c.type !== 'date')
    if (firstEditable) {
      if (firstEditable.type === 'select' || firstEditable.type === 'multiselect') {
        setEditingCell(null)
      } else {
        setEditingCell({ rowId, colId: firstEditable.id })
      }
    }
  }

  /** Enter en una celda → commit + editar la MISMA columna en la fila de abajo. */
  const editNextRow = (rowId: string, colId: string) => {
    const idx = visibleRows.findIndex((r) => r.id === rowId)
    const next = idx >= 0 ? visibleRows[idx + 1] : undefined
    setEditingCell(next ? { rowId: next.id, colId } : null)
  }

  if (sets.length === 0) {
    return (
      <>
        <div className="flex items-center justify-center py-20">
          <div className="text-center max-w-md px-8 py-10 bg-zinc-900/60 border border-dashed border-zinc-700 rounded-2xl">
            <SheetIcon className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-zinc-200 mb-1">Backtesting de estrategias</p>
            <p className="text-xs text-zinc-500 leading-relaxed mb-4">
              Creá una hoja por estrategia, cargá los trades como en tu planilla
              (columnas configurables, dropdowns con colores) y el LAB te muestra
              qué parámetros rinden: modelo, liquidez, bias, noticia…
            </p>
            <button
              onClick={() => setSetModal('create')}
              className="px-4 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/25 transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Crear primera hoja
            </button>
          </div>
        </div>
        <AnimatePresence>
          {setModal && (
            <SetModal
              editing={setModal === 'create' ? null : setModal}
              onSaved={(id) => { switchSet(id); setSetModal(null) }}
              onClose={() => setSetModal(null)}
            />
          )}
        </AnimatePresence>
      </>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Hojas (sets) ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">Hoja:</span>
        {sets.map((x) => {
          const active = current?.id === x.id
          return (
            <div key={x.id} className="flex items-center">
              <button
                onClick={() => switchSet(x.id)}
                className={`px-3 py-1 text-xs font-semibold border transition-colors ${active ? 'rounded-l-lg' : 'rounded-lg'}`}
                style={{
                  background: active ? `${x.color}22` : 'transparent',
                  borderColor: active ? x.color : '#27272a',
                  color: active ? '#fff' : '#a1a1aa',
                }}
              >
                {x.name}
                <span className="ml-1.5 text-[10px] font-mono opacity-60">{x.rows.length}</span>
              </button>
              {active && (
                <button
                  onClick={() => setSetModal(x)}
                  title="Editar hoja"
                  className="px-1.5 py-1 rounded-r-lg border-y border-r text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors"
                  style={{ borderColor: x.color }}
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          )
        })}
        <button
          onClick={() => setSetModal('create')}
          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-dashed border-zinc-700 text-zinc-500 hover:text-emerald-300 hover:border-emerald-400/40 transition-colors inline-flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Nueva hoja
        </button>
      </div>

      {current && (
        <>
          {/* ── Toolbar ── */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleAddTrade}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/25 transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Trade
            </button>
            <button
              onClick={() => setLabOpen(!labOpen)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${
                labOpen
                  ? 'bg-violet-500/15 border-violet-500/40 text-violet-300'
                  : 'bg-transparent border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5" /> LAB
            </button>

            {/* Filtros activos */}
            {activeFilterCount > 0 && (
              <>
                {Object.entries(filters).filter(([, v]) => v.length > 0).map(([colId, vals]) => {
                  const col = current.columns.find((c) => c.id === colId)
                  if (!col) return null
                  return (
                    <span key={colId} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-300 text-[11px]">
                      <ListFilter className="w-3 h-3" />
                      <span className="font-semibold">{col.label}:</span> {vals.join(', ')}
                      <button
                        onClick={() => setFilters((f) => ({ ...f, [colId]: [] }))}
                        className="ml-0.5 opacity-60 hover:opacity-100"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )
                })}
                <button
                  onClick={() => setFilters({})}
                  className="text-[11px] text-zinc-500 hover:text-zinc-200 underline underline-offset-2"
                >
                  Limpiar filtros
                </button>
              </>
            )}

            <span className="ml-auto text-[11px] font-mono text-zinc-600">
              {activeFilterCount > 0
                ? `${visibleRows.length} de ${current.rows.length} trades`
                : `${current.rows.length} trades`}
            </span>
          </div>

          {/* ── LAB ── */}
          {labOpen && <LabPanel set={current} rows={visibleRows} filtered={activeFilterCount > 0} />}

          {/* ── Tabla ── */}
          <BacktestTable
            set={current}
            rows={visibleRows}
            filters={filters}
            editingCell={editingCell}
            setEditingCell={setEditingCell}
            editNextRow={editNextRow}
            setPopover={setPopover}
            onAddTrade={handleAddTrade}
          />
        </>
      )}

      <AnimatePresence>
        {setModal && (
          <SetModal
            editing={setModal === 'create' ? null : setModal}
            onSaved={(id) => { switchSet(id); setSetModal(null) }}
            onClose={() => setSetModal(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Popovers (portal) ── */}
      {popover?.kind === 'cell-select' && current && (
        <CellSelectPopover
          set={current}
          rowId={popover.rowId}
          colId={popover.colId}
          rect={popover.rect}
          onClose={() => setPopover(null)}
        />
      )}
      {popover?.kind === 'col-menu' && current && (
        <ColumnMenuPopover
          set={current}
          colId={popover.colId}
          rect={popover.rect}
          onClose={() => setPopover(null)}
        />
      )}
      {popover?.kind === 'col-filter' && current && (
        <FilterPopover
          set={current}
          colId={popover.colId}
          rect={popover.rect}
          filters={filters}
          setFilters={setFilters}
          onClose={() => setPopover(null)}
        />
      )}
      {popover?.kind === 'add-col' && current && (
        <AddColumnPopover
          set={current}
          rect={popover.rect}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  )
}

// ─── LAB — stats + charts + breakdown por parámetro ───────────────────────────

function LabPanel({ set, rows, filtered }: { set: BacktestSet; rows: BacktestRow[]; filtered: boolean }) {
  const resultCol = getResultColumn(set.columns)
  const dateCol = getDateColumn(set.columns)
  const paramCols = set.columns.filter((c) => c.type === 'select' || c.type === 'multiselect' || c.type === 'boolean')
  const [byColId, setByColId] = useState<string | null>(null)
  const byCol = paramCols.find((c) => c.id === byColId) ?? paramCols[0] ?? null

  // Ordenar por fecha ANTES de computar: el max drawdown depende del orden
  // (pico→valle de la curva acumulada) y las filas vienen en orden de carga.
  const stats = useMemo(
    () => resultCol ? computeStats(sortRowsByDate(rows, dateCol?.id ?? null), resultCol.id) : null,
    [rows, resultCol, dateCol],
  )
  const curve = useMemo(
    () => resultCol ? getEquityCurveR(rows, resultCol.id, dateCol?.id ?? null) : [],
    [rows, resultCol, dateCol],
  )
  const dist = useMemo(
    () => resultCol ? getRDistribution(rows, resultCol.id) : [],
    [rows, resultCol],
  )
  // Sin useMemo a propósito: `byCol` es un objeto derivado y el React
  // Compiler no puede preservar la memoización manual (lint error). El
  // cálculo es O(filas) sobre cientos de filas — recomputar es gratis.
  const breakdown = (resultCol && byCol) ? getBreakdown(rows, byCol, resultCol.id) : []

  if (!resultCol) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-500">
        Agregá una columna numérica (tu R) para ver las métricas — o marcá una existente
        como columna R desde el menú de su header.
      </div>
    )
  }
  if (!stats || stats.count === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-500">
        Cargá trades con valor en <span className="text-zinc-300 font-semibold">{resultCol.label}</span> y
        acá aparecen win rate, equity curve y el análisis por parámetro.
      </div>
    )
  }

  const pnlColor = (n: number) => n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-zinc-300'

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <FlaskConical className="w-3.5 h-3.5 text-violet-400" />
        <span className="text-xs font-bold text-zinc-200">LAB — {set.name}</span>
        <span className="text-[10px] font-mono text-zinc-600">
          columna R: {resultCol.label}{filtered ? ' · sobre trades filtrados' : ''}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <LabStat label="Trades" value={String(stats.count)} />
        <LabStat label="Win rate" value={`${fmtNum(stats.winRate)}%`} color={stats.winRate >= 50 ? '#10b981' : '#f59e0b'}
          sub={`${stats.wins}W · ${stats.losses}L${stats.breakevens ? ` · ${stats.breakevens}BE` : ''}`} />
        <LabStat label="R total" value={fmtNum(stats.totalR)} color={stats.totalR >= 0 ? '#10b981' : '#ef4444'} />
        <LabStat label="Expectancy" value={`${fmtNum(stats.expectancy)}R`} color={stats.expectancy >= 0 ? '#10b981' : '#ef4444'} sub="por trade" />
        <LabStat label="Profit factor" value={stats.profitFactor === null ? '—' : fmtNum(stats.profitFactor)}
          color={(stats.profitFactor ?? 0) >= 1.5 ? '#10b981' : '#f59e0b'} />
        <LabStat label="Max DD" value={`-${fmtNum(stats.maxDrawdownR)}R`} color="#ef4444" />
        <LabStat label="Mejor / peor" value={`${stats.bestR !== null ? fmtNum(stats.bestR) : '—'} / ${stats.worstR !== null ? fmtNum(stats.worstR) : '—'}`} />
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">Equity curve (R acumulado)</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curve} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="btEquity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="idx" tick={{ fontSize: 9, fill: '#71717a' }} />
                <YAxis tick={{ fontSize: 9, fill: '#71717a' }} />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
                  formatter={(v) => [`${fmtNum(Number(v))}R`, 'Equity']}
                  labelFormatter={(idx) => {
                    const p = curve[Number(idx) - 1]
                    return p?.date ? `Trade #${idx} · ${p.date}` : `Trade #${idx}`
                  }}
                />
                <ReferenceLine y={0} stroke="#52525b" />
                <Area type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2} fill="url(#btEquity)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">Distribución de R</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dist} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="bucket" tick={{ fontSize: 9, fill: '#71717a' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: '#71717a' }} />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
                  formatter={(v) => [String(v), 'Trades']}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {dist.map((d) => (
                    <Cell key={d.bucket} fill={d.from < 0 ? '#ef4444' : '#10b981'} fillOpacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Breakdown por parámetro — el corazón del LAB */}
      {paramCols.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mr-1">Analizar por:</span>
            {paramCols.map((c) => {
              const active = byCol?.id === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => setByColId(c.id)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-colors ${
                    active
                      ? 'bg-violet-500/15 border-violet-500/40 text-violet-300'
                      : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                  }`}
                >
                  {c.label}
                </button>
              )
            })}
          </div>
          {byCol && breakdown.length > 0 && (
            <div className="space-y-1">
              {/* Header de la mini-tabla */}
              <div className="grid grid-cols-[minmax(90px,1.4fr)_44px_1fr_64px_64px] gap-2 px-2 text-[9px] font-mono uppercase tracking-wider text-zinc-600">
                <span>{byCol.label}</span><span>N</span><span>Win rate</span><span className="text-right">Avg R</span><span className="text-right">R total</span>
              </div>
              {breakdown.map((e) => (
                <div
                  key={e.value}
                  className="grid grid-cols-[minmax(90px,1.4fr)_44px_1fr_64px_64px] gap-2 items-center px-2 py-1.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color ?? '#52525b' }} />
                    <span className="text-[11px] text-zinc-200 font-semibold truncate">{e.value}</span>
                  </span>
                  <span className="text-[11px] font-mono text-zinc-500">{e.count}</span>
                  <span className="flex items-center gap-2">
                    <span className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.min(100, e.winRate)}%`,
                          background: e.winRate >= 50 ? '#10b981' : '#f59e0b',
                        }}
                      />
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400 w-12 text-right">{fmtNum(e.winRate)}%</span>
                  </span>
                  <span className={`text-[11px] font-mono text-right ${pnlColor(e.avgR)}`}>{fmtNum(e.avgR)}</span>
                  <span className={`text-[11px] font-mono text-right font-bold ${pnlColor(e.totalR)}`}>{fmtNum(e.totalR)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LabStat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg px-2.5 py-2">
      <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-600">{label}</p>
      <p className="text-sm font-bold tabular-nums" style={{ color: color ?? '#e4e4e7' }}>{value}</p>
      {sub && <p className="text-[9px] text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Tabla ────────────────────────────────────────────────────────────────────

function BacktestTable({
  set, rows, filters, editingCell, setEditingCell, editNextRow, setPopover, onAddTrade,
}: {
  set: BacktestSet
  rows: BacktestRow[]
  filters: Record<string, string[]>
  editingCell: { rowId: string; colId: string } | null
  setEditingCell: (v: { rowId: string; colId: string } | null) => void
  editNextRow: (rowId: string, colId: string) => void
  setPopover: (v: PopoverState) => void
  onAddTrade: () => void
}) {
  const setCell = useBacktestStore((s) => s.setCell)
  const removeRow = useBacktestStore((s) => s.removeRow)
  const duplicateRow = useBacktestStore((s) => s.duplicateRow)

  const colWidth = (c: BacktestColumn) => c.width ?? defaultColumnWidth(c.type)
  const totalWidth = 36 + set.columns.reduce((s, c) => s + colWidth(c), 0) + 64 + 44

  const commitValue = (rowId: string, col: BacktestColumn, raw: string) => {
    if (col.type === 'number') {
      const t = raw.trim()
      if (t === '') { setCell(set.id, rowId, col.id, null); return }
      const n = Number(t.replace(',', '.'))
      setCell(set.id, rowId, col.id, Number.isFinite(n) ? n : null)
    } else {
      setCell(set.id, rowId, col.id, raw.trim() || null)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 overflow-auto max-h-[68vh] bg-zinc-950/40">
      <table className="border-separate border-spacing-0 text-xs" style={{ minWidth: totalWidth }}>
        <thead>
          <tr>
            {/* Esquina (número de fila) */}
            <th className="sticky left-0 top-0 z-30 bg-zinc-900 border-b border-r border-zinc-800 w-9 min-w-9" />
            {set.columns.map((col) => {
              const filterable = col.type === 'select' || col.type === 'multiselect' || col.type === 'boolean'
              const hasFilter = (filters[col.id]?.length ?? 0) > 0
              const w = colWidth(col)
              return (
                <th
                  key={col.id}
                  className="sticky top-0 z-20 bg-zinc-900 border-b border-r border-zinc-800/70 px-2 py-1.5 text-left font-semibold text-zinc-300 whitespace-nowrap group/th"
                  style={{ width: w, minWidth: w, maxWidth: w }}
                >
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => setPopover({ kind: 'col-menu', colId: col.id, rect: e.currentTarget.getBoundingClientRect() })}
                      title="Configurar columna"
                      className="flex items-center gap-1 min-w-0 hover:text-white transition-colors"
                    >
                      <span className="truncate">{col.label}</span>
                      {col.role === 'result' && (
                        <span title="Columna R (alimenta los stats)">
                          <Target className="w-3 h-3 text-violet-400 shrink-0" />
                        </span>
                      )}
                      <ChevronDown className="w-3 h-3 text-zinc-600 shrink-0 opacity-0 group-hover/th:opacity-100 transition-opacity" />
                    </button>
                    {filterable && (
                      <button
                        onClick={(e) => setPopover({ kind: 'col-filter', colId: col.id, rect: e.currentTarget.getBoundingClientRect() })}
                        title="Filtrar"
                        className={`ml-auto shrink-0 p-0.5 rounded transition-colors ${
                          hasFilter ? 'text-sky-400' : 'text-zinc-700 opacity-0 group-hover/th:opacity-100 hover:text-zinc-300'
                        }`}
                      >
                        <ListFilter className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </th>
              )
            })}
            {/* + columna */}
            <th className="sticky top-0 z-20 bg-zinc-900 border-b border-zinc-800/70 px-1.5 w-16 min-w-16">
              <button
                onClick={(e) => setPopover({ kind: 'add-col', rect: e.currentTarget.getBoundingClientRect() })}
                title="Agregar columna"
                className="w-full flex items-center justify-center gap-0.5 text-zinc-600 hover:text-emerald-300 transition-colors py-0.5"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </th>
            {/* Espacio de acciones de fila */}
            <th className="sticky top-0 z-20 bg-zinc-900 border-b border-zinc-800/70 w-11 min-w-11" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} className="group hover:bg-white/[0.02]">
              <td className="sticky left-0 z-10 bg-zinc-950 border-b border-r border-zinc-800/60 text-center text-[10px] font-mono text-zinc-600 select-none">
                {i + 1}
              </td>
              {set.columns.map((col) => (
                <CellTd
                  key={col.id}
                  row={row}
                  col={col}
                  width={colWidth(col)}
                  editing={editingCell?.rowId === row.id && editingCell?.colId === col.id}
                  startEdit={() => setEditingCell({ rowId: row.id, colId: col.id })}
                  openSelect={(rect) => setPopover({ kind: 'cell-select', rowId: row.id, colId: col.id, rect })}
                  commit={(raw) => { commitValue(row.id, col, raw); setEditingCell(null) }}
                  commitNext={(raw) => { commitValue(row.id, col, raw); editNextRow(row.id, col.id) }}
                  cancel={() => setEditingCell(null)}
                  setCellValue={(v) => setCell(set.id, row.id, col.id, v)}
                />
              ))}
              <td className="border-b border-zinc-800/40" />
              <td className="border-b border-zinc-800/40 px-1">
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => duplicateRow(set.id, row.id)}
                    title="Duplicar fila"
                    className="p-0.5 rounded text-zinc-600 hover:text-zinc-200 transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => removeRow(set.id, row.id)}
                    title="Borrar fila"
                    className="p-0.5 rounded text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {/* Fila fantasma para agregar */}
          <tr>
            <td className="sticky left-0 z-10 bg-zinc-950 border-r border-zinc-800/60" />
            <td colSpan={set.columns.length + 2}>
              <button
                onClick={onAddTrade}
                className="w-full text-left px-2 py-1.5 text-[11px] text-zinc-600 hover:text-emerald-300 transition-colors inline-flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Agregar trade
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ─── Celda (dispatch por tipo) ────────────────────────────────────────────────

function CellTd({ row, col, width, editing, startEdit, openSelect, commit, commitNext, cancel, setCellValue }: {
  row: BacktestRow
  col: BacktestColumn
  width: number
  editing: boolean
  startEdit: () => void
  openSelect: (rect: DOMRect) => void
  commit: (raw: string) => void
  commitNext: (raw: string) => void
  cancel: () => void
  setCellValue: (v: BacktestCellValue) => void
}) {
  const raw = row.values[col.id]
  const base = 'border-b border-r border-zinc-800/40 px-1.5 py-1 align-middle'
  const style = { width, minWidth: width, maxWidth: width }

  // ── select / multiselect: chip(s) + popover ──
  if (col.type === 'select' || col.type === 'multiselect') {
    const values = Array.isArray(raw) ? raw : (raw !== null && raw !== undefined && raw !== '' ? [String(raw)] : [])
    return (
      <td className={`${base} cursor-pointer`} style={style} onClick={(e) => openSelect(e.currentTarget.getBoundingClientRect())}>
        {values.length > 0 ? (
          <span className="flex items-center gap-1 flex-wrap">
            {values.map((v) => (
              <OptionChip key={v} value={v} color={col.options?.find((o) => o.value === v)?.color} small={values.length > 1} />
            ))}
          </span>
        ) : (
          <span className="text-zinc-700">—</span>
        )}
      </td>
    )
  }

  // ── boolean: cicla Sí → No → vacío ──
  if (col.type === 'boolean') {
    const cycle = () => setCellValue(raw === true ? false : raw === false ? null : true)
    return (
      <td className={`${base} cursor-pointer text-center`} style={style} onClick={cycle}>
        {raw === true ? <OptionChip value="Sí" color="#10b981" />
          : raw === false ? <OptionChip value="No" color="#ef4444" />
          : <span className="text-zinc-700">—</span>}
      </td>
    )
  }

  // ── date ──
  if (col.type === 'date') {
    if (editing) {
      return (
        <td className={base} style={style}>
          <InlineInput
            initial={typeof raw === 'string' ? raw : ''}
            inputType="date"
            onCommit={commit}
            onCommitNext={commitNext}
            onCancel={cancel}
          />
        </td>
      )
    }
    const f = typeof raw === 'string' ? fmtDateCell(raw) : null
    return (
      <td className={`${base} cursor-text whitespace-nowrap`} style={style} onClick={startEdit}>
        {f ? (
          <span className="text-zinc-200 font-medium">
            {f.d} <span className="text-zinc-500 text-[10px] capitalize">{f.wd}</span>
          </span>
        ) : <span className="text-zinc-700">—</span>}
      </td>
    )
  }

  // ── number: coloreado por signo, como la planilla ──
  if (col.type === 'number') {
    if (editing) {
      return (
        <td className={base} style={style}>
          <InlineInput
            initial={raw !== null && raw !== undefined ? String(raw) : ''}
            align="center"
            onCommit={commit}
            onCommitNext={commitNext}
            onCancel={cancel}
          />
        </td>
      )
    }
    const n = cellNumber(row, col.id)
    return (
      <td
        className={`${base} cursor-text text-center font-mono font-semibold tabular-nums ${n !== null ? numColorClasses(n) : ''}`}
        style={style}
        onClick={startEdit}
      >
        {n !== null ? fmtNum(n) : <span className="text-zinc-700">—</span>}
      </td>
    )
  }

  // ── link ──
  if (col.type === 'link') {
    if (editing) {
      return (
        <td className={base} style={style}>
          <InlineInput
            initial={typeof raw === 'string' ? raw : ''}
            onCommit={commit}
            onCommitNext={commitNext}
            onCancel={cancel}
          />
        </td>
      )
    }
    const url = typeof raw === 'string' ? raw : ''
    return (
      <td className={`${base} cursor-text whitespace-nowrap overflow-hidden`} style={style} onClick={startEdit}>
        {url ? (
          <a
            href={url.startsWith('http') ? url : `https://${url}`}
            target="_blank" rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-sky-400 hover:text-sky-300 hover:underline truncate block"
            title={url}
          >
            {url.replace(/^https?:\/\//, '').slice(0, 22)}{url.replace(/^https?:\/\//, '').length > 22 ? '…' : ''}
          </a>
        ) : <span className="text-zinc-700">—</span>}
      </td>
    )
  }

  // ── text / time ──
  if (editing) {
    return (
      <td className={base} style={style}>
        <InlineInput
          initial={typeof raw === 'string' ? raw : ''}
          onCommit={commit}
          onCommitNext={commitNext}
          onCancel={cancel}
        />
      </td>
    )
  }
  const text = raw !== null && raw !== undefined ? String(raw) : ''
  return (
    <td
      className={`${base} cursor-text text-zinc-300 whitespace-nowrap overflow-hidden text-ellipsis`}
      style={style}
      onClick={startEdit}
      title={text.length > 30 ? text : undefined}
    >
      {text || <span className="text-zinc-700">—</span>}
    </td>
  )
}

// ─── Popover: elegir opción de una celda select/multiselect ──────────────────

function CellSelectPopover({ set, rowId, colId, rect, onClose }: {
  set: BacktestSet; rowId: string; colId: string; rect: DOMRect; onClose: () => void
}) {
  const setCell = useBacktestStore((s) => s.setCell)
  const updateColumn = useBacktestStore((s) => s.updateColumn)
  const [newOption, setNewOption] = useState('')

  const col = set.columns.find((c) => c.id === colId)
  const row = set.rows.find((r) => r.id === rowId)
  if (!col || !row) return null

  const isMulti = col.type === 'multiselect'
  const raw = row.values[colId]
  const selected = Array.isArray(raw) ? raw : (raw !== null && raw !== undefined && raw !== '' ? [String(raw)] : [])

  const pick = (value: string) => {
    if (isMulti) {
      const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]
      setCell(set.id, rowId, colId, next.length > 0 ? next : null)
      // multiselect queda abierto para seguir tildando
    } else {
      setCell(set.id, rowId, colId, selected.includes(value) ? null : value)
      onClose()
    }
  }

  const addOption = () => {
    const v = newOption.trim()
    if (!v) return
    const options = col.options ?? []
    if (!options.some((o) => o.value === v)) {
      updateColumn(set.id, colId, {
        options: [...options, { value: v, color: OPTION_PALETTE[options.length % OPTION_PALETTE.length] }],
      })
    }
    pick(v)
    setNewOption('')
  }

  return (
    <Popover anchor={rect} onClose={onClose} width={220}>
      {(col.options ?? []).map((o) => {
        const active = selected.includes(o.value)
        return (
          <button
            key={o.value}
            onClick={() => pick(o.value)}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.05] ${active ? 'bg-white/[0.04]' : ''}`}
          >
            {isMulti && (
              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                active ? 'bg-violet-500 border-violet-500' : 'border-zinc-600'
              }`}>
                {active && <span className="text-white text-[9px] leading-none">✓</span>}
              </span>
            )}
            <OptionChip value={o.value} color={o.color} />
            {!isMulti && active && <span className="ml-auto text-violet-400 text-[10px]">✓</span>}
          </button>
        )
      })}
      {(col.options ?? []).length === 0 && (
        <p className="px-2.5 py-1.5 text-[11px] text-zinc-600 italic">Sin opciones — creá la primera abajo.</p>
      )}
      {selected.length > 0 && (
        <button
          onClick={() => { setCell(set.id, rowId, colId, null); onClose() }}
          className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] border-t border-zinc-800 transition-colors"
        >
          <X className="w-3 h-3" /> Limpiar
        </button>
      )}
      <div className="flex items-center gap-1 px-2 py-1.5 border-t border-zinc-800">
        <input
          value={newOption}
          onChange={(e) => setNewOption(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') addOption() }}
          placeholder="Nueva opción…"
          className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-violet-500"
        />
        <button onClick={addOption} className="p-1 rounded text-emerald-400 hover:bg-emerald-500/10">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </Popover>
  )
}

// ─── Popover: filtro de columna ───────────────────────────────────────────────

function FilterPopover({ set, colId, rect, filters, setFilters, onClose }: {
  set: BacktestSet
  colId: string
  rect: DOMRect
  filters: Record<string, string[]>
  setFilters: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
  onClose: () => void
}) {
  const col = set.columns.find((c) => c.id === colId)
  if (!col) return null
  const optionValues = col.type === 'boolean'
    ? ['Sí', 'No']
    : (col.options ?? []).map((o) => o.value)
  const all = [...optionValues, '(vacío)']
  const selected = filters[colId] ?? []

  const toggle = (v: string) => {
    setFilters((f) => {
      const cur = f[colId] ?? []
      return { ...f, [colId]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] }
    })
  }

  return (
    <Popover anchor={rect} onClose={onClose} width={210}>
      <p className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-600">Filtrar {col.label}</p>
      {all.map((v) => {
        const active = selected.includes(v)
        const color = col.options?.find((o) => o.value === v)?.color
        return (
          <button
            key={v}
            onClick={() => toggle(v)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-white/[0.05] transition-colors"
          >
            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
              active ? 'bg-sky-500 border-sky-500' : 'border-zinc-600'
            }`}>
              {active && <span className="text-white text-[9px] leading-none">✓</span>}
            </span>
            {v === '(vacío)'
              ? <span className="text-[11px] text-zinc-500 italic">(vacío)</span>
              : <OptionChip value={v} color={color} />}
          </button>
        )
      })}
      {selected.length > 0 && (
        <button
          onClick={() => { setFilters((f) => ({ ...f, [colId]: [] })); onClose() }}
          className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] border-t border-zinc-800 transition-colors"
        >
          <X className="w-3 h-3" /> Quitar filtro
        </button>
      )}
    </Popover>
  )
}

// ─── Popover: menú de columna (renombrar, tipo, rol, opciones, mover, borrar) ─

function ColumnMenuPopover({ set, colId, rect, onClose }: {
  set: BacktestSet; colId: string; rect: DOMRect; onClose: () => void
}) {
  const updateColumn = useBacktestStore((s) => s.updateColumn)
  const removeColumn = useBacktestStore((s) => s.removeColumn)
  const moveColumn = useBacktestStore((s) => s.moveColumn)
  const setResultColumn = useBacktestStore((s) => s.setResultColumn)
  const renameSelectOption = useBacktestStore((s) => s.renameSelectOption)
  const [newOption, setNewOption] = useState('')

  const col = set.columns.find((c) => c.id === colId)
  if (!col) return null
  const hasOptions = col.type === 'select' || col.type === 'multiselect'

  const cycleOptionColor = (value: string) => {
    const options = col.options ?? []
    const idx = OPTION_PALETTE.indexOf(options.find((o) => o.value === value)?.color ?? '')
    const next = OPTION_PALETTE[(idx + 1) % OPTION_PALETTE.length]
    updateColumn(set.id, colId, {
      options: options.map((o) => o.value === value ? { ...o, color: next } : o),
    })
  }

  return (
    <Popover anchor={rect} onClose={onClose} width={248}>
      {/* Nombre */}
      <div className="px-2.5 py-1.5">
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mb-1">Columna</p>
        <input
          defaultValue={col.label}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== col.label) updateColumn(set.id, colId, { label: v }) }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-1.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
        />
      </div>

      {/* Tipo */}
      <div className="px-2.5 py-1.5 flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">Tipo</span>
        <select
          value={col.type}
          onChange={(e) => updateColumn(set.id, colId, { type: e.target.value as BacktestColumnType })}
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-violet-500"
        >
          {(Object.keys(TYPE_LABELS) as BacktestColumnType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* Rol result */}
      {col.type === 'number' && (
        col.role === 'result' ? (
          <p className="px-2.5 py-1.5 text-[11px] text-violet-300 flex items-center gap-1.5">
            <Target className="w-3 h-3" /> Columna R actual — alimenta los stats del LAB
          </p>
        ) : (
          <button
            onClick={() => { setResultColumn(set.id, colId); onClose() }}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-zinc-300 hover:bg-violet-500/10 hover:text-violet-300 transition-colors"
          >
            <Target className="w-3 h-3" /> Usar como columna R (stats)
          </button>
        )
      )}

      {/* Opciones (select/multiselect) */}
      {hasOptions && (
        <div className="px-2.5 py-1.5 border-t border-zinc-800">
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mb-1">Opciones</p>
          <div className="space-y-1 max-h-44 overflow-y-auto">
            {(col.options ?? []).map((o) => (
              <div key={o.value} className="flex items-center gap-1.5">
                <button
                  onClick={() => cycleOptionColor(o.value)}
                  title="Cambiar color"
                  className="w-4 h-4 rounded-full shrink-0 border border-white/20 hover:scale-110 transition-transform"
                  style={{ background: o.color ?? '#52525b' }}
                />
                <input
                  defaultValue={o.value}
                  onBlur={(e) => renameSelectOption(set.id, colId, o.value, e.target.value)}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-[11px] text-zinc-200 focus:outline-none focus:border-violet-500"
                />
                <button
                  onClick={() => updateColumn(set.id, colId, { options: (col.options ?? []).filter((x) => x.value !== o.value) })}
                  title="Quitar opción"
                  className="p-0.5 rounded text-zinc-600 hover:text-red-400 shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            <input
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') {
                  const v = newOption.trim()
                  if (!v) return
                  const options = col.options ?? []
                  if (!options.some((o) => o.value === v)) {
                    updateColumn(set.id, colId, { options: [...options, { value: v, color: OPTION_PALETTE[options.length % OPTION_PALETTE.length] }] })
                  }
                  setNewOption('')
                }
              }}
              placeholder="Nueva opción… (Enter)"
              className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>
      )}

      {/* Mover / eliminar */}
      <div className="flex items-center gap-1 px-2.5 py-1.5 border-t border-zinc-800">
        <button
          onClick={() => moveColumn(set.id, colId, -1)}
          title="Mover a la izquierda"
          className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => moveColumn(set.id, colId, 1)}
          title="Mover a la derecha"
          className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => {
            if (confirm(`¿Eliminar la columna "${col.label}"? Se pierde lo cargado en ella.`)) {
              removeColumn(set.id, colId)
              onClose()
            }
          }}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[11px] text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="w-3 h-3" /> Eliminar
        </button>
      </div>
    </Popover>
  )
}

// ─── Popover: agregar columna ─────────────────────────────────────────────────

function AddColumnPopover({ set, rect, onClose }: { set: BacktestSet; rect: DOMRect; onClose: () => void }) {
  const addColumn = useBacktestStore((s) => s.addColumn)
  const [label, setLabel] = useState('')
  const [type, setType] = useState<BacktestColumnType>('select')

  const submit = () => {
    const v = label.trim()
    if (!v) return
    addColumn(set.id, {
      label: v,
      type,
      ...(type === 'select' || type === 'multiselect' ? { options: [] } : {}),
    })
    onClose()
  }

  return (
    <Popover anchor={rect} onClose={onClose} width={230}>
      <div className="px-2.5 py-2 space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">Nueva columna</p>
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') submit() }}
          placeholder='Ej.: "¿Barrió liquidez?"'
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-1.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as BacktestColumnType)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-1.5 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-violet-500"
        >
          {(Object.keys(TYPE_LABELS) as BacktestColumnType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
        <button
          onClick={submit}
          disabled={!label.trim()}
          className="w-full py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/25 transition-colors disabled:opacity-40"
        >
          Agregar
        </button>
      </div>
    </Popover>
  )
}

// ─── Modal de hoja (crear / editar / borrar) ──────────────────────────────────

function SetModal({ editing, onSaved, onClose }: {
  editing: BacktestSet | null
  onSaved: (id: string) => void
  onClose: () => void
}) {
  const addSet = useBacktestStore((s) => s.addSet)
  const updateSet = useBacktestStore((s) => s.updateSet)
  const removeSet = useBacktestStore((s) => s.removeSet)
  const [name, setName] = useState(editing?.name ?? '')
  const [color, setColor] = useState(editing?.color ?? SET_PALETTE[0])

  const save = () => {
    const n = name.trim()
    if (!n) return
    if (editing) {
      updateSet(editing.id, { name: n, color })
      onSaved(editing.id)
    } else {
      onSaved(addSet({ name: n, color }))
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        className="w-80 bg-zinc-900 border border-zinc-700 rounded-2xl p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">{editing ? 'Editar hoja' : 'Nueva hoja de backtesting'}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200"><X className="w-4 h-4" /></button>
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-1">Nombre</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save() }}
            placeholder="Ej.: EDGECORE"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-1.5">Color</label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {SET_PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : ''}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        {!editing && (
          <p className="text-[11px] text-zinc-600 leading-relaxed">
            Arranca con las columnas de tu planilla (Fecha, R, Modelo, Bias, Liq. 4H…) —
            después las editás desde el header de cada una.
          </p>
        )}
        <div className="flex items-center gap-2">
          {editing && (
            <button
              onClick={() => {
                if (confirm(`¿Eliminar la hoja "${editing.name}" con sus ${editing.rows.length} trades?`)) {
                  removeSet(editing.id)
                  onClose()
                }
              }}
              className="px-3 py-2 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Eliminar
            </button>
          )}
          <button
            onClick={save}
            disabled={!name.trim()}
            className="flex-1 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm font-semibold hover:bg-emerald-500/25 transition-colors disabled:opacity-40"
          >
            {editing ? 'Guardar' : 'Crear hoja'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
