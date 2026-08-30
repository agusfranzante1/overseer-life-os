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
import { computeFreeSlots, totalFreeMinutes, dayWindow, tzOffset, type Interval, type FreeSlot } from './freeSlots'

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
  subtasks?: { total: number; done: number; pending: { id: string; title: string }[] }
}

export interface AgendaEvent {
  /** Id del evento en Google. Necesario para borrarlo o moverlo. */
  id: string
  /** Calendario al que pertenece. La API de Google exige calendarId + eventId. */
  calendarId: string
  /** Si es una instancia de una serie, el id de la SERIE. Borrar la instancia
   *  la saca solo ese día; borrar la serie la saca para siempre. */
  recurringEventId?: string
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
  const map = new Map<string, { total: number; done: number; pending: { id: string; title: string }[] }>()
  if (taskIds.length === 0) return map
  const sb = getSupabaseAdmin()
  // El `id` NO es decorativo: `delete_subtasks` borra por id, y sin exponerlo
  // acá esa herramienta es inusable (no hay otra forma de saber el id de una
  // subtarea desde afuera).
  const { data } = await sb
    .from('subtasks')
    .select('id, task_id, title, completed, "order"')
    .eq('user_id', userId)
    .limit(5000)

  const wanted = new Set(taskIds)
  const rows = (data ?? []).slice().sort(
    (a, b) => Number((a as Record<string, unknown>).order ?? 0) - Number((b as Record<string, unknown>).order ?? 0),
  )

  for (const s of rows) {
    const key = s.task_id as string
    if (!wanted.has(key)) continue
    const entry = map.get(key) ?? { total: 0, done: 0, pending: [] }
    entry.total++
    if (s.completed) entry.done++
    else if (entry.pending.length < 30) {
      entry.pending.push({ id: s.id as string, title: (s.title as string) ?? '' })
    }
    map.set(key, entry)
  }
  return map
}

