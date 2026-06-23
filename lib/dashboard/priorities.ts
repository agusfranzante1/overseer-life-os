'use client'
import { useMemo } from 'react'
import { useSPIStore } from '@/lib/store/spiStore'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useAppStore } from '@/lib/store/appStore'
import { todayKeyInTz } from '@/lib/utils/dateInTz'
import type { SPITask } from '@/lib/spi/types'
import type { Task } from '@/types'

/** Una prioridad del día: la SPITask marcada con ⚡ + la tarea global a la
 *  que quedó linkeada al cerrar el SPI. */
export interface DailyPriorityItem {
  spiTask: SPITask
  task: Task
}

export interface DailyPrioritiesResult {
  items: DailyPriorityItem[]
  /** Hay al menos una prioridad que vence hoy. */
  hasPriorities: boolean
  /** Todas las prioridades de hoy están completadas (solo true si hay ≥1). */
  allDone: boolean
  doneCount: number
}

/** Cruza las tareas marcadas ⚡ en CUALQUIER sesión SPI con sus tareas
 *  globales (vía `linkedTaskId`) y devuelve las que vencen HOY. La fuente de
 *  verdad del "hecho/no hecho" es la tarea real (`completedAt`), así el
 *  checkbox del Panel queda two-way con el task manager.
 *
 *  Escaneamos todas las sesiones (son pocas) para no depender de "qué semana
 *  es" — cualquier prioridad cuyo linkedTask venza hoy aparece. */
export function useDailyPriorities(): DailyPrioritiesResult {
  const sessions = useSPIStore((s) => s.sessions)
  const tasks = useTasksStore((s) => s.tasks)
  const timezone = useAppStore((s) => s.timezone)

  return useMemo(() => {
    const todayKey = todayKeyInTz(timezone)
    const seen = new Set<string>()
    const items: DailyPriorityItem[] = []
    for (const session of sessions) {
      for (const st of session.tasks ?? []) {
        if (!st.priority || !st.linkedTaskId) continue
        if (seen.has(st.linkedTaskId)) continue
        const task = tasks[st.linkedTaskId]
        if (!task || task.archivedAt) continue
        if (task.dueDate !== todayKey) continue
        seen.add(st.linkedTaskId)
        items.push({ spiTask: st, task })
      }
    }
    const doneCount = items.filter((i) => !!i.task.completedAt).length
    const hasPriorities = items.length > 0
    const allDone = hasPriorities && doneCount === items.length
    return { items, hasPriorities, allDone, doneCount }
  }, [sessions, tasks, timezone])
}
