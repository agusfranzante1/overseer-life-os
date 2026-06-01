'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, Plus, Trash2, Flame, Trophy, X,
  ChevronLeft, ChevronRight, TrendingUp, GripVertical, ArrowUpDown, Check, Minus,
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { useHabitsStore, type Habit } from '@/lib/store/habitsStore'
import { useAppStore } from '@/lib/store/appStore'
import { todayKeyInTz } from '@/lib/utils/dateInTz'

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#3b82f6', '#f97316', '#8b5cf6', '#ef4444']
const ICONS = ['🏋️', '🧘', '📚', '🏃', '💧', '🥗', '😴', '💊', '🧠', '✍️', '🎯', '🚴']
const CATEGORIES = ['Salud', 'Fitness', 'Mente', 'Nutrición', 'Productividad', 'Otro']

// ─── Date helpers ─────────────────────────────────────────────────────────────

function dateToStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function todayStr() { return dateToStr(new Date()) }
function startOfWeekMonday(d: Date) {
  const dt = new Date(d)
  dt.setHours(0, 0, 0, 0)
  const dow = (dt.getDay() + 6) % 7 // 0=Mon
  dt.setDate(dt.getDate() - dow)
  return dt
}
function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function daysInMonth(year: number, monthIdx: number) {
  return new Date(year, monthIdx + 1, 0).getDate()
}
function isFutureDate(d: Date) {
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return d.getTime() > t.getTime()
}

