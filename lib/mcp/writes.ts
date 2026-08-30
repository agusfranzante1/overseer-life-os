/** Escrituras del bridge — lo que Claude puede modificar en la cuenta.
 *
 *  ⚠️ Escribir en Postgres desde acá SALTEA los stores de Zustand y toda la
 *  lógica de dominio del cliente. Este proyecto ya perdió datos tres veces por
 *  ese camino (config multi-device, ofertas, recurrentes que se multiplicaban).
 *  Por eso la superficie de escritura es deliberadamente chica:
 *
 *    ✅ `day_plans`      — dominio nuevo, exclusivo del planificador.
 *    ✅ 4 campos escalares de `tasks` (cuándo hacerla, cuánto dura).
 *    ✅ `plannerProfile` dentro del blob de preferencias, mergeado por campo.
 *
 *    ❌ NADA de borrar. No hay tool de delete en todo el bridge.
 *    ❌ NADA de `recurrence` / `recurring_head_id`: los spawns recurrentes son
 *       deterministas y los calcula el cliente. Si el server inventa filas,
 *       dos dispositivos generan copias distintas y el merge las suma.
 *    ❌ NADA de `subtasks`, `archived_at`, `completed_at`, `status`, `project_id`.
 *
 *  Y todo write bumpea `updated_at`: sin eso el merge LWW del pull pisa el
 *  cambio con la copia vieja del otro dispositivo y "no se guarda" sin error
 *  visible (BASE nº1).
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import type { PlannerProfile } from '@/types'
import type { DayPlanBlockRow } from './queries'

export interface WriteResult {
  ok: boolean
  error?: string
  detail?: string
  [k: string]: unknown
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{1,2}:\d{2}$/
const KINDS = new Set(['task', 'event', 'break', 'focus'])

// ---------------------------------------------------------------------------
// save_day_plan
// ---------------------------------------------------------------------------

/** Guarda (o reemplaza) el plan de un día.
 *
 *  El id es DETERMINISTA (`plan_<fecha>`): un plan por día. Si usáramos un id
 *  random, dos dispositivos generarían planes distintos para el mismo día y el
 *  merge por id los sumaría en vez de resolverlos — es exactamente el bug que
 *  ya pasó con las instancias recurrentes. */
export async function saveDayPlan(
  userId: string,
  input: { date?: string; blocks?: unknown; note?: string },
): Promise<WriteResult> {
  const date = String(input.date ?? '')
  if (!DATE_RE.test(date)) {
    return { ok: false, error: 'bad_date', detail: '`date` tiene que ser YYYY-MM-DD.' }
  }
  if (!Array.isArray(input.blocks)) {
    return { ok: false, error: 'bad_blocks', detail: '`blocks` tiene que ser un array.' }
  }

  const blocks = sanitizeBlocks(input.blocks as unknown[], date)
  const now = new Date().toISOString()
  const id = `plan_${date}`

  const sb = getSupabaseAdmin()

  // Si ya existe, conservamos su created_at (el plan del día es uno solo, se
  // reescribe; no queremos que parezca creado de nuevo cada vez).
  const { data: existing } = await sb
    .from('day_plans').select('created_at').eq('id', id).eq('user_id', userId).maybeSingle()

  const { error } = await sb.from('day_plans').upsert({
    id,
    user_id: userId,
    date,
    blocks,
    note: typeof input.note === 'string' ? input.note.slice(0, 2000) : null,
    source: 'claude',
    created_at: (existing?.created_at as string) ?? now,
    updated_at: now,
  }, { onConflict: 'id' })

  if (error) {
    return {
      ok: false,
      error: 'db_error',
      detail: `${error.message} — ¿corriste supabase/migration_day_plans.sql?`,
    }
  }
  return { ok: true, id, date, blocks: blocks.length }
}

/** Valida y normaliza los bloques. Descarta lo que no sirve en vez de guardar
 *  basura que después rompe la UI. */
