'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_SPI_TEMPLATE } from '@/lib/spi/template'
import type { SPISession, SPITask, SPITemplate, BitacoraEntry } from '@/lib/spi/types'
import { useTasksStore } from './tasksStore'
import { computeSessionXP, totalXPFromSessions, levelFromXP, didLevelUp, type SessionXP } from '@/lib/spi/gamification'

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/** Returns the most recent Saturday at 00:00 local time as YYYY-MM-DD. */
function lastSaturdayYmd(now: Date = new Date()): string {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()  // 0 Sun … 6 Sat
  // If today is Saturday → use today. Otherwise step back to previous Saturday.
  const diff = day === 6 ? 0 : (day + 1)  // Sun=1, Mon=2, ..., Fri=6
  d.setDate(d.getDate() - diff)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** Pre-fills a fresh session with the template's default checklist
 *  state (all unchecked) and empty values. */
function emptySession(template: SPITemplate, weekStartDate: string): SPISession {
  const nowIso = new Date().toISOString()
  const mainChecklist: Record<string, boolean> = {}
  for (const item of template.mainChecklist) mainChecklist[item.key] = false
  return {
    id: genId(),
    weekStartDate,
    createdAt: nowIso,
    updatedAt: nowIso,
    mainChecklist,
    // Empty array → lane picker is shown until user picks
    selectedLanes: [],
    values: {},
    tasks: [],
    templateVersion: template.version,
  }
}

interface SPIState {
  template: SPITemplate
  sessions: SPISession[]
  activeSessionId: string | null
  /** Cross-session persistent journal — the Bitácora de Calibración.
   *  Lives globally (NOT inside individual sessions) so every Saturday
   *  the user can see ALL accumulated insights from prior weeks. */
  bitacoraEntries: BitacoraEntry[]

  // ─── Session lifecycle ────────────────────────────────────────────
  /** Creates a new session for the most recent Saturday and sets it
   *  as active. If a session for that Saturday already exists, it is
   *  returned instead — we don't duplicate per week. */
  createOrOpenCurrentWeek: () => string
  setActiveSession: (id: string | null) => void
  /** Closes the session: stamps closedAt, computes the score, stores
   *  mood/notes, AND pushes each task into the SPI project in the task
   *  manager (creating the project if it doesn't exist). After this the
   *  session is read-only-ish (still editable). Returns the count of
   *  tasks materialized + XP info + level-up flag for the celebration UI. */
  closeSession: (id: string, args: { mood?: number; notes?: string }) => {
    pushedTasks: number
    xp: SessionXP
    leveledUp: boolean
    newLevel: number
    previousLevel: number
  }

  // ─── Bitácora de Calibración (cross-session DB) ─────────────────
  addBitacoraEntry: (e: Omit<BitacoraEntry, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateBitacoraEntry: (id: string, patch: Partial<BitacoraEntry>) => void
  removeBitacoraEntry: (id: string) => void

  // ─── Template editing (Phase 4) ─────────────────────────────────
  /** Replace the entire template. New sessions will use this. Existing
   *  sessions keep their snapshot via templateVersion field. */
  updateTemplate: (t: SPITemplate) => void
  /** Restore the bundled default template. */
  resetTemplate: () => void

  // ─── Gamification selectors ─────────────────────────────────────
  /** Total XP earned across all closed sessions. */
  getTotalXP: () => number
  /** Current level info derived from total XP. */
  getLevel: () => ReturnType<typeof levelFromXP>
  /** Materializes a SPITask into the real Task store now (without
   *  closing the session). Useful for early commits. */
  pushTaskToManager: (sessionId: string, taskId: string) => void
  deleteSession: (id: string) => void

  // ─── Field / checklist editing ────────────────────────────────────
  toggleChecklistItem: (id: string, key: string) => void
  updateValue: (sessionId: string, sectionKey: string, fieldKey: string, value: string) => void
  /** Pick which lanes ("carriles") are active for this session.
   *  Empty array shows the picker; non-empty filters which sections render. */
  setSessionLanes: (sessionId: string, lanes: string[]) => void

  // ─── Generated tasks ──────────────────────────────────────────────
  addTask: (sessionId: string, task: Omit<SPITask, 'id'>) => string
  updateTask: (sessionId: string, taskId: string, patch: Partial<SPITask>) => void
  removeTask: (sessionId: string, taskId: string) => void
  reorderTasks: (sessionId: string, orderedIds: string[]) => void

  // ─── Convenience selectors (not stored) ───────────────────────────
  getActiveSession: () => SPISession | null
  getStreak: () => number
}

/** Auto-compute a 0-100 score from a session's state. Weights:
 *  - 40% main checklist completion
 *  - 40% task completion ratio
 *  - 20% mood (1-10 normalized)
 *  Tasks with no entries → that component skipped (rescaled). */
function computeScore(session: SPISession): number {
  const checklistTotal = Object.keys(session.mainChecklist).length || 1
  const checklistDone = Object.values(session.mainChecklist).filter(Boolean).length
  const checklistPct = (checklistDone / checklistTotal) * 100

  const totalTasks = session.tasks.length
  const doneTasks = session.tasks.filter((t) => !!t.linkedTaskId && !!t.movedToProjectId).length
  // Without integration yet (Phase 2), use important flag count as proxy.
  const tasksPct = totalTasks > 0
    ? (doneTasks / totalTasks) * 100
    : (totalTasks === 0 ? 0 : 0)

  const moodPct = session.mood ? ((session.mood - 1) / 9) * 100 : 0
  const moodComponent = session.mood !== undefined ? 0.2 * moodPct : 0

  if (session.mood === undefined && totalTasks === 0) {
    return Math.round(checklistPct)  // only the checklist matters then
  }
  if (totalTasks === 0) {
    return Math.round(0.6 * checklistPct + 0.4 * moodPct)
  }
  return Math.round(0.4 * checklistPct + 0.4 * tasksPct + moodComponent)
}

export const useSPIStore = create<SPIState>()(
  persist(
    (set, get) => ({
      template: DEFAULT_SPI_TEMPLATE,
      sessions: [],
      activeSessionId: null,
      bitacoraEntries: [],

      createOrOpenCurrentWeek: () => {
        const target = lastSaturdayYmd()
        const existing = get().sessions.find((s) => s.weekStartDate === target)
        if (existing) {
          set({ activeSessionId: existing.id })
          return existing.id
        }
        const fresh = emptySession(get().template, target)
        set((s) => ({
          sessions: [fresh, ...s.sessions],
          activeSessionId: fresh.id,
        }))
        return fresh.id
      },

      setActiveSession: (id) => set({ activeSessionId: id }),

      closeSession: (id, args) => {
        const session = get().sessions.find((s) => s.id === id)
        if (!session) return { pushedTasks: 0, xp: { base: 0, scoreBonus: 0, moodBonus: 0, taskBonus: 0, total: 0 }, leveledUp: false, newLevel: 0, previousLevel: 0 }

        // Snapshot total XP BEFORE this close so we can detect level-up.
        const xpBefore = totalXPFromSessions(get().sessions)

        // Ensure SPI project exists. The icon and color are stable so
        // re-creating across devices stays consistent.
        const tasksApi = useTasksStore.getState()
        const projectId = tasksApi.ensureSystemProject({
          systemProjectKey: 'spi',
          name: 'SPI',
          color: '#d946ef',  // fuchsia-500 — matches the SPI accent
          icon: '♾️',
        })

        // Push every SPITask that isn't already linked, into the task
        // manager as a real Task. The whyPurpose lives in the description
        // field so it's visible even after the user moves the task.
        const updatedTasks: SPITask[] = session.tasks.map((t) => {
          if (t.linkedTaskId) return t  // already pushed
          const realTaskId = tasksApi.addTask({
            title: t.title,
            projectId,
            status: 'To Do',
            priority: t.important ? 'high' : 'medium',
            importance: t.important ? 'high' : 'medium',
            subtasks: [],
            scheduledFor: 'today',
            dueDate: t.dueDate,
            description: t.whyPurpose
              ? `💡 Para qué: ${t.whyPurpose}\n\n(Tarea generada desde SPI · ${session.weekStartDate})`
              : `(Tarea generada desde SPI · ${session.weekStartDate})`,
          })
          return { ...t, linkedTaskId: realTaskId }
        })

        // Auto-tick the "cerrar" checklist item — the user just closed,
        // they shouldn't have to also remember to tick it. We look it up
        // by key (matches DEFAULT_SPI_TEMPLATE.mainChecklist.cerrar).
        const autoCheckedMain = { ...session.mainChecklist, cerrar: true }

        const closedSession: SPISession = {
          ...session,
          tasks: updatedTasks,
          closedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          mood: args.mood ?? session.mood,
          notes: args.notes ?? session.notes,
          mainChecklist: autoCheckedMain,
          score: computeScore({
            ...session,
            tasks: updatedTasks,
            mood: args.mood ?? session.mood,
            mainChecklist: autoCheckedMain,
          }),
        }
        set((s) => ({
          sessions: s.sessions.map((sess) => sess.id === id ? closedSession : sess),
        }))

        // XP/level computed AFTER updating, using the just-closed session.
        const xpAfter = totalXPFromSessions(get().sessions)
        const xp = computeSessionXP(closedSession)
        const leveledUp = didLevelUp(xpBefore, xpAfter)
        const newLevel = levelFromXP(xpAfter).level
        const previousLevel = levelFromXP(xpBefore).level

        const pushed = updatedTasks.filter((t) => t.linkedTaskId && !session.tasks.find((o) => o.id === t.id)?.linkedTaskId).length
        return { pushedTasks: pushed, xp, leveledUp, newLevel, previousLevel }
      },

      addBitacoraEntry: (e) => {
        const id = genId()
        const nowIso = new Date().toISOString()
        set((s) => ({
          bitacoraEntries: [
            { ...e, id, createdAt: nowIso, updatedAt: nowIso },
            ...s.bitacoraEntries,
          ],
        }))
        return id
      },

      updateBitacoraEntry: (id, patch) =>
        set((s) => ({
          bitacoraEntries: s.bitacoraEntries.map((e) =>
            e.id !== id ? e : { ...e, ...patch, updatedAt: new Date().toISOString() }
          ),
        })),

      removeBitacoraEntry: (id) =>
        set((s) => ({
          bitacoraEntries: s.bitacoraEntries.filter((e) => e.id !== id),
        })),

      updateTemplate: (t) => set({
        // Bump version so future sessions snapshot the new template id.
        template: { ...t, version: (get().template.version ?? 0) + 1 },
      }),
      resetTemplate: () => set({
        template: { ...DEFAULT_SPI_TEMPLATE, version: (get().template.version ?? 0) + 1 },
      }),

      getTotalXP: () => totalXPFromSessions(get().sessions),
      getLevel: () => levelFromXP(totalXPFromSessions(get().sessions)),

      pushTaskToManager: (sessionId, taskId) => {
        const session = get().sessions.find((s) => s.id === sessionId)
        const task = session?.tasks.find((t) => t.id === taskId)
        if (!session || !task || task.linkedTaskId) return

        const tasksApi = useTasksStore.getState()
        const projectId = tasksApi.ensureSystemProject({
          systemProjectKey: 'spi',
          name: 'SPI',
          color: '#d946ef',
          icon: '♾️',
        })
        const realTaskId = tasksApi.addTask({
          title: task.title,
          projectId,
          status: 'To Do',
          priority: task.important ? 'high' : 'medium',
          importance: task.important ? 'high' : 'medium',
          subtasks: [],
          scheduledFor: 'today',
          dueDate: task.dueDate,
          description: task.whyPurpose
            ? `💡 Para qué: ${task.whyPurpose}\n\n(Tarea generada desde SPI · ${session.weekStartDate})`
            : `(Tarea generada desde SPI · ${session.weekStartDate})`,
        })
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              tasks: sess.tasks.map((t) => t.id === taskId ? { ...t, linkedTaskId: realTaskId } : t),
            }
          ),
        }))
      },

      deleteSession: (id) =>
        set((s) => ({
          sessions: s.sessions.filter((sess) => sess.id !== id),
          activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
        })),

      toggleChecklistItem: (id, key) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== id ? sess : {
              ...sess,
              updatedAt: new Date().toISOString(),
              mainChecklist: { ...sess.mainChecklist, [key]: !sess.mainChecklist[key] },
            }
          ),
        })),

      updateValue: (sessionId, sectionKey, fieldKey, value) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              updatedAt: new Date().toISOString(),
              values: {
                ...sess.values,
                [sectionKey]: { ...(sess.values[sectionKey] ?? {}), [fieldKey]: value },
              },
            }
          ),
        })),

      setSessionLanes: (sessionId, lanes) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              selectedLanes: lanes,
              updatedAt: new Date().toISOString(),
            }
          ),
        })),

      addTask: (sessionId, task) => {
        const id = genId()
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              updatedAt: new Date().toISOString(),
              tasks: [...sess.tasks, { ...task, id }],
            }
          ),
        }))
        return id
      },

      updateTask: (sessionId, taskId, patch) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              updatedAt: new Date().toISOString(),
              tasks: sess.tasks.map((t) => t.id === taskId ? { ...t, ...patch } : t),
            }
          ),
        })),

      removeTask: (sessionId, taskId) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              updatedAt: new Date().toISOString(),
              tasks: sess.tasks.filter((t) => t.id !== taskId),
            }
          ),
        })),

      reorderTasks: (sessionId, orderedIds) =>
        set((s) => ({
          sessions: s.sessions.map((sess) => {
            if (sess.id !== sessionId) return sess
            const byId = new Map(sess.tasks.map((t) => [t.id, t]))
            const next = orderedIds.map((id) => byId.get(id)).filter(Boolean) as SPITask[]
            // Append any task missing from orderedIds at the end.
            for (const t of sess.tasks) if (!orderedIds.includes(t.id)) next.push(t)
            return { ...sess, tasks: next, updatedAt: new Date().toISOString() }
          }),
        })),

      getActiveSession: () => {
        const { sessions, activeSessionId } = get()
        if (!activeSessionId) return null
        return sessions.find((s) => s.id === activeSessionId) ?? null
      },

      /** Consecutive weeks (starting from the latest closed session
       *  walking backwards) where a session exists AND was closed. */
      getStreak: () => {
        const closed = get().sessions
          .filter((s) => !!s.closedAt)
          .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))
        if (closed.length === 0) return 0

        let streak = 0
        let expected = closed[0].weekStartDate
        for (const sess of closed) {
          if (sess.weekStartDate !== expected) break
          streak++
          // Subtract 7 days from `expected` to get previous Saturday
          const [y, m, d] = expected.split('-').map(Number)
          const prev = new Date(y, m - 1, d)
          prev.setDate(prev.getDate() - 7)
          const py = prev.getFullYear()
          const pm = String(prev.getMonth() + 1).padStart(2, '0')
          const pd = String(prev.getDate()).padStart(2, '0')
          expected = `${py}-${pm}-${pd}`
        }
        return streak
      },
    }),
    {
      name: 'overseer-spi',
      partialize: (s) => ({
        template: s.template,
        sessions: s.sessions,
        activeSessionId: s.activeSessionId,
        bitacoraEntries: s.bitacoraEntries,
      }),
      // Auto-migration on rehydration. We need to handle 3 epochs:
      //   v1 → "aaa_emocional" + "aaa_tactico" split sections
      //   v2 → single "aaa" parent with nested subsections
      //   v3 → flat sections tagged with `laneKey` (current)
      //
      // For each upgrade, we:
      //   1. Replace template with current DEFAULT (only if user hasn't
      //      customized — we detect that via known-shape markers).
      //   2. Rewrite session.values keys to match the new structure so
      //      data the user typed before isn't orphaned.
      //   3. Initialize `selectedLanes: []` for sessions that predate it.
      onRehydrateStorage: () => (state) => {
        if (!state) return

        const sections = state.template?.sections ?? []
        const hasV1Split = sections.some((sec) => sec.key === 'aaa_emocional' || sec.key === 'aaa_tactico')
        const hasV1Bitacora = sections.some((sec) => sec.key === 'bitacora')
        const hasV2Aaa = sections.some((sec) => sec.key === 'aaa' && (sec.subsections?.length ?? 0) > 0)
        const isV3 = !!state.template?.lanes && sections.some((sec) => !!sec.laneKey)

        if (!isV3 && (hasV1Split || hasV1Bitacora || hasV2Aaa)) {
          // Bundled-default upgrade path. Custom user templates wouldn't
          // match any of these shapes — leave them alone.
          state.template = DEFAULT_SPI_TEMPLATE
        }

        // Migrate value keys: v1/v2 used nested paths like "aaa.intencion.intencion"
        // and "aaa.profundidad.que_buscamos.meta_pro_q". v3 uses flat paths
        // like "intencion.intencion" and "que_buscamos.meta_pro_q".
        if (Array.isArray(state.sessions)) {
          state.sessions = state.sessions.map((sess) => {
            const next = { ...sess }
            // Ensure selectedLanes exists. Pre-v3 sessions get ALL lanes
            // selected so nothing disappears under them.
            if (!Array.isArray(next.selectedLanes)) {
              next.selectedLanes = (state.template?.lanes ?? []).map((l) => l.key)
            }
            // Rewrite value keys.
            const oldVals = sess.values ?? {}
            const newVals: typeof oldVals = {}
            for (const [key, fields] of Object.entries(oldVals)) {
              let newKey = key
              if (newKey.startsWith('aaa.profundidad.')) newKey = newKey.slice('aaa.profundidad.'.length)
              else if (newKey.startsWith('aaa.')) newKey = newKey.slice('aaa.'.length)
              // Merge if multiple old keys collapse to the same new key.
              newVals[newKey] = { ...(newVals[newKey] ?? {}), ...fields }
            }
            next.values = newVals
            return next
          })
        }

        // Defensive: ensure bitacoraEntries exists (for users who had
        // a persisted state from before this field was introduced).
        if (!Array.isArray(state.bitacoraEntries)) state.bitacoraEntries = []
      },
    }
  )
)
