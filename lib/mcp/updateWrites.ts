/** Edición general de tareas y subtareas desde el bridge.
 *
 *  Objetivo: que Claude pueda controlar el task manager de verdad — cambiar
 *  estado, prioridad, título, etiquetas — sin tener que mandar al usuario a la
 *  app por cada cosa.
 *
 *  ── LO QUE SE PUEDE TOCAR ────────────────────────────────────────────────
 *  Campos escalares que NO disparan lógica de dominio en el cliente:
 *  title, description, notes, status, priority, importance, energyEstimate,
 *  category, tags, favorite.
 *
 *  ── LO QUE NO, Y POR QUÉ ─────────────────────────────────────────────────
 *  - `project_id` (mover de proyecto): el `moveTask` del cliente es
 *    *series-aware*: si la tarea participa de una serie recurrente mueve la
 *    SERIE ENTERA. Moverla suelta desde el server la parte entre dos proyectos
 *    y la serie deja de agruparse. Ya pasó.
 *  - `archived_at` (papelera): borrar una madre archiva sus instancias futuras
 *    y restaurarla las devuelve. Es una cadena, no un flag.
 *  - `recurrence` / `recurring_head_id`: tienen su propia herramienta
 *    (`set_task_recurrence`) con el reparto server-regla / cliente-instancias.
 *
 *  ── LA TRAMPA DEL STATUS ─────────────────────────────────────────────────
 *  Un status con `countsAsDone` ES completar. Si se setea sin tocar
 *  `completed_at`, la tarea queda "hecha" para la UI pero sin fecha de
 *  completado, y el historial miente. Acá se mantienen sincronizados, y se
 *  RECHAZA sobre tareas recurrentes (completar una dispara el spawn de la
 *  siguiente, que calcula el cliente).
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { normalizePriority, normalizeImportance, type ProjectStatus } from './taskInput'
import type { WriteResult } from './writes'

function statusInfo(statuses: ProjectStatus[], wanted: string) {
  return statuses.find((s) => (s?.label ?? '').toLowerCase() === wanted.trim().toLowerCase())
}

// ---------------------------------------------------------------------------
// update_task
// ---------------------------------------------------------------------------

export async function updateTask(
  userId: string,
  input: Record<string, unknown>,
): Promise<WriteResult> {
  const taskId = typeof input.taskId === 'string' ? input.taskId.trim() : ''
  if (!taskId) return { ok: false, error: 'bad_task', detail: 'Falta `taskId`.' }

  const sb = getSupabaseAdmin()
  const { data: task, error: readErr } = await sb
    .from('tasks').select('id, title, project_id, status, recurrence, recurring_head_id, completed_at')
    .eq('id', taskId).eq('user_id', userId).maybeSingle()
  if (readErr) return { ok: false, error: 'db_error', detail: readErr.message }
  if (!task) return { ok: false, error: 'not_found', detail: `No existe la tarea ${taskId} en esta cuenta.` }

  if (input.projectId !== undefined) {
    return {
      ok: false, error: 'not_allowed',
      detail: 'Mover de proyecto no se hace desde acá: si la tarea es parte de una serie recurrente, el cliente mueve la SERIE entera y desde el server quedaría partida. Hacelo en la app.',
    }
  }

  const patch: Record<string, unknown> = {}
  const warnings: string[] = []
  const now = new Date().toISOString()

  const str = (k: string, max: number) => {
    const v = input[k]
    if (v === undefined) return
    if (v === null) { patch[k === 'energyEstimate' ? 'energy_estimate' : k] = null; return }
    if (typeof v !== 'string') { warnings.push(`\`${k}\` ignorado: tiene que ser texto.`); return }
    patch[k] = v.slice(0, max)
  }
  str('title', 500)
  str('description', 5000)
  str('notes', 5000)
  str('category', 100)

  if (input.priority !== undefined) patch.priority = normalizePriority(input.priority)
  if (input.importance !== undefined) patch.importance = normalizeImportance(input.importance)
  if (typeof input.favorite === 'boolean') patch.favorite = input.favorite

  if (input.energyEstimate !== undefined) {
    if (input.energyEstimate === null) patch.energy_estimate = null
    else {
      const n = Number(input.energyEstimate)
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        return { ok: false, error: 'bad_energy', detail: '`energyEstimate` tiene que ser un entero de 1 a 5, o null.' }
      }
      patch.energy_estimate = n
    }
  }

  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags)) return { ok: false, error: 'bad_tags', detail: '`tags` tiene que ser un array.' }
    patch.tags = input.tags
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      .map((t) => t.trim().slice(0, 60)).slice(0, 20)
  }

  // ── status: se valida contra los estados REALES del proyecto ─────────────
  if (input.status !== undefined) {
    const wanted = String(input.status)
    const { data: project } = await sb
      .from('projects').select('statuses').eq('id', task.project_id).eq('user_id', userId).maybeSingle()
    const statuses = Array.isArray(project?.statuses) ? (project!.statuses as ProjectStatus[]) : []
    const hit = statusInfo(statuses, wanted)
    if (!hit) {
      return {
        ok: false, error: 'bad_status',
        detail: `"${wanted}" no existe en ese proyecto. Los estados son: ${statuses.map((s) => s.label).join(' · ') || '(ninguno)'}`,
      }
    }
    patch.status = hit.label

    // Un status "hecho" ES completar: se mantiene `completed_at` en sincronía
    // o el historial queda mintiendo.
    const yaEstaHecha = !!task.completed_at
    if (hit.countsAsDone) {
      if (task.recurrence || task.recurring_head_id) {
        return {
          ok: false, error: 'recurrente',
          detail: 'Esa tarea es recurrente: pasarla a un estado "hecho" dispara el spawn de la instancia siguiente, que calcula el cliente. Completala desde la app.',
        }
      }
      if (!yaEstaHecha) patch.completed_at = now
    } else if (yaEstaHecha) {
      patch.completed_at = null
      warnings.push('Estaba completada: al pasarla a un estado no-hecho se limpió `completedAt`.')
    }
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'nothing_to_do', detail: 'No mandaste ningún campo válido para cambiar.', warnings }
  }

  patch.updated_at = now   // BASE nº1: sin esto el pull LWW pisa el cambio

  const { data, error } = await sb.from('tasks').update(patch)
    .eq('id', taskId).eq('user_id', userId)
    .select('id, title, status, priority, importance, completed_at')
  if (error) return { ok: false, error: 'db_error', detail: error.message }

  return {
    ok: true,
    task: data?.[0],
    cambios: Object.keys(patch).filter((k) => k !== 'updated_at'),
    ...(warnings.length > 0 ? { warnings } : {}),
  }
}

// ---------------------------------------------------------------------------
// update_subtask
// ---------------------------------------------------------------------------

/** Edita UNA subtarea. `parent_id` y `order` no se tocan: reordenar y anidar
 *  tiene lógica de árbol (anti-ciclos, cascada) que vive en el cliente. */
