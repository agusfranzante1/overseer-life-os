'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export interface WorkoutSet {
  id: string
  weight: number
  unit: 'kg' | 'lb'
  reps: number
  timestamp: string
}

export interface WorkoutExercise {
  id: string
  name: string
  muscleGroup: string
  sets: WorkoutSet[]
}

export interface WorkoutSession {
  id: string
  date: string
  name: string
  routineId?: string
  exercises: WorkoutExercise[]
  startedAt: string
  endedAt?: string
  notes?: string
}

export interface WeightEntry {
  id: string
  date: string         // YYYY-MM-DD
  kg: number
  note?: string
  createdAt: string
}

export type GymType = 'home' | 'commercial'
export type TrainingPhase = 'cut' | 'maintenance' | 'bulk'

export interface RoutineExercise {
  id: string
  name: string
  muscleGroup: string
  targetSets: number
  targetReps: string
  targetWeight?: string
  notes?: string
}

export interface GymRoutine {
  id: string
  name: string
  dayLabel: string
  exercises: RoutineExercise[]
}

interface GymState {
  routines: GymRoutine[]
  sessions: WorkoutSession[]
  activeSession: WorkoutSession | null
  currentExerciseName: string | null

  // Body weight tracking
  weightEntries: WeightEntry[]
  weightGoalKg: number | null
  gymType: GymType
  phase: TrainingPhase

  setGymType: (t: GymType) => void
  setPhase: (p: TrainingPhase) => void
  setWeightGoal: (kg: number | null) => void
  addWeightEntry: (kg: number, note?: string, date?: string) => void
  updateWeightEntry: (id: string, patch: Partial<WeightEntry>) => void
  removeWeightEntry: (id: string) => void

  // Session actions
  startSession: (name?: string, routineId?: string) => WorkoutSession
  endSession: () => void
  cancelSession: () => void
  addExerciseToSession: (name: string, muscleGroup?: string) => WorkoutExercise | null
  addSetToExercise: (exerciseName: string, weight: number, reps: number, unit?: 'kg' | 'lb') => boolean
  setCurrentExercise: (name: string) => WorkoutExercise | null
  deleteSession: (id: string) => void

  // Routine actions
  addRoutine: (name: string, dayLabel: string) => string
  updateRoutine: (id: string, patch: Partial<GymRoutine>) => void
  addExerciseToRoutine: (routineId: string, exercise: Omit<RoutineExercise, 'id'>) => void
  removeExerciseFromRoutine: (routineId: string, exerciseId: string) => void
  deleteRoutine: (id: string) => void
}

function todayLocalStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const DEMO_ROUTINES: GymRoutine[] = [
  {
    id: 'routine_push',
    name: 'Push Day',
    dayLabel: 'Pecho / Hombros / Tríceps',
    exercises: [
      { id: 'e1', name: 'Press banca', muscleGroup: 'Pecho', targetSets: 4, targetReps: '6-8', targetWeight: '80kg' },
      { id: 'e2', name: 'Press inclinado mancuernas', muscleGroup: 'Pecho', targetSets: 3, targetReps: '10-12' },
      { id: 'e3', name: 'Press militar', muscleGroup: 'Hombros', targetSets: 3, targetReps: '8-10' },
      { id: 'e4', name: 'Elevaciones laterales', muscleGroup: 'Hombros', targetSets: 4, targetReps: '12-15' },
      { id: 'e5', name: 'Tríceps polea', muscleGroup: 'Tríceps', targetSets: 3, targetReps: '12-15' },
    ],
  },
  {
    id: 'routine_pull',
    name: 'Pull Day',
    dayLabel: 'Espalda / Bíceps',
    exercises: [
      { id: 'e6', name: 'Dominadas', muscleGroup: 'Espalda', targetSets: 4, targetReps: '6-10' },
      { id: 'e7', name: 'Remo con barra', muscleGroup: 'Espalda', targetSets: 4, targetReps: '8-10' },
      { id: 'e8', name: 'Jalón al pecho', muscleGroup: 'Espalda', targetSets: 3, targetReps: '10-12' },
      { id: 'e9', name: 'Curl bíceps barra', muscleGroup: 'Bíceps', targetSets: 3, targetReps: '10-12' },
      { id: 'e10', name: 'Curl martillo', muscleGroup: 'Bíceps', targetSets: 3, targetReps: '12' },
    ],
  },
  {
    id: 'routine_legs',
    name: 'Legs Day',
    dayLabel: 'Piernas / Glúteos',
    exercises: [
      { id: 'e11', name: 'Sentadilla', muscleGroup: 'Cuádriceps', targetSets: 4, targetReps: '6', targetWeight: '90kg' },
      { id: 'e12', name: 'Peso muerto rumano', muscleGroup: 'Isquiotibiales', targetSets: 3, targetReps: '8', targetWeight: '70kg' },
      { id: 'e13', name: 'Prensa', muscleGroup: 'Cuádriceps', targetSets: 3, targetReps: '10', targetWeight: '120kg' },
      { id: 'e14', name: 'Zancadas', muscleGroup: 'Glúteos', targetSets: 3, targetReps: '12 c/pierna' },
      { id: 'e15', name: 'Gemelos', muscleGroup: 'Pantorrillas', targetSets: 4, targetReps: '15', targetWeight: '45kg' },
    ],
  },
]

