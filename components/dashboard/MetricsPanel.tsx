'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { MetricCard } from './MetricCard'
import { METRIC_COLORS } from '@/lib/utils/constants'
import { MetricEntry } from '@/types'
import {
  Brain, Moon, AlertTriangle, Footprints,
  Sunrise, Minus, Gauge, Heart, Activity, Pencil, Check, X,
  AlarmClock,
} from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import { useHealthStore, getTodaySnapshot } from '@/lib/store/healthStore'
import { useAppStore } from '@/lib/store/appStore'
import { computeEnergyScore } from '@/lib/health/energyScore'

const METRIC_ICONS: Record<keyof MetricEntry, React.ReactNode> = {
  focus: <Brain className="w-3.5 h-3.5" />,
  energy: <Activity className="w-3.5 h-3.5" />,
  sleep: <Moon className="w-3.5 h-3.5" />,
  stress: <AlertTriangle className="w-3.5 h-3.5" />,
  steps: <Footprints className="w-3.5 h-3.5" />,
  wakeTime: <Sunrise className="w-3.5 h-3.5" />,
  sleepDebt: <Minus className="w-3.5 h-3.5" />,
  workload: <Gauge className="w-3.5 h-3.5" />,
}

// Subjective metrics — user-editable, self-reported. focus/stress/workload
// were removed (never wired). sleepDebt is now auto-computed below, so only
// wakeTime stays here as user-input.
const SUBJECTIVE_KEYS: (keyof MetricEntry)[] = [
  'wakeTime',
]

