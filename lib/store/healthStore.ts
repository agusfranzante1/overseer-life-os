'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HealthSnapshot {
  date: string          // YYYY-MM-DD (local day)
  steps: number
  sleepMinutes: number  // total asleep = core + deep + rem
  sleepStart?: string   // ISO datetime
  sleepEnd?: string     // ISO datetime
  sleepInBedMinutes?: number
  sleepCoreMinutes?: number
  sleepDeepMinutes?: number
  sleepRemMinutes?: number
  sleepAwakeMinutes?: number
  restingHR?: number    // bpm
  hrv?: number          // ms (SDNN from Apple Health)
  source: 'shortcut' | 'manual'
  syncedAt: number      // Date.now() of last update
}

export interface HealthBaseline {
  restingHR?: number       // 14-day median
  hrv?: number             // 14-day median
  sleepGoalMinutes: number // user-configured target
}

interface HealthState {
  snapshots: Record<string, HealthSnapshot>
  baseline: HealthBaseline
  lastSyncAt: number | null

  upsertSnapshot: (s: HealthSnapshot) => void
  removeSnapshot: (date: string) => void
  setSleepGoal: (minutes: number) => void
  hydrateFromServer: () => Promise<void>
  computeBaseline: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function median(nums: number[]): number | undefined {
  const filtered = nums.filter((n) => Number.isFinite(n) && n > 0)
  if (filtered.length === 0) return undefined
  const sorted = [...filtered].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useHealthStore = create<HealthState>()(
  persist(
    (set, get) => ({
      snapshots: {},
      baseline: { sleepGoalMinutes: 480 }, // 8h default
      lastSyncAt: null,

      upsertSnapshot: (s) => {
        set((state) => ({
          snapshots: { ...state.snapshots, [s.date]: { ...state.snapshots[s.date], ...s } },
        }))
        get().computeBaseline()
      },

      removeSnapshot: (date) =>
        set((state) => {
          const next = { ...state.snapshots }
          delete next[date]
          return { snapshots: next }
        }),

      setSleepGoal: (minutes) =>
        set((state) => ({ baseline: { ...state.baseline, sleepGoalMinutes: minutes } })),

      computeBaseline: () => {
        const snaps = Object.values(get().snapshots)
        // 14-day window ending today
        const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
        const recent = snaps.filter((s) => {
          const t = new Date(s.date + 'T12:00:00').getTime()
          return t >= cutoff
        })
        const hrvMed = median(recent.map((s) => s.hrv ?? NaN))
        const rhrMed = median(recent.map((s) => s.restingHR ?? NaN))
        set((state) => ({
          baseline: {
            ...state.baseline,
            hrv: hrvMed,
            restingHR: rhrMed,
          },
        }))
      },

      hydrateFromServer: async () => {
        try {
          const res = await fetch('/api/health/range?days=90', { cache: 'no-store' })
          if (!res.ok) return
          const data: HealthSnapshot[] = await res.json()
          const map: Record<string, HealthSnapshot> = {}
          for (const s of data) map[s.date] = s
          set((state) => ({
            snapshots: { ...state.snapshots, ...map },
            lastSyncAt: Date.now(),
          }))
          get().computeBaseline()
        } catch {
          /* silently fail — offline-friendly */
        }
      },
    }),
    { name: 'overseer-health' }
  )
)

// ─── Selectors (pure, used by components) ─────────────────────────────────────

export function getTodaySnapshot(snapshots: Record<string, HealthSnapshot>): HealthSnapshot | undefined {
  return snapshots[todayKey()]
}

export function getRangeSnapshots(
  snapshots: Record<string, HealthSnapshot>,
  days: number
): HealthSnapshot[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return Object.values(snapshots)
    .filter((s) => new Date(s.date + 'T12:00:00').getTime() >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export { todayKey }
