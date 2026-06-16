'use client'
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip,
} from 'recharts'
import {
  Rocket, Layers, Users, Target, Plus, Trash2, Check, Pencil, X, ArrowRight,
  CheckCircle2, Circle, Sparkles, Wallet,
} from 'lucide-react'
import {
  useTradingStore, type Account, type ScalingGroup, type ScalingMilestone,
} from '@/lib/store/tradingStore'

// ─── Utility formatters ──────────────────────────────────────────────────────

function fmtUSD(n: number): string {
  if (!Number.isFinite(n)) return '$0'
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return '$0'
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}k`
  return fmtUSD(n)
}

const PALETTE = [
  '#6366f1', '#f59e0b', '#10b981', '#ec4899', '#06b6d4',
  '#a855f7', '#ef4444', '#84cc16', '#f97316', '#14b8a6',
]

// ─── Main Tab ────────────────────────────────────────────────────────────────

export function ScalingTab() {
  const { accounts, payouts, firms, scaling } = useTradingStore()

  // Derived stats — single source of truth for the whole tab.
  const stats = useMemo(() => {
    const fundedAccounts = accounts.filter((a) => a.status === 'funded' || a.status === 'paid_out')
    const evaluationAccounts = accounts.filter((a) => a.status === 'evaluation')
    const failedAccounts = accounts.filter((a) => a.status === 'failed')
    const activeAccounts = accounts.filter((a) => a.status !== 'failed')

    const totalPayouts = payouts.reduce((sum, p) => sum + p.amount, 0)
    const payoutCount = payouts.length

    // Investment in evaluations + activation fees + losses
    const totalReinvested = accounts.reduce((sum, a) =>
      sum + (a.evaluationCost ?? 0) + (a.activationFee ?? 0), 0)

    // Per-bucket cumulative allocation (based on % of distribution)
    const dist = scaling.distribution
    const totalPct = dist.newAccounts + dist.salary + dist.capital || 100
    const allocated = {
      newAccounts: (totalPayouts * dist.newAccounts) / totalPct,
      salary:      (totalPayouts * dist.salary)      / totalPct,
      capital:     (totalPayouts * dist.capital)     / totalPct,
    }

    return {
      fundedAccounts, evaluationAccounts, failedAccounts, activeAccounts,
      totalPayouts, payoutCount, totalReinvested, allocated,
    }
  }, [accounts, payouts, scaling])

  return (
    <div className="space-y-5">
      <PageHeader />

      <PipelineBanner
        evaluationCount={stats.evaluationAccounts.length}
        fundedCount={stats.fundedAccounts.length}
        payoutCount={stats.payoutCount}
        totalPayouts={stats.totalPayouts}
        totalReinvested={stats.totalReinvested}
      />

      <MilestonesPanel
        milestones={scaling.milestones}
        currentPayouts={stats.payoutCount}
        currentActiveAccounts={stats.activeAccounts.length}
        capitalRealGoal={scaling.capitalRealGoal}
        capitalAccumulated={stats.allocated.capital}
      />

      <DistributionPanel
        distribution={scaling.distribution}
        labels={scaling.distributionLabels ?? {}}
        allocated={stats.allocated}
        totalPayouts={stats.totalPayouts}
      />

      <GroupsPanel
        groups={scaling.groups}
        accounts={accounts}
        firms={firms}
      />
    </div>
  )
}

// ─── Header ──────────────────────────────────────────────────────────────────

function PageHeader() {
  return (
    <div>
      <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
        <Rocket className="w-4 h-4 text-emerald-400" />
        Sistema de Escalado
      </h2>
      <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed max-w-2xl">
        Cada payout se reinvierte. Cada cuenta diversifica. Cada milestone te empuja al siguiente nivel —
        de 1 cuenta a 3, de 3 payouts a 10, de 10 payouts a capital real.
        <span className="italic"> &quot;Si un grupo cae, el sistema sigue vivo.&quot;</span>
      </p>
    </div>
  )
}

// ─── Pipeline Banner ─────────────────────────────────────────────────────────

function PipelineBanner({
  evaluationCount, fundedCount, payoutCount, totalPayouts, totalReinvested,
}: {
  evaluationCount: number
  fundedCount: number
  payoutCount: number
  totalPayouts: number
  totalReinvested: number
}) {
  // Pipeline net = total paid - total reinvested. Tells the user how much
  // money has actually LEFT the system (not just cycled through).
  const netExtracted = totalPayouts - totalReinvested

  const stages = [
    {
      key: 'eval', label: 'Exámenes en proceso',
      value: evaluationCount, suffix: 'activos',
      color: '#f59e0b', icon: <Circle className="w-3 h-3" />,
    },
    {
      key: 'funded', label: 'Cuentas fondeadas',
      value: fundedCount, suffix: fundedCount === 1 ? 'activa' : 'activas',
      color: '#10b981', icon: <CheckCircle2 className="w-3 h-3" />,
    },
    {
      key: 'payouts', label: 'Payouts cobrados',
      value: payoutCount, suffix: 'total',
      sub: fmtCompact(totalPayouts),
      color: '#6366f1', icon: <Wallet className="w-3 h-3" />,
    },
    {
      key: 'reinv', label: 'Reinversión',
      value: fmtCompact(totalReinvested), suffix: 'en evals',
      color: '#a855f7', icon: <Rocket className="w-3 h-3" />,
    },
  ]

  return (
    <div className="bg-gradient-to-br from-emerald-500/8 via-zinc-900 to-zinc-900 border border-emerald-500/30 rounded-2xl p-4 sm:p-5">
      <p className="text-[10px] font-mono uppercase tracking-wider text-emerald-300 mb-3 flex items-center gap-1.5">
        <Layers className="w-3 h-3" /> Pipeline del sistema
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {stages.map((s, i) => (
          <div key={s.key} className="relative">
            <div className="bg-zinc-950/60 border rounded-xl p-3 h-full"
              style={{ borderColor: s.color + '40' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <span style={{ color: s.color }}>{s.icon}</span>
                <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">
                  {s.label}
                </span>
              </div>
              <p className="text-xl font-extrabold tabular-nums" style={{ color: s.color }}>
                {s.value}
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                {s.suffix}{s.sub ? ` · ${s.sub}` : ''}
              </p>
            </div>
            {/* Arrow connector — desktop only */}
            {i < stages.length - 1 && (
              <ArrowRight className="hidden sm:block absolute -right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-700 z-10" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap pt-3 border-t border-zinc-800">
        <p className="text-[11px] text-zinc-500 italic">
          Nunca dependo de una sola cuenta.
        </p>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-zinc-500">Neto extraído:</span>
          <span className={`tabular-nums font-bold ${netExtracted >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmtUSD(netExtracted)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Milestones ──────────────────────────────────────────────────────────────

function MilestonesPanel({
  milestones, currentPayouts, currentActiveAccounts,
  capitalRealGoal, capitalAccumulated,
}: {
  milestones: ScalingMilestone[]
  currentPayouts: number
  currentActiveAccounts: number
  capitalRealGoal?: number
  capitalAccumulated: number
}) {
  const {
    addScalingMilestone, updateScalingMilestone, removeScalingMilestone, setCapitalRealGoal,
  } = useTradingStore()

  const [editing, setEditing] = useState<string | null>(null)

  // Find current milestone (next unmet)
  const currentMilestoneIdx = useMemo(() => {
    for (let i = 0; i < milestones.length; i++) {
      if (currentPayouts < milestones[i].targetPayouts) return i
    }
    return milestones.length  // all met
  }, [milestones, currentPayouts])

  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-[10px] font-mono uppercase tracking-wider text-fuchsia-300 flex items-center gap-1.5">
          <Target className="w-3 h-3" /> Sistema de Escalado · milestones
        </p>
        <button
          onClick={() => addScalingMilestone({
            label: 'Nuevo milestone', targetPayouts: currentPayouts + 1,
          })}
          className="text-[10px] text-zinc-500 hover:text-fuchsia-300 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-900"
        >
          <Plus className="w-3 h-3" /> milestone
        </button>
      </div>

      {milestones.length === 0 && (
        <p className="text-xs text-zinc-600 italic text-center py-4">
          No tenés milestones todavía. Agregá uno para empezar a trackear.
        </p>
      )}

      <div className="space-y-2">
        {milestones.map((m, i) => {
          const status: 'done' | 'current' | 'future' =
            currentPayouts >= m.targetPayouts ? 'done'
            : i === currentMilestoneIdx ? 'current'
            : 'future'
          const progress = Math.min(1, currentPayouts / Math.max(1, m.targetPayouts))

          return (
            <MilestoneRow
              key={m.id}
              milestone={m}
              status={status}
              progress={progress}
              currentPayouts={currentPayouts}
              currentActiveAccounts={currentActiveAccounts}
              isEditing={editing === m.id}
              onEdit={() => setEditing(m.id)}
              onSave={(patch) => { updateScalingMilestone(m.id, patch); setEditing(null) }}
              onCancelEdit={() => setEditing(null)}
              onRemove={() => { if (confirm(`¿Borrar el milestone "${m.label}"?`)) removeScalingMilestone(m.id) }}
            />
          )
        })}
      </div>

      {/* Capital Real goal row */}
      <div className="mt-3 pt-3 border-t border-zinc-800/60">
        <CapitalRealGoalRow
          goal={capitalRealGoal}
          accumulated={capitalAccumulated}
          onSetGoal={setCapitalRealGoal}
        />
      </div>
    </div>
  )
}

