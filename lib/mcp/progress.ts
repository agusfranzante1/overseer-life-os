/** El tablero de avance: los números ya calculados, no los datos crudos.
 *
 *  Por qué existe, en palabras del usuario: *"siento que puede terminar
 *  pasando lo mismo que con el programa: completar, completar, y al final no
 *  ver nada, porque son muchos datos"*. Ese es el riesgo real — no le falta
 *  información, le falta LECTURA.
 *
 *  Así que esto no devuelve más datos: devuelve **el puntaje**. `get_history`
 *  ya daba las filas completadas; acá se convierten en las cuatro preguntas que
 *  de verdad cambian una decisión:
 *
 *    1. ¿Qué días trabajé y cuáles se cayeron?            → `porDia`
 *    2. ¿A qué proyecto le fue la semana?                 → `porProyecto`
 *    3. ¿Los hábitos se sostuvieron?                      → `habitos`
 *    4. ¿Los KPIs de la semana llegaron al target?        → `kpis`
 *
 *  ── LA MÉTRICA QUE MÁS IMPORTA ──────────────────────────────────────────
 *  `porProyecto` no está para contar tareas: está para comparar **el reparto
 *  real contra la prioridad declarada**. En agosto el reparto fue NQN 4 · SPI 4
 *  · Personal 2 · Trading 2 · Contenido 1 — o sea, Trading, que él nombra como
 *  lo primordial, fue lo MENOS trabajado. Ese contraste es el único número que
 *  hasta ahora le cambió una decisión.
 *
 *  ── LO QUE NO CALCULA ───────────────────────────────────────────────────
 *  Si los objetivos de la semana se cumplieron. Eso es una LECTURA (sí/no sobre
 *  un resultado), no una cuenta, y la hace Claude el domingo mirando esto. Un
 *  "% de objetivos cumplidos" calculado a ciegas sería justamente el número
 *  decorativo que este archivo existe para no producir.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getHistory } from './spiQueries'
import { getHabits } from './habitWrites'
import { lastSaturdayYmd, spiPlannedWeek, isYmd } from './spiWeek'

const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

function diaSemana(ymd: string): string {
  return DIA_CORTO[new Date(`${ymd}T12:00:00`).getDay()]
}

function pct(parte: number, total: number): number {
  return total === 0 ? 0 : Math.round((parte / total) * 100)
}

/** Todos los días del rango, incluidos los que NO tuvieron actividad: un día en
 *  cero es información, y si solo se listan los días con movimiento
 *  desaparecen justo los que hay que mirar. */
