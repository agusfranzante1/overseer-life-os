'use client'
import { useState, useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
  BarChart, Bar, AreaChart, Area,
} from 'recharts'
import {
  TrendingUp, Building2, BarChart3, BookOpen, AlertOctagon, LayoutDashboard,
  Plus, Trash2, X, Check, ChevronDown, ChevronRight, AlertTriangle,
  DollarSign, Wallet, Trophy, Heart, Shield, FlaskConical, CalendarDays, BookText,
  TrendingDown, Rocket, Target, Users, Layers,
} from 'lucide-react'
import { ScalingTab } from './ScalingTab'
import {
  useTradingStore, getAccountStats, getStrategyStats, ERROR_TYPE_LABELS,
  MOOD_LABELS, MILESTONES, checkMilestones, projectDaysToPayout,
  getProfitFactor, getDayWinPct, getAvgRRReal, getDirectionStats,
  getBestWorstTrade, getDayStats, getAvgDurationMin, getEquityCurve,
  filterByPeriod,
  type Account, type Strategy, type Trade, type ErrorType, type PropFirm,
  type ErrorLog, type Mood, type AccountMode, type EmotionalEntry,
  type Period,
} from '@/lib/store/tradingStore'
import { useTranslation } from '@/hooks/useTranslation'

type Tab =
  | 'resumen' | 'cuentas' | 'escalado' | 'empresas' | 'estrategias'
  | 'journal' | 'errores' | 'emocional' | 'logros'
  | 'riesgo' | 'laboratorio' | 'calendario' | 'glosario'

const TAB_META: Record<Tab, { Icon: typeof LayoutDashboard }> = {
  resumen:     { Icon: LayoutDashboard },
  cuentas:     { Icon: Wallet },
  escalado:    { Icon: Rocket },
  empresas:    { Icon: Building2 },
  estrategias: { Icon: BarChart3 },
  journal:     { Icon: BookOpen },
  errores:     { Icon: AlertOctagon },
  emocional:   { Icon: Heart },
  logros:      { Icon: Trophy },
  riesgo:      { Icon: Shield },
  laboratorio: { Icon: FlaskConical },
  calendario:  { Icon: CalendarDays },
  glosario:    { Icon: BookText },
}

const COLORS = ['#10b981','#6366f1','#f59e0b','#ef4444','#3b82f6','#ec4899','#f97316','#8b5cf6','#14b8a6','#06b6d4']

