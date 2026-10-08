/** Vista LÍNEA DE TIEMPO (Gantt): cada tarea es una BARRA sobre un eje de días.
 *
 *  Qué la diferencia de las otras vistas: el Pipeline pone cada tarea en SU día
 *  (un punto), y el Calendario solo muestra las que tienen fecha **y** hora.
 *  Acá una tarea ocupa un tramo — "esto me lleva del 10 al 14" — que es lo que
 *  hace falta para repartir trabajo y ver qué se pisa con qué.
 *
 *  El tramo sale de dos campos:
 *    `startDate` → el día que empieza (campo nuevo, ver migration_tasks_start_date.sql)
 *    `dueDate`   → el día que termina
 *
 *  Reglas, todas pensadas para que una tarea NUNCA desaparezca del gráfico por
 *  tener los datos a medias:
 *    - con los dos  → barra de inicio a fin
 *    - solo uno     → barra de un día en ese día (no inventamos el otro extremo)
 *    - ninguno      → sin barra: la vista la lista aparte, para ubicarla
 *    - invertida (`startDate > dueDate`) → se dibuja igual, del menor al mayor,
 *      y se marca. Esconderla sería ocultar justo el dato que hay que arreglar.
 *
 *  Todo acá es PURO y trabaja con fechas `YYYY-MM-DD` como texto: comparar y
 *  ordenar strings ISO ya da el orden cronológico, y así no hay un `Date` de
 *  por medio que se corra de día por zona horaria (ese bug ya mordió dos veces
 *  en este proyecto).
 */

export interface TimelineTask {
  id: string
  startDate?: string
  dueDate?: string
  completedAt?: string
  archivedAt?: string
}

/** Suma días a un `YYYY-MM-DD` usando el calendario local (no UTC). */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** Días enteros entre dos fechas (b - a). Negativo si `b` es anterior. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const ms = new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()
  return Math.round(ms / 86_400_000)
}

export interface Bar {
  /** Primer día de la barra (inclusive). */
  from: string
  /** Último día de la barra (inclusive). */
  to: string
  /** `startDate` venía después de `dueDate`: se dibuja ordenada, pero se avisa. */
  inverted: boolean
  /** No tiene los dos extremos: es una barra de un día, no un tramo medido. */
  single: boolean
}

/** El tramo que ocupa una tarea, o `null` si no tiene ninguna fecha. */
export function barOf(t: TimelineTask): Bar | null {
  const { startDate: s, dueDate: d } = t
  if (!s && !d) return null
  if (s && d) {
    const inverted = s > d
    return { from: inverted ? d : s, to: inverted ? s : d, inverted, single: false }
  }
  const only = (s ?? d)!
  return { from: only, to: only, inverted: false, single: true }
}

export interface Placed<T extends TimelineTask> {
  task: T
  bar: Bar
  /** Índice de la primera columna visible que ocupa (0 = primer día). */
  offset: number
  /** Cuántas columnas ocupa dentro de la ventana (siempre >= 1). */
  span: number
  /** La barra sigue antes del borde izquierdo / después del derecho. Lo usa la
   *  UI para dibujar la flecha de "esto continúa". */
  clippedLeft: boolean
  clippedRight: boolean
}

/**
 * Ubica las tareas en una ventana de `days` columnas que arranca en `windowStart`.
 * Devuelve solo las que se VEN (las que caen enteras afuera se descartan) y,
 * aparte, las que no tienen ninguna fecha.
 */
export function placeInWindow<T extends TimelineTask>(
  tasks: T[],
  windowStart: string,
  dayCount: number,
): { placed: Placed<T>[]; undated: T[]; hiddenCount: number } {
  const windowEnd = addDaysYmd(windowStart, dayCount - 1)
  const placed: Placed<T>[] = []
  const undated: T[] = []
  let hiddenCount = 0

  for (const t of tasks) {
    if (t.archivedAt) continue
    const bar = barOf(t)
    if (!bar) { undated.push(t); continue }
    if (bar.to < windowStart || bar.from > windowEnd) { hiddenCount++; continue }
    const from = bar.from < windowStart ? windowStart : bar.from
    const to = bar.to > windowEnd ? windowEnd : bar.to
    placed.push({
      task: t,
      bar,
      offset: daysBetween(windowStart, from),
      span: Math.max(1, daysBetween(from, to) + 1),
      clippedLeft: bar.from < windowStart,
      clippedRight: bar.to > windowEnd,
    })
  }

  // Orden de filas: por dónde EMPIEZA la barra; a igual inicio, la más larga
  // arriba (se lee como una escalera); después por id, para que no baile.
  placed.sort((a, b) =>
    a.bar.from.localeCompare(b.bar.from)
    || b.span - a.span
    || (a.task.id < b.task.id ? -1 : a.task.id > b.task.id ? 1 : 0),
  )
  return { placed, undated, hiddenCount }
}

/** Qué hace un arrastre sobre una barra. `move` corre las dos puntas; `start` y
 *  `end` mueven una sola. */
export type DragKind = 'move' | 'start' | 'end'

/**
 * El resultado de arrastrar `deltaDays` columnas. Devuelve SOLO los campos que
 * cambian, listos para `updateTask`.
 *
 * Las dos reglas que evitan datos imposibles:
 *  - estirar el inicio más allá del fin (o el fin antes del inicio) **topea**
 *    en un tramo de un día; no se permite una barra invertida por arrastre.
 *  - a una tarea sin inicio, estirarle el borde izquierdo se lo CREA (es la
 *    forma natural de decir "esto arranca antes"); lo mismo del otro lado.
 */
export function applyDrag(
  t: TimelineTask,
  kind: DragKind,
  deltaDays: number,
): { startDate?: string; dueDate?: string } | null {
  const bar = barOf(t)
  if (!bar || deltaDays === 0) return null

  if (kind === 'move') {
    const out: { startDate?: string; dueDate?: string } = {}
    if (t.startDate) out.startDate = addDaysYmd(t.startDate, deltaDays)
    if (t.dueDate) out.dueDate = addDaysYmd(t.dueDate, deltaDays)
    return out
  }

  if (kind === 'start') {
    const end = t.dueDate ?? bar.to
    const next = addDaysYmd(bar.from, deltaDays)
    return { startDate: next > end ? end : next }
  }

  const begin = t.startDate ?? bar.from
  const next = addDaysYmd(bar.to, deltaDays)
  return { dueDate: next < begin ? begin : next }
}

/** Cuántos días dura la barra (1 = un solo día). Para el texto "3 días". */
export function barLength(bar: Bar): number {
  return daysBetween(bar.from, bar.to) + 1
}
