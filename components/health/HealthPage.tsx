'use client'
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Activity, Footprints, Moon, Heart, RefreshCw, Settings
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { useHealthStore, getRangeSnapshots, getTodaySnapshot, type HealthSnapshot } from '@/lib/store/healthStore'
import { computeEnergyScore } from '@/lib/health/energyScore'
import { useTranslation } from '@/hooks/useTranslation'

const R = 56
const C = 2 * Math.PI * R

export function HealthPage() {
  const { t, locale } = useTranslation()
  const snapshots = useHealthStore((s) => s.snapshots)
  const baseline = useHealthStore((s) => s.baseline)
  const setSleepGoal = useHealthStore((s) => s.setSleepGoal)
  const hydrateFromServer = useHealthStore((s) => s.hydrateFromServer)
  const lastSyncAt = useHealthStore((s) => s.lastSyncAt)

  const [syncing, setSyncing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    hydrateFromServer()
  }, [hydrateFromServer])

  const today = getTodaySnapshot(snapshots)
  const last90 = useMemo(() => getRangeSnapshots(snapshots, 90), [snapshots])
  const last30 = useMemo(() => getRangeSnapshots(snapshots, 30), [snapshots])
  const energy = computeEnergyScore(today, baseline)

  const onSync = async () => {
    setSyncing(true)
    await hydrateFromServer()
    setTimeout(() => setSyncing(false), 400)
  }

  // Build energy series for charts
  const energySeries = useMemo(() =>
    last30.map((s) => ({
      date: s.date.slice(5),
      energy: computeEnergyScore(s, baseline)?.score ?? null,
      sleep: s.sleepMinutes ? +(s.sleepMinutes / 60).toFixed(1) : null,
      hrv: s.hrv ?? null,
    })),
    [last30, baseline]
  )

  if (!mounted) {
    return <div className="p-6"><div className="h-8 w-48 bg-zinc-900 rounded animate-pulse" /></div>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('health.title')}</h1>
          <p className="text-sm text-zinc-500">
            Xiaomi Band 10 · Apple Health · {lastSyncAt
              ? `${t('health.lastSync')} ${new Date(lastSyncAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`
              : t('health.notSynced')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(s => !s)}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={onSync}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {t('health.syncNow')}
          </button>
        </div>
      </div>

      {/* Settings */}
      {showSettings && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Ajustes</h3>
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-300">Meta de sueño:</label>
            <input
              type="number"
              min={4}
              max={12}
              step={0.25}
              defaultValue={(baseline.sleepGoalMinutes / 60).toFixed(2)}
              onBlur={(e) => setSleepGoal(Math.round(parseFloat(e.target.value) * 60))}
              className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white"
            />
            <span className="text-sm text-zinc-500">horas</span>
          </div>
        </div>
      )}

      {/* Hero: Energy ring */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 items-center">
        <div className="flex justify-center md:justify-start">
          <EnergyRing score={energy?.score ?? null} color={energy?.color ?? '#52525b'} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 font-mono">Today's Energy</p>
          <p className="text-3xl font-bold text-white mt-1">
            {energy ? energy.label : 'Sin datos'}
          </p>
          <p className="text-sm text-zinc-400 mt-2">{energy?.reason ?? 'Sincronizá tu reloj para empezar a puntuar.'}</p>
          {energy && (
            <div className="mt-4 grid grid-cols-3 gap-3 max-w-md">
              {energy.components.hrv !== undefined && (
                <ComponentChip label="HRV" value={Math.round(energy.components.hrv)} />
              )}
              {energy.components.sleepRecovery !== undefined && (
                <ComponentChip label="Sueño" value={Math.round(energy.components.sleepRecovery)} />
              )}
              {energy.components.rhr !== undefined && (
                <ComponentChip label="FC Reposo" value={Math.round(energy.components.rhr)} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Today summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile
          icon={<Activity className="w-4 h-4" />}
          label="Energy" color={energy?.color ?? '#52525b'}
          value={energy ? `${energy.score}` : '—'} unit={energy ? '%' : ''}
          delta={null}
        />
        <Tile
          icon={<Footprints className="w-4 h-4" />}
          label="Steps" color="#10b981"
          value={today?.steps?.toLocaleString('es-AR') ?? '—'} unit=""
          delta={null}
        />
        <Tile
          icon={<Moon className="w-4 h-4" />}
          label="Sleep" color="#3b82f6"
          value={today?.sleepMinutes ? (today.sleepMinutes / 60).toFixed(1) : '—'}
          unit={today?.sleepMinutes ? 'h' : ''}
          delta={today?.sleepMinutes
            ? (today.sleepMinutes - baseline.sleepGoalMinutes) / 60
            : null}
        />
        <Tile
          icon={<Heart className="w-4 h-4" />}
          label="Resting HR" color="#f43f5e"
          value={today?.restingHR ? String(today.restingHR) : '—'}
          unit={today?.restingHR ? 'bpm' : ''}
          delta={today?.restingHR && baseline.restingHR
            ? today.restingHR - baseline.restingHR
            : null}
          invertDelta
        />
      </div>

      {/* Sleep heatmap */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Moon className="w-3.5 h-3.5" /> Sleep Map · últimas 12 semanas
        </h2>
        <SleepHeatmap snapshots={last90} sleepGoal={baseline.sleepGoalMinutes} />
        <div className="flex items-center gap-2 mt-3 text-[10px] text-zinc-500">
          <span>Menos</span>
          <div className="w-3 h-3 rounded-sm bg-zinc-800" />
          <div className="w-3 h-3 rounded-sm" style={{ background: '#1e3a5f' }} />
          <div className="w-3 h-3 rounded-sm" style={{ background: '#2563eb' }} />
          <div className="w-3 h-3 rounded-sm" style={{ background: '#3b82f6' }} />
          <div className="w-3 h-3 rounded-sm" style={{ background: '#60a5fa' }} />
          <span>Más</span>
        </div>
      </section>

      {/* Trends */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4">
          Tendencias · 30 días
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ChartCard title="Energy" color="#10b981" data={energySeries} dataKey="energy" unit="%" />
          <ChartCard title="Sleep" color="#3b82f6" data={energySeries} dataKey="sleep" unit="h" />
          <ChartCard title="HRV" color="#a855f7" data={energySeries} dataKey="hrv" unit="ms" />
        </div>
      </section>

      {/* History table */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4">
          Historial
        </h2>
        <HistoryTable snapshots={last90} baseline={baseline} />
      </section>
    </motion.div>
  )
}

// ─── Energy Ring ──────────────────────────────────────────────────────────────

function EnergyRing({ score, color }: { score: number | null; color: string }) {
  const pct = score ?? 0
  const offset = C * (1 - pct / 100)
  return (
    <div className="relative" style={{ width: 180, height: 180 }}>
      <svg viewBox="0 0 140 140" width="180" height="180">
        <defs>
          <filter id="energy-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        <circle cx="70" cy="70" r={R} fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={score === null ? C : offset}
          transform="rotate(-90 70 70)"
          filter="url(#energy-glow)"
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1), stroke 0.5s' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-4xl font-extrabold tabular-nums" style={{ color, letterSpacing: '-0.03em' }}>
          {score ?? '—'}
        </span>
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mt-1">Energy</span>
      </div>
    </div>
  )
}

// ─── Component Chip ───────────────────────────────────────────────────────────

function ComponentChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-zinc-800/60 rounded-lg px-3 py-2">
      <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold text-white tabular-nums mt-0.5">{value}</p>
    </div>
  )
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

interface TileProps {
  icon: React.ReactNode
  label: string
  color: string
  value: string
  unit: string
  delta: number | null
  invertDelta?: boolean
}
function Tile({ icon, label, color, value, unit, delta, invertDelta }: TileProps) {
  const positive = delta !== null && (invertDelta ? delta < 0 : delta > 0)
  const negative = delta !== null && (invertDelta ? delta > 0 : delta < 0)
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}>
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</span>
        {unit && <span className="text-xs font-semibold text-zinc-500">{unit}</span>}
      </div>
      {delta !== null && (
        <p className={`text-[10px] font-mono mt-1 ${positive ? 'text-emerald-400' : negative ? 'text-red-400' : 'text-zinc-500'}`}>
          {delta > 0 ? '+' : ''}{delta.toFixed(unit === 'h' ? 1 : 0)} vs baseline
        </p>
      )}
    </div>
  )
}

// ─── Sleep Heatmap ────────────────────────────────────────────────────────────

function SleepHeatmap({ snapshots, sleepGoal }: { snapshots: HealthSnapshot[]; sleepGoal: number }) {
  // Build a map by date for quick lookup
  const byDate = new Map<string, HealthSnapshot>()
  snapshots.forEach((s) => byDate.set(s.date, s))

  // 12 weeks ending today, columns = weeks, rows = days (Mon-Sun)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weeks: { date: string; snapshot?: HealthSnapshot }[][] = []

  // Find Monday of current week
  const dow = (today.getDay() + 6) % 7 // 0=Mon
  const monday = new Date(today.getTime() - dow * 86400000)

  for (let w = 11; w >= 0; w--) {
    const col: { date: string; snapshot?: HealthSnapshot }[] = []
    for (let d = 0; d < 7; d++) {
      const dt = new Date(monday.getTime() - w * 7 * 86400000 + d * 86400000)
      const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      col.push({ date: dateStr, snapshot: byDate.get(dateStr) })
    }
    weeks.push(col)
  }

  function colorFor(s: HealthSnapshot | undefined): string {
    if (!s || !s.sleepMinutes) return '#27272a'
    const ratio = s.sleepMinutes / sleepGoal
    if (ratio < 0.6) return '#1e3a5f'
    if (ratio < 0.8) return '#2563eb'
    if (ratio < 0.95) return '#3b82f6'
    return '#60a5fa'
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1 min-w-max">
        {weeks.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-1">
            {col.map(({ date, snapshot }) => {
              const hrs = snapshot?.sleepMinutes ? (snapshot.sleepMinutes / 60).toFixed(1) : '0'
              return (
                <div
                  key={date}
                  className="w-3 h-3 rounded-sm hover:ring-2 hover:ring-white/30 transition-all cursor-pointer"
                  style={{ background: colorFor(snapshot) }}
                  title={`${date} · ${hrs}h`}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Chart Card ───────────────────────────────────────────────────────────────

interface ChartCardProps {
  title: string
  color: string
  data: { date: string; [k: string]: number | string | null }[]
  dataKey: string
  unit: string
}
function ChartCard({ title, color, data, dataKey, unit }: ChartCardProps) {
  const hasData = data.some((d) => d[dataKey] !== null && d[dataKey] !== undefined)
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
      <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-2">{title}</p>
      <div style={{ width: '100%', height: 120 }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#52525b' }} />
              <YAxis tick={{ fontSize: 9, fill: '#52525b' }} width={28} />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
                formatter={(v) => [`${v}${unit}`, title] as [string, string]}
              />
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={2}
                dot={{ r: 2, fill: color }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-[10px] text-zinc-600">
            Sin datos
          </div>
        )}
      </div>
    </div>
  )
}

// ─── History Table ────────────────────────────────────────────────────────────

function HistoryTable({ snapshots, baseline }: { snapshots: HealthSnapshot[]; baseline: ReturnType<typeof useHealthStore.getState>['baseline'] }) {
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 14
  const sorted = [...snapshots].sort((a, b) => b.date.localeCompare(a.date))
  const slice = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)

  if (sorted.length === 0) {
    return <p className="text-sm text-zinc-500">Aún no hay datos. Configurá el iOS Shortcut para empezar.</p>
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-zinc-500 font-mono tracking-wider">
              <th className="pb-2 font-semibold">Fecha</th>
              <th className="pb-2 font-semibold text-right">Steps</th>
              <th className="pb-2 font-semibold text-right">Sleep</th>
              <th className="pb-2 font-semibold text-right">RHR</th>
              <th className="pb-2 font-semibold text-right">HRV</th>
              <th className="pb-2 font-semibold text-right">Energy</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((s) => {
              const e = computeEnergyScore(s, baseline)
              return (
                <tr key={s.date} className="border-t border-zinc-800/60">
                  <td className="py-2 text-zinc-300 font-mono text-xs">{s.date}</td>
                  <td className="py-2 text-right text-zinc-300 tabular-nums">{s.steps?.toLocaleString('es-AR') ?? '—'}</td>
                  <td className="py-2 text-right text-zinc-300 tabular-nums">{s.sleepMinutes ? `${(s.sleepMinutes / 60).toFixed(1)}h` : '—'}</td>
                  <td className="py-2 text-right text-zinc-300 tabular-nums">{s.restingHR ?? '—'}</td>
                  <td className="py-2 text-right text-zinc-300 tabular-nums">{s.hrv ?? '—'}</td>
                  <td className="py-2 text-right font-semibold tabular-nums" style={{ color: e?.color }}>
                    {e?.score ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs text-zinc-500">
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
            className="px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-30">← Anterior</button>
          <span>{page + 1} / {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
            className="px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-30">Siguiente →</button>
        </div>
      )}
    </div>
  )
}
