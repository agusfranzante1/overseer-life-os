'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LabSession, LabSessionStatus } from '@/lib/lab/types'
import { findExercise } from '@/lib/lab/templates'

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

interface LabState {
  sessions: LabSession[]

  // Lifecycle
  /** Create a new session for an exercise. Returns the new session id. */
  createSession: (args: { exerciseKey: string; title?: string; spiSessionId?: string }) => string
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

      createSession: ({ exerciseKey, title, spiSessionId }) => {
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
          values: {},
          spiSessionId,
        }
        set((s) => ({ sessions: [sess, ...s.sessions] }))
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
    }),
    {
      name: 'overseer-lab',
      partialize: (s) => ({ sessions: s.sessions }),
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.sessions)) state.sessions = []
      },
    }
  )
)
