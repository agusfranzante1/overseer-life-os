'use client'
import { useMemo } from 'react'
import { useSPIStore } from '@/lib/store/spiStore'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useAppStore } from '@/lib/store/appStore'
import { todayKeyInTz, dateKeyInTz } from '@/lib/utils/dateInTz'
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
  /** Hay al menos una prioridad activa para hoy. */
  hasPriorities: boolean
  /** Todas las prioridades de hoy están completadas (solo true si hay ≥1). */
  allDone: boolean
  doneCount: number
  /** Tareas marcadas ⚡ que TODAVÍA no se materializaron en el task manager
   *  (la sesión SPI no se cerró / no se pushearon). No pueden mostrarse como
   *  checkbox aún — sirve para avisarle al usuario qué hacer. */
  unlinkedCount: number
}

/** Cruza las tareas marcadas ⚡ en CUALQUIER sesión SPI con sus tareas
 *  globales (vía `linkedTaskId`) y devuelve las que están activas para HOY.
 *  La fuente de verdad del "hecho/no hecho" es la tarea real (`completedAt`),
 *  así el checkbox del Panel queda two-way con el task manager.
 *
 *  "Activa para hoy" = vence hoy, NO tiene fecha, o está vencida (overdue).
 *  Las prioridades con fecha FUTURA no aparecen hasta su día. Esto cubre el
 *  caso típico del SPI donde las tareas no llevan fecha exacta.
 *
 *  Escaneamos todas las sesiones (son pocas) para no depender de "qué semana
 *  es" — cualquier prioridad linkeada aparece. */
export function useDailyPriorities(): DailyPrioritiesResult {
  const sessions = useSPIStore((s) => s.sessions)
  const tasks = useTasksStore((s) => s.tasks)
  const timezone = useAppStore((s) => s.timezone)

  return useMemo(() => {
    const todayKey = todayKeyInTz(timezone)
    const seenTask = new Set<string>()
    // Dedup por SERIE recurrente (no por tarea): una tarea recurrente puede
    // tener varias instancias activas hoy (la madre + una hija del mismo día,
    // ambas marcadas ⚡). Mostramos UNA sola por serie, quedándonos con la más
    // relevante: hoy+pendiente > hoy+completada > vencida/sin fecha+pendiente.
    const rankOf = (t: Task): number => {
      const done = !!t.completedAt
      if (t.dueDate === todayKey) return done ? 2 : 3
      return done ? 0 : 1
    }
    const bySeries = new Map<string, { item: DailyPriorityItem; rank: number }>()
    let unlinkedCount = 0
    for (const session of sessions) {
      for (const st of session.tasks ?? []) {
        if (!st.priority) continue
        if (!st.linkedTaskId) { unlinkedCount++; continue }
        if (seenTask.has(st.linkedTaskId)) continue
        const task = tasks[st.linkedTaskId]
        if (!task || task.archivedAt) continue
        // Activa para hoy: sin fecha, hoy, o vencida. Las futuras se omiten.
        if (task.dueDate && task.dueDate > todayKey) continue
        // No arrastrar instancias COMPLETADAS de días anteriores (recurrentes
        // que completaste ayer): una completada solo se muestra si fue HOY.
        if (task.completedAt && dateKeyInTz(new Date(task.completedAt), timezone) !== todayKey) continue
        seenTask.add(st.linkedTaskId)
        const seriesKey = task.recurringHeadId ?? task.id
        const rank = rankOf(task)
        const existing = bySeries.get(seriesKey)
        if (!existing || rank > existing.rank) bySeries.set(seriesKey, { item: { spiTask: st, task }, rank })
      }
    }
    const items = [...bySeries.values()].map((v) => v.item)
    const doneCount = items.filter((i) => !!i.task.completedAt).length
    const hasPriorities = items.length > 0
    const allDone = hasPriorities && doneCount === items.length
    return { items, hasPriorities, allDone, doneCount, unlinkedCount }
  }, [sessions, tasks, timezone])
}
