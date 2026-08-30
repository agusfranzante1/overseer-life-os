/** Lecturas del bridge — la lógica compartida entre `/api/mcp` y
 *  `/api/export/brief`. Nada de esto se duplica en las rutas.
 *
 *  Todo corre del lado SERVER con el cliente admin de Supabase (service role),
 *  filtrando SIEMPRE por el `userId` que resolvió el token. El service role
 *  saltea RLS, así que ese filtro explícito es la única barrera: no se puede
 *  olvidar en ninguna query.
 */

import { google } from 'googleapis'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedClient } from '@/lib/google/oauthClient'
import type { PlannerProfile } from '@/types'
import { computeFreeSlots, totalFreeMinutes, dayWindow, type Interval, type FreeSlot } from './freeSlots'

// ---------------------------------------------------------------------------
// Tipos de salida (lo que ve Claude)
// ---------------------------------------------------------------------------

export interface BridgeTask {
  id: string
  title: string
  project: string
  projectId: string
  status: string
  priority: string
  importance: string
  dueDate?: string
  dueTime?: string
  durationMinutes?: number
  energyEstimate?: number
  tags?: string[]
  favorite?: boolean
  scheduledFor?: string
  postponedCount?: number
  completedAt?: string
  isRecurring?: boolean
  notes?: string
  subtasks?: { total: number; done: number; pending: string[] }
}

export interface AgendaEvent {
  title: string
  start: string
  end: string
  allDay: boolean
  calendar?: string
  location?: string
}

export interface AgendaDay {
  date: string
  weekday: string
  dayType?: string
  events: AgendaEvent[]
  /** Anclas del día del usuario (almuerzo, entrenamiento…). Son compromisos
   *  reales, se descuentan del tiempo libre igual que un evento. */
  anchors: { label: string; time: string }[]
  freeSlots: FreeSlot[]
  freeMinutes: number
  tasksDue: BridgeTask[]
  plan?: DayPlanRow | null
}

export type { PlannerProfile } from '@/types'

export interface DayPlanBlockRow {
  id: string
  start?: string
  end?: string
  taskId?: string
  title: string
  kind: 'task' | 'event' | 'break' | 'focus'
  reason?: string
  done?: boolean
}

export interface DayPlanRow {
  id: string
  date: string
  blocks: DayPlanBlockRow[]
  note?: string
  source?: string
  createdAt?: string
  updatedAt?: string
}

const DEFAULT_WORKING = { start: '09:00', end: '21:00' }
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

// ---------------------------------------------------------------------------
// Helpers de fecha / zona horaria
// ---------------------------------------------------------------------------

/** Offset de `timeZone` respecto de UTC, en minutos, para ese instante.
 *  Buenos Aires → -180. Se calcula con Intl para que los cambios de horario
 *  de verano salgan bien solos. */
export function tzOffsetMinutes(at: Date, timeZone: string): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    const p: Record<string, string> = {}
    for (const part of dtf.formatToParts(at)) if (part.type !== 'literal') p[part.type] = part.value
    // `hour` puede venir "24" para medianoche en hour12:false.
    const hour = p.hour === '24' ? '00' : p.hour
    const asUTC = Date.UTC(
      Number(p.year), Number(p.month) - 1, Number(p.day),
      Number(hour), Number(p.minute), Number(p.second),
    )
    return Math.round((asUTC - at.getTime()) / 60000)
  } catch {
    return 0
  }
}

