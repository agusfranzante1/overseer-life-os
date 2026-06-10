'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LabSession, LabSessionStatus, LabBelief, LabBeliefStatus, LabExercise, LabExerciseStep, LabCategory } from '@/lib/lab/types'
import { findExercise as findBuiltInExercise, LAB_EXERCISES, LAB_CATEGORIES, findCategory as findBuiltInCategory } from '@/lib/lab/templates'

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

interface LabState {
  sessions: LabSession[]
  /** Cross-session catalog of detected beliefs. Lives in the 'creencias'
   *  pavilion of the lab but conceptually a first-class entity — the user
   *  adds beliefs from the diagnostic OR by hand, and launches Reencuadre
   *  sessions to work each one. */
  beliefs: LabBelief[]
  /** Ejercicios CUSTOM creados por el user. Se mergean con los built-in
   *  via `findExerciseAnywhere` / `allExercisesByCategory`. Tienen el
   *  mismo shape para que el ExerciseRunner funcione sin cambios. Las
   *  keys arrancan con `custom_` para evitar colisión. */
  customExercises: LabExercise[]
  /** Categorías CUSTOM creadas por el user. Se mergean con las built-in
   *  via los helpers `findCategoryCombined` / `useAllCategories`. Las
   *  keys arrancan con `cat_` para evitar colisión con built-in. */
  customCategories: LabCategory[]

  // Session lifecycle
  /** Create a new session for an exercise. Returns the new session id.
   *  `initialValues` lets you prefill fields (e.g. when launching Reencuadre
   *  from a belief, we prefill the belief text in `pensamiento_inicial`).
   *  `linkedBeliefId` ties this session back to its source belief so the
   *  UI can offer "marcar creencia como resuelta" on close. */
  createSession: (args: {
    exerciseKey: string
    title?: string
    spiSessionId?: string
    linkedBeliefId?: string
    initialValues?: Record<string, Record<string, string>>
  }) => string
  /** Update a single field value inside a session. */
  updateValue: (sessionId: string, stepKey: string, fieldKey: string, value: string) => void
  /** Rename a session (the user-facing title). */
  renameSession: (sessionId: string, title: string) => void
  /** Mark a session as closed with an outcome reflection. */
  closeSession: (sessionId: string, outcome: string) => void
  /** Reopen a previously closed session. */
  reopenSession: (sessionId: string) => void
  /** Archive a session — hidden from default list. */
  archiveSession: (sessionId: string) => void
  /** Un-archive (back to closed). */
  unarchiveSession: (sessionId: string) => void
  /** Permanently delete a session. */
  deleteSession: (sessionId: string) => void

  // Selectors
  /** All sessions for an exercise (newest first). */
  sessionsForExercise: (exerciseKey: string) => LabSession[]
  /** All sessions for a category (newest first). */
  sessionsForCategory: (categoryKey: string) => LabSession[]
  /** All sessions linked to a specific SPI session. */
  sessionsForSpi: (spiSessionId: string) => LabSession[]
  /** All sessions in the given status (newest first). */
  sessionsByStatus: (status: LabSessionStatus) => LabSession[]
  /** Get a session by id (or null). */
  getSession: (sessionId: string) => LabSession | null

  // Custom exercises CRUD
  /** Crea un nuevo ejercicio custom. Devuelve la key generada (custom_XXX). */
  addCustomExercise: (input: Omit<LabExercise, 'key'>) => string
  /** Actualiza un ejercicio custom existente. Si la key no es custom_, no-op. */
  updateCustomExercise: (key: string, patch: Partial<LabExercise>) => void
  /** Elimina un ejercicio custom. NO toca las sesiones ya creadas para él
   *  (quedan como huérfanas con `exerciseKey` apuntando a un ej. que ya no
   *  existe — la UI las puede ocultar o tratar como modo lectura). */
  removeCustomExercise: (key: string) => void

  // Custom categories CRUD
  /** Crea una nueva categoría custom. Devuelve la key generada (cat_XXX). */
  addCustomCategory: (input: Omit<LabCategory, 'key'>) => string
  /** Actualiza una categoría custom. Si la key no es cat_, no-op. */
  updateCustomCategory: (key: string, patch: Partial<LabCategory>) => void
  /** Elimina una categoría custom. Bloquea si tiene ejercicios custom adentro
   *  (el caller debe pedir confirmación o mover los ejercicios primero).
   *  Devuelve true si borró, false si bloqueó. */
  removeCustomCategory: (key: string) => boolean

