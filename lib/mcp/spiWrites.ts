/** Escritura del SPI (la ritual semanal) y de la biblioteca de KPIs.
 *
 *  Por qué existe: el usuario YA tiene este sistema y lo tenía apagado hacía
 *  dos semanas. Su pedido textual fue *"que lo hagas todo vos, que yo maneje
 *  todo desde acá y cuando quiera revisar vaya y vea que esté todo lindo"*. Sin
 *  escritura, el bridge solo podía mirarlo — y la fricción de cargarlo a mano
 *  es exactamente lo que lo dejó vacío.
 *
 *  ── LO QUE HAY QUE SABER ANTES DE TOCAR ESTO ─────────────────────────────
 *
 *  1. **La semana del SPI arranca el SÁBADO.** Una sesión anclada al sábado X
 *     planifica lunes X+2 → domingo X+8. Ver `spiWeek.ts` (puro, con test).
 *     Anclar a otro día deja la sesión invisible: los renderers la buscan por
 *     el sábado.
 *
 *  2. **Una sesión por semana o se duplica el ritual.** El cliente
 *     (`createOrOpenCurrentWeek`) busca por `weekStartDate` antes de crear, así
 *     que si ya pulleó la del server no duplica. Acá se busca por la COLUMNA
 *     `week_start_date` justamente para reusar la fila que exista, venga de
 *     donde venga; el id determinista `spi_<fecha>` es solo para el caso de
 *     crearla nosotros, para que dos escrituras del server converjan.
 *
 *  3. **El payload manda, las columnas son índice.** El cliente rehidrata desde
 *     `payload`; `week_start_date`/`closed_at`/`updated_at` son para consultar.
 *     Se escriben las dos cosas o el pull muestra una y filtra por la otra.
 *
 *  4. **`updated_at` se bumpea en la columna Y en el payload** (BASE nº1). El
 *     merge LWW usa `payload.updatedAt`; sin ese bump el push del cliente lo
 *     pisa con su copia vieja.
 *
 *  5. **El merge del pull juega a favor** (`mergeSpiSession`): `values` se une
 *     campo por campo (no-vacío gana sobre vacío), `tasks` por id, y
 *     `selectedLanes`/`selectedKpiIds` se UNEN. O sea: escribir desde acá no
 *     puede pisar lo que él cargó desde la app. Por eso este archivo mergea en
 *     vez de reemplazar — y por eso borrar requiere pedirlo explícito.
 *
 *  ── LO QUE NO HACE, Y NO ES POR VAGANCIA ─────────────────────────────────
 *  **No cierra la sesión.** Se investigó a fondo (2026-08-31, con tres
 *  revisiones adversariales independientes) y las tres concluyeron lo mismo:
 *  cerrar desde el server **NO es seguro**. Los cuatro motivos, todos
 *  verificados contra el código:
 *
 *  - `closeSession` hace find-or-create del proyecto "SPI" con **borrado de
 *    duplicados**, y empuja cada SPITask al task manager con ids `genId()`
 *    **aleatorios**. Dos dispositivos generarían tareas reales distintas.
 *  - `closedAt` es **irreversible**: no existe `reopenSession` en `spiStore`
 *    (sí en `projectionStore` y `labStore`). Un cierre mal puesto desde el
 *    server deja al usuario en un estado del que no puede salir.
 *  - El push del cliente es un **upsert ciego del payload entero**: un
 *    dispositivo con la copia vieja borra el cierre de la nube; el usuario
 *    cierra otra vez a mano y las tareas reales quedan **duplicadas**.
 *  - `closeSession` **no chequea `closedAt`**, así que re-cerrar es posible.
 *
 *  Cerrar se cierra en la app. Lo más cercano al pedido de "que se cierren
 *  solas" es que la propia app lo haga en su mantenimiento periódico — pero eso
 *  es un cambio en el cliente, no en el bridge.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import type { WriteResult } from './writes'
import { lastSaturdayYmd, isSaturday, isYmd } from './spiWeek'

// ---------------------------------------------------------------------------
// Tipos mínimos (el shape completo vive en lib/spi/types.ts, que es del cliente)
// ---------------------------------------------------------------------------

interface SpiTask {
  id: string
  title: string
  important: boolean
  priority?: boolean
  dueDate?: string
  whyPurpose?: string
  linkedTaskId?: string
}

interface SpiSessionPayload {
  id: string
  weekStartDate: string
  createdAt: string
  updatedAt: string
  closedAt?: string
  mainChecklist: Record<string, boolean>
  selectedLanes: string[]
  values: Record<string, Record<string, string>>
  tasks: SpiTask[]
  templateVersion: number
  selectedKpiIds?: string[]
  notes?: string
  [k: string]: unknown
}

/** Id de una entidad creada desde el bridge. Sin `_` ni `__`: esos separadores
 *  los usa el spawn de recurrentes para partir ids compuestos. */