function sanitizeBlocks(raw: unknown[], date: string): DayPlanBlockRow[] {
  const out: DayPlanBlockRow[] = []
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') return
    const b = item as Record<string, unknown>
    const title = typeof b.title === 'string' ? b.title.trim() : ''
    if (!title) return

    const kindRaw = typeof b.kind === 'string' ? b.kind : 'task'
    const start = typeof b.start === 'string' && TIME_RE.test(b.start) ? pad(b.start) : undefined
    const end = typeof b.end === 'string' && TIME_RE.test(b.end) ? pad(b.end) : undefined

    out.push({
      // id determinista también acá: mismo plan reescrito → mismos ids.
      id: typeof b.id === 'string' && b.id ? b.id : `${date}_b${i}`,
      title: title.slice(0, 300),
      kind: (KINDS.has(kindRaw) ? kindRaw : 'task') as DayPlanBlockRow['kind'],
      ...(start ? { start } : {}),
      // Un `end` anterior al `start` es un error de quien lo mandó: se descarta
      // el `end` en vez de guardar un bloque imposible.
      ...(end && (!start || end > start) ? { end } : {}),
      ...(typeof b.taskId === 'string' && b.taskId ? { taskId: b.taskId } : {}),
      ...(typeof b.reason === 'string' && b.reason ? { reason: b.reason.slice(0, 500) } : {}),
      ...(typeof b.done === 'boolean' ? { done: b.done } : {}),
    })
  })
  // Orden horario; los bloques sin hora van al final.
  out.sort((a, b) => (a.start ?? '99:99').localeCompare(b.start ?? '99:99'))
  return out
}

function pad(hhmm: string): string {
  const [h, m] = hhmm.split(':')
  return `${h.padStart(2, '0')}:${m}`
}

// ---------------------------------------------------------------------------
// schedule_task
// ---------------------------------------------------------------------------

/** Mueve una tarea en el tiempo. SOLO estos 4 campos, nada más. */
export async function scheduleTask(
  userId: string,
  input: {
    taskId?: string
    dueDate?: string | null
    dueTime?: string | null
    durationMinutes?: number | null
    scheduledFor?: string | null
  },
): Promise<WriteResult> {
  const taskId = String(input.taskId ?? '')
  if (!taskId) return { ok: false, error: 'bad_task', detail: 'Falta `taskId`.' }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (input.dueDate !== undefined) {
    if (input.dueDate === null) patch.due_date = null
    else if (DATE_RE.test(input.dueDate)) patch.due_date = input.dueDate
    else return { ok: false, error: 'bad_date', detail: '`dueDate` tiene que ser YYYY-MM-DD o null.' }
  }
  if (input.dueTime !== undefined) {
    if (input.dueTime === null) patch.due_time = null
    else if (TIME_RE.test(input.dueTime)) patch.due_time = pad(input.dueTime)
    else return { ok: false, error: 'bad_time', detail: '`dueTime` tiene que ser HH:MM o null.' }
  }
  if (input.durationMinutes !== undefined) {
    if (input.durationMinutes === null) patch.duration_minutes = null
    else if (Number.isFinite(input.durationMinutes) && input.durationMinutes! > 0) {
      patch.duration_minutes = Math.round(input.durationMinutes!)
    } else return { ok: false, error: 'bad_duration', detail: '`durationMinutes` tiene que ser > 0 o null.' }
  }
  if (input.scheduledFor !== undefined) {
    if (input.scheduledFor === null) patch.scheduled_for = null
    else if (input.scheduledFor === 'today' || input.scheduledFor === 'tomorrow') {
      patch.scheduled_for = input.scheduledFor
    } else return { ok: false, error: 'bad_scheduled_for', detail: "`scheduledFor` = 'today' | 'tomorrow' | null." }
  }

  if (Object.keys(patch).length === 1) {
    return { ok: false, error: 'nothing_to_do', detail: 'No mandaste ningún campo para cambiar.' }
  }

  const sb = getSupabaseAdmin()
  // `.eq('user_id')` no es decorativo: el service role saltea RLS, así que es
  // la ÚNICA cosa que impide tocar la tarea de otra cuenta.
  const { data, error } = await sb
    .from('tasks').update(patch)
    .eq('id', taskId).eq('user_id', userId)
    .select('id, title, due_date, due_time, duration_minutes, scheduled_for')

  if (error) return { ok: false, error: 'db_error', detail: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: 'not_found', detail: `No existe la tarea ${taskId} en esta cuenta.` }
  }
  return { ok: true, task: data[0] }
}

