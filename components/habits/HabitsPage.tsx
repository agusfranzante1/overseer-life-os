'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, Plus, Trash2, Flame, Trophy, X,
  ChevronLeft, ChevronRight, TrendingUp, GripVertical, ArrowUpDown, Check, Minus, RotateCcw,
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { useHabitsStore, type Habit } from '@/lib/store/habitsStore'
import { useAppStore } from '@/lib/store/appStore'
import { todayKeyInTz } from '@/lib/utils/dateInTz'
import { useTranslation } from '@/hooks/useTranslation'
import { TargetDaysPicker } from './TargetDaysPicker'

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

/** ¿La fecha dada cae fuera del set de `targetDays` del hábito Y es de
 *  HOY en adelante? Si sí, esa celda queda "deshabilitada" en la grilla
 *  (gris, no clickeable, excluida de stats). Pasado se respeta tal cual
 *  fue marcado — no modificamos datos viejos cuando el user cambia los
 *  días configurados.
 *
 *  - `targetDays === []` significa "todos los días" → nunca off-day.
 *  - Fechas anteriores a `todayStr` siempre devuelven false (historial
 *    intocable).
 *  - `dateStr` debe ser YYYY-MM-DD y `dateObj` el Date correspondiente
 *    (para sacarle el day-of-week sin re-parsear).
 */
