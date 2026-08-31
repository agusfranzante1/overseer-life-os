/** Hábitos: leerlos y escribirlos desde el bridge.
 *
 *  El pedido del usuario fue poder *"completar los hábitos y modificarlos,
 *  agregar nuevos, eliminar los viejos"* — porque los hábitos son la mitad de
 *  la medición semanal (entrené / dormí) y cargarlos a mano es la fricción que
 *  hace que la medición no exista.
 *
 *  ── UNA ASIMETRÍA QUE HAY QUE CONOCER ────────────────────────────────────
 *  `mergeHabit` (syncMerge.ts) **UNE** `completedDates` y `skippedDates` entre
 *  dispositivos, a propósito: perder una marca diaria es peor que conservar una
 *  de más. La consecuencia acá es concreta:
 *
 *    · **Marcar** un día desde el server SIEMPRE gana. (Y "hecho" le gana a
 *      "salteado": el merge borra el día de skipped si está en completed.)
 *    · **Desmarcar** puede REBOTAR: si otro dispositivo todavía tiene el día
 *      en su lista local, la unión lo devuelve en el próximo pull.
 *
 *  Por eso `mark_habit` con `estado:"limpio"` avisa en la respuesta en vez de
 *  decir que quedó hecho (BASE nº6: nada de fallos silenciosos).
 *
 *  ── BORRAR ───────────────────────────────────────────────────────────────
 *  El tombstone va ANTES del delete, igual que en `deleteSubtasks`. Sin él, el
 *  dispositivo que todavía tiene el hábito lo re-pushea y resucita.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import type { WriteResult } from './writes'
import { isYmd } from './spiWeek'

interface HabitRow {
  id: string
  name: string
  icon: string
  color: string
  target_days: number[] | null
  completed_dates: string[] | null
  skipped_dates: string[] | null
  category: string
  created_at: string
  sort_order: number | null
  reminder_time: string | null
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

function bridgeId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
}

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// get_habits
// ---------------------------------------------------------------------------

/** Los hábitos con su racha y lo que pasó en los últimos N días. Sin esto no
 *  hay forma de saber qué ids tocar — el mismo agujero que tenía
 *  `delete_subtasks` cuando ninguna lectura devolvía los ids. */
export async function getHabits(userId: string, input: Record<string, unknown> = {}) {
  const sb = getSupabaseAdmin()
  const dias = Math.min(Math.max(Number(input.dias) || 14, 1), 90)

  const { data, error } = await sb.from('habits').select('*').eq('user_id', userId)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
  if (error) return { error: 'db_error', detail: error.message }

  const hoy = new Date()
  const ventana: string[] = []
  for (let i = 0; i < dias; i++) {
    const d = new Date(hoy)
    d.setDate(hoy.getDate() - i)
    ventana.push(ymdLocal(d))
  }
  const hoyStr = ventana[0]

  const habits = ((data ?? []) as HabitRow[]).map((h) => {
    const done = new Set(h.completed_dates ?? [])
    const skip = new Set(h.skipped_dates ?? [])
    const target = h.target_days ?? []

    // Racha: días consecutivos hacia atrás cumpliendo. Los días que no son
    // "target" y los salteados no cortan la racha (no cuentan ni a favor ni en
    // contra), igual que en el cálculo de la app.
    let racha = 0
    for (const f of ventana) {
      const dow = new Date(`${f}T12:00:00`).getDay()
      const aplica = target.length === 0 || target.includes(dow)
      if (!aplica || skip.has(f)) continue
      if (done.has(f)) racha++
      else break
    }

    const aplicables = ventana.filter((f) => {
      const dow = new Date(`${f}T12:00:00`).getDay()
      return (target.length === 0 || target.includes(dow)) && !skip.has(f)
    })
    const hechos = aplicables.filter((f) => done.has(f)).length

    return {
      id: h.id,
      nombre: h.name,
      icono: h.icon,
      categoria: h.category,
      dias: target.length === 0 ? 'todos los días' : target.map((d) => DIAS[d]).join(', '),
      recordatorio: h.reminder_time ?? undefined,
      hoy: done.has(hoyStr) ? 'hecho' : skip.has(hoyStr) ? 'salteado' : 'pendiente',
      racha,
      ultimos: `${hechos}/${aplicables.length} en ${dias} días`,
      marcados: ventana.filter((f) => done.has(f)),
    }
  })

  return { hoy: hoyStr, ventanaDias: dias, habits }
}