function bridgeId(prefix: string): string {
  const rnd = Math.random().toString(36).slice(2, 9)
  return `${prefix}${rnd}${Date.now().toString(36).slice(-3)}`
}

// ---------------------------------------------------------------------------
// Resolver la semana + traerla (o crearla)
// ---------------------------------------------------------------------------

/** Normaliza el sábado pedido. Sin argumento, el de la semana en curso. */
function resolveWeek(input: { weekStartDate?: unknown }): { week: string } | { error: WriteResult } {
  const raw = typeof input.weekStartDate === 'string' ? input.weekStartDate.trim() : ''
  if (!raw) return { week: lastSaturdayYmd() }
  if (!isYmd(raw)) {
    return { error: { ok: false, error: 'bad_date', detail: `\`weekStartDate\` tiene que ser YYYY-MM-DD; llegó "${raw}".` } }
  }
  if (!isSaturday(raw)) {
    return {
      error: {
        ok: false, error: 'no_es_sabado',
        detail: `La semana del SPI arranca el SÁBADO y ${raw} no lo es. La sesión quedaría invisible en la app. La semana en curso es ${lastSaturdayYmd()}.`,
      },
    }
  }
  return { week: raw }
}

/** El `mainChecklist` en cero y la versión, sacados de la plantilla real del
 *  usuario. Si la tabla `spi_template` no está (migración sin correr), se crea
 *  con checklist vacío: el cliente lo completa al abrir la sesión. */
async function templateSeed(userId: string): Promise<{ mainChecklist: Record<string, boolean>; version: number }> {
  const sb = getSupabaseAdmin()
  const { data } = await sb.from('spi_template').select('payload, version').eq('user_id', userId).maybeSingle()
  const payload = (data?.payload ?? {}) as { mainChecklist?: { key: string }[]; version?: number }
  const mainChecklist: Record<string, boolean> = {}
  for (const item of payload.mainChecklist ?? []) {
    if (item?.key) mainChecklist[item.key] = false
  }
  return { mainChecklist, version: (data?.version as number) ?? payload.version ?? 1 }
}

interface LoadedWeek { row: { id: string }; payload: SpiSessionPayload; creada: boolean }

/** Devuelve la sesión de esa semana, creándola si no existe. */
async function loadOrCreateWeek(userId: string, week: string): Promise<LoadedWeek | WriteResult> {
  const sb = getSupabaseAdmin()

  // Buscar por la COLUMNA, no por el id: así se reusa la fila que haya creado
  // la app aunque tenga id aleatorio.
  const { data: existing, error: readErr } = await sb
    .from('spi_sessions').select('id, payload')
    .eq('user_id', userId).eq('week_start_date', week).maybeSingle()
  if (readErr) return { ok: false, error: 'db_error', detail: readErr.message }

  if (existing) {
    const payload = (existing.payload ?? {}) as SpiSessionPayload
    return {
      row: { id: existing.id as string },
      // Defaults defensivos: una sesión vieja puede no tener campos nuevos, y
      // los renderers hacen `.length` sobre ellos.
      payload: {
        ...payload,
        id: payload.id ?? (existing.id as string),
        weekStartDate: payload.weekStartDate ?? week,
        mainChecklist: payload.mainChecklist ?? {},
        selectedLanes: Array.isArray(payload.selectedLanes) ? payload.selectedLanes : [],
        values: payload.values ?? {},
        tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
      },
      creada: false,
    }
  }

  const seed = await templateSeed(userId)
  const now = new Date().toISOString()
  const payload: SpiSessionPayload = {
    id: `spi${week.replace(/-/g, '')}`,
    weekStartDate: week,
    createdAt: now,
    updatedAt: now,
    mainChecklist: seed.mainChecklist,
    selectedLanes: [],
    values: {},
    tasks: [],
    templateVersion: seed.version,
  }
  const { error: insErr } = await sb.from('spi_sessions').insert({
    id: payload.id, user_id: userId, week_start_date: week,
    created_at: now, updated_at: now, closed_at: null, payload,
  })
  if (insErr) return { ok: false, error: 'db_error', detail: insErr.message }
  return { row: { id: payload.id }, payload, creada: true }
}