// ---------------------------------------------------------------------------
// update_planner_profile
// ---------------------------------------------------------------------------

/** Merge parcial del perfil del planificador dentro del blob de preferencias.
 *
 *  Dos reglas del proyecto se cruzan acá:
 *   - BASE nº3: la fila-blob se MERGEA, nunca se pisa. Leemos el payload
 *     entero, tocamos SOLO `plannerProfile` y escribimos de vuelta. Un upsert
 *     con un payload armado desde acá le borraría al usuario todo lo demás
 *     (ya pasó: se llevó puesta la config del sidebar).
 *   - El merge por campo del cliente (`prefsMerge.ts`) decide con las marcas
 *     de `payload._t`. Si escribimos `plannerProfile` sin sellar su marca, el
 *     próximo push del cliente lo pisa con su copia vieja y el aprendizaje se
 *     pierde en silencio.
 */
export async function updatePlannerProfile(
  userId: string,
  patch: Partial<PlannerProfile> | undefined,
): Promise<WriteResult> {
  if (!patch || typeof patch !== 'object') {
    return { ok: false, error: 'bad_patch', detail: '`patch` tiene que ser un objeto.' }
  }

  const sb = getSupabaseAdmin()
  const { data: row } = await sb
    .from('app_preferences').select('payload').eq('user_id', userId).maybeSingle()

  const payload = { ...((row?.payload ?? {}) as Record<string, unknown>) }
  const times = { ...((payload._t ?? {}) as Record<string, string>) }
  const current = (payload.plannerProfile ?? {}) as PlannerProfile

  const now = new Date().toISOString()
  const next: PlannerProfile = { ...current, ...sanitizeProfile(patch), updatedAt: now }

  payload.plannerProfile = next
  times.plannerProfile = now
  payload._t = times

  const { error } = await sb.from('app_preferences').upsert(
    { user_id: userId, payload, updated_at: now },
    { onConflict: 'user_id' },
  )
  if (error) return { ok: false, error: 'db_error', detail: error.message }
  return { ok: true, plannerProfile: next }
}

function sanitizeProfile(p: Partial<PlannerProfile>): Partial<PlannerProfile> {
  const out: Partial<PlannerProfile> = {}

  if (p.workingHours && TIME_RE.test(p.workingHours.start ?? '') && TIME_RE.test(p.workingHours.end ?? '')) {
    out.workingHours = { start: pad(p.workingHours.start), end: pad(p.workingHours.end) }
  }
  if (Array.isArray(p.deepWorkWindows)) {
    out.deepWorkWindows = p.deepWorkWindows
      .filter((w) => w && TIME_RE.test(w.start ?? '') && TIME_RE.test(w.end ?? ''))
      .slice(0, 6)
      .map((w) => ({ start: pad(w.start), end: pad(w.end) }))
  }
  if (p.typicalDurations && typeof p.typicalDurations === 'object') {
    const d: Record<string, number> = {}
    for (const [k, v] of Object.entries(p.typicalDurations)) {
      if (Number.isFinite(v) && (v as number) > 0) d[k.slice(0, 60)] = Math.round(v as number)
    }
    out.typicalDurations = d
  }
  if (p.energyByTimeOfDay && typeof p.energyByTimeOfDay === 'object') {
    out.energyByTimeOfDay = p.energyByTimeOfDay
  }
  if (Array.isArray(p.rules)) {
    // Tope de 40 reglas y 240 caracteres: el perfil tiene que seguir siendo
    // legible y editable a mano por el usuario, no una bola de texto que crece
    // sola hasta que nadie la entiende.
    out.rules = p.rules
      .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
      .map((r) => r.trim().slice(0, 240))
      .slice(0, 40)
  }
  return out
}
