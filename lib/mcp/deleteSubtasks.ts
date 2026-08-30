/** `delete_subtasks` — la ÚNICA operación del bridge que borra filas del
 *  dominio, y por eso está en su propio archivo con sus propias guardas.
 *
 *  Todo lo demás del bridge no borra nada a propósito (ver `writes.ts`). Esto
 *  es una excepción pedida explícitamente, y tiene tres problemas reales que
 *  hay que resolver o el borrado hace daño en silencio:
 *
 *  1. **El borrado rebota si no se escribe el tombstone.** El merge del pull no
 *     borra una fila salvo que el baseline local diga que estaba sincronizada.
 *     Un dispositivo que todavía tiene la subtarea la conserva y la vuelve a
 *     pushear → resucita. Por eso se escribe en `deleted_rows` igual que hace
 *     `syncDeletes` en el cliente.
 *
 *  2. **`subtasks.parent_id` es self-referente con ON DELETE CASCADE.** Borrar
 *     una subtarea con hijas se lleva TODO el subárbol sin avisar. Acá los
 *     descendientes se resuelven ANTES, se tombstonean también, y se informan
 *     en la respuesta: nunca se borra un subárbol "por sorpresa".
 *
 *  3. **La tarea madre tiene que bumpear `updated_at`.** Sin eso el merge LWW
 *     del pull la pisa con una copia local más vieja y las subtareas vuelven
 *     (BASE nº1).
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import type { WriteResult } from './writes'

interface SubtaskRow {
  id: string
  task_id: string
  parent_id: string | null
  title: string
}

/** Todos los descendientes de `ids` dentro del set dado. Cycle-safe: un
 *  `parent_id` que apunte en círculo no cuelga el proceso. */
function collectDescendants(all: SubtaskRow[], ids: Set<string>): Set<string> {
  const out = new Set(ids)
  let changed = true
  let guard = 0
  while (changed && guard++ < 100) {
    changed = false
    for (const s of all) {
      if (s.parent_id && out.has(s.parent_id) && !out.has(s.id)) {
        out.add(s.id)
        changed = true
      }
    }
  }
  return out
}

export async function deleteSubtasks(
  userId: string,
  input: { subtaskIds?: unknown; taskId?: string },
): Promise<WriteResult> {
  const raw = Array.isArray(input.subtaskIds) ? input.subtaskIds : []
  const ids = new Set(raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0))
  if (ids.size === 0) {
    return { ok: false, error: 'bad_input', detail: 'Falta `subtaskIds` (array de ids no vacío).' }
  }

  const sb = getSupabaseAdmin()

  // Se leen TODAS las subtareas del usuario para poder resolver el subárbol y,
  // de paso, verificar dueño. El `.eq('user_id')` es la única barrera: el
  // service role saltea RLS.
  const { data, error: readErr } = await sb
    .from('subtasks').select('id, task_id, parent_id, title').eq('user_id', userId).limit(10000)
  if (readErr) return { ok: false, error: 'db_error', detail: readErr.message }

  const all = (data ?? []) as SubtaskRow[]
  const byId = new Map(all.map((s) => [s.id, s]))

  const noExisten = [...ids].filter((id) => !byId.has(id))
  const existentes = [...ids].filter((id) => byId.has(id))
  if (existentes.length === 0) {
    return {
      ok: false, error: 'not_found',
      detail: `Ninguna de esas subtareas existe en esta cuenta: ${noExisten.join(', ')}`,
    }
  }

  // Si se pasó `taskId`, todas tienen que pertenecer a esa tarea. Es una guarda
  // barata contra borrar la subtarea equivocada por un id copiado de más.
  if (input.taskId) {
    const ajenas = existentes.filter((id) => byId.get(id)!.task_id !== input.taskId)
    if (ajenas.length > 0) {
      return {
        ok: false, error: 'wrong_task',
        detail: `Estas subtareas no pertenecen a la tarea ${input.taskId}: ${ajenas.join(', ')}`,
      }
    }
  }

  const conDescendientes = collectDescendants(all, new Set(existentes))
  const arrastradas = [...conDescendientes].filter((id) => !ids.has(id))
  const todos = [...conDescendientes]
  const tareasAfectadas = [...new Set(todos.map((id) => byId.get(id)!.task_id))]

  // 1) Tombstones PRIMERO. Si el borrado sale bien pero el tombstone falla,
  //    la fila vuelve desde otro dispositivo. Al revés no hace daño: un
  //    tombstone sin borrado se limpia solo cuando la fila se re-pushea.
  const nowIso = new Date().toISOString()
  const { error: tombErr } = await sb.from('deleted_rows').upsert(
    todos.map((id) => ({ user_id: userId, table_name: 'subtasks', row_id: id, deleted_at: nowIso })),
    { onConflict: 'user_id,table_name,row_id' },
  )
  if (tombErr) {
    return {
      ok: false, error: 'tombstone_failed',
      detail: `No se escribieron los tombstones, así que NO se borró nada (el borrado habría rebotado desde otro dispositivo): ${tombErr.message}`,
    }
  }

  // 2) Recién ahora se borra.
  const { error: delErr } = await sb
    .from('subtasks').delete().in('id', todos).eq('user_id', userId)
  if (delErr) return { ok: false, error: 'db_error', detail: delErr.message }

  // 3) Bumpear las tareas madre (BASE nº1).
  await sb.from('tasks').update({ updated_at: nowIso })
    .in('id', tareasAfectadas).eq('user_id', userId)

  return {
    ok: true,
    borradas: todos.length,
    pedidas: existentes.length,
    titulos: todos.map((id) => byId.get(id)!.title.slice(0, 70)),
    ...(arrastradas.length > 0 ? {
      arrastradasPorSerHijas: arrastradas.map((id) => byId.get(id)!.title.slice(0, 70)),
    } : {}),
    ...(noExisten.length > 0 ? { noExistian: noExisten } : {}),
    tareasAfectadas,
  }
}
