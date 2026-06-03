import type { PushPayload } from '@/lib/push/server'

/** Builders de payload por canal. Cada uno arma el { title, body, url, tag }
 *  que el service worker va a mostrar como notificación nativa en el
 *  dispositivo del usuario. La `tag` permite COLAPSAR notificaciones
 *  duplicadas (ej. si dispara 2 task_due para la misma tarea por algún
 *  motivo, solo se ve la última).
 *
 *  Reglas:
 *   - `title` corto (≤50 chars idealmente) — entra completo en lockscreen iOS
 *   - `body` máx 2-3 líneas
 *   - `url` adonde mandamos al usuario al tocar la notif
 *   - `tag` único por "stream" — habit-reminder colapsa todos los habit reminders */

interface MinimalHabit {
  name: string
  icon: string
}
interface MinimalTask {
  id: string
  title: string
  description?: string
  dueDate?: string
  dueTime?: string
}

/** Recordatorio puntual para UN hábito específico a su hora elegida.
 *  Diferente del recordatorio nocturno general (que arma una lista). */
export function buildHabitSpecificPayload(habit: MinimalHabit, hhmm: string): PushPayload {
  return {
    title: `${habit.icon ?? '🟢'} ${hhmm} · ${habit.name}`,
    body: 'Tocá para marcarlo como hecho.',
    url: '/habits',
    tag: `habit-time-${habit.name}`,
  }
}

export function buildHabitReminderPayload(pending: MinimalHabit[]): PushPayload {
  const names = pending.slice(0, 3).map((h) => `${h.icon} ${h.name}`).join(', ')
  const extra = pending.length > 3 ? ` +${pending.length - 3} más` : ''
  return {
    title: pending.length === 1
      ? `🟢 Te falta marcar 1 hábito hoy`
      : `🟢 Te faltan ${pending.length} hábitos hoy`,
    body: `${names}${extra}`,
    url: '/habits',
    tag: 'habit-reminder',
  }
}

export function buildTaskDuePayload(t: MinimalTask, leadMin: number): PushPayload {
  const when = leadMin === 0 ? 'AHORA'
    : leadMin < 60 ? `en ${leadMin} min`
    : leadMin < 1440 ? `en ${Math.round(leadMin / 60)} h`
    : leadMin === 1440 ? 'mañana'
    : `en ${Math.round(leadMin / 1440)} días`
  return {
    title: `📋 Vence ${when}: ${t.title}`,
    body: t.description?.slice(0, 140) ?? 'Tocá para abrir la tarea.',
    url: `/tasks?focus=${t.id}`,
    tag: `task-due-${t.id}`,
  }
}

export function buildTaskOverduePayload(tasks: MinimalTask[]): PushPayload {
  const titlesPreview = tasks.slice(0, 3).map((t) => `· ${t.title}`).join('\n')
  return {
    title: `⚠️ ${tasks.length} tarea${tasks.length === 1 ? '' : 's'} vencida${tasks.length === 1 ? '' : 's'}`,
    body: titlesPreview + (tasks.length > 3 ? `\n+${tasks.length - 3} más` : ''),
    url: '/tasks',
    tag: 'task-overdue',
  }
}

export function buildSpiNewPayload(weekLabel: string): PushPayload {
  return {
    title: '📐 Nuevo SPI semanal habilitado',
    body: `La sesión de la semana del ${weekLabel} ya está disponible.`,
    url: '/proyeccion',
    tag: 'spi-new',
  }
}
