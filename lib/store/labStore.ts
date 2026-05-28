'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LabSession, LabSessionStatus, LabBelief, LabBeliefStatus } from '@/lib/lab/types'
import { findExercise } from '@/lib/lab/templates'

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

function defaultTitleFor(exerciseKey: string): string {
  const ex = findExercise(exerciseKey)
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  return ex ? `${ex.title} · ${dd}/${mm}` : `Sesión · ${dd}/${mm}`
}

export const useLabStore = create<LabState>()(
  persist(
    (set, get) => ({
      sessions: [],
      beliefs: [],

      createSession: ({ exerciseKey, title, spiSessionId, linkedBeliefId, initialValues }) => {
        const ex = findExercise(exerciseKey)
        if (!ex) return ''
        const now = new Date().toISOString()
        const sess: LabSession = {
          id: genId(),
          exerciseKey,
          categoryKey: ex.categoryKey,
          title: title?.trim() || defaultTitleFor(exerciseKey),
          status: 'open',
          createdAt: now,
          updatedAt: now,
          values: initialValues ?? {},
          spiSessionId,
          linkedBeliefId,
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
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              updatedAt: new Date().toISOString(),
              values: {
                ...sess.values,
                [stepKey]: { ...(sess.values[stepKey] ?? {}), [fieldKey]: value },
              },
            }
          ),
        })),

      renameSession: (sessionId, title) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              title: title.trim() || sess.title,
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
      partialize: (s) => ({ sessions: s.sessions, beliefs: s.beliefs }),
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.sessions)) state.sessions = []
        if (state && !Array.isArray(state.beliefs)) state.beliefs = []
      },
    }
  )
)