export function MetricsPanel({ compact = false }: { compact?: boolean } = {}) {
  const { t } = useTranslation()
  const snapshots = useHealthStore((s) => s.snapshots)
  const baseline = useHealthStore((s) => s.baseline)
  const hydrateFromServer = useHealthStore((s) => s.hydrateFromServer)
  const setSleepGoal = useHealthStore((s) => s.setSleepGoal)
  const metrics = useAppStore((s) => s.metrics)

  // Refresh the "now" hour every minute so Energy decays live as the day progresses
  const [now, setNow] = useState(() => new Date())
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    hydrateFromServer()
    const sync = setInterval(() => hydrateFromServer(), 5 * 60 * 1000)
    const clock = setInterval(() => setNow(new Date()), 60 * 1000)
    return () => { clearInterval(sync); clearInterval(clock) }
  }, [hydrateFromServer])

  const today = getTodaySnapshot(snapshots)
  const nowHour = mounted ? now.getHours() + now.getMinutes() / 60 : 0
  const energy = mounted ? computeEnergyScore(today, baseline, {
    nowHour,
    stepsSoFar: today?.steps,
    wakeTime: typeof metrics.wakeTime === 'string' ? metrics.wakeTime : '07:00',
    stress: typeof metrics.stress === 'number' ? metrics.stress : undefined,
    workload: typeof metrics.workload === 'number' ? metrics.workload : undefined,
  }) : null

  return (
    <div>
      <h2 className={`text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between ${compact ? 'mb-2' : 'mb-3'}`}>
        <span>{t('dashboard.metrics')}</span>
        {today?.syncedAt && (
          <span className="text-[9px] text-zinc-600 font-mono normal-case tracking-normal">
            sync · {new Date(today.syncedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </h2>
      <div className={`grid grid-cols-2 ${compact ? 'md:grid-cols-6 gap-2' : 'md:grid-cols-4 gap-3'}`}>
        {/* Auto-synced from Band → Apple Health */}
        <AutoMetricCard
          label="Energía"
          icon={<Activity className="w-3.5 h-3.5" />}
          color={energy?.color ?? '#52525b'}
          value={energy ? `${energy.score}` : '—'}
          suffix={energy ? '%' : ''}
          progress={energy?.score ?? null}
          subtitle={energy
            ? `${energy.label}${energy.breakdown.length > 0 ? ' · ' + energy.breakdown[0].replace(/^[^\s]+\s*/, '') : ''}`
            : 'Conectá tu Xiaomi Band'}
          tooltip={energy?.breakdown.join(' · ')}
        />
        <AutoMetricCard
          label="Pasos"
          icon={<Footprints className="w-3.5 h-3.5" />}
          color={METRIC_COLORS.steps}
          value={today?.steps ? today.steps.toLocaleString('es-AR') : '—'}
          subtitle={today?.steps ? `meta 10.000` : 'Sin datos hoy'}
        />
        <SleepCard
          color={METRIC_COLORS.sleep}
          sleepMinutes={today?.sleepMinutes ?? 0}
          goalMinutes={baseline.sleepGoalMinutes}
          onUpdateGoal={(g) => setSleepGoal(g)}
        />
        <AutoMetricCard
          label="FC reposo"
          icon={<Heart className="w-3.5 h-3.5" />}
          color="#f43f5e"
          value={today?.restingHR ? String(today.restingHR) : '—'}
          suffix={today?.restingHR ? ' bpm' : ''}
          subtitle={baseline.restingHR
            ? `baseline ${Math.round(baseline.restingHR)} bpm`
            : 'Necesita 14d'}
        />

        {/* Sleep debt — auto-computed from goal vs actual sleep */}
        <SleepDebtCard
          color={METRIC_COLORS.sleepDebt}
          sleepMinutes={today?.sleepMinutes ?? 0}
          goalMinutes={baseline.sleepGoalMinutes}
        />

        {/* Subjective metrics — user-editable */}
        {SUBJECTIVE_KEYS.map((key) => (
          <MetricCard
            key={key}
            metricKey={key}
            color={METRIC_COLORS[key]}
            icon={METRIC_ICONS[key]}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Auto Metric Card (read-only, no edit pencil) ─────────────────────────────

interface AutoCardProps {
  label: string
  icon: React.ReactNode
  color: string
  value: string
  suffix?: string
  subtitle?: string
  progress?: number | null
  tooltip?: string
}

// ─── Sleep Card (auto value + editable goal) ──────────────────────────────────

interface SleepCardProps {
  color: string
  sleepMinutes: number
  goalMinutes: number
  onUpdateGoal: (mins: number) => void
}

function SleepCard({ color, sleepMinutes, goalMinutes, onUpdateGoal }: SleepCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState((goalMinutes / 60).toFixed(1))

  const startEdit = () => {
    setDraft((goalMinutes / 60).toString())
    setEditing(true)
  }
  const save = () => {
    const h = parseFloat(draft)
    if (isFinite(h) && h > 0 && h <= 14) {
      onUpdateGoal(Math.round(h * 60))
    }
    setEditing(false)
  }

  const hoursStr = sleepMinutes ? (sleepMinutes / 60).toFixed(1) : '—'
  const goalH = goalMinutes / 60

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="relative bg-white/[0.03] rounded-xl p-4 border border-white/[0.08] hover:border-white/[0.12] transition-colors group"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color }}><Moon className="w-3.5 h-3.5" /></span>
        <span className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Sueño</span>
        <span className="ml-auto text-[8px] font-mono text-zinc-600 uppercase tracking-wider">auto</span>
      </div>
      <div className="mt-1">
        <span className="text-2xl font-bold tabular-nums" style={{ color }}>
          {hoursStr}
          {sleepMinutes > 0 && <span className="text-sm font-semibold opacity-70 ml-0.5">h</span>}
        </span>

        {editing ? (
          <div className="mt-2 flex items-center gap-1">
            <span className="text-[10px] text-zinc-500">meta</span>
            <input
              type="number"
              step="0.5"
              min="4"
              max="14"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
                if (e.key === 'Escape') setEditing(false)
              }}
              className="w-12 bg-zinc-800 border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-white tabular-nums focus:outline-none"
            />
            <span className="text-[10px] text-zinc-500">h</span>
            <button onClick={save} className="text-indigo-400 hover:text-indigo-300 ml-1">
              <Check className="w-3 h-3" />
            </button>
            <button onClick={() => setEditing(false)} className="text-zinc-500 hover:text-zinc-300">
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="mt-1.5 flex items-center gap-1">
            <p className="text-[10px] text-zinc-500 truncate" title={sleepMinutes > 0 ? `meta ${goalH}h` : 'Sin registro'}>
              {sleepMinutes > 0 ? `meta ${goalH}h` : 'Sin registro'}
            </p>
            <button
              onClick={startEdit}
              title="Editar meta de sueño"
              className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-zinc-300"
            >
              <Pencil className="w-2.5 h-2.5" />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}

function AutoMetricCard({ label, icon, color, value, suffix, subtitle, progress, tooltip }: AutoCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="relative bg-white/[0.03] rounded-xl p-4 border border-white/[0.08] hover:border-white/[0.12] transition-colors"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
      title={tooltip}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-xs text-zinc-400 font-medium uppercase tracking-wider">{label}</span>
        <span className="ml-auto text-[8px] font-mono text-zinc-600 uppercase tracking-wider">auto</span>
      </div>
      <div className="mt-1">
        <span className="text-2xl font-bold tabular-nums" style={{ color }}>
          {value}
          {suffix && <span className="text-sm font-semibold opacity-70 ml-0.5">{suffix}</span>}
        </span>
        {typeof progress === 'number' && (
          <div className="mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ backgroundColor: color }}
            />
          </div>
        )}
        {subtitle && (
          <p className="mt-1.5 text-[10px] text-zinc-500 truncate" title={subtitle}>{subtitle}</p>
        )}
      </div>
    </motion.div>
  )
}

// ─── Sleep Debt Card (auto, computed from goal − today's actual sleep) ────────

interface SleepDebtCardProps {
  color: string
  sleepMinutes: number
  goalMinutes: number
}

function SleepDebtCard({ color, sleepMinutes, goalMinutes }: SleepDebtCardProps) {
  // Debt = how much less you slept than your goal. Surplus is shown as 0.
  // Only meaningful when there's actual sleep data; otherwise show em-dash.
  const hasData = sleepMinutes > 0
  const debtMinutes = hasData ? Math.max(0, goalMinutes - sleepMinutes) : 0
  const debtHours = (debtMinutes / 60).toFixed(1)
  const goalH = (goalMinutes / 60).toFixed(1)
  const sleptH = (sleepMinutes / 60).toFixed(1)

  // Color logic: green if no debt, amber if mild (<1h), red if heavy (>=1h)
  const tone = !hasData
    ? color
    : debtMinutes === 0
      ? '#10b981'
      : debtMinutes < 60
        ? '#f59e0b'
        : '#ef4444'

  const subtitle = hasData
    ? debtMinutes === 0
      ? `meta ${goalH}h · dormiste ${sleptH}h`
      : `meta ${goalH}h · dormiste ${sleptH}h`
    : 'Sin registro de sueño hoy'

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="relative bg-white/[0.03] rounded-xl p-4 border border-white/[0.08] hover:border-white/[0.12] transition-colors"
      style={{ borderLeftColor: tone, borderLeftWidth: 3 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: tone }}><AlarmClock className="w-3.5 h-3.5" /></span>
        <span className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Déficit Sueño</span>
        <span className="ml-auto text-[8px] font-mono text-zinc-600 uppercase tracking-wider">auto</span>
      </div>
      <div className="mt-1">
        <span className="text-2xl font-bold tabular-nums" style={{ color: tone }}>
          {hasData ? debtHours : '—'}
          {hasData && <span className="text-sm font-semibold opacity-70 ml-0.5">h</span>}
        </span>
        <p className="mt-1.5 text-[10px] text-zinc-500 truncate" title={subtitle}>{subtitle}</p>
      </div>
    </motion.div>
  )
}
