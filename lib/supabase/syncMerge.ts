'use client'
/**
 * Merge no-destructivo para el sync multi-device.
 *
 * El modelo viejo (`deleteSurplus` en sync.ts) replicaba el store local como
 * un snapshot y BORRABA de remoto toda fila ausente en local. Un device con
 * copia vieja que editaba algo borraba del cloud lo que otro device había
 * sumado → pérdida de datos.
 *
 * Acá vive la alternativa: un merge de 3 vías (local + remoto + baseline de
 * ids ya sincronizados) que nunca borra una fila salvo que el USER la haya
 * quitado a propósito (estaba en baseline y ya no está local). Ver
 * `syncTracking.ts` (getBaseline/setBaseline) para la semántica del baseline.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SPISession, SPITask } from '@/lib/spi/types'
import type { ProjectionPlan } from '@/lib/projection/types'
import type { LabSession } from '@/lib/lab/types'
import type { Habit } from '@/lib/store/habitsStore'
import type { ContentProfile, ContentBrandDNA, VisualStyleCategory } from '@/types/content'

// ─── mergeById: merge genérico de colecciones por id ────────────────────────

export interface MergeByIdOpts<T> {
  /** Estado local actual (lo que el device tiene en el store). */
  local: T[]
  /** Filas que vinieron de Supabase en este pull. */
  remote: T[]
  /** Ids que sabíamos sincronizados antes de este pull (getBaseline). */
  baseline: Set<string>
  getId: (item: T) => string
  /** Para resolver conflictos cuando un id existe en ambos lados y no se pasa
   *  `mergeItem`. Devolver un ISO string o número comparable. */
  getUpdatedAt?: (item: T) => string | number | undefined
  /** Merge fino cuando el id existe en ambos lados (ej: deep-merge de una
   *  sesión SPI). Si no se pasa, gana el de `getUpdatedAt` más reciente. */
  mergeItem?: (local: T, remote: T) => T
  /** Borrados globales propagados vía la tabla `deleted_rows`: id → deleted_at
   *  en ms. Una fila se descarta si su tombstone es MÁS NUEVO que su
   *  `updatedAt` (re-crearla con un updatedAt posterior la revive). Si se pasa
   *  este map, además se vuelve estricto el caso "solo en remoto pero ∈
   *  baseline" → borrado local pendiente, NO se resucita. Opt-in: sin este
   *  param el merge se comporta exactamente como antes. */
  tombstones?: Map<string, number>
}

/** Une local + remote por id, sin perder filas:
 *   - en ambos      → mergeItem(local, remote) | el más nuevo por updatedAt
 *   - solo remote   → se incluye (otro device la creó)
 *   - solo local    → se incluye SOLO si ∉ baseline (creada local, sin pushear).
 *                     Si ∈ baseline → fue borrada en otro device → se descarta.
 */
export function mergeById<T>(opts: MergeByIdOpts<T>): T[] {
  const { local, remote, baseline, getId, getUpdatedAt, mergeItem, tombstones } = opts

  const localById = new Map<string, T>()
  for (const it of local) localById.set(getId(it), it)
  const remoteById = new Map<string, T>()
  for (const it of remote) remoteById.set(getId(it), it)

  const updMs = (it: T): number => (getUpdatedAt ? toMs(getUpdatedAt(it)) : 0)
  // ¿La fila está muerta por un tombstone global más nuevo que su updatedAt?
  // Sin updatedAt (updMs=0) cualquier tombstone la mata — los ids son únicos,
  // así que un id viejo tombstoneado no se reusa salvo restore explícito.
  const tombDead = (it: T): boolean => {
    if (!tombstones) return false
    const ts = tombstones.get(getId(it))
    return ts !== undefined && ts > updMs(it)
  }

  // AUTO-HEAL: si el local está COMPLETAMENTE vacío pero el baseline tenía
  // filas, casi nunca es "el usuario borró todo" — es un store que no
  // rehidrató (localStorage lleno / wipe). En ese caso NO suprimimos las
  // filas remotas por baseline: las resucitamos desde la nube. Es el espejo,
  // del lado del pull, del blindaje anti-wipe de reconcileDeletes.
  const localWiped = local.length === 0 && baseline.size > 0

  const allIds = new Set<string>([...localById.keys(), ...remoteById.keys()])
  const merged: T[] = []
  for (const id of allIds) {
    const l = localById.get(id)
    const r = remoteById.get(id)
    if (l !== undefined && r !== undefined) {
      // Vive en remoto: solo la dropeamos si un tombstone es más nuevo que
      // AMBAS ediciones (alguien la borró después de las dos versiones).
      const ts = tombstones?.get(id)
      if (ts !== undefined && ts > Math.max(updMs(l), updMs(r))) continue
      merged.push(mergeItem ? mergeItem(l, r) : pickNewer(l, r, getUpdatedAt))
    } else if (r !== undefined) {
      if (tombDead(r)) continue                      // borrada en otro device (tombstone explícito)
      // borrado local pendiente → no resucitar. PERO si el local está vacío
      // (wipe/no-rehidrató), ignoramos el baseline y sí resucitamos.
      if (tombstones && baseline.has(id) && !localWiped) continue
      merged.push(r)
    } else if (l !== undefined) {
      if (tombDead(l)) continue                       // borrada en otro device (global)
      if (!baseline.has(id)) merged.push(l)           // nueva local sin pushear → conservar
      // ∈ baseline → borrada en otro device → no se incluye
    }
  }
  return merged
}

