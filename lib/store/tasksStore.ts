'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Task, Project, Subtask, CustomStatus } from '@/types'
import { DEFAULT_STATUSES, PROJECT_COLORS } from '@/lib/utils/constants'
import { dateKeyInTz } from '@/lib/utils/dateInTz'

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function today() {
  return new Date().toISOString().split('T')[0]
}

interface TasksState {
  projects: Record<string, Project>
  tasks: Record<string, Task>
  selectedProjectId: string | null

  // Project actions
  addProject: (p: { name: string; description?: string; color?: string }) => string
  updateProject: (id: string, patch: Partial<Project>) => void
  deleteProject: (id: string) => void
  /** Finds an existing system project by its systemProjectKey (e.g. 'spi'),
   *  or creates one if it doesn't exist. Returns the project id. Idempotent
   *  — safe to call on every SPI page mount. */
  ensureSystemProject: (args: { systemProjectKey: 'spi'; name: string; color: string; icon?: string }) => string
  setSelectedProject: (id: string | null) => void
  addStatusToProject: (projectId: string, status: Omit<CustomStatus, 'id'>) => void
  removeStatusFromProject: (projectId: string, statusId: string) => void

  // Task actions
  addTask: (t: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateTask: (id: string, patch: Partial<Task>) => void
  completeTask: (id: string) => void
  deleteTask: (id: string) => void
  /** Moves all completed tasks (status countsAsDone) into the archive
   *  ("papelera") if their completedAt date — computed in the given IANA
   *  timezone — is strictly before todayKey. Archived tasks stay in the
   *  store; they just become hidden from normal views. Returns the count
   *  archived. */
  archiveCompletedBefore: (todayKey: string, timezone: string) => number
  /** Restore an archived task: clear its archivedAt + completedAt and reset
   *  its status to the first non-done status of its project. */
  restoreFromArchive: (id: string) => void
  /** Permanently delete a single archived task (skipping the trash). */
  deletePermanently: (id: string) => void
  /** Permanently delete every archived task — "vaciar papelera". Returns count. */
  emptyArchive: () => number
  moveTask: (taskId: string, projectId: string) => void
  /** Convert a mother Task into a Subtask of another Task, bringing all
   *  its existing subtasks along as direct children of the new subtask.
   *  Nested subtasks (2-level deep) get FLATTENED into direct children
   *  because the subtask model only supports 1 level of nesting.
   *  No-op if sourceTaskId === targetTaskId or either doesn't exist. */
  convertTaskToSubtask: (sourceTaskId: string, targetTaskId: string) => void
  postponeTask: (id: string) => void
  pushRemainingToTomorrow: () => void
  planNext2h: () => Task[]

  // Subtask actions
  addSubtask: (taskId: string, title: string, parentId?: string) => void
  updateSubtask: (taskId: string, subtaskId: string, patch: Partial<Subtask>) => void
  toggleSubtask: (taskId: string, subtaskId: string) => void
  deleteSubtask: (taskId: string, subtaskId: string) => void
}

export const useTasksStore = create<TasksState>()(
  persist(
    (set, get) => ({
      selectedProjectId: null,
      projects: {},
      tasks: {},

      setSelectedProject: (id) => set({ selectedProjectId: id }),

      addProject: ({ name, description, color }) => {
        const id = genId()
        const existingColors = Object.values(get().projects).map((p) => p.color)
        const nextColor = color ?? PROJECT_COLORS.find((c) => !existingColors.includes(c)) ?? PROJECT_COLORS[0]
        set((s) => ({
          projects: {
            ...s.projects,
            [id]: {
              id,
              name,
              description,
              color: nextColor,
              statuses: DEFAULT_STATUSES,
              taskIds: [],
              createdAt: new Date().toISOString(),
              archived: false,
            },
          },
        }))
        return id
      },

      updateProject: (id, patch) =>
        set((s) => ({
          projects: { ...s.projects, [id]: { ...s.projects[id], ...patch } },
        })),

      ensureSystemProject: ({ systemProjectKey, name, color, icon }) => {
        const existing = Object.values(get().projects).find(
          (p) => p.systemProjectKey === systemProjectKey
        )
        if (existing) return existing.id
        const id = genId()
        set((s) => ({
          projects: {
            ...s.projects,
            [id]: {
              id, name, color, icon,
              statuses: DEFAULT_STATUSES,
              taskIds: [],
              createdAt: new Date().toISOString(),
              archived: false,
              isSystemProject: true,
              systemProjectKey,
            },
          },
        }))
        return id
      },

      deleteProject: (id) =>
        set((s) => {
          // System projects (e.g. SPI) cannot be deleted from the task
          // manager — they're owned by another subsystem that needs them
          // to exist. The UI already disables the delete button, but we
          // guard at the store too in case someone calls programmatically.
          if (s.projects[id]?.isSystemProject) return s
          const { [id]: _, ...rest } = s.projects
          const tasks = Object.fromEntries(
            Object.entries(s.tasks).filter(([, t]) => t.projectId !== id)
          )
          return { projects: rest, tasks }
        }),

      addStatusToProject: (projectId, status) => {
        const id = genId()
        set((s) => ({
          projects: {
            ...s.projects,
            [projectId]: {
              ...s.projects[projectId],
              statuses: [...s.projects[projectId].statuses, { ...status, id }],
            },
          },
        }))
      },

      removeStatusFromProject: (projectId, statusId) =>
        set((s) => ({
          projects: {
            ...s.projects,
            [projectId]: {
              ...s.projects[projectId],
              statuses: s.projects[projectId].statuses.filter((st) => st.id !== statusId),
            },
          },
        })),

      addTask: (t) => {
        const id = genId()
        const now = new Date().toISOString()
        const task: Task = { ...t, id, createdAt: now, updatedAt: now }
        set((s) => ({
          tasks: { ...s.tasks, [id]: task },
          projects: {
            ...s.projects,
            [t.projectId]: {
              ...s.projects[t.projectId],
              taskIds: [...(s.projects[t.projectId]?.taskIds ?? []), id],
            },
          },
        }))
        return id
      },

      updateTask: (id, patch) =>
        set((s) => {
          const prev = s.tasks[id]
          if (!prev) return s

          // If the status is changing, auto-manage completedAt:
          //   - transitioning INTO a countsAsDone status → stamp completedAt
          //   - transitioning OUT of a countsAsDone status → clear completedAt
          //     (so the auto-purge doesn't reap a re-opened task tomorrow)
          let completedAtPatch: { completedAt?: string | undefined } = {}
          if (typeof patch.status === 'string' && patch.status !== prev.status) {
            const proj = s.projects[prev.projectId]
            const newStatusDef = proj?.statuses.find((st) => st.label === patch.status)
            const oldStatusDef = proj?.statuses.find((st) => st.label === prev.status)
            if (newStatusDef?.countsAsDone && !oldStatusDef?.countsAsDone) {
              completedAtPatch = { completedAt: new Date().toISOString() }
            } else if (!newStatusDef?.countsAsDone && oldStatusDef?.countsAsDone) {
              completedAtPatch = { completedAt: undefined }
            }
          }

          return {
            tasks: {
              ...s.tasks,
              [id]: { ...prev, ...patch, ...completedAtPatch, updatedAt: new Date().toISOString() },
            },
          }
        }),

      completeTask: (id) =>
        set((s) => {
          const proj = s.projects[s.tasks[id]?.projectId]
          const doneStatus = proj?.statuses.find((st) => st.countsAsDone)?.label ?? 'Done'
          return {
            tasks: {
              ...s.tasks,
              [id]: {
                ...s.tasks[id],
                status: doneStatus,
                completedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            },
          }
        }),

      deleteTask: (id) =>
        set((s) => {
          const task = s.tasks[id]
          if (!task) return s

          // If the task is ALREADY archived (you're cleaning it up from the
          // papelera), this is a hard delete. Otherwise, soft-delete: move it
          // to the archive so the user can recover it from the papelera.
          if (task.archivedAt) {
            const { [id]: _gone, ...tasks } = s.tasks
            return {
              tasks,
              projects: {
                ...s.projects,
                [task.projectId]: {
                  ...s.projects[task.projectId],
                  taskIds: s.projects[task.projectId]?.taskIds.filter((tid) => tid !== id) ?? [],
                },
              },
            }
          }

          // Soft delete → archive
          const nowIso = new Date().toISOString()
          return {
            tasks: {
              ...s.tasks,
              [id]: {
                ...task,
                archivedAt: nowIso,
                // If the task wasn't already completed, stamp completedAt now
                // so the archive UI has a sensible "completada" date to show.
                completedAt: task.completedAt ?? nowIso,
                updatedAt: nowIso,
              },
            },
          }
        }),

      archiveCompletedBefore: (todayKey, timezone) => {
        let archived = 0
        const nowIso = new Date().toISOString()
        set((s) => {
          const tasks = { ...s.tasks }
          for (const t of Object.values(tasks)) {
            const proj = s.projects[t.projectId]
            if (!proj) continue

            // ── Subtasks: archive any subtask whose completedAt rolled
            // over the day boundary, regardless of whether the parent task
            // is done. They behave like mini-tasks: complete → live one
            // more day → trash. The archived ones stay in the parent's
            // subtasks array (with archivedAt set) so they can be
            // recovered, but the UI hides them by default.
            const updatedSubs = (t.subtasks ?? []).map((st) => {
              if (st.archivedAt) return st
              if (!st.completed || !st.completedAt) return st
              const stKey = dateKeyInTz(new Date(st.completedAt), timezone)
              if (stKey >= todayKey) return st
              archived++
              return { ...st, archivedAt: nowIso }
            })
            const subsChanged = updatedSubs.some((st, i) => st !== t.subtasks?.[i])

            // ── Parent task: original logic — archive once it's done.
            if (!t.archivedAt) {
              const statusDef = proj.statuses.find((st) => st.label === t.status)
              if (statusDef?.countsAsDone && t.completedAt) {
                const completedKey = dateKeyInTz(new Date(t.completedAt), timezone)
                if (completedKey < todayKey) {
                  tasks[t.id] = { ...t, subtasks: updatedSubs, archivedAt: nowIso }
                  archived++
                  continue
                }
              }
            }
            if (subsChanged) tasks[t.id] = { ...t, subtasks: updatedSubs }
          }
          return { tasks }
        })
        return archived
      },

      restoreFromArchive: (id) =>
        set((s) => {
          const t = s.tasks[id]
          if (!t) return s
          const proj = s.projects[t.projectId]
          // Find a sensible non-done status to restore to. Prefer "In Progress"
          // style (first non-done), fall back to current status if nothing fits.
          const reopenStatus = proj?.statuses.find((st) => !st.countsAsDone)?.label ?? t.status
          return {
            tasks: {
              ...s.tasks,
              [id]: {
                ...t,
                archivedAt: undefined,
                completedAt: undefined,
                status: reopenStatus,
                updatedAt: new Date().toISOString(),
              },
            },
          }
        }),

      deletePermanently: (id) =>
        set((s) => {
          const task = s.tasks[id]
          if (!task) return s
          const { [id]: _gone, ...tasks } = s.tasks
          return {
            tasks,
            projects: {
              ...s.projects,
              [task.projectId]: {
                ...s.projects[task.projectId],
                taskIds: (s.projects[task.projectId]?.taskIds ?? []).filter((tid) => tid !== id),
              },
            },
          }
        }),

      emptyArchive: () => {
        let removed = 0
        set((s) => {
          const tasks: typeof s.tasks = {}
          const removedIdsByProject: Record<string, Set<string>> = {}
          for (const [id, t] of Object.entries(s.tasks)) {
            if (t.archivedAt) {
              removed++
              ;(removedIdsByProject[t.projectId] ??= new Set()).add(id)
            } else {
              tasks[id] = t
            }
          }
          const projects = { ...s.projects }
          for (const [projectId, ids] of Object.entries(removedIdsByProject)) {
            const p = projects[projectId]
            if (!p) continue
            projects[projectId] = {
              ...p,
              taskIds: (p.taskIds ?? []).filter((tid) => !ids.has(tid)),
            }
          }
          return { tasks, projects }
        })
        return removed
      },

      moveTask: (taskId, newProjectId) =>
        set((s) => {
          const task = s.tasks[taskId]
          if (!task) return s
          const oldProject = s.projects[task.projectId]
          const newProject = s.projects[newProjectId]
          const newStatus = newProject?.statuses[0]?.label ?? task.status
          return {
            tasks: { ...s.tasks, [taskId]: { ...task, projectId: newProjectId, status: newStatus } },
            projects: {
              ...s.projects,
              [task.projectId]: {
                ...oldProject,
                taskIds: oldProject?.taskIds.filter((id) => id !== taskId) ?? [],
              },
              [newProjectId]: {
                ...newProject,
                taskIds: [...(newProject?.taskIds ?? []), taskId],
              },
            },
          }
        }),

      convertTaskToSubtask: (sourceTaskId, targetTaskId) =>
        set((s) => {
          if (sourceTaskId === targetTaskId) return s
          const source = s.tasks[sourceTaskId]
          const target = s.tasks[targetTaskId]
          if (!source || !target) return s
          // Archived items can't participate — restore them first if the
          // user wants to merge them somewhere.
          if (source.archivedAt || target.archivedAt) return s

          const newRootId = genId()
          const baseOrder = target.subtasks.length

          // The dragged task BECOMES a new top-level subtask in the target.
          // We copy over the fields that the Subtask type supports; anything
          // Task-specific (energyEstimate, scheduledFor, postponedCount,
          // projectId, etc.) is left behind since it doesn't apply at the
          // subtask level.
          const newRoot: Subtask = {
            id: newRootId,
            title: source.title,
            completed: !!source.completedAt,
            status: source.status,
            order: baseOrder,
            notes: source.notes,
            description: source.description,
            priority: source.priority,
            dueDate: source.dueDate,
            completedAt: source.completedAt,
            // parentId undefined → this is a top-level subtask in target.
          }

          // ALL of the source's non-archived subtasks become FLAT children
          // of newRoot. Originally-nested subtasks lose their parentId
          // chain (we flatten to a single level because the Subtask schema
          // only supports 1 level of nesting). This loses the "subtask of
          // subtask" relationships but preserves all the data — typically
          // the user can rebuild the structure visually after the move.
          const childSubs: Subtask[] = source.subtasks
            .filter((sub) => !sub.archivedAt)
            .map((sub, idx) => ({
              ...sub,
              id: genId(),       // fresh ids so they don't collide with anything
              parentId: newRootId,
              order: baseOrder + 1 + idx,
            }))

          const newTarget: Task = {
            ...target,
            subtasks: [...target.subtasks, newRoot, ...childSubs],
            updatedAt: new Date().toISOString(),
          }

          // Drop the source task entirely + unlink from its project's taskIds.
          const newTasks = { ...s.tasks, [targetTaskId]: newTarget }
          delete newTasks[sourceTaskId]

          const sourceProj = s.projects[source.projectId]
          const newProjects = sourceProj ? {
            ...s.projects,
            [source.projectId]: {
              ...sourceProj,
              taskIds: sourceProj.taskIds.filter((id) => id !== sourceTaskId),
            },
          } : s.projects

          return { tasks: newTasks, projects: newProjects }
        }),

      postponeTask: (id) =>
        set((s) => ({
          tasks: {
            ...s.tasks,
            [id]: {
              ...s.tasks[id],
              scheduledFor: 'tomorrow',
              postponedCount: (s.tasks[id]?.postponedCount ?? 0) + 1,
              updatedAt: new Date().toISOString(),
            },
          },
        })),

      pushRemainingToTomorrow: () =>
        set((s) => {
          const todayStr = today()
          const updated = { ...s.tasks }
          for (const id in updated) {
            const t = updated[id]
            const proj = s.projects[t.projectId]
            const isDone = proj?.statuses.find((st) => st.label === t.status)?.countsAsDone
            if (!isDone && (t.scheduledFor === 'today' || t.dueDate === todayStr)) {
              updated[id] = {
                ...t,
                scheduledFor: 'tomorrow',
                postponedCount: (t.postponedCount ?? 0) + 1,
                updatedAt: new Date().toISOString(),
              }
            }
          }
          return { tasks: updated }
        }),

      planNext2h: () => {
        const { tasks, projects } = get()
        const todayStr = today()
        const candidates = Object.values(tasks).filter((t) => {
          const proj = projects[t.projectId]
          const isDone = proj?.statuses.find((st) => st.label === t.status)?.countsAsDone
          return !isDone && (t.scheduledFor === 'today' || t.dueDate === todayStr)
        })
        // Sort by priority then importance
        const priorityOrder: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 }
        const impactOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
        candidates.sort((a, b) => {
          const pa = (priorityOrder[a.priority] ?? 0) + (impactOrder[a.importance] ?? 0)
          const pb = (priorityOrder[b.priority] ?? 0) + (impactOrder[b.importance] ?? 0)
          return pb - pa
        })
        return candidates.slice(0, 3)
      },

      addSubtask: (taskId, title, parentId) => {
        const id = genId()
        set((s) => {
          // Inherit the parent project's first status (e.g. "To Do") so the
          // status chip renders correctly. Falls back to "todo" if the
          // project somehow has no statuses configured.
          const task = s.tasks[taskId]
          const proj = s.projects[task?.projectId]
          const defaultStatus = proj?.statuses[0]?.label ?? 'todo'
          return {
            tasks: {
              ...s.tasks,
              [taskId]: {
                ...task,
                subtasks: [
                  ...task.subtasks,
                  {
                    id, title, completed: false, status: defaultStatus,
                    order: task.subtasks.length, notes: '',
                    // Default priority LOW — mirror the parent Task default
                    // so capture stays off the radar until the user bumps it.
                    priority: 'low',
                    ...(parentId ? { parentId } : {}),
                  },
                ],
                updatedAt: new Date().toISOString(),
              },
            },
          }
        })
      },

      updateSubtask: (taskId, subtaskId, patch) =>
        set((s) => {
          const task = s.tasks[taskId]
          const proj = s.projects[task?.projectId]
          return {
          tasks: {
            ...s.tasks,
            [taskId]: {
              ...s.tasks[taskId],
              subtasks: s.tasks[taskId].subtasks.map((st) => {
                if (st.id !== subtaskId) return st
                let completedPatch: Partial<typeof st> = {}
                // If the status changed, mirror Task: stamp/clear completedAt
                // when transitioning across the countsAsDone boundary.
                if (typeof patch.status === 'string' && patch.status !== st.status) {
                  const newStatusDef = proj?.statuses.find((sd) => sd.label === patch.status)
                  const oldStatusDef = proj?.statuses.find((sd) => sd.label === st.status)
                  if (newStatusDef?.countsAsDone && !oldStatusDef?.countsAsDone) {
                    completedPatch = { completed: true, completedAt: new Date().toISOString() }
                  } else if (!newStatusDef?.countsAsDone && oldStatusDef?.countsAsDone) {
                    completedPatch = { completed: false, completedAt: undefined }
                  }
                }
                return { ...st, ...patch, ...completedPatch }
              }),
              updatedAt: new Date().toISOString(),
            },
          },
          }
        }),

      toggleSubtask: (taskId, subtaskId) =>
        set((s) => {
          // Toggling completed should also flip the status chip between
          // "done-ish" and the first non-done status, so the visual stays
          // consistent. Looks up the parent project's status list to find
          // the matching done/non-done labels.
          const task = s.tasks[taskId]
          const proj = s.projects[task?.projectId]
          const doneLabel = proj?.statuses.find((st) => st.countsAsDone)?.label
          const firstOpenLabel = proj?.statuses.find((st) => !st.countsAsDone)?.label
            ?? proj?.statuses[0]?.label
          const nowIso = new Date().toISOString()
          return {
            tasks: {
              ...s.tasks,
              [taskId]: {
                ...task,
                subtasks: task.subtasks.map((st) => {
                  if (st.id !== subtaskId) return st
                  const nowCompleted = !st.completed
                  const newStatus = nowCompleted
                    ? (doneLabel ?? st.status)
                    : (firstOpenLabel ?? st.status)
                  return {
                    ...st,
                    completed: nowCompleted,
                    status: newStatus,
                    // Mirror the Task contract: stamp completedAt when
                    // checking, clear it when unchecking. The auto-purge
                    // uses this to decide when to archive.
                    completedAt: nowCompleted ? nowIso : undefined,
                  }
                }),
                updatedAt: nowIso,
              },
            },
          }
        }),

      deleteSubtask: (taskId, subtaskId) =>
        set((s) => ({
          tasks: {
            ...s.tasks,
            [taskId]: {
              ...s.tasks[taskId],
              subtasks: s.tasks[taskId].subtasks.filter((st) => st.id !== subtaskId),
              updatedAt: new Date().toISOString(),
            },
          },
        })),
    }),
    { name: 'overseer-tasks' }
  )
)