/** Persiste el payload bumpeando `updatedAt` en los dos lados (BASE nº1). */
async function saveWeek(userId: string, rowId: string, payload: SpiSessionPayload): Promise<string | null> {
  const sb = getSupabaseAdmin()
  const now = new Date().toISOString()
  payload.updatedAt = now
  const { error } = await sb.from('spi_sessions')
    .update({ updated_at: now, week_start_date: payload.weekStartDate, payload })
    .eq('id', rowId).eq('user_id', userId)
  return error ? error.message : null
}

function isWriteResult(x: LoadedWeek | WriteResult): x is WriteResult {
  return 'ok' in x
}

function resumen(p: SpiSessionPayload) {
  return {
    id: p.id,
    semana: p.weekStartDate,
    carriles: p.selectedLanes,
    kpisEncendidos: p.selectedKpiIds ?? [],
    tareas: p.tasks.map((t) => ({ id: t.id, title: t.title, important: t.important, dueDate: t.dueDate })),
    camposCargados: Object.keys(p.values ?? {}).length,
    cerrada: !!p.closedAt,
  }
}

// ---------------------------------------------------------------------------
// ensure_spi_week
// ---------------------------------------------------------------------------

export async function ensureSpiWeek(userId: string, input: Record<string, unknown>): Promise<WriteResult> {
  const w = resolveWeek(input)
  if ('error' in w) return w.error
  const loaded = await loadOrCreateWeek(userId, w.week)
  if (isWriteResult(loaded)) return loaded
  return {
    ok: true,
    creada: loaded.creada,
    sesion: resumen(loaded.payload),
    detail: loaded.creada
      ? `Sesión SPI creada para la semana del sábado ${w.week}.`
      : `Ya existía la sesión de la semana del sábado ${w.week}; no se duplicó.`,
  }
}

// ---------------------------------------------------------------------------
// update_spi_week — carriles, KPIs encendidos, respuestas y checklist
// ---------------------------------------------------------------------------