/** Normaliza un updatedAt (ISO string o ms) a número de ms. `undefined`/inválido
 *  → 0 (la fila más vieja posible, así cualquier tombstone gana). */
export function toMs(v: string | number | undefined): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  const t = Date.parse(v)
  return Number.isNaN(t) ? 0 : t
}

function pickNewer<T>(l: T, r: T, getUpdatedAt?: (i: T) => string | number | undefined): T {
  if (!getUpdatedAt) return r
  const lu = getUpdatedAt(l)
  const ru = getUpdatedAt(r)
  if (lu == null) return r
  if (ru == null) return l
  // Estrictamente más nuevo local gana; empate → remote (convergencia canónica).
  return lu > ru ? l : r
}

// ─── reconcileDeletes: borrado dirigido (reemplaza deleteSurplus) ───────────

/** Borra de remoto SOLO las filas que el user quitó a propósito: las que
 *  estaban en `baseline` (ya sincronizadas) y ya no están en `localIds`.
 *  Nunca toca filas fuera del baseline (= agregadas por otro device).
 *
 *  Con baseline vacío (usuario migrando) no borra nada → primer ciclo seguro. */
export async function reconcileDeletes(
  sb: SupabaseClient,
  table: string,
  userId: string,
  localIds: string[],
  baseline: Set<string>,
  /** Columna clave de la tabla. Default 'id'; usar 'code' (wallet_currencies)
   *  o 'date' (health_snapshots) para tablas con PK natural distinta. */
  idColumn: string = 'id',
): Promise<void> {
  if (baseline.size === 0) return
  // ── BLINDAJE ANTI-WIPE ──────────────────────────────────────────────
  // Si el local quedó COMPLETAMENTE vacío pero el baseline tenía filas, casi
  // nunca es un borrado real: es un store que no rehidrató / falló al cargar
  // (ej. localStorage lleno) o un pull que no llegó a mergear. Interpretar eso
  // como "el usuario borró TODO" y propagarlo destruiría los datos en la nube.
  // Preferimos NO borrar nada en ese caso — una fila de más en remoto se
  // re-pulla; datos perdidos en la nube no se recuperan.
  if (localIds.length === 0) {
    console.warn(`[sync] reconcileDeletes(${table}): local vacío con baseline de ${baseline.size} → skip para no borrar todo de la nube`)
    return
  }
  const localSet = new Set(localIds)
  const intentional = [...baseline].filter((id) => !localSet.has(id))
  if (intentional.length === 0) return

  // Intersectar con lo que existe realmente en remoto (evita DELETEs de ids
  // fantasma y nos dice qué borrar de verdad).
  const { data } = await sb.from(table).select(idColumn).eq('user_id', userId)
  if (!data) return
  const remoteIds = new Set((data as unknown as Record<string, string>[]).map((r) => r[idColumn]))
  const toDelete = intentional.filter((id) => remoteIds.has(id))
  if (toDelete.length === 0) return

  await sb.from(table).delete().eq('user_id', userId).in(idColumn, toDelete)
}

// ─── mergeSpiSession: deep-merge campo-por-campo de una sesión SPI ──────────

/** Mergea dos versiones de la MISMA sesión SPI preservando ediciones de
 *  campos distintos hechas en devices distintos.
 *
 *  Regla clave para `values` (sectionKey → fieldKey → string): si un lado
 *  tiene la respuesta no-vacía y el otro vacía, GANA la no-vacía (sin importar
 *  recencia). Esto arregla el caso "respondí una pregunta de estrategia en la
 *  notebook y la copia vacía de la PC la pisaba". En conflicto real (ambos
 *  no-vacíos y distintos), gana la sesión con `updatedAt` más reciente. */
