/** Marcar hecho / no-hecho, desde el bridge.
 *
 *  Es absurdo poder crear tareas y no poder completarlas: la lista se despega
 *  de la realidad y todo lo que el planificador dice queda viejo.
 *
 *  Dos cosas que hay que hacer igual que el cliente o queda inconsistente:
 *
 *  1. **Completar setea `completed_at` Y el `status`.** La app calcula
 *     "hecho" mirando cualquiera de los dos (`completedAt` o un status con
 *     `countsAsDone`). Setear solo uno deja la tarea en un estado raro: tildada
 *     en un lado y pendiente en el otro.
 *  2. **Se puede DES-completar** (`done: false`), igual que el segundo click en
 *     la app: limpia `completed_at` y devuelve el status al primero no-hecho
 *     del proyecto.
 *
 *  ⛔ **Lo que NO hace: tocar nada recurrente.** Completar una tarea recurrente
 *  dispara en el cliente el spawn de la instancia siguiente, con ids
 *  deterministas (`rec_<madre>_<fecha>`). Si el server marca hecha una madre o
 *  una instancia, ese spawn no corre en ese momento y la serie queda a mitad de
 *  camino. Se rechaza con un mensaje que dice qué hacer.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { resolveStatus, type ProjectStatus } from './taskInput'
import type { WriteResult } from './writes'

/** Primer status que cuenta como HECHO, por `order`. Si el proyecto no tiene
 *  ninguno, se deja el status como está y solo se marca `completed_at`. */
function resolveDoneStatus(statuses: ProjectStatus[]): string | null {
  const done = statuses
    .filter((s) => s?.countsAsDone && typeof s.label === 'string' && s.label)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  return done[0]?.label ?? null
}

// ---------------------------------------------------------------------------
// complete_tasks
// ---------------------------------------------------------------------------

export async function completeTasks(
  userId: string,
  input: { taskIds?: unknown; done?: unknown },
): Promise<WriteResult> {
  const ids = (Array.isArray(input.taskIds) ? input.taskIds : [])
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
  if (ids.length === 0) {
    return { ok: false, error: 'bad_input', detail: 'Falta `taskIds` (array de ids no vacío).' }
  }
  const done = input.done !== false   // default: marcar hecha

  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('tasks').select('id, title, project_id, recurrence, recurring_head_id, completed_at')
    .in('id', ids).eq('user_id', userId)
  if (error) return { ok: false, error: 'db_error', detail: error.message }

  const rows = data ?? []
  const noExisten = ids.filter((id) => !rows.some((r) => r.id === id))

  // Guarda dura: las recurrentes las maneja el cliente.
  const recurrentes = rows.filter((r) => r.recurrence || r.recurring_head_id)
  if (recurrentes.length > 0) {
    return {
      ok: false,
      error: 'recurrente',
      detail: `Estas son recurrentes y hay que completarlas desde la app (al completarlas se genera la instancia siguiente, con ids que calcula el cliente): ${recurrentes.map((r) => r.title).join(' · ')}`,
    }
  }
  if (rows.length === 0) {
    return { ok: false, error: 'not_found', detail: `No existe ninguna de esas tareas: ${noExisten.join(', ')}` }
  }

  // Los estados salen del proyecto de cada tarea: cada tablero tiene los suyos.
  const projectIds = [...new Set(rows.map((r) => r.project_id as string))]
  const { data: projects } = await sb
    .from('projects').select('id, statuses').eq('user_id', userId).in('id', projectIds)
  const statusesOf = new Map(
    (projects ?? []).map((p) => [p.id as string, Array.isArray(p.statuses) ? (p.statuses as ProjectStatus[]) : []]),
  )

  const now = new Date().toISOString()
  const results: { id: string; title: string; status: string | null }[] = []

  for (const r of rows) {
    const statuses = statusesOf.get(r.project_id as string) ?? []
    const nextStatus = done ? resolveDoneStatus(statuses) : resolveStatus(statuses)
    const patch: Record<string, unknown> = {
      completed_at: done ? now : null,
      updated_at: now,   // BASE nº1: sin esto el pull LWW lo pisa
    }
    if (nextStatus) patch.status = nextStatus

    const { error: upErr } = await sb.from('tasks').update(patch)
      .eq('id', r.id).eq('user_id', userId)
    if (upErr) return { ok: false, error: 'db_error', detail: `${r.title}: ${upErr.message}` }
    results.push({ id: r.id as string, title: r.title as string, status: nextStatus })
  }

  return {
    ok: true,
    done,
    tareas: results,
    ...(noExisten.length > 0 ? { noExistian: noExisten } : {}),
  }
}

// ---------------------------------------------------------------------------
// complete_subtasks
// ---------------------------------------------------------------------------

export async function completeSubtasks(
  userId: string,
  input: { subtaskIds?: unknown; done?: unknown },
): Promise<WriteResult> {
  const ids = (Array.isArray(input.subtaskIds) ? input.subtaskIds : [])
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
  if (ids.length === 0) {
    return { ok: false, error: 'bad_input', detail: 'Falta `subtaskIds` (array de ids no vacío).' }
  }
  const done = input.done !== false

  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('subtasks').select('id, task_id, title, recurrence')
    .in('id', ids).eq('user_id', userId)
  if (error) return { ok: false, error: 'db_error', detail: error.message }

  const rows = data ?? []
  const noExisten = ids.filter((id) => !rows.some((r) => r.id === id))

  // Misma guarda: una subtarea recurrente, al completarse, genera su hermana
  // (`recsub_<subtarea>_<fecha>`) del lado del cliente.
  const recurrentes = rows.filter((r) => r.recurrence)
  if (recurrentes.length > 0) {
    return {
      ok: false,
      error: 'recurrente',
      detail: `Estas subtareas son recurrentes y hay que completarlas desde la app: ${recurrentes.map((r) => r.title).join(' · ')}`,
    }
  }
  if (rows.length === 0) {
    return { ok: false, error: 'not_found', detail: `No existe ninguna de esas subtareas: ${noExisten.join(', ')}` }
  }

  const now = new Date().toISOString()
  const { error: upErr } = await sb.from('subtasks')
    .update({ completed: done, completed_at: done ? now : null })
    .in('id', rows.map((r) => r.id)).eq('user_id', userId)
  if (upErr) return { ok: false, error: 'db_error', detail: upErr.message }

  // La tarea madre bumpea `updated_at` o el pull la pisa con la copia vieja del
  // otro dispositivo y el tilde "se pierde" (BASE nº1).
  const tareas = [...new Set(rows.map((r) => r.task_id as string))]
  await sb.from('tasks').update({ updated_at: now }).in('id', tareas).eq('user_id', userId)

  return {
    ok: true,
    done,
    subtareas: rows.map((r) => r.title as string),
    tareasAfectadas: tareas,
    ...(noExisten.length > 0 ? { noExistian: noExisten } : {}),
  }
}
