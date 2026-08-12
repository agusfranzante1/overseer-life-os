'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** UI-only state for the task manager: which tasks are expanded, which
 *  subtask-1s have their subtask-2 children collapsed.
 *
 *  Lives in its own store (not in tasksStore) because it's purely
 *  presentational — no need to sync it to a backend, but it's persisted
 *  to localStorage so refreshing the page doesn't reset the layout.
 *  Without this, every page-load collapsed every task and the user had
 *  to re-expand the ones they were working on.
 *
 *  Schema:
 *   - `taskExpanded[taskId]` → true if the task card is expanded.
 *     Default (undefined) = collapsed.
 *   - `subtaskCollapsed[`${taskId}:${subId}`]` → true if the subtask-1's
 *     children (subtask-2) are hidden. Default = expanded. */
interface TaskUIState {
  taskExpanded: Record<string, boolean>
  subtaskCollapsed: Record<string, boolean>
  /** Proyectos ocultados de la vista "Todas las tareas" (selector = null).
   *  Sus tareas no aparecen en el cross-project view, pero el proyecto sigue
   *  seleccionable y visible al abrirlo directo.
   *
   *  A DIFERENCIA de taskExpanded/subtaskCollapsed (layout efímero por
   *  dispositivo), esta ES una preferencia real del usuario y SÍ sincroniza
   *  multi-device: viaja en el blob `app_preferences` (ver `appPrefsFields()`
   *  en lib/supabase/sync.ts, merge por-campo). localStorage acá es solo
   *  cache local. `hiddenProjects[projectId] === true` → oculto. */
  hiddenProjects: Record<string, boolean>
  setTaskExpanded: (taskId: string, expanded: boolean) => void
  toggleTaskExpanded: (taskId: string) => void
  setSubtaskCollapsed: (taskId: string, subId: string, collapsed: boolean) => void
  toggleSubtaskCollapsed: (taskId: string, subId: string) => void
  toggleProjectHidden: (projectId: string) => void
  /** Used by the task store's removal action to purge dead entries. */
  pruneTask: (taskId: string) => void
}

const subKey = (taskId: string, subId: string) => `${taskId}:${subId}`

export const useTaskUiStore = create<TaskUIState>()(
  persist(
    (set) => ({
      taskExpanded: {},
      subtaskCollapsed: {},
      hiddenProjects: {},
      toggleProjectHidden: (projectId) => set((s) => ({
        hiddenProjects: { ...s.hiddenProjects, [projectId]: !s.hiddenProjects[projectId] },
      })),
      setTaskExpanded: (taskId, expanded) => set((s) => ({
        taskExpanded: { ...s.taskExpanded, [taskId]: expanded },
      })),
      toggleTaskExpanded: (taskId) => set((s) => ({
        taskExpanded: { ...s.taskExpanded, [taskId]: !s.taskExpanded[taskId] },
      })),
      setSubtaskCollapsed: (taskId, subId, collapsed) => set((s) => ({
        subtaskCollapsed: { ...s.subtaskCollapsed, [subKey(taskId, subId)]: collapsed },
      })),
      toggleSubtaskCollapsed: (taskId, subId) => set((s) => {
        const k = subKey(taskId, subId)
        return { subtaskCollapsed: { ...s.subtaskCollapsed, [k]: !s.subtaskCollapsed[k] } }
      }),
      pruneTask: (taskId) => set((s) => {
        const nextTask: Record<string, boolean> = { ...s.taskExpanded }
        delete nextTask[taskId]
        const nextSub: Record<string, boolean> = {}
        const prefix = `${taskId}:`
        for (const k of Object.keys(s.subtaskCollapsed)) {
          if (!k.startsWith(prefix)) nextSub[k] = s.subtaskCollapsed[k]
        }
        return { taskExpanded: nextTask, subtaskCollapsed: nextSub }
      }),
    }),
    {
      name: 'overseer-task-ui',
      partialize: (s) => ({
        taskExpanded: s.taskExpanded,
        subtaskCollapsed: s.subtaskCollapsed,
        hiddenProjects: s.hiddenProjects,
      }),
      onRehydrateStorage: () => (state) => {
        // Back-compat: estados persistidos antes de esta feature no tienen el map.
        if (state && !state.hiddenProjects) state.hiddenProjects = {}
      },
    }
  )
)
