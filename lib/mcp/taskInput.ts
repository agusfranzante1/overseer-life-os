/** Validación y normalización PURA de lo que el bridge recibe para crear
 *  tareas. Sin I/O — así se testea de verdad (`npx tsx lib/mcp/taskInput.test.ts`).
 *
 *  Acá vive el conocimiento incómodo que hace que una tarea creada desde
 *  afuera se vea igual que una creada en la app:
 *
 *   - `tasks.status` es NOT NULL y SIN default, y cada proyecto tiene sus
 *     PROPIOS estados (los del usuario están en español: "Hacer", "Haciendo").
 *     Hardcodear "To Do" mete la tarea en una columna que en ese tablero no
 *     existe. Hay que resolverlo contra los estados del proyecto destino.
 *   - Para que la tarea aparezca en el CALENDARIO de Overseer hacen falta
 *     `dueDate` **y** `dueTime` juntos (ver CalendarPage). Solo con fecha es
 *     un "to-do del día" y no se dibuja como bloque.
 */

import type { TaskRecurrence, TaskRecurrenceKind } from '@/types'

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const TIME_RE = /^\d{1,2}:\d{2}$/

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
const IMPORTANCES = ['low', 'medium', 'high'] as const
const KINDS: TaskRecurrenceKind[] = ['daily', 'weekdays', 'weekly', 'monthly']

export interface ProjectStatus {
  label: string
  order?: number
  countsAsDone?: boolean
}

export function pad(hhmm: string): string {
  const [h, m] = hhmm.split(':')
  return `${h.padStart(2, '0')}:${m}`
}

/** Id único para una fila creada desde el bridge.
 *
 *  Deliberadamente SIN `_` ni `__`: el dominio recurrente le da significado a
 *  esos separadores (`rec_<madre>_<fecha>`, `<instancia>__<subtarea>`,
 *  `recsub_<subtarea>_<fecha>`). Un id con guiones bajos podría hacerse pasar
 *  por una instancia generada y confundir al dedupe. */
export function bridgeId(rand: () => string = defaultRand): string {
  return `mcp${rand()}`
}

function defaultRand(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/**
 * Elige el estado inicial para una tarea nueva en un proyecto.
 *
 * Orden de preferencia:
 *  1. El `wanted` que pidió el caller, si existe en el proyecto (case-insensitive).
 *  2. El primer estado del proyecto que NO cuente como "hecho".
 *  3. El primero que haya.
 *  4. 'To Do' como último recurso (proyecto sin estados configurados).
 *
 * Nunca devuelve un estado que no exista en el proyecto, salvo el fallback.
 */
export function resolveStatus(statuses: ProjectStatus[] | undefined, wanted?: string): string {
  const list = (statuses ?? []).filter((s) => typeof s?.label === 'string' && s.label)
  if (wanted) {
    const hit = list.find((s) => s.label.toLowerCase() === wanted.trim().toLowerCase())
    if (hit) return hit.label
  }
  const ordered = [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const notDone = ordered.find((s) => !s.countsAsDone)
  return notDone?.label ?? ordered[0]?.label ?? 'To Do'
}

export function normalizePriority(v: unknown): string {
  const s = typeof v === 'string' ? v.toLowerCase().trim() : ''
  return (PRIORITIES as readonly string[]).includes(s) ? s : 'medium'
}

export function normalizeImportance(v: unknown): string {
  const s = typeof v === 'string' ? v.toLowerCase().trim() : ''
  return (IMPORTANCES as readonly string[]).includes(s) ? s : 'medium'
}

/**
 * Valida una regla de recurrencia.
 *
 * Devuelve `{ ok: false, error }` en vez de "arreglar" silenciosamente una
 * regla inválida: una recurrencia mal formada genera instancias en fechas
 * raras, y eso en este proyecto ya costó caro (BASE nº6).
 */
export function validateRecurrence(
  raw: unknown,
): { ok: true; recurrence: TaskRecurrence } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '`recurrence` tiene que ser un objeto.' }
  const r = raw as Record<string, unknown>

  const kind = typeof r.kind === 'string' ? r.kind : ''
  if (!KINDS.includes(kind as TaskRecurrenceKind)) {
    return { ok: false, error: `\`kind\` tiene que ser uno de: ${KINDS.join(', ')}.` }
  }

  const out: TaskRecurrence = { kind: kind as TaskRecurrenceKind }

  if (r.daysOfWeek !== undefined) {
    if (!Array.isArray(r.daysOfWeek)) return { ok: false, error: '`daysOfWeek` tiene que ser un array.' }
    const days = r.daysOfWeek
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    if (days.length !== r.daysOfWeek.length) {
      return { ok: false, error: '`daysOfWeek` admite enteros 0..6 (0=domingo).' }
    }
    if (days.length > 0) out.daysOfWeek = [...new Set(days)].sort((a, b) => a - b)
  }

  if (r.until !== undefined && r.until !== null) {
    if (typeof r.until !== 'string' || !DATE_RE.test(r.until)) {
      return { ok: false, error: '`until` tiene que ser YYYY-MM-DD.' }
    }
    out.until = r.until
  }

  return { ok: true, recurrence: out }
}