// ---------------------------------------------------------------------------
// upsert_habit
// ---------------------------------------------------------------------------

export async function upsertHabit(userId: string, input: Record<string, unknown>): Promise<WriteResult> {
  const sb = getSupabaseAdmin()
  const id = typeof input.habitId === 'string' ? input.habitId.trim() : ''

  let previo: HabitRow | null = null
  if (id) {
    const { data, error } = await sb.from('habits').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
    if (error) return { ok: false, error: 'db_error', detail: error.message }
    if (!data) return { ok: false, error: 'not_found', detail: `No existe el hábito ${id} en esta cuenta.` }
    previo = data as HabitRow
  }

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!previo && !name) return { ok: false, error: 'bad_input', detail: 'Un hábito nuevo necesita `name`.' }

  // targetDays: [] = todos los días. 0 domingo … 6 sábado.
  let targetDays = previo?.target_days ?? []
  if (input.targetDays !== undefined) {
    if (!Array.isArray(input.targetDays)) {
      return { ok: false, error: 'bad_days', detail: '`targetDays` es un array de 0-6 (0=domingo). `[]` = todos los días.' }
    }
    const dias = input.targetDays.map(Number)
    if (dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return { ok: false, error: 'bad_days', detail: '`targetDays` solo acepta enteros 0-6 (0=domingo … 6=sábado).' }
    }
    targetDays = [...new Set(dias)].sort()
  }

  let reminder = previo?.reminder_time ?? null
  if (input.reminderTime !== undefined) {
    if (input.reminderTime === null || input.reminderTime === '') reminder = null
    else if (typeof input.reminderTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.reminderTime)) {
      return { ok: false, error: 'bad_time', detail: '`reminderTime` tiene que ser HH:MM en 24h, o null para sacarlo.' }
    } else reminder = input.reminderTime
  }

  const row = {
    id: id || bridgeId('hab'),
    user_id: userId,
    name: name || previo!.name,
    icon: typeof input.icon === 'string' && input.icon ? input.icon : previo?.icon ?? '✅',
    color: typeof input.color === 'string' && input.color ? input.color : previo?.color ?? '#10b981',
    target_days: targetDays,
    // Nunca se pisa el historial al editar: eso lo borraría sin que nadie lo pida.
    completed_dates: previo?.completed_dates ?? [],
    skipped_dates: previo?.skipped_dates ?? [],
    category: typeof input.category === 'string' && input.category.trim()
      ? input.category.trim().slice(0, 60) : previo?.category ?? 'General',
    created_at: previo?.created_at ?? ymdLocal(new Date()),
    sort_order: previo?.sort_order ?? 999,
    reminder_time: reminder,
  }

  const { error } = await sb.from('habits').upsert(row)
  if (error) return { ok: false, error: 'db_error', detail: error.message }

  return {
    ok: true,
    creado: !previo,
    habito: {
      id: row.id, nombre: row.name, icono: row.icon, categoria: row.category,
      dias: targetDays.length === 0 ? 'todos los días' : targetDays.map((d) => DIAS[d]).join(', '),
      recordatorio: reminder ?? undefined,
    },
  }
}

// ---------------------------------------------------------------------------
// mark_habit
// ---------------------------------------------------------------------------

const ESTADOS = new Set(['hecho', 'salteado', 'limpio'])

/** Marca uno o varios días de un hábito.
 *
 *  `estado`: "hecho" | "salteado" | "limpio". No hay default a propósito —
 *  "toggle" desde el server es adivinar en qué estado está el otro dispositivo. */