function computeStreak(completedDates: string[]): number {
  if (completedDates.length === 0) return 0
  const sorted = [...completedDates].sort().reverse()
  const set = new Set(sorted)
  let streak = 0
  const cursor = new Date(); cursor.setHours(0, 0, 0, 0)
  for (;;) {
    const key = dateToStr(cursor)
    if (set.has(key)) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    } else if (streak === 0) {
      // allow today not yet done — start from yesterday
      cursor.setDate(cursor.getDate() - 1)
      if (!set.has(dateToStr(cursor))) break
      streak++
      cursor.setDate(cursor.getDate() - 1)
    } else break
  }
  return streak
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function HabitsPage() {
  const { habits, addHabit, removeHabit, toggleDate, reorderHabits } = useHabitsStore()
  const timezone = useAppStore((s) => s.timezone)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', icon: '🎯', color: COLORS[0], category: 'Salud' })
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeekMonday(new Date()))
  const [chartMonth, setChartMonth] = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d
  })
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // ─── Manual reorder (drag-and-drop) ─────────────────────────────────────────
  const [reorderMode, setReorderMode] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const draggedRef = useRef<string | null>(null)

  const handleDragStart = (id: string) => (e: React.DragEvent) => {
    draggedRef.current = id
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    // Firefox needs data set or drag won't initiate
    try { e.dataTransfer.setData('text/plain', id) } catch { /* ignore */ }
  }
  const handleDragOver = (id: string) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (overId !== id) setOverId(id)
  }
  const handleDrop = (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault()
    const sourceId = draggedRef.current
    draggedRef.current = null
    setDragId(null)
    setOverId(null)
    if (!sourceId || sourceId === targetId) return
    const ids = habits.map((h) => h.id)
    const from = ids.indexOf(sourceId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    const next = [...ids]
    next.splice(from, 1)
    next.splice(to, 0, sourceId)
    reorderHabits(next)
  }
  const handleDragEnd = () => {
    draggedRef.current = null
    setDragId(null)
    setOverId(null)
  }

  // "Today" is computed in the user's selected IANA timezone — so habits roll
  // over on the user's day, not the device's local day. Important when
  // travelling or working across timezones.
  const today = todayKeyInTz(timezone)
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i)), [weekAnchor])
  const weekDayStrs = useMemo(() => weekDays.map(dateToStr), [weekDays])

  const handleAdd = () => {
    if (!form.name.trim()) return
    addHabit({
      name: form.name.trim(),
      icon: form.icon,
      color: form.color,
      category: form.category,
      targetDays: [],
    })
    setForm({ name: '', icon: '🎯', color: COLORS[0], category: 'Salud' })
    setShowForm(false)
  }

  const doneToday    = habits.filter((h) => h.completedDates.includes(today)).length
  const skippedToday = habits.filter((h) => (h.skippedDates ?? []).includes(today)).length
  const totalHabits  = habits.length
  // Exclude skipped habits from the daily completion denominator.
  const activeToday  = totalHabits - skippedToday
  const completionRate = activeToday > 0 ? Math.round((doneToday / activeToday) * 100) : 0
  const bestStreak = habits.reduce((max, h) => Math.max(max, computeStreak(h.completedDates)), 0)

  // Week navigation
  const isCurrentWeek = dateToStr(weekAnchor) === dateToStr(startOfWeekMonday(new Date()))
  const weekLabel = `${weekDays[0].getDate()} ${weekDays[0].toLocaleDateString('es-AR', { month: 'short' })} – ${weekDays[6].getDate()} ${weekDays[6].toLocaleDateString('es-AR', { month: 'short' })}`

  // Month navigation
  const isCurrentMonth = chartMonth.getFullYear() === new Date().getFullYear() && chartMonth.getMonth() === new Date().getMonth()
  const monthLabel = chartMonth.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

  if (!mounted) {
    return <div className="p-6"><div className="h-8 w-48 bg-zinc-900 rounded animate-pulse" /></div>
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-pink-400" />
            Hábitos
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">Seguimiento diario de rutinas</p>
        </div>
        <div className="flex items-center gap-2">
          {habits.length > 1 && (
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={() => { setReorderMode((v) => !v); if (showForm) setShowForm(false) }}
              title={reorderMode ? 'Salir del modo reordenar' : 'Reordenar hábitos'}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                reorderMode
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}>
              {reorderMode ? <Check className="w-4 h-4" /> : <ArrowUpDown className="w-4 h-4" />}
              {reorderMode ? 'Listo' : 'Reordenar'}
            </motion.button>
          )}
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => setShowForm(!showForm)}
            disabled={reorderMode}
            className="flex items-center gap-2 px-4 py-2.5 bg-pink-500/10 border border-pink-500/30 hover:bg-pink-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-pink-400 rounded-xl text-sm font-semibold transition-all">
            <Plus className="w-4 h-4" /> Nuevo hábito
          </motion.button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Hoy" value={`${doneToday}/${totalHabits}`} color="#ec4899" />
        <SummaryCard label="Completado" value={`${completionRate}%`} color="#10b981" />
        <SummaryCard label="Racha máx" value={`${bestStreak}d`} color="#f59e0b" icon={<Flame className="w-3 h-3" />} />
        <SummaryCard label="Hábitos" value={`${totalHabits}`} color="#6366f1" icon={<Trophy className="w-3 h-3" />} />
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-200">Nuevo hábito</h3>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nombre del hábito" autoFocus
                className="col-span-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-pink-500" />
              <div>
                <p className="text-xs text-zinc-500 mb-1.5">Icono</p>
                <div className="flex flex-wrap gap-1.5">
                  {ICONS.map((icon) => (
                    <button key={icon} onClick={() => setForm((f) => ({ ...f, icon }))}
                      className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-colors ${form.icon === icon ? 'bg-pink-500/20 border border-pink-500/50' : 'bg-zinc-800 hover:bg-zinc-700'}`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1.5">Color</p>
                <div className="flex flex-wrap gap-1.5">
                  {COLORS.map((color) => (
                    <button key={color} onClick={() => setForm((f) => ({ ...f, color }))}
                      className={`w-7 h-7 rounded-full transition-transform ${form.color === color ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-900 scale-110' : ''}`}
                      style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="col-span-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-pink-500">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAdd} className="flex-1 bg-pink-600 hover:bg-pink-500 text-white rounded-lg py-2 text-sm font-semibold transition-colors">
                Crear hábito
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-zinc-400 hover:text-zinc-200 text-sm">
                Cancelar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Weekly grid */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Semana</h2>
          <div className="flex items-center gap-1">
            <button onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-white">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-zinc-400 font-mono px-2 min-w-[140px] text-center">{weekLabel}</span>
            <button onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-white">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            {!isCurrentWeek && (
              <button onClick={() => setWeekAnchor(startOfWeekMonday(new Date()))}
                className="text-[10px] text-pink-400 hover:text-pink-300 px-2 py-1 rounded hover:bg-pink-500/10 ml-1">
                Hoy
              </button>
            )}
          </div>
        </div>

        {/* Day headers (visible on md+) */}
        <div className="hidden md:flex justify-end mb-2">
          <div className="flex gap-1 mr-[40px]">
            {weekDays.map((d, i) => {
              const isToday = dateToStr(d) === today
              return (
                <div key={i} className="w-10 text-center">
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? 'text-pink-400' : 'text-zinc-600'}`}>
                    {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'][i]}
                  </p>
                  <p className={`text-[11px] tabular-nums ${isToday ? 'text-pink-400 font-bold' : 'text-zinc-500'}`}>
                    {d.getDate()}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        <div className="space-y-2">
          {habits.map((habit) => {
            const streak = computeStreak(habit.completedDates)
            const isDragging = dragId === habit.id
            const isDropTarget = overId === habit.id && dragId !== habit.id
            // framer-motion's `motion.div` overrides React's native HTML5
            // drag events with its own pan/gesture system. We need the native
            // ones for reorder, so we attach them via a spread + cast.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dragHandlers: any = reorderMode ? {
              draggable: true,
              onDragStart: handleDragStart(habit.id),
              onDragOver: handleDragOver(habit.id),
              onDrop: handleDrop(habit.id),
              onDragEnd: handleDragEnd,
            } : {}
            return (
              <motion.div key={habit.id} layout
                {...dragHandlers}
                className={`bg-zinc-900 border rounded-xl px-4 py-3 flex items-center gap-4 group transition-all ${
                  isDragging
                    ? 'border-emerald-500/60 opacity-50 cursor-grabbing'
                    : isDropTarget
                      ? 'border-emerald-500/60 bg-emerald-500/5'
                      : 'border-zinc-800'
                } ${reorderMode ? 'cursor-grab select-none' : ''}`}>
                {/* Drag handle — only in reorder mode */}
                {reorderMode && (
                  <GripVertical className="w-4 h-4 text-zinc-500 shrink-0" />
                )}
                {/* Icon + name */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-xl shrink-0">{habit.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">{habit.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-zinc-500">{habit.category}</span>
                      {streak > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-amber-400">
                          <Flame className="w-3 h-3" />{streak}d
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Weekly dots — clickable Mon→Sun. Tri-state cycle on click:
                    empty → completed (color dot) → skipped (gray dash, N/A)
                    → empty. Skipped days are excluded from the daily average,
                    so "no entreno los domingos" doesn't penalize your score. */}
                <div className={`hidden md:flex items-center gap-1 ${reorderMode ? 'pointer-events-none opacity-40' : ''}`}>
                  {weekDayStrs.map((ds, i) => {
                    const done = habit.completedDates.includes(ds)
                    const skipped = (habit.skippedDates ?? []).includes(ds)
                    const isToday = ds === today
                    const future = isFutureDate(weekDays[i])
                    const nextLabel = done ? 'marcar como N/A (no cuenta)'
                      : skipped ? 'volver a vacío'
                      : 'marcar como hecho'
                    return (
                      <button key={ds}
                        onClick={() => toggleDate(habit.id, ds)}
                        disabled={reorderMode}
                        title={`${weekDays[i].toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })} — click para ${nextLabel}`}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:scale-110 ${future ? 'opacity-40' : ''} ${isToday ? 'ring-1 ring-pink-500/40' : ''}`}
                        style={{
                          // "Sticker sheet" look: every cell is a light/white
                          // rounded square. Completed = solid BLACK dot on top.
                          // Empty   = thin black ring outline (hollow circle).
                          // Skipped = neutral dark cell with a minus.
                          backgroundColor: skipped ? '#27272a'   // zinc-800
                            : '#f4f4f5',                          // zinc-100 (sticker bg)
                        }}>
                        {skipped ? (
                          <Minus className="w-4 h-4 text-zinc-500" />
                        ) : done ? (
                          // Filled solid-black dot — matches the reference image.
                          <div
                            className="rounded-full transition-all"
                            style={{
                              width: 14,
                              height: 14,
                              backgroundColor: '#000000',
                            }}
                          />
                        ) : (
                          // Empty cell: hollow black ring (outline circle).
                          <div
                            className="rounded-full transition-all"
                            style={{
                              width: 14,
                              height: 14,
                              border: '2px solid #18181b',  // zinc-900 ring
                              backgroundColor: 'transparent',
                            }}
                          />
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Mobile fallback: tri-state toggle for today */}
                {(() => {
                  const skippedToday = (habit.skippedDates ?? []).includes(today)
                  const doneTodayHabit = habit.completedDates.includes(today)
                  return (
                    <button onClick={() => toggleDate(habit.id, today)}
                      disabled={reorderMode}
                      className={`md:hidden shrink-0 rounded-lg flex items-center justify-center transition-all w-10 h-10 ${reorderMode ? 'opacity-40 pointer-events-none' : ''}`}
                      // Mirror the desktop "sticker sheet" style: light cell,
                      // solid-black dot when done / hollow black ring when empty.
                      style={{
                        backgroundColor: skippedToday ? '#27272a' : '#f4f4f5',
                      }}>
                      {skippedToday ? (
                        <Minus className="w-4 h-4 text-zinc-500" />
                      ) : doneTodayHabit ? (
                        <div className="rounded-full" style={{ width: 16, height: 16, backgroundColor: '#000000' }} />
                      ) : (
                        <div className="rounded-full" style={{ width: 16, height: 16, border: '2px solid #18181b', backgroundColor: 'transparent' }} />
                      )}
                    </button>
                  )
                })()}

                {/* Delete — hidden in reorder mode to avoid accidental clicks */}
                {!reorderMode && (
                  <button onClick={() => removeHabit(habit.id)}
                    className="shrink-0 text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </motion.div>
            )
          })}

          {habits.length === 0 && (
            <p className="text-sm text-zinc-600 text-center py-8">
              Sin hábitos todavía. Tocá &quot;Nuevo hábito&quot; para empezar.
            </p>
          )}
        </div>
      </section>

      {/* Monthly trend charts */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-zinc-400" /> Cumplimiento diario · mensual
          </h2>
          <div className="flex items-center gap-1">
            <button onClick={() => {
              const d = new Date(chartMonth); d.setMonth(d.getMonth() - 1); setChartMonth(d)
            }} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-white">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-zinc-300 font-mono px-2 capitalize min-w-[140px] text-center">{monthLabel}</span>
            <button onClick={() => {
              const d = new Date(chartMonth); d.setMonth(d.getMonth() + 1); setChartMonth(d)
            }} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-white">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            {!isCurrentMonth && (
              <button onClick={() => {
                const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); setChartMonth(d)
              }} className="text-[10px] text-pink-400 hover:text-pink-300 px-2 py-1 rounded hover:bg-pink-500/10 ml-1">
                Actual
              </button>
            )}
          </div>
        </div>

        {habits.length === 0 ? (
          <p className="text-sm text-zinc-600 text-center py-8">Aún sin hábitos para graficar.</p>
        ) : (
          <GlobalTrendChart habits={habits} monthAnchor={chartMonth} />
        )}
      </section>
    </motion.div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, color, icon }: { label: string; value: string; color: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4" style={{ borderLeftColor: color, borderLeftWidth: 3 }}>
      <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1">
        {icon}{label}
      </p>
      <p className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</p>
    </div>
  )
}

