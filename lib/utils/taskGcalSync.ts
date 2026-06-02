/** Sincronización de tareas-con-horario hacia Google Calendar.
 *
 *  Filosofía: el lado autoritativo es la TASK (vive en el task store).
 *  El event de GCal es un MIRROR — lo creamos/actualizamos/borramos
 *  cuando la task cambia. Por ahora la sync es Task→GCal one-way.
 *  Próxima fase: pull-back para sincronizar cambios hechos en GCal.
 *
 *  Cuándo se llama:
 *   - addTask: si tiene dueDate + dueTime + sync activado → createEvent
 *   - updateTask: si quedó con dueTime → upsert event; si se quitó dueTime
 *     o se borró la fecha → delete event si había uno linkeado.
 *   - completeTask / deleteTask: borrar event linkeado para que no quede
 *     huérfano en GCal.
 *
 *  Falla con grace: si el sync falla (calendario inexistente, sin auth,
 *  network), logueamos a consola y seguimos. La task local NO se rompe
 *  por un fallo de sync. */

import type { Task } from '@/types'
import { useAppStore } from '@/lib/store/appStore'
import { useGoogleCalendarStore } from '@/lib/store/googleCalendarStore'

/** Construye start/end ISO para el evento GCal a partir de una task con
 *  dueDate + dueTime. Aplica timezone IANA del browser. */
function buildEventTiming(task: Task): { start: string; end: string; timeZone: string } | null {
  if (!task.dueDate || !task.dueTime) return null
  const [y, m, d] = task.dueDate.split('-').map(Number)
  const [hh, mm] = task.dueTime.split(':').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(hh)) return null
  const start = new Date(y, m - 1, d, hh, mm, 0)
  const duration = task.durationMinutes ?? 60
  const end = new Date(start.getTime() + duration * 60_000)
  const tz = (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC'
  // toLocalISO con offset así GCal no nos descuadra la hora con la TZ del calendario.
  const toIso = (dt: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const offsetMin = -dt.getTimezoneOffset()
    const sign = offsetMin >= 0 ? '+' : '-'
    const abs = Math.abs(offsetMin)
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  }
  return { start: toIso(start), end: toIso(end), timeZone: tz }
}

/** True si la task está apta para vivir como event GCal: tiene fecha,
 *  hora, NO está archivada y NO está completada. */
function isEventable(task: Task): boolean {
  if (!task.dueDate || !task.dueTime) return false
  if (task.archivedAt) return false
  if (task.completedAt) return false
  return true
}

/** Llamado desde el store de tasks después de un add/update. Decide si
 *  crear, actualizar o borrar el event linkeado. Devuelve el patch que
 *  el caller debe aplicar a la task (gcalEventId, gcalCalendarId) — el
 *  caller es responsable de persistir esos cambios. */
export async function syncTaskToGcal(task: Task): Promise<Partial<Task>> {
  const cfg = useAppStore.getState().gcalTasksSync
  if (!cfg.enabled || !cfg.calendarId) return {}

  const gcal = useGoogleCalendarStore.getState()
  if (!gcal.connected) return {}

  const eventable = isEventable(task)
  const hasLink = !!task.gcalEventId && !!task.gcalCalendarId

  // Caso 1: task ya no es eventable pero tenía un evento → BORRAR.
  if (!eventable && hasLink) {
    try {
      await gcal.deleteEvent(task.gcalEventId!, task.gcalCalendarId!)
    } catch (e) {
      console.warn('[task→gcal] delete failed', e instanceof Error ? e.message : e)
    }
    return { gcalEventId: undefined, gcalCalendarId: undefined }
  }

  // Caso 2: no es eventable y no tenía evento → nada.
  if (!eventable) return {}

  // Caso 3: es eventable. Build el payload.
  const timing = buildEventTiming(task)
  if (!timing) return {}

  // Caso 3a: ya existía → UPDATE.
  if (hasLink) {
    try {
      await gcal.updateEvent(task.gcalEventId!, task.gcalCalendarId!, {
        summary: task.title,
        description: task.description ?? task.notes ?? undefined,
        start: timing.start,
        end: timing.end,
        allDay: false,
        timeZone: timing.timeZone,
      })
      return {}
    } catch (e) {
      console.warn('[task→gcal] update failed; will attempt re-create', e instanceof Error ? e.message : e)
      // Si update falla (ej. event fue borrado en GCal manualmente),
      // limpiamos el link y reintentamos como CREATE abajo.
      task = { ...task, gcalEventId: undefined, gcalCalendarId: undefined }
    }
  }

  // Caso 3b: CREATE nuevo.
  try {
    const res = await fetch('/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        calendarId: cfg.calendarId,
        summary: task.title,
        description: task.description ?? task.notes ?? undefined,
        start: timing.start,
        end: timing.end,
        allDay: false,
        timeZone: timing.timeZone,
      }),
    })
    const j = await res.json()
    if (!j.ok) throw new Error(j.error ?? 'create_failed')
    // Trigger refresh local de events sin esperar el round-trip largo.
    gcal.loadEvents().catch(() => { /* noop */ })
    return {
      gcalEventId: j.event?.id,
      gcalCalendarId: cfg.calendarId,
    }
  } catch (e) {
    console.warn('[task→gcal] create failed', e instanceof Error ? e.message : e)
    return {}
  }
}

/** Borra el evento linkeado SIN tocar la task. Usado al hard-delete de
 *  una task o al toggle off del sync. */
export async function unlinkTaskFromGcal(task: Task): Promise<void> {
  if (!task.gcalEventId || !task.gcalCalendarId) return
  const gcal = useGoogleCalendarStore.getState()
  if (!gcal.connected) return
  try {
    await gcal.deleteEvent(task.gcalEventId, task.gcalCalendarId)
  } catch (e) {
    console.warn('[task→gcal] unlink delete failed', e instanceof Error ? e.message : e)
  }
}
