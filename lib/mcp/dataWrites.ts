/** ABM genérico de los dominios "per-fila con payload jsonb".
 *
 *  Journal, Meditaciones, YouTube y Laboratorio guardan cada entidad como una
 *  fila `{ id, user_id, created_at, updated_at, payload jsonb }`. Escribir cada
 *  uno a mano sería el mismo archivo cuatro veces, así que acá va el motor y
 *  abajo el registro de dominios.
 *
 *  ⚠️ LA TRAMPA CENTRAL, y es la razón por la que este archivo lista campos a
 *  mano en vez de aceptar cualquier JSON: **el pull del cliente reconstruye
 *  cada objeto campo por campo** (`sanitize` en sync.ts). Un campo que no esté
 *  en esa lista **se borra en el próximo sync**, aunque se haya guardado bien.
 *  Es la BASE nº2 del proyecto y ya costó datos tres veces.
 *
 *  Por eso cada dominio declara `campos`: son EXACTAMENTE los que el sanitize
 *  del pull preserva. Lo que venga de más se descarta acá y se avisa, en vez
 *  de guardarse para desaparecer en silencio.
 *
 *  Los otros dos cuidados, iguales al resto del bridge:
 *  - **`updated_at` en la columna Y en el payload.** El merge del pull es LWW
 *    sobre el `updatedAt` del payload; la columna es para el staleGuard.
 *  - **Tombstone ANTES del delete.** Si se borra sin tombstone, el primer
 *    dispositivo que todavía tenga la fila la vuelve a subir.
 *
 *  NO cubre todavía: Salud, Comida, Trading (la sección), Estudio y Content
 *  Strategy. Los tres primeros usan columnas reales en vez de payload y
 *  necesitan su propio mapeo; los otros dos son árboles con varias tablas
 *  relacionadas. Ver `project_state.md`.
 *
 *  ⚠️ MAPAS MENTALES — el push del cliente NO tiene staleGuard. `pushMindMaps`
 *  sube el store entero con un upsert ciego, así que una pestaña abierta con
 *  la copia vieja en memoria puede DESHACER lo que se escriba desde acá (es
 *  el mismo bug que ya pasó cuatro veces en un día con las tareas, y por eso
 *  existe `staleGuard.ts` — pero nunca se aplicó a este dominio).
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import type { WriteResult } from './writes'

interface Dominio {
  /** Cómo lo nombra el usuario. */
  etiqueta: string
  tabla: string
  /** Campos que el `sanitize` del pull preserva. Lo que no esté acá se pierde. */
  campos: string[]
  /** Campos sin los cuales la fila no sirve para nada. */
  requeridos: string[]
  /** Valores por defecto al crear. */
  defaults?: Record<string, unknown>
  /** Columnas reales además de id/updated_at, derivadas del payload. */
  columnas?: (p: Record<string, unknown>) => Record<string, unknown>
  /** Validaciones propias del dominio. Devuelve el error o null. */
  validar?: (p: Record<string, unknown>) => string | null
  /** Guardas que necesitan LEER la base (p. ej. si la carpeta esta bloqueada).
   *  `validar` es sincrono y no alcanza para eso. Devuelve el error o null. */
  guardEscritura?: (ctx: GuardCtx) => Promise<string | null>
  guardBorrado?: (ctx: GuardBorradoCtx) => Promise<string | null>
  /** Cascadas que el store hace en el cliente y el server tiene que espejar. */
  trasBorrar?: (ctx: GuardBorradoCtx) => Promise<void>
}

type SB = ReturnType<typeof getSupabaseAdmin>
interface GuardCtx {
  sb: SB
  userId: string
  id: string | null
  previo: Record<string, unknown> | null
  payload: Record<string, unknown>
}
interface GuardBorradoCtx {
  sb: SB
  userId: string
  ids: string[]
  filas: { id: string; payload: Record<string, unknown> }[]
}

/** Las carpetas `locked` son del SISTEMA: un modulo se aduena de ellas (el mapa
 *  de conceptos de Estudio, los perfiles de Content Strategy) y sus mapas no se
 *  pueden mover ni borrar. El store lo hace cumplir en el cliente; si el server
 *  no lo hiciera, el bridge seria la unica puerta capaz de romper el invariante. */
async function carpetasBloqueadas(sb: SB, userId: string): Promise<Set<string>> {
  const { data } = await sb.from('mindmap_folders').select('id, payload').eq('user_id', userId)
  const out = new Set<string>()
  for (const f of data ?? []) {
    if ((f.payload as Record<string, unknown> | null)?.locked) out.add(f.id as string)
  }
  return out
}