export async function updateSpiWeek(userId: string, input: Record<string, unknown>): Promise<WriteResult> {
  const w = resolveWeek(input)
  if ('error' in w) return w.error
  const loaded = await loadOrCreateWeek(userId, w.week)
  if (isWriteResult(loaded)) return loaded

  const p = loaded.payload
  const cambios: string[] = []
  const warnings: string[] = []

  if (p.closedAt) {
    return {
      ok: false, error: 'semana_cerrada',
      // ⚠️ NO existe `reopenSession` en `spiStore` (sí en projectionStore y
      // labStore). `closedAt` en una sesión de SPI es un bit de una sola vía:
      // ni el bridge ni la app lo pueden sacar. Decir "abrila desde la app"
      // sería mandarlo a buscar un botón que no existe.
      detail: `La semana del ${w.week} ya está cerrada (${p.closedAt}) y una sesión de SPI cerrada NO se puede reabrir — ni desde acá ni desde la app. Lo que sí se puede es cargar la semana SIGUIENTE (ensure_spi_week con el sábado que corresponda).`,
    }
  }

  // ── carriles ─────────────────────────────────────────────────────────
  if (input.lanes !== undefined) {
    if (!Array.isArray(input.lanes)) return { ok: false, error: 'bad_lanes', detail: '`lanes` tiene que ser un array de strings.' }
    const lanes = input.lanes.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim())
    p.selectedLanes = input.replaceLanes === true ? lanes : [...new Set([...p.selectedLanes, ...lanes])]
    cambios.push('selectedLanes')
  }

  // ── KPIs encendidos para la semana ───────────────────────────────────
  if (input.kpiIds !== undefined) {
    if (!Array.isArray(input.kpiIds)) return { ok: false, error: 'bad_kpis', detail: '`kpiIds` tiene que ser un array de ids.' }
    const pedidos = input.kpiIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim())

    // Un KPI encendido que no existe en la biblioteca no se rendea: el
    // scoreboard busca la definición por id. Falla ruidoso (BASE nº6).
    const sb = getSupabaseAdmin()
    const { data: defs } = await sb.from('kpis').select('id').eq('user_id', userId)
    const existen = new Set((defs ?? []).map((d) => d.id as string))
    const fantasmas = pedidos.filter((id) => !existen.has(id))
    if (fantasmas.length > 0) {
      return {
        ok: false, error: 'kpi_inexistente',
        detail: `Estos KPIs no existen en la biblioteca, así que no se renderearían: ${fantasmas.join(', ')}. Crealos primero con upsert_kpi.`,
      }
    }
    const previos = p.selectedKpiIds ?? []
    p.selectedKpiIds = input.replaceKpis === true ? pedidos : [...new Set([...previos, ...pedidos])]
    cambios.push('selectedKpiIds')
  }

  // ── respuestas del formulario: values[sección][campo] = string ───────
  if (input.values !== undefined) {
    const v = input.values
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      return { ok: false, error: 'bad_values', detail: '`values` es un objeto {sección: {campo: "texto"}}.' }
    }
    for (const [sec, campos] of Object.entries(v as Record<string, unknown>)) {
      if (typeof campos !== 'object' || campos === null || Array.isArray(campos)) {
        warnings.push(`Sección "${sec}" ignorada: su valor tiene que ser un objeto {campo: texto}.`)
        continue
      }
      p.values[sec] = p.values[sec] ?? {}
      for (const [campo, valor] of Object.entries(campos as Record<string, unknown>)) {
        p.values[sec][campo] = valor === null || valor === undefined ? '' : String(valor).slice(0, 5000)
      }
    }
    cambios.push('values')
  }

  // ── checklist principal ──────────────────────────────────────────────
  if (input.mainChecklist !== undefined) {
    const c = input.mainChecklist
    if (typeof c !== 'object' || c === null || Array.isArray(c)) {
      return { ok: false, error: 'bad_checklist', detail: '`mainChecklist` es un objeto {clave: true|false}.' }
    }
    for (const [k, val] of Object.entries(c as Record<string, unknown>)) p.mainChecklist[k] = !!val
    cambios.push('mainChecklist')
  }

  if (typeof input.notes === 'string') { p.notes = input.notes.slice(0, 5000); cambios.push('notes') }

  if (cambios.length === 0) {
    return { ok: false, error: 'nothing_to_do', detail: 'No mandaste ningún campo para cambiar.', warnings }
  }

  const err = await saveWeek(userId, loaded.row.id, p)
  if (err) return { ok: false, error: 'db_error', detail: err }

  return { ok: true, cambios, sesion: resumen(p), ...(warnings.length > 0 ? { warnings } : {}) }
}

// ---------------------------------------------------------------------------
// set_spi_tasks — las tareas del ritual
// ---------------------------------------------------------------------------

/** Agrega / edita / quita SPITasks de la semana.
 *
 *  ⚠️ Ojo con `remove`: las tareas del SPI que YA se empujaron al task manager
 *  (tienen `linkedTaskId`) dejan la tarea real viva; sacarlas de acá solo corta
 *  el vínculo. Se avisa en la respuesta en vez de borrar en silencio. */
