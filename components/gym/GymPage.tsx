'use client'
import { useState, useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts'
import {
  Dumbbell, Play, Square, Plus, Trash2, ChevronDown, ChevronRight,
  Clock, Zap, Target, BarChart3, X, Scale, Edit3, ArrowRight, Sparkles,
  Home, Building2, TrendingUp, TrendingDown, Minus, Trophy, CalendarDays,
} from 'lucide-react'
import {
  useGymStore, type WorkoutSession, type GymType, type GymRoutine, type WeightEntry,
  type TrainingPhase, analyzeExercise, uniqueRoutineExercises,
} from '@/lib/store/gymStore'
import { useHealthStore } from '@/lib/store/healthStore'
import { TrainingDistribution } from './TrainingDistribution'
import { useTranslation } from '@/hooks/useTranslation'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtKg(n: number) { return `${n.toFixed(1)} kg` }
function fmtDelta(n: number) {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)} kg`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type GymTab = 'sesiones' | 'distribucion' | 'rutinas' | 'peso' | 'progresion'

const GYM_TAB_META: Record<GymTab, { Icon: typeof Dumbbell; key: string }> = {
  sesiones:     { Icon: Dumbbell,     key: 'sessions' },
  distribucion: { Icon: CalendarDays, key: 'distribution' },
  rutinas:      { Icon: BarChart3,    key: 'routines' },
  peso:         { Icon: Scale,        key: 'weight' },
  progresion:   { Icon: TrendingUp,   key: 'progression' },
}

export function GymPage() {
  const [tab, setTab] = useState<GymTab>('sesiones')
  const { t } = useTranslation()

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-amber-400" />
            {t('gym.title')}
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">{t('gym.subtitle')}</p>
        </div>
        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
          {(Object.keys(GYM_TAB_META) as GymTab[]).map((tabId) => {
            const { Icon, key } = GYM_TAB_META[tabId]
            const label = t(`gym.tabs.${key}`)
            return (
              <button key={tabId} onClick={() => setTab(tabId)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  tab === tabId ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-200'
                }`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* SESIONES — main tab: weight widget + coach + sessions */}
      {tab === 'sesiones' && (
        <>
          <WeightWidget />
          <CoachCard />
          <SessionManager />
          <SessionHistory />
        </>
      )}

      {/* DISTRIBUCIÓN — plan semanal por categoría (gym/run/bike/dep/cali) */}
      {tab === 'distribucion' && (
        <>
          <TrainingDistribution />
        </>
      )}

      {/* RUTINAS */}
      {tab === 'rutinas' && (
        <>
          <RoutineEditor />
        </>
      )}

      {/* PESO — full weight tracker */}
      {tab === 'peso' && (
        <>
          <BodyWeightCard />
        </>
      )}

      {/* PROGRESIÓN */}
      {tab === 'progresion' && (
        <>
          <ExerciseProgressionPanel />
        </>
      )}
    </motion.div>
  )
}

// ─── Compact weight widget (shown in main "sesiones" tab) ────────────────────

