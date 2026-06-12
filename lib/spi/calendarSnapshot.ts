/** Captura del calendario semanal — congela los bloques timeados
 *  (eventos GCal + tareas/subtareas con dueTime) tal como quedaron al
 *  cierre del SPI semanal. Permite ver semana a semana cómo se
 *  organizó el tiempo y qué se cumplió.
 *
 *  Diseño "estilo imagen y listo": la fuente original (calendario,
 *  tareas) puede cambiar/borrarse después, pero este snapshot conserva
 *  título, color, hora y estado de completion del momento en que se
 *  capturó. Para renderizar, basta con leer los `blocks` y dibujarlos
 *  en un grid pasivo. */

import type { CalendarSnapshotBlock, CalendarWeekSnapshot } from './types'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useGoogleCalendarStore } from '@/lib/store/googleCalendarStore'

/** Devuelve YYYY-MM-DD del lunes que arranca la semana del calendario
 *  CORRESPONDIENTE a la SPI session. Importante: la session se identifica
 *  por `weekStartDate` (sábado), pero el calendario muestra lunes-a-domingo.
 *  El lunes que arranca la semana del calendario es 2 días después del
 *  sábado de la session (Sáb → Dom → Lun). */
function calendarMondayForSpiWeek(spiWeekStartDate: string): string {
  const [y, m, d] = spiWeekStartDate.split('-').map(Number)
  const sat = new Date(y, m - 1, d, 12, 0, 0)
  // El lunes de la "semana del calendario" que CONTIENE este sábado.
  // Sábado → retroceder 5 días → lunes de la misma semana lun-dom.
  const dow = sat.getDay()  // 6=Sáb
  const daysBack = dow === 0 ? 6 : dow - 1
  const mon = new Date(sat)
  mon.setDate(sat.getDate() - daysBack)
  const yy = mon.getFullYear()
  const mm = String(mon.getMonth() + 1).padStart(2, '0')
  const dd = String(mon.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Construye el snapshot leyendo del estado live de los stores.
 *  Se llama una sola vez al cerrar la SPI weekly session. */
export function buildCalendarSnapshot(spiWeekStartDate: string): CalendarWeekSnapshot {
  const calendarMonday = calendarMondayForSpiWeek(spiWeekStartDate)
  // Construimos los 7 dateKeys (Lun..Dom) para filtrar bloques rápidamente.
  const [my, mm, md] = calendarMonday.split('-').map(Number)
  const weekKeys = new Set<string>()
  for (let i = 0; i < 7; i++) {
    const d = new Date(my, mm - 1, md + i)
    weekKeys.add(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    )
  }

  const blocks: CalendarSnapshotBlock[] = []
  let tasksTotal = 0
  let tasksDone = 0

  // ─── 1) Tareas y subtareas con dueTime ─────────────────────────────
  const { tasks, projects } = useTasksStore.getState()
  for (const t of Object.values(tasks)) {
    if (t.archivedAt) continue
    const projColor = projects[t.projectId]?.color ?? '#6366f1'

    // Tarea madre — TIMED (con dueTime) o ALL-DAY (solo dueDate).
    if (t.dueDate && weekKeys.has(t.dueDate)) {
      const isDone = !!t.completedAt
      if (t.dueTime) {
        const [y, m, d] = t.dueDate.split('-').map(Number)
        const [hh, mn] = t.dueTime.split(':').map(Number)
        const start = new Date(y, m - 1, d, hh, mn, 0)
        const duration = t.durationMinutes ?? 60
        const end = new Date(start.getTime() + duration * 60_000)
        blocks.push({
          id: `task:${t.id}`,
          summary: t.title,
          start: start.toISOString(),
          end: end.toISOString(),
          color: projColor,
          source: 'task',
          isCompleted: isDone,
        })
      } else {
        // All-day: usamos dueDate como key tanto en start como en end.
        // El renderer lo mete en la franja superior, no en la grilla horaria.
        blocks.push({
          id: `task:${t.id}`,
          summary: t.title,
          start: t.dueDate,
          end: t.dueDate,
          color: projColor,
          source: 'task',
          isCompleted: isDone,
          isAllDay: true,
        })
      }
      tasksTotal++
      if (isDone) tasksDone++
    }

    // Subtareas — mismo split timed vs all-day.
    for (const sub of t.subtasks ?? []) {
      if (sub.archivedAt) continue
      if (!sub.dueDate || !weekKeys.has(sub.dueDate)) continue
      const isDone = !!sub.completedAt
      if (sub.dueTime) {
        const [y, m, d] = sub.dueDate.split('-').map(Number)
        const [hh, mn] = sub.dueTime.split(':').map(Number)
        const start = new Date(y, m - 1, d, hh, mn, 0)
        const duration = sub.durationMinutes ?? 30
        const end = new Date(start.getTime() + duration * 60_000)
        blocks.push({
          id: `subtask:${sub.id}`,
          summary: sub.title,
          start: start.toISOString(),
          end: end.toISOString(),
          color: projColor,
          source: 'subtask',
          isCompleted: isDone,
        })
      } else {
        blocks.push({
          id: `subtask:${sub.id}`,
          summary: sub.title,
          start: sub.dueDate,
          end: sub.dueDate,
          color: projColor,
          source: 'subtask',
          isCompleted: isDone,
          isAllDay: true,
        })
      }
      tasksTotal++
      if (isDone) tasksDone++
    }
  }

  // ─── 2) Eventos GCal de la semana ──────────────────────────────────
  // Filtramos los que caen en algún día de weekKeys. Los all-day no se
  // incluyen — el snapshot es de bloques timeados.
  const { events, calendars } = useGoogleCalendarStore.getState()
  const calColors = new Map<string, string>()
  for (const c of calendars) {
    if (c.backgroundColor) calColors.set(c.id, c.backgroundColor)
  }
  for (const ev of events) {
    const dateKey = ev.start.slice(0, 10)
    if (!weekKeys.has(dateKey)) continue
    blocks.push({
      id: `gcal:${ev.id}`,
      summary: ev.summary || '(sin título)',
      start: ev.start,
      end: ev.end,
      color: calColors.get(ev.calendarId) ?? '#4285f4',
      source: 'gcal',
      isCompleted: false,
      isAllDay: !!ev.allDay,
    })
  }

  return {
    weekStartDate: calendarMonday,
    capturedAt: new Date().toISOString(),
    blocks,
    tasksTotal,
    tasksDone,
  }
}