export async function setSpiTasks(userId: string, input: Record<string, unknown>): Promise<WriteResult> {
  const w = resolveWeek(input)
  if ('error' in w) return w.error
  const loaded = await loadOrCreateWeek(userId, w.week)
  if (isWriteResult(loaded)) return loaded

  const p = loaded.payload
  if (p.closedAt) {
    return { ok: false, error: 'semana_cerrada', detail: `La semana del ${w.week} ya está cerrada. Las tareas ya se contabilizaron.` }
  }

  const agregadas: string[] = []
  const editadas: string[] = []
  const quitadas: string[] = []
  const warnings: string[] = []

  // ── add ──────────────────────────────────────────────────────────────
  if (input.add !== undefined) {
    if (!Array.isArray(input.add)) return { ok: false, error: 'bad_add', detail: '`add` tiene que ser un array.' }
    for (const raw of input.add) {
      const t = (typeof raw === 'string' ? { title: raw } : raw) as Record<string, unknown>
      const title = typeof t?.title === 'string' ? t.title.trim() : ''
      if (!title) { warnings.push('Una tarea sin título se descartó.'); continue }

      if (t.dueDate !== undefined && t.dueDate !== null && !isYmd(t.dueDate)) {
        return { ok: false, error: 'bad_date', detail: `"${title}": \`dueDate\` tiene que ser YYYY-MM-DD.` }
      }
      // Duplicado por título: el ritual se llena de copias si se re-corre.
      if (p.tasks.some((x) => x.title.trim().toLowerCase() === title.toLowerCase())) {
        warnings.push(`"${title}" ya estaba en la semana; no se duplicó.`)
        continue
      }
      const task: SpiTask = {
        id: bridgeId('spit'),
        title: title.slice(0, 500),
        important: t.important === true,
        ...(t.priority === true ? { priority: true } : {}),
        ...(typeof t.dueDate === 'string' ? { dueDate: t.dueDate } : {}),
        ...(typeof t.whyPurpose === 'string' && t.whyPurpose.trim()
          ? { whyPurpose: t.whyPurpose.trim().slice(0, 1000) } : {}),
      }
      p.tasks.push(task)
      agregadas.push(task.title)
    }
  }

  // ── update ───────────────────────────────────────────────────────────
  if (input.update !== undefined) {
    if (!Array.isArray(input.update)) return { ok: false, error: 'bad_update', detail: '`update` tiene que ser un array de {taskId, ...campos}.' }
    for (const raw of input.update) {
      const u = raw as Record<string, unknown>
      const id = typeof u?.taskId === 'string' ? u.taskId.trim() : ''
      const hit = p.tasks.find((x) => x.id === id)
      if (!hit) { warnings.push(`No existe la tarea de SPI ${id || '(sin id)'}.`); continue }
      if (typeof u.title === 'string' && u.title.trim()) hit.title = u.title.trim().slice(0, 500)
      if (typeof u.important === 'boolean') hit.important = u.important
      if (typeof u.priority === 'boolean') hit.priority = u.priority
      if (typeof u.whyPurpose === 'string') hit.whyPurpose = u.whyPurpose.trim().slice(0, 1000)
      if (u.dueDate !== undefined) {
        if (u.dueDate === null) delete hit.dueDate
        else if (!isYmd(u.dueDate)) return { ok: false, error: 'bad_date', detail: `"${hit.title}": \`dueDate\` tiene que ser YYYY-MM-DD.` }
        else hit.dueDate = u.dueDate
      }
      // Un campo que no existe se ignoraba EN SILENCIO y la respuesta decia
      // "editada" igual (BASE nº6). Paso real: se intento mandar `done`, que
      // no existe en SPITask — las tareas del SPI son el PLAN de la semana, no
      // un checklist; se completan recien cuando el cierre las empuja al task
      // manager. Devolver ok sin tocar nada hace creer que quedo guardado.
      const CONOCIDOS = new Set(['taskId', 'title', 'important', 'priority', 'whyPurpose', 'dueDate'])
      const ignorados = Object.keys(u).filter((k) => !CONOCIDOS.has(k))
      if (ignorados.length > 0) {
        warnings.push(
          `"${hit.title}": estos campos NO existen en una tarea del SPI y no se guardaron: ${ignorados.join(', ')}. ` +
          `Los validos son ${[...CONOCIDOS].filter((k) => k !== 'taskId').join(', ')}. ` +
          'Ojo con `done`: las tareas del SPI no tienen estado de completado — se completan en el task manager despues del cierre semanal.',
        )
      }
      editadas.push(hit.title)
    }
  }

  // ── remove ───────────────────────────────────────────────────────────
  if (input.remove !== undefined) {
    if (!Array.isArray(input.remove)) return { ok: false, error: 'bad_remove', detail: '`remove` tiene que ser un array de ids.' }
    const ids = new Set(input.remove.filter((x): x is string => typeof x === 'string'))
    for (const t of p.tasks) {
      if (!ids.has(t.id)) continue
      if (t.linkedTaskId) {
        warnings.push(`"${t.title}" ya estaba empujada al task manager: se saca del SPI pero la tarea real sigue viva (${t.linkedTaskId}).`)
      }
      quitadas.push(t.title)
    }
    p.tasks = p.tasks.filter((t) => !ids.has(t.id))
  }

  if (agregadas.length + editadas.length + quitadas.length === 0) {
    return { ok: false, error: 'nothing_to_do', detail: 'No se agregó, editó ni quitó nada.', warnings }
  }

  const err = await saveWeek(userId, loaded.row.id, p)
  if (err) return { ok: false, error: 'db_error', detail: err }

  return {
    ok: true, agregadas, editadas, quitadas,
    sesion: resumen(p),
    ...(warnings.length > 0 ? { warnings } : {}),
  }
}