/** Lista de fechas YYYY-MM-DD entre from y to, inclusive. Tope de 31 días. */
export function dateRange(from: string, to: string, max = 31): string[] {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return []
  const out: string[] = []
  for (let t = start; t <= end && out.length < max; t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

function weekdayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  return WEEKDAYS[d.getUTCDay()] ?? ''
}

// ---------------------------------------------------------------------------
// Preferencias (blob app_preferences)
// ---------------------------------------------------------------------------

export interface UserPrefs {
  timezone: string
  idealSchedule: Record<string, { label: string; time: string }>
  scheduleOrder: string[]
  dayTypes: { id: string; label: string }[]
  metrics: Record<string, unknown>
  plannerProfile: PlannerProfile
}

export async function getUserPrefs(userId: string): Promise<UserPrefs> {
  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('app_preferences')
    .select('payload')
    .eq('user_id', userId)
    .maybeSingle()

  const p = (data?.payload ?? {}) as Record<string, unknown>
  return {
    timezone: (p.timezone as string) || 'America/Argentina/Buenos_Aires',
    idealSchedule: (p.idealSchedule as UserPrefs['idealSchedule']) ?? {},
    scheduleOrder: (p.scheduleOrder as string[]) ?? [],
    dayTypes: (p.dayTypes as UserPrefs['dayTypes']) ?? [],
    metrics: (p.metrics as Record<string, unknown>) ?? {},
    plannerProfile: (p.plannerProfile as PlannerProfile) ?? {},
  }
}

export async function getPlannerProfile(userId: string): Promise<PlannerProfile> {
  return (await getUserPrefs(userId)).plannerProfile
}

// ---------------------------------------------------------------------------
// Tareas
// ---------------------------------------------------------------------------

export interface TaskFilters {
  projectId?: string
  status?: string
  tags?: string[]
  includeCompleted?: boolean
  limit?: number
}

/** `select('*')` a propósito: la tabla `tasks` fue creciendo por migraciones
 *  y no todas están corridas en todos los entornos. Pedir columnas por nombre
 *  haría fallar la query entera por una columna que falta; con `*` traemos lo
 *  que haya y lo leemos defensivamente. */
export async function getTasks(userId: string, f: TaskFilters = {}): Promise<BridgeTask[]> {
  const sb = getSupabaseAdmin()

  const [{ data: projectRows }, { data: taskRows }] = await Promise.all([
    sb.from('projects').select('id, name, archived').eq('user_id', userId),
    sb.from('tasks').select('*').eq('user_id', userId).limit(2000),
  ])

  const projects = new Map<string, { name: string; archived: boolean }>()
  for (const p of projectRows ?? []) {
    projects.set(p.id as string, { name: (p.name as string) ?? '?', archived: !!p.archived })
  }

  let rows = (taskRows ?? []) as Record<string, unknown>[]

  // Las archivadas (papelera) nunca salen: son ruido puro para el planificador.
  rows = rows.filter((r) => !r.archived_at)
  if (!f.includeCompleted) rows = rows.filter((r) => !r.completed_at)
  if (f.projectId) rows = rows.filter((r) => r.project_id === f.projectId)
  if (f.status) rows = rows.filter((r) => r.status === f.status)
  if (f.tags?.length) {
    const want = new Set(f.tags.map((t) => t.toLowerCase()))
    rows = rows.filter((r) => {
      const tags = Array.isArray(r.tags) ? (r.tags as string[]) : []
      return tags.some((t) => want.has(String(t).toLowerCase()))
    })
  }
  // Tareas de proyectos archivados tampoco interesan.
  rows = rows.filter((r) => !projects.get(r.project_id as string)?.archived)

  const taskIds = rows.map((r) => r.id as string)
  const subsByTask = await getSubtaskSummary(userId, taskIds)

  const out = rows.map((r) => toBridgeTask(r, projects, subsByTask))

  // Orden útil por defecto: primero lo que vence antes, después por prioridad.
  const prioRank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
  out.sort((a, b) => {
    const ad = a.dueDate ?? '9999-99-99'
    const bd = b.dueDate ?? '9999-99-99'
    if (ad !== bd) return ad < bd ? -1 : 1
    return (prioRank[a.priority] ?? 9) - (prioRank[b.priority] ?? 9)
  })

  return out.slice(0, f.limit ?? 200)
}

async function getSubtaskSummary(userId: string, taskIds: string[]) {
  const map = new Map<string, { total: number; done: number; pending: string[] }>()
  if (taskIds.length === 0) return map
  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('subtasks')
    .select('task_id, title, completed')
    .eq('user_id', userId)
    .limit(5000)

  for (const s of data ?? []) {
    const key = s.task_id as string
    if (!taskIds.includes(key)) continue
    const entry = map.get(key) ?? { total: 0, done: 0, pending: [] }
    entry.total++
    if (s.completed) entry.done++
    else if (entry.pending.length < 10) entry.pending.push((s.title as string) ?? '')
    map.set(key, entry)
  }
  return map
}

function toBridgeTask(
  r: Record<string, unknown>,
  projects: Map<string, { name: string }>,
  subs: Map<string, { total: number; done: number; pending: string[] }>,
): BridgeTask {
  const notes = typeof r.notes === 'string' ? r.notes : undefined
  const sub = subs.get(r.id as string)
  return {
    id: r.id as string,
    title: (r.title as string) ?? '',
    project: projects.get(r.project_id as string)?.name ?? '?',
    projectId: r.project_id as string,
    status: (r.status as string) ?? 'To Do',
    priority: (r.priority as string) ?? 'medium',
    importance: (r.importance as string) ?? 'medium',
    dueDate: (r.due_date as string) ?? undefined,
    dueTime: (r.due_time as string) ?? undefined,
    durationMinutes: (r.duration_minutes as number) ?? undefined,
    energyEstimate: (r.energy_estimate as number) ?? undefined,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : undefined,
    favorite: (r.favorite as boolean) || undefined,
    scheduledFor: (r.scheduled_for as string) ?? undefined,
    postponedCount: (r.postponed_count as number) ?? undefined,
    completedAt: (r.completed_at as string) ?? undefined,
    isRecurring: !!r.recurrence || !!r.recurring_head_id || undefined,
    notes: notes ? notes.slice(0, 500) : undefined,
    subtasks: sub && sub.total > 0 ? sub : undefined,
  }
}

// ---------------------------------------------------------------------------
// Google Calendar (server-side, con el refresh_token guardado)
// ---------------------------------------------------------------------------

export interface CalendarResult {
  connected: boolean
  events: AgendaEvent[]
  error?: string
}

export async function getCalendarEvents(
  userId: string,
  origin: string,
  timeMin: string,
  timeMax: string,
): Promise<CalendarResult> {
  try {
    const sb = getSupabaseAdmin()
    const auth = await getAuthedClient(sb, userId, `${origin}/api/auth/google/callback`)
    if (!auth) return { connected: false, events: [] }

    const calendar = google.calendar({ version: 'v3', auth })
    const list = await calendar.calendarList.list({ maxResults: 250 })
    const calendars = (list.data.items ?? []).filter((c) => !c.hidden && c.id)

    const events: AgendaEvent[] = []
    for (const cal of calendars) {
      const res = await calendar.events.list({
        calendarId: cal.id!, timeMin, timeMax,
        singleEvents: true, orderBy: 'startTime', maxResults: 500,
      })
      for (const e of res.data.items ?? []) {
        if (e.status === 'cancelled') continue
        const allDay = !!e.start?.date
        const start = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00.000Z` : null)
        const end = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00.000Z` : null)
        if (!start || !end) continue
        events.push({
          title: e.summary ?? '(sin título)',
          start, end, allDay,
          calendar: cal.summary ?? undefined,
          location: e.location ?? undefined,
        })
      }
    }
    events.sort((a, b) => (a.start < b.start ? -1 : 1))
    return { connected: true, events }
  } catch (err) {
    // BASE nº6: si el calendario falla, se DICE. No se devuelve "sin eventos"
    // como si el día estuviera libre — eso haría que Claude agende encima de
    // reuniones reales.
    return { connected: true, events: [], error: err instanceof Error ? err.message : 'calendar_failed' }
  }
}

