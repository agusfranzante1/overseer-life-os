'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ProjectionPlan, ProjectionLevel } from '@/lib/projection/types'
import { ALL_TEMPLATES } from '@/lib/projection/templates'

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/** One-time migration: WHEEL_AREAS v2 fuses 'mental' + 'emocional' into
 *  a single 'mental_emocional' area and adds 'hobbies'. This helper walks
 *  a stored plan, merges legacy fields into the new key, and rewrites the
 *  principales CSV + cascade subgoals. Runs on rehydrate so existing data
 *  doesn't get orphaned the moment the user opens the page.
 *
 *  Strategy per surface:
 *   - `eagle.wheel_of_life`: average the two scores into one. Missing
 *     scores fall back to the other side instead of being treated as 0.
 *   - `eagle.eagle_borrador`: concatenate `borrador_mental` +
 *     `borrador_emocional` with a separator into `borrador_mental_emocional`.
 *   - `year.metas_anuales`: concatenate `mental` + `emocional` text into
 *     `mental_emocional`. Same treatment for the `principales` CSV (replace
 *     mental/emocional keys with mental_emocional, dedupe).
 *   - `quarter|month.principal_cascade`: merge `mental_subN` and
 *     `emocional_subN` (N=1..3) into `mental_emocional_subN`. Mental wins
 *     each slot; if mental's slot is empty we promote emocional's. Extras
 *     beyond 3 are dropped (rare in practice — users rarely fill all 6).
 *
 *  Idempotent: once migrated, the legacy fields are deleted so a second
 *  pass on the same data is a no-op. */
function migrateMentalEmocional(plan: ProjectionPlan): ProjectionPlan {
  if (!plan.values) return plan
  let touched = false
  const values: Record<string, Record<string, string>> = { ...plan.values }

  const concatText = (a: string, b: string): string => {
    const ta = (a ?? '').trim()
    const tb = (b ?? '').trim()
    if (ta && tb) return `${ta}\n\n${tb}`
    return ta || tb
  }

  // ── wheel_of_life scores ──
  const wheel = values.wheel_of_life
  if (wheel && (wheel.mental !== undefined || wheel.emocional !== undefined)) {
    const m = wheel.mental !== undefined && wheel.mental !== '' ? parseInt(wheel.mental, 10) : null
    const e = wheel.emocional !== undefined && wheel.emocional !== '' ? parseInt(wheel.emocional, 10) : null
    let merged: string | null = null
    if (m !== null && e !== null) merged = String(Math.round((m + e) / 2))
    else if (m !== null) merged = String(m)
    else if (e !== null) merged = String(e)
    const next = { ...wheel }
    if (merged !== null && !next.mental_emocional) next.mental_emocional = merged
    delete next.mental
    delete next.emocional
    values.wheel_of_life = next
    touched = true
  }

  // ── eagle_borrador ──
  const borr = values.eagle_borrador
  if (borr && (borr.borrador_mental !== undefined || borr.borrador_emocional !== undefined)) {
    const merged = concatText(borr.borrador_mental ?? '', borr.borrador_emocional ?? '')
    const next = { ...borr }
    if (merged && !next.borrador_mental_emocional) next.borrador_mental_emocional = merged
    delete next.borrador_mental
    delete next.borrador_emocional
    values.eagle_borrador = next
    touched = true
  }

  // ── metas_anuales (text + principales CSV) ──
  const metas = values.metas_anuales
  if (metas && (metas.mental !== undefined || metas.emocional !== undefined || metas.principales)) {
    const next = { ...metas }
    if (next.mental !== undefined || next.emocional !== undefined) {
      const merged = concatText(next.mental ?? '', next.emocional ?? '')
      if (merged && !next.mental_emocional) next.mental_emocional = merged
      delete next.mental
      delete next.emocional
      touched = true
    }
    if (next.principales) {
      const keys = next.principales.split(',').filter(Boolean)
      const remapped: string[] = []
      let injected = false
      for (const k of keys) {
        if (k === 'mental' || k === 'emocional') {
          if (!injected) { remapped.push('mental_emocional'); injected = true }
        } else {
          remapped.push(k)
        }
      }
      // Dedupe preserving order.
      const seen = new Set<string>()
      const final = remapped.filter((k) => seen.has(k) ? false : (seen.add(k), true))
      const newCsv = final.join(',')
      if (newCsv !== next.principales) {
        next.principales = newCsv
        touched = true
      }
    }
    values.metas_anuales = next
  }

  // ── principal_cascade (quarter / month sub-goals) ──
  const cascade = values.principal_cascade
  if (cascade && Object.keys(cascade).some((k) => k.startsWith('mental_sub') || k.startsWith('emocional_sub'))) {
    const next = { ...cascade }
    for (let i = 1; i <= 3; i++) {
      const mKey = `mental_sub${i}`
      const eKey = `emocional_sub${i}`
      const mergedKey = `mental_emocional_sub${i}`
      const mVal = (next[mKey] ?? '').trim()
      const eVal = (next[eKey] ?? '').trim()
      // Prefer mental's value for slot i; if absent, promote emocional's.
      const picked = mVal || eVal
      if (picked && !next[mergedKey]) next[mergedKey] = picked
      delete next[mKey]
      delete next[eKey]
    }
    values.principal_cascade = next
    touched = true
  }

  return touched ? { ...plan, values } : plan
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
  /** Replace the selectedLanes array for a plan (used by Vista de Águila). */
  setSelectedLanes: (planId: string, lanes: string[]) => void
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

      setSelectedLanes: (planId, lanes) =>
        set((s) => ({
          plans: s.plans.map((p) =>
            p.id !== planId ? p : {
              ...p,
              updatedAt: new Date().toISOString(),
              selectedLanes: lanes,
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
        if (state?.plans) state.plans = state.plans.map(migrateMentalEmocional)
      },
    }
  )
)