  // Beliefs CRUD
  addBelief: (text: string, categoryKey?: string) => string
  /** Bulk insert from a multiline string — used by the diagnostic exercise's
   *  "captura" step (one belief per line, skipping blanks and bullet chars). */
  addBeliefsFromText: (text: string, categoryKey?: string) => number
  updateBelief: (id: string, patch: Partial<Omit<LabBelief, 'id' | 'createdAt'>>) => void
  setBeliefStatus: (id: string, status: LabBeliefStatus, insight?: string) => void
  removeBelief: (id: string) => void
  /** Beliefs in a category, optionally filtered by status, newest first. */
  beliefsFor: (categoryKey: string, status?: LabBeliefStatus) => LabBelief[]
}

/** Busca un ejercicio entre los built-in y los custom del user.
 *  Wrapper sobre `findBuiltInExercise` que primero chequea los custom
 *  pasados por arg. Necesario porque las acciones del store que necesitan
 *  resolver un ejercicio (createSession, updateValue para auto-title)
 *  tienen que mirar también los custom del store, no solo los estáticos. */
function findExerciseAnywhere(key: string, customExercises: LabExercise[]): LabExercise | undefined {
  return customExercises.find((e) => e.key === key) ?? findBuiltInExercise(key)
}

function defaultTitleFor(exerciseKey: string, customExercises: LabExercise[]): string {
  const ex = findExerciseAnywhere(exerciseKey, customExercises)
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  return ex ? `${ex.title} · ${dd}/${mm}` : `Sesión · ${dd}/${mm}`
}

/** Derive a short title from a free-text value. Takes the first non-empty
 *  line, strips bullet prefixes ("- ", "• ", "* ", "1. "...) so multi-line
 *  fields like the diagnostico's "creencias detectadas" yield "el dinero es
 *  difícil" instead of "- el dinero es difícil". Caps at ~50 chars + "…".
 *  Returns null if there's nothing usable. */