// ---------------------------------------------------------------------------
// Planes del día
// ---------------------------------------------------------------------------

export async function getDayPlans(userId: string, from: string, to: string): Promise<DayPlanRow[]> {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('day_plans')
    .select('*')
    .eq('user_id', userId)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })

  // La tabla puede no existir todavía (migración sin correr). No es motivo
  // para tirar abajo toda la agenda.
  if (error) return []
  return (data ?? []).map(rowToDayPlan)
}

function rowToDayPlan(r: Record<string, unknown>): DayPlanRow {
  return {
    id: r.id as string,
    date: r.date as string,
    blocks: Array.isArray(r.blocks) ? (r.blocks as DayPlanBlockRow[]) : [],
    note: (r.note as string) ?? undefined,
    source: (r.source as string) ?? undefined,
    createdAt: (r.created_at as string) ?? undefined,
    updatedAt: (r.updated_at as string) ?? undefined,
  }
}

/** Plan propuesto vs. lo que REALMENTE pasó. Es la herramienta con la que el
 *  planificador aprende: si un tipo de bloque se patea sistemáticamente, se ve
 *  acá. */
export async function getPlanHistory(userId: string, days = 14) {
  const today = new Date()
  const from = new Date(today.getTime() - days * 86400000).toISOString().slice(0, 10)
  const to = today.toISOString().slice(0, 10)

  const plans = await getDayPlans(userId, from, to)
  const allTasks = await getTasks(userId, { includeCompleted: true, limit: 2000 })
  const byId = new Map(allTasks.map((t) => [t.id, t]))

  return plans.map((plan) => {
    const blocks = plan.blocks.map((b) => {
      const task = b.taskId ? byId.get(b.taskId) : undefined
      return {
        title: b.title,
        kind: b.kind,
        start: b.start,
        end: b.end,
        reason: b.reason,
        /** El usuario tildó el bloque en la app. */
        markedDone: !!b.done,
        /** La tarea linkeada quedó realmente completada. */
        taskCompleted: task ? !!task.completedAt : undefined,
        /** Sigue pendiente y ya se pateó N veces. */
        taskPostponedCount: task?.postponedCount,
      }
    })
    const done = blocks.filter((b) => b.markedDone || b.taskCompleted === true).length
    return {
      date: plan.date,
      note: plan.note,
      source: plan.source,
      blocks,
      completion: blocks.length > 0 ? Math.round((done / blocks.length) * 100) : null,
    }
  })
}

