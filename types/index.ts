export type Language = 'en' | 'es'

// Day type IDs are now user-extensible. Built-in IDs are still these strings;
// custom ones generated via appStore.addDayType use slugified labels.
export type DayType = string

export interface DayTypeConfig {
  id: string
  label: string
  color: string
  icon: string        // emoji
}

export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type Impact = 'low' | 'medium' | 'high' | 'critical'
export type StatusType = 'active' | 'done' | 'paused'

export interface CustomStatus {
  id: string
  label: string
  color: string
  order: number
  countsAsDone: boolean
}

export interface Subtask {
  id: string
  title: string
  completed: boolean
  status: string
  order: number
  notes?: string
  priority?: Priority
  /** ID of parent subtask (for grouping). Only 1 level of nesting allowed. */
  parentId?: string
  /** Timestamp when this subtask was marked complete. Mirrors the
   *  parent Task contract — used by the auto-archive purge to decide
   *  when to send a completed subtask to the trash. */
  completedAt?: string
  /** Timestamp when archived (sent to papelera). Subtasks behave like
   *  tasks: completed → live one more day → archived. The UI filters
   *  archived subtasks out of the tree by default. */
  archivedAt?: string
  /** Due date (ISO YYYY-MM-DD). Lets the user track deadlines per subtask
   *  — useful for sub-projects within a project where chunks have their
   *  own delivery dates. */
  dueDate?: string
  /** Optional short description / context, surfaced in the detail modal. */
  description?: string
}

/** Recurrence rule for a Task. Used by the store to auto-spawn the next
 *  instance when the current one is completed. The original dueDate
 *  defines the "anchor" — daily continues each day, weekly continues
 *  same weekday (or any weekday listed in `daysOfWeek`), monthly continues
 *  same day-of-month, etc.
 *
 *  When `until` is set, no new instance is spawned after that date. */
export type TaskRecurrenceKind = 'daily' | 'weekdays' | 'weekly' | 'monthly'

export interface TaskRecurrence {
  kind: TaskRecurrenceKind
  /** Para 'weekly': días de la semana en los que se repite. 0=Dom … 6=Sáb.
   *  Si no se especifica, usamos el día de la semana del dueDate original. */
  daysOfWeek?: number[]
  /** Fecha tope (YYYY-MM-DD, inclusive) — no se generan instancias después. */
  until?: string
}

export interface Task {
  id: string
  projectId: string
  title: string
  description?: string
  status: string
  priority: Priority
  importance: Impact
  dueDate?: string
  /** Hora opcional para la dueDate (HH:MM, 24h). Cuando está presente +
   *  hay dueDate, el calendario y las notificaciones lo tratan como un
   *  evento "con hora", no "all-day". */
  dueTime?: string
  /** Duración del bloque en minutos. Solo aplica cuando hay `dueTime`
   *  — sin hora, una tarea es un "to-do del día" y no tiene duración.
   *  Default 60 (una hora). Lo usa el calendario para dibujar el alto
   *  del bloque y el sync GCal para `end = start + duration`. */
  durationMinutes?: number
  /** ID del evento de Google Calendar linkeado a esta tarea (cuando el
   *  user tiene el sync activado y la task tiene `dueTime`). Vacío
   *  significa "no hay sync para esta task". Lo seteamos al crear el
   *  evento; lo borramos al eliminarlo. */
  gcalEventId?: string
  /** Calendario de Google en el que vive el evento linkeado. Necesario
   *  para actualizarlo/borrarlo después (la API de GCal requiere
   *  calendarId además de eventId). */
  gcalCalendarId?: string
  energyEstimate?: number
  notes?: string
  subtasks: Subtask[]
  createdAt: string
  scheduledFor?: 'today' | 'tomorrow'
  completedAt?: string
  /** ISO timestamp when the task was moved to the archive ("papelera de
   *  completadas"). Set automatically by the auto-purge process the day after
   *  completion. Tasks with archivedAt are excluded from normal views and only
   *  appear in the archive view, where they can be restored or permanently
   *  deleted. */
  archivedAt?: string
  updatedAt: string
  postponedCount?: number
  category?: string
  /** Regla de recurrencia opcional. Al completar, el store crea la
   *  siguiente instancia automáticamente (ver `tasksStore.completeTask`). */
  recurrence?: TaskRecurrence
  /** Override por-tarea de "cuánto tiempo antes" notificar. Si no está
   *  definido, se usa el valor global de `notificationPrefs.taskDueLeadMinutes`. */
  notifyBeforeMinutes?: number
}

export interface Project {
  id: string
  name: string
  color: string
  icon?: string
  description?: string
  statuses: CustomStatus[]
  taskIds: string[]
  createdAt: string
  archived: boolean
  /** Marks projects owned by another system (e.g. SPI) that should NOT be
   *  user-deletable from the task manager. They can still be renamed/recolored
   *  and the user can add tasks manually, but the delete button is disabled
   *  and a small "sistema" badge is shown. */
  isSystemProject?: boolean
  /** Optional key identifying which system owns this project. Used for
   *  auto-recreate logic and badge labels. Currently: 'spi'. */
  systemProjectKey?: 'spi'
}

export interface MetricEntry {
  focus: number
  energy: number
  sleep: number
  stress: number
  steps: number
  wakeTime: string
  sleepDebt: number
  workload: number
}

export interface ChatActionCard {
  type: 'confirm_task' | 'confirm_move' | 'confirm_postpone' | 'ask_project' | 'plan_2h'
  payload: Record<string, unknown>
  confirmed?: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  actionCard?: ChatActionCard
}

export interface DayData {
  date: string
  dayType?: DayType
  energyScore: number
  focusScore: number
  progressScore: number
  notes?: string
}

export interface Memory {
  id: string
  title: string
  content: string
  category: string
  createdAt: string
  updatedAt: string
}

export interface FrictionLog {
  id: string
  taskId?: string
  projectId?: string
  type: string
  description: string
  createdAt: string
}