// ---------------------------------------------------------------------------
// upsert_kpi — la biblioteca de KPIs
// ---------------------------------------------------------------------------

const KPI_KINDS = new Set(['count', 'percent', 'boolean'])

/** Crea o edita una definición de KPI. Los KPIs se DEFINEN una vez acá y se
 *  ENCIENDEN por semana con `update_spi_week`.
 *
 *  `activatedAt` importa: una sesión cuyo `weekStartDate` sea anterior NO
 *  rendea el KPI. Un KPI nuevo no aparece retroactivamente — por eso al crear
 *  se ancla a la semana en curso, no a hoy. */
export async function upsertKpi(userId: string, input: Record<string, unknown>): Promise<WriteResult> {
  const sb = getSupabaseAdmin()
  const now = new Date().toISOString()
  const id = typeof input.kpiId === 'string' ? input.kpiId.trim() : ''

  let previo: Record<string, unknown> | null = null
  if (id) {
    const { data, error } = await sb.from('kpis').select('payload').eq('id', id).eq('user_id', userId).maybeSingle()
    if (error) return { ok: false, error: 'db_error', detail: error.message }
    if (!data) return { ok: false, error: 'not_found', detail: `No existe el KPI ${id} en esta cuenta.` }
    previo = (data.payload ?? {}) as Record<string, unknown>
  }

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!previo && !name) return { ok: false, error: 'bad_input', detail: 'Un KPI nuevo necesita `name`.' }

  const kind = typeof input.kind === 'string' ? input.kind.trim() : (previo?.kind as string) ?? 'count'
  if (!KPI_KINDS.has(kind)) {
    return { ok: false, error: 'bad_kind', detail: `\`kind\` tiene que ser count | percent | boolean; llegó "${kind}".` }
  }

  if (input.target !== undefined && input.target !== null) {
    const n = Number(input.target)
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'bad_target', detail: '`target` tiene que ser un número >= 0.' }
    if (kind === 'percent' && n > 100) return { ok: false, error: 'bad_target', detail: 'Un KPI `percent` no puede tener target > 100.' }
  }

  const payload: Record<string, unknown> = {
    ...(previo ?? {}),
    id: id || bridgeId('kpi'),
    name: name || (previo?.name as string),
    icon: typeof input.icon === 'string' && input.icon ? input.icon : (previo?.icon as string) ?? '📊',
    color: typeof input.color === 'string' && input.color ? input.color : (previo?.color as string) ?? '#6366f1',
    kind,
    createdAt: (previo?.createdAt as string) ?? now,
    // Un KPI nuevo cuenta desde la semana EN CURSO, no desde hoy: si no, la
    // sesión del sábado (anterior a hoy) no lo renderea y "no aparece".
    activatedAt: (previo?.activatedAt as string) ?? lastSaturdayYmd(),
    updatedAt: now,
  }
  if (input.target !== undefined) {
    if (input.target === null) delete payload.target
    else payload.target = Number(input.target)
  }
  if (typeof input.group === 'string') payload.group = input.group.trim().slice(0, 60)
  if (typeof input.areaKey === 'string') payload.areaKey = input.areaKey.trim().slice(0, 60)
  if (input.cumulativeTarget !== undefined) {
    if (input.cumulativeTarget === null) delete payload.cumulativeTarget
    else {
      const n = Number(input.cumulativeTarget)
      if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'bad_target', detail: '`cumulativeTarget` tiene que ser un número > 0.' }
      if (kind !== 'count') return { ok: false, error: 'bad_target', detail: 'La meta acumulada solo aplica a KPIs `count`.' }
      payload.cumulativeTarget = n
      payload.cumulativeStartDate = isYmd(input.cumulativeStartDate) ? input.cumulativeStartDate : lastSaturdayYmd()
      if (isYmd(input.cumulativeDeadline)) payload.cumulativeDeadline = input.cumulativeDeadline
    }
  }
  if (input.archived === true) payload.archivedAt = now
  if (input.archived === false) delete payload.archivedAt

  const { error } = await sb.from('kpis').upsert({
    id: payload.id as string, user_id: userId, payload,
    created_at: payload.createdAt as string, updated_at: now,
  })
  if (error) return { ok: false, error: 'db_error', detail: error.message }

  return { ok: true, creado: !previo, kpi: payload }
}

