/** Escrituras del bridge sobre el DOMINIO DE TAREAS: crear una tarea y poner
 *  o sacar la regla de recurrencia.
 *
 *  Separado de `writes.ts` (que mueve el plan del día y el perfil) porque acá
 *  se toca el dominio más delicado del proyecto y conviene poder leer de una
 *  sola vez todo lo que el bridge puede hacerle a una tarea.
 *
 *  Reparto de trabajo con el cliente — la regla que ordena todo este archivo:
 *
 *    el SERVER escribe la REGLA · el CLIENTE genera las INSTANCIAS
 *
 *  No es estético. Los ids de spawn son deterministas (`rec_<madre>_<fecha>`)
 *  y los calcula el cliente; si el server inventara instancias, dos
 *  dispositivos generarían copias distintas de la misma cosa y el merge las
 *  sumaría. Es exactamente el bug de "se me multiplican las recurrentes".
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import {
  normalizeTaskInput, normalizeSubtasks, validateRecurrence, bridgeId,
  type ProjectStatus,
} from './taskInput'
import type { WriteResult } from './writes'

// ---------------------------------------------------------------------------
// create_task
// ---------------------------------------------------------------------------

/** Crea una tarea en un proyecto, con subtareas y recurrencia opcionales.
 *
 *  Es la única creación de filas que hace el bridge, y es de bajo riesgo por
 *  una razón concreta: el pull RECOMPUTA `project.taskIds` desde `project_id`
 *  (ver "Recomputar taskIds" en sync.ts), así que una tarea insertada del lado
 *  server aparece sola en su proyecto sin que el server toque el orden del
 *  tablero.
 *
 *  Para que la tarea se dibuje en el CALENDARIO de Overseer hacen falta
 *  `dueDate` Y `dueTime` (ver CalendarPage). Se devuelve `showsInCalendar`
 *  para poder decirlo, en vez de que el usuario se pregunte por qué no la ve. */
export async function createTask(
  userId: string,
  input: Record<string, unknown>,
): Promise<WriteResult> {
  const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : ''
  if (!projectId) {
    return { ok: false, error: 'bad_project', detail: 'Falta `projectId`. Usá list_projects para verlos.' }
  }

  const sb = getSupabaseAdmin()

  // El proyecto tiene que ser DE ESTE USUARIO. El service role saltea RLS, así
  // que este chequeo es la única barrera.
  const { data: project, error: projErr } = await sb
    .from('projects').select('id, name, statuses, archived')
    .eq('id', projectId).eq('user_id', userId).maybeSingle()

  if (projErr) return { ok: false, error: 'db_error', detail: projErr.message }
  if (!project) {
    return { ok: false, error: 'not_found', detail: `No existe el proyecto ${projectId} en esta cuenta.` }
  }

  const statuses = Array.isArray(project.statuses) ? (project.statuses as ProjectStatus[]) : []
  const norm = normalizeTaskInput(input, statuses)
  if (!norm.ok || !norm.task) {
    return { ok: false, error: 'bad_input', detail: norm.error, warnings: norm.warnings }
  }

  const subs = normalizeSubtasks(input.subtasks, bridgeId)
  if (!subs.ok) return { ok: false, error: 'bad_subtasks', detail: subs.error }

  const t = norm.task
  const id = bridgeId()
  const now = new Date().toISOString()
  const warnings = [...norm.warnings]
  if (project.archived) warnings.push('Ojo: ese proyecto está archivado, así que la tarea no se va a ver en las vistas normales.')

  const row: Record<string, unknown> = {
    id,
    user_id: userId,
    project_id: projectId,
    title: t.title,
    status: t.status,
    priority: t.priority,
    importance: t.importance,
    postponed_count: 0,
    created_at: now,
    updated_at: now,
    ...(t.description ? { description: t.description } : {}),
    ...(t.notes ? { notes: t.notes } : {}),
    ...(t.category ? { category: t.category } : {}),
    ...(t.dueDate ? { due_date: t.dueDate } : {}),
    ...(t.dueTime ? { due_time: t.dueTime } : {}),
    ...(t.durationMinutes ? { duration_minutes: t.durationMinutes } : {}),
    ...(t.energyEstimate ? { energy_estimate: t.energyEstimate } : {}),
    ...(t.tags ? { tags: t.tags } : {}),
    ...(t.favorite !== undefined ? { favorite: t.favorite } : {}),
    ...(t.scheduledFor ? { scheduled_for: t.scheduledFor } : {}),
  }

  if (t.recurrence) {
    // Una tarea con recurrencia y sin head previo ES la madre de su propia
    // serie — misma auto-referencia que hace `addTask` en el cliente.
    row.recurrence = t.recurrence
    row.recurring_head_id = id
    warnings.push('Las instancias de la serie las genera la app al abrir Tareas (ids deterministas, se calculan en el cliente).')
  }

  const { error } = await sb.from('tasks').insert(row)
  if (error) return { ok: false, error: 'db_error', detail: error.message }

  if (subs.subtasks.length > 0) {
    const subRows = subs.subtasks.map((s) => ({
      id: s.id,
      user_id: userId,
      task_id: id,
      title: s.title,
      completed: false,
      status: t.status,
      order: s.order,
    }))
    const { error: subErr } = await sb.from('subtasks').insert(subRows)
    // La tarea ya está creada y no se revierte, pero el fallo SE DICE
    // (BASE nº6): un ok a secas dejaría al usuario creyendo que tiene sus
    // subtareas.
    if (subErr) {
      return {
        ok: true, id, projectId, project: project.name,
        title: t.title, showsInCalendar: t.showsInCalendar, subtasks: 0,
        warnings: [...warnings, `La tarea se creó pero las subtareas fallaron: ${subErr.message}`],
      }
    }
  }

  return {
    ok: true,
    id,
    project: project.name,
    projectId,
    title: t.title,
    status: t.status,
    dueDate: t.dueDate,
    dueTime: t.dueTime,
    subtasks: subs.subtasks.length,
    recurring: !!t.recurrence,
    /** true = se va a dibujar como bloque en el calendario de Overseer. */
    showsInCalendar: t.showsInCalendar,
    ...(warnings.length > 0 ? { warnings } : {}),
  }
}

