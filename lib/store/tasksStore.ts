'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Task, Project, Subtask, CustomStatus } from '@/types'
import { DEFAULT_STATUSES, PROJECT_COLORS } from '@/lib/utils/constants'

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
  setSelectedProject: (id: string | null) => void
  addStatusToProject: (projectId: string, status: Omit<CustomStatus, 'id'>) => void
  removeStatusFromProject: (projectId: string, statusId: string) => void

  // Task actions
  addTask: (t: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateTask: (id: string, patch: Partial<Task>) => void
  completeTask: (id: string) => void
  deleteTask: (id: string) => void
  moveTask: (taskId: string, projectId: string) => void
  postponeTask: (id: string) => void
  pushRemainingToTomorrow: () => void
  planNext2h: () => Task[]

  // Subtask actions
  addSubtask: (taskId: string, title: string) => void
  updateSubtask: (taskId: string, subtaskId: string, patch: Partial<Subtask>) => void
  toggleSubtask: (taskId: string, subtaskId: string) => void
  deleteSubtask: (taskId: string, subtaskId: string) => void
}

const DEMO_PROJECT_ID = 'proj_demo'
const PERSONAL_PROJECT_ID = 'proj_personal'

const demoStatuses = DEFAULT_STATUSES

export const useTasksStore = create<TasksState>()(
  persist(
    (set, get) => ({
      selectedProjectId: null,
      projects: {
        [DEMO_PROJECT_ID]: {
          id: DEMO_PROJECT_ID,
          name: 'Life OS',
          color: PROJECT_COLORS[0],
          description: 'Core life operating system tasks',
          statuses: demoStatuses,
          taskIds: [],
          createdAt: new Date().toISOString(),
          archived: false,
        },
        [PERSONAL_PROJECT_ID]: {
          id: PERSONAL_PROJECT_ID,
          name: 'Personal',
          color: PROJECT_COLORS[2],
          description: 'Personal tasks and goals',
          statuses: demoStatuses,
          taskIds: [],
          createdAt: new Date().toISOString(),
          archived: false,
        },
      },
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

      deleteProject: (id) =>
        set((s) => {
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
        set((s) => ({
          tasks: {
            ...s.tasks,
            [id]: { ...s.tasks[id], ...patch, updatedAt: new Date().toISOString() },
          },
        })),

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
          const { [id]: _, ...tasks } = s.tasks
          if (!task) return { tasks }
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
        }),

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

      addSubtask: (taskId, title) => {
        const id = genId()
        set((s) => ({
          tasks: {
            ...s.tasks,
            [taskId]: {
              ...s.tasks[taskId],
              subtasks: [
                ...s.tasks[taskId].subtasks,
                { id, title, completed: false, status: 'todo', order: s.tasks[taskId].subtasks.length, notes: '' },
              ],
              updatedAt: new Date().toISOString(),
            },
          },
        }))
      },

      updateSubtask: (taskId, subtaskId, patch) =>
        set((s) => ({
          tasks: {
            ...s.tasks,
            [taskId]: {
              ...s.tasks[taskId],
              subtasks: s.tasks[taskId].subtasks.map((st) =>
                st.id === subtaskId ? { ...st, ...patch } : st
              ),
              updatedAt: new Date().toISOString(),
            },
          },
        })),

      toggleSubtask: (taskId, subtaskId) =>
        set((s) => ({
          tasks: {
            ...s.tasks,
            [taskId]: {
              ...s.tasks[taskId],
              subtasks: s.tasks[taskId].subtasks.map((st) =>
                st.id === subtaskId ? { ...st, completed: !st.completed } : st
              ),
              updatedAt: new Date().toISOString(),
            },
          },
        })),

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