export function mergeSpiSession(local: SPISession, remote: SPISession): SPISession {
  const localNewer = (local.updatedAt ?? '') >= (remote.updatedAt ?? '')
  const base = localNewer ? local : remote   // define escalares por recencia
  const other = localNewer ? remote : local

  return {
    ...base,
    values: mergeValues(base.values ?? {}, other.values ?? {}),
    // checklist: unión de keys; conflicto → base (más reciente)
    mainChecklist: { ...(other.mainChecklist ?? {}), ...(base.mainChecklist ?? {}) },
    // tasks: por id, preservando orden de base y sumando las que falten
    tasks: mergeSpiTasks(base.tasks ?? [], other.tasks ?? []),
    // sets "activados" → unión (no perder un carril/KPI prendido en un device)
    selectedLanes: unionArr(local.selectedLanes, remote.selectedLanes),
    selectedKpiIds: unionMaybeArr(local.selectedKpiIds, remote.selectedKpiIds),
    // snapshots / cierre: tomar el presente (base primero)
    weekSnapshot: base.weekSnapshot ?? other.weekSnapshot,
    calendarSnapshot: base.calendarSnapshot ?? other.calendarSnapshot,
    closedAt: base.closedAt ?? other.closedAt,
    updatedAt: base.updatedAt, // = max(local, remote)
  }
}

/** Deep-merge de un plan de Proyección — misma idea que `mergeSpiSession`:
 *  `values` (sectionKey → fieldKey → string) se mergea campo-por-campo
 *  (no-vacío gana sobre vacío; conflicto → más reciente). */
export function mergeProjectionPlan(local: ProjectionPlan, remote: ProjectionPlan): ProjectionPlan {
  const localNewer = (local.updatedAt ?? '') >= (remote.updatedAt ?? '')
  const base = localNewer ? local : remote
  const other = localNewer ? remote : local
  return {
    ...base,
    values: mergeValues(base.values ?? {}, other.values ?? {}),
    selectedLanes: unionMaybeArr(local.selectedLanes, remote.selectedLanes),
    closedAt: base.closedAt ?? other.closedAt,
    updatedAt: base.updatedAt,
  }
}

/** Merge de un hábito entre dos devices. Las marcas diarias
 *  (completedDates/skippedDates) se UNEN: una marca hecha en cualquier device
 *  nunca se pierde — perder un "completado" es peor que conservar un destildado
 *  que no propagó. Si una fecha quedó en ambos sets, gana "completado" (la señal
 *  positiva que no queremos perder). Escalares (nombre, icono, target, reminder)
 *  toman remote — el push-first ya subió ediciones locales pendientes. */
export function mergeHabit(local: Habit, remote: Habit): Habit {
  const completed = new Set([...(local.completedDates ?? []), ...(remote.completedDates ?? [])])
  const skipped = new Set([...(local.skippedDates ?? []), ...(remote.skippedDates ?? [])])
  for (const d of completed) skipped.delete(d)
  return {
    ...remote,
    completedDates: [...completed].sort(),
    skippedDates: [...skipped].sort(),
  }
}

/** Deep-merge de un perfil de Content Strategy — mismo espíritu que
 *  `mergeSpiSession`: en vez de LWW de objeto ENTERO (que hacía que "Baúl
 *  editado en la PC" pisara "ADN editado en el celu" o viceversa), mergeamos
 *  campo por campo:
 *   - ADN: por campo string, no-vacío gana sobre vacío; ambos no-vacíos → el
 *     perfil más reciente.
 *   - Pilares: unión por id (nunca perder un pilar creado en otro device);
 *     conflicto → versión del más reciente.
 *   - Estilo visual: unión de categorías por id; adentro, unión de imágenes
 *     por id (perder una foto subida es peor que resucitar una borrada).
 *   - Baúl / orientación: no-vacío gana sobre vacío.
 *   - Redes: unión.
 *   - Escalares (nombre, color, icon, medalla): del más reciente.
 *  Empate de updatedAt → gana LOCAL (conserva lo que este device está viendo;
 *  el push posterior lo propaga). */