export async function markHabit(userId: string, input: Record<string, unknown>): Promise<WriteResult> {
  const habitId = typeof input.habitId === 'string' ? input.habitId.trim() : ''
  if (!habitId) return { ok: false, error: 'bad_input', detail: 'Falta `habitId` (sacalo de get_habits).' }

  const estado = typeof input.estado === 'string' ? input.estado.trim() : ''
  if (!ESTADOS.has(estado)) {
    return { ok: false, error: 'bad_estado', detail: '`estado` es obligatorio: "hecho", "salteado" o "limpio". No hay default para no adivinar.' }
  }

  const crudas = input.fechas === undefined
    ? [ymdLocal(new Date())]
    : Array.isArray(input.fechas) ? input.fechas : [input.fechas]
  const fechas = crudas.filter((f): f is string => typeof f === 'string')
  if (fechas.length === 0) return { ok: false, error: 'bad_input', detail: '`fechas` vacío.' }
  const invalidas = fechas.filter((f) => !isYmd(f))
  if (invalidas.length > 0) {
    return { ok: false, error: 'bad_date', detail: `Fechas inválidas (se espera YYYY-MM-DD): ${invalidas.join(', ')}` }
  }

  const sb = getSupabaseAdmin()
  const { data, error } = await sb.from('habits').select('*').eq('id', habitId).eq('user_id', userId).maybeSingle()
  if (error) return { ok: false, error: 'db_error', detail: error.message }
  if (!data) return { ok: false, error: 'not_found', detail: `No existe el hábito ${habitId} en esta cuenta.` }
  const h = data as HabitRow

  const done = new Set(h.completed_dates ?? [])
  const skip = new Set(h.skipped_dates ?? [])
  for (const f of fechas) {
    done.delete(f); skip.delete(f)
    if (estado === 'hecho') done.add(f)
    if (estado === 'salteado') skip.add(f)
  }

  const { error: upErr } = await sb.from('habits')
    .update({ completed_dates: [...done].sort(), skipped_dates: [...skip].sort() })
    .eq('id', habitId).eq('user_id', userId)
  if (upErr) return { ok: false, error: 'db_error', detail: upErr.message }

  const warnings: string[] = []
  if (estado === 'limpio') {
    warnings.push('Desmarcar puede rebotar: el merge del pull UNE las marcas entre dispositivos, así que si otro device todavía tiene ese día marcado, vuelve. Marcar nunca rebota; desmarcar sí.')
  }

  return {
    ok: true,
    habito: h.name,
    estado,
    fechas,
    racha: null,
    ...(warnings.length > 0 ? { warnings } : {}),
  }
}

// ---------------------------------------------------------------------------
// delete_habit
// ---------------------------------------------------------------------------

/** Borra un hábito **y todo su historial**. Pide el nombre exacto como
 *  confirmación: es la única operación de hábitos que destruye datos, y el id
 *  suelto es fácil de confundir entre varios. */
export async function deleteHabit(userId: string, input: Record<string, unknown>): Promise<WriteResult> {
  const habitId = typeof input.habitId === 'string' ? input.habitId.trim() : ''
  if (!habitId) return { ok: false, error: 'bad_input', detail: 'Falta `habitId`.' }
  const confirmar = typeof input.confirmarNombre === 'string' ? input.confirmarNombre.trim() : ''

  const sb = getSupabaseAdmin()
  const { data, error } = await sb.from('habits').select('id, name, completed_dates')
    .eq('id', habitId).eq('user_id', userId).maybeSingle()
  if (error) return { ok: false, error: 'db_error', detail: error.message }
  if (!data) return { ok: false, error: 'not_found', detail: `No existe el hábito ${habitId} en esta cuenta.` }

  const nombre = (data.name as string) ?? ''
  const marcas = ((data.completed_dates as string[]) ?? []).length
  if (confirmar.toLowerCase() !== nombre.toLowerCase()) {
    return {
      ok: false, error: 'sin_confirmar',
      detail: `Para borrar "${nombre}" hay que mandar \`confirmarNombre\` con ese mismo nombre. Se van a perder ${marcas} marcas de días y no hay papelera para hábitos.`,
    }
  }

  // Tombstone PRIMERO: sin él, el device que todavía lo tiene lo re-pushea.
  const nowIso = new Date().toISOString()
  const { error: tombErr } = await sb.from('deleted_rows').upsert(
    [{ user_id: userId, table_name: 'habits', row_id: habitId, deleted_at: nowIso }],
    { onConflict: 'user_id,table_name,row_id' },
  )
  if (tombErr) {
    return {
      ok: false, error: 'tombstone_failed',
      detail: `No se escribió el tombstone, así que NO se borró nada (el borrado habría rebotado desde otro dispositivo): ${tombErr.message}`,
    }
  }

  const { error: delErr } = await sb.from('habits').delete().eq('id', habitId).eq('user_id', userId)
  if (delErr) return { ok: false, error: 'db_error', detail: delErr.message }

  return { ok: true, borrado: nombre, marcasPerdidas: marcas }
}