// ---------------------------------------------------------------------------
// set_kpi_value — cargar el número de la semana
// ---------------------------------------------------------------------------

/** Los valores semanales viven DENTRO de la sesión, en `values.kpis[kpiId]`
 *  (y los overrides de target en `values.kpiTargets[kpiId]`). Siempre string,
 *  alineado con el resto de `values`. */
export async function setKpiValue(userId: string, input: Record<string, unknown>): Promise<WriteResult> {
  const w = resolveWeek(input)
  if ('error' in w) return w.error
  const kpiId = typeof input.kpiId === 'string' ? input.kpiId.trim() : ''
  if (!kpiId) return { ok: false, error: 'bad_input', detail: 'Falta `kpiId`.' }
  if (input.value === undefined) return { ok: false, error: 'bad_input', detail: 'Falta `value`.' }

  const loaded = await loadOrCreateWeek(userId, w.week)
  if (isWriteResult(loaded)) return loaded
  const p = loaded.payload

  if (!(p.selectedKpiIds ?? []).includes(kpiId)) {
    return {
      ok: false, error: 'kpi_apagado',
      detail: `El KPI ${kpiId} no está encendido en la semana del ${w.week}, así que el valor no se vería. Encendelo primero con update_spi_week.`,
    }
  }

  p.values.kpis = p.values.kpis ?? {}
  p.values.kpis[kpiId] = String(input.value).slice(0, 100)

  const err = await saveWeek(userId, loaded.row.id, p)
  if (err) return { ok: false, error: 'db_error', detail: err }
  return { ok: true, semana: w.week, kpiId, valor: p.values.kpis[kpiId] }
}

// ─── EL TEMPLATE DEL SPI (las preguntas) ────────────────────────────────────
//
// El formulario del SPI NO es `lib/spi/template.ts`: ese es el default con el
// que arranca una cuenta nueva (y lo que restaura "resetear"). La plantilla
// que el usuario VE vive en su fila `spi_template` (payload jsonb + version),
// y el pull la trae solo si la versión remota es MAYOR que la local. Editar
// el archivo no le cambia nada a una cuenta que ya existe — así se perdió el
// cambio de "próximos 90 días" a "7 días", y la reformulación del 05/09 de
// "¿qué detalles no estoy viendo?" nunca llegó a la app.
//
// Es una fila-blob: se lee, se cambia SOLO el campo pedido y se escribe con
// version+1 (BASE nº3). Nunca se reemplaza el payload entero desde acá.

interface TplField { key: string; label?: string; hint?: string; type?: string; [k: string]: unknown }
interface TplSection { key: string; title?: string; intro?: string; laneKey?: string; fields?: TplField[]; [k: string]: unknown }
interface TplPayload { version?: number; sections?: TplSection[]; [k: string]: unknown }

async function loadTemplate(userId: string): Promise<{ payload: TplPayload; version: number; existe: boolean }> {
  const sb = getSupabaseAdmin()
  const { data } = await sb.from('spi_template').select('payload, version').eq('user_id', userId).maybeSingle()
  if (data?.payload) {
    return { payload: data.payload as TplPayload, version: (data.version as number) ?? 0, existe: true }
  }
  // Sin fila propia la app está usando el default empaquetado: se parte de ahí.
  const { DEFAULT_SPI_TEMPLATE } = await import('@/lib/spi/template')
  const tpl = DEFAULT_SPI_TEMPLATE as unknown as TplPayload
  return { payload: tpl, version: tpl.version ?? 0, existe: false }
}

