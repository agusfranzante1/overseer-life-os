/** Cálculo PURO de huecos libres en un día.
 *
 *  Lo usa el bridge (`/api/mcp`, `/api/export/brief`) para decirle a Claude
 *  "tenés 2hs libres entre las 15:00 y las 17:00" sin que tenga que deducirlo
 *  de una lista cruda de eventos.
 *
 *  Es pura a propósito (sin I/O, sin Date.now()): así se testea de verdad con
 *  `npx tsx lib/mcp/freeSlots.test.ts` en vez de "compila, debe andar".
 *
 *  Todo se maneja en ISO strings / epoch ms — la zona horaria la resuelve
 *  quien arma la ventana, acá no se asume ninguna. */

export interface Interval {
  start: string   // ISO
  end: string     // ISO
}

export interface FreeSlot {
  start: string   // ISO
  end: string     // ISO
  minutes: number
}

/** Junta intervalos solapados o pegados en bloques contiguos. Asume entrada
 *  YA ordenada por `start`. */
function mergeBusy(sorted: { start: number; end: number }[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  for (const b of sorted) {
    const last = out[out.length - 1]
    // `b.start <= last.end` junta también los pegados (13:00-14:00 + 14:00-15:00),
    // si no quedaría un "hueco" de 0 minutos entre medio.
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end)
    else out.push({ ...b })
  }
  return out
}

/**
 * Devuelve los tramos LIBRES dentro de [windowStart, windowEnd] una vez
 * descontados los `busy`.
 *
 * - Los `busy` se recortan a la ventana (un evento que arranca a las 07:00
 *   cuando la ventana empieza 09:00 solo ocupa desde las 09:00).
 * - Se ignoran los intervalos inválidos (fecha no parseable, `end <= start`)
 *   y los que caen completamente fuera de la ventana.
 * - La entrada NO necesita venir ordenada.
 * - Los huecos de menos de `minMinutes` se descartan: un hueco de 5 minutos
 *   no es tiempo de trabajo, es ruido que ensucia el plan.
 */
export function computeFreeSlots(
  windowStart: string,
  windowEnd: string,
  busy: Interval[],
  minMinutes = 15,
): FreeSlot[] {
  const winStart = Date.parse(windowStart)
  const winEnd = Date.parse(windowEnd)
  if (!Number.isFinite(winStart) || !Number.isFinite(winEnd) || winEnd <= winStart) return []

  const clipped = busy
    .map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start)
    // recortar a la ventana y descartar lo que queda afuera
    .map((b) => ({ start: Math.max(b.start, winStart), end: Math.min(b.end, winEnd) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start)

  const merged = mergeBusy(clipped)

  const slots: FreeSlot[] = []
  let cursor = winStart
  for (const b of merged) {
    if (b.start > cursor) slots.push(makeSlot(cursor, b.start))
    cursor = Math.max(cursor, b.end)
  }
  if (cursor < winEnd) slots.push(makeSlot(cursor, winEnd))

  return slots.filter((s) => s.minutes >= minMinutes)
}

function makeSlot(start: number, end: number): FreeSlot {
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    minutes: Math.round((end - start) / 60000),
  }
}

/** Suma de minutos libres. Atajo para el resumen del día. */
export function totalFreeMinutes(slots: FreeSlot[]): number {
  return slots.reduce((acc, s) => acc + s.minutes, 0)
}

/**
 * Construye la ventana de trabajo de un día concreto a partir de horas
 * "HH:MM" en la zona del usuario.
 *
 * `offsetMinutes` es el offset de la zona respecto de UTC para ESE día
 * (ej. Buenos Aires = -180). Lo calcula el caller con Intl, así esta
 * función queda pura y testeable.
 */
export function dayWindow(
  date: string,           // YYYY-MM-DD
  startHHMM: string,      // "09:00"
  endHHMM: string,        // "21:00"
  offsetMinutes: number,
): Interval | null {
  const at = (hhmm: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
    if (!m) return null
    const h = Number(m[1]), min = Number(m[2])
    if (h > 23 || min > 59) return null
    const base = Date.parse(`${date}T00:00:00Z`)
    if (!Number.isFinite(base)) return null
    // La hora local se convierte a UTC restando el offset de la zona.
    return base + (h * 60 + min - offsetMinutes) * 60000
  }
  const s = at(startHHMM), e = at(endHHMM)
  if (s === null || e === null || e <= s) return null
  return { start: new Date(s).toISOString(), end: new Date(e).toISOString() }
}

/** Offset de `timeZone` respecto de UTC, en minutos, para ese instante.
 *  Buenos Aires → -180. Se usa Intl para que los cambios de horario de verano
 *  salgan solos.
 *
 *  Devuelve `resolved: false` cuando la zona NO se pudo resolver, en vez de
 *  devolver 0 calladamente. Un 0 silencioso corre el día entero del
 *  planificador (3 horas, en el caso de Argentina) y NADIE se entera: el plan
 *  simplemente sale mal y parece un problema de criterio. BASE nº6 — el fallo
 *  tiene que ser ruidoso. Ojo: `America/Buenos_Aires` es un alias DEPRECADO
 *  (el canónico es `America/Argentina/Buenos_Aires`); hoy resuelve, pero es
 *  justo el tipo de valor que un día puede dejar de hacerlo. */
export function tzOffset(at: Date, timeZone: string): { minutes: number; resolved: boolean } {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    const p: Record<string, string> = {}
    for (const part of dtf.formatToParts(at)) if (part.type !== 'literal') p[part.type] = part.value
    // `hour` puede venir "24" para medianoche con hour12:false.
    const hour = p.hour === '24' ? '00' : p.hour
    const asUTC = Date.UTC(
      Number(p.year), Number(p.month) - 1, Number(p.day),
      Number(hour), Number(p.minute), Number(p.second),
    )
    if (!Number.isFinite(asUTC)) return { minutes: 0, resolved: false }
    return { minutes: Math.round((asUTC - at.getTime()) / 60000), resolved: true }
  } catch {
    return { minutes: 0, resolved: false }
  }
}
