/** Vista PIPELINE: las tareas repartidas por DÍA, para armar los proyectos en
 *  el tiempo.
 *
 *  Por qué no alcanzaba con el Calendario: ahí una tarea aparece solo si tiene
 *  fecha **y hora**. Las que tienen fecha sin hora, y sobre todo las que
 *  todavía no tienen fecha —que son justo las que hay que ubicar— no se ven en
 *  ningún lado contra el tiempo. Acá el día es la columna y la hora es un dato
 *  de la tarjeta, así que entran las tres clases.
 *
 *  Decisiones que importan (y por qué):
 *
 *  - **"Atrasadas" es una columna, no un filtro.** Una tarea cuya fecha ya pasó
 *    y sigue abierta es exactamente la que hay que re-ubicar; si cayera fuera de
 *    la ventana desaparecería de la vista y el plan quedaría mintiendo.
 *  - **Las completadas van al fondo de su día**, no se esconden: el día se lee
 *    como "esto hice / esto queda".
 *  - **Lo que cae después de la ventana se cuenta, no se dibuja** (`aheadCount`):
 *    sin ese número, mover una tarea a la semana que viene se siente como
 *    perderla.
 *  - La semana arranca el **lunes**, igual que el Calendario.
 *
 *  Todo acá es PURO: recibe las tareas ya filtradas por la página y solo las
 *  reparte. Quién pasa qué (filtros del toolbar, proyectos ocultos) es decisión
 *  de `TasksPage`, no de este módulo.
 */

export interface PipelineTask {
  id: string
  dueDate?: string
  dueTime?: string
  completedAt?: string
  archivedAt?: string
}

/** `YYYY-MM-DD` de una fecha, en hora LOCAL (nunca `toISOString()`, que se
 *  corre un día para quien está en UTC-3 después de las 21). */
export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** El lunes de la semana que contiene a `d`. */
export function startOfWeekMonday(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = out.getDay()            // 0 = domingo
  const diff = dow === 0 ? -6 : 1 - dow
  out.setDate(out.getDate() + diff)
  return out
}

/** Los `count` días (ymd) que arrancan en `start`. */
export function buildDays(start: Date, count = 7): string[] {
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    out.push(ymdLocal(d))
  }
  return out
}

export interface PipelineBuckets<T extends PipelineTask> {
  /** Fecha pasada y todavía abierta. Hay que re-ubicarlas. */
  overdue: T[]
  /** Sin fecha: el stock desde donde se planifica. */
  undated: T[]
  /** ymd → tareas de ese día, ya ordenadas. */
  byDay: Map<string, T[]>
  /** Cuántas quedan DESPUÉS del último día de la ventana (no se dibujan). */
  aheadCount: number
  /** Cuántas quedan ANTES de la ventana sin estar vencidas — pasa al mirar una
   *  semana futura: lo de hoy no se dibuja, pero tampoco está atrasado. */
  behindCount: number
}

/** Orden dentro de un día: primero lo que tiene hora (cronológico), después lo
 *  que no, y las completadas siempre al fondo. El desempate final es por `id`
 *  para que el orden sea estable entre renders y entre dispositivos. */
export function sortByTime<T extends PipelineTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const aDone = !!a.completedAt, bDone = !!b.completedAt
    if (aDone !== bDone) return aDone ? 1 : -1
    const at = a.dueTime, bt = b.dueTime
    if (at && bt && at !== bt) return at.localeCompare(bt)
    if (!!at !== !!bt) return at ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/**
 * Reparte las tareas en las columnas del pipeline.
 *
 * `todayYmd` se pasa explícito (no se lee el reloj acá) para que el test sea
 * determinista y para que la página pueda usar la zona del usuario.
 */
export function bucketByDay<T extends PipelineTask>(
  tasks: T[],
  days: string[],
  todayYmd: string,
): PipelineBuckets<T> {
  const dayset = new Set(days)
  const last = days[days.length - 1] ?? todayYmd
  const overdue: T[] = []
  const undated: T[] = []
  const byDay = new Map<string, T[]>(days.map((d) => [d, [] as T[]]))
  let aheadCount = 0
  let behindCount = 0

  for (const t of tasks) {
    if (t.archivedAt) continue
    if (!t.dueDate) { undated.push(t); continue }
    if (dayset.has(t.dueDate)) { byDay.get(t.dueDate)!.push(t); continue }
    if (t.dueDate > last) { aheadCount++; continue }
    // Anterior a la ventana. "Atrasada" se mide contra HOY, no contra la
    // ventana: mirando la semana que viene, lo de hoy NO está atrasado —
    // decirlo sería mentir. Eso se cuenta aparte y no se dibuja.
    if (t.dueDate >= todayYmd) { behindCount++; continue }
    if (!t.completedAt) overdue.push(t)   // ya hecha = historia, no ensucia
  }

  for (const [k, v] of byDay) byDay.set(k, sortByTime(v))
  return {
    overdue: sortByTime(overdue),
    undated: sortByTime(undated),
    byDay,
    aheadCount,
    behindCount,
  }
}

/** Etiqueta corta de la hora para el chip de la tarjeta. */
export function timeLabel(t: PipelineTask): string | null {
  return t.dueTime ? t.dueTime.slice(0, 5) : null
}