export async function getSpiTemplate(userId: string): Promise<WriteResult> {
  const { payload, version, existe } = await loadTemplate(userId)
  return {
    ok: true,
    version,
    origen: existe ? 'fila propia (spi_template)' : 'default empaquetado (la cuenta no tiene fila propia todavía)',
    secciones: (payload.sections ?? []).map((s) => ({
      key: s.key,
      carril: s.laneKey,
      titulo: s.title,
      intro: s.intro,
      campos: (s.fields ?? []).map((f) => ({ key: f.key, label: f.label, hint: f.hint, type: f.type })),
    })),
  }
}

/** Edita títulos, intros, labels o hints por clave. Cada cambio nombra la
 *  sección (y el campo, si aplica) y solo las propiedades que trae. */
export async function updateSpiTemplate(userId: string, input: { cambios?: unknown }): Promise<WriteResult> {
  const cambios = Array.isArray(input.cambios) ? input.cambios as Record<string, unknown>[] : []
  if (!cambios.length) return { ok: false, error: 'bad_input', detail: 'Falta `cambios` (array de {seccion, campo?, titulo?, intro?, label?, hint?}).' }

  const { payload, version } = await loadTemplate(userId)
  const sections = payload.sections ?? []
  const aplicados: string[] = []

  for (const c of cambios) {
    const sec = sections.find((s) => s.key === String(c.seccion ?? ''))
    if (!sec) return { ok: false, error: 'not_found', detail: `No existe la sección "${String(c.seccion)}". Las que hay: ${sections.map((s) => s.key).join(', ')}.` }
    if (c.nuevoCampo && typeof c.nuevoCampo === 'object') {
      const nc = c.nuevoCampo as Record<string, unknown>
      const key = String(nc.key ?? '').trim()
      if (!key || !/^[a-z0-9_]+$/.test(key)) return { ok: false, error: 'bad_input', detail: 'nuevoCampo.key tiene que ser snake_case (a-z, 0-9, _).' }
      if ((sec.fields ?? []).some((x) => x.key === key)) return { ok: false, error: 'bad_input', detail: `La sección "${sec.key}" ya tiene un campo "${key}".` }
      if (typeof nc.label !== 'string' || !nc.label.trim()) return { ok: false, error: 'bad_input', detail: 'nuevoCampo.label es obligatorio.' }
      const tipo = typeof nc.type === 'string' ? nc.type : 'textarea'
      if (!['text', 'textarea'].includes(tipo)) return { ok: false, error: 'bad_input', detail: 'nuevoCampo.type: text o textarea (los otros tipos necesitan config que esta tool no maneja).' }
      const campo: TplField = { key, label: nc.label, type: tipo, ...(typeof nc.hint === 'string' ? { hint: nc.hint } : {}) }
      sec.fields ??= []
      if (c.posicion === 'inicio') sec.fields.unshift(campo); else sec.fields.push(campo)
      aplicados.push(`${sec.key}.${key} (nuevo)`)
      continue
    }
    if (c.campo) {
      const f = (sec.fields ?? []).find((x) => x.key === String(c.campo))
      if (!f) return { ok: false, error: 'not_found', detail: `La sección "${sec.key}" no tiene el campo "${String(c.campo)}". Tiene: ${(sec.fields ?? []).map((x) => x.key).join(', ')}.` }
      if (typeof c.label === 'string') f.label = c.label
      if (typeof c.hint === 'string') f.hint = c.hint
      aplicados.push(`${sec.key}.${f.key}`)
    } else {
      if (typeof c.titulo === 'string') sec.title = c.titulo
      if (typeof c.intro === 'string') sec.intro = c.intro
      aplicados.push(sec.key)
    }
  }

  const nueva = version + 1
  const sb = getSupabaseAdmin()
  const { error } = await sb.from('spi_template').upsert(
    { user_id: userId, payload: { ...payload, version: nueva }, version: nueva, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  if (error) return { ok: false, error: 'db_error', detail: `${error.message} — ¿falta correr migration_spi_template.sql?` }
  return { ok: true, version: nueva, aplicados, aviso: 'Los dispositivos lo traen en el próximo pull (versión mayor gana). Las semanas ya creadas muestran las preguntas nuevas: el formulario lee el template vivo.' }
}