function WeightWidget() {
  const { weightEntries, weightGoalKg, addWeightEntry } = useGymStore()
  const sorted = useMemo(() => [...weightEntries].sort((a, b) => a.date.localeCompare(b.date)), [weightEntries])
  const latest = sorted[sorted.length - 1]
  const sevenAgo = sorted.length > 1 ? sorted[Math.max(0, sorted.length - 8)] : null
  const delta7 = (latest && sevenAgo) ? latest.kg - sevenAgo.kg : null

  const today = todayStr()
  const todayEntry = weightEntries.find((e) => e.date === today)
  const [showInput, setShowInput] = useState(false)
  const [draft, setDraft] = useState('')

  const save = () => {
    const n = parseFloat(draft)
    if (!isFinite(n) || n <= 0) { setShowInput(false); setDraft(''); return }
    addWeightEntry(n)
    setDraft('')
    setShowInput(false)
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Scale className="w-5 h-5 text-emerald-400" />
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Peso</p>
            <p className="text-2xl font-extrabold text-white tabular-nums">
              {latest ? latest.kg.toFixed(1) : '—'}
              <span className="text-sm font-bold text-zinc-500 ml-1">kg</span>
            </p>
          </div>
        </div>
        <div className="text-right">
          {delta7 !== null && (
            <p className={`text-sm font-bold ${delta7 > 0 ? 'text-amber-400' : delta7 < 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {delta7 > 0 ? '↑' : delta7 < 0 ? '↓' : '·'} {fmtDelta(delta7)}
              <span className="text-[10px] text-zinc-500 ml-1 font-mono">7d</span>
            </p>
          )}
          {weightGoalKg !== null && (
            <p className="text-[10px] font-mono text-zinc-500">meta {weightGoalKg.toFixed(1)} kg</p>
          )}
        </div>
      </div>

      {/* Quick-log row */}
      <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center gap-2">
        {showInput ? (
          <>
            <input
              autoFocus
              type="number" step="0.1" inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
                if (e.key === 'Escape') { setShowInput(false); setDraft('') }
              }}
              placeholder={`peso de hoy (${today})`}
              className="flex-1 bg-zinc-800 border border-emerald-500 rounded-lg px-3 py-1.5 text-sm text-white tabular-nums focus:outline-none"
            />
            <span className="text-xs text-zinc-500">kg</span>
            <button onClick={save}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold">
              Guardar
            </button>
            <button onClick={() => { setShowInput(false); setDraft('') }}
              className="text-zinc-500 hover:text-zinc-300">
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            onClick={() => { setDraft(todayEntry ? String(todayEntry.kg) : ''); setShowInput(true) }}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 text-sm font-bold transition-all"
          >
            {todayEntry
              ? <><Edit3 className="w-3.5 h-3.5" /> Editar peso de hoy ({todayEntry.kg.toFixed(1)} kg)</>
              : <><Plus className="w-3.5 h-3.5" /> Registrar peso de hoy</>}
          </button>
        )}
      </div>

      <p className="text-[10px] text-zinc-600 mt-2 text-center">o andá al tab <span className="text-zinc-400">Peso</span> para ver tendencia completa</p>
    </section>
  )
}

// ─── Body Weight Card ─────────────────────────────────────────────────────────

function BodyWeightCard() {
  const { weightEntries, weightGoalKg, phase, addWeightEntry, removeWeightEntry, setWeightGoal, setPhase } = useGymStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftNote, setDraftNote] = useState('')
  const [showGoalEdit, setShowGoalEdit] = useState(false)
  const [goalDraft, setGoalDraft] = useState('')

  const today = todayStr()
  const todayEntry = weightEntries.find((e) => e.date === today)

  // Sorted ascending by date for chart
  const sorted = useMemo(() => [...weightEntries].sort((a, b) => a.date.localeCompare(b.date)), [weightEntries])
  const last30 = useMemo(() => sorted.slice(-30), [sorted])

  // 7-day average series
  const series = useMemo(() => last30.map((e, i) => {
    const window = last30.slice(Math.max(0, i - 6), i + 1)
    const avg = window.reduce((a, b) => a + b.kg, 0) / window.length
    return {
      date: e.date.slice(5),
      daily: e.kg,
      avg: Math.round(avg * 10) / 10,
    }
  }), [last30])

  // 7-day delta
  const latest = sorted[sorted.length - 1]?.kg ?? null
  const sevenAgo = sorted.length > 1
    ? sorted[Math.max(0, sorted.length - 8)]?.kg
    : null
  const delta7 = (latest !== null && sevenAgo !== null && sevenAgo !== undefined) ? latest - sevenAgo : null
  const dailyAvgChange = sorted.length > 1 && delta7 !== null ? delta7 / Math.min(7, sorted.length - 1) : null

  // Composition estimate (very rough):
  // - assumes 0.05 kg/wk muscle gain possible if surplus
  // - rest is fat
  const composition = useMemo(() => {
    if (delta7 === null) return null
    const days = Math.min(7, sorted.length - 1)
    if (days < 2) return null
    const weeklyChange = delta7 * (7 / days)
    let muscleEst = 0
    let fatEst = 0
    if (weeklyChange > 0) {
      muscleEst = Math.min(0.3, Math.max(0, weeklyChange * 0.3))
      fatEst = weeklyChange - muscleEst
    } else {
      muscleEst = weeklyChange * 0.1
      fatEst = weeklyChange - muscleEst
    }
    return {
      weeklyChange,
      muscleKg: muscleEst,
      fatKg: fatEst,
      mostlyMuscle: Math.abs(muscleEst) > Math.abs(fatEst),
    }
  }, [delta7, sorted.length])

  const handleLog = () => {
    const n = parseFloat(draft)
    if (!isFinite(n) || n <= 0) return
    addWeightEntry(n, draftNote.trim() || undefined)
    setDraft('')
    setDraftNote('')
    setEditing(false)
  }

  const startEditToday = () => {
    setDraft(todayEntry ? String(todayEntry.kg) : '')
    setDraftNote(todayEntry?.note ?? '')
    setEditing(true)
  }

  const saveGoal = () => {
    const n = parseFloat(goalDraft)
    setWeightGoal(isFinite(n) && n > 0 ? n : null)
    setShowGoalEdit(false)
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
          <Scale className="w-3.5 h-3.5" /> Peso
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Phase selector — drives coach recommendations */}
          <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
            {(['cut','maintenance','bulk'] as TrainingPhase[]).map((p) => {
              const label = p === 'cut' ? '↓ Cut' : p === 'bulk' ? '↑ Bulk' : '= Mantener'
              const color = p === 'cut' ? '#10b981' : p === 'bulk' ? '#6366f1' : '#f59e0b'
              const active = phase === p
              return (
                <button key={p} onClick={() => setPhase(p)}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                    active ? 'text-white' : 'text-zinc-500 hover:text-zinc-200'
                  }`}
                  style={active ? { background: color + '25', color } : {}}>
                  {label}
                </button>
              )
            })}
          </div>
          {weightGoalKg !== null && (
            <span className="text-[10px] font-mono text-zinc-500">
              meta · <span className="text-emerald-400 font-bold">{fmtKg(weightGoalKg)}</span>
            </span>
          )}
          <button onClick={() => { setGoalDraft(weightGoalKg?.toString() ?? ''); setShowGoalEdit((v) => !v) }}
            className="text-[10px] text-zinc-500 hover:text-zinc-300">
            {weightGoalKg === null ? 'Definir meta' : 'Cambiar meta'}
          </button>
        </div>
      </div>

      {showGoalEdit && (
        <div className="flex items-center gap-2 mb-3">
          <input type="number" step="0.1" value={goalDraft} onChange={(e) => setGoalDraft(e.target.value)}
            placeholder="ej. 165"
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
          <button onClick={saveGoal} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold">
            OK
          </button>
          <button onClick={() => setShowGoalEdit(false)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancelar</button>
        </div>
      )}

      {/* Big number */}
      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-5xl font-extrabold text-white tabular-nums" style={{ letterSpacing: '-0.04em' }}>
          {latest !== null ? latest.toFixed(1) : '—'}
        </span>
        <span className="text-base font-bold text-zinc-500">kg</span>
        {delta7 !== null && (
          <span className={`text-sm font-bold ml-2 ${delta7 > 0 ? 'text-amber-400' : delta7 < 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
            {delta7 > 0 ? '↑' : delta7 < 0 ? '↓' : '·'} {fmtDelta(Math.abs(delta7) * (delta7 < 0 ? -1 : 1))} · últimos 7d
          </span>
        )}
      </div>

      {/* Chart */}
      {series.length > 1 ? (
        <div style={{ width: '100%', height: 160 }} className="mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#52525b' }} />
              <YAxis domain={['dataMin - 0.5', 'dataMax + 0.5']} tick={{ fontSize: 9, fill: '#52525b' }} width={32} />
              <Tooltip contentStyle={{ background: 'var(--surface-popover)', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }} />
              {weightGoalKg !== null && (
                <ReferenceLine y={weightGoalKg} stroke="#10b981" strokeDasharray="4 4" strokeWidth={1.5}
                  label={{ value: 'meta', fill: '#10b981', fontSize: 9, position: 'right' }} />
              )}
              <Line type="monotone" dataKey="daily" stroke="#71717a" strokeWidth={1} strokeDasharray="3 3" dot={{ r: 2, fill: '#71717a' }} />
              <Line type="monotone" dataKey="avg" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[120px] flex items-center justify-center text-xs text-zinc-600 border border-dashed border-zinc-800 rounded-lg mt-3">
          {sorted.length === 0 ? 'Sin entradas — cargá tu primer peso abajo' : 'Necesitás al menos 2 entradas para ver tendencia'}
        </div>
      )}

      <div className="flex items-center justify-center gap-5 mt-2 text-[10px] font-mono text-zinc-500">
        <span>{sorted.length} entradas</span>
        <span>•</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-px bg-emerald-500" />Promedio 7d</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-zinc-500" />Diario</span>
      </div>

      {/* Composition estimate */}
      {composition && (
        <div className="mt-4 bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Estimación de composición</p>
            <span className="text-[10px] font-mono text-zinc-600">últimos 7d</span>
          </div>
          <p className="text-sm font-bold mb-2" style={{ color: composition.weeklyChange > 0 ? '#f59e0b' : composition.weeklyChange < 0 ? '#10b981' : '#71717a' }}>
            {fmtDelta(composition.weeklyChange)} / semana — {composition.mostlyMuscle && composition.weeklyChange > 0 ? 'crecimiento limpio' :
              composition.weeklyChange > 0 ? 'mostly fat' :
              composition.weeklyChange < -0.3 ? 'pérdida rápida — cuidado' : 'déficit controlado'}
          </p>
          {/* Visual bar */}
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden flex">
            {composition.weeklyChange > 0 ? (
              <>
                <div style={{ width: `${Math.min(40, Math.abs(composition.muscleKg / composition.weeklyChange) * 100)}%`, background: '#10b981' }} />
                <div style={{ width: `${Math.min(100, Math.abs(composition.fatKg / composition.weeklyChange) * 100)}%`, background: '#f59e0b' }} />
              </>
            ) : (
              <div style={{ width: '100%', background: '#10b981' }} />
            )}
          </div>
          <p className="text-[10px] text-zinc-500 mt-1.5">
            ~{composition.muscleKg.toFixed(2)} kg músculo · ~{composition.fatKg.toFixed(2)} kg grasa
            {dailyAvgChange !== null && ` · ${dailyAvgChange > 0 ? '+' : ''}${dailyAvgChange.toFixed(2)} kg/día`}
          </p>
        </div>
      )}

      {/* Log today */}
      <div className="mt-4 flex items-center justify-between bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${todayEntry ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-600'}`}>
            {todayEntry ? '✓' : <Scale className="w-4 h-4" />}
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              {todayEntry ? 'Logueado hoy' : 'Aún sin registrar hoy'}
            </p>
            <p className="text-sm font-bold text-white tabular-nums">
              {todayEntry ? `${todayEntry.kg.toFixed(1)} kg` : '—'}
            </p>
          </div>
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <input type="number" step="0.1" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLog(); if (e.key === 'Escape') setEditing(false) }}
              placeholder="kg"
              className="w-20 bg-zinc-800 border border-emerald-500 rounded-lg px-2 py-1.5 text-sm text-white text-right tabular-nums focus:outline-none" />
            <button onClick={handleLog}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold">
              Guardar
            </button>
            <button onClick={() => setEditing(false)} className="text-zinc-500 hover:text-zinc-300">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button onClick={startEditToday}
            className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold flex items-center gap-1.5">
            <Edit3 className="w-3 h-3" /> {todayEntry ? 'Editar' : 'Registrar'}
          </button>
        )}
      </div>

      {/* Recent entries (collapsed by default) */}
      {sorted.length > 0 && (
        <RecentWeightEntries entries={[...sorted].reverse().slice(0, 10)} onDelete={removeWeightEntry} />
      )}
    </section>
  )
}

