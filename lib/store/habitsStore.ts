'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Habit {
  id: string
  name: string
  icon: string
  color: string
  targetDays: number[]      // 0=Sun…6=Sat, empty = every day
  completedDates: string[]  // 'YYYY-MM-DD' — days this habit was DONE
  /** Days this habit was explicitly SKIPPED (N/A — doesn't count for/against
   *  the daily average). Use case: "no entreno los domingos", "journal trading
   *  solo entre semana", etc. A skipped day is excluded from both numerator
   *  AND denominator when computing daily completion %. */
  skippedDates?: string[]
  category: string
  createdAt: string
}

function genId() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3) }
function dateToStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function todayStr() { return dateToStr(new Date()) }
function getLast(n: number): string[] {
  const today = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    return dateToStr(d)
  })
}

const DEMO_HABITS: Habit[] = [
  { id: '1', name: 'Tomar agua (2L)', icon: '💧', color: '#3b82f6', targetDays: [], completedDates: getLast(6), category: 'Salud',         createdAt: todayStr() },
  { id: '2', name: 'Entrenar',         icon: '🏋️', color: '#f59e0b', targetDays: [1,3,5], completedDates: getLast(4), category: 'Fitness',  createdAt: todayStr() },
  { id: '3', name: 'Meditar 10min',    icon: '🧘', color: '#8b5cf6', targetDays: [], completedDates: getLast(3), category: 'Mente',        createdAt: todayStr() },
  { id: '4', name: 'Leer 30min',       icon: '📚', color: '#10b981', targetDays: [], completedDates: getLast(5), category: 'Productividad',createdAt: todayStr() },
  { id: '5', name: 'Sin azúcar',       icon: '🥗', color: '#ec4899', targetDays: [], completedDates: getLast(2), category: 'Nutrición',    createdAt: todayStr() },
]

interface State {
  habits: Habit[]
  addHabit: (h: Omit<Habit, 'id' | 'createdAt' | 'completedDates'>) => string
  removeHabit: (id: string) => void
  renameHabit: (id: string, name: string) => void
  toggleDate: (id: string, date: string) => void
  /** Reorder habits to match the given ID sequence. Missing IDs are dropped,
   *  unknown IDs are ignored, habits not in the new order get appended at end
   *  in their previous relative order. */
  reorderHabits: (orderedIds: string[]) => void
}

export const useHabitsStore = create<State>()(
  persist(
    (set) => ({
      habits: [],
      addHabit: (h) => {
        const id = genId()
        set((s) => {
          // Pre-fill skipped dates desde el día más viejo registrado en
          // los hábitos existentes hasta AYER. Razón: un hábito nuevo
          // no debería arrastrar para abajo los stats acumulados de las
          // revisiones que ya hizo el usuario. Como los días skipped se
          // excluyen del numerador Y del denominador del % diario, esto
          // hace que el hábito nuevo "no exista" para fechas previas a
          // su creación.
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const todayStrVal = dateToStr(today)
          const skipped: string[] = []
          if (s.habits.length > 0) {
            const earliest = s.habits
              .map((existing) => existing.createdAt)
              .filter(Boolean)
              .sort()[0]
            if (earliest && earliest < todayStrVal) {
              const [ey, em, ed] = earliest.split('-').map(Number)
              const cursor = new Date(ey, em - 1, ed)
              cursor.setHours(0, 0, 0, 0)
              while (cursor < today) {
                skipped.push(dateToStr(cursor))
                cursor.setDate(cursor.getDate() + 1)
              }
            }
          }
          return {
            habits: [
              ...s.habits,
              { ...h, id, createdAt: todayStrVal, completedDates: [], skippedDates: skipped },
            ],
          }
        })
        return id
      },
      removeHabit: (id) => set((s) => ({ habits: s.habits.filter((h) => h.id !== id) })),
      renameHabit: (id, name) => set((s) => ({
        habits: s.habits.map((h) => h.id === id ? { ...h, name } : h),
      })),
      /** 3-state cycle per click:
       *    empty → completed → skipped (N/A) → empty
       *  Skipped days are stored separately and excluded from averages,
       *  so "no entreno los domingos" doesn't penalize your streak. */
      toggleDate: (id, date) => set((s) => ({
        habits: s.habits.map((h) => {
          if (h.id !== id) return h
          const skipped = h.skippedDates ?? []
          const isDone = h.completedDates.includes(date)
          const isSkipped = skipped.includes(date)

          if (!isDone && !isSkipped) {
            // empty → completed
            return { ...h, completedDates: [...h.completedDates, date].sort() }
          }
          if (isDone) {
            // completed → skipped
            return {
              ...h,
              completedDates: h.completedDates.filter((d) => d !== date),
              skippedDates: [...skipped, date].sort(),
            }
          }
          // skipped → empty
          return { ...h, skippedDates: skipped.filter((d) => d !== date) }
        }),
      })),
      reorderHabits: (orderedIds) => set((s) => {
        const byId = new Map(s.habits.map((h) => [h.id, h]))
        const reordered: Habit[] = []
        const used = new Set<string>()
        for (const id of orderedIds) {
          const h = byId.get(id)
          if (h && !used.has(id)) {
            reordered.push(h)
            used.add(id)
          }
        }
        // Append any habit that wasn't in orderedIds (e.g. added since the
        // drag started) at the end, preserving relative order.
        for (const h of s.habits) {
          if (!used.has(h.id)) reordered.push(h)
        }
        return { habits: reordered }
      }),
    }),
    {
      name: 'overseer-habits',
      // Defensive: ensure `skippedDates` exists on every habit pulled from
      // a pre-v2 persisted state (otherwise reads like `h.skippedDates.length`
      // would crash on old data).
      onRehydrateStorage: () => (state) => {
        if (!state || !Array.isArray(state.habits)) return
        state.habits = state.habits.map((h) =>
          Array.isArray(h.skippedDates) ? h : { ...h, skippedDates: [] }
        )
      },
    }
  )
)