const DOMINIOS: Record<string, Dominio> = {
  journal: {
    etiqueta: 'Journal',
    tabla: 'journal_entries',
    campos: ['id', 'date', 'title', 'body', 'createdAt', 'updatedAt'],
    requeridos: ['body'],
    defaults: { title: '', body: '' },
    columnas: (p) => ({ entry_date: p.date }),
  },
  meditaciones: {
    etiqueta: 'Meditaciones',
    tabla: 'meditation_entries',
    campos: ['id', 'title', 'script', 'category', 'favorite', 'audioUrl', 'createdAt', 'updatedAt'],
    requeridos: ['title'],
    defaults: { title: '', script: '', category: 'Respiración', favorite: false },
  },
  youtube: {
    etiqueta: 'YouTube',
    tabla: 'youtube_items',
    campos: ['id', 'title', 'url', 'videoId', 'status', 'category', 'notes', 'favorite', 'createdAt', 'updatedAt', 'completedAt'],
    requeridos: ['title'],
    defaults: { title: '', url: '', videoId: null, status: 'backlog', category: 'General', favorite: false },
    validar: (p) => {
      const s = p.status
      if (s !== undefined && s !== 'backlog' && s !== 'watching' && s !== 'done') {
        // El pull degrada cualquier otro valor a 'backlog' en silencio: mejor
        // fallar acá que dejar el item en una columna que el usuario no pidió.
        return `status inválido: "${String(s)}". Los válidos son backlog, watching, done.`
      }
      return null
    },
  },
  laboratorio: {
    etiqueta: 'Laboratorio (sesiones)',
    tabla: 'lab_sessions',
    campos: ['id', 'exerciseKey', 'categoryKey', 'title', 'status', 'createdAt', 'updatedAt', 'closedAt', 'values', 'outcome', 'spiSessionId', 'linkedBeliefId'],
    requeridos: ['title'],
    defaults: { title: 'Sesión', status: 'open', values: {}, exerciseKey: '', categoryKey: '' },
    columnas: (p) => ({
      exercise_key: p.exerciseKey ?? '',
      category_key: p.categoryKey ?? '',
      status: p.status ?? 'open',
      closed_at: p.closedAt ?? null,
      spi_session_id: p.spiSessionId ?? null,
    }),
    validar: (p) => {
      const s = p.status
      if (s !== undefined && s !== 'open' && s !== 'closed' && s !== 'archived') {
        // La columna tiene un CHECK: un valor raro hace fallar el insert entero.
        return `status inválido: "${String(s)}". Los válidos son open, closed, archived.`
      }
      return null
    },
  },
  mapas: {
    etiqueta: 'Mapas mentales',
    tabla: 'mindmaps',
    // Exactamente lo que preserva el `sanitize` de pullMindMaps (BASE nº2).
    campos: ['id', 'title', 'folderId', 'nodes', 'edges', 'shapes', 'createdAt', 'updatedAt'],
    requeridos: ['title'],
    defaults: { title: 'Mapa', nodes: [], edges: [], shapes: [] },
    columnas: (p) => ({ title: p.title ?? 'Mapa' }),
    validar: (p) => {
      // Un nodo sin geometria no se dibuja donde uno cree: `x/y/width/height`
      // son obligatorios en MindMapNode y el lienzo no los infiere. Si se
      // escriben nodos a medias, el mapa queda apilado en el origen — un
      // fallo mudo, que es justo lo que no queremos (BASE nº6).
      const ns = p.nodes
      if (ns !== undefined) {
        if (!Array.isArray(ns)) return '`nodes` tiene que ser un array.'
        const malos = ns.filter((n) => {
          const o = (n ?? {}) as Record<string, unknown>
          return ['id', 'x', 'y', 'width', 'height', 'text'].some((k) =>
            o[k] === undefined || (k !== 'id' && k !== 'text' && typeof o[k] !== 'number'))
        })
        if (malos.length) {
          return `${malos.length} nodo(s) sin geometria completa. Cada nodo necesita id, x, y, width, height y text (los cuatro del medio, numeros). ` +
            'Sin eso se apilan todos en el origen y el mapa queda ilegible.'
        }
      }
      if (p.edges !== undefined && !Array.isArray(p.edges)) return '`edges` tiene que ser un array.'
      if (p.shapes !== undefined && !Array.isArray(p.shapes)) return '`shapes` tiene que ser un array.'
      return null
    },
    guardEscritura: async ({ sb, userId, previo, payload }) => {
      const bloq = await carpetasBloqueadas(sb, userId)
      const antes = (previo?.folderId as string | undefined) ?? null
      const despues = (payload.folderId as string | undefined) ?? null
      if (antes !== despues && antes && bloq.has(antes)) {
        return `Ese mapa vive en una carpeta BLOQUEADA (${antes}) y no se puede sacar de ahi. ` +
          'Las carpetas bloqueadas son de un modulo (Estudio, Content Strategy): sus mapas se generan solos y moverlos los rompe.'
      }
      if (despues && !antes && bloq.has(despues)) {
        return `No se puede meter un mapa a mano en la carpeta bloqueada ${despues}: esa carpeta la llena su modulo.`
      }
      return null
    },
    guardBorrado: async ({ sb, userId, filas }) => {
      const bloq = await carpetasBloqueadas(sb, userId)
      const presos = filas.filter((f) => {
        const fid = f.payload?.folderId
        return typeof fid === 'string' && bloq.has(fid)
      })
      if (presos.length) {
        return `${presos.length} de esos mapas viven en una carpeta BLOQUEADA y los regenera su modulo: borrarlos no sirve (vuelven) y rompe el modulo. Ids: ${presos.map((p) => p.id).join(', ')}.`
      }
      return null
    },
  },
  carpetas: {
    etiqueta: 'Carpetas de mapas',
    tabla: 'mindmap_folders',
    campos: ['id', 'name', 'order', 'locked', 'createdAt', 'updatedAt'],
    requeridos: ['name'],
    defaults: { name: 'Carpeta', order: 0 },
    validar: (p) => {
      if (p.order !== undefined && typeof p.order !== 'number') return '`order` tiene que ser un numero (menor = mas a la izquierda).'
      // `locked` se lo pone un modulo al aduenarse de la carpeta. Que lo
      // ponga el bridge dejaria una carpeta que despues nadie puede tocar.
      if (p.locked !== undefined && p.locked !== false) {
        return '`locked` no se setea desde aca: lo pone el modulo que se aduena de la carpeta (Estudio, Content Strategy).'
      }
      return null
    },
    guardEscritura: async ({ previo, payload }) => {
      if (previo?.locked && payload.name !== previo.name) {
        return `La carpeta "${String(previo.name)}" esta BLOQUEADA (es de un modulo) y no se renombra.`
      }
      return null
    },
    guardBorrado: async ({ filas }) => {
      const bloq = filas.filter((f) => f.payload?.locked)
      if (bloq.length) {
        return `No se pueden borrar carpetas bloqueadas: ${bloq.map((f) => String(f.payload?.name ?? f.id)).join(', ')}. Son de un modulo y se regeneran solas.`
      }
      return null
    },
    // Espeja `deleteFolder` del store: los mapas NO se borran con la carpeta,
    // quedan sueltos y siguen visibles en General. Sin esto quedarian con un
    // `folderId` colgado apuntando a una carpeta que ya no existe.
    trasBorrar: async ({ sb, userId, ids }) => {
      const { data } = await sb.from('mindmaps').select('id, payload').eq('user_id', userId)
      const ahora = new Date().toISOString()
      const huerfanos = (data ?? []).filter((m) => {
        const fid = (m.payload as Record<string, unknown> | null)?.folderId
        return typeof fid === 'string' && ids.includes(fid)
      })
      for (const m of huerfanos) {
        const p = { ...(m.payload as Record<string, unknown>) }
        delete p.folderId
        p.updatedAt = ahora   // sin el bump, el merge LWW del pull lo revierte
        await sb.from('mindmaps').update({ payload: p, updated_at: ahora }).eq('id', m.id).eq('user_id', userId)
      }
    },
  },
}

