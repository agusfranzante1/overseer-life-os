'use client'
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, RotateCcw } from 'lucide-react'
import {
  useGymStore,
  TRAINING_CATEGORIES,
  type TrainingCategory,
} from '@/lib/store/gymStore'

/** Distribución semanal de entrenamiento — matriz 5 categorías × 7 días.
 *
 *  El usuario define qué tipos de entrenamiento hace cada día de la
 *  semana. Es PLANIFICACIÓN, no tracking (eso lo cubre el tab de
 *  Sesiones). Multi-categoría por día permitido — p.ej. lunes puede ser
 *  gym + calistenia.
 *
 *  Render:
 *  - Resumen arriba: chips por categoría con cantidad de días/semana.
 *  - Matriz: filas = categorías, columnas = días Lun..Dom. Click en
 *    una celda → toggle. Color de la categoría cuando está activa,
 *    gris cuando no.
 *  - Resumen por día abajo: emojis de las categorías planeadas (ej.
 *    "Lun: 🏋️ 💪"). Si está vacío, "—" gris.
 *
 *  Convención días: igual que habits/dispatcher → JS `Date.getDay()`
 *  (0=Dom..6=Sáb). Visual va Lun→Dom para matchear la grilla de hábitos.
 */

// Orden visual Lun→Dom (valores son JS getDay). Igual que TargetDaysPicker.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const DAY_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export function TrainingDistribution() {
  const trainingPlan = useGymStore((s) => s.trainingPlan)
  const toggleTrainingPlan = useGymStore((s) => s.toggleTrainingPlan)
  const clearTrainingPlan = useGymStore((s) => s.clearTrainingPlan)

  // ─── Stats ──────────────────────────────────────────────────────────────────
  // Por categoría: cantidad de días/semana que aparece.
  const categoryCounts = useMemo(() => {
    const counts: Record<TrainingCategory, number> = {
      gym: 0, running: 0, biking: 0, deporte: 0, calistenia: 0,
    }
    for (const dow of Object.keys(trainingPlan).map(Number)) {
      for (const cat of trainingPlan[dow] ?? []) counts[cat] += 1
    }
    return counts
  }, [trainingPlan])

  // Días activos (al menos 1 categoría) vs. días de descanso.
  const activeDays = DAY_ORDER.filter((dow) => (trainingPlan[dow] ?? []).length > 0).length
  const restDays = 7 - activeDays
  const totalSlots = Object.values(categoryCounts).reduce((a, b) => a + b, 0)

  const isAnythingSet = totalSlots > 0

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-amber-400" />
            Distribución semanal
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Planificá qué entrenás cada día. Cliquea una celda para activar/desactivar.
          </p>
        </div>
        {isAnythingSet && (
          <button
            onClick={() => {
              if (confirm('¿Borrar todo el plan semanal? No afecta tus sesiones registradas.')) {
                clearTrainingPlan()
              }
            }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-700 transition-colors"
            title="Borrar todo el plan"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        )}
      </div>

      {/* Stats strip — días activos / descanso / total slots */}
      <div className="grid grid-cols-3 gap-3">
        <StatChip label="Días activos" value={`${activeDays}/7`} color="#10b981" />
        <StatChip label="Días descanso" value={`${restDays}/7`} color="#71717a" />
        <StatChip label="Total sesiones" value={`${totalSlots}`} color="#f59e0b" />
      </div>

      {/* Per-category summary chips */}
      <div className="flex flex-wrap gap-2">
        {TRAINING_CATEGORIES.map((cat) => {
          const count = categoryCounts[cat.id]
          return (
            <div
              key={cat.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-zinc-900/60"
              style={{ borderColor: count > 0 ? cat.color : '#27272a' }}
            >
              <span className="text-base">{cat.emoji}</span>
              <span className={`text-xs font-semibold ${count > 0 ? 'text-zinc-200' : 'text-zinc-500'}`}>
                {cat.label}
              </span>
              <span
                className="text-[10px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded"
                style={{
                  background: count > 0 ? `${cat.color}25` : '#27272a',
                  color: count > 0 ? cat.color : '#71717a',
                }}
              >
                {count}d
              </span>
            </div>
          )
        })}
      </div>

      {/* Matrix: categorías (filas) × días (columnas) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 min-w-[480px]">
          <thead>
            <tr>
              <th className="text-left text-[10px] font-mono uppercase tracking-wider text-zinc-500 pb-2 pl-2">
                Categoría
              </th>
              {DAY_ORDER.map((dow, idx) => (
                <th key={dow} className="text-center pb-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    {DAY_SHORT[idx]}
                  </div>
                  <div className="text-[9px] font-mono text-zinc-600">
                    {DAY_LABELS[idx].slice(0, 3)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TRAINING_CATEGORIES.map((cat) => (
              <tr key={cat.id}>
                <td className="py-1 pl-2 pr-3">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span className="text-base">{cat.emoji}</span>
                    <span className="text-xs font-semibold text-zinc-200">{cat.label}</span>
                  </div>
                </td>
                {DAY_ORDER.map((dow) => {
                  const active = (trainingPlan[dow] ?? []).includes(cat.id)
                  return (
                    <td key={dow} className="text-center align-middle">
                      <button
                        onClick={() => toggleTrainingPlan(dow, cat.id)}
                        title={`${cat.label} — ${DAY_LABELS[DAY_ORDER.indexOf(dow)]}`}
                        className="w-9 h-9 rounded-lg transition-all hover:scale-105 hover:ring-1 hover:ring-white/40 flex items-center justify-center"
                        style={{
                          background: active ? cat.color : '#000000',
                          border: active ? `1px solid ${cat.color}` : '1px solid #27272a',
                        }}
                      >
                        {active && (
                          <span className="text-base leading-none">{cat.emoji}</span>
                        )}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Per-day summary — emojis de lo que tenés planeado por día */}
      <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-4">
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-3">
          Resumen por día
        </p>
        <div className="grid grid-cols-7 gap-2">
          {DAY_ORDER.map((dow, idx) => {
            const cats = trainingPlan[dow] ?? []
            const metas = TRAINING_CATEGORIES.filter((c) => cats.includes(c.id))
            const isRest = metas.length === 0
            return (
              <div
                key={dow}
                className={`rounded-xl p-3 border text-center ${
                  isRest
                    ? 'bg-zinc-900/40 border-zinc-900'
                    : 'bg-zinc-900 border-zinc-800'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  {DAY_SHORT[idx]}
                </div>
                {isRest ? (
                  <div className="text-zinc-700 text-xs h-6 flex items-center justify-center">—</div>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-1 min-h-[24px]">
                    {metas.map((m) => (
                      <span
                        key={m.id}
                        title={m.label}
                        className="text-base leading-none"
                      >
                        {m.emoji}
                      </span>
                    ))}
                  </div>
                )}
                <div className="text-[9px] font-mono text-zinc-600 mt-1">
                  {isRest ? 'descanso' : `${metas.length} act.`}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {!isAnythingSet && (
        <p className="text-center text-xs text-zinc-600 italic py-4">
          Empezá a cliquear las celdas para armar tu semana.
        </p>
      )}
    </motion.section>
  )
}

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="bg-zinc-900 border rounded-xl p-3"
      style={{ borderLeftColor: color, borderLeftWidth: 3, borderTopColor: '#27272a', borderRightColor: '#27272a', borderBottomColor: '#27272a' }}
    >
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-2xl font-extrabold tabular-nums mt-0.5" style={{ color }}>{value}</p>
    </div>
  )
}