function MilestoneRow({
  milestone, status, progress, currentPayouts, currentActiveAccounts,
  isEditing, onEdit, onSave, onCancelEdit, onRemove,
}: {
  milestone: ScalingMilestone
  status: 'done' | 'current' | 'future'
  progress: number
  currentPayouts: number
  currentActiveAccounts: number
  isEditing: boolean
  onEdit: () => void
  onSave: (patch: Partial<ScalingMilestone>) => void
  onCancelEdit: () => void
  onRemove: () => void
}) {
  const [labelDraft, setLabelDraft] = useState(milestone.label)
  const [payoutsDraft, setPayoutsDraft] = useState(String(milestone.targetPayouts))
  const [accountsDraft, setAccountsDraft] = useState(String(milestone.targetAccounts ?? ''))

  const colors = {
    done:    { bg: '#10b98115', border: '#10b98180', text: '#34d399' },
    current: { bg: '#a855f720', border: '#a855f7AA', text: '#c084fc' },
    future:  { bg: '#27272a40', border: '#3f3f46',   text: '#71717a' },
  }
  const c = colors[status]

  return (
    <div className="rounded-xl border-2 p-3 transition-colors"
      style={{ background: c.bg, borderColor: c.border }}>
      <div className="flex items-start gap-3">
        {/* Status icon */}
        <div className="shrink-0 mt-0.5">
          {status === 'done'
            ? <CheckCircle2 className="w-5 h-5" style={{ color: c.text }} />
            : status === 'current'
              ? <Sparkles className="w-5 h-5 animate-pulse" style={{ color: c.text }} />
              : <Circle className="w-5 h-5" style={{ color: c.text }} />}
        </div>

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-2">
              <input
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:border-fuchsia-500"
                placeholder="Ej: 3 payouts → 10 cuentas"
              />
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Payouts requeridos
                  <input
                    type="number" min={0}
                    value={payoutsDraft}
                    onChange={(e) => setPayoutsDraft(e.target.value)}
                    className="mt-0.5 w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 tabular-nums focus:outline-none focus:border-fuchsia-500"
                  />
                </label>
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Cuentas objetivo (opcional)
                  <input
                    type="number" min={0}
                    value={accountsDraft}
                    onChange={(e) => setAccountsDraft(e.target.value)}
                    className="mt-0.5 w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 tabular-nums focus:outline-none focus:border-fuchsia-500"
                  />
                </label>
              </div>
              <div className="flex items-center gap-1.5 justify-end">
                <button onClick={onCancelEdit} className="text-[11px] text-zinc-500 hover:text-zinc-300 px-2 py-1">
                  Cancelar
                </button>
                <button
                  onClick={() => onSave({
                    label: labelDraft.trim() || milestone.label,
                    targetPayouts: parseInt(payoutsDraft, 10) || 0,
                    targetAccounts: accountsDraft.trim() === '' ? undefined : parseInt(accountsDraft, 10) || 0,
                  })}
                  className="text-[11px] bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-300 rounded px-2 py-1 flex items-center gap-1"
                >
                  <Check className="w-3 h-3" /> Guardar
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm font-bold" style={{ color: c.text }}>
                {milestone.label}
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {currentPayouts}/{milestone.targetPayouts} payouts
                {milestone.targetAccounts !== undefined && milestone.targetAccounts > 0 && (
                  <> · {currentActiveAccounts}/{milestone.targetAccounts} cuentas activas</>
                )}
              </p>
              {/* Progress bar */}
              <div className="mt-2 h-1.5 rounded-full overflow-hidden bg-zinc-900">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.round(progress * 100)}%`,
                    background: status === 'done' ? '#10b981' : status === 'current' ? '#a855f7' : '#52525b',
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        {!isEditing && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onEdit}
              className="text-zinc-500 hover:text-zinc-200 p-1.5 rounded hover:bg-zinc-900 transition-colors"
              title="Editar milestone">
              <Pencil className="w-3 h-3" />
            </button>
            <button onClick={onRemove}
              className="text-zinc-600 hover:text-red-400 p-1.5 rounded hover:bg-zinc-900 transition-colors"
              title="Borrar milestone">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function CapitalRealGoalRow({
  goal, accumulated, onSetGoal,
}: { goal?: number; accumulated: number; onSetGoal: (n: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(goal ?? 100000))

  const progress = goal && goal > 0 ? Math.min(1, accumulated / goal) : 0
  const isComplete = goal && goal > 0 && accumulated >= goal

  return (
    <div className="rounded-xl border-2 p-3"
      style={{
        background: isComplete ? '#10b98120' : '#facc1510',
        borderColor: isComplete ? '#10b981AA' : '#facc15AA',
      }}>
      <div className="flex items-center gap-3">
        <Target className="w-5 h-5 shrink-0" style={{ color: isComplete ? '#34d399' : '#facc15' }} />
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                type="number" min={0}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 tabular-nums focus:outline-none focus:border-yellow-500"
              />
              <button
                onClick={() => { onSetGoal(parseFloat(draft) || 0); setEditing(false) }}
                className="text-xs bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 rounded px-2 py-1 flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> Guardar
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-sm font-bold text-yellow-300">
                  🎯 Capital Real
                </p>
                <p className="text-xs text-zinc-400 tabular-nums">
                  {fmtCompact(accumulated)} / {goal ? fmtCompact(goal) : '—'}
                </p>
                {goal && goal > 0 && (
                  <span className="text-[10px] font-mono text-zinc-500">
                    {Math.round(progress * 100)}%
                  </span>
                )}
              </div>
              <div className="mt-2 h-1.5 rounded-full overflow-hidden bg-zinc-900">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.round(progress * 100)}%`,
                    background: isComplete ? '#10b981' : '#facc15',
                  }}
                />
              </div>
            </>
          )}
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)}
            className="text-zinc-500 hover:text-zinc-200 p-1.5 rounded hover:bg-zinc-900"
            title="Cambiar meta">
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Distribution ────────────────────────────────────────────────────────────