export const useGymStore = create<GymState>()(
  persist(
    (set, get) => ({
      routines: DEMO_ROUTINES,
      sessions: [],
      activeSession: null,
      currentExerciseName: null,

      weightEntries: [],
      weightGoalKg: null,
      gymType: 'home',
      phase: 'maintenance',

      setGymType: (t) => set({ gymType: t }),
      setPhase: (p) => set({ phase: p }),
      setWeightGoal: (kg) => set({ weightGoalKg: kg }),
      addWeightEntry: (kg, note, date) => {
        const d = date ?? todayLocalStr()
        set((s) => {
          // Replace existing entry for same date
          const filtered = s.weightEntries.filter((e) => e.date !== d)
          const entry: WeightEntry = {
            id: genId(), kg, note, date: d, createdAt: new Date().toISOString(),
          }
          return {
            weightEntries: [entry, ...filtered].sort((a, b) => b.date.localeCompare(a.date)),
          }
        })
      },
      updateWeightEntry: (id, patch) => set((s) => ({
        weightEntries: s.weightEntries.map((e) => e.id === id ? { ...e, ...patch } : e),
      })),
      removeWeightEntry: (id) => set((s) => ({
        weightEntries: s.weightEntries.filter((e) => e.id !== id),
      })),

      startSession: (name, routineId) => {
        const session: WorkoutSession = {
          id: genId(),
          date: todayLocalStr(),
          name: name ?? `Sesión ${new Date().toLocaleDateString('es-AR')}`,
          routineId,
          exercises: [],
          startedAt: new Date().toISOString(),
        }
        set({ activeSession: session })
        return session
      },

      endSession: () => {
        const { activeSession } = get()
        if (!activeSession) return
        const ended = { ...activeSession, endedAt: new Date().toISOString() }
        set((s) => ({
          sessions: [ended, ...s.sessions],
          activeSession: null,
          currentExerciseName: null,
        }))
      },

      cancelSession: () => {
        // Discard the active session without saving to history
        set({ activeSession: null, currentExerciseName: null })
      },

      addExerciseToSession: (name, muscleGroup) => {
        const { activeSession } = get()
        if (!activeSession) return null
        const existing = activeSession.exercises.find(
          (e) => e.name.toLowerCase() === name.toLowerCase()
        )
        if (existing) return existing
        const exercise: WorkoutExercise = {
          id: genId(),
          name,
          muscleGroup: muscleGroup ?? 'General',
          sets: [],
        }
        const updated = {
          ...activeSession,
          exercises: [...activeSession.exercises, exercise],
        }
        set({ activeSession: updated })
        return exercise
      },

      addSetToExercise: (exerciseName, weight, reps, unit = 'kg') => {
        const { activeSession, currentExerciseName } = get()
        if (!activeSession) return false

        // Resolve exercise name: use provided, fall back to current, then last in session
        const resolvedName = exerciseName
          || currentExerciseName
          || activeSession.exercises.slice(-1)[0]?.name

        if (!resolvedName) return false

        const lower = resolvedName.toLowerCase()
        let exercise = activeSession.exercises.find(
          (e) => e.name.toLowerCase().includes(lower) || lower.includes(e.name.toLowerCase())
        )

        const newSet: WorkoutSet = {
          id: genId(),
          weight,
          unit,
          reps,
          timestamp: new Date().toISOString(),
        }

        let updatedExercises: WorkoutExercise[]
        if (!exercise) {
          // Create exercise on the fly
          const muscleGroup = inferMuscleGroup(resolvedName)
          exercise = { id: genId(), name: resolvedName, muscleGroup, sets: [newSet] }
          updatedExercises = [...activeSession.exercises, exercise]
        } else {
          updatedExercises = activeSession.exercises.map((e) =>
            e.id === exercise!.id ? { ...e, sets: [...e.sets, newSet] } : e
          )
        }

        set({
          activeSession: { ...activeSession, exercises: updatedExercises },
          currentExerciseName: exercise.name,
        })
        return true
      },

      setCurrentExercise: (name) => {
        const { activeSession } = get()
        if (!activeSession) return null
        const muscleGroup = inferMuscleGroup(name)
        const exercise = get().addExerciseToSession(name, muscleGroup)
        set({ currentExerciseName: name })
        return exercise
      },

      deleteSession: (id) =>
        set((s) => ({ sessions: s.sessions.filter((sess) => sess.id !== id) })),

      addRoutine: (name, dayLabel) => {
        const id = genId()
        set((s) => ({
          routines: [...s.routines, { id, name, dayLabel, exercises: [] }],
        }))
        return id
      },

      updateRoutine: (id, patch) =>
        set((s) => ({
          routines: s.routines.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),

      addExerciseToRoutine: (routineId, exercise) => {
        const id = genId()
        set((s) => ({
          routines: s.routines.map((r) =>
            r.id === routineId
              ? { ...r, exercises: [...r.exercises, { ...exercise, id }] }
              : r
          ),
        }))
      },

      removeExerciseFromRoutine: (routineId, exerciseId) =>
        set((s) => ({
          routines: s.routines.map((r) =>
            r.id === routineId
              ? { ...r, exercises: r.exercises.filter((e) => e.id !== exerciseId) }
              : r
          ),
        })),

      deleteRoutine: (id) =>
        set((s) => ({ routines: s.routines.filter((r) => r.id !== id) })),
    }),
    { name: 'overseer-gym' }
  )
)

function inferMuscleGroup(name: string): string {
  const lower = name.toLowerCase()
  if (/bícep|bicep|curl/.test(lower)) return 'Bíceps'
  if (/espalda|remo|jalón|dominada|jalones|lat/.test(lower)) return 'Espalda'
  if (/pecho|press banca|press inclinado|aperturas/.test(lower)) return 'Pecho'
  if (/hombro|press militar|elevacion|lateral/.test(lower)) return 'Hombros'
  if (/trícep|tricep|fondos/.test(lower)) return 'Tríceps'
  if (/pierna|sentadilla|prensa|cuadricep|isquio|peso muerto/.test(lower)) return 'Piernas'
  if (/glúteo|gluteo|zancada|hip/.test(lower)) return 'Glúteos'
  if (/gemelo|pantorrilla|calf/.test(lower)) return 'Pantorrillas'
  if (/abdomen|plancha|crunch|core/.test(lower)) return 'Core'
  return 'General'
}

// ─── Progressive Overload analysis helpers ────────────────────────────────────

export interface ExerciseHistoryEntry {
  date: string
  sessionId: string
  routineId?: string
  routineName?: string
  sets: WorkoutSet[]
  topSet: WorkoutSet      // heaviest set this session
  maxReps: number          // most reps in any single set
  totalVolume: number      // sum of weight * reps
  estimated1RM: number     // Epley: weight * (1 + reps/30)
}

export type ExerciseTrend = 'progressing' | 'stalled' | 'regressing' | 'new'

export interface ExerciseAnalysis {
  name: string
  muscleGroup: string
  history: ExerciseHistoryEntry[]
  lastDoneDaysAgo: number | null
  trend: ExerciseTrend
  prTopSet: WorkoutSet | null
  recommendation: { kind: 'go' | 'hold' | 'deload' | 'rest' | 'info'; text: string }
}

function epley1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}

/**
 * Returns all sessions where the given exercise was performed, with computed stats.
 * Matches exercise by case-insensitive name (substring tolerant).
 */
export function getExerciseHistory(
  exerciseName: string,
  sessions: WorkoutSession[]
): ExerciseHistoryEntry[] {
  const target = exerciseName.toLowerCase().trim()
  const entries: ExerciseHistoryEntry[] = []
  for (const s of sessions) {
    for (const ex of s.exercises) {
      const exLower = ex.name.toLowerCase()
      const match = exLower === target || exLower.includes(target) || target.includes(exLower)
      if (!match || ex.sets.length === 0) continue
      const topSet = ex.sets.reduce((best, set) => set.weight > best.weight ? set : best, ex.sets[0])
      const maxReps = Math.max(...ex.sets.map((set) => set.reps))
      const totalVolume = ex.sets.reduce((sum, set) => sum + set.weight * set.reps, 0)
      entries.push({
        date: s.date,
        sessionId: s.id,
        routineId: s.routineId,
        routineName: s.name,
        sets: ex.sets,
        topSet,
        maxReps,
        totalVolume,
        estimated1RM: epley1RM(topSet.weight, topSet.reps),
      })
    }
  }
  // Sort ASC by date (oldest first) for chart-friendly output
  return entries.sort((a, b) => a.date.localeCompare(b.date))
}

/** Detects whether the recent trend is going up, flat, or down. */
function detectTrend(history: ExerciseHistoryEntry[]): ExerciseTrend {
  if (history.length === 0) return 'new'
  if (history.length === 1) return 'new'
  const recent = history.slice(-3)
  const rms = recent.map((h) => h.estimated1RM)
  const first = rms[0]
  const last = rms[rms.length - 1]
  if (last > first * 1.025) return 'progressing'    // +2.5% or more
  if (last < first * 0.975) return 'regressing'     // -2.5% or more
  return 'stalled'
}

/**
 * Generates a recommendation for the next session of an exercise, factoring in:
 *   - trend of the exercise (progressing/stalled/regressing)
 *   - training phase (cut/maintenance/bulk)
 *   - recent body weight movement
 */
export function analyzeExercise(
  exerciseName: string,
  muscleGroup: string,
  sessions: WorkoutSession[],
  phase: TrainingPhase,
  bwDelta7d: number | null
): ExerciseAnalysis {
  const history = getExerciseHistory(exerciseName, sessions)
  const trend = detectTrend(history)

  const lastDoneDaysAgo = history.length > 0
    ? Math.floor((Date.now() - new Date(history[history.length - 1].date + 'T12:00:00').getTime()) / 86400000)
    : null

  const prTopSet = history.length > 0
    ? history.reduce((best, h) =>
        h.estimated1RM > epley1RM(best.weight, best.reps) ? h.topSet : best, history[0].topSet)
    : null

  // Build recommendation
  let rec: ExerciseAnalysis['recommendation'] = { kind: 'info', text: 'Sin datos previos. Hacé una serie y guardamos baseline.' }

  if (history.length === 0) {
    rec = { kind: 'info', text: 'Primera vez. Empezá conservador y guardá baseline.' }
  } else {
    const last = history[history.length - 1]
    const top = last.topSet

    if (trend === 'progressing') {
      rec = phase === 'cut'
        ? { kind: 'go', text: `↗ Subiendo ${top.weight}${top.unit}×${top.reps}. En cut: notable. Mantené.` }
        : { kind: 'go', text: `↗ Vas subiendo. Probá ${(top.weight + 2.5).toFixed(1)}${top.unit} esta vez.` }
    }
    else if (trend === 'stalled') {
      // Different advice depending on rep count in target zone
      if (last.maxReps >= 10) {
        rec = { kind: 'go', text: `→ Estancado en ${top.weight}${top.unit}. Llegaste a ${last.maxReps} reps, subí a ${(top.weight + 2.5).toFixed(1)}${top.unit}.` }
      } else if (last.maxReps >= 6 && last.maxReps < 10) {
        rec = { kind: 'hold', text: `→ Estancado en ${top.weight}${top.unit}×${last.maxReps}. Mantené peso, sumá 1 rep esta vez.` }
      } else if (history.length >= 4 && history.slice(-3).every((h) => h.topSet.weight === top.weight)) {
        rec = { kind: 'deload', text: `⏸ 3+ sesiones sin progreso en ${top.weight}${top.unit}. Probá deload (-15% una semana) y volvé fresco.` }
      } else {
        rec = { kind: 'hold', text: `→ Mantené ${top.weight}${top.unit}, buscá +1 rep en el set top.` }
      }
    }
    else if (trend === 'regressing') {
      if (phase === 'cut' && bwDelta7d !== null && bwDelta7d < -0.5) {
        rec = { kind: 'hold', text: `↘ Fuerza bajando (${top.weight}${top.unit}) mientras estás en cut perdiendo ${Math.abs(bwDelta7d).toFixed(1)}kg/sem. Normal. No forzaste PRs.` }
      } else if (phase === 'bulk') {
        rec = { kind: 'rest', text: `↘ Estás bulkeando pero perdés fuerza. Revisá recuperación/sueño/dieta antes de subir cargas.` }
      } else {
        rec = { kind: 'rest', text: `↘ Bajaste a ${top.weight}${top.unit}. Hoy descanso o sesión técnica. Sin PRs forzados.` }
      }
    }
  }

  // Cap on overdue exercises
  if (lastDoneDaysAgo !== null && lastDoneDaysAgo > 14) {
    rec = { kind: 'info', text: `Hace ${lastDoneDaysAgo} días que no hacés "${exerciseName}". Volvé conservador.` }
  }

  return {
    name: exerciseName,
    muscleGroup,
    history,
    lastDoneDaysAgo,
    trend,
    prTopSet,
    recommendation: rec,
  }
}

/** Returns all unique exercises across all routines, deduplicated by lowercase name. */
export function uniqueRoutineExercises(routines: GymRoutine[]): { name: string; muscleGroup: string; routineNames: string[] }[] {
  const map = new Map<string, { name: string; muscleGroup: string; routineNames: Set<string> }>()
  for (const r of routines) {
    for (const ex of r.exercises) {
      const key = ex.name.toLowerCase().trim()
      const existing = map.get(key)
      if (existing) {
        existing.routineNames.add(r.name)
      } else {
        map.set(key, { name: ex.name, muscleGroup: ex.muscleGroup, routineNames: new Set([r.name]) })
      }
    }
  }
  return Array.from(map.values()).map((v) => ({
    name: v.name,
    muscleGroup: v.muscleGroup,
    routineNames: Array.from(v.routineNames),
  }))
}