export function dominiosDisponibles(): string[] {
  return Object.keys(DOMINIOS)
}

function resolver(nombre: unknown): { dom: Dominio; key: string } | { error: string } {
  const k = String(nombre ?? '').trim().toLowerCase()
  if (!k) return { error: `Falta \`dominio\`. Los disponibles: ${dominiosDisponibles().join(', ')}.` }
  const dom = DOMINIOS[k]
  if (!dom) {
    return { error: `Dominio desconocido: "${k}". Los disponibles: ${dominiosDisponibles().join(', ')}.` }
  }
  return { dom, key: k }
}

/** Id nuevo con el mismo formato que usa el bridge en el resto del proyecto. */
function nuevoId(prefijo: string): string {
  return prefijo + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

// ─── LECTURA ────────────────────────────────────────────────────────────────

export async function listRecords(
  userId: string,
  input: { dominio?: unknown; limit?: unknown; buscar?: unknown; id?: unknown },
): Promise<WriteResult> {
  const r = resolver(input.dominio)
  if ('error' in r) return { ok: false, error: 'bad_input', detail: r.error }
  const { dom } = r

  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from(dom.tabla)
    .select('id, payload, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(Math.min(Math.max(1, Number(input.limit) || 100), 500))
  if (error) {
    return {
      ok: false, error: 'db_error',
      detail: `${error.message} — ¿falta correr la migración de ${dom.etiqueta}?`,
    }
  }

  let filas = (data ?? []).map((row) => ({
    ...(row.payload as Record<string, unknown>),
    id: row.id as string,
  }))

  if (input.id) filas = filas.filter((f) => f.id === String(input.id))
  if (input.buscar) {
    const q = String(input.buscar).toLowerCase()
    filas = filas.filter((f) => JSON.stringify(f).toLowerCase().includes(q))
  }

  return { ok: true, dominio: dom.etiqueta, total: filas.length, registros: filas }
}

// ─── ALTA Y MODIFICACIÓN ────────────────────────────────────────────────────

export async function upsertRecord(
  userId: string,
  input: { dominio?: unknown; id?: unknown; datos?: unknown },
): Promise<WriteResult> {
  const r = resolver(input.dominio)
  if ('error' in r) return { ok: false, error: 'bad_input', detail: r.error }
  const { dom, key } = r

  const datos = (input.datos ?? {}) as Record<string, unknown>
  if (typeof datos !== 'object' || Array.isArray(datos)) {
    return { ok: false, error: 'bad_input', detail: 'Falta `datos` (objeto).' }
  }

  // Lo que no está en `campos` NO se guarda: el pull lo borraría igual, y una
  // escritura que desaparece sola es peor que un error (BASE nº2 + nº6).
  const ignorados = Object.keys(datos).filter((k) => !dom.campos.includes(k))
  const limpio: Record<string, unknown> = {}
  for (const c of dom.campos) if (datos[c] !== undefined) limpio[c] = datos[c]

  const sb = getSupabaseAdmin()
  const ahora = new Date().toISOString()
  const id = input.id ? String(input.id) : null

  let previo: Record<string, unknown> | null = null
  if (id) {
    const { data } = await sb.from(dom.tabla).select('payload').eq('id', id).eq('user_id', userId).maybeSingle()
    if (!data) {
      return { ok: false, error: 'not_found', detail: `No existe el registro ${id} en ${dom.etiqueta}.` }
    }
    previo = (data.payload ?? {}) as Record<string, unknown>
  }

  // Editar MERGEA sobre lo que había: mandar solo el campo que cambia no puede
  // borrar el resto del registro.
  const payload: Record<string, unknown> = {
    ...(previo ?? dom.defaults ?? {}),
    ...limpio,
    id: id ?? nuevoId(key.slice(0, 3) + '_'),
    createdAt: (previo?.createdAt as string) ?? ahora,
    updatedAt: ahora,
  }

  if (!previo) {
    const faltan = dom.requeridos.filter((c) => !payload[c])
    if (faltan.length) {
      return { ok: false, error: 'bad_input', detail: `Para crear en ${dom.etiqueta} falta: ${faltan.join(', ')}.` }
    }
  }

  const problema = dom.validar?.(payload)
  if (problema) return { ok: false, error: 'bad_input', detail: problema }

  const guarda = await dom.guardEscritura?.({ sb, userId, id, previo, payload })
  if (guarda) return { ok: false, error: 'bloqueado', detail: guarda }

  const fila: Record<string, unknown> = {
    id: payload.id,
    user_id: userId,
    payload,
    updated_at: ahora,
    ...(dom.columnas?.(payload) ?? {}),
  }
  if (!previo) fila.created_at = ahora

  const { error } = await sb.from(dom.tabla).upsert(fila, { onConflict: 'id' })
  if (error) {
    return {
      ok: false, error: 'db_error',
      detail: `${error.message} — ¿falta correr la migración de ${dom.etiqueta}?`,
    }
  }

  return {
    ok: true,
    dominio: dom.etiqueta,
    creado: !previo,
    id: payload.id,
    registro: payload,
    ...(ignorados.length ? {
      camposIgnorados: ignorados,
      avisoIgnorados:
        `Estos campos NO se guardaron porque el sync del cliente no los conserva y se borrarían en el próximo pull: ${ignorados.join(', ')}. ` +
        `Los que sí viajan en ${dom.etiqueta}: ${dom.campos.join(', ')}.`,
    } : {}),
  }
}

// ─── BAJA ───────────────────────────────────────────────────────────────────

export async function deleteRecords(
  userId: string,
  input: { dominio?: unknown; ids?: unknown },
): Promise<WriteResult> {
  const r = resolver(input.dominio)
  if ('error' in r) return { ok: false, error: 'bad_input', detail: r.error }
  const { dom } = r

  const raw = Array.isArray(input.ids) ? input.ids : []
  const ids = [...new Set(raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0))]
  if (!ids.length) return { ok: false, error: 'bad_input', detail: 'Falta `ids` (array no vacío).' }

  const sb = getSupabaseAdmin()
  const { data } = await sb.from(dom.tabla).select('id, payload').eq('user_id', userId).in('id', ids)
  const existen = (data ?? []).map((x) => x.id as string)
  if (!existen.length) {
    return { ok: false, error: 'not_found', detail: `Ninguno de esos ids existe en ${dom.etiqueta}.` }
  }

  const filas = (data ?? []).map((x) => ({
    id: x.id as string,
    payload: (x.payload ?? {}) as Record<string, unknown>,
  }))
  // La guarda va ANTES del tombstone: si se escribe el tombstone y despues se
  // aborta, la fila queda viva pero marcada como borrada y desaparece del
  // proximo pull. O se hace todo o no se toca nada.
  const veto = await dom.guardBorrado?.({ sb, userId, ids: existen, filas })
  if (veto) return { ok: false, error: 'bloqueado', detail: veto }

  // 1) Tombstones PRIMERO. Sin esto el borrado rebota: el primer dispositivo
  //    que todavía tenga la fila en memoria la vuelve a subir.
  const ahora = new Date().toISOString()
  const { error: tombErr } = await sb.from('deleted_rows').upsert(
    existen.map((id) => ({ user_id: userId, table_name: dom.tabla, row_id: id, deleted_at: ahora })),
    { onConflict: 'user_id,table_name,row_id' },
  )
  if (tombErr) {
    return {
      ok: false, error: 'tombstone_failed',
      detail: `No se escribieron los tombstones, así que NO se borró nada (habría rebotado desde otro dispositivo): ${tombErr.message}`,
    }
  }

  const { error } = await sb.from(dom.tabla).delete().in('id', existen).eq('user_id', userId)
  if (error) return { ok: false, error: 'db_error', detail: error.message }

  await dom.trasBorrar?.({ sb, userId, ids: existen, filas })

  const titulos = filas.map((f) =>
    String(f.payload.title ?? f.payload.name ?? f.payload.text ?? f.id).slice(0, 60))

  return {
    ok: true,
    dominio: dom.etiqueta,
    borrados: existen.length,
    titulos,
    ...(ids.length > existen.length ? { noExistian: ids.filter((i) => !existen.includes(i)) } : {}),
  }
}

// ─── CREENCIAS DEL LABORATORIO ──────────────────────────────────────────────
//
// `lab_beliefs` es la excepción del archivo: no guarda un payload jsonb, usa
// COLUMNAS REALES. Por eso no entra en el motor de arriba y va acá aparte.
//
// Es la otra mitad del Laboratorio: las sesiones trabajan sobre creencias, y
// `linkedSessionIds` es lo que después permite decir "trabajaste 2 reencuadres
// sobre esto".

const ESTADOS_CREENCIA = ['open', 'working', 'resolved'] as const

interface BeliefRow {
  id: string
  category_key: string
  text: string
  status: string
  created_at: string
  updated_at: string
  resolved_at: string | null
  insight: string | null
  linked_session_ids: string[] | null
}

const aBelief = (r: BeliefRow) => ({
  id: r.id,
  categoria: r.category_key,
  texto: r.text,
  estado: r.status,
  creada: r.created_at,
  actualizada: r.updated_at,
  resuelta: r.resolved_at ?? undefined,
  insight: r.insight ?? undefined,
  sesionesVinculadas: r.linked_session_ids ?? [],
})

export async function listBeliefs(
  userId: string,
  input: { estado?: unknown } = {},
): Promise<WriteResult> {
  const sb = getSupabaseAdmin()
  let q = sb.from('lab_beliefs').select('*').eq('user_id', userId).order('updated_at', { ascending: false })
  if (input.estado) q = q.eq('status', String(input.estado))
  const { data, error } = await q
  if (error) {
    return { ok: false, error: 'db_error', detail: `${error.message} — ¿falta correr migration_lab_beliefs.sql?` }
  }
  const creencias = ((data as BeliefRow[] | null) ?? []).map(aBelief)
  return {
    ok: true,
    total: creencias.length,
    porEstado: {
      open: creencias.filter((c) => c.estado === 'open').length,
      working: creencias.filter((c) => c.estado === 'working').length,
      resolved: creencias.filter((c) => c.estado === 'resolved').length,
    },
    creencias,
  }
}

export async function upsertBelief(
  userId: string,
  input: { id?: unknown; texto?: unknown; estado?: unknown; categoria?: unknown; insight?: unknown },
): Promise<WriteResult> {
  const sb = getSupabaseAdmin()
  const ahora = new Date().toISOString()
  const id = input.id ? String(input.id) : null

  const estado = input.estado ? String(input.estado) : undefined
  if (estado && !ESTADOS_CREENCIA.includes(estado as typeof ESTADOS_CREENCIA[number])) {
    // La columna tiene un CHECK: un valor raro hace fallar el insert entero.
    return {
      ok: false, error: 'bad_input',
      detail: `estado inválido: "${estado}". Los válidos son ${ESTADOS_CREENCIA.join(', ')}.`,
    }
  }

  let previo: BeliefRow | null = null
  if (id) {
    const { data } = await sb.from('lab_beliefs').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
    if (!data) return { ok: false, error: 'not_found', detail: `No existe la creencia ${id}.` }
    previo = data as BeliefRow
  }

  const texto = input.texto !== undefined ? String(input.texto).trim() : previo?.text
  if (!texto) return { ok: false, error: 'bad_input', detail: 'Falta `texto` (la creencia, en frase corta).' }

  const nuevoEstado = estado ?? previo?.status ?? 'open'
  const fila: Record<string, unknown> = {
    id: id ?? nuevoId('bel_'),
    user_id: userId,
    category_key: input.categoria !== undefined ? String(input.categoria) : (previo?.category_key ?? 'creencias'),
    text: texto,
    status: nuevoEstado,
    updated_at: ahora,
    created_at: previo?.created_at ?? ahora,
    insight: input.insight !== undefined ? String(input.insight) : (previo?.insight ?? null),
    linked_session_ids: previo?.linked_session_ids ?? [],
    // `resolvedAt` se pone solo al pasar a resolved, y se limpia si se reabre:
    // una creencia reabierta con fecha de resolución vieja miente en el historial.
    resolved_at: nuevoEstado === 'resolved' ? (previo?.resolved_at ?? ahora) : null,
  }

  const { error } = await sb.from('lab_beliefs').upsert(fila, { onConflict: 'id' })
  if (error) {
    return { ok: false, error: 'db_error', detail: `${error.message} — ¿falta correr migration_lab_beliefs.sql?` }
  }
  return { ok: true, creada: !previo, id: fila.id, creencia: aBelief(fila as unknown as BeliefRow) }
}

export async function deleteBeliefs(userId: string, input: { ids?: unknown }): Promise<WriteResult> {
  const raw = Array.isArray(input.ids) ? input.ids : []
  const ids = [...new Set(raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0))]
  if (!ids.length) return { ok: false, error: 'bad_input', detail: 'Falta `ids` (array no vacío).' }

  const sb = getSupabaseAdmin()
  const { data } = await sb.from('lab_beliefs').select('id, text').eq('user_id', userId).in('id', ids)
  const existen = (data ?? []).map((x) => x.id as string)
  if (!existen.length) return { ok: false, error: 'not_found', detail: 'Ninguno de esos ids existe.' }

  const ahora = new Date().toISOString()
  const { error: tombErr } = await sb.from('deleted_rows').upsert(
    existen.map((id) => ({ user_id: userId, table_name: 'lab_beliefs', row_id: id, deleted_at: ahora })),
    { onConflict: 'user_id,table_name,row_id' },
  )
  if (tombErr) {
    return {
      ok: false, error: 'tombstone_failed',
      detail: `No se escribieron los tombstones, así que NO se borró nada: ${tombErr.message}`,
    }
  }
  const { error } = await sb.from('lab_beliefs').delete().in('id', existen).eq('user_id', userId)
  if (error) return { ok: false, error: 'db_error', detail: error.message }

  return {
    ok: true,
    borradas: existen.length,
    textos: (data ?? []).map((x) => String(x.text).slice(0, 60)),
  }
}
