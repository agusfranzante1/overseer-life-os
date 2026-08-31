/** Lecturas del SPI, los KPIs y el historial de tareas.
 *
 *  Por qué existe: el usuario YA tiene un sistema de objetivos (SPI semanal,
 *  mensual, trimestral, semestral y anual) y KPIs dentro de Overseer. Sin
 *  leerlos, cualquier "objetivo de la semana" que se arme desde afuera es un
 *  sistema paralelo que compite con el suyo — exactamente lo que este proyecto
 *  viene evitando.
 *
 *  Lo que NO puede medir hoy es el AVANCE. Para eso está `getHistory`, que lee
 *  lo completado — incluidas las tareas archivadas, que en la app desaparecen
 *  de la vista pero siguen en la base con su `completed_at`.
 *
 *  Todo read-only.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'

// ---------------------------------------------------------------------------
// SPI
// ---------------------------------------------------------------------------

export interface SpiSession {
  weekStart: string
  closed: boolean
  closedAt?: string
  updatedAt?: string
  /** El payload es el `SPISession` del cliente: se devuelve tal cual porque su
   *  forma la define la app y acá no conviene reinterpretarla. */
  payload: unknown
}

export async function getSpi(userId: string, semanas = 8): Promise<{
  sessions: SpiSession[]
  bitacora: { kind: string; situation: string; dominoEffect: string; resolved: boolean; createdAt: string }[]
}> {
  const sb = getSupabaseAdmin()
  const [ses, bit] = await Promise.all([
    sb.from('spi_sessions').select('*').eq('user_id', userId)
      .order('week_start_date', { ascending: false }).limit(Math.min(semanas, 52)),
    sb.from('spi_bitacora').select('*').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(40),
  ])

  return {
    sessions: (ses.data ?? []).map((r) => ({
      weekStart: r.week_start_date as string,
      closed: !!r.closed_at,
      ...(r.closed_at ? { closedAt: r.closed_at as string } : {}),
      ...(r.updated_at ? { updatedAt: r.updated_at as string } : {}),
      payload: r.payload,
    })),
    bitacora: (bit.data ?? []).map((r) => ({
      kind: (r.kind as string) ?? '',
      situation: (r.situation as string) ?? '',
      dominoEffect: (r.domino_effect as string) ?? '',
      resolved: !!r.resolved,
      createdAt: r.created_at as string,
    })),
  }
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export async function getKpis(userId: string): Promise<unknown[]> {
  const sb = getSupabaseAdmin()
  const { data } = await sb.from('kpis').select('payload').eq('user_id', userId).limit(200)
  return (data ?? []).map((r) => r.payload)
}

// ---------------------------------------------------------------------------
// Historial de lo completado
// ---------------------------------------------------------------------------

export interface HistoryDay {
  date: string
  tareas: { title: string; project: string; completedAt: string; archived: boolean }[]
  subtareas: { title: string; task: string; completedAt: string }[]
}

/**
 * Lo COMPLETADO entre dos fechas, agrupado por día.
 *
 * Incluye las archivadas a propósito: la app las saca de la vista al día
 * siguiente de completarlas, pero la fila sigue en la base. Ese es justamente
 * el registro de avance que desde adentro de la app no se ve.
 *
 * ⚠️ El botón "borrar historial" de la app SÍ borra estas filas. Si se usó, lo
 * de antes no está — por eso el resumen semanal se guarda además en la carpeta.
 */
export async function getHistory(userId: string, from: string, to: string) {
  const sb = getSupabaseAdmin()
  const desde = `${from}T00:00:00.000Z`
  const hasta = `${to}T23:59:59.999Z`

  const [tareas, subs, projects] = await Promise.all([
    sb.from('tasks').select('id, title, project_id, completed_at, archived_at')
      .eq('user_id', userId).not('completed_at', 'is', null)
      .gte('completed_at', desde).lte('completed_at', hasta).limit(2000),
    sb.from('subtasks').select('id, title, task_id, completed_at')
      .eq('user_id', userId).not('completed_at', 'is', null)
      .gte('completed_at', desde).lte('completed_at', hasta).limit(4000),
    sb.from('projects').select('id, name').eq('user_id', userId),
  ])

  const projName = new Map((projects.data ?? []).map((p) => [p.id as string, (p.name as string) ?? '?']))

  // Título de la tarea madre de cada subtarea, para que el historial se lea.
  const taskIds = [...new Set((subs.data ?? []).map((s) => s.task_id as string))]
  const madres = new Map<string, string>()
  if (taskIds.length > 0) {
    const { data } = await sb.from('tasks').select('id, title').eq('user_id', userId).in('id', taskIds)
    for (const t of data ?? []) madres.set(t.id as string, (t.title as string) ?? '?')
  }

  const dias = new Map<string, HistoryDay>()
  const dia = (d: string) => {
    if (!dias.has(d)) dias.set(d, { date: d, tareas: [], subtareas: [] })
    return dias.get(d)!
  }

  for (const t of tareas.data ?? []) {
    const at = t.completed_at as string
    dia(at.slice(0, 10)).tareas.push({
      title: (t.title as string) ?? '',
      project: projName.get(t.project_id as string) ?? '?',
      completedAt: at,
      archived: !!t.archived_at,
    })
  }
  for (const s of subs.data ?? []) {
    const at = s.completed_at as string
    dia(at.slice(0, 10)).subtareas.push({
      title: (s.title as string) ?? '',
      task: madres.get(s.task_id as string) ?? '?',
      completedAt: at,
    })
  }

  const days = [...dias.values()].sort((a, b) => (a.date < b.date ? 1 : -1))
  const totalT = days.reduce((n, d) => n + d.tareas.length, 0)
  const totalS = days.reduce((n, d) => n + d.subtareas.length, 0)

  // Conteo por proyecto: es lo que permite comparar semanas entre sí.
  const porProyecto: Record<string, number> = {}
  for (const d of days) for (const t of d.tareas) porProyecto[t.project] = (porProyecto[t.project] ?? 0) + 1

  return {
    desde: from, hasta: to,
    totales: { tareas: totalT, subtareas: totalS, diasConActividad: days.length },
    porProyecto,
    days,
  }
}