export interface NormalizedTask {
  title: string
  description?: string
  status: string
  priority: string
  importance: string
  dueDate?: string
  dueTime?: string
  durationMinutes?: number
  energyEstimate?: number
  notes?: string
  category?: string
  tags?: string[]
  favorite?: boolean
  scheduledFor?: 'today' | 'tomorrow'
  recurrence?: TaskRecurrence
  /** true cuando la tarea va a dibujarse como bloque en el calendario de
   *  Overseer (necesita fecha Y hora). Se devuelve para poder avisarle a
   *  quien la creó, en vez de que se pregunte por qué no la ve. */
  showsInCalendar: boolean
}

export interface NormalizeResult {
  ok: boolean
  error?: string
  task?: NormalizedTask
  /** Avisos que NO invalidan la creación pero conviene decir. */
  warnings: string[]
}

/** Normaliza el input de `create_task` contra los estados del proyecto destino. */
export function normalizeTaskInput(
  input: Record<string, unknown>,
  projectStatuses: ProjectStatus[] | undefined,
): NormalizeResult {
  const warnings: string[] = []

  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (!title) return { ok: false, error: 'Falta `title`.', warnings }

  const task: NormalizedTask = {
    title: title.slice(0, 500),
    status: resolveStatus(projectStatuses, input.status as string | undefined),
    priority: normalizePriority(input.priority),
    importance: normalizeImportance(input.importance),
    showsInCalendar: false,
  }

  if (input.status && task.status.toLowerCase() !== String(input.status).toLowerCase()) {
    warnings.push(`El estado "${input.status}" no existe en ese proyecto; se usó "${task.status}".`)
  }

  if (typeof input.description === 'string' && input.description.trim()) {
    task.description = input.description.trim().slice(0, 5000)
  }
  if (typeof input.notes === 'string' && input.notes.trim()) {
    task.notes = input.notes.trim().slice(0, 5000)
  }
  if (typeof input.category === 'string' && input.category.trim()) {
    task.category = input.category.trim().slice(0, 100)
  }

  if (input.dueDate !== undefined && input.dueDate !== null) {
    if (typeof input.dueDate !== 'string' || !DATE_RE.test(input.dueDate)) {
      return { ok: false, error: '`dueDate` tiene que ser YYYY-MM-DD.', warnings }
    }
    task.dueDate = input.dueDate
  }

  if (input.dueTime !== undefined && input.dueTime !== null) {
    if (typeof input.dueTime !== 'string' || !TIME_RE.test(input.dueTime)) {
      return { ok: false, error: '`dueTime` tiene que ser HH:MM.', warnings }
    }
    task.dueTime = pad(input.dueTime)
    // Sin fecha, la hora no ubica nada: el calendario no la puede dibujar.
    if (!task.dueDate) warnings.push('Pusiste `dueTime` sin `dueDate`: la tarea NO va a aparecer en el calendario.')
  }

  if (input.durationMinutes !== undefined && input.durationMinutes !== null) {
    const n = Number(input.durationMinutes)
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, error: '`durationMinutes` tiene que ser > 0.', warnings }
    }
    task.durationMinutes = Math.round(n)
    if (!task.dueTime) warnings.push('`durationMinutes` solo se usa cuando hay `dueTime`.')
  }

  if (input.energyEstimate !== undefined && input.energyEstimate !== null) {
    const n = Number(input.energyEstimate)
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return { ok: false, error: '`energyEstimate` tiene que ser un entero de 1 a 5.', warnings }
    }
    task.energyEstimate = n
  }

  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags)) return { ok: false, error: '`tags` tiene que ser un array.', warnings }
    task.tags = input.tags
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      .map((t) => t.trim().slice(0, 60))
      .slice(0, 20)
  }

  if (typeof input.favorite === 'boolean') task.favorite = input.favorite

  if (input.scheduledFor !== undefined && input.scheduledFor !== null) {
    if (input.scheduledFor !== 'today' && input.scheduledFor !== 'tomorrow') {
      return { ok: false, error: "`scheduledFor` = 'today' | 'tomorrow'.", warnings }
    }
    task.scheduledFor = input.scheduledFor
  }

  if (input.recurrence !== undefined && input.recurrence !== null) {
    const r = validateRecurrence(input.recurrence)
    if (!r.ok) return { ok: false, error: r.error, warnings }
    task.recurrence = r.recurrence
    // Sin ancla no hay serie: el buffer del cliente arranca desde la dueDate.
    if (!task.dueDate) {
      return {
        ok: false,
        error: 'Una tarea recurrente necesita `dueDate`: esa fecha es el ancla desde la que se generan las instancias.',
        warnings,
      }
    }
  }

  task.showsInCalendar = !!(task.dueDate && task.dueTime)
  return { ok: true, task, warnings }
}

/** Normaliza la lista de subtareas de `create_task`. Un string suelto vale
 *  como título, para poder mandar `["comprar", "cocinar"]`. */
export function normalizeSubtasks(
  raw: unknown,
  makeId: () => string,
): { ok: true; subtasks: { id: string; title: string; order: number }[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, subtasks: [] }
  if (!Array.isArray(raw)) return { ok: false, error: '`subtasks` tiene que ser un array.' }

  const out: { id: string; title: string; order: number }[] = []
  for (const item of raw) {
    const title = typeof item === 'string'
      ? item.trim()
      : (item && typeof item === 'object' && typeof (item as Record<string, unknown>).title === 'string'
          ? ((item as Record<string, unknown>).title as string).trim()
          : '')
    if (!title) continue
    out.push({ id: makeId(), title: title.slice(0, 500), order: out.length })
    if (out.length >= 100) break
  }
  return { ok: true, subtasks: out }
}