function deriveAutoTitle(value: string, createdAtISO: string): string | null {
  if (!value) return null
  const firstLine = value.split('\n').find((l) => l.trim().length > 0)
  if (!firstLine) return null
  const cleaned = firstLine.replace(/^[\s•·\-–*\d]+\.?\s*/, '').trim()
  if (!cleaned) return null
  const truncated = cleaned.length > 50 ? cleaned.slice(0, 50).trim() + '…' : cleaned
  const date = new Date(createdAtISO)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${truncated} · ${dd}/${mm}`
}

export const useLabStore = create<LabState>()(
  persist(
    (set, get) => ({
      sessions: [],
      beliefs: [],
      customExercises: [],
      customCategories: [],

      addCustomCategory: (input) => {
        const key = `cat_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
        const cat: LabCategory = { ...input, key }
        set((s) => ({ customCategories: [cat, ...s.customCategories] }))
        return key
      },
      updateCustomCategory: (key, patch) => {
        if (!key.startsWith('cat_')) return
        set((s) => ({
          customCategories: s.customCategories.map((c) =>
            c.key === key ? { ...c, ...patch, key: c.key } : c,
          ),
        }))
      },
      removeCustomCategory: (key) => {
        if (!key.startsWith('cat_')) return false
        const state = get()
        const hasExercises = state.customExercises.some((e) => e.categoryKey === key)
        if (hasExercises) return false   // bloquea: hay ejercicios adentro
        set((s) => ({ customCategories: s.customCategories.filter((c) => c.key !== key) }))
        return true
      },

      addCustomExercise: (input) => {
        const key = `custom_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
        const ex: LabExercise = { ...input, key }
        set((s) => ({ customExercises: [ex, ...s.customExercises] }))
        return key
      },
      updateCustomExercise: (key, patch) => {
        if (!key.startsWith('custom_')) return
        set((s) => ({
          customExercises: s.customExercises.map((e) =>
            e.key === key ? { ...e, ...patch, key: e.key } : e,
          ),
        }))
      },
      removeCustomExercise: (key) => {
        if (!key.startsWith('custom_')) return
        set((s) => ({ customExercises: s.customExercises.filter((e) => e.key !== key) }))
      },

      createSession: ({ exerciseKey, title, spiSessionId, linkedBeliefId, initialValues }) => {
        const ex = findExerciseAnywhere(exerciseKey, get().customExercises)
        if (!ex) return ''
        const now = new Date().toISOString()
        // If the caller passed an explicit title (e.g. "Reencuadre · 'X'"
        // when launching from a belief), respect it — autoTitled=false locks it.
        // Otherwise the session starts auto-titled and the title updates live
        // as the user types into the exercise's titleField.
        const hasExplicitTitle = !!title?.trim()
        let resolvedTitle = hasExplicitTitle ? title!.trim() : defaultTitleFor(exerciseKey, get().customExercises)
        // If initialValues are pre-populated and the titleField is among them,
        // derive an initial auto-title from that value right away (covers
        // the belief-launch case nicely — title becomes the belief text).
        if (!hasExplicitTitle && ex.titleField && initialValues) {
          const stepKey = ex.titleField.stepKey ?? '__root'
          const v = initialValues[stepKey]?.[ex.titleField.fieldKey]
          const derived = v ? deriveAutoTitle(v, now) : null
          if (derived) resolvedTitle = derived
        }
        const sess: LabSession = {
          id: genId(),
          exerciseKey,
          categoryKey: ex.categoryKey,
          title: resolvedTitle,
          status: 'open',
          createdAt: now,
          updatedAt: now,
          values: initialValues ?? {},
          spiSessionId,
          linkedBeliefId,
          autoTitled: !hasExplicitTitle,
        }
        set((s) => {
          const next: Partial<LabState> = { sessions: [sess, ...s.sessions] }
          // If this session is tied to a belief, mark the belief as 'working'
          // and link the session id into its linkedSessionIds for history.
          if (linkedBeliefId) {
            next.beliefs = s.beliefs.map((b) =>
              b.id !== linkedBeliefId ? b : {
                ...b,
                status: b.status === 'resolved' ? b.status : 'working',
                updatedAt: now,
                linkedSessionIds: [...(b.linkedSessionIds ?? []), sess.id],
              }
            )
          }
          return next as Partial<LabState> as LabState
        })
        return sess.id
      },

      updateValue: (sessionId, stepKey, fieldKey, value) =>
        set((s) => ({
          sessions: s.sessions.map((sess) => {
            if (sess.id !== sessionId) return sess
            const newValues = {
              ...sess.values,
              [stepKey]: { ...(sess.values[stepKey] ?? {}), [fieldKey]: value },
            }
            // Auto-title — only when the session hasn't been manually renamed
            // (autoTitled !== false; undefined defaults to true for new
            // sessions, false for pre-existing ones from before this feature).
            // We only check on the changed field — when it matches the
            // exercise's declared titleField, we re-derive the title.
            let newTitle = sess.title
            if (sess.autoTitled === true) {
              const ex = findExerciseAnywhere(sess.exerciseKey, s.customExercises)
              const tf = ex?.titleField
              if (tf) {
                const tfStepKey = tf.stepKey ?? '__root'
                if (tfStepKey === stepKey && tf.fieldKey === fieldKey) {
                  newTitle = deriveAutoTitle(value, sess.createdAt) ?? defaultTitleFor(sess.exerciseKey, s.customExercises)
                }
              }
            }
            return {
              ...sess,
              title: newTitle,
              values: newValues,
              updatedAt: new Date().toISOString(),
            }
          }),
        })),

      renameSession: (sessionId, title) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              title: title.trim() || sess.title,
              // User renamed manually → lock the title so future field
              // changes don't override it via the auto-title pipeline.
              autoTitled: false,
              updatedAt: new Date().toISOString(),
            }
          ),
        })),

      closeSession: (sessionId, outcome) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              status: 'closed',
              outcome,
              closedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          ),
        })),

      reopenSession: (sessionId) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              status: 'open',
              closedAt: undefined,
              updatedAt: new Date().toISOString(),
            }
          ),
        })),

      archiveSession: (sessionId) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              status: 'archived',
              updatedAt: new Date().toISOString(),
            }
          ),
        })),

      unarchiveSession: (sessionId) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              status: sess.outcome ? 'closed' : 'open',
              updatedAt: new Date().toISOString(),
            }
          ),
        })),

      deleteSession: (sessionId) =>
        set((s) => ({ sessions: s.sessions.filter((sess) => sess.id !== sessionId) })),

      sessionsForExercise: (exerciseKey) =>
        get().sessions
          .filter((s) => s.exerciseKey === exerciseKey)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),

      sessionsForCategory: (categoryKey) =>
        get().sessions
          .filter((s) => s.categoryKey === categoryKey)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),

      sessionsForSpi: (spiSessionId) =>
        get().sessions
          .filter((s) => s.spiSessionId === spiSessionId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),

      sessionsByStatus: (status) =>
        get().sessions
          .filter((s) => s.status === status)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),

      getSession: (sessionId) => get().sessions.find((s) => s.id === sessionId) ?? null,

      // ─── Beliefs CRUD ──────────────────────────────────────────────
      addBelief: (text, categoryKey = 'creencias') => {
        const trimmed = text.trim()
        if (!trimmed) return ''
        const now = new Date().toISOString()
        const belief: LabBelief = {
          id: genId(),
          categoryKey,
          text: trimmed,
          status: 'open',
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ beliefs: [belief, ...s.beliefs] }))
        return belief.id
      },

      addBeliefsFromText: (text, categoryKey = 'creencias') => {
        const lines = text
          .split('\n')
          .map((line) => line.replace(/^[\s•·\-–*\d]+\.?\s*/, '').trim())
          .filter((line) => line.length > 0)
        if (lines.length === 0) return 0
        const now = new Date().toISOString()
        const newBeliefs: LabBelief[] = lines.map((textLine) => ({
          id: genId(),
          categoryKey,
          text: textLine,
          status: 'open',
          createdAt: now,
          updatedAt: now,
        }))
        set((s) => {
          // Skip exact duplicates (case-insensitive) so re-running the
          // diagnostic doesn't pile up the same belief 3x.
          const existing = new Set(s.beliefs.map((b) => b.text.toLowerCase()))
          const fresh = newBeliefs.filter((b) => !existing.has(b.text.toLowerCase()))
          return { beliefs: [...fresh, ...s.beliefs] }
        })
        return lines.length
      },

      updateBelief: (id, patch) =>
        set((s) => ({
          beliefs: s.beliefs.map((b) =>
            b.id !== id ? b : { ...b, ...patch, updatedAt: new Date().toISOString() }
          ),
        })),

      setBeliefStatus: (id, status, insight) =>
        set((s) => ({
          beliefs: s.beliefs.map((b) =>
            b.id !== id ? b : {
              ...b,
              status,
              insight: insight !== undefined ? insight : b.insight,
              resolvedAt: status === 'resolved' ? new Date().toISOString() : undefined,
              updatedAt: new Date().toISOString(),
            }
          ),
        })),

      removeBelief: (id) => set((s) => ({ beliefs: s.beliefs.filter((b) => b.id !== id) })),

      beliefsFor: (categoryKey, status) =>
        get().beliefs
          .filter((b) => b.categoryKey === categoryKey && (status ? b.status === status : true))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }),
    {
      name: 'overseer-lab',
      partialize: (s) => ({
        sessions: s.sessions,
        beliefs: s.beliefs,
        customExercises: s.customExercises,
        customCategories: s.customCategories,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.sessions)) state.sessions = []
        if (state && !Array.isArray(state.beliefs)) state.beliefs = []
        if (state && !Array.isArray(state.customExercises)) state.customExercises = []
        if (state && !Array.isArray(state.customCategories)) state.customCategories = []
      },
    }
  )
)

// ─── Public helpers para consumers (LabPage, ExerciseRunner, SPIPage) ──
// Estos wrappean el lookup combinado built-in + custom para que los
// componentes no necesiten conocer el detalle interno del store.

/** Devuelve el ejercicio (built-in O custom) por key, o undefined. */
export function findExerciseCombined(key: string): LabExercise | undefined {
  return findExerciseAnywhere(key, useLabStore.getState().customExercises)
}

/** Devuelve TODOS los ejercicios (built-in + custom) de una categoría —
 *  los custom primero, después los built-in en su orden original. */
export function exercisesByCategoryCombined(categoryKey: string): LabExercise[] {
  const custom = useLabStore.getState().customExercises.filter((e) => e.categoryKey === categoryKey)
  const builtIn = LAB_EXERCISES.filter((e) => e.categoryKey === categoryKey)
  return [...custom, ...builtIn]
}

/** Hook reactivo — usalo en componentes para que se re-rendereen cuando
 *  el user agregue/edite un ejercicio custom. */
export function useExercisesByCategory(categoryKey: string): LabExercise[] {
  const customExercises = useLabStore((s) => s.customExercises)
  const custom = customExercises.filter((e) => e.categoryKey === categoryKey)
  const builtIn = LAB_EXERCISES.filter((e) => e.categoryKey === categoryKey)
  return [...custom, ...builtIn]
}

/** Re-export útil para componentes que solo quieren el tipo de step. */
export type { LabExerciseStep }

// ─── Category helpers (built-in + custom combinados) ───────────────────

/** Busca una categoría (built-in O custom) por key. */
export function findCategoryCombined(key: string): LabCategory | undefined {
  return useLabStore.getState().customCategories.find((c) => c.key === key) ?? findBuiltInCategory(key)
}

/** Devuelve TODAS las categorías (built-in + custom), built-in primero
 *  para mantener el orden histórico. Los custom van al final. */
export function allCategoriesCombined(): LabCategory[] {
  const custom = useLabStore.getState().customCategories
  return [...LAB_CATEGORIES, ...custom]
}

/** Hook reactivo — para que la UI se actualice cuando agregás categorías. */
export function useAllCategories(): LabCategory[] {
  const customCategories = useLabStore((s) => s.customCategories)
  return [...LAB_CATEGORIES, ...customCategories]
}