function isOffDay(habit: Habit, dateStr: string, dateObj: Date, todayStr: string): boolean {
  if (!habit.targetDays || habit.targetDays.length === 0) return false
  if (dateStr < todayStr) return false
  return !habit.targetDays.includes(dateObj.getDay())
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
  const { t, tArray, locale } = useTranslation()
  const { habits, addHabit, removeHabit, toggleDate, reorderHabits, resetHabitHistory, setHabitReminderTime, setHabitTargetDays } = useHabitsStore()
  const timezone = useAppStore((s) => s.timezone)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', icon: '🎯', color: COLORS[0], category: 'Salud', reminderTime: '', targetDays: [] as number[] })
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeekMonday(new Date()))
  // Día seleccionado para la vista MOBILE (que muestra 1 solo día). En desktop
  // se usa la grilla semanal (weekAnchor); en mobile navegamos día por día con
  // este estado, porque las flechas de semana (±7) no servían para cambiar de
  // día cuando la grilla de 7 está oculta.
  const [selectedDay, setSelectedDay] = useState(() => new Date())
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
      targetDays: form.targetDays,
      reminderTime: form.reminderTime || undefined,
    })
    setForm({ name: '', icon: '🎯', color: COLORS[0], category: 'Salud', reminderTime: '', targetDays: [] })
    setShowForm(false)
  }

  // Date object for "today" en local time — necesario para sacarle el
  // day-of-week y aplicar isOffDay.
  const todayDateObj = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  }, [])
  const doneToday    = habits.filter((h) => h.completedDates.includes(today)).length
  const skippedToday = habits.filter((h) => (h.skippedDates ?? []).includes(today)).length
  // Off-day para HOY: hábito con targetDays no incluye el día actual.
  // Estos no cuentan ni en numerador ni en denominador (≈ skipped pero
  // computado on-the-fly, sin tocar data).
  const offToday     = habits.filter((h) => isOffDay(h, today, todayDateObj, today)).length
  const totalHabits  = habits.length
  // Exclude skipped AND off-day habits from the daily completion denominator.
  const activeToday  = totalHabits - skippedToday - offToday
  const completionRate = activeToday > 0 ? Math.round((doneToday / activeToday) * 100) : 0
  const bestStreak = habits.reduce((max, h) => Math.max(max, computeStreak(h.completedDates)), 0)

  // Week navigation
  const isCurrentWeek = dateToStr(weekAnchor) === dateToStr(startOfWeekMonday(new Date()))
  const weekLabel = `${weekDays[0].getDate()} ${weekDays[0].toLocaleDateString(locale, { month: 'short' })} – ${weekDays[6].getDate()} ${weekDays[6].toLocaleDateString(locale, { month: 'short' })}`

  // Day navigation (mobile)
  const selectedDayStr = dateToStr(selectedDay)
  const isSelectedToday = selectedDayStr === today
  const selectedDayLabel = selectedDay.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })

  // Month navigation
  const isCurrentMonth = chartMonth.getFullYear() === new Date().getFullYear() && chartMonth.getMonth() === new Date().getMonth()
  const monthLabel = chartMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' })

  if (!mounted) {
    return <div className="p-6"><div className="h-8 w-48 bg-white/[0.03] rounded animate-pulse" /></div>
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-6">
      {/* Header — mockup style: título XXL con icon grande y subtítulo
          gris fino. Botones glass + gradient pink el principal. */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight leading-none flex items-center gap-3">
            <Activity className="w-8 h-8 text-pink-400" />
            {t('habits.title')}
          </h1>
          <p className="text-[13px] text-zinc-500">{t('habits.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2.5">
          {habits.length > 1 && (
            <motion.button whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.97 }}
              onClick={() => { setReorderMode((v) => !v); if (showForm) setShowForm(false) }}
              title={reorderMode ? t('habits.done') : t('habits.reorder')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={reorderMode ? {
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.40)',
                color: '#34d399',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
              } : {
                background: 'var(--card-bg)',
                border: '1px solid rgba(255, 255, 255, 0.10)',
                color: '#d4d4d8',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
            >
              {reorderMode ? <Check className="w-4 h-4" /> : <ArrowUpDown className="w-4 h-4" />}
              {reorderMode ? t('habits.done') : t('habits.reorder')}
            </motion.button>
          )}
          {/* Botón principal con gradient rosa → fucsia */}
          <motion.button whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.97 }}
            onClick={() => setShowForm(!showForm)}
            disabled={reorderMode}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #ec4899, #d946ef)',
              boxShadow: '0 0 24px -8px rgba(236, 72, 153, 0.6), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            <Plus className="w-4 h-4" /> {t('habits.newHabit')}
          </motion.button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label={t('habits.todayLabel')} value={`${doneToday}/${totalHabits}`} color="#ec4899" />
        <SummaryCard label={t('habits.completed')} value={`${completionRate}%`} color="#10b981" />
        <SummaryCard label={t('habits.bestStreak')} value={`${bestStreak}d`} color="#f59e0b" icon={<Flame className="w-3 h-3" />} />
        <SummaryCard label={t('habits.title')} value={`${totalHabits}`} color="#6366f1" icon={<Trophy className="w-3 h-3" />} />
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-white/[0.03] border border-white/[0.12] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-200">Nuevo hábito</h3>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nombre del hábito" autoFocus
                className="col-span-2 bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-pink-500" />
              <div>
                <p className="text-xs text-zinc-500 mb-1.5">Icono</p>
                <div className="flex flex-wrap gap-1.5">
                  {ICONS.map((icon) => (
                    <button key={icon} onClick={() => setForm((f) => ({ ...f, icon }))}
                      className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-colors ${form.icon === icon ? 'bg-pink-500/20 border border-pink-500/50' : 'bg-zinc-800 hover:bg-white/[0.08]'}`}>
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
                className="col-span-2 bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-pink-500">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            {/* Hora opcional para recordatorio push. Si la dejás vacía,
                no se manda notificación específica para este hábito (el
                recordatorio nocturno general sigue funcionando si lo
                tenés activado). */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 whitespace-nowrap">
                Recordatorio
              </label>
              <input
                type="time"
                value={form.reminderTime}
                onChange={(e) => setForm((f) => ({ ...f, reminderTime: e.target.value }))}
                className="bg-zinc-800 border border-white/[0.12] rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-pink-500"
              />
              {form.reminderTime && (
                <button
                  onClick={() => setForm((f) => ({ ...f, reminderTime: '' }))}
                  className="text-[10px] text-zinc-500 hover:text-zinc-200 px-1.5"
                  title="Sin recordatorio"
                >
                  ✕
                </button>
              )}
              <span className="text-[10px] text-zinc-600 italic">
                opcional · push a esa hora si no lo marcaste
              </span>
            </div>
            {/* Días en los que aplica el hábito. `[]` = todos los días
                (back-compat: los hábitos viejos no tenían filtro). Si
                marcás un subconjunto, el dispatcher no manda push los
                otros días y los días "no target" no cuentan para stats. */}
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 whitespace-nowrap">
                Días
              </label>
              <TargetDaysPicker
                targetDays={form.targetDays}
                onChange={(days) => setForm((f) => ({ ...f, targetDays: days }))}
              />
              <span className="text-[10px] text-zinc-600 italic">
                p.ej. Journal trading solo entre semana
              </span>
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
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{t('habits.week')}</h2>
          {/* Desktop: navegación SEMANAL (controla la grilla de 7 días). */}
          <div className="hidden md:flex items-center gap-1">
            <button onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}
              className="p-1.5 rounded hover:bg-white/[0.05] text-zinc-500 hover:text-white">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-zinc-400 font-mono px-2 min-w-[140px] text-center">{weekLabel}</span>
            <button onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}
              className="p-1.5 rounded hover:bg-white/[0.05] text-zinc-500 hover:text-white">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            {!isCurrentWeek && (
              <button onClick={() => setWeekAnchor(startOfWeekMonday(new Date()))}
                className="text-[10px] text-pink-400 hover:text-pink-300 px-2 py-1 rounded hover:bg-pink-500/10 ml-1">
                {t('habits.todayLabel')}
              </button>
            )}
          </div>
          {/* Mobile: navegación DÍA POR DÍA (la vista mobile muestra 1 día). */}
          <div className="flex md:hidden items-center gap-1">
            <button onClick={() => setSelectedDay(addDays(selectedDay, -1))}
              className="p-1.5 rounded hover:bg-white/[0.05] text-zinc-500 hover:text-white">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-zinc-400 font-mono px-2 min-w-[120px] text-center capitalize">{selectedDayLabel}</span>
            <button onClick={() => setSelectedDay(addDays(selectedDay, 1))}
              className="p-1.5 rounded hover:bg-white/[0.05] text-zinc-500 hover:text-white">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            {!isSelectedToday && (
              <button onClick={() => setSelectedDay(new Date())}
                className="text-[10px] text-pink-400 hover:text-pink-300 px-2 py-1 rounded hover:bg-pink-500/10 ml-1">
                {t('habits.todayLabel')}
              </button>
            )}
          </div>
        </div>

        {/* Day headers (visible on md+).
            Alineación con los dots:
              - pr-4: matchea el `px-4` que tiene el row de cada habit
                (sin esto los headers quedaban 16px corridos a la derecha).
              - mr-[48px] dentro del inner flex: deja espacio para los
                botones de trash/reset (32px = 2 × w-3.5 con gap-1) +
                el gap-4 (16px) que el row pone entre dots y trash. */}
        <div className="hidden md:flex justify-end mb-2 pr-4">
          <div className="flex gap-1 mr-[48px]">
            {(() => {
              // Días Mon-Sun en el idioma actual. tArray devuelve el array
              // ['Mon'...] o ['Lun'...] desde el diccionario i18n.
              const weekdayLabels = tArray('calendar.weekdaysShort')
              return weekDays.map((d, i) => {
                const isToday = dateToStr(d) === today
                return (
                  <div key={i} className="w-10 text-center">
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? 'text-pink-400' : 'text-zinc-600'}`}>
                      {weekdayLabels[i] ?? ''}
                    </p>
                    <p className={`text-[11px] tabular-nums ${isToday ? 'text-pink-400 font-bold' : 'text-zinc-500'}`}>
                      {d.getDate()}
                    </p>
                  </div>
                )
              })
            })()}
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
                // Card neutral glass — sin color por hábito. El color del
                // hábito SOLO aparece en los dots de los días marcados,
                // así la página entera no se ve sobrecargada de colores
                // distintos compitiendo entre sí.
                style={!isDragging && !isDropTarget ? {
                  background: 'var(--card-bg)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                } : undefined}
                className={`rounded-2xl px-5 py-4 flex items-center gap-4 group transition-all ${
                  isDragging
                    ? 'border-2 border-emerald-500/60 opacity-50 cursor-grabbing bg-white/[0.03]'
                    : isDropTarget
                      ? 'border-2 border-emerald-500/60 bg-emerald-500/5'
                      : 'hover:border-white/[0.14] hover:bg-white/[0.035]'
                } ${reorderMode ? 'cursor-grab select-none' : ''}`}>
                {/* Drag handle — only in reorder mode */}
                {reorderMode && (
                  <GripVertical className="w-4 h-4 text-zinc-500 shrink-0" />
                )}
                {/* Icon badge — círculo neutro glass con el emoji adentro.
                    Sin tinte de color del hábito para no saturar visualmente. */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                    style={{
                      background: 'var(--card-bg)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    <span>{habit.icon}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-white truncate">{habit.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-zinc-500">{habit.category}</span>
                      {streak > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-amber-400">
                          <Flame className="w-3 h-3" />{streak}d
                        </span>
                      )}
                      {/* Mini-input para editar la hora del recordatorio
                          directamente desde la fila. Si está vacío, no
                          hay push específico para este hábito. */}
                      <label className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
                        <span className="opacity-50">🔔</span>
                        <input
                          type="time"
                          value={habit.reminderTime ?? ''}
                          onChange={(e) => setHabitReminderTime(habit.id, e.target.value || undefined)}
                          className="bg-transparent border-0 outline-none text-zinc-400 hover:text-zinc-200 cursor-pointer w-[60px]"
                          title={habit.reminderTime
                            ? `Push diario a las ${habit.reminderTime} si no lo marcaste`
                            : 'Agregar recordatorio'
                          }
                        />
                        {habit.reminderTime && (
                          <button
                            onClick={(e) => { e.preventDefault(); setHabitReminderTime(habit.id, undefined) }}
                            className="text-zinc-600 hover:text-red-400"
                            title="Sin recordatorio"
                          >
                            ✕
                          </button>
                        )}
                      </label>
                    </div>
                  </div>
                </div>

                {/* Days picker — slot propio FUERA del meta row para que
                    el 📅 quede en la misma columna en TODAS las filas.
                    Si lo dejábamos dentro del meta row, los items
                    variables (streak `2d`/`11d`/vacío, time `--:--`/`08:00`)
                    lo corrían de lugar y se veía desalineado entre filas.
                    Ahora `shrink-0` + posición fija a la izquierda del
                    weekly grid → alineación perfecta. */}
                <div className="shrink-0">
                  <TargetDaysPicker
                    targetDays={habit.targetDays}
                    onChange={(days) => setHabitTargetDays(habit.id, days)}
                    compact
                  />
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
                    // Día "off" según targetDays: aplica de HOY en adelante,
                    // nunca afecta pasado. Si está off → celda gris no
                    // clickeable, no se puede marcar, no cuenta para stats.
                    const off = isOffDay(habit, ds, weekDays[i], today)
                    const nextLabel = done ? 'marcar como N/A (no cuenta)'
                      : skipped ? 'volver a vacío'
                      : 'marcar como hecho'
                    if (off) {
                      return (
                        <div
                          key={ds}
                          title={`${weekDays[i].toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })} — día deshabilitado para este hábito`}
                          className={`w-10 h-10 rounded-lg flex items-center justify-center bg-black/20 border border-zinc-900 cursor-not-allowed ${isToday ? 'ring-1 ring-pink-500/40' : ''}`}
                        >
                          <Minus className="w-3 h-3 text-zinc-700" />
                        </div>
                      )
                    }
                    return (
                      <button key={ds}
                        onClick={() => toggleDate(habit.id, ds)}
                        disabled={reorderMode}
                        title={`${weekDays[i].toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })} — click para ${nextLabel}`}
                        className={`group w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-110 ${future ? 'opacity-40' : ''}`}
                        style={{
                          // Mockup style: celda con glow del color del hábito
                          // cuando está completed (más vivo, no más blanco
                          // plano). Vacía = ring del color sutil. Hoy = ring
                          // brillante extra.
                          background: done
                            ? `radial-gradient(circle at 50% 50%, ${habit.color}55, ${habit.color}22)`
                            : 'var(--card-bg)',
                          border: done
                            ? `1px solid ${habit.color}99`
                            : isToday
                              ? `1px solid ${habit.color}66`
                              : '1px solid rgba(255,255,255,0.08)',
                          boxShadow: done
                            ? `0 0 16px -2px ${habit.color}88, inset 0 1px 0 rgba(255,255,255,0.10)`
                            : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                        }}>
                        {skipped ? (
                          <Minus className="w-4 h-4 text-zinc-500" />
                        ) : done ? (
                          // Dot coloreado vivo con halo del color del hábito.
                          <div
                            className="rounded-full"
                            style={{
                              width: 14,
                              height: 14,
                              background: habit.color,
                              boxShadow: `0 0 8px ${habit.color}, inset 0 1px 0 rgba(255,255,255,0.30)`,
                            }}
                          />
                        ) : (
                          // Anillo coloreado fino — vacía.
                          <div
                            className="rounded-full"
                            style={{
                              width: 12,
                              height: 12,
                              border: `1.5px solid ${habit.color}66`,
                              backgroundColor: 'transparent',
                            }}
                          />
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Mobile fallback: tri-state toggle para el DÍA SELECCIONADO
                    (no siempre hoy — se navega con las flechas de día arriba). */}
                {(() => {
                  const skippedToday = (habit.skippedDates ?? []).includes(selectedDayStr)
                  const doneTodayHabit = habit.completedDates.includes(selectedDayStr)
                  const offTodayHabit = isOffDay(habit, selectedDayStr, selectedDay, today)
                  if (offTodayHabit) {
                    return (
                      <div
                        title="Día deshabilitado para este hábito"
                        className="md:hidden shrink-0 rounded-lg flex items-center justify-center w-10 h-10 bg-black/20 border border-zinc-900 cursor-not-allowed"
                      >
                        <Minus className="w-3 h-3 text-zinc-700" />
                      </div>
                    )
                  }
                  return (
                    <button onClick={() => toggleDate(habit.id, selectedDayStr)}
                      disabled={reorderMode}
                      className={`md:hidden shrink-0 rounded-lg flex items-center justify-center transition-all w-10 h-10 hover:ring-1 hover:ring-white/70 ${reorderMode ? 'opacity-40 pointer-events-none' : ''}`}
                      // Mismo lenguaje que el desktop: celda negra, punto
                      // blanco sólido cuando está hecho, anillo blanco hueco
                      // cuando está vacío. Hover = anillo blanco grueso + glow.
                      style={{ backgroundColor: '#000000' }}>
                      {skippedToday ? (
                        <Minus className="w-4 h-4 text-zinc-500" />
                      ) : doneTodayHabit ? (
                        <div className="rounded-full" style={{ width: 16, height: 16, backgroundColor: '#ffffff' }} />
                      ) : (
                        <div className="rounded-full" style={{ width: 16, height: 16, border: '2px solid #ffffff', backgroundColor: 'transparent' }} />
                      )}
                    </button>
                  )
                })()}

                {/* Reset history + Delete — ambos hidden en reorder mode
                    para evitar clicks accidentales. Aparecen al hover de
                    la fila. */}
                {!reorderMode && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => {
                        const ok = confirm(
                          `¿Resetear el historial de "${habit.name}"?\n\n` +
                          `Esto borra todas las marcas pasadas (✓ y N/A) y deja el hábito como si lo hubieras creado HOY. ` +
                          `Los días anteriores quedan marcados como N/A (no afectan tus stats). La fecha de creación original no se toca.\n\n` +
                          `No se puede deshacer.`
                        )
                        if (ok) resetHabitHistory(habit.id)
                      }}
                      title="Resetear historial — marca todo lo pasado como N/A para no afectar stats"
                      className="shrink-0 text-zinc-700 hover:text-amber-400 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => removeHabit(habit.id)}
                      title="Borrar hábito"
                      className="shrink-0 text-zinc-700 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </motion.div>
            )
          })}

          {habits.length === 0 && (
            <p className="text-sm text-zinc-600 text-center py-8">
              {t('habits.noHabitsYet')}
            </p>
          )}
        </div>
      </section>

      {/* Monthly trend charts */}
      <section className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-zinc-400" /> Cumplimiento diario · mensual
          </h2>
          <div className="flex items-center gap-1">
            <button onClick={() => {
              const d = new Date(chartMonth); d.setMonth(d.getMonth() - 1); setChartMonth(d)
            }} className="p-1.5 rounded hover:bg-white/[0.05] text-zinc-500 hover:text-white">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-zinc-300 font-mono px-2 capitalize min-w-[140px] text-center">{monthLabel}</span>
            <button onClick={() => {
              const d = new Date(chartMonth); d.setMonth(d.getMonth() + 1); setChartMonth(d)
            }} className="p-1.5 rounded hover:bg-white/[0.05] text-zinc-500 hover:text-white">
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
    <div
      className="rounded-2xl p-5 transition-all hover:scale-[1.01]"
      style={{
        background: `
          radial-gradient(circle at 0% 0%, ${color}1f, transparent 50%),
          rgba(255, 255, 255, 0.025)
        `,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 1px 2px rgba(0,0,0,0.2)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        {/* Icon badge cuadrado coloreado */}
        {icon && (
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              background: `${color}22`,
              border: `1px solid ${color}40`,
              color,
            }}
          >
            {icon}
          </div>
        )}
        <p className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-semibold">
          {label}
        </p>
      </div>
      <p className="text-3xl font-bold tracking-tight tabular-nums" style={{ color }}>{value}</p>
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
  //   completed / (totalHabits − skipped − off)
  // Skipped habits are excluded so "no entreno los domingos" no penaliza.
  // Off-day = hábito con targetDays que NO incluye ese día — pero SOLO
  // aplica desde HOY en adelante (pasado intacto, así no rebuilden la
  // historia al cambiar la config de días). Si ALL habits están skipped
  // o off ese día, el score es null (no data point).
  const todayStr = useMemo(() => dateToStr(today), [today])
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
      // Off-count: solo si la fecha es HOY o futura (acá la serie corta en
      // today, así que en la práctica solo aplica al último bucket).
      const offCount = dateStr >= todayStr
        ? habits.reduce((acc, h) => acc + (isOffDay(h, dateStr, d, todayStr) ? 1 : 0), 0)
        : 0
      const denominator = totalHabits - skippedCount - offCount
      const score = denominator > 0 ? Math.round((doneCount / denominator) * 100) : null
      data.push({ day, date: dateStr, dailyScore: score, dayLetter: DAY_LETTERS[d.getDay()] })
    }
    return data
  }, [completedSets, skippedSets, year, monthIdx, totalDays, today, todayStr, totalHabits, habits])

  if (series.length === 0) {
    return (
      <div className="bg-black/30 border border-white/[0.08] rounded-2xl p-6 text-center text-xs text-zinc-600">
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
    <div className="bg-black/30 border border-white/[0.08] rounded-2xl p-5">
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
              contentStyle={{ background: 'var(--surface-popover)', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
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
    <div className={`rounded-2xl p-3 ${highlight ? 'bg-white/[0.03] border-2' : 'bg-white/[0.03]/70 border'}`}
      style={{ borderColor: highlight ? color : '#27272a' }}>
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-2xl font-extrabold tabular-nums mt-0.5" style={{ color }}>{value}</p>
    </div>
  )
}