function rangoDeDias(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(`${from}T12:00:00`)
  const fin = new Date(`${to}T12:00:00`)
  while (d <= fin && out.length < 400) {
    out.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return out
}

export async function getProgress(userId: string, input: Record<string, unknown> = {}) {
  // Sin rango: la semana que planifica la sesión de SPI en curso.
  const semanaSpi = typeof input.weekStartDate === 'string' && isYmd(input.weekStartDate)
    ? input.weekStartDate
    : lastSaturdayYmd()
  const plan = spiPlannedWeek(semanaSpi)
  const from = isYmd(input.from) ? (input.from as string) : plan.from
  const to = isYmd(input.to) ? (input.to as string) : plan.to

  const sb = getSupabaseAdmin()

  const [hist, hab, sesion, kpiDefs] = await Promise.all([
    getHistory(userId, from, to),
    getHabits(userId, { dias: Math.max(rangoDeDias(from, to).length, 7) }),
    sb.from('spi_sessions').select('payload').eq('user_id', userId).eq('week_start_date', semanaSpi).maybeSingle(),
    sb.from('kpis').select('payload').eq('user_id', userId),
  ])

  // ── 1. por día ─────────────────────────────────────────────────────────
  const porFecha = new Map(hist.days.map((d) => [d.date, d]))
  const porDia = rangoDeDias(from, to).map((f) => {
    const d = porFecha.get(f)
    return {
      fecha: f,
      dia: diaSemana(f),
      tareas: d?.tareas.length ?? 0,
      subtareas: d?.subtareas.length ?? 0,
      total: (d?.tareas.length ?? 0) + (d?.subtareas.length ?? 0),
    }
  })
  const diasEnCero = porDia.filter((d) => d.total === 0).map((d) => `${d.dia} ${d.fecha.slice(8)}`)

  // ── 2. por proyecto ────────────────────────────────────────────────────
  // Se cuentan tareas Y subtareas: casi todo el trabajo real de este usuario
  // vive en subtareas (292 subtareas contra 55 tareas), así que contar solo
  // tareas madre daría casi cero y mentiría.
  const conteo: Record<string, number> = { ...hist.porProyecto }
  const tituloAProyecto = new Map<string, string>()
  for (const d of hist.days) for (const t of d.tareas) tituloAProyecto.set(t.title, t.project)
  for (const d of hist.days) {
    for (const s of d.subtareas) {
      const proj = tituloAProyecto.get(s.task) ?? '(subtareas sueltas)'
      conteo[proj] = (conteo[proj] ?? 0) + 1
    }
  }
  const totalItems = Object.values(conteo).reduce((a, b) => a + b, 0)
  const porProyecto = Object.entries(conteo)
    .map(([proyecto, total]) => ({ proyecto, total, share: pct(total, totalItems) }))
    .sort((a, b) => b.total - a.total)

  // ── 3. hábitos ─────────────────────────────────────────────────────────
  const dias = rangoDeDias(from, to)
  const listaHab = 'habits' in hab && Array.isArray(hab.habits) ? hab.habits : []
  const habitos = listaHab.map((h) => {
    const marcados = new Set(h.marcados)
    const enRango = dias.filter((f) => marcados.has(f)).length
    return { nombre: h.nombre, cumplidos: enRango, deDias: dias.length, pct: pct(enRango, dias.length), racha: h.racha }
  }).sort((a, b) => b.pct - a.pct)

  // ── 4. KPIs de la semana ───────────────────────────────────────────────
  const payload = (sesion.data?.payload ?? {}) as {
    selectedKpiIds?: string[]
    values?: Record<string, Record<string, string>>
    tasks?: { title: string; important?: boolean; dueDate?: string }[]
  }
  const defs = new Map(
    (kpiDefs.data ?? []).map((r) => {
      const p = (r.payload ?? {}) as { id: string; name: string; icon?: string; target?: number; kind?: string }
      return [p.id, p]
    }),
  )
  const valores = payload.values?.kpis ?? {}
  const kpis = (payload.selectedKpiIds ?? []).map((id) => {
    const d = defs.get(id)
    const crudo = valores[id]
    const valor = crudo === undefined || crudo === '' ? null : Number(crudo)
    return {
      nombre: d ? `${d.icon ?? ''} ${d.name}`.trim() : id,
      target: d?.target ?? null,
      valor,
      pct: valor !== null && d?.target ? pct(valor, d.target) : null,
      sinCargar: valor === null,
    }
  })

  // ── resumen ────────────────────────────────────────────────────────────
  return {
    rango: { from, to, semanaSpi },
    resumen: {
      totalCompletado: totalItems,
      diasConActividad: porDia.filter((d) => d.total > 0).length,
      deDias: porDia.length,
      diasEnCero,
      proyectoDominante: porProyecto[0]?.proyecto ?? null,
      proyectoAusente: porProyecto.length > 0 ? porProyecto[porProyecto.length - 1].proyecto : null,
      kpisSinCargar: kpis.filter((k) => k.sinCargar).length,
      // Recordatorio, no un cálculo: el score 0-100 de la semana lo produce el
      // CIERRE de la sesión en la app, y ese score es el que después promedia
      // el mes y el trimestre. Sin cerrar, la cadena queda vacía.
      sesionCerrada: !!(sesion.data?.payload as { closedAt?: string } | undefined)?.closedAt,
    },
    porDia,
    porProyecto,
    habitos,
    kpis,
    objetivos: payload.values?.que_buscamos ?? {},
    tareasDeLaSemana: (payload.tasks ?? []).map((t) => ({
      title: t.title, dueDate: t.dueDate, important: !!t.important,
    })),
  }
}
