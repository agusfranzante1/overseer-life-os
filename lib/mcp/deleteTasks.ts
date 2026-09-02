/** `delete_tasks` — borrar una tarea ENTERA desde el bridge.
 *
 *  Hermana de `deleteSubtasks.ts`, y con los mismos cuidados más dos propios
 *  que salen del esquema y del dominio:
 *
 *  1. **`subtasks.task_id` es FK ON DELETE CASCADE** (`schema.sql`). Borrar la
 *     tarea se lleva TODAS sus subtareas sin avisar, y esas subtareas son filas
 *     propias en su propia tabla. Si no se les escribe tombstone, el primer
 *     dispositivo que todavía las tenga en memoria las vuelve a pushear —
 *     ahora sin tarea madre. Por eso acá se tombstonean la tarea Y cada una de
 *     sus subtareas antes de borrar nada.
 *
 *  2. **Las recurrentes NO se borran de a una.** La serie se identifica por
 *     `recurring_head_id`, que es la ETIQUETA de la serie y sobrevive aunque la
 *     fila de la madre no exista. Borrar solo la madre deja las instancias
 *     vivas; y si alguna instancia conserva la regla `recurrence`, el cliente
 *     vuelve a sembrar la serie entera al abrir Tareas. Así que o se borra la
 *     serie COMPLETA (`incluirSerieRecurrente: true`) o no se borra: el punto
 *     medio es el que multiplicó tareas en este proyecto.
 *
 *  Lo que NO hace, y es a propósito:
 *  - **No toca `projects`.** El pull recomputa `project.taskIds` desde
 *    `project_id`, así que no hay lista que mantener a mano.
 *  - **No borra proyectos** aunque queden vacíos.
 *  - **No archiva.** Archivar es otra cosa (`archived_at`) y tiene su lógica en
 *    el cliente; esto borra de verdad.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import type { WriteResult } from './writes'

/** Arriba de esto se exige confirmación explícita. No es un límite técnico: es
 *  que un borrado grande por un id mal armado no tiene vuelta atrás, y este
 *  proyecto ya perdió filas una vez por inferir borrados en lote. */
const TOPE_SIN_CONFIRMAR = 10

interface TaskRow {
  id: string
  title: string
  project_id: string
  recurrence: unknown
  recurring_head_id: string | null
}