function RecentWeightEntries({ entries, onDelete }: { entries: WeightEntry[]; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-500 hover:text-zinc-300 py-1">
        <span>Entradas recientes · {entries.length}</span>
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-zinc-800/40 text-xs group">
              <span className="text-zinc-500 font-mono">{e.date}</span>
              <span className="text-zinc-300 tabular-nums">{e.kg.toFixed(1)} kg</span>
              <button onClick={() => onDelete(e.id)} className="text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Coach Card ───────────────────────────────────────────────────────────────

function CoachCard() {
  const { weightEntries, weightGoalKg, sessions } = useGymStore()
  const healthSnapshots = useHealthStore((s) => s.snapshots)

  const today = todayStr()
  const todayHealth = healthSnapshots[today]

  const sortedWeights = useMemo(() => [...weightEntries].sort((a, b) => a.date.localeCompare(b.date)), [weightEntries])
  const latest = sortedWeights[sortedWeights.length - 1]
  const sevenAgo = sortedWeights.length > 1 ? sortedWeights[Math.max(0, sortedWeights.length - 8)] : null
  const delta7 = (latest && sevenAgo) ? latest.kg - sevenAgo.kg : null

  // Last session
  const lastSession = sessions[0]
  const daysSinceLast = lastSession
    ? Math.floor((Date.now() - new Date(lastSession.startedAt).getTime()) / 86400000)
    : null

  // Compose recommendations
  const recs: { kind: 'rest' | 'go' | 'caution' | 'goal' | 'deload' | 'info'; text: string }[] = []

  // Recovery-based rest day
  if (todayHealth) {
    const sleep = todayHealth.sleepMinutes ?? 0
    const sleepH = sleep / 60
    if (sleep > 0 && sleepH < 6) {
      recs.push({ kind: 'rest', text: `⚠ Dormiste sólo ${sleepH.toFixed(1)}h. Hoy te recomiendo descanso o sesión técnica suave.` })
    } else if (sleep > 0 && sleepH >= 7.5) {
      recs.push({ kind: 'go', text: `✓ ${sleepH.toFixed(1)}h de sueño — recuperación sólida. Buen día para forzar peso.` })
    }
    if (todayHealth.restingHR && todayHealth.restingHR > 0) {
      // No baseline yet; just note it
    }
  }

  // Weight trend vs goal
  if (delta7 !== null && weightGoalKg !== null && latest) {
    const distance = latest.kg - weightGoalKg
    if (Math.abs(distance) < 0.5) {
      recs.push({ kind: 'goal', text: `🎯 Estás casi en tu meta de ${weightGoalKg} kg. Mantenimiento.` })
    } else if (distance > 0 && delta7 > 0) {
      recs.push({ kind: 'caution', text: `↑ Subiste ${fmtDelta(delta7)} y tu meta es bajar. Revisar déficit calórico.` })
    } else if (distance > 0 && delta7 < -0.2) {
      recs.push({ kind: 'go', text: `↓ Vas bajando ${fmtDelta(delta7)}/sem — te quedan ${distance.toFixed(1)} kg para la meta.` })
    } else if (distance < 0 && delta7 > 0.2) {
      recs.push({ kind: 'go', text: `↑ Vas subiendo ${fmtDelta(delta7)}/sem hacia tu meta de volumen (+${Math.abs(distance).toFixed(1)} kg restantes).` })
    }
  }

  // Deload suggestion: 4+ sessions this week
  const sessionsLast7d = sessions.filter((s) => {
    const t = new Date(s.startedAt).getTime()
    return Date.now() - t < 7 * 86400000
  }).length
  if (sessionsLast7d >= 5) {
    recs.push({ kind: 'deload', text: `🔁 ${sessionsLast7d} sesiones en 7 días — semana de descarga sería ideal. Bajá 20% el volumen.` })
  }

  // Days since last session
  if (daysSinceLast !== null && daysSinceLast >= 3) {
    recs.push({ kind: 'info', text: `📅 Pasaron ${daysSinceLast} días desde la última sesión. Hora de volver.` })
  }

  // Progressive overload nudge
  if (lastSession && lastSession.exercises.length > 0) {
    const lastEx = lastSession.exercises[0]
    if (lastEx.sets.length >= 3) {
      const maxReps = Math.max(...lastEx.sets.map((s) => s.reps))
      const maxW = Math.max(...lastEx.sets.map((s) => s.weight))
      if (maxReps >= 10) {
        recs.push({ kind: 'go', text: `💪 En "${lastEx.name}" llegaste a ${maxReps} reps con ${maxW}kg. Subí 2.5kg la próxima.` })
      }
    }
  }

  if (recs.length === 0) {
    recs.push({ kind: 'info', text: 'Sin datos suficientes todavía. Cargá tu peso de hoy y empezá una sesión.' })
  }

  const kindStyles: Record<typeof recs[0]['kind'], { bg: string; border: string; text: string }> = {
    rest:    { bg: 'bg-red-500/10',     border: 'border-red-500/30',     text: 'text-red-300' },
    go:      { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300' },
    caution: { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-300' },
    goal:    { bg: 'bg-indigo-500/10',  border: 'border-indigo-500/30',  text: 'text-indigo-300' },
    deload:  { bg: 'bg-purple-500/10',  border: 'border-purple-500/30',  text: 'text-purple-300' },
    info:    { bg: 'bg-zinc-800/40',    border: 'border-zinc-700',       text: 'text-zinc-300' },
  }

  return (
    <section className="bg-gradient-to-br from-indigo-500/8 via-zinc-900 to-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Coach
      </h2>
      <div className="space-y-2">
        {recs.map((r, i) => {
          const s = kindStyles[r.kind]
          return (
            <div key={i} className={`${s.bg} border ${s.border} rounded-xl px-3 py-2 text-sm ${s.text}`}>
              {r.text}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Session Manager (Progressive Overload Coach) ─────────────────────────────

function SessionManager() {
  const {
    routines, activeSession, currentExerciseName,
    gymType, setGymType,
    startSession, endSession, cancelSession, setCurrentExercise, addExerciseToSession,
  } = useGymStore()

  const [pendingPickRoutine, setPendingPickRoutine] = useState(false)
  const [pickedRoutineId, setPickedRoutineId] = useState<string | null>(null)
  const [addExerciseOpen, setAddExerciseOpen] = useState(false)

  const activeRoutine = activeSession?.routineId
    ? routines.find((r) => r.id === activeSession.routineId)
    : null

  const handleStart = () => {
    if (routines.length === 0) {
      // Start without routine
      startSession()
      return
    }
    setPendingPickRoutine(true)
  }

  const confirmStart = () => {
    const routine = routines.find((r) => r.id === pickedRoutineId)
    startSession(routine?.name, routine?.id)
    // Pre-populate the session with ALL exercises from the routine, in order.
    // Each is empty (no sets logged yet) — user just picks which one they're doing
    // and chats the sets.
    if (routine) {
      for (const ex of routine.exercises) {
        addExerciseToSession(ex.name, ex.muscleGroup)
      }
      // Mark the first exercise as current so chat-logged sets land there by default
      if (routine.exercises.length > 0) {
        setCurrentExercise(routine.exercises[0].name)
      }
    }
    setPendingPickRoutine(false)
    setPickedRoutineId(null)
  }

  const handleEnd = () => {
    if (!activeSession) return
    if (confirm('¿Finalizar y guardar la sesión?')) endSession()
  }

  const handleCancel = () => {
    if (!activeSession) return
    const totalSets = activeSession.exercises.reduce((s, e) => s + e.sets.length, 0)
    const msg = totalSets > 0
      ? `¿Cancelar la sesión? Vas a perder ${totalSets} serie${totalSets !== 1 ? 's' : ''} cargada${totalSets !== 1 ? 's' : ''}. No se guarda nada en el histórico.`
      : '¿Cancelar la sesión? No se guarda nada en el histórico.'
    if (confirm(msg)) cancelSession()
  }

  const totalSets = activeSession?.exercises.reduce((s, e) => s + e.sets.length, 0) ?? 0
  const totalVolume = activeSession?.exercises.reduce(
    (sum, e) => sum + e.sets.reduce((s, set) => s + set.weight * set.reps, 0), 0
  ) ?? 0

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          Progressive Overload Coach
        </h2>
        {!activeSession && (
          <button onClick={handleStart}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 text-emerald-400 text-sm font-bold transition-colors">
            <Play className="w-4 h-4" /> Nueva sesión
          </button>
        )}
      </div>

      {/* Gym type selector — always visible */}
      <div className="grid grid-cols-[60px_1fr] items-center gap-3 mb-3">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Gym</span>
        <div className="flex bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
          {(['home','commercial'] as GymType[]).map((g) => {
            const Icon = g === 'home' ? Home : Building2
            const label = g === 'home' ? 'Home Gym' : 'Commercial Gym'
            return (
              <button key={g} onClick={() => setGymType(g)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  gymType === g ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-200'
                }`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Pick routine flow */}
      {pendingPickRoutine && (
        <div className="bg-zinc-950/60 border border-indigo-500/30 rounded-xl p-4 mb-3">
          <p className="text-sm text-zinc-200 mb-3 font-semibold">¿Qué día querés hacer?</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
            {routines.map((r) => (
              <button key={r.id} onClick={() => setPickedRoutineId(r.id)}
                className={`text-left p-3 rounded-lg border transition-all ${
                  pickedRoutineId === r.id
                    ? 'bg-indigo-500/15 border-indigo-500/60 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-600'
                }`}>
                <p className="text-sm font-bold">{r.name}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">{r.dayLabel}</p>
                <p className="text-[10px] font-mono text-zinc-600 mt-1">{r.exercises.length} ejercicios</p>
              </button>
            ))}
            <button onClick={() => setPickedRoutineId(null)}
              className={`text-left p-3 rounded-lg border-2 border-dashed transition-all ${
                pickedRoutineId === null
                  ? 'border-zinc-500 text-zinc-300'
                  : 'border-zinc-800 text-zinc-600 hover:border-zinc-600'
              }`}>
              <p className="text-sm font-bold">Libre</p>
              <p className="text-[10px] mt-0.5">Sin rutina pre-cargada</p>
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setPendingPickRoutine(false)}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold">
              Cancelar
            </button>
            <button onClick={confirmStart}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
              Empezar
            </button>
          </div>
        </div>
      )}

      {/* Active session */}
      {activeSession ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-bold text-white">{activeSession.name}</p>
              {activeRoutine && <p className="text-[10px] text-zinc-500 font-mono">{activeRoutine.dayLabel}</p>}
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-zinc-400">{activeSession.exercises.length} ej · {totalSets} series</span>
              <span className="text-emerald-400 font-mono">{totalVolume.toLocaleString('es-AR')}kg vol</span>
            </div>
          </div>

          {/* Exercise list — click any card to mark it as current */}
          <div className="space-y-2">
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Ejercicios de la rutina — tocá uno para marcarlo como actual y cargá series por chat
            </p>
            {activeSession.exercises.map((ex, idx) => {
              const isCurrent = ex.name === currentExerciseName
              const hasReps = ex.sets.length > 0
              // Look up target from routine if linked
              const target = activeRoutine?.exercises.find((r) => r.name.toLowerCase() === ex.name.toLowerCase())
              return (
                <button
                  key={ex.id}
                  onClick={() => setCurrentExercise(ex.name)}
                  className={`w-full text-left rounded-xl border p-3 transition-all ${
                    isCurrent
                      ? 'bg-amber-500/10 border-amber-500 shadow-[0_0_0_2px_rgba(245,158,11,0.2)]'
                      : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      {/* Status icon */}
                      <div className={`shrink-0 mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        hasReps
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : isCurrent
                            ? 'bg-amber-500/30 text-amber-300'
                            : 'bg-zinc-800 text-zinc-500'
                      }`}>
                        {hasReps ? '✓' : idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white truncate">{ex.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-zinc-500 font-mono">{ex.muscleGroup}</span>
                          {target && (
                            <span className="text-[10px] text-zinc-500 font-mono">
                              · target {target.targetSets}×{target.targetReps}{target.targetWeight ? ` · ${target.targetWeight}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isCurrent && (
                      <span className="shrink-0 text-[9px] font-mono uppercase tracking-wider text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded">
                        actual
                      </span>
                    )}
                  </div>

                  {ex.sets.length === 0 ? (
                    <p className="text-[11px] italic text-zinc-600 pl-8">
                      {isCurrent
                        ? <>↳ Decile al chat: <span className="text-amber-300/80">&quot;hice 80kg 8 reps&quot;</span></>
                        : 'Sin series cargadas'}
                    </p>
                  ) : (
                    <div className="pl-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                      {ex.sets.map((set, i) => (
                        <div key={set.id} className="bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-xs">
                          <span className="text-zinc-500 mr-1">#{i + 1}</span>
                          <span className="text-zinc-200 font-semibold tabular-nums">{set.weight}{set.unit}</span>
                          <span className="text-zinc-500 mx-0.5">×</span>
                          <span className="text-zinc-300 tabular-nums">{set.reps}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Add exercise button — either from routine (if linked) or free */}
          {addExerciseOpen ? (
            <AddExercisePicker
              routine={activeRoutine}
              alreadyAdded={new Set(activeSession.exercises.map((e) => e.name.toLowerCase()))}
              onPick={(name, mg) => {
                const ex = addExerciseToSession(name, mg)
                if (ex) setCurrentExercise(name)
                setAddExerciseOpen(false)
              }}
              onCancel={() => setAddExerciseOpen(false)}
            />
          ) : (
            <button onClick={() => setAddExerciseOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-zinc-800 hover:border-emerald-500/40 text-zinc-500 hover:text-emerald-400 text-sm font-semibold transition-all">
              <Plus className="w-4 h-4" /> Agregar ejercicio
            </button>
          )}

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button onClick={handleEnd}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 text-sm font-bold transition-colors">
              <Square className="w-4 h-4" /> Finalizar y guardar
            </button>
            <button onClick={handleCancel}
              title="Descartar sesión sin guardar"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-red-500/50 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 text-sm font-semibold transition-colors">
              <X className="w-4 h-4" /> Cancelar
            </button>
          </div>
        </div>
      ) : !pendingPickRoutine && (
        <div className="text-center py-6">
          <p className="text-sm text-zinc-500">Sin sesión activa.</p>
          <p className="text-[11px] text-zinc-600 mt-1">Tocá &quot;Nueva sesión&quot; para empezar.</p>
        </div>
      )}
    </section>
  )
}

interface AddExercisePickerProps {
  routine: GymRoutine | null | undefined
  alreadyAdded: Set<string>
  onPick: (name: string, muscleGroup?: string) => void
  onCancel: () => void
}
function AddExercisePicker({ routine, alreadyAdded, onPick, onCancel }: AddExercisePickerProps) {
  const [customName, setCustomName] = useState('')
  const remaining = routine?.exercises.filter((e) => !alreadyAdded.has(e.name.toLowerCase())) ?? []

  return (
    <div className="bg-zinc-950/80 border border-emerald-500/30 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-zinc-300">Elegí un ejercicio</p>
        <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-200"><X className="w-3.5 h-3.5" /></button>
      </div>

      {remaining.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">De la rutina {routine?.name}</p>
          {remaining.map((ex) => (
            <button key={ex.id} onClick={() => onPick(ex.name, ex.muscleGroup)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-left group">
              <div>
                <p className="text-sm text-zinc-200 font-semibold">{ex.name}</p>
                <p className="text-[10px] text-zinc-500">{ex.muscleGroup} · {ex.targetSets}×{ex.targetReps}{ex.targetWeight ? ` · ${ex.targetWeight}` : ''}</p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-emerald-400 transition-colors" />
            </button>
          ))}
        </div>
      )}

      <div className={remaining.length > 0 ? 'pt-2 border-t border-zinc-800' : ''}>
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">O escribilo libre</p>
        <form onSubmit={(e) => { e.preventDefault(); if (customName.trim()) onPick(customName.trim()) }}
          className="flex items-center gap-2">
          <input value={customName} onChange={(e) => setCustomName(e.target.value)}
            placeholder="ej. press inclinado mancuernas"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
          <button type="submit" disabled={!customName.trim()}
            className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-400 text-xs font-bold">
            Agregar
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Routine Editor ───────────────────────────────────────────────────────────

function RoutineEditor() {
  const { routines, addRoutine, updateRoutine, addExerciseToRoutine, removeExerciseFromRoutine, deleteRoutine } = useGymStore()
  const [showAddRoutine, setShowAddRoutine] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDayLabel, setNewDayLabel] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleAddRoutine = () => {
    if (!newName.trim()) return
    addRoutine(newName.trim(), newDayLabel.trim() || newName.trim())
    setNewName(''); setNewDayLabel(''); setShowAddRoutine(false)
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-white">Mis rutinas</h2>
        <button onClick={() => setShowAddRoutine((v) => !v)}
          className="text-xs px-3 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 font-semibold flex items-center gap-1.5">
          <Plus className="w-3 h-3" /> Nueva rutina
        </button>
      </div>

      {showAddRoutine && (
        <div className="bg-zinc-950/60 border border-zinc-700 rounded-xl p-3 mb-3 space-y-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus
            placeholder="Nombre (ej. Push, Pierna)"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
          <input value={newDayLabel} onChange={(e) => setNewDayLabel(e.target.value)}
            placeholder="Descripción del día (ej. Pecho / Tríceps)"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
          <div className="flex gap-2">
            <button onClick={() => setShowAddRoutine(false)} className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300">Cancelar</button>
            <button onClick={handleAddRoutine} disabled={!newName.trim()}
              className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 disabled:opacity-40 font-semibold">
              Crear
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {routines.map((r) => (
          <RoutineRow key={r.id} routine={r}
            expanded={expandedId === r.id}
            onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
            onUpdate={(p) => updateRoutine(r.id, p)}
            onAddExercise={(e) => addExerciseToRoutine(r.id, e)}
            onRemoveExercise={(eid) => removeExerciseFromRoutine(r.id, eid)}
            onDelete={() => { if (confirm(`¿Eliminar rutina "${r.name}"?`)) deleteRoutine(r.id) }}
          />
        ))}
        {routines.length === 0 && (
          <p className="text-xs text-zinc-600 text-center py-4">Sin rutinas. Creá la primera arriba.</p>
        )}
      </div>
    </section>
  )
}

interface RoutineRowProps {
  routine: GymRoutine
  expanded: boolean
  onToggle: () => void
  onUpdate: (p: Partial<GymRoutine>) => void
  onAddExercise: (e: { name: string; muscleGroup: string; targetSets: number; targetReps: string; targetWeight?: string }) => void
  onRemoveExercise: (id: string) => void
  onDelete: () => void
}
function RoutineRow({ routine, expanded, onToggle, onUpdate, onAddExercise, onRemoveExercise, onDelete }: RoutineRowProps) {
  const [exName, setExName] = useState('')
  const [exMg, setExMg] = useState('')
  const [exSets, setExSets] = useState('3')
  const [exReps, setExReps] = useState('8-10')

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!exName.trim()) return
    onAddExercise({
      name: exName.trim(),
      muscleGroup: exMg.trim() || 'General',
      targetSets: parseInt(exSets) || 3,
      targetReps: exReps.trim() || '8-10',
    })
    setExName(''); setExMg('')
  }

  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-zinc-800/40 group" onClick={onToggle}>
        {expanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
        <div className="flex-1 min-w-0">
          <input value={routine.name} onChange={(e) => onUpdate({ name: e.target.value })} onClick={(e) => e.stopPropagation()}
            className="bg-transparent text-sm font-bold text-white focus:outline-none focus:bg-zinc-800 rounded px-1 w-full" />
          <input value={routine.dayLabel} onChange={(e) => onUpdate({ dayLabel: e.target.value })} onClick={(e) => e.stopPropagation()}
            className="bg-transparent text-[11px] text-zinc-500 focus:outline-none focus:bg-zinc-800 rounded px-1 w-full" />
        </div>
        <span className="text-[10px] font-mono text-zinc-500">{routine.exercises.length} ej</span>
        <button onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="p-3 border-t border-zinc-800 space-y-2">
          {routine.exercises.map((ex) => (
            <div key={ex.id} className="flex items-center gap-2 group text-xs">
              <span className="text-zinc-300 flex-1 truncate">{ex.name}</span>
              <span className="text-zinc-500 font-mono">{ex.muscleGroup}</span>
              <span className="text-zinc-400 font-mono">{ex.targetSets}×{ex.targetReps}</span>
              <button onClick={() => onRemoveExercise(ex.id)}
                className="text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          <form onSubmit={handleAdd} className="flex flex-wrap gap-1 pt-2 border-t border-zinc-800">
            <input value={exName} onChange={(e) => setExName(e.target.value)} placeholder="Ejercicio"
              className="flex-1 min-w-[120px] bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500" />
            <input value={exMg} onChange={(e) => setExMg(e.target.value)} placeholder="Músculo"
              className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500" />
            <input value={exSets} onChange={(e) => setExSets(e.target.value)} placeholder="Sets" type="number"
              className="w-14 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500" />
            <input value={exReps} onChange={(e) => setExReps(e.target.value)} placeholder="Reps"
              className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500" />
            <button type="submit" disabled={!exName.trim()}
              className="px-2 py-1 rounded bg-indigo-500/15 border border-indigo-500/30 disabled:opacity-40 text-indigo-300 text-xs font-bold">
              <Plus className="w-3 h-3" />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

// ─── Session History ──────────────────────────────────────────────────────────

function SessionHistory() {
  const { sessions, deleteSession } = useGymStore()

  if (sessions.length === 0) {
    return null
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Historial · {sessions.length} sesiones</h2>
      <div className="space-y-2">
        {sessions.slice(0, 20).map((s) => (
          <SessionRow key={s.id} session={s} onDelete={() => { if (confirm('¿Eliminar sesión?')) deleteSession(s.id) }} />
        ))}
      </div>
    </section>
  )
}

function SessionRow({ session, onDelete }: { session: WorkoutSession; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const totalSets = session.exercises.reduce((sum, e) => sum + e.sets.length, 0)
  const totalVolume = session.exercises.reduce(
    (sum, e) => sum + e.sets.reduce((s, set) => s + set.weight * set.reps, 0), 0
  )
  const duration = session.endedAt
    ? Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60000)
    : null

  return (
    <motion.div layout className="bg-zinc-950/60 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-zinc-800/30 group" onClick={() => setExpanded(!expanded)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{session.name}</span>
            <span className="text-[11px] text-zinc-500 font-mono">{session.date}</span>
          </div>
          <div className="flex gap-3 text-[10px] text-zinc-500 font-mono mt-0.5">
            <span><Target className="w-2.5 h-2.5 inline" /> {session.exercises.length} ej</span>
            <span><BarChart3 className="w-2.5 h-2.5 inline" /> {totalSets} series</span>
            <span><Zap className="w-2.5 h-2.5 inline" /> {totalVolume.toLocaleString('es-AR')} kg</span>
            {duration && <span><Clock className="w-2.5 h-2.5 inline" /> {duration}min</span>}
          </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        {expanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
      </div>
      {expanded && (
        <div className="p-3 border-t border-zinc-800 space-y-2">
          {session.exercises.map((ex) => (
            <div key={ex.id}>
              <p className="text-xs font-bold text-zinc-300 mb-1">{ex.name} <span className="text-zinc-500 font-normal font-mono">({ex.muscleGroup})</span></p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                {ex.sets.map((set, i) => (
                  <span key={set.id} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 text-[10px] text-zinc-400 font-mono">
                    #{i + 1} {set.weight}{set.unit}×{set.reps}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ─── Exercise Progression Panel ───────────────────────────────────────────────

function ExerciseProgressionPanel() {
  const { routines, sessions, weightEntries, phase } = useGymStore()

  // Body weight delta last 7d (used by analyzer)
  const sortedBw = useMemo(() => [...weightEntries].sort((a, b) => a.date.localeCompare(b.date)), [weightEntries])
  const bwDelta7d = useMemo(() => {
    if (sortedBw.length < 2) return null
    const latest = sortedBw[sortedBw.length - 1].kg
    const ref = sortedBw[Math.max(0, sortedBw.length - 8)].kg
    return latest - ref
  }, [sortedBw])

  // All unique exercises across routines
  const uniqueExercises = useMemo(() => uniqueRoutineExercises(routines), [routines])

  // Analyses
  const analyses = useMemo(() =>
    uniqueExercises
      .map((ex) => analyzeExercise(ex.name, ex.muscleGroup, sessions, phase, bwDelta7d))
      .sort((a, b) => {
        // Sort: those with recent history first, then alphabetically
        const aDays = a.lastDoneDaysAgo ?? 9999
        const bDays = b.lastDoneDaysAgo ?? 9999
        return aDays - bDays || a.name.localeCompare(b.name)
      }),
    [uniqueExercises, sessions, phase, bwDelta7d]
  )

  if (uniqueExercises.length === 0) {
    return (
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" /> Progresión por ejercicio
        </h2>
        <p className="text-xs text-zinc-500">Definí ejercicios en tus rutinas (arriba) para ver el análisis de progresión.</p>
      </section>
    )
  }

  // Split into "with history" and "without"
  const withHistory = analyses.filter((a) => a.history.length > 0)
  const withoutHistory = analyses.filter((a) => a.history.length === 0)

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" /> Progresión por ejercicio
        </h2>
        <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
          <span>Fase: <span className="text-zinc-300 uppercase">{phase}</span></span>
          {bwDelta7d !== null && (
            <span>· Peso 7d: <span className={bwDelta7d > 0 ? 'text-amber-400' : bwDelta7d < 0 ? 'text-emerald-400' : 'text-zinc-300'}>
              {bwDelta7d > 0 ? '+' : ''}{bwDelta7d.toFixed(1)}kg
            </span></span>
          )}
        </div>
      </div>

      {/* With history */}
      {withHistory.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {withHistory.map((a) => <ExerciseProgressionCard key={a.name} analysis={a} />)}
        </div>
      )}

      {/* Without history (collapsed) */}
      {withoutHistory.length > 0 && (
        <details className="bg-zinc-950/40 rounded-xl border border-zinc-800 p-3">
          <summary className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 cursor-pointer hover:text-zinc-300">
            Sin histórico aún · {withoutHistory.length}
          </summary>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-1.5">
            {withoutHistory.map((a) => (
              <div key={a.name} className="text-[11px] text-zinc-500 px-2 py-1.5 rounded bg-zinc-900/60 border border-zinc-800">
                <span className="text-zinc-300">{a.name}</span> <span className="text-zinc-600">· {a.muscleGroup}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}

function ExerciseProgressionCard({ analysis }: { analysis: ReturnType<typeof analyzeExercise> }) {
  const a = analysis
  const last = a.history[a.history.length - 1]
  const series = useMemo(() => a.history.map((h, i) => ({
    idx: i + 1,
    date: h.date.slice(5),
    e1rm: h.estimated1RM,
    weight: h.topSet.weight,
    volume: h.totalVolume,
  })), [a.history])

  const trendColor = a.trend === 'progressing' ? '#10b981'
    : a.trend === 'regressing' ? '#ef4444'
    : a.trend === 'stalled' ? '#f59e0b'
    : '#71717a'
  const TrendIcon = a.trend === 'progressing' ? TrendingUp
    : a.trend === 'regressing' ? TrendingDown
    : Minus

  const recColor = {
    go: '#10b981',
    hold: '#f59e0b',
    deload: '#a855f7',
    rest: '#ef4444',
    info: '#71717a',
  }[a.recommendation.kind]

  const isPRThisSession = last && a.prTopSet && last.topSet.id === a.prTopSet.id

  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3 space-y-2"
      style={{ borderLeftColor: trendColor, borderLeftWidth: 3 }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate">{a.name}</p>
          <p className="text-[10px] text-zinc-500 font-mono">{a.muscleGroup}</p>
        </div>
        <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full"
          style={{ background: trendColor + '20', color: trendColor }}>
          <TrendIcon className="w-3 h-3" />
          {a.trend === 'progressing' ? 'subiendo' : a.trend === 'regressing' ? 'bajando' : a.trend === 'stalled' ? 'estancado' : 'nuevo'}
        </span>
      </div>

      {/* Last + PR */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-zinc-900 rounded-lg p-2">
          <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-600">Último</p>
          <p className="text-sm font-bold text-white tabular-nums">
            {last.topSet.weight}{last.topSet.unit} × {last.maxReps}
          </p>
          <p className="text-[9px] text-zinc-600 font-mono">
            {a.lastDoneDaysAgo !== null
              ? a.lastDoneDaysAgo === 0 ? 'hoy'
                : a.lastDoneDaysAgo === 1 ? 'ayer'
                : `hace ${a.lastDoneDaysAgo}d`
              : '—'}
            {isPRThisSession && ' · 🏆 PR'}
          </p>
        </div>
        <div className="bg-zinc-900 rounded-lg p-2">
          <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-600 flex items-center gap-1">
            <Trophy className="w-2.5 h-2.5" /> Récord
          </p>
          {a.prTopSet ? (
            <>
              <p className="text-sm font-bold text-emerald-400 tabular-nums">
                {a.prTopSet.weight}{a.prTopSet.unit} × {a.prTopSet.reps}
              </p>
              <p className="text-[9px] text-zinc-600 font-mono">
                e1RM ~{Math.round(a.prTopSet.weight * (1 + a.prTopSet.reps / 30))}{a.prTopSet.unit}
              </p>
            </>
          ) : <p className="text-sm text-zinc-600">—</p>}
        </div>
      </div>

      {/* Mini sparkline */}
      {series.length > 1 && (
        <div style={{ width: '100%', height: 56 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 4, right: 4, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 8, fill: '#52525b' }} hide={series.length > 8} />
              <YAxis tick={{ fontSize: 8, fill: '#52525b' }} width={26} />
              <Tooltip contentStyle={{ background: 'var(--surface-popover)', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 10 }}
                formatter={(v) => [`${v}kg`, 'e1RM'] as [string, string]} />
              <Line type="monotone" dataKey="e1rm" stroke={trendColor} strokeWidth={2} dot={{ r: 2, fill: trendColor }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recommendation */}
      <div className="rounded-lg p-2 text-[11px] leading-snug"
        style={{ background: recColor + '15', color: recColor, border: `1px solid ${recColor}30` }}>
        {a.recommendation.text}
      </div>
    </div>
  )
}