function toBridgeTask(
  r: Record<string, unknown>,
  projects: Map<string, { name: string }>,
  subs: Map<string, { total: number; done: number; pending: { id: string; title: string }[] }>,
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
// Proyectos
// ---------------------------------------------------------------------------

export interface BridgeProject {
  id: string
  name: string
  archived: boolean
  /** Los estados REALES del tablero. Importan para crear tareas: `status` es
   *  NOT NULL sin default y los del usuario están en español ("Hacer",
   *  "Haciendo"), no en el "To Do" que uno asumiría. */
  statuses: string[]
  pendingTasks: number
}

export async function getProjects(userId: string): Promise<BridgeProject[]> {
  const sb = getSupabaseAdmin()
  const [{ data: rows }, tasks] = await Promise.all([
    sb.from('projects').select('id, name, statuses, archived').eq('user_id', userId),
    getTasks(userId, { limit: 2000 }),
  ])

  const pending = new Map<string, number>()
  for (const t of tasks) pending.set(t.projectId, (pending.get(t.projectId) ?? 0) + 1)

  return (rows ?? []).map((p) => ({
    id: p.id as string,
    name: (p.name as string) ?? '?',
    archived: !!p.archived,
    statuses: Array.isArray(p.statuses)
      ? (p.statuses as { label?: string }[]).map((st) => st?.label ?? '').filter(Boolean)
      : [],
    pendingTasks: pending.get(p.id as string) ?? 0,
  }))
}

// ---------------------------------------------------------------------------
// Series recurrentes
// ---------------------------------------------------------------------------

export interface RecurringSeries {
  /** Id de la MADRE — es también la etiqueta de la serie (`recurringHeadId`). */
  headId: string
  title: string
  project: string
  /** La regla vive en la madre. Si es null, la fila de la madre no está en
   *  esta cuenta/dispositivo pero la serie existe igual (sus instancias la
   *  siguen etiquetando). */
  recurrence: { kind?: string; daysOfWeek?: number[]; until?: string } | null
  /** La madre está en la papelera → la serie está DETENIDA (no spawnea más). */
  stopped: boolean
  total: number
  done: number
  pending: number
  nextDue?: string
  instances: { id: string; dueDate?: string; done: boolean; archived: boolean }[]
}

/** Agrupa las tareas por `recurringHeadId` para poder revisar las series.
 *
 *  Se agrupa por esa etiqueta y NO por "quién tiene la regla", porque el
 *  `recurringHeadId` se conserva exista o no la fila de la madre — es
 *  justamente lo que impide que una serie se fragmente en una serie por
 *  instancia (ver el incidente de las recurrentes que se multiplicaban). */
export async function getRecurringSeries(userId: string): Promise<RecurringSeries[]> {
  const sb = getSupabaseAdmin()
  const [{ data: taskRows }, { data: projectRows }] = await Promise.all([
    sb.from('tasks').select('*').eq('user_id', userId).limit(3000),
    sb.from('projects').select('id, name').eq('user_id', userId),
  ])

  const projectName = new Map<string, string>()
  for (const p of projectRows ?? []) projectName.set(p.id as string, (p.name as string) ?? '?')

  const rows = (taskRows ?? []) as Record<string, unknown>[]
  const groups = new Map<string, Record<string, unknown>[]>()
  for (const r of rows) {
    const head = (r.recurring_head_id as string) || (r.recurrence ? (r.id as string) : null)
    if (!head) continue
    if (!groups.has(head)) groups.set(head, [])
    groups.get(head)!.push(r)
  }

  const out: RecurringSeries[] = []
  for (const [headId, members] of groups) {
    const mother = members.find((m) => m.id === headId)
    // La madre es el template; puede no estar (borrada, o todavía no llegó).
    const withRule = mother ?? members.find((m) => m.recurrence)
    const live = members.filter((m) => !m.archived_at)
    const done = live.filter((m) => m.completed_at).length

    const nextDue = live
      .filter((m) => !m.completed_at && typeof m.due_date === 'string')
      .map((m) => m.due_date as string)
      .sort()[0]

    out.push({
      headId,
      title: (withRule?.title as string) ?? (members[0]?.title as string) ?? '?',
      project: projectName.get((withRule?.project_id ?? members[0]?.project_id) as string) ?? '?',
      recurrence: (withRule?.recurrence as RecurringSeries['recurrence']) ?? null,
      // Madre archivada = serie detenida: el buffer y el rollover cortan ahí.
      stopped: !!mother?.archived_at || !withRule?.recurrence,
      total: members.length,
      done,
      pending: live.length - done,
      ...(nextDue ? { nextDue } : {}),
      instances: members
        .map((m) => ({
          id: m.id as string,
          dueDate: (m.due_date as string) ?? undefined,
          done: !!m.completed_at,
          archived: !!m.archived_at,
        }))
        .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
        .slice(0, 40),
    })
  }

  out.sort((a, b) => a.title.localeCompare(b.title))
  return out
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
          id: e.id ?? '',
          calendarId: cal.id!,
          ...(e.recurringEventId ? { recurringEventId: e.recurringEventId } : {}),
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
// Billetera / capital
// ---------------------------------------------------------------------------

export interface WalletInfo {
  /** Saldo por billetera y divisa, CALCULADO desde las transacciones.
   *  No hay columna de saldo: la verdad es la suma del historial. */
  balances: { wallet: string; currency: string; balance: number; movimientos: number }[]
  totalPorDivisa: Record<string, number>
  /** Ingresos / egresos de los últimos N meses, por divisa. */
  porMes: { mes: string; currency: string; ingresos: number; egresos: number; neto: number }[]
  /** Cuentas de fondeo (prop firms). Es lo que se necesita para dividir el
   *  capital y saber cuántas comprar. */
  cuentasFondeo: {
    alias: string; firma?: string; tamanio: number; costo: number
    estado: string; inicio: string; cerrada?: string
    riesgoPorTradePct?: number; perdidaDiariaMaxPct?: number; payoutObjetivo?: number
  }[]
  distribucion: { label: string; percentage: number }[]
}

export async function getWallet(userId: string, meses = 3): Promise<WalletInfo> {
  const sb = getSupabaseAdmin()
  const [wal, tx, accts, firms, dist] = await Promise.all([
    sb.from('wallets').select('id, name').eq('user_id', userId),
    sb.from('wallet_transactions').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(5000),
    sb.from('trading_accounts').select('*').eq('user_id', userId),
    sb.from('trading_firms').select('id, name').eq('user_id', userId),
    sb.from('wallet_distribution').select('label, percentage').eq('user_id', userId),
  ])

  const nombre = new Map((wal.data ?? []).map((w) => [w.id as string, (w.name as string) ?? '?']))
  const firma = new Map((firms.data ?? []).map((f) => [f.id as string, (f.name as string) ?? '?']))

  // Saldos: income suma, expense resta, transfer resta del origen y suma al destino.
  const saldo = new Map<string, { balance: number; n: number }>()
  const bump = (w: string, c: string, delta: number) => {
    const k = `${w}||${c}`
    const cur = saldo.get(k) ?? { balance: 0, n: 0 }
    cur.balance += delta; cur.n += 1
    saldo.set(k, cur)
  }

  const mensual = new Map<string, { ingresos: number; egresos: number }>()
  const desde = new Date()
  desde.setMonth(desde.getMonth() - meses)
  const desdeKey = desde.toISOString().slice(0, 7)

  for (const t of tx.data ?? []) {
    const type = t.type as string
    const amount = Number(t.amount) || 0
    const cur = t.currency_code as string
    const wid = t.wallet_id as string

    if (type === 'income') bump(wid, cur, amount)
    else if (type === 'expense') bump(wid, cur, -amount)
    else if (type === 'transfer') {
      bump(wid, cur, -amount)
      const toW = (t.to_wallet_id as string) || wid
      const toC = (t.to_currency_code as string) || cur
      bump(toW, toC, Number(t.to_amount ?? amount) || 0)
    }

    const mes = String(t.date ?? '').slice(0, 7)
    // Las transferencias NO son ingreso ni egreso: mueven plata de un bolsillo
    // a otro. Contarlas infla los dos lados y el neto miente.
    if (mes >= desdeKey && type !== 'transfer') {
      const k = `${mes}||${cur}`
      const m = mensual.get(k) ?? { ingresos: 0, egresos: 0 }
      if (type === 'income') m.ingresos += amount
      else m.egresos += amount
      mensual.set(k, m)
    }
  }

  const balances = [...saldo.entries()].map(([k, v]) => {
    const [w, c] = k.split('||')
    return { wallet: nombre.get(w) ?? w, currency: c, balance: Math.round(v.balance * 100) / 100, movimientos: v.n }
  }).sort((a, b) => b.balance - a.balance)

  const totalPorDivisa: Record<string, number> = {}
  for (const b of balances) totalPorDivisa[b.currency] = Math.round(((totalPorDivisa[b.currency] ?? 0) + b.balance) * 100) / 100

  return {
    balances,
    totalPorDivisa,
    porMes: [...mensual.entries()].map(([k, v]) => {
      const [mes, currency] = k.split('||')
      return {
        mes, currency,
        ingresos: Math.round(v.ingresos * 100) / 100,
        egresos: Math.round(v.egresos * 100) / 100,
        neto: Math.round((v.ingresos - v.egresos) * 100) / 100,
      }
    }).sort((a, b) => (a.mes < b.mes ? 1 : -1)),
    cuentasFondeo: (accts.data ?? []).map((a) => ({
      alias: (a.alias as string) ?? '?',
      firma: firma.get(a.firm_id as string),
      tamanio: Number(a.account_size) || 0,
      costo: Number(a.evaluation_cost) || 0,
      estado: (a.status as string) ?? '?',
      inicio: a.start_date as string,
      ...(a.closed_date ? { cerrada: a.closed_date as string } : {}),
      ...(a.max_risk_per_trade_pct != null ? { riesgoPorTradePct: Number(a.max_risk_per_trade_pct) } : {}),
      ...(a.max_daily_loss_pct != null ? { perdidaDiariaMaxPct: Number(a.max_daily_loss_pct) } : {}),
      ...(a.target_payout_amount != null ? { payoutObjetivo: Number(a.target_payout_amount) } : {}),
    })),
    distribucion: (dist.data ?? []).map((d) => ({
      label: (d.label as string) ?? '', percentage: Number(d.percentage) || 0,
    })),
  }
}

// ---------------------------------------------------------------------------
// Gym / entrenamiento
// ---------------------------------------------------------------------------

export interface GymInfo {
  phase?: string
  gymType?: string
  weightGoalKg?: number
  lastWeight?: { date: string; kg: number }
  /** Qué se entrena cada día de la semana. Clave = día (0=domingo … 6=sábado).
   *  Es lo que hace falta para armar la semana: sin esto solo se sabe que hay
   *  un evento "Entrenamiento", no si toca pierna o descanso. */
  trainingPlan: Record<string, string[]>
  routines: { id: string; name: string; dayLabel: string; exercises: string[] }[]
  recentSessions: { date: string; name: string; exercises: number; durationMin?: number }[]
}

export async function getGym(userId: string): Promise<GymInfo> {
  const sb = getSupabaseAdmin()
  const [cfg, routines, sessions, weights] = await Promise.all([
    sb.from('gym_config').select('*').eq('user_id', userId).maybeSingle(),
    sb.from('gym_routines').select('*').eq('user_id', userId),
    sb.from('gym_sessions').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(12),
    sb.from('gym_weight_entries').select('date, kg').eq('user_id', userId).order('date', { ascending: false }).limit(1),
  ])

  const c = (cfg.data ?? {}) as Record<string, unknown>
  const w = (weights.data ?? [])[0] as { date: string; kg: number } | undefined

  const exerciseNames = (raw: unknown): string[] =>
    Array.isArray(raw)
      ? raw.map((e) => (e && typeof e === 'object' ? String((e as Record<string, unknown>).name ?? '') : String(e)))
          .filter(Boolean)
      : []

  return {
    phase: (c.phase as string) ?? undefined,
    gymType: (c.gym_type as string) ?? undefined,
    weightGoalKg: (c.weight_goal_kg as number) ?? undefined,
    ...(w ? { lastWeight: { date: w.date, kg: Number(w.kg) } } : {}),
    trainingPlan: (c.training_plan as Record<string, string[]>) ?? {},
    routines: (routines.data ?? []).map((r) => ({
      id: r.id as string,
      name: (r.name as string) ?? '',
      dayLabel: (r.day_label as string) ?? '',
      exercises: exerciseNames(r.exercises),
    })),
    recentSessions: (sessions.data ?? []).map((x) => {
      const start = x.started_at ? Date.parse(x.started_at as string) : NaN
      const end = x.ended_at ? Date.parse(x.ended_at as string) : NaN
      const dur = Number.isFinite(start) && Number.isFinite(end)
        ? Math.round((end - start) / 60000) : undefined
      return {
        date: x.date as string,
        name: (x.name as string) ?? '',
        exercises: Array.isArray(x.exercises) ? x.exercises.length : 0,
        ...(dur && dur > 0 ? { durationMin: dur } : {}),
      }
    }),
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

  // Anclas del día (almuerzo, café, entrenamiento…).
  //
  // POR DEFECTO NO OCUPAN TIEMPO. Antes se descontaban 45 min por cada una y
  // eso era un invento: partía el día en pedacitos que no existen (un café no
  // te bloquea 45 minutos) y encima duplicaba lo que YA está en el calendario
  // — "Almorzar", "Entrenamiento" y "Cena" son anclas Y eventos de Google.
  //
  // La fuente de verdad de lo que está ocupado es el CALENDARIO. Las anclas se
  // devuelven como información (sirven para no agendar encima del almuerzo),
  // pero solo descuentan tiempo si el usuario las declara explícitamente en
  // `plannerProfile.blockingAnchors` (por label) con `anchorMinutes`.
  const blocking = new Set((prefs.plannerProfile.blockingAnchors ?? []).map((l) => l.toLowerCase()))
  const ANCHOR_MINUTES = prefs.plannerProfile.anchorMinutes ?? 45
  const anchorKeys = prefs.scheduleOrder.length > 0
    ? prefs.scheduleOrder
    : Object.keys(prefs.idealSchedule)

  let tzResolved = true

  const agenda: AgendaDay[] = days.map((date) => {
    const tz = tzOffset(new Date(`${date}T12:00:00Z`), prefs.timezone)
    if (!tz.resolved) tzResolved = false
    const offset = tz.minutes
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
      .filter((a) => blocking.has(a.label.toLowerCase()))
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
    // Si la zona no resolvió, TODAS las horas de abajo están corridas. Se dice
    // en vez de devolver un plan silenciosamente mal (BASE nº6).
    ...(tzResolved ? {} : {
      timezoneError: `No se pudo resolver la zona horaria "${prefs.timezone}": las horas de esta agenda están en UTC y NO sirven para planificar. Corregila en Configuración.`,
    }),
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