export async function updateSubtask(
  userId: string,
  input: Record<string, unknown>,
): Promise<WriteResult> {
  const subtaskId = typeof input.subtaskId === 'string' ? input.subtaskId.trim() : ''
  if (!subtaskId) return { ok: false, error: 'bad_input', detail: 'Falta `subtaskId`.' }

  const sb = getSupabaseAdmin()
  const { data: sub, error: readErr } = await sb
    .from('subtasks').select('id, task_id, title').eq('id', subtaskId).eq('user_id', userId).maybeSingle()
  if (readErr) return { ok: false, error: 'db_error', detail: readErr.message }
  if (!sub) return { ok: false, error: 'not_found', detail: `No existe la subtarea ${subtaskId} en esta cuenta.` }

  const patch: Record<string, unknown> = {}
  if (typeof input.title === 'string' && input.title.trim()) patch.title = input.title.trim().slice(0, 500)
  if (input.notes !== undefined) patch.notes = input.notes === null ? null : String(input.notes).slice(0, 5000)
  if (input.priority !== undefined) patch.priority = normalizePriority(input.priority)
  if (typeof input.favorite === 'boolean') patch.favorite = input.favorite

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'nothing_to_do', detail: 'No mandaste ningún campo válido.' }
  }

  const { error } = await sb.from('subtasks').update(patch)
    .eq('id', subtaskId).eq('user_id', userId)
  if (error) return { ok: false, error: 'db_error', detail: error.message }

  // La madre bumpea o el pull pisa el cambio (BASE nº1).
  await sb.from('tasks').update({ updated_at: new Date().toISOString() })
    .eq('id', sub.task_id).eq('user_id', userId)

  return { ok: true, subtaskId, antes: sub.title, cambios: Object.keys(patch) }
}