/** Returns 'YYYY-MM-DDTHH:MM' in LOCAL time (not UTC). Fixes datetime-local default which would otherwise show UTC. */
function nowLocalForInput(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtUSD(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1e6) return `$${(n/1e6).toFixed(1)}M`
  if (Math.abs(n) >= 1e3) return `$${(n/1e3).toFixed(1)}k`
  return fmtUSD(n)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function TradingPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('resumen')
  const [period, setPeriod] = useState<Period>('all')

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            {t('trading.title')}
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">{t('trading.subtitle')}</p>
        </div>

        {/* Period filter — applies to most stat displays */}
        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
          {(['today','7d','30d','90d','year','all'] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider rounded-md transition-colors ${
                period === p ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-200'
              }`}>
              {p === 'today' ? t('trading.today') : p === 'year' ? t('trading.year') : p === 'all' ? t('trading.all') : p}
            </button>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 overflow-x-auto">
        {(Object.keys(TAB_META) as Tab[]).map((tabId) => {
          const { Icon } = TAB_META[tabId]
          return (
            <button key={tabId} onClick={() => setTab(tabId)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === tabId ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-200'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {t(`trading.tabs.${tabId}`)}
            </button>
          )
        })}
      </div>

      {tab === 'resumen'     && <ResumenTab period={period} />}
      {tab === 'cuentas'     && <CuentasTab period={period} />}
      {tab === 'escalado'    && <ScalingTab />}
      {tab === 'empresas'    && <EmpresasTab />}
      {tab === 'estrategias' && <EstrategiasTab period={period} />}
      {tab === 'journal'     && <JournalTab period={period} />}
      {tab === 'errores'     && <ErroresTab />}
      {tab === 'emocional'   && <EmocionalTab />}
      {tab === 'logros'      && <LogrosTab />}
      {tab === 'riesgo'      && <RiesgoTab />}
      {tab === 'laboratorio' && <LaboratorioTab />}
      {tab === 'calendario'  && <CalendarioEconTab />}
      {tab === 'glosario'    && <GlosarioTab />}
    </motion.div>
  )
}

// ─── Shared small components ──────────────────────────────────────────────────

function KpiCard({ label, value, color, subtitle }: { label: string; value: string; color: string; subtitle?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4" style={{ borderLeftColor: color, borderLeftWidth: 3 }}>
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">{label}</p>
      <p className="text-2xl font-extrabold tabular-nums" style={{ color }}>{value}</p>
      {subtitle && <p className="text-[10px] text-zinc-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}
function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-xl font-bold text-white tabular-nums mt-1">{value}</p>
      {sub && <p className="text-[10px] text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}
function MiniStat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-2">
      <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-sm font-bold tabular-nums" style={{ color: color ?? '#fafafa' }}>{value}</p>
      {sub && <p className="text-[9px] text-zinc-600 font-mono">{sub}</p>}
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  )
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-zinc-800/40 py-0.5">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-200 font-mono tabular-nums">{value}</span>
    </div>
  )
}

// ─── RESUMEN ─────────────────────────────────────────────────────────────────

function ResumenTab({ period }: { period: Period }) {
  const { firms, accounts, trades, payouts, strategies, errors } = useTradingStore()
  const filteredTrades = useMemo(() => filterByPeriod(trades, period), [trades, period])

  const stats = useMemo(() => {
    // Total invested = evaluation cost + activation fee (when applicable).
    // The activation fee is what you pay when transitioning from
    // evaluation → funded (firms like Apex charge it; others don't).
    // Including it gives the user's REAL net P&L.
    const invested = accounts.reduce((s, a) => s + a.evaluationCost + (a.activationFee ?? 0), 0)
    const withdrawn = payouts.reduce((s, p) => s + p.amount, 0)
    const netPnL = withdrawn - invested
    const roi = invested > 0 ? (netPnL / invested) * 100 : null
    const active = accounts.filter((a) => a.status === 'evaluation' || a.status === 'funded').length
    const wins = filteredTrades.filter((t) => t.actualPnL > 0).length
    const losses = filteredTrades.filter((t) => t.actualPnL < 0).length
    const winRate = filteredTrades.length > 0 ? (wins / filteredTrades.length) * 100 : 0
    const profitFactor = getProfitFactor(filteredTrades)
    const dayWin = getDayWinPct(filteredTrades)
    const rrReal = getAvgRRReal(filteredTrades)
    const directionStats = getDirectionStats(filteredTrades)
    const { best, worst } = getBestWorstTrade(filteredTrades)
    const { mostActiveDay, mostProfitableDay } = getDayStats(filteredTrades)
    const avgDuration = getAvgDurationMin(filteredTrades)
    return {
      invested, withdrawn, netPnL, roi, active, totalAccounts: accounts.length,
      totalTrades: filteredTrades.length, wins, losses, winRate,
      profitFactor, dayWin, rrReal, directionStats, best, worst,
      mostActiveDay, mostProfitableDay, avgDuration,
      totalErrors: errors.length,
    }
  }, [accounts, filteredTrades, payouts, errors])

  const equityCurve = useMemo(() => getEquityCurve(filteredTrades), [filteredTrades])

  const directionPieData = useMemo(() => ([
    { name: 'Long',  value: stats.directionStats.long.count,  pnl: stats.directionStats.long.totalPnL,  color: '#10b981' },
    { name: 'Short', value: stats.directionStats.short.count, pnl: stats.directionStats.short.totalPnL, color: '#ef4444' },
  ]), [stats.directionStats])

  return (
    <div className="space-y-6">
      {/* TOP KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="P&L Neto" value={fmtUSD(stats.netPnL)}
          color={stats.netPnL >= 0 ? '#10b981' : '#ef4444'}
          subtitle={stats.roi !== null ? `${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1)}% ROI` : '—'} />
        <KpiCard label="Retirado" value={fmtUSD(stats.withdrawn)} color="#10b981"
          subtitle={`${payouts.length} payouts`} />
        <KpiCard label="Invertido" value={fmtUSD(stats.invested)} color="#f59e0b"
          subtitle={`${accounts.length} cuentas`} />
        <KpiCard label="Cuentas activas" value={`${stats.active}`} color="#6366f1"
          subtitle={`de ${stats.totalAccounts} totales`} />
      </div>

      {/* SECOND KPI row — trading metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatBox label="Trades" value={`${stats.totalTrades}`} sub={`${stats.wins}W·${stats.losses}L`} />
        <StatBox label="Win Rate" value={`${stats.winRate.toFixed(0)}%`} />
        <StatBox label="Profit Factor" value={stats.profitFactor !== null ? stats.profitFactor.toFixed(2) : '—'}
          sub={stats.profitFactor !== null && stats.profitFactor >= 1.5 ? 'excelente' : stats.profitFactor !== null && stats.profitFactor >= 1 ? 'positivo' : 'mejorable'} />
        <StatBox label="Day Win %" value={`${stats.dayWin.pct.toFixed(0)}%`}
          sub={`${stats.dayWin.winDays}/${stats.dayWin.totalDays} días`} />
        <StatBox label="R:R Real" value={stats.rrReal !== null ? `${stats.rrReal.toFixed(2)}R` : '—'} />
      </div>

      {/* Equity curve */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">Curva de equidad — P&L acumulado</h2>
        {equityCurve.length > 1 ? (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stats.netPnL >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={stats.netPnL >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="idx" tick={{ fontSize: 9, fill: '#52525b' }} />
                <YAxis tick={{ fontSize: 9, fill: '#52525b' }} tickFormatter={(v) => fmtCompact(v)} />
                <Tooltip contentStyle={{ background: 'var(--surface-popover)', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
                  formatter={(v) => [fmtUSD(v as number), 'Equity'] as [string, string]}
                  labelFormatter={(l) => `Trade #${l}`} />
                <ReferenceLine y={0} stroke="#52525b" strokeDasharray="3 3" />
                <Area type="monotone" dataKey="equity" stroke={stats.netPnL >= 0 ? '#10b981' : '#ef4444'} strokeWidth={2}
                  fill="url(#eqGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-zinc-600 text-center py-10">Cargá al menos 2 trades para ver la curva.</p>
        )}
      </section>

      {/* Direction breakdown + Best/Worst + Day stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Long vs Short */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Dirección</h3>
          <div className="space-y-2">
            {directionPieData.map((d) => (
              <div key={d.name}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span style={{ color: d.color }} className="font-bold">{d.name}</span>
                  <span className="text-zinc-400 font-mono">{d.value} trades</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full" style={{
                    width: `${stats.totalTrades > 0 ? (d.value / stats.totalTrades) * 100 : 0}%`,
                    background: d.color,
                  }} />
                </div>
                <p className="text-[10px] font-mono mt-0.5" style={{ color: d.pnl >= 0 ? '#10b981' : '#ef4444' }}>
                  {fmtUSD(d.pnl)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Best / Worst */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Mejor / Peor trade</h3>
          {stats.best && stats.worst ? (
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-mono text-emerald-400 mb-0.5">🏆 MEJOR</p>
                <p className="text-base font-bold tabular-nums text-emerald-400">{fmtUSD(stats.best.actualPnL)}</p>
                <p className="text-[10px] text-zinc-500 font-mono">
                  {stats.best.instrument} · {stats.best.direction} · {stats.best.dateTime.slice(0, 10)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-mono text-red-400 mb-0.5">💀 PEOR</p>
                <p className="text-base font-bold tabular-nums text-red-400">{fmtUSD(stats.worst.actualPnL)}</p>
                <p className="text-[10px] text-zinc-500 font-mono">
                  {stats.worst.instrument} · {stats.worst.direction} · {stats.worst.dateTime.slice(0, 10)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-600">Sin trades.</p>
          )}
        </section>

        {/* Day stats */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Días</h3>
          <div className="space-y-3 text-xs">
            <div>
              <p className="text-[10px] font-mono text-zinc-500 mb-0.5">Más activo</p>
              <p className="text-zinc-200 font-mono">{stats.mostActiveDay?.date ?? '—'}</p>
              {stats.mostActiveDay && <p className="text-[10px] text-zinc-500">{stats.mostActiveDay.count} trades</p>}
            </div>
            <div>
              <p className="text-[10px] font-mono text-zinc-500 mb-0.5">Más rentable</p>
              <p className="text-emerald-400 font-mono">{stats.mostProfitableDay?.date ?? '—'}</p>
              {stats.mostProfitableDay && <p className="text-[10px] text-zinc-500 font-mono">{fmtUSD(stats.mostProfitableDay.pnl)}</p>}
            </div>
            <div>
              <p className="text-[10px] font-mono text-zinc-500 mb-0.5">Duración promedio</p>
              <p className="text-zinc-200 font-mono">{stats.avgDuration !== null ? `${stats.avgDuration}min` : '—'}</p>
            </div>
          </div>
        </section>
      </div>

      {/* Accounts overview */}
      {accounts.length > 0 && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Cuentas — overview</h2>
          <div className="space-y-2">
            {accounts.slice(0, 8).map((a) => {
              const s = getAccountStats(a, firms, trades, payouts)
              const statusColor = a.status === 'funded' ? '#10b981' : a.status === 'evaluation' ? '#f59e0b' : a.status === 'failed' ? '#ef4444' : '#6366f1'
              return (
                <div key={a.id} className="flex items-center gap-3 p-3 bg-zinc-950/60 rounded-xl border border-zinc-800">
                  <div className="w-1 self-stretch rounded-full" style={{ background: s.firm?.color ?? '#71717a' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{a.alias}</p>
                    <p className="text-[10px] font-mono text-zinc-500">{s.firm?.name ?? '—'} · {fmtUSD(a.accountSize)}{a.mode ? ` · ${a.mode}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-mono uppercase" style={{ color: statusColor }}>{a.status}</p>
                    <p className="text-sm font-bold tabular-nums" style={{ color: s.totalPnL >= 0 ? '#10b981' : '#ef4444' }}>
                      {fmtUSD(s.totalPnL)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Strategies slippage overview */}
      {strategies.length > 0 && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Estrategias — slippage</h2>
          <div className="space-y-2">
            {strategies.map((s) => {
              const st = getStrategyStats(s.id, trades, errors)
              return (
                <div key={s.id} className="flex items-center gap-3 p-3 bg-zinc-950/60 rounded-xl border border-zinc-800">
                  <div className="w-1 self-stretch rounded-full" style={{ background: s.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{s.name}</p>
                    <p className="text-[10px] font-mono text-zinc-500">{s.instrument} · {s.timeframe} · {st.tradeCount} trades</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-mono text-zinc-500">Ideal vs Real</p>
                    <p className="text-xs font-mono">
                      <span className="text-zinc-300">{fmtUSD(st.idealPnL)}</span>
                      <span className="text-zinc-600 mx-1">→</span>
                      <span className={st.realPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}>{fmtUSD(st.realPnL)}</span>
                    </p>
                    {st.slippage !== 0 && (
                      <p className="text-[10px] text-amber-400">slippage {fmtUSD(st.slippage)}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {accounts.length === 0 && strategies.length === 0 && (
        <div className="text-center py-12 text-zinc-500 text-sm">
          Empezá creando una empresa de fondeo y una cuenta en las pestañas correspondientes.
        </div>
      )}
    </div>
  )
}

// ─── EMPRESAS (sin cambios mayores, solo limpio) ─────────────────────────────

function EmpresasTab() {
  const { firms, addFirm, updateFirm, removeFirm } = useTradingStore()
  const [showAdd, setShowAdd] = useState(false)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">Empresas de fondeo</h2>
        <button onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
          <Plus className="w-3.5 h-3.5" /> Nueva empresa
        </button>
      </div>
      {showAdd && <FirmEditor onSave={(f) => { addFirm(f); setShowAdd(false) }} onCancel={() => setShowAdd(false)} />}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {firms.map((f) => (
          <FirmCard key={f.id} firm={f}
            onUpdate={(p) => updateFirm(f.id, p)}
            onDelete={() => { if (confirm(`¿Eliminar "${f.name}"?`)) removeFirm(f.id) }} />
        ))}
      </div>
    </div>
  )
}

function FirmCard({ firm, onUpdate, onDelete }: { firm: PropFirm; onUpdate: (p: Partial<PropFirm>) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return <FirmEditor existing={firm} onSave={(p) => { onUpdate(p); setEditing(false) }} onCancel={() => setEditing(false)} />
  }
  const r = firm.rules
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 group" style={{ borderLeftColor: firm.color, borderLeftWidth: 3 }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-bold text-white">{firm.name}</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(true)} className="text-zinc-500 hover:text-zinc-200 text-xs">Editar</button>
          <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-zinc-700 hover:text-red-400">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        {r.dailyDrawdownPct !== undefined && r.dailyDrawdownPct > 0 && <Detail label="DD diario" value={`${r.dailyDrawdownPct}% ${r.dailyDrawdownIsStatic ? '(estático)' : '(trailing)'}`} />}
        {r.totalDrawdownPct !== undefined && <Detail label="DD total" value={`${r.totalDrawdownPct}% ${r.totalDrawdownIsTrailing ? '(trailing)' : '(estático)'}`} />}
        {r.profitTargetPct !== undefined && <Detail label="Meta" value={`${r.profitTargetPct}%`} />}
        {r.minTradingDays !== undefined && <Detail label="Min días" value={`${r.minTradingDays}d`} />}
        {r.consistencyRulePct !== undefined && <Detail label="Consistencia" value={`${r.consistencyRulePct}%`} />}
        {r.payoutSplitPct !== undefined && <Detail label="Split" value={`${r.payoutSplitPct}%`} />}
        {r.payoutFreqDays !== undefined && <Detail label="Payout cada" value={`${r.payoutFreqDays}d`} />}
      </div>
      {r.payoutRulesNote && <p className="text-[10px] text-zinc-500 mt-2 italic">{r.payoutRulesNote}</p>}
    </div>
  )
}

function FirmEditor({ existing, onSave, onCancel }: {
  existing?: PropFirm
  onSave: (firm: Omit<PropFirm, 'id' | 'createdAt'>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [color, setColor] = useState(existing?.color ?? COLORS[0])
  const [r, setR] = useState(existing?.rules ?? {})
  const [note, setNote] = useState(existing?.notes ?? '')

  const save = () => {
    if (!name.trim()) return
    onSave({ name: name.trim(), color, rules: r, notes: note.trim() || undefined })
  }
  const num = (v: string) => (v === '' ? undefined : parseFloat(v))
  const NumberInput = ({ value, onChange, step }: { value: number | undefined; onChange: (v: number | undefined) => void; step: number }) => (
    <input type="number" step={step} value={value ?? ''} onChange={(e) => onChange(num(e.target.value))}
      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white tabular-nums focus:outline-none focus:border-emerald-500" />
  )
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">{existing ? 'Editar empresa' : 'Nueva empresa'}</h3>
        <button onClick={onCancel} className="text-zinc-500"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre">
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
        </Field>
        <Field label="Color">
          <div className="flex flex-wrap gap-1.5 mt-1">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-110' : ''}`}
                style={{ background: c }} />
            ))}
          </div>
        </Field>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="DD diario %"><NumberInput value={r.dailyDrawdownPct} onChange={(v) => setR({ ...r, dailyDrawdownPct: v })} step={0.5} /></Field>
        <Field label="DD diario tipo">
          <select value={r.dailyDrawdownIsStatic ? 'static' : 'trail'} onChange={(e) => setR({ ...r, dailyDrawdownIsStatic: e.target.value === 'static' })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500">
            <option value="trail">Trailing</option><option value="static">Estático</option>
          </select>
        </Field>
        <Field label="DD total %"><NumberInput value={r.totalDrawdownPct} onChange={(v) => setR({ ...r, totalDrawdownPct: v })} step={0.5} /></Field>
        <Field label="DD total tipo">
          <select value={r.totalDrawdownIsTrailing ? 'trail' : 'static'} onChange={(e) => setR({ ...r, totalDrawdownIsTrailing: e.target.value === 'trail' })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500">
            <option value="static">Estático</option><option value="trail">Trailing</option>
          </select>
        </Field>
        <Field label="Meta profit %"><NumberInput value={r.profitTargetPct} onChange={(v) => setR({ ...r, profitTargetPct: v })} step={0.5} /></Field>
        <Field label="Min días"><NumberInput value={r.minTradingDays} onChange={(v) => setR({ ...r, minTradingDays: v })} step={1} /></Field>
        <Field label="Consistencia %"><NumberInput value={r.consistencyRulePct} onChange={(v) => setR({ ...r, consistencyRulePct: v })} step={5} /></Field>
        <Field label="Payout (d)"><NumberInput value={r.payoutFreqDays} onChange={(v) => setR({ ...r, payoutFreqDays: v })} step={1} /></Field>
        <Field label="Split %"><NumberInput value={r.payoutSplitPct} onChange={(v) => setR({ ...r, payoutSplitPct: v })} step={5} /></Field>
      </div>
      <Field label="Notas">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 resize-none" />
      </Field>
      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-semibold">Cancelar</button>
        <button onClick={save} disabled={!name.trim()}
          className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 disabled:opacity-40 text-emerald-300 text-xs font-bold">Guardar</button>
      </div>
    </div>
  )
}

// ─── CUENTAS ─────────────────────────────────────────────────────────────────

function CuentasTab({ period: _period }: { period: Period }) {
  const { firms, accounts, addAccount, updateAccount, removeAccount, addPayout, removePayout } = useTradingStore()
  const [showAdd, setShowAdd] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [payoutForAcc, setPayoutForAcc] = useState<string | null>(null)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">Cuentas</h2>
        <button onClick={() => setShowAdd((v) => !v)} disabled={firms.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 disabled:opacity-40 text-emerald-400 text-xs font-bold">
          <Plus className="w-3.5 h-3.5" /> Nueva cuenta
        </button>
      </div>
      {firms.length === 0 && <p className="text-xs text-zinc-500">Primero creá una empresa.</p>}
      {showAdd && <AccountEditor firms={firms} onSave={(a) => { addAccount(a); setShowAdd(false) }} onCancel={() => setShowAdd(false)} />}
      <div className="space-y-2">
        {accounts.map((a) => (
          <AccountRow key={a.id} account={a}
            expanded={expandedId === a.id}
            onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
            onUpdate={(p) => updateAccount(a.id, p)}
            onDelete={() => { if (confirm(`¿Eliminar "${a.alias}"?`)) removeAccount(a.id) }}
            onAddPayout={() => setPayoutForAcc(a.id)}
            onRemovePayout={removePayout} />
        ))}
      </div>
      {payoutForAcc && (
        <PayoutModal accountId={payoutForAcc}
          onSave={(p) => { addPayout(p); setPayoutForAcc(null) }}
          onCancel={() => setPayoutForAcc(null)} />
      )}
    </div>
  )
}

function AccountRow({ account, expanded, onToggle, onUpdate, onDelete, onAddPayout, onRemovePayout }: {
  account: Account
  expanded: boolean
  onToggle: () => void
  onUpdate: (p: Partial<Account>) => void
  onDelete: () => void
  onAddPayout: () => void
  onRemovePayout: (id: string) => void
}) {
  const { firms, trades, payouts } = useTradingStore()
  const stats = getAccountStats(account, firms, trades, payouts)
  const projection = projectDaysToPayout(account, stats.firm, trades)
  const ddPctOfLimit = stats.totalDDLimit && stats.totalDDLimit > 0
    ? Math.max(0, Math.min(100, (stats.ddCurrentUSD / stats.totalDDLimit) * 100))
    : 0
  const statusColor = account.status === 'funded' ? '#10b981' : account.status === 'evaluation' ? '#f59e0b' : account.status === 'paid_out' ? '#6366f1' : '#ef4444'
  const accountTrades = trades.filter((t) => t.accountId === account.id)
  const accountEquity = useMemo(() => getEquityCurve(accountTrades), [accountTrades])

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <button onClick={onToggle}
        className="w-full p-4 hover:bg-zinc-800/30 transition-colors text-left flex items-center gap-3"
        style={{ borderLeftColor: stats.firm?.color ?? '#71717a', borderLeftWidth: 3 }}>
        {expanded ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-white truncate">{account.alias}</p>
            <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded"
              style={{ background: statusColor + '20', color: statusColor }}>{account.status}</span>
            {account.mode && (
              <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded"
                style={{ background: account.mode === 'aggressive' ? '#ef4444' : '#10b981', color: '#fff', opacity: 0.85 }}>
                {account.mode}
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-500 font-mono">
            {stats.firm?.name ?? '—'} · {fmtUSD(account.accountSize)}
            {stats.tradingDays > 0 && ` · ${stats.tradingDays} días`}
            {stats.tradeCount > 0 && ` · ${stats.tradeCount} trades`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold tabular-nums" style={{ color: stats.totalPnL >= 0 ? '#10b981' : '#ef4444' }}>
            {fmtUSD(stats.totalPnL)}
          </p>
          {stats.totalWithdrawn > 0 && <p className="text-[10px] text-emerald-400 font-mono">retirado {fmtUSD(stats.totalWithdrawn)}</p>}
        </div>
      </button>

      {expanded && (
        <div className="p-4 border-t border-zinc-800 space-y-3">
          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <MiniStat label="Balance" value={fmtUSD(stats.balance)} color="#10b981" />
            <MiniStat label="Pico" value={fmtUSD(stats.peak)} color="#6366f1" />
            <MiniStat label="Win Rate" value={`${stats.winRate.toFixed(0)}%`} sub={`${stats.wins}W·${stats.losses}L`} />
            <MiniStat label="ROI neto" value={stats.netROI !== null ? `${stats.netROI >= 0 ? '+' : ''}${stats.netROI.toFixed(1)}%` : '—'}
              color={stats.netROI !== null && stats.netROI >= 0 ? '#10b981' : '#ef4444'} />
          </div>

          {/* Mode toggle */}
          <div className="flex items-center gap-2 bg-zinc-950/60 rounded-xl p-3 border border-zinc-800">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Modo</span>
            <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
              {(['conservative','aggressive'] as AccountMode[]).map((m) => (
                <button key={m} onClick={() => onUpdate({ mode: m })}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    (account.mode ?? 'conservative') === m ?
                      (m === 'aggressive' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400')
                      : 'text-zinc-500 hover:text-zinc-200'
                  }`}>
                  {m === 'conservative' ? '🐢 Conservador' : '🔥 Agresivo'}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-zinc-500 ml-2">
              {(account.mode ?? 'conservative') === 'aggressive'
                ? 'Riesgo alto por trade · acelera el pase pero arriesga más DD'
                : 'Riesgo bajo y gestión paciente · más probable retiro'}
            </span>
          </div>

          {/* Profit target progress */}
          {stats.profitTargetUSD !== null && (
            <div>
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-zinc-500">Meta de profit</span>
                <span className="text-zinc-300 font-mono">{fmtUSD(stats.totalPnL)} / {fmtUSD(stats.profitTargetUSD)}</span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{
                  width: `${Math.max(0, stats.profitTargetProgress ?? 0)}%`,
                  background: (stats.profitTargetProgress ?? 0) >= 100 ? '#10b981' : '#6366f1',
                }} />
              </div>
            </div>
          )}

          {/* DD remaining */}
          {stats.totalDDLimit !== null && (
            <div>
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-zinc-500">DD usado</span>
                <span className="font-mono" style={{ color: ddPctOfLimit > 75 ? '#ef4444' : ddPctOfLimit > 50 ? '#f59e0b' : '#10b981' }}>
                  {fmtUSD(stats.ddCurrentUSD)} / {fmtUSD(stats.totalDDLimit)} ({stats.ddRemainingPct?.toFixed(0)}% restante)
                </span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{
                  width: `${ddPctOfLimit}%`,
                  background: ddPctOfLimit > 75 ? '#ef4444' : ddPctOfLimit > 50 ? '#f59e0b' : '#10b981',
                }} />
              </div>
            </div>
          )}

          {/* Withdrawal projection */}
          {projection.daysToTarget !== null && projection.avgDailyPnL !== 0 && (
            <div className="bg-zinc-950/60 rounded-xl p-3 border border-zinc-800">
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">Proyección a retiro</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-[9px] text-zinc-600">Días al payout</p>
                  <p className="text-base font-bold text-emerald-400 tabular-nums">{projection.daysToTarget}d</p>
                </div>
                <div>
                  <p className="text-[9px] text-zinc-600">Ritmo actual</p>
                  <p className="text-base font-bold tabular-nums" style={{ color: projection.avgDailyPnL >= 0 ? '#10b981' : '#ef4444' }}>
                    {fmtUSD(projection.avgDailyPnL)}/día
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-zinc-600">Días traded</p>
                  <p className="text-base font-bold text-zinc-300 tabular-nums">{projection.daysTraded}</p>
                </div>
              </div>
            </div>
          )}

          {/* Account equity mini-chart */}
          {accountEquity.length > 1 && (
            <div className="bg-zinc-950/60 rounded-xl p-3 border border-zinc-800">
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">Equity de la cuenta</p>
              <div style={{ width: '100%', height: 80 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={accountEquity} margin={{ top: 4, right: 4, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="idx" tick={{ fontSize: 9, fill: '#52525b' }} />
                    <YAxis tick={{ fontSize: 9, fill: '#52525b' }} width={36} tickFormatter={(v) => fmtCompact(v)} />
                    <Tooltip contentStyle={{ background: 'var(--surface-popover)', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 10 }}
                      formatter={(v) => [fmtUSD(v as number), 'Equity'] as [string, string]} />
                    <ReferenceLine y={0} stroke="#52525b" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="equity" stroke={stats.totalPnL >= 0 ? '#10b981' : '#ef4444'} strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Status + actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-zinc-800 flex-wrap">
            <select value={account.status} onChange={(e) => onUpdate({ status: e.target.value as Account['status'] })}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none">
              <option value="evaluation">Evaluación</option>
              <option value="funded">Fondeada</option>
              <option value="paid_out">Cobrada</option>
              <option value="failed">Liquidada</option>
            </select>
            <button onClick={onAddPayout} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
              <DollarSign className="w-3 h-3" /> Payout
            </button>
            <button onClick={onDelete} className="ml-auto text-zinc-700 hover:text-red-400">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Payouts list */}
          {payouts.filter((p) => p.accountId === account.id).length > 0 && (
            <div className="pt-2 border-t border-zinc-800">
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">Payouts</p>
              <div className="space-y-1">
                {payouts.filter((p) => p.accountId === account.id).map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-zinc-950/60 group">
                    <span className="text-zinc-400 font-mono">{p.date}</span>
                    <span className="text-emerald-400 font-bold tabular-nums">{fmtUSD(p.amount)}</span>
                    {p.note && <span className="text-zinc-500 truncate ml-2 flex-1">{p.note}</span>}
                    <button onClick={() => onRemovePayout(p.id)} className="text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 ml-2">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AccountEditor({ firms, existing, onSave, onCancel }: {
  firms: PropFirm[]; existing?: Account
  onSave: (a: Omit<Account, 'id' | 'createdAt'>) => void
  onCancel: () => void
}) {
  const [firmId, setFirmId] = useState(existing?.firmId ?? firms[0]?.id ?? '')
  const [alias, setAlias] = useState(existing?.alias ?? '')
  const [accountSize, setAccountSize] = useState(existing?.accountSize?.toString() ?? '50000')
  const [evaluationCost, setEvaluationCost] = useState(existing?.evaluationCost?.toString() ?? '150')
  const [status, setStatus] = useState<Account['status']>(existing?.status ?? 'evaluation')
  const [startDate, setStartDate] = useState(existing?.startDate ?? new Date().toISOString().slice(0, 10))
  const [mode, setMode] = useState<AccountMode>(existing?.mode ?? 'conservative')

  // Activation fee — pre-fill with the firm's default (Apex: 130, others: 0).
  // The user can override the amount or set 0 if the firm didn't charge them.
  const selectedFirm = firms.find((f) => f.id === firmId)
  const [activationFee, setActivationFee] = useState(
    existing?.activationFee?.toString()
      ?? selectedFirm?.rules.activationFeeDefault?.toString()
      ?? '0'
  )
  // When the user changes firm AND the current activation fee is the
  // old firm's default (or empty), bump it to the new firm's default.
  useEffect(() => {
    if (existing?.activationFee !== undefined) return  // don't override when editing
    const def = firms.find((f) => f.id === firmId)?.rules.activationFeeDefault ?? 0
    setActivationFee(String(def))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmId])

  const save = () => {
    if (!alias.trim() || !firmId) return
    const parsedActivation = parseFloat(activationFee) || 0
    onSave({ firmId, alias: alias.trim(),
      accountSize: parseFloat(accountSize) || 0,
      evaluationCost: parseFloat(evaluationCost) || 0,
      // Only persist activationFee if the account is funded/paid_out — for
      // evaluation/failed it shouldn't apply (you only pay it after passing).
      activationFee: (status === 'funded' || status === 'paid_out') ? parsedActivation : undefined,
      status, startDate, mode })
  }
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Nueva cuenta</h3>
        <button onClick={onCancel} className="text-zinc-500"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Empresa">
          <select value={firmId} onChange={(e) => setFirmId(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500">
            {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label="Alias">
          <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="ej. Topstep 50k #1"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
        </Field>
        <Field label="Tamaño ($)">
          <input type="number" value={accountSize} onChange={(e) => setAccountSize(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white tabular-nums focus:outline-none focus:border-emerald-500" />
        </Field>
        <Field label="Costo evaluación ($)">
          <input type="number" value={evaluationCost} onChange={(e) => setEvaluationCost(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white tabular-nums focus:outline-none focus:border-emerald-500" />
        </Field>
        <Field label="Estado">
          <select value={status} onChange={(e) => setStatus(e.target.value as Account['status'])}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500">
            <option value="evaluation">Evaluación</option><option value="funded">Fondeada</option>
            <option value="paid_out">Cobrada</option><option value="failed">Liquidada</option>
          </select>
        </Field>
        {/* Activation fee — only relevant when funded/paid_out. Pre-filled
            with the firm's default (Apex: 130, others: 0). User can override. */}
        {(status === 'funded' || status === 'paid_out') && (
          <Field label={`Activation fee ($)${selectedFirm?.rules.activationFeeDefault ? ` · ${selectedFirm.name}` : ''}`}>
            <input type="number" value={activationFee} onChange={(e) => setActivationFee(e.target.value)}
              placeholder={selectedFirm?.rules.activationFeeDefault?.toString() ?? '0'}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white tabular-nums focus:outline-none focus:border-emerald-500" />
          </Field>
        )}
        <Field label="Fecha inicio">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
        </Field>
        <Field label="Modo">
          <div className="flex bg-zinc-800 border border-zinc-700 rounded-lg p-0.5">
            {(['conservative','aggressive'] as AccountMode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-1 rounded-md text-xs font-bold ${mode === m
                  ? (m === 'aggressive' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400')
                  : 'text-zinc-500'}`}>
                {m === 'conservative' ? '🐢 Conservador' : '🔥 Agresivo'}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-semibold">Cancelar</button>
        <button onClick={save} disabled={!alias.trim()}
          className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 disabled:opacity-40 text-emerald-300 text-xs font-bold">Crear</button>
      </div>
    </div>
  )
}

function PayoutModal({ accountId, onSave, onCancel }: {
  accountId: string
  onSave: (p: { accountId: string; amount: number; date: string; note?: string }) => void
  onCancel: () => void
}) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const save = () => {
    const amt = parseFloat(amount)
    if (!isFinite(amt) || amt <= 0) return
    onSave({ accountId, amount: amt, date, note: note.trim() || undefined })
  }
  return (
    <div onClick={onCancel} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Registrar payout</h3>
          <button onClick={onCancel} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>
        <Field label="Monto ($)">
          <input type="number" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base text-white tabular-nums focus:outline-none focus:border-emerald-500" />
        </Field>
        <Field label="Fecha"><input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" /></Field>
        <Field label="Nota (opcional)"><input value={note} onChange={(e) => setNote(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" /></Field>
        <div className="flex gap-2 pt-2">
          <button onClick={onCancel} className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-semibold">Cancelar</button>
          <button onClick={save} className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold">Guardar</button>
        </div>
      </div>
    </div>
  )
}

// ─── ESTRATEGIAS ──────────────────────────────────────────────────────────────

function EstrategiasTab({ period: _period }: { period: Period }) {
  const { strategies, trades, errors, addStrategy, updateStrategy, removeStrategy } = useTradingStore()
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">Estrategias</h2>
        <button onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
          <Plus className="w-3.5 h-3.5" /> Nueva estrategia
        </button>
      </div>
      {showAdd && <StrategyEditor onSave={(s) => { addStrategy(s); setShowAdd(false) }} onCancel={() => setShowAdd(false)} />}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {strategies.map((s) => {
          if (editingId === s.id) {
            return <StrategyEditor key={s.id} existing={s}
              onSave={(p) => { updateStrategy(s.id, p); setEditingId(null) }}
              onCancel={() => setEditingId(null)} />
          }
          const stats = getStrategyStats(s.id, trades, errors)
          const strategyTrades = trades.filter((t) => t.strategyId === s.id)
          const pf = getProfitFactor(strategyTrades)
          return (
            <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 group"
              style={{ borderLeftColor: s.color, borderLeftWidth: 3 }}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-base font-bold text-white">{s.name} {!s.active && <span className="text-[10px] text-zinc-600 ml-1">[inactiva]</span>}</p>
                  <p className="text-[10px] font-mono text-zinc-500">{s.instrument} · {s.timeframe} · {s.session}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditingId(s.id)} className="text-zinc-500 hover:text-zinc-200 text-xs">Editar</button>
                  <button onClick={() => { if (confirm(`¿Eliminar "${s.name}"?`)) removeStrategy(s.id) }}
                    className="opacity-0 group-hover:opacity-100 text-zinc-700 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Detail label="Trades" value={`${stats.tradeCount}`} />
                <Detail label="Win Rate" value={`${stats.winRate.toFixed(0)}%`} />
                <Detail label="Profit Factor" value={pf !== null ? pf.toFixed(2) : '—'} />
                <Detail label="P&L Real" value={fmtUSD(stats.realPnL)} />
                <Detail label="P&L Ideal" value={fmtUSD(stats.idealPnL)} />
                {stats.slippage !== 0 && <Detail label="Slippage" value={fmtUSD(stats.slippage)} />}
                {stats.errorCount > 0 && <Detail label="Errores" value={`${stats.errorCount} (${stats.errorRate.toFixed(0)}%)`} />}
              </div>
              {s.rules && (
                <details className="mt-3">
                  <summary className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 cursor-pointer">Reglas</summary>
                  <pre className="mt-1 text-[11px] text-zinc-400 whitespace-pre-wrap font-sans">{s.rules}</pre>
                </details>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StrategyEditor({ existing, onSave, onCancel }: {
  existing?: Strategy
  onSave: (s: Omit<Strategy, 'id' | 'createdAt'>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [color, setColor] = useState(existing?.color ?? COLORS[0])
  const [instrument, setInstrument] = useState(existing?.instrument ?? 'MNQ')
  const [timeframe, setTimeframe] = useState(existing?.timeframe ?? '5m')
  const [session, setSession] = useState(existing?.session ?? 'NY')
  const [riskPerTradePct, setRiskPerTradePct] = useState(existing?.riskPerTradePct?.toString() ?? '0.5')
  const [targetRRR, setTargetRRR] = useState(existing?.targetRRR?.toString() ?? '2')
  const [rules, setRules] = useState(existing?.rules ?? '')
  const [active, setActive] = useState(existing?.active ?? true)
  const [description, setDescription] = useState(existing?.description ?? '')
  const save = () => {
    if (!name.trim()) return
    onSave({ name: name.trim(), color, instrument, timeframe, session,
      riskPerTradePct: parseFloat(riskPerTradePct) || undefined,
      targetRRR: parseFloat(targetRRR) || undefined,
      rules: rules.trim(), active, description: description.trim() || undefined })
  }
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">{existing ? 'Editar' : 'Nueva'} estrategia</h3>
        <button onClick={onCancel} className="text-zinc-500"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" /></Field>
        <Field label="Color">
          <div className="flex flex-wrap gap-1.5 mt-1">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-110' : ''}`}
                style={{ background: c }} />
            ))}
          </div>
        </Field>
        <Field label="Instrumento"><select value={instrument} onChange={(e) => setInstrument(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500">
          <option>MNQ</option><option>NQ</option><option>MGC</option><option>GC</option>
          <option>MES</option><option>ES</option><option>CL</option><option>MCL</option><option>Otro</option>
        </select></Field>
        <Field label="Timeframe"><select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500">
          <option>1m</option><option>5m</option><option>15m</option><option>30m</option><option>1h</option><option>4h</option>
        </select></Field>
        <Field label="Sesión"><select value={session} onChange={(e) => setSession(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500">
          <option>NY</option><option>LDN</option><option>Asia</option><option>Cualquiera</option>
        </select></Field>
        <Field label="Activa">
          <button onClick={() => setActive((v) => !v)}
            className={`w-full px-2 py-1.5 rounded-lg text-xs font-semibold ${active ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400' : 'bg-zinc-800 border border-zinc-700 text-zinc-500'}`}>
            {active ? 'Sí' : 'No'}
          </button>
        </Field>
        <Field label="Riesgo / trade %"><input type="number" step="0.1" value={riskPerTradePct} onChange={(e) => setRiskPerTradePct(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white tabular-nums focus:outline-none focus:border-emerald-500" /></Field>
        <Field label="R:R objetivo"><input type="number" step="0.1" value={targetRRR} onChange={(e) => setTargetRRR(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white tabular-nums focus:outline-none focus:border-emerald-500" /></Field>
      </div>
      <Field label="Descripción"><input value={description} onChange={(e) => setDescription(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" /></Field>
      <Field label="Reglas">
        <textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={5}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500 resize-none" />
      </Field>
      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-semibold">Cancelar</button>
        <button onClick={save} disabled={!name.trim()}
          className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 disabled:opacity-40 text-emerald-300 text-xs font-bold">Guardar</button>
      </div>
    </div>
  )
}

// ─── JOURNAL (con exitDateTime + R-multiple + mood) ──────────────────────────

function JournalTab({ period }: { period: Period }) {
  const { accounts, strategies, trades, addTrade, removeTrade, addError } = useTradingStore()
  const [showAdd, setShowAdd] = useState(false)
  const [tradeForError, setTradeForError] = useState<Trade | null>(null)
  const filtered = useMemo(() => filterByPeriod(trades, period), [trades, period])
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">Journal · {filtered.length} trades</h2>
        <button onClick={() => setShowAdd(true)}
          disabled={accounts.length === 0 || strategies.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 disabled:opacity-40 text-emerald-400 text-xs font-bold">
          <Plus className="w-3.5 h-3.5" /> Nuevo trade
        </button>
      </div>
      {(accounts.length === 0 || strategies.length === 0) && (
        <p className="text-xs text-zinc-500">Necesitás al menos una cuenta y una estrategia.</p>
      )}
      {showAdd && (
        <TradeEditor accounts={accounts} strategies={strategies}
          onSave={(t) => { addTrade(t); setShowAdd(false) }}
          onCancel={() => setShowAdd(false)} />
      )}
      <div className="space-y-2">
        {filtered.slice(0, 100).map((t) => (
          <TradeRow key={t.id} trade={t}
            account={accounts.find((a) => a.id === t.accountId)}
            strategy={strategies.find((s) => s.id === t.strategyId)}
            onDelete={() => { if (confirm('¿Eliminar trade?')) removeTrade(t.id) }}
            onLogError={() => setTradeForError(t)} />
        ))}
        {filtered.length === 0 && <p className="text-xs text-zinc-600 text-center py-6">Sin trades en este periodo.</p>}
      </div>
      {tradeForError && (
        <ErrorModal trade={tradeForError}
          onSave={(e) => { addError(e); setTradeForError(null) }}
          onCancel={() => setTradeForError(null)} />
      )}
    </div>
  )
}

function TradeRow({ trade, account, strategy, onDelete, onLogError }: {
  trade: Trade; account?: Account; strategy?: Strategy
  onDelete: () => void; onLogError: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { errors } = useTradingStore()
  const tradeErrors = errors.filter((e) => e.tradeId === trade.id)
  const hasDelta = Math.abs(trade.actualPnL - trade.plannedPnL) > 0.01
  const duration = trade.exitDateTime
    ? Math.round((new Date(trade.exitDateTime).getTime() - new Date(trade.dateTime).getTime()) / 60000)
    : null
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full p-3 hover:bg-zinc-800/30 transition-colors text-left flex items-center gap-3"
        style={{ borderLeftColor: strategy?.color ?? '#71717a', borderLeftWidth: 3 }}>
        {expanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white">{trade.instrument}</span>
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded"
              style={{ background: (trade.direction === 'long' ? '#10b981' : '#ef4444') + '20', color: trade.direction === 'long' ? '#10b981' : '#ef4444' }}>
              {trade.direction}
            </span>
            <span className="text-[11px] text-zinc-500">{new Date(trade.dateTime).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            {duration !== null && <span className="text-[10px] text-zinc-500 font-mono">{duration}min</span>}
            {typeof trade.rMultipleActual === 'number' && (
              <span className="text-[10px] font-mono" style={{ color: trade.rMultipleActual >= 0 ? '#10b981' : '#ef4444' }}>
                {trade.rMultipleActual >= 0 ? '+' : ''}{trade.rMultipleActual.toFixed(2)}R
              </span>
            )}
            {hasDelta && <span className="text-[10px] text-amber-400 font-mono">⚠ delta</span>}
            {tradeErrors.length > 0 && <span className="text-[10px] text-red-400 font-mono">{tradeErrors.length} error</span>}
          </div>
          <p className="text-[11px] text-zinc-500 font-mono">{account?.alias ?? '—'} · {strategy?.name ?? '—'}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums" style={{ color: trade.actualPnL >= 0 ? '#10b981' : '#ef4444' }}>{fmtUSD(trade.actualPnL)}</p>
          {hasDelta && <p className="text-[10px] text-zinc-500 font-mono line-through">{fmtUSD(trade.plannedPnL)}</p>}
        </div>
      </button>
      {expanded && (
        <div className="p-3 border-t border-zinc-800 space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <MiniStat label="P&L Ideal" value={fmtUSD(trade.plannedPnL)} color={trade.plannedPnL >= 0 ? '#10b981' : '#ef4444'} />
            <MiniStat label="P&L Real" value={fmtUSD(trade.actualPnL)} color={trade.actualPnL >= 0 ? '#10b981' : '#ef4444'}
              sub={hasDelta ? `Δ ${fmtUSD(trade.actualPnL - trade.plannedPnL)}` : ''} />
            {typeof trade.rMultipleStrategy === 'number' && <MiniStat label="R Ideal" value={`${trade.rMultipleStrategy.toFixed(2)}R`} />}
            {typeof trade.rMultipleActual === 'number' && <MiniStat label="R Real" value={`${trade.rMultipleActual.toFixed(2)}R`}
              color={trade.rMultipleActual >= 0 ? '#10b981' : '#ef4444'} />}
          </div>
          {(trade.moodBefore || trade.moodAfter) && (
            <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-2 text-xs">
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">Estado emocional</p>
              <div className="flex items-center gap-3">
                {trade.moodBefore && (
                  <span>antes <span style={{ color: MOOD_LABELS[trade.moodBefore].color }}>
                    {MOOD_LABELS[trade.moodBefore].emoji} {MOOD_LABELS[trade.moodBefore].label}
                  </span></span>
                )}
                {trade.moodAfter && (
                  <span>después <span style={{ color: MOOD_LABELS[trade.moodAfter].color }}>
                    {MOOD_LABELS[trade.moodAfter].emoji} {MOOD_LABELS[trade.moodAfter].label}
                  </span></span>
                )}
              </div>
            </div>
          )}
          {trade.notes && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Notas</p>
              <p className="text-xs text-zinc-300 whitespace-pre-wrap mt-1">{trade.notes}</p>
            </div>
          )}
          {trade.screenshotUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <a href={trade.screenshotUrl} target="_blank" rel="noreferrer" className="block">
              <img src={trade.screenshotUrl} alt="screenshot" className="rounded-lg max-w-full max-h-64 object-contain" />
            </a>
          )}
          {tradeErrors.length > 0 && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-2">
              <p className="text-[10px] font-mono uppercase tracking-wider text-red-400 mb-1">Errores</p>
              {tradeErrors.map((e) => (
                <div key={e.id} className="text-xs text-red-300">
                  <span className="font-bold">{ERROR_TYPE_LABELS[e.type]}</span> — {e.description}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
            <button onClick={onLogError} className="text-xs px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Error
            </button>
            <button onClick={onDelete} className="ml-auto text-zinc-700 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}
    </div>
  )
}

function TradeEditor({ accounts, strategies, onSave, onCancel }: {
  accounts: Account[]; strategies: Strategy[]
  onSave: (t: Omit<Trade, 'id' | 'createdAt'>) => void
  onCancel: () => void
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [strategyId, setStrategyId] = useState(strategies[0]?.id ?? '')
  const [instrument, setInstrument] = useState(strategies[0]?.instrument ?? 'MNQ')
  const [direction, setDirection] = useState<'long' | 'short'>('long')
  const [dateTime, setDateTime] = useState(() => nowLocalForInput())
  const [exitDateTime, setExitDateTime] = useState('')
  const [plannedPnL, setPlannedPnL] = useState('')
  const [actualPnL, setActualPnL] = useState('')
  const [sameAsPlanned, setSameAsPlanned] = useState(true)
  const [rPlanned, setRPlanned] = useState('')
  const [rActual, setRActual] = useState('')
  const [moodBefore, setMoodBefore] = useState<Mood | ''>('')
  const [moodAfter, setMoodAfter] = useState<Mood | ''>('')
  const [notes, setNotes] = useState('')
  const [screenshotUrl, setScreenshotUrl] = useState('')
  const save = () => {
    const planned = parseFloat(plannedPnL) || 0
    const actual = sameAsPlanned ? planned : parseFloat(actualPnL) || 0
    if (!accountId || !strategyId) return
    onSave({
      accountId, strategyId,
      dateTime: new Date(dateTime).toISOString(),
      exitDateTime: exitDateTime ? new Date(exitDateTime).toISOString() : undefined,
      instrument, direction,
      plannedPnL: planned, actualPnL: actual,
      rMultipleStrategy: rPlanned ? parseFloat(rPlanned) : undefined,
      rMultipleActual: rActual ? parseFloat(rActual) : (sameAsPlanned && rPlanned ? parseFloat(rPlanned) : undefined),
      moodBefore: moodBefore || undefined,
      moodAfter: moodAfter || undefined,
      notes: notes.trim() || undefined,
      screenshotUrl: screenshotUrl.trim() || undefined,
    })
  }
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Nuevo trade</h3>
        <button onClick={onCancel} className="text-zinc-500"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cuenta"><select value={accountId} onChange={(e) => setAccountId(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500">
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.alias}</option>)}
        </select></Field>
        <Field label="Estrategia"><select value={strategyId} onChange={(e) => {
          setStrategyId(e.target.value)
          const st = strategies.find((s) => s.id === e.target.value)
          if (st) setInstrument(st.instrument)
        }}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500">
          {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></Field>
        <Field label="Instrumento"><input value={instrument} onChange={(e) => setInstrument(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" /></Field>
        <Field label="Dirección">
          <div className="flex bg-zinc-800 border border-zinc-700 rounded-lg p-0.5">
            <button onClick={() => setDirection('long')} className={`flex-1 py-1 rounded-md text-xs font-bold ${direction === 'long' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-500'}`}>LONG</button>
            <button onClick={() => setDirection('short')} className={`flex-1 py-1 rounded-md text-xs font-bold ${direction === 'short' ? 'bg-red-500/20 text-red-400' : 'text-zinc-500'}`}>SHORT</button>
          </div>
        </Field>
        <Field label="Entrada"><input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" /></Field>
        <Field label="Salida (opcional)"><input type="datetime-local" value={exitDateTime} onChange={(e) => setExitDateTime(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" /></Field>
        <Field label="P&L ideal ($)"><input type="number" step="0.01" value={plannedPnL} onChange={(e) => setPlannedPnL(e.target.value)} autoFocus
          placeholder="250 o -150"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white tabular-nums focus:outline-none focus:border-emerald-500" /></Field>
        <Field label={sameAsPlanned ? 'P&L real (= ideal)' : 'P&L real ($)'}>
          {sameAsPlanned ? (
            <button onClick={() => setSameAsPlanned(false)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-200 text-left">
              Tocá para diferenciar
            </button>
          ) : (
            <div className="flex gap-1">
              <input type="number" step="0.01" value={actualPnL} onChange={(e) => setActualPnL(e.target.value)}
                className="flex-1 bg-zinc-800 border border-amber-500/40 rounded-lg px-2 py-1.5 text-sm text-white tabular-nums focus:outline-none focus:border-amber-500" />
              <button onClick={() => { setSameAsPlanned(true); setActualPnL('') }} className="text-zinc-500 hover:text-zinc-200 px-1"><Check className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </Field>
        <Field label="R ideal (opcional)"><input type="number" step="0.1" value={rPlanned} onChange={(e) => setRPlanned(e.target.value)}
          placeholder="ej. 2"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white tabular-nums focus:outline-none focus:border-emerald-500" /></Field>
        <Field label="R real (opcional)"><input type="number" step="0.1" value={rActual} onChange={(e) => setRActual(e.target.value)}
          placeholder="ej. 1.7 o -1"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white tabular-nums focus:outline-none focus:border-emerald-500" /></Field>
        <Field label="Mood antes"><select value={moodBefore} onChange={(e) => setMoodBefore(e.target.value as Mood | '')}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500">
          <option value="">—</option>
          {(Object.keys(MOOD_LABELS) as Mood[]).map((m) => (
            <option key={m} value={m}>{MOOD_LABELS[m].emoji} {MOOD_LABELS[m].label}</option>
          ))}
        </select></Field>
        <Field label="Mood después"><select value={moodAfter} onChange={(e) => setMoodAfter(e.target.value as Mood | '')}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500">
          <option value="">—</option>
          {(Object.keys(MOOD_LABELS) as Mood[]).map((m) => (
            <option key={m} value={m}>{MOOD_LABELS[m].emoji} {MOOD_LABELS[m].label}</option>
          ))}
        </select></Field>
      </div>
      <Field label="Notas"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500 resize-none" /></Field>
      <Field label="URL screenshot"><input value={screenshotUrl} onChange={(e) => setScreenshotUrl(e.target.value)} placeholder="https://imgur.com/..."
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500" /></Field>
      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-semibold">Cancelar</button>
        <button onClick={save} disabled={!accountId || !strategyId || !plannedPnL}
          className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 disabled:opacity-40 text-emerald-300 text-xs font-bold">Guardar</button>
      </div>
    </div>
  )
}

function ErrorModal({ trade, onSave, onCancel }: {
  trade: Trade
  onSave: (e: Omit<ErrorLog, 'id' | 'createdAt'>) => void
  onCancel: () => void
}) {
  const [type, setType] = useState<ErrorType>('late_entry')
  const [description, setDescription] = useState('')
  const [screenshotUrl, setScreenshotUrl] = useState('')
  const save = () => {
    if (!description.trim()) return
    onSave({ tradeId: trade.id, strategyId: trade.strategyId, accountId: trade.accountId,
      type, description: description.trim(), screenshotUrl: screenshotUrl.trim() || undefined })
  }
  return (
    <div onClick={onCancel} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Loggear error</h3>
          <button onClick={onCancel} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>
        <Field label="Tipo"><select value={type} onChange={(e) => setType(e.target.value as ErrorType)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500">
          {(Object.keys(ERROR_TYPE_LABELS) as ErrorType[]).map((k) => (
            <option key={k} value={k}>{ERROR_TYPE_LABELS[k]}</option>
          ))}
        </select></Field>
        <Field label="Descripción"><textarea autoFocus value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500 resize-none" /></Field>
        <Field label="Screenshot URL"><input value={screenshotUrl} onChange={(e) => setScreenshotUrl(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500" /></Field>
        <div className="flex gap-2 pt-2">
          <button onClick={onCancel} className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-semibold">Cancelar</button>
          <button onClick={save} disabled={!description.trim()}
            className="flex-1 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 disabled:opacity-40 text-amber-300 text-xs font-bold">Loggear</button>
        </div>
      </div>
    </div>
  )
}

// ─── ERRORES (sin cambios mayores) ───────────────────────────────────────────

function ErroresTab() {
  const { errors, trades, strategies, removeError } = useTradingStore()
  const byStrategy = useMemo(() => {
    const map = new Map<string, ErrorLog[]>()
    for (const e of errors) {
      const arr = map.get(e.strategyId) ?? []
      arr.push(e); map.set(e.strategyId, arr)
    }
    return map
  }, [errors])
  const typeCount = useMemo(() => {
    const m = new Map<ErrorType, number>()
    for (const e of errors) m.set(e.type, (m.get(e.type) ?? 0) + 1)
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [errors])
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-white">Errores · {errors.length}</h2>
      {errors.length === 0 ? (
        <p className="text-xs text-zinc-500">Sin errores loggeados.</p>
      ) : (
        <>
          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Más frecuentes</h3>
            <div className="space-y-1.5">
              {typeCount.map(([t, count]) => (
                <div key={t} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-300 w-44 truncate">{ERROR_TYPE_LABELS[t]}</span>
                  <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: `${(count / errors.length) * 100}%` }} />
                  </div>
                  <span className="text-xs text-amber-400 font-mono w-10 text-right">{count}</span>
                </div>
              ))}
            </div>
          </section>
          {strategies.filter((s) => byStrategy.has(s.id)).map((s) => {
            const list = byStrategy.get(s.id) ?? []
            return (
              <section key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4" style={{ borderLeftColor: s.color, borderLeftWidth: 3 }}>
                <h3 className="text-sm font-bold text-white mb-2">{s.name} <span className="text-zinc-500 font-normal text-xs">· {list.length}</span></h3>
                <div className="space-y-2">
                  {list.map((e) => {
                    const trade = trades.find((t) => t.id === e.tradeId)
                    return (
                      <div key={e.id} className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-3 group">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-amber-400">{ERROR_TYPE_LABELS[e.type]}</span>
                          <button onClick={() => removeError(e.id)} className="opacity-0 group-hover:opacity-100 text-zinc-700 hover:text-red-400">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-xs text-zinc-300 whitespace-pre-wrap">{e.description}</p>
                        {trade && <p className="text-[10px] text-zinc-600 mt-1 font-mono">
                          Trade: {trade.instrument} {trade.direction} · {fmtUSD(trade.plannedPnL)} → {fmtUSD(trade.actualPnL)}
                        </p>}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}

// ─── EMOCIONAL (TANDA 2) ─────────────────────────────────────────────────────

function EmocionalTab() {
  const { emotional, addEmotional, removeEmotional } = useTradingStore()
  const [showAdd, setShowAdd] = useState(false)

  const moodCount = useMemo(() => {
    const m = new Map<Mood, number>()
    for (const e of emotional) m.set(e.mood, (m.get(e.mood) ?? 0) + 1)
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [emotional])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">Journal emocional · {emotional.length} entradas</h2>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
          <Plus className="w-3.5 h-3.5" /> Nueva entrada
        </button>
      </div>

      {showAdd && (
        <EmotionalEditor onSave={(e) => { addEmotional(e); setShowAdd(false) }} onCancel={() => setShowAdd(false)} />
      )}

      {/* Mood distribution */}
      {emotional.length > 0 && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Distribución emocional</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {moodCount.map(([mood, count]) => {
              const meta = MOOD_LABELS[mood]
              return (
                <div key={mood} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-950/60 border border-zinc-800">
                  <span className="text-xl">{meta.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: meta.color }}>{meta.label}</p>
                    <p className="text-[10px] text-zinc-500 font-mono">{count} ({((count / emotional.length) * 100).toFixed(0)}%)</p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Recent entries */}
      <div className="space-y-2">
        {emotional.slice(0, 50).map((e) => {
          const meta = MOOD_LABELS[e.mood]
          return (
            <div key={e.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 group" style={{ borderLeftColor: meta.color, borderLeftWidth: 3 }}>
              <div className="flex items-start gap-3">
                <span className="text-2xl">{meta.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-bold" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="text-[10px] text-zinc-500 font-mono">{e.date}</span>
                    <span className="text-[10px] text-zinc-500 font-mono">Energía: {e.energyBefore}/10{e.energyAfter !== undefined && ` → ${e.energyAfter}/10`}</span>
                    {e.tags?.map((t) => (
                      <span key={t} className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{t}</span>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-300 whitespace-pre-wrap">{e.description}</p>
                </div>
                <button onClick={() => removeEmotional(e.id)}
                  className="opacity-0 group-hover:opacity-100 text-zinc-700 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )
        })}
        {emotional.length === 0 && <p className="text-xs text-zinc-600 text-center py-6">Aún sin entradas. El journal emocional sirve para registrar cómo te sentiste antes/después/durante el trading.</p>}
      </div>
    </div>
  )
}

function EmotionalEditor({ onSave, onCancel }: {
  onSave: (e: Omit<EmotionalEntry, 'id' | 'createdAt'>) => void
  onCancel: () => void
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [mood, setMood] = useState<Mood>('neutral')
  const [energyBefore, setEnergyBefore] = useState(7)
  const [energyAfter, setEnergyAfter] = useState(7)
  const [description, setDescription] = useState('')
  const [tagsInput, setTagsInput] = useState('')

  const save = () => {
    if (!description.trim()) return
    onSave({
      date, mood, energyBefore, energyAfter,
      description: description.trim(),
      tags: tagsInput.trim() ? tagsInput.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    })
  }

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Nueva entrada emocional</h3>
        <button onClick={onCancel} className="text-zinc-500"><X className="w-4 h-4" /></button>
      </div>
      <Field label="Fecha"><input type="date" value={date} onChange={(e) => setDate(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" /></Field>
      <Field label="Estado">
        <div className="grid grid-cols-4 gap-1.5">
          {(Object.keys(MOOD_LABELS) as Mood[]).map((m) => {
            const meta = MOOD_LABELS[m]
            return (
              <button key={m} onClick={() => setMood(m)}
                className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border transition-all ${
                  mood === m ? 'border-2' : 'border-zinc-800 hover:border-zinc-600'
                }`}
                style={{ borderColor: mood === m ? meta.color : undefined, background: mood === m ? meta.color + '15' : '#27272a30' }}>
                <span className="text-xl">{meta.emoji}</span>
                <span className="text-[10px] font-semibold" style={{ color: mood === m ? meta.color : '#a1a1aa' }}>{meta.label}</span>
              </button>
            )
          })}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Energía antes (${energyBefore}/10)`}>
          <input type="range" min="1" max="10" value={energyBefore} onChange={(e) => setEnergyBefore(parseInt(e.target.value))}
            className="w-full accent-emerald-500" />
        </Field>
        <Field label={`Energía después (${energyAfter}/10)`}>
          <input type="range" min="1" max="10" value={energyAfter} onChange={(e) => setEnergyAfter(parseInt(e.target.value))}
            className="w-full accent-emerald-500" />
        </Field>
      </div>
      <Field label="Descripción"><textarea autoFocus value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
        placeholder="¿qué sentiste? ¿qué disparó el estado? ¿afectó tu trading?"
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500 resize-none" /></Field>
      <Field label="Tags (separados por coma)"><input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)}
        placeholder="ej. pre-sesion, tilt, flow"
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" /></Field>
      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-semibold">Cancelar</button>
        <button onClick={save} disabled={!description.trim()}
          className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 disabled:opacity-40 text-emerald-300 text-xs font-bold">Guardar</button>
      </div>
    </div>
  )
}

// ─── LOGROS / MILESTONES (TANDA 2) ───────────────────────────────────────────

function LogrosTab() {
  const { accounts, trades, payouts } = useTradingStore()
  const ctx = useMemo(() => ({
    totalWithdrawn: payouts.reduce((s, p) => s + p.amount, 0),
    payoutCount: payouts.length,
    activeAccounts: accounts.filter((a) => a.status === 'evaluation' || a.status === 'funded').length,
    tradeCount: trades.length,
    profitableMonths: 0, // future: compute by grouping trades by month
  }), [accounts, trades, payouts])

  const { unlocked, locked } = checkMilestones(ctx)

  // Next milestone to chase
  const nextMilestone = locked
    .sort((a, b) => {
      const aProgress = a.progress(ctx) / a.threshold
      const bProgress = b.progress(ctx) / b.threshold
      return bProgress - aProgress
    })[0]

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-white">Logros · {unlocked.length}/{MILESTONES.length}</h2>

      {/* Next milestone */}
      {nextMilestone && (
        <section className="bg-gradient-to-br from-emerald-500/10 via-zinc-900 to-zinc-900 border border-emerald-500/20 rounded-2xl p-5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 mb-2">Próximo logro</p>
          <div className="flex items-center gap-4">
            <span className="text-4xl">{nextMilestone.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold text-white">{nextMilestone.label}</p>
              <p className="text-xs text-zinc-400">{nextMilestone.description}</p>
              <div className="mt-2">
                <div className="flex justify-between text-[10px] font-mono mb-1">
                  <span className="text-zinc-500">Progreso</span>
                  <span className="text-emerald-400">
                    {nextMilestone.unit === '$' ? fmtUSD(nextMilestone.progress(ctx)) : nextMilestone.progress(ctx)}
                    {' / '}
                    {nextMilestone.unit === '$' ? fmtUSD(nextMilestone.threshold) : nextMilestone.threshold}
                  </span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.min(100, (nextMilestone.progress(ctx) / nextMilestone.threshold) * 100)}%` }} />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Unlocked */}
      {unlocked.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Desbloqueados · {unlocked.length}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {unlocked.map((m) => (
              <div key={m.id} className="bg-gradient-to-br from-emerald-500/15 to-zinc-900 border border-emerald-500/30 rounded-2xl p-3 text-center">
                <span className="text-3xl">{m.emoji}</span>
                <p className="text-sm font-bold text-emerald-300 mt-1">{m.label}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">{m.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Locked */}
      <section>
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Bloqueados · {locked.length}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {locked.map((m) => {
            const progress = m.progress(ctx)
            const pct = Math.min(100, (progress / m.threshold) * 100)
            return (
              <div key={m.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 text-center opacity-60">
                <span className="text-3xl grayscale">{m.emoji}</span>
                <p className="text-sm font-bold text-zinc-400 mt-1">{m.label}</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">{m.description}</p>
                {pct > 0 && (
                  <div className="mt-2">
                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-zinc-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[9px] text-zinc-600 mt-0.5 font-mono">{pct.toFixed(0)}%</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

// ─── RIESGO (TANDA 3) ────────────────────────────────────────────────────────

function RiesgoTab() {
  const { accounts, trades, firms, updateAccount } = useTradingStore()

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-white flex items-center gap-2">
        <Shield className="w-4 h-4 text-amber-400" /> Gestión de riesgo
      </h2>
      <p className="text-xs text-zinc-500">Configurá límites internos por cuenta. Estos son TUS reglas (más estrictas que las de la empresa) para protegerte.</p>

      {accounts.length === 0 && <p className="text-xs text-zinc-600">Sin cuentas. Creá una primero en la pestaña Cuentas.</p>}

      <div className="space-y-3">
        {accounts.map((a) => {
          const firm = firms.find((f) => f.id === a.firmId)
          const accountTrades = trades.filter((t) => t.accountId === a.id)
          const today = new Date().toISOString().slice(0, 10)
          const todayTrades = accountTrades.filter((t) => t.dateTime.slice(0, 10) === today)
          const todayPnL = todayTrades.reduce((s, t) => s + t.actualPnL, 0)
          const todayLossUSD = Math.max(0, -todayPnL)
          const maxDailyLossUSD = a.maxDailyLossPct ? a.accountSize * (a.maxDailyLossPct / 100) : null
          const dailyLossPctUsed = maxDailyLossUSD && maxDailyLossUSD > 0 ? (todayLossUSD / maxDailyLossUSD) * 100 : 0
          const tradesUsedPct = a.maxDailyTrades ? (todayTrades.length / a.maxDailyTrades) * 100 : 0

          // Risk per trade USD
          const riskPerTradeUSD = a.maxRiskPerTradePct ? a.accountSize * (a.maxRiskPerTradePct / 100) : null

          return (
            <div key={a.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-white">{a.alias}</h3>
                  <p className="text-[10px] text-zinc-500 font-mono">{firm?.name} · {fmtUSD(a.accountSize)}</p>
                </div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded"
                  style={{ background: (a.mode ?? 'conservative') === 'aggressive' ? '#ef444420' : '#10b98120',
                    color: (a.mode ?? 'conservative') === 'aggressive' ? '#ef4444' : '#10b981' }}>
                  {a.mode ?? 'conservative'}
                </span>
              </div>

              {/* Risk config */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Field label="Riesgo / trade %">
                  <input type="number" step="0.1" value={a.maxRiskPerTradePct ?? ''}
                    onChange={(e) => updateAccount(a.id, { maxRiskPerTradePct: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                    placeholder="ej. 0.5"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white tabular-nums focus:outline-none focus:border-emerald-500" />
                </Field>
                <Field label="Max pérdida diaria %">
                  <input type="number" step="0.5" value={a.maxDailyLossPct ?? ''}
                    onChange={(e) => updateAccount(a.id, { maxDailyLossPct: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                    placeholder="ej. 2"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white tabular-nums focus:outline-none focus:border-emerald-500" />
                </Field>
                <Field label="Max trades / día">
                  <input type="number" value={a.maxDailyTrades ?? ''}
                    onChange={(e) => updateAccount(a.id, { maxDailyTrades: e.target.value === '' ? undefined : parseInt(e.target.value) })}
                    placeholder="ej. 5"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white tabular-nums focus:outline-none focus:border-emerald-500" />
                </Field>
              </div>

              {/* Live status */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-2">
                  <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">Risk/trade USD</p>
                  <p className="text-sm font-bold tabular-nums text-emerald-400">{riskPerTradeUSD !== null ? fmtUSD(riskPerTradeUSD) : '—'}</p>
                </div>
                <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-2">
                  <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">Pérdida hoy</p>
                  <p className="text-sm font-bold tabular-nums" style={{ color: todayLossUSD > 0 ? (dailyLossPctUsed > 75 ? '#ef4444' : dailyLossPctUsed > 50 ? '#f59e0b' : '#10b981') : '#10b981' }}>
                    {fmtUSD(todayLossUSD)}{maxDailyLossUSD ? ` / ${fmtUSD(maxDailyLossUSD)}` : ''}
                  </p>
                  {maxDailyLossUSD && (
                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mt-1">
                      <div className="h-full" style={{
                        width: `${Math.min(100, dailyLossPctUsed)}%`,
                        background: dailyLossPctUsed > 75 ? '#ef4444' : dailyLossPctUsed > 50 ? '#f59e0b' : '#10b981',
                      }} />
                    </div>
                  )}
                </div>
                <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-2">
                  <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">Trades hoy</p>
                  <p className="text-sm font-bold tabular-nums text-zinc-200">
                    {todayTrades.length}{a.maxDailyTrades ? ` / ${a.maxDailyTrades}` : ''}
                  </p>
                  {a.maxDailyTrades && (
                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mt-1">
                      <div className="h-full" style={{
                        width: `${Math.min(100, tradesUsedPct)}%`,
                        background: tradesUsedPct >= 100 ? '#ef4444' : tradesUsedPct >= 80 ? '#f59e0b' : '#10b981',
                      }} />
                    </div>
                  )}
                </div>
              </div>

              {/* Alerts */}
              {((maxDailyLossUSD && todayLossUSD >= maxDailyLossUSD * 0.75) ||
                (a.maxDailyTrades && todayTrades.length >= a.maxDailyTrades)) && (
                <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <p className="text-xs text-red-300 font-semibold">
                    {a.maxDailyTrades && todayTrades.length >= a.maxDailyTrades
                      ? '⚠ Alcanzaste el máximo de trades del día. Parar.'
                      : '⚠ Cerca del límite de pérdida diaria. Considerá parar.'}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── LABORATORIO (TANDA 3) ───────────────────────────────────────────────────

function LaboratorioTab() {
  const { firms, accounts, trades, payouts } = useTradingStore()
  const [budget, setBudget] = useState(500)

  // Compute baseline pass rate per firm using historical data
  const firmStats = useMemo(() => {
    return firms.map((f) => {
      const firmAccounts = accounts.filter((a) => a.firmId === f.id)
      const passed = firmAccounts.filter((a) => a.status === 'funded' || a.status === 'paid_out').length
      const failed = firmAccounts.filter((a) => a.status === 'failed').length
      const total = passed + failed
      const passRate = total > 0 ? (passed / total) * 100 : 50  // fallback 50% as neutral prior

      const firmPayouts = payouts.filter((p) => firmAccounts.some((a) => a.id === p.accountId))
      const totalPayout = firmPayouts.reduce((s, p) => s + p.amount, 0)
      const avgPayout = firmPayouts.length > 0 ? totalPayout / firmPayouts.length : 0

      const firmTrades = trades.filter((t) => firmAccounts.some((a) => a.id === t.accountId))
      const avgPnL = firmTrades.length > 0 ? firmTrades.reduce((s, t) => s + t.actualPnL, 0) / firmTrades.length : 0

      return { firm: f, accounts: firmAccounts.length, passed, failed, passRate, totalPayout, avgPayout, avgPnL, sample: total }
    })
  }, [firms, accounts, payouts, trades])

  // Cost assumptions per firm — derived from average actual eval costs they've recorded
  const recommendations = useMemo(() => {
    const recs: { firm: PropFirm; affordableAccounts: number; expectedPasses: number; expectedROI: number; costAssumed: number }[] = []
    for (const s of firmStats) {
      const firmAccts = accounts.filter((a) => a.firmId === s.firm.id)
      const avgCost = firmAccts.length > 0
        // Include activation fee in the avg-cost so affordability estimates
        // reflect the REAL cost of getting funded with this firm.
        ? firmAccts.reduce((sum, a) => sum + a.evaluationCost + (a.activationFee ?? 0), 0) / firmAccts.length
        : 150 // default assumption
      if (avgCost <= 0) continue
      const affordableAccounts = Math.floor(budget / avgCost)
      const expectedPasses = affordableAccounts * (s.passRate / 100)
      const expectedReturn = expectedPasses * s.avgPayout
      const investedHere = affordableAccounts * avgCost
      const expectedROI = investedHere > 0 ? ((expectedReturn - investedHere) / investedHere) * 100 : 0
      recs.push({
        firm: s.firm,
        affordableAccounts,
        expectedPasses,
        expectedROI,
        costAssumed: avgCost,
      })
    }
    return recs.sort((a, b) => b.expectedROI - a.expectedROI)
  }, [firmStats, accounts, budget])

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-white flex items-center gap-2">
        <FlaskConical className="w-4 h-4 text-purple-400" /> Laboratorio de Props
      </h2>
      <p className="text-xs text-zinc-500">Dado tu presupuesto, cuántas cuentas comprar y qué retorno esperás según TU histórico.</p>

      {/* Budget input */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <Field label="Presupuesto disponible ($)">
          <input type="number" value={budget} onChange={(e) => setBudget(parseFloat(e.target.value) || 0)} min={50}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-lg text-white tabular-nums focus:outline-none focus:border-purple-500" />
        </Field>
        <p className="text-[10px] text-zinc-500 mt-2">Recomendado: ≥ $500 (piso para que estadísticamente tenga sentido).</p>
      </div>

      {/* Firm stats */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Tu histórico por empresa</h3>
        <div className="space-y-2">
          {firmStats.map((s) => (
            <div key={s.firm.id} className="flex items-center gap-3 p-2 bg-zinc-950/60 rounded-lg border border-zinc-800">
              <div className="w-1 self-stretch rounded-full" style={{ background: s.firm.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{s.firm.name}</p>
                <p className="text-[10px] text-zinc-500 font-mono">
                  {s.passed}P · {s.failed}F · {s.accounts} cuentas{s.sample === 0 ? ' (sin datos)' : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold tabular-nums text-emerald-400">{s.passRate.toFixed(0)}% pass</p>
                <p className="text-[10px] text-zinc-500 font-mono">avg payout {fmtUSD(s.avgPayout)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recommendations */}
      <section className="bg-gradient-to-br from-purple-500/8 via-zinc-900 to-zinc-900 border border-purple-500/20 rounded-2xl p-4">
        <h3 className="text-xs font-bold text-purple-300 uppercase tracking-wider mb-3">Recomendaciones con ${budget}</h3>
        {recommendations.length === 0 ? (
          <p className="text-xs text-zinc-500">Sin datos para recomendar. Cargá empresas y trades primero.</p>
        ) : (
          <div className="space-y-2">
            {recommendations.map((r, i) => (
              <div key={r.firm.id} className={`flex items-center gap-3 p-3 rounded-xl border ${i === 0 ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-zinc-950/60 border-zinc-800'}`}>
                {i === 0 && <Trophy className="w-4 h-4 text-emerald-400" />}
                <div className="w-1 self-stretch rounded-full" style={{ background: r.firm.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{r.firm.name}</p>
                  <p className="text-[10px] text-zinc-500 font-mono">
                    {r.affordableAccounts} cuentas × {fmtUSD(r.costAssumed)} = {fmtUSD(r.affordableAccounts * r.costAssumed)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-zinc-500 font-mono">Expected passes</p>
                  <p className="text-base font-bold text-emerald-400 tabular-nums">{r.expectedPasses.toFixed(1)}</p>
                  <p className="text-[10px] font-mono" style={{ color: r.expectedROI >= 0 ? '#10b981' : '#ef4444' }}>
                    {r.expectedROI >= 0 ? '+' : ''}{r.expectedROI.toFixed(0)}% ROI esperado
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-[10px] text-zinc-600 italic">
        ⚠️ La probabilidad se calcula sobre TU histórico real. Con pocas cuentas, el número tiene alta varianza. Tomalo como guía direccional, no garantía.
      </p>
    </div>
  )
}

// ─── CALENDARIO ECONÓMICO (TANDA 3 — stub) ──────────────────────────────────

function CalendarioEconTab() {
  const [events] = useState<{ date: string; time: string; event: string; impact: 'high' | 'medium' | 'low'; currency: string }[]>([
    // Static demo data — user can later wire this to an external API like ForexFactory
    { date: '2026-05-19', time: '14:30', event: 'PPI mensual', impact: 'medium', currency: 'USD' },
    { date: '2026-05-21', time: '14:30', event: 'Discurso Powell (Fed)', impact: 'high', currency: 'USD' },
    { date: '2026-05-22', time: '14:30', event: 'Solicitudes desempleo', impact: 'medium', currency: 'USD' },
    { date: '2026-05-23', time: '14:30', event: 'PMI manufacturero', impact: 'medium', currency: 'USD' },
    { date: '2026-05-29', time: '14:30', event: 'GDP trimestral', impact: 'high', currency: 'USD' },
    { date: '2026-05-30', time: '14:30', event: 'PCE Core (inflación Fed)', impact: 'high', currency: 'USD' },
  ])

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-white flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-blue-400" /> Calendario económico
      </h2>
      <p className="text-xs text-zinc-500">Eventos macroeconómicos que mueven el mercado. Usá esto para no abrir trades antes/durante noticias importantes.</p>

      <div className="space-y-2">
        {events.map((e, i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-xl"
            style={{ borderLeftColor: e.impact === 'high' ? '#ef4444' : e.impact === 'medium' ? '#f59e0b' : '#71717a', borderLeftWidth: 3 }}>
            <div className="text-center w-16 shrink-0">
              <p className="text-[10px] font-mono text-zinc-500">{e.date.slice(5)}</p>
              <p className="text-sm font-bold text-zinc-200 tabular-nums">{e.time}</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{e.event}</p>
              <p className="text-[10px] text-zinc-500 font-mono">{e.currency}</p>
            </div>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded"
              style={{ background: e.impact === 'high' ? '#ef444420' : e.impact === 'medium' ? '#f59e0b20' : '#71717a20',
                color: e.impact === 'high' ? '#ef4444' : e.impact === 'medium' ? '#f59e0b' : '#71717a' }}>
              {e.impact}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-zinc-600 italic">
        Datos estáticos de muestra. Para conectar a un feed real (ForexFactory, Investing.com, FRED API) avisame y armamos la integración.
      </p>
    </div>
  )
}

// ─── GLOSARIO (TANDA 3) ──────────────────────────────────────────────────────

const GLOSSARY: { term: string; definition: string; example?: string }[] = [
  { term: 'Drawdown (DD)', definition: 'Caída desde el pico hasta el valle del balance. Es la pérdida máxima que tuviste durante una racha negativa.', example: 'Si tu balance pasó de $55k → $52k, tu DD es $3k (5.5%).' },
  { term: 'DD estático', definition: 'Drawdown calculado SIEMPRE desde el balance inicial. No se mueve aunque ganes plata.', example: 'Cuenta de $50k con DD 4% estático = nunca podés ir abajo de $48k.' },
  { term: 'DD trailing', definition: 'Drawdown que sigue al pico de tu balance. Mientras ganás, el DD trail se mueve con vos; una vez que el balance supera el +threshold, se "congela".', example: 'Cuenta $50k con DD 4% trail: si subís a $52k, ahora no podés ir abajo de $48k. Si llegás a $54k, se congela ahí.' },
  { term: 'Profit Target', definition: 'Ganancia mínima que la empresa de fondeo te exige antes de pasar la evaluación.', example: 'Topstep 50k: 6% = $3,000.' },
  { term: 'Consistency Rule', definition: 'Regla que limita qué porcentaje de tu profit puede venir de un solo día. Evita que pases con un día explosivo.', example: 'Regla 50%: si tu profit total es $4,000, tu mejor día no puede ser más de $2,000.' },
  { term: 'Payout / Retiro', definition: 'Cobro real de plata desde la empresa de fondeo a tu bolsillo. Sólo después de que pasaste la evaluación y opero como fondeado.', example: 'Pasaste TPT, después de 14 días podés pedir tu primer payout.' },
  { term: 'Split', definition: 'Porcentaje del profit que se queda el trader. El resto se lo queda la empresa.', example: 'Topstep: 100% al trader. TPT: 90% al trader, 10% a la empresa.' },
  { term: 'Profit Factor', definition: 'Ratio de ganancias totales sobre pérdidas totales (en valor absoluto). >1 significa rentable.', example: 'Si ganaste $5,000 y perdiste $2,500, tu PF = 2.0.' },
  { term: 'Win Rate', definition: 'Porcentaje de trades ganadores. Por sí solo no dice nada — un win rate alto con R:R bajo puede ser deficitario.', example: 'Win rate 60% con R:R 1:1 = expectativa positiva. Win rate 60% con R:R 1:0.5 = pierde.' },
  { term: 'R:R (Risk:Reward)', definition: 'Relación entre lo que arriesgás y lo que apuntás a ganar. R:R 1:2 significa que apuntás a ganar el doble de lo que arriesgás.', example: 'Stop a $100 distancia, target a $200 distancia = R:R 1:2.' },
  { term: 'R Multiple', definition: 'Cuántas R ganó/perdió un trade. 1R = arriesgaste y ganaste lo mismo. -1R = perdiste exacto el stop.', example: 'Si arriesgaste $50 y ganaste $100, fue +2R.' },
  { term: 'Slippage', definition: 'Diferencia entre el precio teórico de la estrategia y el precio real de ejecución. En Overseer, diferencia entre P&L Ideal y P&L Real.', example: 'Estrategia ideal devolvía $250, vos ejecutaste mal y sacaste $180 → slippage $70.' },
  { term: 'Day Win %', definition: 'Porcentaje de días que cerraste en verde. Más estable que el win rate por trade.' },
  { term: 'Equity Curve', definition: 'Gráfico del balance acumulado a lo largo del tiempo. Ideal: subida suave. Una curva con valles profundos indica risk management malo.' },
  { term: 'Tilt', definition: 'Estado emocional de descontrol después de una pérdida o serie de pérdidas, donde tomás decisiones impulsivas para "recuperar".' },
  { term: 'Revenge Trade', definition: 'Trade abierto por emoción/venganza después de una pérdida. Casi siempre termina mal. Logarlo en el journal emocional ayuda a detectarlos.' },
  { term: 'Deload', definition: 'Semana de descarga: reducir volumen/risk un 20-30% para resetear. Aplica al trading (después de drawdown) y al gym.' },
  { term: 'Edge', definition: 'Ventaja estadística explotable. Sin edge, tradear es apostar. Con edge, la varianza juega a tu favor en el largo plazo.' },
  { term: 'Monte Carlo', definition: 'Simulación que reordena/altera los resultados de trades miles de veces para ver qué tan robusto es un sistema.' },
  { term: 'Evaluación', definition: 'Fase inicial de una cuenta prop. Tenés que cumplir un profit target sin violar reglas. Una vez pasada, la cuenta queda "fondeada".' },
  { term: 'Funded / Fondeada', definition: 'Cuenta que ya pasó la evaluación. Ahora podés pedir payouts reales.' },
  { term: 'Take Profit (TP)', definition: 'Precio donde cerrás la posición con ganancia, definido antes de entrar.' },
  { term: 'Stop Loss (SL)', definition: 'Precio donde cerrás la posición con pérdida, definido antes de entrar. INNEGOCIABLE.' },
]

function GlosarioTab() {
  const [filter, setFilter] = useState('')
  const filtered = GLOSSARY.filter((g) =>
    g.term.toLowerCase().includes(filter.toLowerCase()) ||
    g.definition.toLowerCase().includes(filter.toLowerCase())
  )
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-white flex items-center gap-2">
        <BookText className="w-4 h-4 text-cyan-400" /> Glosario
      </h2>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar término..."
        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500" />
      <div className="space-y-2">
        {filtered.map((g) => (
          <div key={g.term} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h3 className="text-sm font-bold text-cyan-300 mb-1">{g.term}</h3>
            <p className="text-xs text-zinc-300 leading-relaxed">{g.definition}</p>
            {g.example && (
              <p className="text-[11px] text-zinc-500 italic mt-2 pl-3 border-l-2 border-zinc-700">{g.example}</p>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="text-xs text-zinc-600 text-center py-6">Sin resultados.</p>}
      </div>
    </div>
  )
}