// ---------------------------------------------------------------------------
// set_task_recurrence
// ---------------------------------------------------------------------------

/** Pone, cambia o saca la regla de recurrencia de una tarea.
 *
 *  Al CAMBIAR una regla que ya tenía instancias generadas queda la marca
 *  `recurrence.rebuildAt`: el cliente, al montar /tasks, corre
 *  `rebuildRecurringChain` (nukea las futuras de la regla vieja, rearma con la
 *  nueva) y limpia la marca. Ver el comentario de cabecera del archivo. */
export async function setTaskRecurrence(
  userId: string,
  input: { taskId?: string; recurrence?: unknown },
): Promise<WriteResult> {
  const taskId = String(input.taskId ?? '')
  if (!taskId) return { ok: false, error: 'bad_task', detail: 'Falta `taskId`.' }

  const sb = getSupabaseAdmin()
  const { data: task, error: readErr } = await sb
    .from('tasks').select('id, title, due_date, recurrence, recurring_head_id')
    .eq('id', taskId).eq('user_id', userId).maybeSingle()

  if (readErr) return { ok: false, error: 'db_error', detail: readErr.message }
  if (!task) return { ok: false, error: 'not_found', detail: `No existe la tarea ${taskId} en esta cuenta.` }

  const head = task.recurring_head_id as string | null
  // Una INSTANCIA no lleva la regla: la lleva la madre. Cambiarla en una
  // instancia no haría nada visible y dejaría la serie inconsistente.
  if (head && head !== task.id) {
    return {
      ok: false,
      error: 'not_the_mother',
      detail: `Esa tarea es una instancia de la serie ${head}. La regla se cambia en la tarea madre (${head}).`,
    }
  }

  const now = new Date().toISOString()

  // ── Sacar la recurrencia = detener la serie ──────────────────────────────
  // Se limpia la regla en la madre Y en sus instancias, igual que "Detener" en
  // la app: si la regla quedara en las instancias, cualquiera de ellas volvería
  // a sembrar la serie. No se borra ni se archiva nada: lo ya generado queda.
  if (input.recurrence === null || input.recurrence === undefined) {
    const { error } = await sb.from('tasks')
      .update({ recurrence: null, updated_at: now })
      .eq('user_id', userId)
      .or(`id.eq.${task.id},recurring_head_id.eq.${task.id}`)
    if (error) return { ok: false, error: 'db_error', detail: error.message }
    return {
      ok: true,
      taskId: task.id,
      recurring: false,
      detail: 'Serie detenida: se sacó la regla de la madre y de sus instancias. Las tareas ya generadas quedan como están.',
    }
  }

  // ── Poner o cambiar la regla ─────────────────────────────────────────────
  if (!task.due_date) {
    return {
      ok: false,
      error: 'no_anchor',
      detail: 'La tarea no tiene fecha. Una serie necesita `dueDate` como ancla: ponésela con schedule_task y reintentá.',
    }
  }

  const parsed = validateRecurrence(input.recurrence)
  if (!parsed.ok) return { ok: false, error: 'bad_recurrence', detail: parsed.error }

  const prev = task.recurrence as { kind?: string } | null
  const isChange = !!prev?.kind
  const recurrence: Record<string, unknown> = { ...parsed.recurrence }
  if (isChange) recurrence.rebuildAt = now

  const { error } = await sb.from('tasks')
    .update({ recurrence, recurring_head_id: task.id, updated_at: now })
    .eq('id', task.id).eq('user_id', userId)

  if (error) return { ok: false, error: 'db_error', detail: error.message }

  return {
    ok: true,
    taskId: task.id,
    title: task.title,
    recurrence: parsed.recurrence,
    detail: isChange
      ? 'Regla cambiada. Al abrir Tareas en la app se rehacen las instancias futuras con la regla nueva.'
      : 'Serie creada. Las instancias se generan al abrir Tareas en la app.',
  }
}