interface GlobalTrendChartProps {
  habits: Habit[]
  monthAnchor: Date    // first day of the month to show
}

function GlobalTrendChart({ habits, monthAnchor }: GlobalTrendChartProps) {
  const year = monthAnchor.getFullYear()
  const monthIdx = monthAnchor.getMonth()
  const totalDays = daysInMonth(year, monthIdx)
  const today = new Date(); today.setHours(0, 0, 0, 0)

  // Build per-habit sets once — both completed AND skipped, so the chart can
  // exclude skipped days from the denominator (they don't count for/against).
  const completedSets = useMemo(() => habits.map((h) => new Set(h.completedDates)), [habits])
  const skippedSets = useMemo(() => habits.map((h) => new Set(h.skippedDates ?? [])), [habits])
  const totalHabits = habits.length

  // For each day of the month (up to today): daily score =
  //   completed / (totalHabits − skipped)
  // Skipped habits are excluded from the average so "no entreno los domingos"
  // doesn't drag your score down. If ALL habits are skipped that day, the
  // score is null (no data point rendered).
  const series = useMemo(() => {
    if (totalHabits === 0) return []
    // Argentinian convention: L Ma Mi J V S D, using single letters with
    // duplicate M acceptable since position disambiguates.
    const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
    const data: { day: number; date: string; dailyScore: number | null; dayLetter: string }[] = []
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, monthIdx, day)
      d.setHours(0, 0, 0, 0)
      if (d.getTime() > today.getTime()) break
      const dateStr = dateToStr(d)
      const doneCount    = completedSets.reduce((acc, s) => acc + (s.has(dateStr) ? 1 : 0), 0)
      const skippedCount = skippedSets.reduce((acc, s) => acc + (s.has(dateStr) ? 1 : 0), 0)
      const denominator = totalHabits - skippedCount
      const score = denominator > 0 ? Math.round((doneCount / denominator) * 100) : null
      data.push({ day, date: dateStr, dailyScore: score, dayLetter: DAY_LETTERS[d.getDay()] })
    }
    return data
  }, [completedSets, skippedSets, year, monthIdx, totalDays, today, totalHabits])

  if (series.length === 0) {
    return (
      <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-6 text-center text-xs text-zinc-600">
        Sin datos este mes
      </div>
    )
  }

  // Stats — exclude days where dailyScore is null (all habits skipped).
  const scored = series.filter((s): s is typeof series[number] & { dailyScore: number } => s.dailyScore !== null)
  const monthAvg = scored.length > 0
    ? Math.round(scored.reduce((a, b) => a + b.dailyScore, 0) / scored.length)
    : 0
  const todayScore = series[series.length - 1].dailyScore ?? 0
  const perfectDays = scored.filter((p) => p.dailyScore === 100).length
  const zeroDays    = scored.filter((p) => p.dailyScore === 0).length

  // Color the average based on score
  const avgColor = monthAvg >= 75 ? '#10b981' : monthAvg >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-5">
      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatChip label="Nota mensual" value={`${monthAvg}%`} color={avgColor} highlight />
        <StatChip label="Nota hoy" value={`${todayScore}%`} color={todayScore >= 75 ? '#10b981' : todayScore >= 50 ? '#f59e0b' : '#ef4444'} />
        <StatChip label="Días perfectos" value={`${perfectDays}d`} color="#10b981" />
        <StatChip label="Días en cero" value={`${zeroDays}d`} color="#ef4444" />
      </div>

      {/* Chart */}
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 8, left: -20, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            {/* Two-row X axis tick: day number on top, day-of-week letter below.
                Saturdays/Sundays get a softer tint so weekly patterns pop. */}
            <XAxis
              dataKey="day"
              interval={0}
              height={36}
              tick={(props) => {
                const { x, y, payload } = props
                const item = series.find((s) => s.day === payload.value)
                const letter = item?.dayLetter ?? ''
                const isWeekend = letter === 'S' || letter === 'D'
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text x={0} y={0} dy={10} textAnchor="middle"
                      fontSize={10} fill={isWeekend ? '#a1a1aa' : '#71717a'}
                      fontWeight={isWeekend ? 600 : 400}>
                      {payload.value}
                    </text>
                    <text x={0} y={0} dy={22} textAnchor="middle"
                      fontSize={8} fill={isWeekend ? '#a1a1aa' : '#52525b'}
                      fontWeight={isWeekend ? 600 : 400}>
                      {letter}
                    </text>
                  </g>
                )
              }}
            />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#71717a' }} width={32}
              tickFormatter={(v) => `${v}%`} />
            <Tooltip
              contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
              labelFormatter={(d) => {
                const item = series.find((s) => s.day === d)
                return item ? `Día ${d} (${item.dayLetter})` : `Día ${d}`
              }}
              formatter={(v) => [`${v}%`, 'Cumplimiento'] as [string, string]}
            />
            {/* Daily completion — single bold colored line */}
            <Line type="monotone" dataKey="dailyScore" stroke={avgColor} strokeWidth={2.5}
              dot={{ r: 3, fill: avgColor }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend — single indicator */}
      <div className="flex items-center justify-center gap-5 mt-3 text-[10px] font-mono text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-px" style={{ background: avgColor, height: 2 }} />
          % de hábitos cumplidos por día
        </span>
      </div>
    </div>
  )
}

function StatChip({ label, value, color, highlight }: { label: string; value: string; color: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? 'bg-zinc-900 border-2' : 'bg-zinc-900/70 border'}`}
      style={{ borderColor: highlight ? color : '#27272a' }}>
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-2xl font-extrabold tabular-nums mt-0.5" style={{ color }}>{value}</p>
    </div>
  )
}