function DistributionPanel({
  distribution, labels, allocated, totalPayouts,
}: {
  distribution: { newAccounts: number; salary: number; capital: number }
  labels: { newAccounts?: string; salary?: string; capital?: string }
  allocated: { newAccounts: number; salary: number; capital: number }
  totalPayouts: number
}) {
  const { setScalingDistribution } = useTradingStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ ...distribution })

  const total = distribution.newAccounts + distribution.salary + distribution.capital
  const draftTotal = draft.newAccounts + draft.salary + draft.capital

  const buckets = [
    { key: 'newAccounts' as const, label: labels.newAccounts ?? 'Nuevas cuentas', color: '#a855f7' },
    { key: 'salary'      as const, label: labels.salary      ?? 'Salario',         color: '#10b981' },
    { key: 'capital'     as const, label: labels.capital     ?? 'Capital real',    color: '#facc15' },
  ]

  const pieData = buckets.map((b) => ({ name: b.label, value: distribution[b.key], color: b.color }))

  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
            <Wallet className="w-3 h-3" /> Distribución de cada payout
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Acumulado de los {fmtCompact(totalPayouts)} cobrados hasta hoy.
          </p>
        </div>
        {!editing ? (
          <button onClick={() => { setDraft({ ...distribution }); setEditing(true) }}
            className="text-[10px] text-zinc-500 hover:text-purple-300 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-900">
            <Pencil className="w-3 h-3" /> Editar %
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-mono ${draftTotal === 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
              suma {draftTotal}%
            </span>
            <button onClick={() => setEditing(false)} className="text-[10px] text-zinc-500 hover:text-zinc-300 px-2 py-1">
              Cancelar
            </button>
            <button
              onClick={() => { setScalingDistribution(draft); setEditing(false) }}
              disabled={draftTotal !== 100}
              className="text-[10px] bg-purple-500/20 border border-purple-500/40 text-purple-300 disabled:opacity-40 disabled:cursor-not-allowed rounded px-2 py-1 flex items-center gap-1"
            >
              <Check className="w-3 h-3" /> Aplicar
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 items-center">
        {/* Donut */}
        <div className="h-[180px] sm:h-[200px] relative">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                cx="50%" cy="50%"
                innerRadius={55} outerRadius={80}
                stroke="none"
                paddingAngle={2}
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip
                contentStyle={{ background: 'var(--surface-popover)', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
                formatter={(v, name) => [`${v ?? 0}%`, name] as [string, string]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">total</p>
            <p className="text-base font-extrabold tabular-nums text-zinc-100">{total}%</p>
          </div>
        </div>

        {/* Legend + amounts */}
        <div className="space-y-2">
          {buckets.map((b) => (
            <div key={b.key} className="rounded-lg border p-2.5"
              style={{ borderColor: b.color + '40', background: b.color + '0D' }}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.color }} />
                  <span className="text-sm font-semibold truncate" style={{ color: b.color }}>
                    {b.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {editing ? (
                    <input
                      type="number" min={0} max={100}
                      value={draft[b.key]}
                      onChange={(e) => setDraft((d) => ({ ...d, [b.key]: parseInt(e.target.value, 10) || 0 }))}
                      className="w-14 bg-zinc-950 border border-zinc-700 rounded px-1 py-0.5 text-xs text-zinc-100 tabular-nums text-right focus:outline-none focus:border-purple-500"
                    />
                  ) : (
                    <span className="text-xs font-mono tabular-nums" style={{ color: b.color }}>
                      {distribution[b.key]}%
                    </span>
                  )}
                  <span className="text-xs text-zinc-500">·</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: b.color }}>
                    {fmtCompact(allocated[b.key])}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Groups ──────────────────────────────────────────────────────────────────

function GroupsPanel({
  groups, accounts, firms,
}: {
  groups: ScalingGroup[]
  accounts: Account[]
  firms: { id: string; name: string; color: string }[]
}) {
  const { addScalingGroup } = useTradingStore()

  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-[10px] font-mono uppercase tracking-wider text-blue-300 flex items-center gap-1.5">
          <Users className="w-3 h-3" /> Grupos de diversificación
        </p>
        <button
          onClick={() => addScalingGroup({
            name: 'Nuevo grupo',
            color: PALETTE[groups.length % PALETTE.length],
            accountIds: [],
          })}
          className="text-[10px] text-zinc-500 hover:text-blue-300 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-900"
        >
          <Plus className="w-3 h-3" /> grupo
        </button>
      </div>
      <p className="text-[11px] text-zinc-500 italic mb-3">
        Si un grupo cae, el sistema sigue vivo.
      </p>

      {groups.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-zinc-800 rounded-lg">
          <p className="text-xs text-zinc-600 italic">
            No tenés grupos definidos. Agregá uno y asigná cuentas para distribuir tu riesgo.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} allAccounts={accounts} firms={firms} />
          ))}
        </div>
      )}

      {/* Unassigned accounts hint */}
      <UnassignedAccountsHint groups={groups} accounts={accounts} />
    </div>
  )
}

