'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ProjectionPlan, ProjectionLevel } from '@/lib/projection/types'
import { ALL_TEMPLATES } from '@/lib/projection/templates'

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function emptyPlan(level: ProjectionLevel, periodKey: string): ProjectionPlan {
  const now = new Date().toISOString()
  return {
    id: genId(),
    level,
    periodKey,
    createdAt: now,
    updatedAt: now,
    values: {},
    templateVersion: ALL_TEMPLATES[level].version,
  }
}

interface ProjectionState {
  /** All projection plans (years + quarters + months together). */
  plans: ProjectionPlan[]

  // Lifecycle
  /** Get the plan for a (level, periodKey) pair, creating it lazily if
   *  it doesn't exist. Returns the plan id. */
  getOrCreatePlan: (level: ProjectionLevel, periodKey: string) => string
  /** Update a single field value. */
  updateValue: (planId: string, sectionKey: string, fieldKey: string, value: string) => void
  /** Mark plan as "closed" with mood/notes. Reopenable later by passing closedAt=null. */
  closePlan: (planId: string, args: { mood?: number; notes?: string }) => void
  reopenPlan: (planId: string) => void
  /** Delete a plan entirely (e.g. if filled by mistake). */
  deletePlan: (planId: string) => void

  // Selectors
  /** Returns the plan for (level, periodKey) if it exists. */
  findPlan: (level: ProjectionLevel, periodKey: string) => ProjectionPlan | null
  /** All plans of a given level, sorted by periodKey desc (most recent first). */
  plansByLevel: (level: ProjectionLevel) => ProjectionPlan[]
}

export const useProjectionStore = create<ProjectionState>()(
  persist(
    (set, get) => ({
      plans: [],

      getOrCreatePlan: (level, periodKey) => {
        const existing = get().plans.find((p) => p.level === level && p.periodKey === periodKey)
        if (existing) return existing.id
        const fresh = emptyPlan(level, periodKey)
        set((s) => ({ plans: [fresh, ...s.plans] }))
        return fresh.id
      },

      updateValue: (planId, sectionKey, fieldKey, value) =>
        set((s) => ({
          plans: s.plans.map((p) =>
            p.id !== planId ? p : {
              ...p,
              updatedAt: new Date().toISOString(),
              values: {
                ...p.values,
                [sectionKey]: { ...(p.values[sectionKey] ?? {}), [fieldKey]: value },
              },
            }
          ),
        })),

      closePlan: (planId, args) =>
        set((s) => ({
          plans: s.plans.map((p) =>
            p.id !== planId ? p : {
              ...p,
              closedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              mood: args.mood ?? p.mood,
              notes: args.notes ?? p.notes,
            }
          ),
        })),

      reopenPlan: (planId) =>
        set((s) => ({
          plans: s.plans.map((p) =>
            p.id !== planId ? p : { ...p, closedAt: undefined, updatedAt: new Date().toISOString() }
          ),
        })),

      deletePlan: (planId) =>
        set((s) => ({ plans: s.plans.filter((p) => p.id !== planId) })),

      findPlan: (level, periodKey) => {
        return get().plans.find((p) => p.level === level && p.periodKey === periodKey) ?? null
      },

      plansByLevel: (level) => {
        return get().plans
          .filter((p) => p.level === level)
          .sort((a, b) => b.periodKey.localeCompare(a.periodKey))
      },
    }),
    {
      name: 'overseer-projection',
      partialize: (s) => ({ plans: s.plans }),
      onRehydrateStorage: () => (state) => {
        // Defensive — ensure plans is always an array.
        if (state && !Array.isArray(state.plans)) state.plans = []
      },
    }
  )
)