export async function deleteTasks(
  userId: string,
  input: {
    taskIds?: unknown
    incluirSerieRecurrente?: boolean
    confirmarBorradoMasivo?: boolean
  },
): Promise<WriteResult> {
  const raw = Array.isArray(input.taskIds) ? input.taskIds : []
  const pedidos = [
    ...new Set(raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)),
  ]
  if (pedidos.length === 0) {
    return { ok: false, error: 'bad_input', detail: 'Falta `taskIds` (array de ids no vacío).' }
  }

  const sb = getSupabaseAdmin()

  // Se leen TODAS las tareas del usuario: hace falta el set completo para
  // resolver la serie recurrente por `recurring_head_id`. El `.eq('user_id')`
  // es la única barrera — el service role saltea RLS.
  const { data, error: readErr } = await sb
    .from('tasks')
    .select('id, title, project_id, recurrence, recurring_head_id')
    .eq('user_id', userId)
    .limit(10000)
  if (readErr) return { ok: false, error: 'db_error', detail: readErr.message }

  const todas = (data ?? []) as TaskRow[]
  const byId = new Map(todas.map((t) => [t.id, t]))

  const noExisten = pedidos.filter((id) => !byId.has(id))
  const existentes = pedidos.filter((id) => byId.has(id))
  if (existentes.length === 0) {
    return {
      ok: false,
      error: 'not_found',
      detail: `Ninguna de esas tareas existe en esta cuenta: ${noExisten.join(', ')}`,
    }
  }

  // ── Serie recurrente ──────────────────────────────────────────────────────
  // Una tarea "toca" una serie si tiene la regla (es madre) o si lleva la
  // etiqueta de la serie (es instancia).
  const tocanSerie = existentes.filter((id) => {
    const t = byId.get(id)!
    return Boolean(t.recurrence) || Boolean(t.recurring_head_id)
  })

  const aBorrar = new Set(existentes)
  const arrastradasPorSerie: string[] = []

  if (tocanSerie.length > 0) {
    if (!input.incluirSerieRecurrente) {
      const detalle = tocanSerie
        .map((id) => {
          const t = byId.get(id)!
          const rol = t.recurrence ? 'madre de la serie' : 'instancia de una serie'
          return `"${t.title.slice(0, 60)}" (${rol})`
        })
        .join(' · ')
      return {
        ok: false,
        error: 'recurrente',
        detail:
          `No se borró NADA. Estas tareas son parte de una serie recurrente: ${detalle}. ` +
          'Borrar una sola deja el resto vivo, y si alguna instancia conserva la regla el cliente vuelve a sembrar la serie entera. ' +
          'Volvé a llamar con `incluirSerieRecurrente: true` para borrar la serie COMPLETA (madre + todas sus instancias, incluidas las ya completadas), ' +
          'o usá `set_task_recurrence` con `recurrence: null` si lo que querés es detenerla sin perder el historial.',
      }
    }
    // Con el permiso explícito: se suma la serie entera de cada una.
    const heads = new Set<string>()
    for (const id of tocanSerie) {
      const t = byId.get(id)!
      heads.add(t.recurring_head_id || t.id)
    }
    for (const t of todas) {
      const head = t.recurring_head_id || t.id
      if (!heads.has(head)) continue
      if (!aBorrar.has(t.id)) {
        aBorrar.add(t.id)
        arrastradasPorSerie.push(t.title.slice(0, 70))
      }
    }
  }

  const ids = [...aBorrar]

  if (ids.length > TOPE_SIN_CONFIRMAR && !input.confirmarBorradoMasivo) {
    return {
      ok: false,
      error: 'demasiadas',
      detail:
        `No se borró NADA: el pedido termina borrando ${ids.length} tareas (más de ${TOPE_SIN_CONFIRMAR}). ` +
        'Si es a propósito, repetí la llamada con `confirmarBorradoMasivo: true`.',
    }
  }

  // ── Subtareas: se van por cascada, así que necesitan su propio tombstone ──
  const { data: subData, error: subErr } = await sb
    .from('subtasks')
    .select('id, task_id')
    .eq('user_id', userId)
    .in('task_id', ids)
    .limit(10000)
  if (subErr) return { ok: false, error: 'db_error', detail: subErr.message }
  const subIds = (subData ?? []).map((s) => s.id as string)

  // 1) Tombstones PRIMERO, tareas y subtareas juntas. Si el borrado sale bien
  //    pero el tombstone falla, la fila vuelve desde otro dispositivo. Al revés
  //    no hace daño: un tombstone sin borrado se limpia cuando la fila se
  //    re-pushea.
  const nowIso = new Date().toISOString()
  const filas = [
    ...ids.map((id) => ({ user_id: userId, table_name: 'tasks', row_id: id, deleted_at: nowIso })),
    ...subIds.map((id) => ({ user_id: userId, table_name: 'subtasks', row_id: id, deleted_at: nowIso })),
  ]
  const { error: tombErr } = await sb
    .from('deleted_rows')
    .upsert(filas, { onConflict: 'user_id,table_name,row_id' })
  if (tombErr) {
    return {
      ok: false,
      error: 'tombstone_failed',
      detail: `No se escribieron los tombstones, así que NO se borró nada (el borrado habría rebotado desde otro dispositivo): ${tombErr.message}`,
    }
  }

  // 2) Recién ahora se borra. Las subtareas caen por la FK on delete cascade.
  const { error: delErr } = await sb.from('tasks').delete().in('id', ids).eq('user_id', userId)
  if (delErr) return { ok: false, error: 'db_error', detail: delErr.message }

  return {
    ok: true,
    borradas: ids.length,
    pedidas: existentes.length,
    titulos: ids.map((id) => byId.get(id)!.title.slice(0, 70)),
    subtareasArrastradas: subIds.length,
    proyectosTocados: [...new Set(ids.map((id) => byId.get(id)!.project_id))],
    ...(arrastradasPorSerie.length > 0 ? { arrastradasPorSerie } : {}),
    ...(noExisten.length > 0 ? { noExistian: noExisten } : {}),
  }
}