function GroupCard({
  group, allAccounts, firms,
}: {
  group: ScalingGroup
  allAccounts: Account[]
  firms: { id: string; name: string; color: string }[]
}) {
  const { updateScalingGroup, removeScalingGroup, toggleAccountInGroup } = useTradingStore()
  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState(group.name)
  const [notesDraft, setNotesDraft] = useState(group.notes ?? '')
  const [colorDraft, setColorDraft] = useState(group.color)
  const [pickerOpen, setPickerOpen] = useState(false)

  const groupAccounts = allAccounts.filter((a) => group.accountIds.includes(a.id))
  const activeAccounts = groupAccounts.filter((a) => a.status !== 'failed')
  const totalExposure = groupAccounts
    .filter((a) => a.status === 'funded' || a.status === 'evaluation')
    .reduce((sum, a) => sum + (a.accountSize ?? 0), 0)

  const firmsInGroup = useMemo(() => {
    const ids = new Set(groupAccounts.map((a) => a.firmId))
    return firms.filter((f) => ids.has(f.id))
  }, [groupAccounts, firms])

  return (
    <div className="rounded-xl border-2 p-3"
      style={{ background: group.color + '0A', borderColor: group.color + '50' }}>
      {/* Header */}
      <div className="flex items-start gap-2 mb-2">
        <div
          className="w-7 h-7 rounded-lg shrink-0 cursor-pointer hover:scale-110 transition-transform border-2"
          style={{ background: group.color + '30', borderColor: group.color }}
          onClick={() => setEditing((v) => !v)}
          title="Editar grupo"
        >
          <span className="w-full h-full flex items-center justify-center text-[10px] font-bold" style={{ color: group.color }}>
            {group.name.trim().charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => { updateScalingGroup(group.id, { name: nameDraft.trim() || group.name }); setEditing(false) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { updateScalingGroup(group.id, { name: nameDraft.trim() || group.name }); setEditing(false) }
                if (e.key === 'Escape') { setNameDraft(group.name); setEditing(false) }
              }}
              className="w-full bg-zinc-950 border-b focus:outline-none px-1 py-0.5 text-sm font-bold"
              style={{ borderColor: group.color, color: group.color }}
            />
          ) : (
            <button onClick={() => setEditing(true)}
              className="text-sm font-bold text-left truncate w-full hover:opacity-80"
              style={{ color: group.color }}>
              {group.name}
            </button>
          )}
          <p className="text-[10px] text-zinc-500 tabular-nums">
            {activeAccounts.length} {activeAccounts.length === 1 ? 'cuenta activa' : 'cuentas activas'}
            {totalExposure > 0 && <> · {fmtCompact(totalExposure)} expuesto</>}
          </p>
        </div>
        <button
          onClick={() => { if (confirm(`¿Borrar el grupo "${group.name}"? Las cuentas quedan sin grupo.`)) removeScalingGroup(group.id) }}
          className="text-zinc-600 hover:text-red-400 p-1 rounded hover:bg-zinc-900"
          title="Borrar grupo"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Color picker — when editing */}
      {editing && (
        <div className="flex flex-wrap gap-1 mb-2 p-2 bg-zinc-950 border border-zinc-800 rounded-lg">
          {PALETTE.map((c) => (
            <button key={c}
              onClick={() => { setColorDraft(c); updateScalingGroup(group.id, { color: c }) }}
              className={`w-5 h-5 rounded-full transition-transform ${colorDraft === c ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-900 scale-110' : 'hover:scale-110'}`}
              style={{ background: c }}
            />
          ))}
        </div>
      )}

      {/* Notes */}
      {editing ? (
        <input
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => updateScalingGroup(group.id, { notes: notesDraft.trim() || undefined })}
          placeholder="Nota sobre el grupo (ej: ACCs riesgo parcial)"
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-[11px] text-zinc-400 placeholder-zinc-700 focus:outline-none focus:border-zinc-600 mb-2"
        />
      ) : group.notes ? (
        <p className="text-[10px] text-zinc-500 italic mb-2">{group.notes}</p>
      ) : null}

      {/* Account chips */}
      <div className="flex flex-wrap gap-1 mb-2">
        {groupAccounts.map((a) => {
          const firm = firms.find((f) => f.id === a.firmId)
          const isFailed = a.status === 'failed'
          return (
            <span key={a.id}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border tabular-nums"
              style={{
                background: (firm?.color ?? '#52525b') + (isFailed ? '08' : '20'),
                borderColor: (firm?.color ?? '#52525b') + (isFailed ? '40' : '70'),
                color: firm?.color ?? '#a1a1aa',
                opacity: isFailed ? 0.5 : 1,
              }}
            >
              <span className="font-semibold">{a.alias}</span>
              <span className="text-[8px] opacity-70">{statusEmojiFor(a.status)}</span>
              <button
                onClick={() => toggleAccountInGroup(group.id, a.id)}
                className="opacity-50 hover:opacity-100"
                title="Quitar del grupo"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )
        })}
        {groupAccounts.length === 0 && (
          <span className="text-[10px] text-zinc-700 italic">Sin cuentas asignadas</span>
        )}
      </div>

      {/* Firms in group — summary chip row */}
      {firmsInGroup.length > 0 && (
        <p className="text-[10px] text-zinc-500 mt-1">
          Empresas: {firmsInGroup.map((f) => f.name).join(' · ')}
        </p>
      )}

      {/* Add account button */}
      <div className="mt-2 pt-2 border-t border-zinc-800/60">
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="w-full text-[11px] text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 active:bg-zinc-800 rounded px-2 py-1.5 flex items-center justify-center gap-1 transition-colors"
        >
          <Plus className="w-3 h-3" /> Asignar cuenta
        </button>

        <AnimatePresence>
          {pickerOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-2 space-y-1 max-h-48 overflow-y-auto">
                {allAccounts.length === 0 && (
                  <p className="text-[10px] text-zinc-600 italic text-center py-2">
                    No tenés cuentas. Creá una en la pestaña &quot;Cuentas&quot;.
                  </p>
                )}
                {allAccounts.map((a) => {
                  const firm = firms.find((f) => f.id === a.firmId)
                  const inThisGroup = group.accountIds.includes(a.id)
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleAccountInGroup(group.id, a.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] text-left transition-colors ${
                        inThisGroup
                          ? 'bg-zinc-800 text-zinc-100'
                          : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                      }`}
                    >
                      {inThisGroup
                        ? <Check className="w-3 h-3 shrink-0" style={{ color: group.color }} />
                        : <div className="w-3 h-3 shrink-0" />}
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: firm?.color ?? '#71717a' }} />
                      <span className="flex-1 truncate">{a.alias}</span>
                      <span className="text-[9px] text-zinc-500">{firm?.name ?? '?'} · {a.status}</span>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function UnassignedAccountsHint({
  groups, accounts,
}: { groups: ScalingGroup[]; accounts: Account[] }) {
  const assignedIds = new Set(groups.flatMap((g) => g.accountIds))
  const unassigned = accounts.filter((a) => !assignedIds.has(a.id) && a.status !== 'failed')

  if (unassigned.length === 0) return null

  return (
    <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center gap-2 text-[11px] text-zinc-500">
      <span className="text-amber-400">⚠️</span>
      <span>
        Tenés <span className="text-zinc-300 font-bold">{unassigned.length}</span> {unassigned.length === 1 ? 'cuenta' : 'cuentas'} sin grupo asignado.
        Agregá grupos arriba y asignalas para diversificar.
      </span>
    </div>
  )
}

function statusEmojiFor(status: string): string {
  switch (status) {
    case 'evaluation': return '⏳'
    case 'funded':     return '✅'
    case 'paid_out':   return '💸'
    case 'failed':     return '❌'
    default:           return '·'
  }
}
