'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Habit {
  id: string
  name: string
  icon: string
  color: string
  targetDays: number[]      // 0=Sun…6=Sat, empty = every day
  completedDates: string[]  // 'YYYY-MM-DD'
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
        set((s) => ({ habits: [...s.habits, { ...h, id, createdAt: todayStr(), completedDates: [] }] }))
        return id
      },
      removeHabit: (id) => set((s) => ({ habits: s.habits.filter((h) => h.id !== id) })),
      renameHabit: (id, name) => set((s) => ({
        habits: s.habits.map((h) => h.id === id ? { ...h, name } : h),
      })),
      toggleDate: (id, date) => set((s) => ({
        habits: s.habits.map((h) => {
          if (h.id !== id) return h
          const has = h.completedDates.includes(date)
          return {
            ...h,
            completedDates: has
              ? h.completedDates.filter((d) => d !== date)
              : [...h.completedDates, date].sort(),
          }
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
    { name: 'overseer-habits' }
  )
)