// ---------------------------------------------------------------------------
// AGENDA — la herramienta principal
// ---------------------------------------------------------------------------

export async function getAgenda(userId: string, origin: string, from: string, to: string) {
  const days = dateRange(from, to)
  if (days.length === 0) {
    return { error: 'rango_invalido', detail: 'from/to deben ser YYYY-MM-DD con to >= from.' }
  }

  const prefs = await getUserPrefs(userId)
  const working = prefs.plannerProfile.workingHours ?? DEFAULT_WORKING

  const timeMin = `${days[0]}T00:00:00.000Z`
  const timeMax = new Date(Date.parse(`${days[days.length - 1]}T00:00:00Z`) + 2 * 86400000).toISOString()

  const [cal, tasks, plans] = await Promise.all([
    getCalendarEvents(userId, origin, timeMin, timeMax),
    getTasks(userId, { limit: 500 }),
    getDayPlans(userId, days[0], days[days.length - 1]),
  ])

  const plansByDate = new Map(plans.map((p) => [p.date, p]))

  // Anclas del día (almuerzo, entrenamiento…). Ocupan 45 min por defecto:
  // no son eventos de calendario pero son tiempo real que el usuario usa.
  const ANCHOR_MINUTES = 45
  const anchorKeys = prefs.scheduleOrder.length > 0
    ? prefs.scheduleOrder
    : Object.keys(prefs.idealSchedule)

  const agenda: AgendaDay[] = days.map((date) => {
    const offset = tzOffsetMinutes(new Date(`${date}T12:00:00Z`), prefs.timezone)
    const win = dayWindow(date, working.start, working.end, offset)

    const dayStart = Date.parse(`${date}T00:00:00Z`) - offset * 60000
    const dayEnd = dayStart + 86400000

    const events = cal.events.filter((e) => {
      const s = Date.parse(e.start)
      return s >= dayStart && s < dayEnd
    })

    const anchors = anchorKeys
      .map((k) => prefs.idealSchedule[k])
      .filter((s): s is { label: string; time: string } => !!s?.time)
      .map((s) => ({ label: s.label, time: s.time }))

    const anchorBusy: Interval[] = anchors
      .map((a) => dayWindow(date, a.time, addMinutes(a.time, ANCHOR_MINUTES), offset))
      .filter((i): i is Interval => i !== null)

    const eventBusy: Interval[] = events
      .filter((e) => !e.allDay)
      .map((e) => ({ start: e.start, end: e.end }))

    const freeSlots = win ? computeFreeSlots(win.start, win.end, [...eventBusy, ...anchorBusy]) : []

    return {
      date,
      weekday: weekdayOf(date),
      events,
      anchors,
      freeSlots,
      freeMinutes: totalFreeMinutes(freeSlots),
      tasksDue: tasks.filter((t) => t.dueDate === date),
      plan: plansByDate.get(date) ?? null,
    }
  })

  return {
    timezone: prefs.timezone,
    workingHours: working,
    calendar: { connected: cal.connected, error: cal.error },
    days: agenda,
  }
}

function addMinutes(hhmm: string, minutes: number): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return hhmm
  const total = Number(m[1]) * 60 + Number(m[2]) + minutes
  const h = Math.floor(total / 60) % 24
  return `${String(h).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Brief — todo junto, para el export read-only
// ---------------------------------------------------------------------------

export async function getBrief(userId: string, origin: string, days = 14) {
  const today = new Date().toISOString().slice(0, 10)
  const to = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)

  const [agenda, tasks, profile, history] = await Promise.all([
    getAgenda(userId, origin, today, to),
    getTasks(userId, { limit: 300 }),
    getPlannerProfile(userId),
    getPlanHistory(userId, 14),
  ])

  return {
    generatedAt: new Date().toISOString(),
    today,
    agenda,
    tasks,
    plannerProfile: profile,
    planHistory: history,
  }
}