export function mergeContentProfile(local: ContentProfile, remote: ContentProfile): ContentProfile {
  const lu = local.updatedAt ?? local.createdAt ?? ''
  const ru = remote.updatedAt ?? remote.createdAt ?? ''
  const localNewer = lu >= ru
  const base = localNewer ? local : remote
  const other = localNewer ? remote : local

  // ── ADN campo-por-campo ──
  const dna: ContentBrandDNA = { ...(base.brandDNA ?? {}) } as ContentBrandDNA
  const otherDna = (other.brandDNA ?? {}) as ContentBrandDNA
  for (const key of Object.keys(otherDna) as (keyof ContentBrandDNA)[]) {
    if (key === 'pillars') continue
    const bv = dna[key]
    const ov = otherDna[key]
    if (typeof ov === 'string' && ov.trim() !== '' && (typeof bv !== 'string' || bv.trim() === '')) {
      ;(dna as unknown as Record<string, unknown>)[key] = ov
    }
  }
  const basePillars = base.brandDNA?.pillars ?? []
  const basePillarIds = new Set(basePillars.map((p) => p.id))
  dna.pillars = [...basePillars, ...(other.brandDNA?.pillars ?? []).filter((p) => !basePillarIds.has(p.id))]

  // ── Estilo visual: unión por id (categorías e imágenes) ──
  const mergedVisual: VisualStyleCategory[] = []
  const otherCats = new Map((other.visualStyle ?? []).map((c) => [c.id, c]))
  for (const c of base.visualStyle ?? []) {
    const o = otherCats.get(c.id)
    if (!o) { mergedVisual.push(c); continue }
    otherCats.delete(c.id)
    const imgIds = new Set((c.images ?? []).map((i) => i.id))
    mergedVisual.push({ ...c, images: [...(c.images ?? []), ...(o.images ?? []).filter((i) => !imgIds.has(i.id))] })
  }
  mergedVisual.push(...otherCats.values())

  const nonEmpty = (v?: string) => (typeof v === 'string' && v.trim() !== '' ? v : undefined)

  return {
    ...base,
    brandDNA: dna,
    visualStyle: mergedVisual.length > 0 ? mergedVisual : (base.visualStyle ?? other.visualStyle),
    baul: nonEmpty(base.baul) ?? nonEmpty(other.baul) ?? base.baul,
    orientation: nonEmpty(base.orientation) ?? nonEmpty(other.orientation) ?? base.orientation,
    networks: [...new Set([...(base.networks ?? []), ...(other.networks ?? [])])],
    linkedTaskId: base.linkedTaskId ?? other.linkedTaskId,
    updatedAt: base.updatedAt ?? other.updatedAt,
  }
}

/** Deep-merge de una sesión de Laboratorio — `values` (stepKey → fieldKey →
 *  string) campo-por-campo (no-vacío gana sobre vacío). Mismo criterio que SPI. */
export function mergeLabSession(local: LabSession, remote: LabSession): LabSession {
  const localNewer = (local.updatedAt ?? '') >= (remote.updatedAt ?? '')
  const base = localNewer ? local : remote
  const other = localNewer ? remote : local
  return {
    ...base,
    values: mergeValues(base.values ?? {}, other.values ?? {}),
    outcome: base.outcome || other.outcome,
    closedAt: base.closedAt ?? other.closedAt,
    updatedAt: base.updatedAt,
  }
}

/** Deep-merge de `values`. `a` = sesión más reciente (base). */
function mergeValues(
  a: Record<string, Record<string, string>>,
  b: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  const sections = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const sec of sections) {
    const af = a[sec] ?? {}
    const bf = b[sec] ?? {}
    const fields = new Set([...Object.keys(af), ...Object.keys(bf)])
    const merged: Record<string, string> = {}
    for (const f of fields) {
      const av = af[f]
      const bv = bf[f]
      const aNon = isNonEmpty(av)
      const bNon = isNonEmpty(bv)
      if (aNon && !bNon) merged[f] = av
      else if (bNon && !aNon) merged[f] = bv
      else if (!aNon && !bNon) merged[f] = av ?? bv ?? ''
      else merged[f] = av // ambos no-vacíos → gana base (más reciente)
    }
    out[sec] = merged
  }
  return out
}

function mergeSpiTasks(base: SPITask[], other: SPITask[]): SPITask[] {
  const baseIds = new Set(base.map((t) => t.id))
  const result = [...base]
  for (const t of other) if (!baseIds.has(t.id)) result.push(t)
  return result
}

function isNonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function unionArr(a?: string[], b?: string[]): string[] {
  return [...new Set([...(a ?? []), ...(b ?? [])])]
}

function unionMaybeArr(a?: string[], b?: string[]): string[] | undefined {
  if (a == null && b == null) return undefined
  return unionArr(a, b)
}
