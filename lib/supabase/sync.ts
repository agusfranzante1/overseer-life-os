'use client'
import { useEffect, useRef } from 'react'
import { getSupabaseBrowser, hasSupabaseConfig } from './client'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useWalletStore } from '@/lib/store/walletStore'
import { useTradingStore } from '@/lib/store/tradingStore'
import { useHabitsStore } from '@/lib/store/habitsStore'
import { useGymStore } from '@/lib/store/gymStore'
import { useHealthStore, isValidDay } from '@/lib/store/healthStore'
import { useChatStore } from '@/lib/store/chatStore'
import { useFoodStore } from '@/lib/store/foodStore'
import { useSPIStore } from '@/lib/store/spiStore'
import { useProjectionStore } from '@/lib/store/projectionStore'
import { useLabStore } from '@/lib/store/labStore'
import { useAppStore } from '@/lib/store/appStore'
import { useMindMapStore } from '@/lib/store/mindmapStore'
import { useKpisStore } from '@/lib/store/kpisStore'
import { useStudyStore } from '@/lib/store/studyStore'
import { useContentStore } from '@/lib/store/contentStore'
import { useBacktestStore } from '@/lib/store/backtestStore'
import { useJournalStore } from '@/lib/store/journalStore'
import { useConceptStore } from '@/lib/store/conceptStore'
import {
  startPulling, endPulling,
  markModifiedIfNotPulling, markSynced, hasUnsyncedChanges,
  getBaseline, setBaseline,
} from './syncTracking'
import { mergeById, reconcileDeletes, mergeSpiSession, mergeProjectionPlan, mergeLabSession, mergeHabit, mergeContentProfile, toMs } from './syncMerge'

// ─── Shared state ─────────────────────────────────────────────────────────────

interface SyncState {
  userId: string | null
  ready: boolean
  tasksInit: boolean
  walletInit: boolean
  tradingInit: boolean
  habitsInit: boolean
  gymBasicsInit: boolean
  healthInit: boolean
  chatInit: boolean
  foodInit: boolean
  spiInit: boolean
  projectionInit: boolean
  labInit: boolean
  appPrefsInit: boolean
  mindmapInit: boolean
  kpisInit: boolean
  studyInit: boolean
  contentInit: boolean
  backtestInit: boolean
  journalInit: boolean
  conceptInit: boolean
}

const state: SyncState = {
  userId: null,
  ready: false,
  tasksInit: false,
  walletInit: false,
  tradingInit: false,
  habitsInit: false,
  gymBasicsInit: false,
  healthInit: false,
  chatInit: false,
  foodInit: false,
  spiInit: false,
  projectionInit: false,
  labInit: false,
  appPrefsInit: false,
  mindmapInit: false,
  kpisInit: false,
  studyInit: false,
  contentInit: false,
  backtestInit: false,
  journalInit: false,
  conceptInit: false,
}

// ─── Push timers (debounced per domain) ───────────────────────────────────────

let tasksPushTimer: ReturnType<typeof setTimeout> | null = null
let walletPushTimer: ReturnType<typeof setTimeout> | null = null
let tradingPushTimer: ReturnType<typeof setTimeout> | null = null
let habitsPushTimer: ReturnType<typeof setTimeout> | null = null
let gymBasicsPushTimer: ReturnType<typeof setTimeout> | null = null
let healthPushTimer: ReturnType<typeof setTimeout> | null = null
let chatPushTimer: ReturnType<typeof setTimeout> | null = null
let foodPushTimer: ReturnType<typeof setTimeout> | null = null
let spiPushTimer: ReturnType<typeof setTimeout> | null = null
let projectionPushTimer: ReturnType<typeof setTimeout> | null = null
let labPushTimer: ReturnType<typeof setTimeout> | null = null
let appPrefsPushTimer: ReturnType<typeof setTimeout> | null = null
let mindmapPushTimer: ReturnType<typeof setTimeout> | null = null
let kpisPushTimer: ReturnType<typeof setTimeout> | null = null
let studyPushTimer: ReturnType<typeof setTimeout> | null = null
let contentPushTimer: ReturnType<typeof setTimeout> | null = null
let backtestPushTimer: ReturnType<typeof setTimeout> | null = null
let journalPushTimer: ReturnType<typeof setTimeout> | null = null
let conceptPushTimer: ReturnType<typeof setTimeout> | null = null

// Registro de push debounceados que están en cola. Lo usa
// flushAllPendingPushes() para forzar TODO a salir antes de que el
// browser pause el tab (visibilitychange → hidden, pagehide, etc.).
// Map para que clearTimeout no dispare el push después de que ya lo
// ejecutamos manualmente.
const pendingPushes = new Map<() => Promise<void>, ReturnType<typeof setTimeout>>()

/** Extrae un mensaje legible de cualquier error. Los errores de Supabase
 *  (PostgrestError, StorageError) NO son instancias de Error pero tienen
 *  `.message` (+ a veces `.details`/`.hint`/`.code`). Sin esto el catch genérico
 *  mostraba "[object Object]" y ocultaba la causa real (ej. falta una migration). */
function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>
    const parts = [o.message, o.details, o.hint, o.code].filter((x): x is string => typeof x === 'string' && x.length > 0)
    if (parts.length > 0) return parts.join(' · ')
    try { return JSON.stringify(e) } catch { /* fall through */ }
  }
  return String(e)
}

function schedule(
  timer: ReturnType<typeof setTimeout> | null,
  fn: () => Promise<void>,
  setTimer: (t: ReturnType<typeof setTimeout>) => void,
) {
  if (timer) clearTimeout(timer)
  const prev = pendingPushes.get(fn)
  if (prev) clearTimeout(prev)
  const newTimer = setTimeout(async () => {
    pendingPushes.delete(fn)
    try {
      await fn()
    } catch (e) {
      reportSyncError(`Sync push failed: ${errMsg(e)}`)
    }
  }, 1500)
  pendingPushes.set(fn, newTimer)
  setTimer(newTimer)
}

/** Fuerza todos los push debounceados pendientes a salir AHORA, sin
 *  esperar el delay de 1.5s. Llamado en `visibilitychange → hidden` y
 *  `pagehide`, así si el user se va de la app (cierra tab, bloquea cel,
 *  switchea de app), todo lo que estaba a punto de pushearse se sube
 *  antes de que el browser pause el JS y los setTimeout se queden
 *  colgados. Best-effort: si falla por la pausa, los timestamps siguen
 *  marcando "unsynced" → al volver la app, push-first lo agarra. */
export async function flushAllPendingPushes(): Promise<void> {
  const toFlush = [...pendingPushes.entries()]
  for (const [, timer] of toFlush) clearTimeout(timer)
  pendingPushes.clear()
  if (toFlush.length === 0) return
  await Promise.allSettled(toFlush.map(([fn]) => fn().catch((e) => {
    reportSyncError(`Flush push failed: ${errMsg(e)}`)
  })))
}

// ─── Sesión vencida ───────────────────────────────────────────────────────────
// Cuando el token de Supabase caduca (típico tras horas en background, sobre
// todo en mobile) y no logra refrescarse, TODAS las escrituras rebotan con 401 /
// RLS. Antes eso spameaba un toast por tabla ("error error error") y el usuario
// no sabía que en realidad tenía que re-loguear. Ahora:
//   - antes de cada ciclo de sync refrescamos/validamos la sesión (ensureSession),
//   - si está realmente muerta, cerramos sesión sola UNA vez y avisamos con un
//     CTA para reingresar (handleSessionExpired),
//   - y deduplicamos los toasts para que nunca sea una cascada.
let authExpiredHandled = false

/** Hay sesión válida? `getSession()` refresca el access token si está vencido
 *  pero el refresh token sigue vivo. Sincroniza state.userId con el resultado. */
async function ensureSession(): Promise<boolean> {
  try {
    const sb = getSupabaseBrowser()
    const { data: { session } } = await sb.auth.getSession()
    state.userId = session?.user?.id ?? null
    return !!session
  } catch {
    return false
  }
}

/** Sesión muerta (no refrescable): cancela pushes pendientes, limpia el userId,
 *  cierra sesión y avisa UNA sola vez con botón para reingresar. Idempotente. */
async function handleSessionExpired(): Promise<void> {
  if (authExpiredHandled) return
  authExpiredHandled = true
  for (const [, timer] of pendingPushes) clearTimeout(timer)
  pendingPushes.clear()
  state.userId = null
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('overseer-sync-error', {
        detail: {
          message: 'Tu sesión expiró. Volvé a iniciar sesión para seguir sincronizando.',
          action: { label: 'Volver a entrar', href: '/login' },
          at: Date.now(),
        },
      }))
    } catch { /* noop */ }
  }
  try { await getSupabaseBrowser().auth.signOut() } catch { /* noop */ }
}

let lastToastMsg = ''
let lastToastAt = 0

/** Surface a sync failure to the user. Si el error huele a auth (401 / RLS / JWT)
 *  y la sesión está muerta, cierra sesión sola en vez de mostrar el toast
 *  engañoso de "falta migración". Si la sesión está viva, es un problema real
 *  (policy/migración) y se muestra UNA vez (deduplicado). */
function reportSyncError(message: string) {
  console.error('[sync]', message)
  // Errores de RED transitorios (sin conexión / fetch abortado): NO son
  // accionables por el usuario y se reintentan solos en el próximo ciclo
  // (los cambios locales quedan marcados como unsynced, no se pierden). No
  // alarmamos con un toast rojo — solo log. En iOS Safari el texto es
  // "Load failed"; en Chrome "Failed to fetch".
  if (/load failed|failed to fetch|networkerror|network request failed|err_network|the network connection was lost|connection appears to be offline/i.test(message)) {
    return
  }
  if (/row-level security|unauthorized|jwt|\b401\b|not authenticated/i.test(message)) {
    void (async () => {
      const ok = await ensureSession()
      if (!ok) { await handleSessionExpired(); return }
      surfaceSyncToast(message)
    })()
    return
  }
  surfaceSyncToast(message)
}

/** Dispara el toast global, deduplicando ráfagas del mismo mensaje (8s) para
 *  que un fallo masivo no llene la pantalla de carteles. */
function surfaceSyncToast(message: string) {
  const now = Date.now()
  if (message === lastToastMsg && now - lastToastAt < 8000) return
  lastToastMsg = message
  lastToastAt = now
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('overseer-sync-error', { detail: { message, at: now } }))
    } catch { /* noop */ }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

// El viejo `deleteSurplus` (snapshot completo + borrado de todo lo ausente en
// local) fue reemplazado por `reconcileDeletes` (en syncMerge.ts), que solo
// borra lo que el user quitó a propósito (baseline ∩ ¬local). Todos los
// dominios usan ahora merge no-destructivo + reconcileDeletes.

// ─── Tombstones globales (tabla deleted_rows) ─────────────────────────────────
//
// El baseline (localStorage por-device) detecta los borrados que ESTE device
// hizo, pero no puede saber de borrados que pasaron en OTRO device mientras
// estaba offline. Los tombstones cierran ese hueco: cuando un device borra una
// fila, escribe acá {table_name, row_id, deleted_at}; en cada pull, todos los
// devices descartan esa fila si el tombstone es más nuevo que su updatedAt.
// Ver supabase/migration_deleted_rows.sql. Graceful si falta la migration.

type Tombstones = Map<string, Map<string, number>> // table_name → (row_id → deleted_at ms)

/** Trae los tombstones de las tablas pedidas en un solo query. Siempre devuelve
 *  un map por tabla (vacío si falta la migration o falla el query). */
async function fetchTombstones(
  sb: ReturnType<typeof getSupabaseBrowser>, userId: string, tableNames: string[],
): Promise<Tombstones> {
  const out: Tombstones = new Map()
  for (const t of tableNames) out.set(t, new Map())
  try {
    const { data, error } = await sb.from('deleted_rows')
      .select('table_name,row_id,deleted_at')
      .eq('user_id', userId).in('table_name', tableNames)
    if (error) {
      console.warn('[tombstones] fetch failed (¿falta migration_deleted_rows.sql?):', error.message)
      return out
    }
    for (const row of (data ?? []) as Row[]) {
      const m = out.get(row.table_name as string)
      if (m) m.set(row.row_id as string, toMs(row.deleted_at as string))
    }
  } catch (e) {
    console.warn('[tombstones] fetch skipped:', e)
  }
  return out
}

/** Registra borrados en deleted_rows para que se propaguen a otros devices.
 *  No limpiamos tombstones viejos: una fila re-creada gana por su updatedAt más
 *  nuevo (ver `tombDead` en syncMerge.ts), así que el tombstone stale es inocuo. */
async function writeTombstones(
  sb: ReturnType<typeof getSupabaseBrowser>, userId: string, tableName: string, ids: string[],
): Promise<void> {
  if (ids.length === 0) return
  const nowIso = new Date().toISOString()
  const rows = ids.map((id) => ({ user_id: userId, table_name: tableName, row_id: id, deleted_at: nowIso }))
  const r = await sb.from('deleted_rows').upsert(rows, { onConflict: 'user_id,table_name,row_id' })
  if (r.error) {
    console.warn(`[tombstones] write ${tableName} failed (¿falta migration_deleted_rows.sql?):`, r.error.message)
  }
}

/** Ids que estaban en el baseline (ya sincronizados) y ya no están en local =
 *  borrados a propósito por el user en este device. */
function deletedSince(baseline: Set<string>, localIds: string[]): string[] {
  const localSet = new Set(localIds)
  return [...baseline].filter((id) => !localSet.has(id))
}

/** Cierre del lado PUSH para una tabla de colección: borra de remoto lo que el
 *  user quitó (baseline ∩ ¬local), registra esos borrados como tombstones para
 *  que se propaguen a otros devices, y actualiza el baseline local = lo que
 *  quedó en remoto. Reemplaza el par `reconcileDeletes(...) + setBaseline(...)`
 *  que tenía cada push, sumándole la escritura de tombstones. */
async function syncDeletes(
  sb: ReturnType<typeof getSupabaseBrowser>, uid: string,
  table: string, localIds: string[], baselineKey: string, idColumn: string = 'id',
): Promise<void> {
  const base = getBaseline(baselineKey)
  // ── BLINDAJE ANTI-WIPE TOTAL ────────────────────────────────────────
  // Si el local quedó COMPLETAMENTE vacío pero el baseline tenía filas, casi
  // nunca es un borrado real: es un store que no rehidrató (localStorage lleno
  // / wipe) o un pull que no llegó. NO tocamos nada: ni borramos de la nube,
  // ni escribimos tombstones (que después bloquearían el pull vía tombDead),
  // ni pisamos el baseline. La data en la nube queda intacta y recuperable.
  if (localIds.length === 0 && base.size > 0) {
    console.warn(`[sync] syncDeletes(${table}): local vacío con baseline de ${base.size} → skip TOTAL (no borra, no tombstonea, no toca baseline)`)
    return
  }
  await reconcileDeletes(sb, table, uid, localIds, base, idColumn)
  await writeTombstones(sb, uid, table, deletedSince(base, localIds))
  setBaseline(baselineKey, localIds)
}

// ─── TASKS ────────────────────────────────────────────────────────────────────

async function pushTasks() {
  if (!state.userId) return
  // Momento del snapshot: lo que se edite DURANTE el vuelo del push queda
  // con lastModified > syncedAt → sigue contando como unsynced (no se pierde).
  const syncedAt = new Date().toISOString()
  const sb = getSupabaseBrowser()
  const { projects, tasks } = useTasksStore.getState()

  const projectRows = Object.values(projects).map((p) => ({
    id: p.id,
    user_id: state.userId!,
    name: p.name,
    color: p.color,
    icon: p.icon ?? null,
    description: p.description ?? null,
    statuses: p.statuses,
    archived: !!p.archived,
    // Flags de "system project" — sin esto el SPI auto-creado se
    // duplicaba en cada cierre porque el pull no traía el tag y
    // ensureSystemProject no lo encontraba.
    is_system_project: p.isSystemProject ?? false,
    system_project_key: p.systemProjectKey ?? null,
    // Sistema de Estudio + Contenido — tipo + metadata. Si el proyecto
    // es 'standard' o no tiene type, mandamos null para mantener el row
    // limpio. Requiere migration_subjects_content.sql aplicada.
    type:               p.type             ?? null,
    subject_meta:       p.subjectMeta      ?? null,
    content_meta:       p.contentMeta      ?? null,
    parent_project_id:  p.parentProjectId  ?? null,
    // Orden manual del sidebar (↑/↓). Sin esto el pull pisaba el orden local.
    // Requiere migration_projects_order.sql aplicada.
    sort_order:         p.order            ?? null,
    created_at: p.createdAt,
  }))

  const taskRows = Object.values(tasks).map((t) => ({
    id: t.id,
    user_id: state.userId!,
    project_id: t.projectId,
    title: t.title,
    description: t.description ?? null,
    status: t.status,
    priority: t.priority,
    importance: t.importance,
    due_date: t.dueDate ?? null,
    energy_estimate: t.energyEstimate ?? null,
    notes: t.notes ?? null,
    scheduled_for: t.scheduledFor ?? null,
    completed_at: t.completedAt ?? null,
    archived_at: t.archivedAt ?? null,
    postponed_count: t.postponedCount ?? 0,
    category: t.category ?? null,
    // Campos que faltaban — sin esto el pull borraba dueTime, duration,
    // gcal linkage, etc. Requiere migration_tasks_time_gcal_fields.sql.
    due_time:              t.dueTime              ?? null,
    duration_minutes:      t.durationMinutes      ?? null,
    gcal_event_id:         t.gcalEventId          ?? null,
    gcal_calendar_id:      t.gcalCalendarId       ?? null,
    notify_before_minutes: t.notifyBeforeMinutes  ?? null,
    recurrence:            t.recurrence           ?? null,
    // Vinculación al parcial de una materia (solo aplica a tasks de
    // proyectos type='subject'). Requiere migration_subjects_content.sql.
    parcial_id:            t.parcialId            ?? null,
    rescheduled_from:      t.rescheduledFrom      ?? null,
    // Ancla persistente de la cadena recurrente — la madre tiene
    // recurringHeadId === id; las hijas apuntan a su id. Requiere
    // migration_recurring_head_id.sql aplicada.
    recurring_head_id:     t.recurringHeadId      ?? null,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  }))

  // Set de todos los subtask ids locales — usado abajo para sanitizar
  // parent_id. Si un subtask tiene parentId apuntando a un id que ya no
  // existe (huérfana, típicamente porque deleteSubtask viejo no limpiaba
  // las hijas al borrar la madre, o porque un convertTaskToSubtask viejo
  // dejó referencias colgando), Postgres rechazaba el upsert con FK
  // violation `subtasks_parent_id_fkey`. La UI ya las trata como
  // top-level (filtra por !parentId), así que mandarlas con parent_id
  // null restaura la consistencia con lo que el user ve.
  const allLocalSubtaskIds = new Set<string>(
    Object.values(tasks).flatMap((t) => t.subtasks.map((s) => s.id))
  )

  const subtaskRows = Object.values(tasks).flatMap((t) =>
    t.subtasks.map((s) => ({
      id: s.id,
      user_id: state.userId!,
      task_id: t.id,
      parent_id: s.parentId && allLocalSubtaskIds.has(s.parentId) ? s.parentId : null,
      title: s.title,
      completed: s.completed,
      status: s.status,
      order: s.order,
      notes: s.notes ?? null,
      priority: s.priority ?? null,
      // Campos de ciclo de vida — sin esto el auto-purge nocturno no
      // podía archivar subtasks porque al hacer pull se perdía completedAt.
      // Requiere migration_subtasks_completion_fields.sql aplicada.
      completed_at: s.completedAt ?? null,
      archived_at:  s.archivedAt  ?? null,
      due_date:         s.dueDate         ?? null,
      due_time:         s.dueTime         ?? null,
      duration_minutes: s.durationMinutes ?? null,
      description:      s.description     ?? null,
      recurrence:       s.recurrence      ?? null,
    }))
  )

  // Dedup defensivo por id ANTES de cada upsert: si por algún bug dos filas
  // comparten id en el mismo batch (ej. la misma subtarea de contenido
  // `cs_<itemId>` quedó bajo dos tareas madre distintas en dos devices),
  // Postgres tira `ON CONFLICT ... cannot affect row a second time` (21000)
  // y se cae TODO el push. Nos quedamos con la primera aparición.
  const dedupById = <T extends { id: string }>(rows: T[]): T[] => {
    const seen = new Set<string>()
    return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
  }
  const projectRowsU = dedupById(projectRows)
  const taskRowsU = dedupById(taskRows)
  const subtaskRowsU = dedupById(subtaskRows)

  // Filtro de HUÉRFANOS para no violar las foreign keys (23503):
  //   - una tarea cuyo `project_id` no existe localmente (proyecto borrado en
  //     otra versión/device) no se puede insertar → la dejamos afuera.
  //   - una subtarea cuya tarea madre quedó afuera, idem.
  const validProjectIds = new Set(projectRowsU.map((p) => p.id))
  const taskRowsValid = taskRowsU.filter((t) => validProjectIds.has(t.project_id))
  const validTaskIds = new Set(taskRowsValid.map((t) => t.id))
  const subtaskRowsValid = subtaskRowsU.filter((st) => validTaskIds.has(st.task_id))

  if (projectRowsU.length > 0) {
    const r = await sb.from('projects').upsert(projectRowsU)
    if (r.error) { reportSyncError(`projects upsert failed: ${r.error.message}`); throw r.error }
  }
  if (taskRowsValid.length > 0) {
    const r = await sb.from('tasks').upsert(taskRowsValid)
    if (r.error) { reportSyncError(`tasks upsert failed: ${r.error.message}`); throw r.error }
  }
  if (subtaskRowsValid.length > 0) {
    const r = await sb.from('subtasks').upsert(subtaskRowsValid)
    if (r.error) {
      reportSyncError(`subtasks upsert failed: ${r.error.message}. ¿Falta correr migration_subtasks_completion_fields.sql?`)
      throw r.error
    }
  }

  // Reconcile deletes — solo borra lo que el user quitó a propósito (estaba
  // en baseline y ya no está local). Nunca borra filas que otro device sumó.
  const projectIds = projectRows.map((r) => r.id)
  const taskIds = taskRows.map((r) => r.id)
  const subtaskIds = subtaskRows.map((r) => r.id)

  // Borra lo quitado a propósito (baseline ∩ ¬local), registra tombstones para
  // propagar el borrado a otros devices, y actualiza baseline = lo local.
  await syncDeletes(sb, state.userId!, 'subtasks', subtaskIds, 'tasks:subtasks')
  await syncDeletes(sb, state.userId!, 'tasks', taskIds, 'tasks:tasks')
  await syncDeletes(sb, state.userId!, 'projects', projectIds, 'tasks:projects')
  markSynced('tasks', syncedAt)
}

async function pullTasks(): Promise<{ projects: number; tasks: number } | null> {
  if (!state.userId) return null
  startPulling('tasks')
  try {
  const sb = getSupabaseBrowser()

  const [projectsRes, tasksRes, subtasksRes] = await Promise.all([
    sb.from('projects').select('*').eq('user_id', state.userId),
    sb.from('tasks').select('*').eq('user_id', state.userId),
    sb.from('subtasks').select('*').eq('user_id', state.userId),
  ])

  if (projectsRes.error || tasksRes.error || subtasksRes.error) {
    console.error('Tasks pull failed', projectsRes.error ?? tasksRes.error ?? subtasksRes.error)
    return null
  }

  if ((projectsRes.data?.length ?? 0) === 0 && (tasksRes.data?.length ?? 0) === 0) {
    markSynced('tasks')
    return { projects: 0, tasks: 0 }
  }

  const subtasksByTaskId = new Map<string, Row[]>()
  for (const s of subtasksRes.data ?? []) {
    const sid = (s as Row).task_id as string
    if (!subtasksByTaskId.has(sid)) subtasksByTaskId.set(sid, [])
    subtasksByTaskId.get(sid)!.push(s as Row)
  }

  // Tipos del store local — reutilizados para tipar las filas remotas mapeadas.
  const localState = useTasksStore.getState()
  const localProjects = Object.values(localState.projects)
  const localTasks = Object.values(localState.tasks)
  type LocalProject = (typeof localProjects)[number]
  type LocalTask = (typeof localTasks)[number]
  type LocalSubtask = LocalTask['subtasks'][number]

  // ── Map de filas remotas → objetos de dominio (misma forma que el store) ──
  const remoteProjects = (projectsRes.data ?? []).map((p: Row) => ({
    id: p.id as string,
    name: p.name as string,
    color: p.color as string,
    icon: (p.icon as string) ?? undefined,
    description: (p.description as string) ?? undefined,
    statuses: (p.statuses as unknown[]) ?? [],
    taskIds: [] as string[], // se recomputa abajo desde las tasks mergeadas
    createdAt: p.created_at as string,
    archived: !!p.archived,
    isSystemProject: !!(p.is_system_project as boolean),
    systemProjectKey: (p.system_project_key as 'spi' | 'content-root' | null) ?? undefined,
    type:            (p.type              as 'standard' | 'subject' | 'content' | null) ?? undefined,
    subjectMeta:     (p.subject_meta      as import('@/types').SubjectMeta | null) ?? undefined,
    contentMeta:     (p.content_meta      as import('@/types').ContentMeta | null) ?? undefined,
    parentProjectId: (p.parent_project_id as string | null) ?? undefined,
    // Orden manual del sidebar. Sin esto el merge perdía el orden en cada pull.
    order:           (p.sort_order        as number | null) ?? undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)) as LocalProject[]

  const remoteTasks = (tasksRes.data ?? []).map((t: Row) => ({
    id: t.id as string,
    projectId: t.project_id as string,
    title: t.title as string,
    description: (t.description as string) ?? undefined,
    status: t.status as string,
    priority: t.priority as 'low' | 'medium' | 'high' | 'urgent',
    importance: t.importance as 'low' | 'medium' | 'high' | 'critical',
    dueDate: (t.due_date as string) ?? undefined,
    energyEstimate: (t.energy_estimate as number) ?? undefined,
    notes: (t.notes as string) ?? undefined,
    subtasks: (subtasksByTaskId.get(t.id as string) ?? []).map((s) => ({
      id: s.id as string,
      title: s.title as string,
      completed: s.completed as boolean,
      status: s.status as string,
      order: s.order as number,
      notes: (s.notes as string) ?? undefined,
      priority: (s.priority as 'low' | 'medium' | 'high' | 'urgent' | null) ?? undefined,
      parentId: (s.parent_id as string) ?? undefined,
      completedAt: (s.completed_at as string) ?? undefined,
      archivedAt:  (s.archived_at  as string) ?? undefined,
      dueDate:         (s.due_date         as string) ?? undefined,
      dueTime:         (s.due_time         as string) ?? undefined,
      durationMinutes: (s.duration_minutes as number) ?? undefined,
      description:     (s.description      as string) ?? undefined,
      recurrence:      (s.recurrence       as import('@/types').TaskRecurrence) ?? undefined,
    })),
    createdAt: t.created_at as string,
    scheduledFor: (t.scheduled_for as 'today' | 'tomorrow') ?? undefined,
    completedAt: (t.completed_at as string) ?? undefined,
    archivedAt: (t.archived_at as string) ?? undefined,
    updatedAt: t.updated_at as string,
    postponedCount: (t.postponed_count as number) ?? 0,
    category: (t.category as string) ?? undefined,
    dueTime:              (t.due_time              as string) ?? undefined,
    durationMinutes:      (t.duration_minutes      as number) ?? undefined,
    gcalEventId:          (t.gcal_event_id         as string) ?? undefined,
    gcalCalendarId:       (t.gcal_calendar_id      as string) ?? undefined,
    notifyBeforeMinutes:  (t.notify_before_minutes as number) ?? undefined,
    recurrence:           (t.recurrence            as import('@/types').TaskRecurrence) ?? undefined,
    parcialId:            (t.parcial_id            as string) ?? undefined,
    rescheduledFrom:      (t.rescheduled_from      as string) ?? undefined,
    recurringHeadId:      (t.recurring_head_id     as string) ?? undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)) as LocalTask[]

  // ── Merge no-destructivo local ⊕ remoto ───────────────────────────────────
  // Tombstones globales: un borrado hecho en cualquier device se aplica acá,
  // sin depender del baseline local (que puede estar viejo en este device).
  const tombs = await fetchTombstones(sb, state.userId!, ['projects', 'tasks', 'subtasks'])
  const tombProjects = tombs.get('projects')!
  const tombTasks = tombs.get('tasks')!
  const tombSubtasks = tombs.get('subtasks')!
  const subtaskBaseline = getBaseline('tasks:subtasks')

  const mergedTasks = mergeById<LocalTask>({
    local: localTasks,
    remote: remoteTasks,
    baseline: getBaseline('tasks:tasks'),
    getId: (t) => t.id,
    getUpdatedAt: (t) => t.updatedAt,
    tombstones: tombTasks,
    // Conflicto de task → escalares de la más reciente; subtasks se mergean
    // por id (la task más nueva resuelve el contenido de cada subtask).
    mergeItem: (l, r) => {
      const lNewer = (l.updatedAt ?? '') >= (r.updatedAt ?? '')
      const scalarBase = lNewer ? l : r
      const mergedSubs = mergeById<LocalSubtask>({
        local: l.subtasks ?? [],
        remote: r.subtasks ?? [],
        baseline: subtaskBaseline,
        getId: (s) => s.id,
        tombstones: tombSubtasks,
        mergeItem: (ls, rs) => (lNewer ? ls : rs),
      })
      return { ...scalarBase, subtasks: mergedSubs }
    },
  })

  // Projects sin updatedAt → en conflicto gana remote (canónico tras push).
  const mergedProjects = mergeById<LocalProject>({
    local: localProjects,
    remote: remoteProjects,
    baseline: getBaseline('tasks:projects'),
    getId: (p) => p.id,
    tombstones: tombProjects,
  })

  // Recomputar taskIds de cada project desde las tasks mergeadas.
  const taskIdsByProject = new Map<string, string[]>()
  for (const t of mergedTasks) {
    if (!taskIdsByProject.has(t.projectId)) taskIdsByProject.set(t.projectId, [])
    taskIdsByProject.get(t.projectId)!.push(t.id)
  }
  const projectsWithTaskIds = mergedProjects.map((p) => ({
    ...p, taskIds: taskIdsByProject.get(p.id) ?? [],
  }))

  useTasksStore.setState({
    projects: Object.fromEntries(projectsWithTaskIds.map((p) => [p.id, p])),
    tasks: Object.fromEntries(mergedTasks.map((t) => [t.id, t])),
  })

  // Baseline = lo confirmado en remoto (lo que Supabase tiene ahora). Las
  // filas creadas local sin pushear aún quedan fuera; el próximo push las
  // sube y actualiza el baseline.
  setBaseline('tasks:projects', remoteProjects.map((p) => p.id))
  setBaseline('tasks:tasks', remoteTasks.map((t) => t.id))
  setBaseline('tasks:subtasks', remoteTasks.flatMap((t) => t.subtasks.map((s) => s.id)))
  markSynced('tasks')
  return { projects: remoteProjects.length, tasks: remoteTasks.length }
  } finally {
    endPulling('tasks')
  }
}

// ─── WALLET ───────────────────────────────────────────────────────────────────

async function pushWallet() {
  if (!state.userId) return
  // Momento del snapshot: lo que se edite DURANTE el vuelo del push queda
  // con lastModified > syncedAt → sigue contando como unsynced (no se pierde).
  const syncedAt = new Date().toISOString()
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { currencies, wallets, transactions, distribution, deletedWallets, recurringExpenses } = useWalletStore.getState()

  // Currencies (PK: user_id + code after migration_phase2.sql)
  const currencyRows = currencies.map((c) => ({
    user_id: uid, code: c.code, symbol: c.symbol, name: c.name, color: c.color,
  }))

  // Wallets
  const walletRows = wallets.map((w) => ({
    id: w.id, user_id: uid, name: w.name, color: w.color, icon: w.icon,
    currency_codes: w.currencyCodes, created_at: w.createdAt,
  }))

  // Transactions
  const txRows = transactions.map((t) => ({
    id: t.id, user_id: uid, type: t.type, wallet_id: t.walletId,
    currency_code: t.currencyCode, amount: t.amount, label: t.label,
    category: t.category, date: t.date, timestamp: t.timestamp,
    to_wallet_id: t.toWalletId ?? null,
    to_currency_code: t.toCurrencyCode ?? null,
    to_amount: t.toAmount ?? null,
  }))

  // Deleted wallets
  const deletedRows = deletedWallets.map((d) => ({
    id: d.id, user_id: uid, wallet: d.wallet,
    transactions: d.transactions, deleted_at: d.deletedAt,
  }))

  // Recurring expenses
  const recurringRows = recurringExpenses.map((r) => ({
    id: r.id, user_id: uid,
    wallet_id: r.walletId, currency_code: r.currencyCode,
    amount: r.amount, label: r.label, category: r.category,
    day_of_month: r.dayOfMonth, active: r.active,
    start_date: r.startDate, end_date: r.endDate ?? null,
    last_applied_year_month: r.lastAppliedYearMonth ?? null,
    is_subscription: r.isSubscription ?? true,
    notes: r.notes ?? null, created_at: r.createdAt,
  }))

  // Upserts — check each result and surface failures loudly so the user
  // doesn't lose data silently (this was happening when migration_phase2
  // hadn't been run and the PK was wrong on wallet_currencies).
  if (currencyRows.length > 0) {
    const r = await sb.from('wallet_currencies').upsert(currencyRows, { onConflict: 'user_id,code' })
    if (r.error) {
      // Most likely cause: PK on wallet_currencies is still `code` only
      // (pre-migration_phase2.sql). The onConflict 'user_id,code' needs
      // a composite UNIQUE/PK to match. Run migration_wallet_currencies_pk.sql.
      reportSyncError(
        `wallet_currencies upsert failed: ${r.error.message}. ` +
        `Likely missing PK migration — run supabase/migration_wallet_currencies_pk.sql.`
      )
      throw r.error
    }
  }
  if (walletRows.length > 0) {
    const r = await sb.from('wallets').upsert(walletRows)
    if (r.error) { reportSyncError(`wallets upsert failed: ${r.error.message}`); throw r.error }
  }
  if (txRows.length > 0) {
    const r = await sb.from('wallet_transactions').upsert(txRows)
    if (r.error) { reportSyncError(`wallet_transactions upsert failed: ${r.error.message}`); throw r.error }
  }

  // Distribution as singleton JSONB (wallet_config table from migration_phase2.sql)
  await sb.from('wallet_config').upsert(
    { user_id: uid, distribution, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )

  if (deletedRows.length > 0) await sb.from('wallets_deleted').upsert(deletedRows)

  if (recurringRows.length > 0) {
    const r = await sb.from('wallet_recurring_expenses').upsert(recurringRows)
    if (r.error) {
      reportSyncError(`wallet_recurring_expenses upsert failed: ${r.error.message}. Likely missing migration — run supabase/migration_wallet_recurring.sql.`)
      throw r.error
    }
  }

  // Borra lo quitado a propósito + tombstones + baseline, por tabla.
  const txIds = txRows.map((r) => r.id)
  const walletIds = walletRows.map((r) => r.id)
  const deletedIds = deletedRows.map((r) => r.id)
  const recurringIds = recurringRows.map((r) => r.id)
  const currencyCodes = currencies.map((c) => c.code)
  await syncDeletes(sb, uid, 'wallet_transactions', txIds, 'wallet:transactions')
  await syncDeletes(sb, uid, 'wallets', walletIds, 'wallet:wallets')
  await syncDeletes(sb, uid, 'wallets_deleted', deletedIds, 'wallet:deleted')
  await syncDeletes(sb, uid, 'wallet_recurring_expenses', recurringIds, 'wallet:recurring')
  // Currencies: PK natural = code.
  await syncDeletes(sb, uid, 'wallet_currencies', currencyCodes, 'wallet:currencies', 'code')
  markSynced('wallet', syncedAt)
}

async function pullWallet(): Promise<boolean> {
  if (!state.userId) return false
  startPulling('wallet')
  try {
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const [curRes, wallRes, txRes, cfgRes, delRes, recRes] = await Promise.all([
    sb.from('wallet_currencies').select('*').eq('user_id', uid),
    sb.from('wallets').select('*').eq('user_id', uid),
    sb.from('wallet_transactions').select('*').eq('user_id', uid),
    sb.from('wallet_config').select('*').eq('user_id', uid).maybeSingle(),
    sb.from('wallets_deleted').select('*').eq('user_id', uid),
    sb.from('wallet_recurring_expenses').select('*').eq('user_id', uid),
  ])

  if (curRes.error || wallRes.error || txRes.error || cfgRes.error || delRes.error) {
    console.error('Wallet pull failed', curRes.error ?? wallRes.error ?? txRes.error ?? cfgRes.error ?? delRes.error)
    return false
  }
  // recRes is non-fatal — if the migration isn't run yet, skip it and let
  // the next push surface the error via the toast.
  if (recRes.error) {
    console.warn('Wallet recurring pull failed (run migration_wallet_recurring.sql):', recRes.error)
  }

  const hasData = (wallRes.data?.length ?? 0) > 0 || (txRes.data?.length ?? 0) > 0
  if (!hasData && !cfgRes.data) { markSynced('wallet'); return false }

  const localW = useWalletStore.getState()
  type Currency = (typeof localW.currencies)[number]
  type WalletT = (typeof localW.wallets)[number]
  type Tx = (typeof localW.transactions)[number]
  type DeletedW = (typeof localW.deletedWallets)[number]
  type Recurring = (typeof localW.recurringExpenses)[number]

  const remoteCurrencies: Currency[] = (curRes.data ?? []).map((c: Row) => ({
    code: c.code as string,
    symbol: c.symbol as string,
    name: c.name as string,
    color: c.color as string,
  }))
  const remoteWallets: WalletT[] = (wallRes.data ?? []).map((w: Row) => ({
    id: w.id as string,
    name: w.name as string,
    color: w.color as string,
    icon: w.icon as string,
    currencyCodes: (w.currency_codes as string[]) ?? [],
    createdAt: w.created_at as string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any))
  const remoteTx: Tx[] = (txRes.data ?? []).map((t: Row) => ({
    id: t.id as string,
    type: t.type as 'income' | 'expense' | 'transfer',
    walletId: t.wallet_id as string,
    currencyCode: t.currency_code as string,
    amount: t.amount as number,
    label: t.label as string,
    category: t.category as string,
    date: t.date as string,
    timestamp: t.timestamp as number,
    toWalletId: (t.to_wallet_id as string) ?? undefined,
    toCurrencyCode: (t.to_currency_code as string) ?? undefined,
    toAmount: (t.to_amount as number) ?? undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any))
  const remoteDeleted: DeletedW[] = (delRes.data ?? []).map((d: Row) => ({
    id: d.id as string,
    wallet: d.wallet as import('@/lib/store/walletStore').Wallet,
    transactions: d.transactions as import('@/lib/store/walletStore').Transaction[],
    deletedAt: d.deleted_at as number,
  }))

  const tombs = await fetchTombstones(sb, uid, [
    'wallet_currencies', 'wallets', 'wallet_transactions', 'wallets_deleted', 'wallet_recurring_expenses',
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = {
    currencies: mergeById<Currency>({
      local: localW.currencies, remote: remoteCurrencies,
      baseline: getBaseline('wallet:currencies'), getId: (c) => c.code,
      tombstones: tombs.get('wallet_currencies'),
    }),
    wallets: mergeById<WalletT>({
      local: localW.wallets, remote: remoteWallets,
      baseline: getBaseline('wallet:wallets'), getId: (w) => w.id,
      tombstones: tombs.get('wallets'),
    }),
    transactions: mergeById<Tx>({
      local: localW.transactions, remote: remoteTx,
      baseline: getBaseline('wallet:transactions'), getId: (t) => t.id,
      getUpdatedAt: (t) => t.timestamp,
      tombstones: tombs.get('wallet_transactions'),
    }),
    distribution: cfgRes.data
      ? (cfgRes.data as Row).distribution as import('@/lib/store/walletStore').DistributionItem[]
      : localW.distribution,
    deletedWallets: mergeById<DeletedW>({
      local: localW.deletedWallets, remote: remoteDeleted,
      baseline: getBaseline('wallet:deleted'), getId: (d) => d.id,
      getUpdatedAt: (d) => d.deletedAt,
      tombstones: tombs.get('wallets_deleted'),
    }),
  }

  // recurringExpenses: solo mergear si el pull no falló (tabla opcional).
  let remoteRecurring: Recurring[] = []
  if (!recRes.error) {
    remoteRecurring = (recRes.data ?? []).map((r: Row) => ({
      id: r.id as string,
      walletId: r.wallet_id as string,
      currencyCode: r.currency_code as string,
      amount: r.amount as number,
      label: r.label as string,
      category: r.category as string,
      dayOfMonth: r.day_of_month as number,
      active: r.active as boolean,
      startDate: r.start_date as string,
      endDate: (r.end_date as string) ?? undefined,
      lastAppliedYearMonth: (r.last_applied_year_month as string) ?? undefined,
      isSubscription: (r.is_subscription as boolean) ?? true,
      notes: (r.notes as string) ?? undefined,
      createdAt: r.created_at as string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any))
    patch.recurringExpenses = mergeById<Recurring>({
      local: localW.recurringExpenses, remote: remoteRecurring,
      baseline: getBaseline('wallet:recurring'), getId: (r) => r.id,
      tombstones: tombs.get('wallet_recurring_expenses'),
    })
  }

  useWalletStore.setState(patch)

  setBaseline('wallet:currencies', remoteCurrencies.map((c) => c.code))
  setBaseline('wallet:wallets', remoteWallets.map((w) => w.id))
  setBaseline('wallet:transactions', remoteTx.map((t) => t.id))
  setBaseline('wallet:deleted', remoteDeleted.map((d) => d.id))
  if (!recRes.error) setBaseline('wallet:recurring', remoteRecurring.map((r) => r.id))
  markSynced('wallet')
  return true
  } finally {
    endPulling('wallet')
  }
}

// ─── TRADING ──────────────────────────────────────────────────────────────────

async function pushTrading() {
  if (!state.userId) return
  // Momento del snapshot: lo que se edite DURANTE el vuelo del push queda
  // con lastModified > syncedAt → sigue contando como unsynced (no se pierde).
  const syncedAt = new Date().toISOString()
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { firms, accounts, strategies, trades, payouts, errors, emotional, scaling } = useTradingStore.getState()

  const firmRows = firms.map((f) => ({
    id: f.id, user_id: uid, name: f.name, color: f.color,
    rules: f.rules, notes: f.notes ?? null, created_at: f.createdAt,
  }))

  const stratRows = strategies.map((s) => ({
    id: s.id, user_id: uid, name: s.name, color: s.color,
    instrument: s.instrument, timeframe: s.timeframe, session: s.session,
    risk_per_trade_pct: s.riskPerTradePct ?? null,
    target_rrr: s.targetRRR ?? null,
    rules: s.rules, active: s.active,
    description: s.description ?? null, created_at: s.createdAt,
  }))

  const accountRows = accounts.map((a) => ({
    id: a.id, user_id: uid, firm_id: a.firmId, alias: a.alias,
    account_size: a.accountSize, evaluation_cost: a.evaluationCost,
    status: a.status, start_date: a.startDate,
    closed_date: a.closedDate ?? null, notes: a.notes ?? null,
    mode: a.mode ?? null,
    max_risk_per_trade_pct: a.maxRiskPerTradePct ?? null,
    max_daily_loss_pct: a.maxDailyLossPct ?? null,
    max_daily_trades: a.maxDailyTrades ?? null,
    target_payout_amount: a.targetPayoutAmount ?? null,
    created_at: a.createdAt,
  }))

  const tradeRows = trades.map((t) => ({
    id: t.id, user_id: uid, account_id: t.accountId, strategy_id: t.strategyId,
    date_time: t.dateTime, exit_date_time: t.exitDateTime ?? null,
    instrument: t.instrument, direction: t.direction,
    planned_pnl: t.plannedPnL, actual_pnl: t.actualPnL,
    r_multiple_strategy: t.rMultipleStrategy ?? null,
    r_multiple_actual: t.rMultipleActual ?? null,
    mood_before: t.moodBefore ?? null, mood_after: t.moodAfter ?? null,
    notes: t.notes ?? null, screenshot_url: t.screenshotUrl ?? null,
    created_at: t.createdAt,
  }))

  const payoutRows = payouts.map((p) => ({
    id: p.id, user_id: uid, account_id: p.accountId,
    amount: p.amount, date: p.date, note: p.note ?? null, created_at: p.createdAt,
  }))

  const errorRows = errors.map((e) => ({
    id: e.id, user_id: uid, trade_id: e.tradeId, strategy_id: e.strategyId,
    account_id: e.accountId, type: e.type, description: e.description,
    screenshot_url: e.screenshotUrl ?? null, created_at: e.createdAt,
  }))

  const emotionalRows = emotional.map((e) => ({
    id: e.id, user_id: uid, date: e.date, mood: e.mood,
    energy_before: e.energyBefore, energy_after: e.energyAfter ?? null,
    description: e.description, tags: e.tags ?? [],
    trade_ids: e.tradeIds ?? [], created_at: e.createdAt,
  }))

  // Upsert — order respects FKs: firms → strategies → accounts → trades/payouts
  if (firmRows.length > 0)     await sb.from('trading_firms').upsert(firmRows)
  if (stratRows.length > 0)    await sb.from('trading_strategies').upsert(stratRows)
  if (accountRows.length > 0)  await sb.from('trading_accounts').upsert(accountRows)
  if (tradeRows.length > 0)    await sb.from('trading_trades').upsert(tradeRows)
  if (payoutRows.length > 0)   await sb.from('trading_payouts').upsert(payoutRows)
  if (errorRows.length > 0)    await sb.from('trading_errors').upsert(errorRows)
  if (emotionalRows.length > 0) await sb.from('trading_emotional').upsert(emotionalRows)

  // Borra lo quitado + tombstones + baseline. Reverse FK order: leaf nodes first.
  await syncDeletes(sb, uid, 'trading_errors', errorRows.map((r) => r.id), 'trading:errors')
  await syncDeletes(sb, uid, 'trading_emotional', emotionalRows.map((r) => r.id), 'trading:emotional')
  await syncDeletes(sb, uid, 'trading_payouts', payoutRows.map((r) => r.id), 'trading:payouts')
  await syncDeletes(sb, uid, 'trading_trades', tradeRows.map((r) => r.id), 'trading:trades')
  await syncDeletes(sb, uid, 'trading_accounts', accountRows.map((r) => r.id), 'trading:accounts')
  await syncDeletes(sb, uid, 'trading_strategies', stratRows.map((r) => r.id), 'trading:strategies')
  await syncDeletes(sb, uid, 'trading_firms', firmRows.map((r) => r.id), 'trading:firms')

  // ─── Scaling System config (singleton JSONB row) ──
  const r = await sb.from('trading_scaling_config').upsert(
    { user_id: uid, payload: scaling, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  if (r.error) {
    reportSyncError(`trading_scaling_config upsert failed: ${r.error.message}. Likely missing migration — run supabase/migration_trading_scaling.sql.`)
    throw r.error
  }
  markSynced('trading', syncedAt)
}

async function pullTrading(): Promise<boolean> {
  if (!state.userId) return false
  startPulling('trading')
  try {
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const [firmRes, stratRes, accRes, tradeRes, payRes, errRes, emotRes, scalingRes] = await Promise.all([
    sb.from('trading_firms').select('*').eq('user_id', uid),
    sb.from('trading_strategies').select('*').eq('user_id', uid),
    sb.from('trading_accounts').select('*').eq('user_id', uid),
    sb.from('trading_trades').select('*').eq('user_id', uid),
    sb.from('trading_payouts').select('*').eq('user_id', uid),
    sb.from('trading_errors').select('*').eq('user_id', uid),
    sb.from('trading_emotional').select('*').eq('user_id', uid),
    sb.from('trading_scaling_config').select('*').eq('user_id', uid).maybeSingle(),
  ])

  const anyError = firmRes.error ?? stratRes.error ?? accRes.error ?? tradeRes.error
    ?? payRes.error ?? errRes.error ?? emotRes.error
  if (anyError) {
    console.error('Trading pull failed', anyError)
    return false
  }
  // scalingRes error is non-fatal — if the migration isn't run yet, skip
  // and let the next push fail loudly via the toast.
  if (scalingRes.error) {
    console.warn('Trading scaling pull failed (run migration_trading_scaling.sql):', scalingRes.error)
  }

  const hasData = [firmRes, stratRes, accRes, tradeRes, payRes, errRes, emotRes]
    .some((r) => (r.data?.length ?? 0) > 0) || !!scalingRes.data
  if (!hasData) return false

  const localT = useTradingStore.getState()
  type Firm = (typeof localT.firms)[number]
  type Strat = (typeof localT.strategies)[number]
  type Account = (typeof localT.accounts)[number]
  type Trade = (typeof localT.trades)[number]
  type Payout = (typeof localT.payouts)[number]
  type TErr = (typeof localT.errors)[number]
  type Emot = (typeof localT.emotional)[number]

  const remoteFirms: Firm[] = (firmRes.data ?? []).map((f: Row) => ({
    id: f.id as string, name: f.name as string, color: f.color as string,
    rules: f.rules as import('@/lib/store/tradingStore').PropFirmRules,
    notes: (f.notes as string) ?? undefined, createdAt: f.created_at as string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any))
  const remoteStrats: Strat[] = (stratRes.data ?? []).map((s: Row) => ({
    id: s.id as string, name: s.name as string, color: s.color as string,
    instrument: s.instrument as string, timeframe: s.timeframe as string,
    session: s.session as string,
    riskPerTradePct: (s.risk_per_trade_pct as number) ?? undefined,
    targetRRR: (s.target_rrr as number) ?? undefined,
    rules: (s.rules as string) ?? '',
    active: s.active as boolean,
    description: (s.description as string) ?? undefined,
    createdAt: s.created_at as string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any))
  const remoteAccounts: Account[] = (accRes.data ?? []).map((a: Row) => ({
    id: a.id as string, firmId: a.firm_id as string, alias: a.alias as string,
    accountSize: a.account_size as number, evaluationCost: a.evaluation_cost as number,
    status: a.status as import('@/lib/store/tradingStore').AccountStatus,
    startDate: a.start_date as string,
    closedDate: (a.closed_date as string) ?? undefined,
    notes: (a.notes as string) ?? undefined,
    mode: (a.mode as import('@/lib/store/tradingStore').AccountMode) ?? undefined,
    maxRiskPerTradePct: (a.max_risk_per_trade_pct as number) ?? undefined,
    maxDailyLossPct: (a.max_daily_loss_pct as number) ?? undefined,
    maxDailyTrades: (a.max_daily_trades as number) ?? undefined,
    targetPayoutAmount: (a.target_payout_amount as number) ?? undefined,
    createdAt: a.created_at as string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any))
  const remoteTrades: Trade[] = (tradeRes.data ?? []).map((t: Row) => ({
    id: t.id as string, accountId: t.account_id as string, strategyId: t.strategy_id as string,
    dateTime: t.date_time as string, exitDateTime: (t.exit_date_time as string) ?? undefined,
    instrument: t.instrument as string,
    direction: t.direction as 'long' | 'short',
    plannedPnL: t.planned_pnl as number, actualPnL: t.actual_pnl as number,
    rMultipleStrategy: (t.r_multiple_strategy as number) ?? undefined,
    rMultipleActual: (t.r_multiple_actual as number) ?? undefined,
    moodBefore: (t.mood_before as import('@/lib/store/tradingStore').Mood) ?? undefined,
    moodAfter: (t.mood_after as import('@/lib/store/tradingStore').Mood) ?? undefined,
    notes: (t.notes as string) ?? undefined,
    screenshotUrl: (t.screenshot_url as string) ?? undefined,
    createdAt: t.created_at as string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any))
  const remotePayouts: Payout[] = (payRes.data ?? []).map((p: Row) => ({
    id: p.id as string, accountId: p.account_id as string,
    amount: p.amount as number, date: p.date as string,
    note: (p.note as string) ?? undefined, createdAt: p.created_at as string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any))
  const remoteErrors: TErr[] = (errRes.data ?? []).map((e: Row) => ({
    id: e.id as string, tradeId: e.trade_id as string,
    strategyId: e.strategy_id as string, accountId: e.account_id as string,
    type: e.type as import('@/lib/store/tradingStore').ErrorType,
    description: e.description as string,
    screenshotUrl: (e.screenshot_url as string) ?? undefined,
    createdAt: e.created_at as string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any))
  const remoteEmotional: Emot[] = (emotRes.data ?? []).map((e: Row) => ({
    id: e.id as string, date: e.date as string,
    mood: e.mood as import('@/lib/store/tradingStore').Mood,
    energyBefore: e.energy_before as number,
    energyAfter: (e.energy_after as number) ?? undefined,
    description: e.description as string,
    tags: (e.tags as string[]) ?? [],
    tradeIds: (e.trade_ids as string[]) ?? [],
    createdAt: e.created_at as string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any))

  // Trading no usa updatedAt → conflicto gana remote. Tombstones globales para
  // que los borrados se propaguen entre devices y no resuciten.
  const tombs = await fetchTombstones(sb, uid, [
    'trading_firms', 'trading_strategies', 'trading_accounts', 'trading_trades',
    'trading_payouts', 'trading_errors', 'trading_emotional',
  ])
  const m = <T,>(local: T[], remote: T[], key: string, table: string, getId: (x: T) => string) =>
    mergeById<T>({ local, remote, baseline: getBaseline(key), getId, tombstones: tombs.get(table) })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = {
    firms:      m(localT.firms,      remoteFirms,     'trading:firms',      'trading_firms',      (x) => x.id),
    strategies: m(localT.strategies, remoteStrats,    'trading:strategies', 'trading_strategies', (x) => x.id),
    accounts:   m(localT.accounts,   remoteAccounts,  'trading:accounts',   'trading_accounts',   (x) => x.id),
    trades:     m(localT.trades,     remoteTrades,    'trading:trades',     'trading_trades',     (x) => x.id),
    payouts:    m(localT.payouts,    remotePayouts,   'trading:payouts',    'trading_payouts',    (x) => x.id),
    errors:     m(localT.errors,     remoteErrors,    'trading:errors',     'trading_errors',     (x) => x.id),
    emotional:  m(localT.emotional,  remoteEmotional, 'trading:emotional',  'trading_emotional',  (x) => x.id),
    // Scaling: solo pisar si la fila remota existe (singleton).
    ...(scalingRes.data
      ? { scaling: (scalingRes.data as { payload: unknown }).payload as import('@/lib/store/tradingStore').ScalingConfig }
      : {}),
  }
  useTradingStore.setState(patch)

  setBaseline('trading:firms', remoteFirms.map((x) => x.id))
  setBaseline('trading:strategies', remoteStrats.map((x) => x.id))
  setBaseline('trading:accounts', remoteAccounts.map((x) => x.id))
  setBaseline('trading:trades', remoteTrades.map((x) => x.id))
  setBaseline('trading:payouts', remotePayouts.map((x) => x.id))
  setBaseline('trading:errors', remoteErrors.map((x) => x.id))
  setBaseline('trading:emotional', remoteEmotional.map((x) => x.id))
  markSynced('trading')
  return true
  } finally {
    endPulling('trading')
  }
}

// ─── HABITS ───────────────────────────────────────────────────────────────────

async function pushHabits() {
  if (!state.userId) return
  // Momento del snapshot: lo que se edite DURANTE el vuelo del push queda
  // con lastModified > syncedAt → sigue contando como unsynced (no se pierde).
  const syncedAt = new Date().toISOString()
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { habits } = useHabitsStore.getState()

  // Position in the local array IS the canonical order — push it explicitly
  // so reordering from any device persists and propagates back.
  const rows = habits.map((h, idx) => ({
    id: h.id, user_id: uid, name: h.name, icon: h.icon, color: h.color,
    target_days: h.targetDays, completed_dates: h.completedDates,
    skipped_dates: h.skippedDates ?? [],
    category: h.category, created_at: h.createdAt,
    sort_order: idx,
    reminder_time: h.reminderTime ?? null,
  }))

  if (rows.length > 0) {
    const r = await sb.from('habits').upsert(rows)
    if (r.error) {
      // CRÍTICO: si fallaba silencioso (RLS, missing column de migration
      // no aplicada, etc.), igual llamábamos markSynced más abajo →
      // mentíamos que estaba en sync → al recargar pull-first pisaba
      // las marcas locales. Ahora throw → schedule().catch lo agarra →
      // markSynced NO corre → lastModified > lastSynced → próximo
      // reload push-first reintenta.
      reportSyncError(`habits upsert failed: ${r.error.message}. ¿Falta aplicar alguna migration de habits?`)
      throw r.error
    }
  }
  await syncDeletes(sb, uid, 'habits', rows.map((r) => r.id), 'habits:habits')
  markSynced('habits', syncedAt)
}

async function pullHabits(): Promise<boolean> {
  if (!state.userId) return false
  startPulling('habits')
  try {
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  // Order by sort_order so manual reordering persists across devices. Rows
  // without sort_order (legacy) fall to the end, then ordered by created_at.
  const res = await sb.from('habits').select('*').eq('user_id', uid)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
  if (res.error) {
    console.error('Habits pull failed', res.error)
    return false
  }
  if ((res.data?.length ?? 0) === 0) { markSynced('habits'); return false }

  const localHabits = useHabitsStore.getState().habits
  type Habit = (typeof localHabits)[number]
  const remoteHabits: Habit[] = (res.data ?? []).map((h: Row) => ({
    id: h.id as string,
    name: h.name as string,
    icon: h.icon as string,
    color: h.color as string,
    targetDays: (h.target_days as number[]) ?? [],
    completedDates: (h.completed_dates as string[]) ?? [],
    skippedDates: (h.skipped_dates as string[]) ?? [],
    category: h.category as string,
    createdAt: h.created_at as string,
    reminderTime: (h.reminder_time as string | null) ?? undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any))

  // Conflicto de hábito → mergeHabit: UNE completedDates/skippedDates para no
  // perder ninguna marca diaria hecha en otro device (causa del "snapshot a la
  // mitad"). Escalares toman remote.
  const tombs = await fetchTombstones(sb, uid, ['habits'])
  const merged = mergeById<Habit>({
    local: localHabits,
    remote: remoteHabits,
    baseline: getBaseline('habits:habits'),
    getId: (h) => h.id,
    mergeItem: mergeHabit,
    tombstones: tombs.get('habits'),
  })

  // Reordenar: orden remoto (sort_order) primero, luego los locales nuevos
  // (aún sin pushear) preservando su orden local. El array es la fuente
  // canónica del orden, así que esto mantiene el reordenamiento entre devices.
  const byId = new Map(merged.map((h) => [h.id, h]))
  const ordered: Habit[] = []
  for (const r of remoteHabits) { const h = byId.get(r.id); if (h) { ordered.push(h); byId.delete(r.id) } }
  for (const l of localHabits) { const h = byId.get(l.id); if (h) { ordered.push(h); byId.delete(l.id) } }

  useHabitsStore.setState({ habits: ordered })
  setBaseline('habits:habits', remoteHabits.map((h) => h.id))
  markSynced('habits')
  return true
  } finally {
    endPulling('habits')
  }
}

// ─── SPI (weekly planning sessions) ───────────────────────────────────────────

async function pushSPI() {
  if (!state.userId) return
  // Momento del snapshot: lo que se edite DURANTE el vuelo del push queda
  // con lastModified > syncedAt → sigue contando como unsynced (no se pierde).
  const syncedAt = new Date().toISOString()
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { sessions, bitacoraEntries, template } = useSPIStore.getState()

  // ── Template (singleton: títulos de sección, carriles, checklist) ──
  // LWW por version. Solo pisamos el remoto si el local es >= remoto, así un
  // device con template viejo no clobberea el renombrado hecho en otro device.
  // Tabla opcional — si falta la migration, warn y seguimos (no rompe el push).
  try {
    const localVer = template.version ?? 0
    const { data: remoteT } = await sb.from('spi_template')
      .select('version').eq('user_id', uid).maybeSingle()
    const remoteVer = (remoteT as { version?: number } | null)?.version ?? -1
    if (remoteVer <= localVer) {
      const r = await sb.from('spi_template').upsert(
        { user_id: uid, payload: template, version: localVer, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      if (r.error) {
        console.warn('[spi_template push] failed (run migration_spi_template.sql?):', r.error.message)
      }
    }
  } catch (e) {
    console.warn('[spi_template push] skipped:', e)
  }

  // ── Sessions ──────────────────────────────────────────────────────
  // Each session stored as one row; full payload in JSONB. We strip the
  // top-level metadata (week_start_date, closed_at) into columns for query
  // performance later (e.g. "all closed sessions this quarter").
  const sessRows = sessions.map((sess) => ({
    id: sess.id,
    user_id: uid,
    week_start_date: sess.weekStartDate,
    created_at: sess.createdAt,
    updated_at: sess.updatedAt,
    closed_at: sess.closedAt ?? null,
    payload: sess,
  }))
  if (sessRows.length > 0) {
    const r = await sb.from('spi_sessions').upsert(sessRows)
    if (r.error) { reportSyncError(`spi_sessions upsert failed: ${r.error.message}`); throw r.error }
  }
  await syncDeletes(sb, uid, 'spi_sessions', sessRows.map((r) => r.id), 'spi:sessions')

  // ── Bitácora (cross-session) ──────────────────────────────────────
  const bitRows = bitacoraEntries.map((e) => ({
    id: e.id,
    user_id: uid,
    kind: e.kind,
    situation: e.situation,
    domino_effect: e.dominoEffect,
    resolved: e.resolved ?? false,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  }))
  if (bitRows.length > 0) {
    const r = await sb.from('spi_bitacora').upsert(bitRows)
    if (r.error) { reportSyncError(`spi_bitacora upsert failed: ${r.error.message}`); throw r.error }
  }
  await syncDeletes(sb, uid, 'spi_bitacora', bitRows.map((r) => r.id), 'spi:bitacora')
  markSynced('spi', syncedAt)
}

async function pullSPI(): Promise<boolean> {
  if (!state.userId) return false
  startPulling('spi')
  try {
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const [sessRes, bitRes, templateRes] = await Promise.all([
    sb.from('spi_sessions').select('*').eq('user_id', uid)
      .order('week_start_date', { ascending: false }),
    sb.from('spi_bitacora').select('*').eq('user_id', uid)
      .order('created_at', { ascending: false }),
    sb.from('spi_template').select('*').eq('user_id', uid).maybeSingle(),
  ])

  if (sessRes.error) { console.error('SPI sessions pull failed', sessRes.error); return false }
  if (bitRes.error)  { console.error('SPI bitacora pull failed', bitRes.error) }

  // ── Template (singleton) — independiente de las sesiones, se aplica SIEMPRE.
  // Adoptamos el remoto solo si su version es mayor que la local (LWW). Tabla
  // opcional: si falta la migration, templateRes.error → warn y seguimos.
  if (templateRes.error) {
    console.warn('[spi_template pull] failed (run migration_spi_template.sql?):', templateRes.error.message)
  } else if (templateRes.data) {
    const row = templateRes.data as { payload: unknown; version?: number }
    const remoteVer = row.version ?? 0
    const localVer = useSPIStore.getState().template.version ?? 0
    if (remoteVer > localVer) {
      useSPIStore.setState({ template: row.payload as import('@/lib/spi/types').SPITemplate })
    }
  }

  const hasSessions = (sessRes.data?.length ?? 0) > 0
  const hasBitacora = (bitRes.data?.length ?? 0) > 0
  if (!hasSessions && !hasBitacora) { markSynced('spi'); return false }

  type SessRow = { payload: unknown }
  type BitRow = {
    id: string; kind: 'working' | 'broken'
    situation: string; domino_effect: string
    resolved: boolean | null
    created_at: string; updated_at: string
  }

  // Sanitize: sessions stored before fields como `selectedLanes`,
  // `mainChecklist`, `tasks`, `values` existieran necesitan defaults para
  // que los renderers (que hacen `session.selectedLanes.length` etc.) no
  // crasheen.
  //
  // IMPORTANTE: spread `...s` PRIMERO para preservar cualquier campo
  // opcional (selectedKpiIds, weekSnapshot, etc.). Si solo enumerábamos
  // explícitamente, cualquier campo nuevo se perdía silenciosamente al
  // hacer pull. Antes pasaba con `selectedKpiIds` — el push subía la
  // session entera al payload JSONB pero el pull la sanitizaba dejando
  // solo los campos enumerados → los KPIs activados se borraban al
  // refrescar la página.
  const sanitize = (raw: unknown): import('@/lib/spi/types').SPISession => {
    const s = (raw ?? {}) as Partial<import('@/lib/spi/types').SPISession>
    return {
      ...s,
      id: s.id ?? '',
      weekStartDate: s.weekStartDate ?? '',
      createdAt: s.createdAt ?? new Date().toISOString(),
      updatedAt: s.updatedAt ?? new Date().toISOString(),
      closedAt: s.closedAt,
      mainChecklist: s.mainChecklist ?? {},
      selectedLanes: Array.isArray(s.selectedLanes) ? s.selectedLanes : [],
      values: s.values ?? {},
      tasks: Array.isArray(s.tasks) ? s.tasks : [],
      mood: s.mood,
      score: s.score,
      notes: s.notes,
      templateVersion: s.templateVersion ?? 1,
      // Campos opcionales nuevos — el spread los preserva, pero los
      // sanitizamos por las dudas para que sean del tipo correcto.
      selectedKpiIds: Array.isArray(s.selectedKpiIds) ? s.selectedKpiIds : undefined,
    }
  }

  const remoteSessions: import('@/lib/spi/types').SPISession[] =
    (sessRes.data ?? []).map((r: SessRow) => sanitize(r.payload))
  const remoteBitacora: import('@/lib/spi/types').BitacoraEntry[] = (bitRes.data ?? []).map((r: BitRow) => ({
    id: r.id,
    kind: r.kind,
    situation: r.situation,
    dominoEffect: r.domino_effect,
    resolved: r.resolved ?? false,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))

  const localSPI = useSPIStore.getState()
  const tombs = await fetchTombstones(sb, uid, ['spi_sessions', 'spi_bitacora'])

  // PROTECCIÓN ANTI-WIPE DEL PULL: si la nube NO tiene sesiones pero este
  // device SÍ, jamás las borramos (ni por tombstones ni por baseline). Es el
  // caso "otro device se vació y borró la nube, pero acá todavía están": este
  // device es el que las tiene que RESTAURAR, no perderlas. El push posterior
  // las vuelve a subir. Sin esto, el merge las dropea por tombDead.
  const mergedSessions = (remoteSessions.length === 0 && localSPI.sessions.length > 0)
    ? localSPI.sessions
    : mergeById<import('@/lib/spi/types').SPISession>({
        local: localSPI.sessions,
        remote: remoteSessions,
        baseline: getBaseline('spi:sessions'),
        getId: (s) => s.id,
        getUpdatedAt: (s) => s.updatedAt,
        mergeItem: mergeSpiSession,
        tombstones: tombs.get('spi_sessions'),
      })

  const mergedBitacora = mergeById<import('@/lib/spi/types').BitacoraEntry>({
    local: localSPI.bitacoraEntries,
    remote: remoteBitacora,
    baseline: getBaseline('spi:bitacora'),
    getId: (e) => e.id,
    getUpdatedAt: (e) => e.updatedAt,
    tombstones: tombs.get('spi_bitacora'),
  })

  useSPIStore.setState({
    sessions: mergedSessions,
    bitacoraEntries: mergedBitacora,
  })

  setBaseline('spi:sessions', remoteSessions.map((s) => s.id))
  setBaseline('spi:bitacora', remoteBitacora.map((e) => e.id))
  markSynced('spi')
  return true
  } finally {
    endPulling('spi')
  }
}

// ─── PROYECCIÓN (annual / quarterly / monthly plans) ──────────────────────────

async function pushProjection() {
  if (!state.userId) return
  // Momento del snapshot: lo que se edite DURANTE el vuelo del push queda
  // con lastModified > syncedAt → sigue contando como unsynced (no se pierde).
  const syncedAt = new Date().toISOString()
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { plans } = useProjectionStore.getState()

  const rows = plans.map((plan) => ({
    id: plan.id,
    user_id: uid,
    level: plan.level,
    period_key: plan.periodKey,
    created_at: plan.createdAt,
    updated_at: plan.updatedAt,
    closed_at: plan.closedAt ?? null,
    payload: plan,
  }))

  if (rows.length > 0) {
    const r = await sb.from('projection_plans').upsert(rows)
    if (r.error) { reportSyncError(`projection_plans upsert failed: ${r.error.message}`); throw r.error }
  }
  await syncDeletes(sb, uid, 'projection_plans', rows.map((r) => r.id), 'projection:plans')
  markSynced('projection', syncedAt)
}

async function pullProjection(): Promise<boolean> {
  if (!state.userId) return false
  startPulling('projection')
  try {
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const res = await sb.from('projection_plans').select('*').eq('user_id', uid)
    .order('period_key', { ascending: false })
  if (res.error) { console.error('Projection pull failed', res.error); return false }
  if ((res.data?.length ?? 0) === 0) { markSynced('projection'); return false }

  type Row = { payload: unknown }
  const sanitize = (raw: unknown): import('@/lib/projection/types').ProjectionPlan => {
    const p = (raw ?? {}) as Partial<import('@/lib/projection/types').ProjectionPlan>
    return {
      id: p.id ?? '',
      level: p.level ?? 'year',
      periodKey: p.periodKey ?? '',
      createdAt: p.createdAt ?? new Date().toISOString(),
      updatedAt: p.updatedAt ?? new Date().toISOString(),
      closedAt: p.closedAt,
      values: p.values ?? {},
      mood: p.mood,
      score: p.score,
      notes: p.notes,
      templateVersion: p.templateVersion ?? 1,
      selectedLanes: p.selectedLanes,
    }
  }
  const remotePlans: import('@/lib/projection/types').ProjectionPlan[] =
    (res.data ?? []).map((r: Row) => sanitize(r.payload))
  const tombs = await fetchTombstones(sb, uid, ['projection_plans'])
  const mergedPlans = mergeById<import('@/lib/projection/types').ProjectionPlan>({
    local: useProjectionStore.getState().plans,
    remote: remotePlans,
    baseline: getBaseline('projection:plans'),
    getId: (p) => p.id,
    getUpdatedAt: (p) => p.updatedAt,
    mergeItem: mergeProjectionPlan,
    tombstones: tombs.get('projection_plans'),
  })
  useProjectionStore.setState({ plans: mergedPlans })
  setBaseline('projection:plans', remotePlans.map((p) => p.id))
  markSynced('projection')
  return true
  } finally {
    endPulling('projection')
  }
}

// ─── LAB (mind/emotion exercise sessions) ────────────────────────────────────

async function pushLab() {
  if (!state.userId) return
  // Momento del snapshot: lo que se edite DURANTE el vuelo del push queda
  // con lastModified > syncedAt → sigue contando como unsynced (no se pierde).
  const syncedAt = new Date().toISOString()
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { sessions, beliefs, customExercises, customCategories } = useLabStore.getState()

  // ─── Sessions ──
  const rows = sessions.map((sess) => ({
    id: sess.id,
    user_id: uid,
    exercise_key: sess.exerciseKey,
    category_key: sess.categoryKey,
    status: sess.status,
    created_at: sess.createdAt,
    updated_at: sess.updatedAt,
    closed_at: sess.closedAt ?? null,
    spi_session_id: sess.spiSessionId ?? null,
    payload: sess,
  }))

  if (rows.length > 0) await sb.from('lab_sessions').upsert(rows)
  await syncDeletes(sb, uid, 'lab_sessions', rows.map((r) => r.id), 'lab:sessions')

  // ─── Beliefs ──
  const beliefRows = beliefs.map((b) => ({
    id: b.id,
    user_id: uid,
    category_key: b.categoryKey,
    text: b.text,
    status: b.status,
    created_at: b.createdAt,
    updated_at: b.updatedAt,
    resolved_at: b.resolvedAt ?? null,
    insight: b.insight ?? null,
    linked_session_ids: b.linkedSessionIds ?? [],
  }))
  if (beliefRows.length > 0) {
    const r = await sb.from('lab_beliefs').upsert(beliefRows)
    if (r.error) {
      reportSyncError(`lab_beliefs upsert failed: ${r.error.message}. Likely missing migration — run supabase/migration_lab_beliefs.sql.`)
      throw r.error
    }
  }
  await syncDeletes(sb, uid, 'lab_beliefs', beliefRows.map((r) => r.id), 'lab:beliefs')

  // ─── Config (ejercicios + categorías custom) — singleton ──
  {
    const r = await sb.from('lab_config').upsert(
      {
        user_id: uid,
        custom_exercises: customExercises,
        custom_categories: customCategories,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    if (r.error) {
      reportSyncError(`lab_config upsert failed (¿corriste migration_lab_config.sql?): ${r.error.message}`)
      throw r.error
    }
  }
  markSynced('lab', syncedAt)
}

async function pullLab(): Promise<boolean> {
  if (!state.userId) return false
  startPulling('lab')
  try {
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  // Run in parallel — independent tables.
  const [sessionRes, beliefRes, cfgRes] = await Promise.all([
    sb.from('lab_sessions').select('*').eq('user_id', uid).order('updated_at', { ascending: false }),
    sb.from('lab_beliefs').select('*').eq('user_id', uid).order('updated_at', { ascending: false }),
    sb.from('lab_config').select('*').eq('user_id', uid).maybeSingle(),
  ])

  if (sessionRes.error) { console.error('Lab sessions pull failed', sessionRes.error); return false }

  // Config singleton (customs) — tabla opcional: si falta la migración,
  // warneamos y mantenemos los customs locales intactos. Si la fila existe,
  // pisamos (LWW a nivel config, igual que gym/food).
  let customExercises: import('@/lib/lab/types').LabExercise[] | undefined
  let customCategories: import('@/lib/lab/types').LabCategory[] | undefined
  if (cfgRes.error) {
    console.warn('Lab config pull failed (run migration_lab_config.sql):', cfgRes.error)
  } else if (cfgRes.data) {
    const c = cfgRes.data as Row
    customExercises = (c.custom_exercises as import('@/lib/lab/types').LabExercise[]) ?? []
    customCategories = (c.custom_categories as import('@/lib/lab/types').LabCategory[]) ?? []
  }
  // Beliefs table is optional — if the migration isn't run yet, we get an
  // error but don't fail the whole pull. Just warn and continue with empty.
  let beliefs: import('@/lib/lab/types').LabBelief[] = []
  if (beliefRes.error) {
    console.warn('Lab beliefs pull failed (run migration_lab_beliefs.sql):', beliefRes.error)
  } else {
    type BeliefRow = {
      id: string; category_key: string; text: string
      status: import('@/lib/lab/types').LabBeliefStatus
      created_at: string; updated_at: string
      resolved_at: string | null; insight: string | null
      linked_session_ids: string[] | null
    }
    beliefs = ((beliefRes.data as BeliefRow[] | null) ?? []).map((r) => ({
      id: r.id,
      categoryKey: r.category_key,
      text: r.text,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      resolvedAt: r.resolved_at ?? undefined,
      insight: r.insight ?? undefined,
      linkedSessionIds: r.linked_session_ids ?? [],
    }))
  }

  const hasSessions = (sessionRes.data?.length ?? 0) > 0
  const hasBeliefs = beliefs.length > 0
  const hasCustoms = customExercises !== undefined || customCategories !== undefined
  if (!hasSessions && !hasBeliefs && !hasCustoms) { markSynced('lab'); return false }

  type LabRow = { payload: unknown }
  const sanitize = (raw: unknown): import('@/lib/lab/types').LabSession => {
    const p = (raw ?? {}) as Partial<import('@/lib/lab/types').LabSession>
    return {
      id: p.id ?? '',
      exerciseKey: p.exerciseKey ?? '',
      categoryKey: p.categoryKey ?? '',
      title: p.title ?? 'Sesión',
      status: p.status ?? 'open',
      createdAt: p.createdAt ?? new Date().toISOString(),
      updatedAt: p.updatedAt ?? new Date().toISOString(),
      closedAt: p.closedAt,
      values: p.values ?? {},
      outcome: p.outcome,
      spiSessionId: p.spiSessionId,
      linkedBeliefId: p.linkedBeliefId,
      autoTitled: p.autoTitled,
    }
  }
  const remoteSessions: import('@/lib/lab/types').LabSession[] =
    (sessionRes.data ?? []).map((r: LabRow) => sanitize(r.payload))
  const localLab = useLabStore.getState()
  const tombs = await fetchTombstones(sb, uid, ['lab_sessions', 'lab_beliefs'])

  const mergedSessions = mergeById<import('@/lib/lab/types').LabSession>({
    local: localLab.sessions,
    remote: remoteSessions,
    baseline: getBaseline('lab:sessions'),
    getId: (s) => s.id,
    getUpdatedAt: (s) => s.updatedAt,
    mergeItem: mergeLabSession,
    tombstones: tombs.get('lab_sessions'),
  })
  setBaseline('lab:sessions', remoteSessions.map((s) => s.id))

  // Beliefs: solo mergear si el pull no falló (tabla opcional). Si falló,
  // mantenemos los locales intactos para no perderlos.
  const mergedBeliefs = beliefRes.error
    ? localLab.beliefs
    : mergeById<import('@/lib/lab/types').LabBelief>({
        local: localLab.beliefs,
        remote: beliefs,
        baseline: getBaseline('lab:beliefs'),
        getId: (b) => b.id,
        getUpdatedAt: (b) => b.updatedAt,
        tombstones: tombs.get('lab_beliefs'),
      })
  if (!beliefRes.error) setBaseline('lab:beliefs', beliefs.map((b) => b.id))

  useLabStore.setState({
    sessions: mergedSessions,
    beliefs: mergedBeliefs,
    // Solo pisar customs si la fila remota existía (si no, mantener locales).
    ...(customExercises !== undefined ? { customExercises } : {}),
    ...(customCategories !== undefined ? { customCategories } : {}),
  })
  markSynced('lab')
  return true
  } finally {
    endPulling('lab')
  }
}

// ─── MIND MAPS (mapas mentales) ──────────────────────────────────────────────

async function pushMindMaps() {
  if (!state.userId) return
  // Momento del snapshot: lo que se edite DURANTE el vuelo del push queda
  // con lastModified > syncedAt → sigue contando como unsynced (no se pierde).
  const syncedAt = new Date().toISOString()
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { maps } = useMindMapStore.getState()

  const rows = maps.map((m) => ({
    id: m.id,
    user_id: uid,
    title: m.title,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
    payload: m,
  }))

  if (rows.length > 0) {
    const r = await sb.from('mindmaps').upsert(rows)
    if (r.error) {
      reportSyncError(`mindmaps upsert failed: ${r.error.message}. Likely missing migration — run supabase/migration_mindmaps.sql.`)
      throw r.error
    }
  }
  await syncDeletes(sb, uid, 'mindmaps', rows.map((r) => r.id), 'mindmaps:maps')
  markSynced('mindmaps', syncedAt)
}

async function pullMindMaps(): Promise<boolean> {
  if (!state.userId) return false
  startPulling('mindmaps')
  try {
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const res = await sb.from('mindmaps').select('*').eq('user_id', uid)
    .order('updated_at', { ascending: false })
  if (res.error) {
    console.error('Mindmaps pull failed (run migration_mindmaps.sql?):', res.error)
    return false
  }
  if ((res.data?.length ?? 0) === 0) { markSynced('mindmaps'); return false }

  type MapRow = { payload: unknown }
  const sanitize = (raw: unknown): import('@/lib/store/mindmapStore').MindMap => {
    const p = (raw ?? {}) as Partial<import('@/lib/store/mindmapStore').MindMap>
    return {
      id: p.id ?? '',
      title: p.title ?? 'Mapa',
      nodes: Array.isArray(p.nodes) ? p.nodes : [],
      edges: Array.isArray(p.edges) ? p.edges : [],
      createdAt: p.createdAt ?? new Date().toISOString(),
      updatedAt: p.updatedAt ?? new Date().toISOString(),
    }
  }
  const remoteMaps: import('@/lib/store/mindmapStore').MindMap[] =
    (res.data ?? []).map((r: MapRow) => sanitize(r.payload))
  const tombs = await fetchTombstones(sb, uid, ['mindmaps'])
  const mergedMaps = mergeById<import('@/lib/store/mindmapStore').MindMap>({
    local: useMindMapStore.getState().maps,
    remote: remoteMaps,
    baseline: getBaseline('mindmaps:maps'),
    getId: (m) => m.id,
    getUpdatedAt: (m) => m.updatedAt,
    tombstones: tombs.get('mindmaps'),
  })
  useMindMapStore.setState({ maps: mergedMaps })
  setBaseline('mindmaps:maps', remoteMaps.map((m) => m.id))
  markSynced('mindmaps')
  return true
  } finally {
    endPulling('mindmaps')
  }
}

// ─── BACKTESTS (hojas de backtesting de trading) ─────────────────────────────
// Mismo patrón que mindmaps: cada hoja (set) viaja como UN blob JSONB.
// Merge: LWW por updatedAt + tombstones. Ver migration_trading_backtests.sql.

async function pushBacktests() {
  if (!state.userId) return
  // Momento del snapshot: lo que se edite DURANTE el vuelo del push queda
  // con lastModified > syncedAt → sigue contando como unsynced (no se pierde).
  const syncedAt = new Date().toISOString()
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { sets } = useBacktestStore.getState()

  const rows = sets.map((x) => ({
    id: x.id,
    user_id: uid,
    name: x.name,
    created_at: x.createdAt,
    updated_at: x.updatedAt,
    payload: x,
  }))

  if (rows.length > 0) {
    const r = await sb.from('trading_backtests').upsert(rows)
    if (r.error) {
      reportSyncError(`trading_backtests upsert failed: ${r.error.message}. Likely missing migration — run supabase/migration_trading_backtests.sql.`)
      throw r.error
    }
  }
  await syncDeletes(sb, uid, 'trading_backtests', rows.map((r) => r.id), 'backtests:sets')
  markSynced('backtests', syncedAt)
}

async function pullBacktests(): Promise<boolean> {
  if (!state.userId) return false
  startPulling('backtests')
  try {
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const res = await sb.from('trading_backtests').select('*').eq('user_id', uid)
    .order('updated_at', { ascending: false })
  if (res.error) {
    console.error('Backtests pull failed (run migration_trading_backtests.sql?):', res.error)
    return false
  }
  if ((res.data?.length ?? 0) === 0) { markSynced('backtests'); return false }

  type SetRow = { payload: unknown }
  const sanitize = (raw: unknown): import('@/lib/store/backtestStore').BacktestSet => {
    const p = (raw ?? {}) as Partial<import('@/lib/store/backtestStore').BacktestSet>
    return {
      id: p.id ?? '',
      name: p.name ?? 'Hoja',
      color: p.color ?? '#10b981',
      strategyId: p.strategyId,
      notes: p.notes,
      columns: Array.isArray(p.columns) ? p.columns : [],
      rows: Array.isArray(p.rows) ? p.rows : [],
      createdAt: p.createdAt ?? new Date().toISOString(),
      updatedAt: p.updatedAt ?? new Date().toISOString(),
    }
  }
  const remoteSets: import('@/lib/store/backtestStore').BacktestSet[] =
    (res.data ?? []).map((r: SetRow) => sanitize(r.payload))
  const tombs = await fetchTombstones(sb, uid, ['trading_backtests'])
  const mergedSets = mergeById<import('@/lib/store/backtestStore').BacktestSet>({
    local: useBacktestStore.getState().sets,
    remote: remoteSets,
    baseline: getBaseline('backtests:sets'),
    getId: (x) => x.id,
    getUpdatedAt: (x) => x.updatedAt,
    tombstones: tombs.get('trading_backtests'),
  })
  useBacktestStore.setState({ sets: mergedSets })
  setBaseline('backtests:sets', remoteSets.map((x) => x.id))
  markSynced('backtests')
  return true
  } finally {
    endPulling('backtests')
  }
}

// ─── MY JOURNAL (diario de aprendizajes) ─────────────────────────────────────
// Una fila por entrada. Merge: LWW por updatedAt + tombstones.
// Ver migration_journal.sql.

async function pushJournal() {
  if (!state.userId) return
  const syncedAt = new Date().toISOString()
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { entries } = useJournalStore.getState()

  const rows = entries.map((e) => ({
    id: e.id,
    user_id: uid,
    entry_date: e.date,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    payload: e,
  }))

  if (rows.length > 0) {
    const r = await sb.from('journal_entries').upsert(rows)
    if (r.error) {
      reportSyncError(`journal_entries upsert failed: ${r.error.message}. Likely missing migration — run supabase/migration_journal.sql.`)
      throw r.error
    }
  }
  await syncDeletes(sb, uid, 'journal_entries', rows.map((r) => r.id), 'journal:entries')
  markSynced('journal', syncedAt)
}

async function pullJournal(): Promise<boolean> {
  if (!state.userId) return false
  startPulling('journal')
  try {
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const res = await sb.from('journal_entries').select('*').eq('user_id', uid)
    .order('entry_date', { ascending: false })
  if (res.error) {
    console.error('Journal pull failed (run migration_journal.sql?):', res.error)
    return false
  }
  if ((res.data?.length ?? 0) === 0) { markSynced('journal'); return false }

  type EntryRow = { payload: unknown }
  const sanitize = (raw: unknown): import('@/lib/store/journalStore').JournalEntry => {
    const p = (raw ?? {}) as Partial<import('@/lib/store/journalStore').JournalEntry>
    return {
      id: p.id ?? '',
      date: p.date ?? new Date().toISOString().slice(0, 10),
      title: p.title ?? '',
      body: p.body ?? '',
      createdAt: p.createdAt ?? new Date().toISOString(),
      updatedAt: p.updatedAt ?? new Date().toISOString(),
    }
  }
  const remoteEntries: import('@/lib/store/journalStore').JournalEntry[] =
    (res.data ?? []).map((r: EntryRow) => sanitize(r.payload))
  const tombs = await fetchTombstones(sb, uid, ['journal_entries'])
  const mergedEntries = mergeById<import('@/lib/store/journalStore').JournalEntry>({
    local: useJournalStore.getState().entries,
    remote: remoteEntries,
    baseline: getBaseline('journal:entries'),
    getId: (x) => x.id,
    getUpdatedAt: (x) => x.updatedAt,
    tombstones: tombs.get('journal_entries'),
  })
  useJournalStore.setState({ entries: mergedEntries })
  setBaseline('journal:entries', remoteEntries.map((x) => x.id))
  markSynced('journal')
  return true
  } finally {
    endPulling('journal')
  }
}

// ─── MAPAS DE CONCEPTOS (materias en modo 'conceptos') ───────────────────────
// Una fila por mapa (id = materiaId). Merge: LWW por updatedAt + tombstones.
// Ver migration_study_concepts.sql.

async function pushConcepts() {
  if (!state.userId) return
  const syncedAt = new Date().toISOString()
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { maps } = useConceptStore.getState()

  const rows = maps.map((m) => ({
    id: m.materiaId,
    user_id: uid,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
    payload: m,
  }))

  if (rows.length > 0) {
    const r = await sb.from('study_concept_maps').upsert(rows)
    if (r.error) {
      reportSyncError(`study_concept_maps upsert failed: ${r.error.message}. Likely missing migration — run supabase/migration_study_concepts.sql.`)
      throw r.error
    }
  }
  await syncDeletes(sb, uid, 'study_concept_maps', rows.map((r) => r.id), 'concepts:maps')
  markSynced('concepts', syncedAt)
}

async function pullConcepts(): Promise<boolean> {
  if (!state.userId) return false
  startPulling('concepts')
  try {
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const res = await sb.from('study_concept_maps').select('*').eq('user_id', uid)
    .order('updated_at', { ascending: false })
  if (res.error) {
    console.error('Concept maps pull failed (run migration_study_concepts.sql?):', res.error)
    return false
  }
  if ((res.data?.length ?? 0) === 0) { markSynced('concepts'); return false }

  type MapRow = { payload: unknown }
  const sanitize = (raw: unknown): import('@/lib/study/concepts').ConceptMap => {
    const p = (raw ?? {}) as Partial<import('@/lib/study/concepts').ConceptMap>
    return {
      materiaId: p.materiaId ?? '',
      areas: Array.isArray(p.areas) ? p.areas : [],
      concepts: Array.isArray(p.concepts) ? p.concepts : [],
      createdAt: p.createdAt ?? new Date().toISOString(),
      updatedAt: p.updatedAt ?? new Date().toISOString(),
    }
  }
  const remoteMaps: import('@/lib/study/concepts').ConceptMap[] =
    (res.data ?? []).map((r: MapRow) => sanitize(r.payload))
  const tombs = await fetchTombstones(sb, uid, ['study_concept_maps'])
  const mergedMaps = mergeById<import('@/lib/study/concepts').ConceptMap>({
    local: useConceptStore.getState().maps,
    remote: remoteMaps,
    baseline: getBaseline('concepts:maps'),
    getId: (x) => x.materiaId,
    getUpdatedAt: (x) => x.updatedAt,
    tombstones: tombs.get('study_concept_maps'),
  })
  useConceptStore.setState({ maps: mergedMaps })
  setBaseline('concepts:maps', remoteMaps.map((x) => x.materiaId))
  markSynced('concepts')
  return true
  } finally {
    endPulling('concepts')
  }
}

// ─── APP PREFERENCES (sidebar nav order, language, timezone, schedule, etc.) ─
//
// Singleton row per user. The payload is a flexible JSONB blob that mirrors
// the cross-device-relevant subset of useAppStore. Ephemeral UI state
// (sidebarCollapsed, activeSection, chatOpen, etc.) is INTENTIONALLY excluded
// so that a "collapsed" preference on a laptop doesn't override a "showing"
// preference on a phone.

/** The subset of appStore that gets synced. Adding a field here = it syncs;
 *  removing it = it stays device-local. */
type AppPrefsPayload = {
  language?: import('@/types').Language
  timezone?: string
  autoPurgeCompletedTasks?: boolean
  idealSchedule?: import('@/lib/store/appStore').ScheduleSlot extends infer _ ? Record<string, import('@/lib/store/appStore').ScheduleSlot> : never
  scheduleOrder?: string[]
  dayTypes?: import('@/types').DayTypeConfig[]
  navOrder?: string[]
  contenidoTabOrder?: string[]
  dailyReflectionPrompt?: string
  aiProvider?: 'off' | 'ollama' | 'anthropic'
  anthropicApiKey?: string
  anthropicModel?: string
  metrics?: import('@/types').MetricEntry
}

async function pushAppPrefs() {
  if (!state.userId) return
  // Momento del snapshot: lo que se edite DURANTE el vuelo del push queda
  // con lastModified > syncedAt → sigue contando como unsynced (no se pierde).
  const syncedAt = new Date().toISOString()
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const s = useAppStore.getState()
  const payload: AppPrefsPayload = {
    language: s.language,
    timezone: s.timezone,
    autoPurgeCompletedTasks: s.autoPurgeCompletedTasks,
    idealSchedule: s.idealSchedule,
    scheduleOrder: s.scheduleOrder,
    dayTypes: s.dayTypes,
    navOrder: s.navOrder,
    contenidoTabOrder: s.contenidoTabOrder,
    dailyReflectionPrompt: s.dailyReflectionPrompt,
    aiProvider: s.aiProvider,
    anthropicApiKey: s.anthropicApiKey,
    anthropicModel: s.anthropicModel,
    metrics: s.metrics,
  }
  // Piggyback al sync de prefs: ALSO actualizamos `user_settings` que es
  // la tabla que lee el dispatcher de notificaciones del lado server.
  //
  // Bug que arreglamos: el dispatcher leía timezone='UTC' (default) cuando
  // el user nunca había tocado un toggle de notification settings — porque
  // `user_settings` solo se pusheaba al togglear una pref. Resultado:
  // habit reminders configurados a las 21:00 local (Argentina) NUNCA
  // disparaban porque el dispatcher chequeaba "es 21:00 en UTC?" cuando
  // en Argentina recién eran las 18:00. Para los 21:00 reales en AR,
  // el dispatcher veía 00:00 UTC del día siguiente → no match.
  //
  // Ahora se sincroniza en cada init/edit de prefs, así el timezone está
  // siempre fresco en user_settings. Fire-and-forget para no bloquear.
  void sb.from('user_settings').upsert({
    user_id: uid,
    timezone: s.timezone,
    notification_prefs: {
      spiNewSession: s.notificationPrefs.spiNewSession ?? true,
      taskDueSoon: s.notificationPrefs.taskDueSoon ?? true,
      taskOverdue: s.notificationPrefs.taskOverdue ?? true,
      habitReminder: s.notificationPrefs.habitReminder ?? false,
      habitSpecificReminders: s.notificationPrefs.habitSpecificReminders ?? true,
      emailNotifications: s.notificationPrefs.emailNotifications ?? false,
    },
    habit_reminder_hour: s.notificationPrefs.habitReminderHour ?? 21,
    habit_reminder_minute: s.notificationPrefs.habitReminderMinute ?? 0,
    task_due_lead_minutes: s.notificationPrefs.taskDueLeadMinutes ?? 60,
    spi_new_lead_minutes: s.notificationPrefs.spiNewSessionLeadMinutes ?? 0,
    notification_email: s.notificationPrefs.notificationEmail || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' }).then((r: { error: { message: string } | null }) => {
    if (r.error) console.warn('[user_settings sync from pushAppPrefs] failed:', r.error.message)
  })

  const r = await sb.from('app_preferences').upsert(
    { user_id: uid, payload, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  if (r.error) {
    reportSyncError(`app_preferences upsert failed: ${r.error.message}. Likely missing migration — run supabase/migration_app_preferences.sql.`)
    throw r.error
  }
  markSynced('appPrefs', syncedAt)
}

async function pullAppPrefs(): Promise<boolean> {
  if (!state.userId) return false
  startPulling('appPrefs')
  try {
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const res = await sb.from('app_preferences').select('*').eq('user_id', uid).maybeSingle()
  if (res.error) { console.error('App prefs pull failed', res.error); return false }
  if (!res.data) { markSynced('appPrefs'); return false }
  const p = ((res.data as { payload: unknown }).payload ?? {}) as AppPrefsPayload
  // Merge: only overwrite fields actually present in the remote payload.
  // Anything missing stays at the local/default value — important for
  // forward/backward compat as we evolve the payload shape.
  useAppStore.setState((prev) => ({
    ...prev,
    ...(p.language !== undefined ? { language: p.language } : {}),
    ...(p.timezone !== undefined ? { timezone: p.timezone } : {}),
    ...(p.autoPurgeCompletedTasks !== undefined ? { autoPurgeCompletedTasks: p.autoPurgeCompletedTasks } : {}),
    ...(p.idealSchedule !== undefined ? { idealSchedule: p.idealSchedule } : {}),
    ...(p.scheduleOrder !== undefined ? { scheduleOrder: p.scheduleOrder } : {}),
    ...(p.dayTypes !== undefined ? { dayTypes: p.dayTypes } : {}),
    ...(p.navOrder !== undefined ? { navOrder: p.navOrder } : {}),
    ...(p.contenidoTabOrder !== undefined ? { contenidoTabOrder: p.contenidoTabOrder } : {}),
    ...(p.dailyReflectionPrompt !== undefined ? { dailyReflectionPrompt: p.dailyReflectionPrompt } : {}),
    ...(p.aiProvider !== undefined ? { aiProvider: p.aiProvider } : {}),
    ...(p.anthropicApiKey !== undefined ? { anthropicApiKey: p.anthropicApiKey } : {}),
    ...(p.anthropicModel !== undefined ? { anthropicModel: p.anthropicModel } : {}),
    ...(p.metrics !== undefined ? { metrics: p.metrics } : {}),
  }))
  markSynced('appPrefs')
  return true
  } finally {
    endPulling('appPrefs')
  }
}

// ─── GYM (weight entries + config + routines + sessions) ──────────────────────

async function pushGym() {
  if (!state.userId) return
  // Momento del snapshot: lo que se edite DURANTE el vuelo del push queda
  // con lastModified > syncedAt → sigue contando como unsynced (no se pierde).
  const syncedAt = new Date().toISOString()
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { weightEntries, gymType, phase, weightGoalKg, trainingPlan, routines, sessions } = useGymStore.getState()

  // Weight entries
  const weightRows = weightEntries.map((e) => ({
    id: e.id, user_id: uid, date: e.date, kg: e.kg,
    note: e.note ?? null, created_at: e.createdAt,
  }))
  if (weightRows.length > 0) {
    const r = await sb.from('gym_weight_entries').upsert(weightRows)
    if (r.error) { reportSyncError(`gym_weight_entries upsert failed: ${r.error.message}`); throw r.error }
  }
  await syncDeletes(sb, uid, 'gym_weight_entries', weightRows.map((r) => r.id), 'gym:weights')

  // Config (singleton)
  {
    const r = await sb.from('gym_config').upsert(
      {
        user_id: uid,
        gym_type: gymType,
        phase,
        weight_goal_kg: weightGoalKg,
        training_plan: trainingPlan,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    // Si falla por columna inexistente, casi seguro falta correr
    // migration_gym_training_plan.sql. Antes este upsert tragaba el error
    // en silencio → la config de gym no sincronizaba sin feedback.
    if (r.error) { reportSyncError(`gym_config upsert failed (¿corriste migration_gym_training_plan.sql?): ${r.error.message}`); throw r.error }
  }

  // Routines (nested exercises as JSONB)
  const routineRows = routines.map((r) => ({
    id: r.id, user_id: uid, name: r.name, day_label: r.dayLabel,
    exercises: r.exercises,
  }))
  if (routineRows.length > 0) {
    const r = await sb.from('gym_routines').upsert(routineRows)
    if (r.error) { reportSyncError(`gym_routines upsert failed: ${r.error.message}`); throw r.error }
  }
  await syncDeletes(sb, uid, 'gym_routines', routineRows.map((r) => r.id), 'gym:routines')

  // Sessions (nested exercises + sets as JSONB). activeSession is local-only.
  const sessionRows = sessions.map((s) => ({
    id: s.id, user_id: uid, date: s.date, name: s.name,
    routine_id: s.routineId ?? null,
    exercises: s.exercises,
    started_at: s.startedAt,
    ended_at: s.endedAt ?? null,
    notes: s.notes ?? null,
  }))
  if (sessionRows.length > 0) {
    const r = await sb.from('gym_sessions').upsert(sessionRows)
    if (r.error) { reportSyncError(`gym_sessions upsert failed: ${r.error.message}`); throw r.error }
  }
  await syncDeletes(sb, uid, 'gym_sessions', sessionRows.map((r) => r.id), 'gym:sessions')
  markSynced('gym', syncedAt)
}

async function pullGym(): Promise<boolean> {
  if (!state.userId) return false
  startPulling('gym')
  try {
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const [weightRes, cfgRes, routinesRes, sessionsRes] = await Promise.all([
    sb.from('gym_weight_entries').select('*').eq('user_id', uid).order('date', { ascending: false }),
    sb.from('gym_config').select('*').eq('user_id', uid).maybeSingle(),
    sb.from('gym_routines').select('*').eq('user_id', uid),
    sb.from('gym_sessions').select('*').eq('user_id', uid).order('started_at', { ascending: false }),
  ])

  const anyError = weightRes.error ?? cfgRes.error ?? routinesRes.error ?? sessionsRes.error
  if (anyError) {
    console.error('Gym pull failed', anyError)
    return false
  }

  const hasData =
    (weightRes.data?.length ?? 0) > 0 ||
    !!cfgRes.data ||
    (routinesRes.data?.length ?? 0) > 0 ||
    (sessionsRes.data?.length ?? 0) > 0
  if (!hasData) { markSynced('gym'); return false }

  const localG = useGymStore.getState()
  type Weight = (typeof localG.weightEntries)[number]
  type Routine = (typeof localG.routines)[number]
  type GSession = (typeof localG.sessions)[number]
  const patch: Partial<ReturnType<typeof useGymStore.getState>> = {}

  // Config singleton — solo pisar si existe la fila remota.
  if (cfgRes.data) {
    const c = cfgRes.data as Row
    patch.gymType = (c.gym_type as 'home' | 'commercial') ?? 'home'
    patch.phase = (c.phase as 'cut' | 'maintenance' | 'bulk') ?? 'maintenance'
    patch.weightGoalKg = c.weight_goal_kg !== null && c.weight_goal_kg !== undefined
      ? Number(c.weight_goal_kg)
      : null
    // Distribución semanal — singleton LWW como el resto del config.
    patch.trainingPlan = (c.training_plan as import('@/lib/store/gymStore').WeeklyTrainingPlan) ?? {}
  }

  const remoteWeights: Weight[] = (weightRes.data ?? []).map((e: Row) => ({
    id: e.id as string,
    date: e.date as string,
    kg: Number(e.kg),
    note: (e.note as string) ?? undefined,
    createdAt: e.created_at as string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any))
  const remoteRoutines: Routine[] = (routinesRes.data ?? []).map((r: Row) => ({
    id: r.id as string,
    name: r.name as string,
    dayLabel: (r.day_label as string) ?? '',
    exercises: (r.exercises as import('@/lib/store/gymStore').RoutineExercise[]) ?? [],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any))
  const remoteSessions: GSession[] = (sessionsRes.data ?? []).map((s: Row) => ({
    id: s.id as string,
    date: s.date as string,
    name: s.name as string,
    routineId: (s.routine_id as string) ?? undefined,
    exercises: (s.exercises as import('@/lib/store/gymStore').WorkoutExercise[]) ?? [],
    startedAt: s.started_at as string,
    endedAt: (s.ended_at as string) ?? undefined,
    notes: (s.notes as string) ?? undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any))

  // Merge no-destructivo + re-orden (weights por fecha desc, sessions por inicio desc).
  const tombs = await fetchTombstones(sb, uid, ['gym_weight_entries', 'gym_routines', 'gym_sessions'])
  patch.weightEntries = mergeById<Weight>({
    local: localG.weightEntries, remote: remoteWeights,
    baseline: getBaseline('gym:weights'), getId: (e) => e.id, getUpdatedAt: (e) => e.createdAt,
    tombstones: tombs.get('gym_weight_entries'),
  }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  patch.routines = mergeById<Routine>({
    local: localG.routines, remote: remoteRoutines,
    baseline: getBaseline('gym:routines'), getId: (r) => r.id,
    tombstones: tombs.get('gym_routines'),
  })
  patch.sessions = mergeById<GSession>({
    local: localG.sessions, remote: remoteSessions,
    baseline: getBaseline('gym:sessions'), getId: (s) => s.id, getUpdatedAt: (s) => s.startedAt,
    tombstones: tombs.get('gym_sessions'),
  }).sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0))

  useGymStore.setState(patch)
  setBaseline('gym:weights', remoteWeights.map((e) => e.id))
  setBaseline('gym:routines', remoteRoutines.map((r) => r.id))
  setBaseline('gym:sessions', remoteSessions.map((s) => s.id))
  markSynced('gym')
  return true
  } finally {
    endPulling('gym')
  }
}

// Aliases for backwards compatibility with previous "basics-only" naming.
const pushGymBasics = pushGym
const pullGymBasics = pullGym

// ─── HEALTH (snapshots + sleep goal) ──────────────────────────────────────────

async function pushHealth() {
  if (!state.userId) return
  // Momento del snapshot: lo que se edite DURANTE el vuelo del push queda
  // con lastModified > syncedAt → sigue contando como unsynced (no se pierde).
  const syncedAt = new Date().toISOString()
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { snapshots, baseline } = useHealthStore.getState()

  const snapRows = Object.values(snapshots).filter((s) => isValidDay(s.date)).map((s) => ({
    user_id: uid, date: s.date,
    steps: s.steps, sleep_minutes: s.sleepMinutes,
    sleep_start: s.sleepStart ?? null, sleep_end: s.sleepEnd ?? null,
    sleep_in_bed_minutes: s.sleepInBedMinutes ?? null,
    sleep_core_minutes: s.sleepCoreMinutes ?? null,
    sleep_deep_minutes: s.sleepDeepMinutes ?? null,
    sleep_rem_minutes: s.sleepRemMinutes ?? null,
    sleep_awake_minutes: s.sleepAwakeMinutes ?? null,
    resting_hr: s.restingHR ?? null, hrv: s.hrv ?? null,
    source: s.source, synced_at: s.syncedAt,
  }))

  if (snapRows.length > 0) {
    const r = await sb.from('health_snapshots').upsert(snapRows, { onConflict: 'user_id,date' })
    if (r.error) { reportSyncError(`health_snapshots upsert failed: ${r.error.message}`); throw r.error }
  }

  // Reconcile deletes por fecha — solo borra los snapshots que el user quitó
  // (baseline ∩ ¬local). PK natural = date.
  const localDates = Object.keys(snapshots).filter(isValidDay)
  await syncDeletes(sb, uid, 'health_snapshots', localDates, 'health:snapshots', 'date')

  await sb.from('health_config').upsert(
    { user_id: uid, sleep_goal_minutes: baseline.sleepGoalMinutes, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )
  markSynced('health', syncedAt)
}

async function pullHealth(): Promise<boolean> {
  if (!state.userId) return false
  startPulling('health')
  try {
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const [snapRes, cfgRes] = await Promise.all([
    sb.from('health_snapshots').select('*').eq('user_id', uid),
    sb.from('health_config').select('*').eq('user_id', uid).maybeSingle(),
  ])

  if (snapRes.error || cfgRes.error) {
    console.error('Health pull failed', snapRes.error ?? cfgRes.error)
    return false
  }

  const hasData = (snapRes.data?.length ?? 0) > 0 || !!cfgRes.data
  if (!hasData) { markSynced('health'); return false }

  const snapMap: Record<string, import('@/lib/store/healthStore').HealthSnapshot> = {}
  for (const s of (snapRes.data ?? []) as Row[]) {
    const date = s.date as string
    snapMap[date] = {
      date,
      steps: (s.steps as number) ?? 0,
      sleepMinutes: (s.sleep_minutes as number) ?? 0,
      sleepStart: (s.sleep_start as string) ?? undefined,
      sleepEnd: (s.sleep_end as string) ?? undefined,
      sleepInBedMinutes: (s.sleep_in_bed_minutes as number) ?? undefined,
      sleepCoreMinutes: (s.sleep_core_minutes as number) ?? undefined,
      sleepDeepMinutes: (s.sleep_deep_minutes as number) ?? undefined,
      sleepRemMinutes: (s.sleep_rem_minutes as number) ?? undefined,
      sleepAwakeMinutes: (s.sleep_awake_minutes as number) ?? undefined,
      restingHR: (s.resting_hr as number) ?? undefined,
      hrv: s.hrv !== null && s.hrv !== undefined ? Number(s.hrv) : undefined,
      source: (s.source as 'shortcut' | 'manual') ?? 'manual',
      syncedAt: (s.synced_at as number) ?? Date.now(),
    }
  }

  const sleepGoal = cfgRes.data
    ? ((cfgRes.data as Row).sleep_goal_minutes as number) ?? 480
    : useHealthStore.getState().baseline.sleepGoalMinutes

  // Merge no-destructivo por fecha (conflicto → syncedAt más reciente).
  type Snap = import('@/lib/store/healthStore').HealthSnapshot
  const localSnaps = Object.values(useHealthStore.getState().snapshots)
  const remoteSnaps = Object.values(snapMap)
  const tombs = await fetchTombstones(sb, uid, ['health_snapshots'])
  const mergedSnaps = mergeById<Snap>({
    local: localSnaps, remote: remoteSnaps,
    baseline: getBaseline('health:snapshots'), getId: (s) => s.date, getUpdatedAt: (s) => s.syncedAt,
    tombstones: tombs.get('health_snapshots'),
  })
  const mergedMap: Record<string, Snap> = {}
  for (const s of mergedSnaps) mergedMap[s.date] = s

  useHealthStore.setState({
    snapshots: mergedMap,
    baseline: { ...useHealthStore.getState().baseline, sleepGoalMinutes: sleepGoal },
    lastSyncAt: Date.now(),
  })
  setBaseline('health:snapshots', Object.keys(snapMap))
  useHealthStore.getState().computeBaseline()
  markSynced('health')
  return true
  } finally {
    endPulling('health')
  }
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────

async function pushChat() {
  if (!state.userId) return
  // Momento del snapshot: lo que se edite DURANTE el vuelo del push queda
  // con lastModified > syncedAt → sigue contando como unsynced (no se pierde).
  const syncedAt = new Date().toISOString()
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { messages } = useChatStore.getState()

  const rows = messages.map((m) => ({
    id: m.id, user_id: uid, role: m.role, content: m.content,
    timestamp: m.timestamp, action_card: m.actionCard ?? null,
  }))

  if (rows.length > 0) {
    const r = await sb.from('chat_messages').upsert(rows)
    if (r.error) { reportSyncError(`chat_messages upsert failed: ${r.error.message}`); throw r.error }
  }
  await syncDeletes(sb, uid, 'chat_messages', rows.map((r) => r.id), 'chat:messages')
  markSynced('chat', syncedAt)
}

async function pullChat(): Promise<boolean> {
  if (!state.userId) return false
  startPulling('chat')
  try {
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const res = await sb.from('chat_messages').select('*').eq('user_id', uid).order('timestamp', { ascending: true })
  if (res.error) {
    console.error('Chat pull failed', res.error)
    return false
  }
  if ((res.data?.length ?? 0) === 0) { markSynced('chat'); return false }

  const localMsgs = useChatStore.getState().messages
  type Msg = (typeof localMsgs)[number]
  const remoteMsgs: Msg[] = (res.data ?? []).map((m: Row) => ({
    id: m.id as string,
    role: m.role as 'user' | 'assistant',
    content: m.content as string,
    timestamp: m.timestamp as string,
    actionCard: (m.action_card as import('@/types').ChatActionCard | null) ?? undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any))

  const tombs = await fetchTombstones(sb, uid, ['chat_messages'])
  const merged = mergeById<Msg>({
    local: localMsgs,
    remote: remoteMsgs,
    baseline: getBaseline('chat:messages'),
    getId: (m) => m.id,
    getUpdatedAt: (m) => m.timestamp,
    tombstones: tombs.get('chat_messages'),
  })
  // Mensajes ordenados cronológicamente.
  merged.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0))

  useChatStore.setState({ messages: merged })
  setBaseline('chat:messages', remoteMsgs.map((m) => m.id))
  markSynced('chat')
  return true
  } finally {
    endPulling('chat')
  }
}

// ─── FOOD (singleton row, JSONB blobs for nested data) ────────────────────────

async function pushFood() {
  if (!state.userId) return
  // Momento del snapshot: lo que se edite DURANTE el vuelo del push queda
  // con lastModified > syncedAt → sigue contando como unsynced (no se pierde).
  const syncedAt = new Date().toISOString()
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { stages, shopping, fixedCosts, foods, currentStageId, notes } = useFoodStore.getState()

  const r = await sb.from('food_data').upsert(
    {
      user_id: uid,
      stages, shopping, fixed_costs: fixedCosts, foods,
      current_stage_id: currentStageId || null,
      notes: notes ?? '',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
  if (r.error) { reportSyncError(`food_data upsert failed: ${r.error.message}`); throw r.error }
  markSynced('food', syncedAt)
}

async function pullFood(): Promise<boolean> {
  if (!state.userId) return false
  startPulling('food')
  try {
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const res = await sb.from('food_data').select('*').eq('user_id', uid).maybeSingle()
  if (res.error) {
    console.error('Food pull failed', res.error)
    return false
  }
  if (!res.data) { markSynced('food'); return false }

  const d = res.data as Row
  useFoodStore.setState({
    stages: (d.stages as import('@/lib/store/foodStore').Stage[]) ?? [],
    shopping: (d.shopping as import('@/lib/store/foodStore').ShoppingCategory[]) ?? [],
    fixedCosts: (d.fixed_costs as import('@/lib/store/foodStore').FixedCost[]) ?? [],
    foods: (d.foods as import('@/lib/store/foodStore').FoodEntry[]) ?? [],
    currentStageId: (d.current_stage_id as string) ?? '',
    notes: (d.notes as string) ?? '',
  })
  markSynced('food')
  return true
  } finally {
    endPulling('food')
  }
}

// ─── KPIs (definitions library) ───────────────────────────────────────────────
//
// La library de KPIs (lo que ves en /kpis → Library) sincroniza como una
// fila por KPI con payload JSONB. Antes vivía SOLO en localStorage de cada
// device — si formateabas o cambiabas de máquina, perdías los KPIs.
// Requiere migration_kpis.sql aplicada en Supabase.
//
// Las activaciones por semana (selectedKpiIds) y los valores cargados
// siguen viviendo dentro de SPI sessions — no acá. Esta tabla solo
// guarda las DEFINICIONES (nombre, target, kind, etc.).

async function pushKpis() {
  if (!state.userId) return
  // Momento del snapshot: lo que se edite DURANTE el vuelo del push queda
  // con lastModified > syncedAt → sigue contando como unsynced (no se pierde).
  const syncedAt = new Date().toISOString()
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { definitions } = useKpisStore.getState()

  const rows = definitions.map((d) => ({
    id: d.id,
    user_id: uid,
    payload: d,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  }))

  if (rows.length > 0) {
    const r = await sb.from('kpis').upsert(rows)
    if (r.error) {
      reportSyncError(`kpis upsert failed: ${r.error.message}. Likely missing migration — run supabase/migration_kpis.sql.`)
      throw r.error
    }
  }
  await syncDeletes(sb, uid, 'kpis', rows.map((r) => r.id), 'kpis:definitions')
  markSynced('kpis', syncedAt)
}

async function pullKpis(): Promise<boolean> {
  if (!state.userId) return false
  startPulling('kpis')
  try {
    const sb = getSupabaseBrowser()
    const uid = state.userId!

    const res = await sb.from('kpis').select('*').eq('user_id', uid)
      .order('created_at', { ascending: true })
    if (res.error) {
      console.error('KPIs pull failed (run migration_kpis.sql?):', res.error)
      return false
    }
    if ((res.data?.length ?? 0) === 0) { markSynced('kpis'); return false }

    type KpiRow = { payload: unknown }
    // Sanitize defensivo — al estilo de mindmaps/lab/projection. Spread del
    // payload primero para preservar campos opcionales nuevos
    // (cumulativeTarget, etc.) sin tener que enumerarlos todos.
    const sanitize = (raw: unknown): import('@/lib/kpi/types').KPIDefinition => {
      const p = (raw ?? {}) as Partial<import('@/lib/kpi/types').KPIDefinition>
      return {
        ...p,
        id: p.id ?? '',
        name: p.name ?? '',
        icon: p.icon ?? '🎯',
        color: p.color ?? '#a855f7',
        kind: p.kind ?? 'count',
        activatedAt: p.activatedAt ?? (p.createdAt ?? new Date().toISOString()).slice(0, 10),
        createdAt: p.createdAt ?? new Date().toISOString(),
        updatedAt: p.updatedAt ?? new Date().toISOString(),
      }
    }
    const remoteDefs: import('@/lib/kpi/types').KPIDefinition[] =
      (res.data ?? []).map((r: KpiRow) => sanitize(r.payload))
    const tombs = await fetchTombstones(sb, uid, ['kpis'])
    const mergedDefs = mergeById<import('@/lib/kpi/types').KPIDefinition>({
      local: useKpisStore.getState().definitions,
      remote: remoteDefs,
      baseline: getBaseline('kpis:definitions'),
      getId: (d) => d.id,
      getUpdatedAt: (d) => d.updatedAt,
      tombstones: tombs.get('kpis'),
    })
    useKpisStore.setState({ definitions: mergedDefs })
    setBaseline('kpis:definitions', remoteDefs.map((d) => d.id))
    markSynced('kpis')
    return true
  } finally {
    endPulling('kpis')
  }
}

// ─── ESTUDIO (Carrera › Materia › Parcial › Tema, módulo independiente) ───────

async function pushStudy() {
  if (!state.userId) return
  // Momento del snapshot: lo que se edite DURANTE el vuelo del push queda
  // con lastModified > syncedAt → sigue contando como unsynced (no se pierde).
  const syncedAt = new Date().toISOString()
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { carreras, materias, parciales, temas } = useStudyStore.getState()

  const carreraRows = carreras.map((c) => ({
    id: c.id, user_id: uid, created_at: c.createdAt, updated_at: c.updatedAt, payload: c,
  }))
  const materiaRows = materias.map((m) => ({
    id: m.id, user_id: uid, carrera_id: m.carreraId, created_at: m.createdAt, updated_at: m.updatedAt, payload: m,
  }))
  const parcialRows = parciales.map((p) => ({
    id: p.id, user_id: uid, materia_id: p.materiaId, created_at: p.createdAt, updated_at: p.updatedAt, payload: p,
  }))
  const temaRows = temas.map((t) => ({
    id: t.id, user_id: uid, parcial_id: t.parcialId, created_at: t.createdAt, updated_at: t.updatedAt, payload: t,
  }))

  if (carreraRows.length > 0) {
    const r = await sb.from('study_carreras').upsert(carreraRows)
    if (r.error) { reportSyncError(`study_carreras upsert failed: ${r.error.message}. ¿Falta correr migration_study.sql?`); throw r.error }
  }
  if (materiaRows.length > 0) {
    const r = await sb.from('study_materias').upsert(materiaRows)
    if (r.error) { reportSyncError(`study_materias upsert failed: ${r.error.message}`); throw r.error }
  }
  if (parcialRows.length > 0) {
    const r = await sb.from('study_parciales').upsert(parcialRows)
    if (r.error) { reportSyncError(`study_parciales upsert failed: ${r.error.message}`); throw r.error }
  }
  if (temaRows.length > 0) {
    const r = await sb.from('study_temas').upsert(temaRows)
    if (r.error) { reportSyncError(`study_temas upsert failed: ${r.error.message}`); throw r.error }
  }

  // Borra lo quitado + tombstones + baseline (leaf-first).
  await syncDeletes(sb, uid, 'study_temas', temaRows.map((r) => r.id), 'study:temas')
  await syncDeletes(sb, uid, 'study_parciales', parcialRows.map((r) => r.id), 'study:parciales')
  await syncDeletes(sb, uid, 'study_materias', materiaRows.map((r) => r.id), 'study:materias')
  await syncDeletes(sb, uid, 'study_carreras', carreraRows.map((r) => r.id), 'study:carreras')
  markSynced('study', syncedAt)
}

async function pullStudy(): Promise<boolean> {
  if (!state.userId) return false
  startPulling('study')
  try {
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const [carRes, matRes, parRes, temRes] = await Promise.all([
    sb.from('study_carreras').select('*').eq('user_id', uid),
    sb.from('study_materias').select('*').eq('user_id', uid),
    sb.from('study_parciales').select('*').eq('user_id', uid),
    sb.from('study_temas').select('*').eq('user_id', uid),
  ])

  const anyErr = carRes.error ?? matRes.error ?? parRes.error ?? temRes.error
  if (anyErr) { console.error('Study pull failed (run migration_study.sql?):', anyErr); return false }

  const hasData = [carRes, matRes, parRes, temRes].some((r) => (r.data?.length ?? 0) > 0)
  if (!hasData) { markSynced('study'); return false }

  type Carrera = import('@/lib/study/types').Carrera
  type Materia = import('@/lib/study/types').Materia
  type Parcial = import('@/lib/study/types').Parcial
  type Tema = import('@/lib/study/types').Tema
  const nowIso = () => new Date().toISOString()

  const remoteCarreras: Carrera[] = (carRes.data ?? []).map((r: Row) => {
    const c = ((r as Row).payload ?? {}) as Partial<Carrera>
    return {
      id: c.id ?? (r as Row).id as string, name: c.name ?? 'Carrera',
      icon: c.icon, color: c.color, institucion: c.institucion,
      sortOrder: c.sortOrder ?? 0, createdAt: c.createdAt ?? nowIso(), updatedAt: c.updatedAt ?? nowIso(),
    }
  })
  const remoteMaterias: Materia[] = (matRes.data ?? []).map((r: Row) => {
    const m = ((r as Row).payload ?? {}) as Partial<Materia>
    return {
      id: m.id ?? (r as Row).id as string, carreraId: m.carreraId ?? (r as Row).carrera_id as string,
      name: m.name ?? 'Materia', icon: m.icon, color: m.color,
      profesor: m.profesor, codigo: m.codigo, cuatrimestre: m.cuatrimestre,
      ...(m.mode ? { mode: m.mode } : {}),
      sortOrder: m.sortOrder ?? 0, createdAt: m.createdAt ?? nowIso(), updatedAt: m.updatedAt ?? nowIso(),
    }
  })
  const remoteParciales: Parcial[] = (parRes.data ?? []).map((r: Row) => {
    const p = ((r as Row).payload ?? {}) as Partial<Parcial>
    return {
      id: p.id ?? (r as Row).id as string, materiaId: p.materiaId ?? (r as Row).materia_id as string,
      label: p.label ?? 'Parcial', examDate: p.examDate, closed: p.closed,
      sortOrder: p.sortOrder ?? 0, createdAt: p.createdAt ?? nowIso(), updatedAt: p.updatedAt ?? nowIso(),
    }
  })
  const remoteTemas: Tema[] = (temRes.data ?? []).map((r: Row) => {
    const t = ((r as Row).payload ?? {}) as Partial<Tema>
    return {
      id: t.id ?? (r as Row).id as string, parcialId: t.parcialId ?? (r as Row).parcial_id as string,
      title: t.title ?? 'Tema', notes: t.notes, done: !!t.done,
      items: Array.isArray(t.items) ? t.items : [],
      sortOrder: t.sortOrder ?? 0, createdAt: t.createdAt ?? nowIso(), updatedAt: t.updatedAt ?? nowIso(),
    }
  })

  const tombs = await fetchTombstones(sb, uid, [
    'study_carreras', 'study_materias', 'study_parciales', 'study_temas',
  ])
  const local = useStudyStore.getState()

  const mergedCarreras = mergeById<Carrera>({
    local: local.carreras, remote: remoteCarreras, baseline: getBaseline('study:carreras'),
    getId: (x) => x.id, getUpdatedAt: (x) => x.updatedAt, tombstones: tombs.get('study_carreras'),
  })
  const mergedMaterias = mergeById<Materia>({
    local: local.materias, remote: remoteMaterias, baseline: getBaseline('study:materias'),
    getId: (x) => x.id, getUpdatedAt: (x) => x.updatedAt, tombstones: tombs.get('study_materias'),
  })
  const mergedParciales = mergeById<Parcial>({
    local: local.parciales, remote: remoteParciales, baseline: getBaseline('study:parciales'),
    getId: (x) => x.id, getUpdatedAt: (x) => x.updatedAt, tombstones: tombs.get('study_parciales'),
  })
  const mergedTemas = mergeById<Tema>({
    local: local.temas, remote: remoteTemas, baseline: getBaseline('study:temas'),
    getId: (x) => x.id, getUpdatedAt: (x) => x.updatedAt, tombstones: tombs.get('study_temas'),
  })

  useStudyStore.setState({
    carreras: mergedCarreras, materias: mergedMaterias,
    parciales: mergedParciales, temas: mergedTemas,
  })

  setBaseline('study:carreras', remoteCarreras.map((x) => x.id))
  setBaseline('study:materias', remoteMaterias.map((x) => x.id))
  setBaseline('study:parciales', remoteParciales.map((x) => x.id))
  setBaseline('study:temas', remoteTemas.map((x) => x.id))
  markSynced('study')
  return true
  } finally {
    endPulling('study')
  }
}

// ─── CONTENIDO (Content Strategy: perfiles + campañas + items) ────────────────
//
// Perfiles NO tienen updatedAt → en conflicto gana remote, y usamos
// push-first-si-unsynced (como trading/habits) para que una edición local de
// perfil/estilo visual se suba ANTES y sea la canónica. Items y campañas SÍ
// tienen updatedAt → su merge es LWW. Tombstones para los borrados.

type ContentProfileT = import('@/types/content').ContentProfile
type ContentCampaignT = import('@/types/content').ContentCampaign
type ContentItemT = import('@/types/content').ContentItem

/** ¿El perfil tiene contenido real del user? Sirve para dropear el perfil
 *  "Personal" vacío que cada device siembra al arrancar, así no contamina el
 *  cloud ni aparece duplicado al sincronizar. */
function profileHasContent(p: ContentProfileT, items: ContentItemT[], campaigns: ContentCampaignT[]): boolean {
  if (items.some((it) => it.profileId === p.id)) return true
  if (campaigns.some((c) => c.profileId === p.id)) return true
  if ((p.visualStyle ?? []).some((cat) => (cat.images?.length ?? 0) > 0)) return true
  const dna = (p.brandDNA ?? {}) as unknown as Record<string, unknown>
  for (const v of Object.values(dna)) {
    if (typeof v === 'string' && v.trim() !== '') return true
  }
  return false
}

async function pushContent() {
  if (!state.userId) return
  // Momento del snapshot: lo que se edite DURANTE el vuelo del push queda
  // con lastModified > syncedAt → sigue contando como unsynced (no se pierde).
  const syncedAt = new Date().toISOString()
  const sb = getSupabaseBrowser()
  const uid = state.userId!
  const { profiles, campaigns, items } = useContentStore.getState()

  const profileRows = profiles.map((p) => ({
    id: p.id, user_id: uid, created_at: p.createdAt, updated_at: new Date().toISOString(), payload: p,
  }))
  const campaignRows = campaigns.map((c) => ({
    id: c.id, user_id: uid, profile_id: c.profileId, created_at: c.createdAt, updated_at: c.updatedAt, payload: c,
  }))
  const itemRows = items.map((i) => ({
    id: i.id, user_id: uid, profile_id: i.profileId, created_at: i.createdAt, updated_at: i.updatedAt, payload: i,
  }))

  if (profileRows.length > 0) {
    const r = await sb.from('content_profiles').upsert(profileRows)
    if (r.error) { reportSyncError(`content_profiles upsert failed: ${r.error.message}. ¿Falta correr migration_content_sync.sql?`); throw r.error }
  }
  if (campaignRows.length > 0) {
    const r = await sb.from('content_campaigns').upsert(campaignRows)
    if (r.error) { reportSyncError(`content_campaigns upsert failed: ${r.error.message}`); throw r.error }
  }
  if (itemRows.length > 0) {
    const r = await sb.from('content_items').upsert(itemRows)
    if (r.error) { reportSyncError(`content_items upsert failed: ${r.error.message}`); throw r.error }
  }

  await syncDeletes(sb, uid, 'content_items', itemRows.map((r) => r.id), 'content:items')
  await syncDeletes(sb, uid, 'content_campaigns', campaignRows.map((r) => r.id), 'content:campaigns')
  await syncDeletes(sb, uid, 'content_profiles', profileRows.map((r) => r.id), 'content:profiles')
  markSynced('content', syncedAt)
}

async function pullContent(): Promise<boolean> {
  if (!state.userId) return false
  startPulling('content')
  try {
  const sb = getSupabaseBrowser()
  const uid = state.userId!

  const [profRes, campRes, itemRes] = await Promise.all([
    sb.from('content_profiles').select('*').eq('user_id', uid),
    sb.from('content_campaigns').select('*').eq('user_id', uid),
    sb.from('content_items').select('*').eq('user_id', uid),
  ])
  const anyErr = profRes.error ?? campRes.error ?? itemRes.error
  if (anyErr) { console.error('Content pull failed (run migration_content_sync.sql?):', anyErr); return false }

  const hasData = [profRes, campRes, itemRes].some((r) => (r.data?.length ?? 0) > 0)
  if (!hasData) { markSynced('content'); return false }

  const remoteProfiles: ContentProfileT[] = (profRes.data ?? []).map((r: Row) => {
    const p = ((r as Row).payload ?? {}) as ContentProfileT
    return { ...p, id: p.id ?? (r as Row).id as string, visualStyle: Array.isArray(p.visualStyle) ? p.visualStyle : (p.visualStyle ?? undefined) }
  })
  const remoteCampaigns: ContentCampaignT[] = (campRes.data ?? []).map((r: Row) => ({ ...(((r as Row).payload ?? {}) as ContentCampaignT) }))
  const remoteItems: ContentItemT[] = (itemRes.data ?? []).map((r: Row) => ({ ...(((r as Row).payload ?? {}) as ContentItemT) }))

  const tombs = await fetchTombstones(sb, uid, ['content_profiles', 'content_campaigns', 'content_items'])
  const local = useContentStore.getState()

  const mergedCampaigns = mergeById<ContentCampaignT>({
    local: local.campaigns, remote: remoteCampaigns, baseline: getBaseline('content:campaigns'),
    getId: (x) => x.id, getUpdatedAt: (x) => x.updatedAt, tombstones: tombs.get('content_campaigns'),
  })
  const mergedItems = mergeById<ContentItemT>({
    local: local.items, remote: remoteItems, baseline: getBaseline('content:items'),
    getId: (x) => x.id, getUpdatedAt: (x) => x.updatedAt, tombstones: tombs.get('content_items'),
  })
  let mergedProfiles = mergeById<ContentProfileT>({
    local: local.profiles, remote: remoteProfiles, baseline: getBaseline('content:profiles'),
    getId: (x) => x.id,
    getUpdatedAt: (x) => x.updatedAt ?? x.createdAt ?? '',
    // Deep-merge campo-por-campo (ADN, pilares, estilo visual, baúl…) en vez
    // de LWW de objeto entero: "Baúl editado en la PC" y "ADN editado en el
    // celu" del MISMO perfil ya no se pisan entre sí. Además protege contra
    // el clobber cuando el push-first falló y el remoto quedó viejo.
    mergeItem: (l, r) => mergeContentProfile(l, r),
    tombstones: tombs.get('content_profiles'),
  })

  // Dedup del perfil-seed: si vino al menos un perfil remoto, dropeamos los
  // perfiles SOLO-locales que estén vacíos (el "Personal" sembrado por cada
  // device). Nunca dropea un perfil con contenido real.
  if (remoteProfiles.length > 0) {
    const remoteIds = new Set(remoteProfiles.map((p) => p.id))
    mergedProfiles = mergedProfiles.filter((p) =>
      remoteIds.has(p.id) || profileHasContent(p, mergedItems, mergedCampaigns),
    )
  }
  // Siempre tiene que quedar al menos un perfil.
  if (mergedProfiles.length === 0) mergedProfiles = remoteProfiles.length > 0 ? remoteProfiles : local.profiles

  // currentProfileId puede apuntar a un perfil dropeado/borrado → reapuntar.
  const ids = new Set(mergedProfiles.map((p) => p.id))
  const currentProfileId = ids.has(local.currentProfileId) ? local.currentProfileId : (mergedProfiles[0]?.id ?? local.currentProfileId)

  useContentStore.setState({
    profiles: mergedProfiles, campaigns: mergedCampaigns, items: mergedItems, currentProfileId,
  })

  setBaseline('content:profiles', remoteProfiles.map((p) => p.id))
  setBaseline('content:campaigns', remoteCampaigns.map((c) => c.id))
  setBaseline('content:items', remoteItems.map((i) => i.id))
  markSynced('content')
  return true
  } finally {
    endPulling('content')
  }
}

// ─── Scheduled pushes ─────────────────────────────────────────────────────────

function scheduleTasks()      { schedule(tasksPushTimer,     pushTasks,     (t) => { tasksPushTimer = t }) }
function scheduleWallet()     { schedule(walletPushTimer,    pushWallet,    (t) => { walletPushTimer = t }) }
function scheduleTrading()    { schedule(tradingPushTimer,   pushTrading,   (t) => { tradingPushTimer = t }) }
function scheduleHabits()     { schedule(habitsPushTimer,    pushHabits,    (t) => { habitsPushTimer = t }) }
function scheduleGymBasics()  { schedule(gymBasicsPushTimer, pushGymBasics, (t) => { gymBasicsPushTimer = t }) }
function scheduleHealth()     { schedule(healthPushTimer,    pushHealth,    (t) => { healthPushTimer = t }) }
function scheduleChat()       { schedule(chatPushTimer,      pushChat,      (t) => { chatPushTimer = t }) }
function scheduleFood()       { schedule(foodPushTimer,      pushFood,      (t) => { foodPushTimer = t }) }
function scheduleSPI()        { schedule(spiPushTimer,       pushSPI,       (t) => { spiPushTimer = t }) }
function scheduleProjection() { schedule(projectionPushTimer, pushProjection, (t) => { projectionPushTimer = t }) }
function scheduleLab()        { schedule(labPushTimer,        pushLab,        (t) => { labPushTimer = t }) }
function scheduleAppPrefs()   { schedule(appPrefsPushTimer,   pushAppPrefs,   (t) => { appPrefsPushTimer = t }) }
function scheduleMindMaps()   { schedule(mindmapPushTimer,    pushMindMaps,   (t) => { mindmapPushTimer = t }) }
function scheduleKpis()       { schedule(kpisPushTimer,       pushKpis,       (t) => { kpisPushTimer = t }) }
function scheduleStudy()      { schedule(studyPushTimer,      pushStudy,      (t) => { studyPushTimer = t }) }
function scheduleContent()    { schedule(contentPushTimer,    pushContent,    (t) => { contentPushTimer = t }) }
function scheduleBacktests()  { schedule(backtestPushTimer,   pushBacktests,  (t) => { backtestPushTimer = t }) }
function scheduleJournal()     { schedule(journalPushTimer,    pushJournal,    (t) => { journalPushTimer = t }) }
function scheduleConcepts()    { schedule(conceptPushTimer,    pushConcepts,   (t) => { conceptPushTimer = t }) }

// ─── Main hook ────────────────────────────────────────────────────────────────

/** Push-then-pull cada dominio. Idempotente — gated por *Init flags.
 *
 *  Por qué push-then-pull y no pull-then-push:
 *  ──────────────────────────────────────────
 *  Los pushes están debounced 1500ms (ver `schedule()`). Si el user edita
 *  cualquier cosa y refresca en <1.5s, el push pendiente nunca se dispara
 *  y el cambio queda solo en localStorage. En el siguiente mount, si
 *  primero pullábamos, el pull traía el estado viejo de Supabase y lo
 *  escribía sobre el localStorage → pérdida silenciosa de data.
 *
 *  Fix: si hay datos locales (persist hidrató algo), pusheamos PRIMERO.
 *  Eso sube cualquier edición pendiente. Después pull mergea con cambios
 *  de otros dispositivos (last-write-wins por id).
 *
 *  Edge case "device fresh, local vacío": el guard `hasLocal === false`
 *  evita el push (que con su deleteSurplus borraría todo el remoto), y
 *  el pull trae los datos del primer dispositivo. ✓
 *
 *  appPrefs es excepción: es una fila única por user_id sin deleteSurplus,
 *  y el local siempre tiene defaults — pusheamos siempre, después pull. */
async function initAllDomains() {
  if (!state.userId) return

  // hasUnsyncedChanges(domain) lee timestamps de localStorage:
  //   lastModified > lastSynced → SI, hay cambios locales sin pushear.
  // Si SI → push-then-pull (preserva los cambios locales).
  // Si NO → pull-then-(quizás)push (remote es source of truth en este device).
  //
  // Esto arregla el bug multi-device donde un device con localStorage VIEJO
  // hacía push-first con deleteSurplus y borraba el trabajo de otro device.

  // ─── Tasks ────────────────────────────────────────────────────────────
  // PULL-FIRST SIEMPRE (a diferencia del resto de los dominios). El merge de
  // tareas es LWW por updatedAt + tombstones globales, así que bajar primero el
  // cloud NO pisa ediciones locales más nuevas (gana la de updatedAt mayor) ni
  // resucita borrados (los tombstones los matan). Esto evita el bug donde un
  // device con data vieja hacía push-first y (a) clobereaba con upsert lo más
  // nuevo de la PC y (b) resucitaba tareas viejas. Después del pull, el push
  // sube el estado YA mergeado (incl. tombstones de los borrados locales).
  if (!state.tasksInit) {
    state.tasksInit = true
    const { projects, tasks } = useTasksStore.getState()
    const hasLocal = Object.keys(projects).length > 0 || Object.keys(tasks).length > 0
    await pullTasks()
    if (hasLocal) await pushTasks().catch((e) => console.error('Tasks post-pull push failed', e))
  }

  // ─── Wallet ───────────────────────────────────────────────────────────
  // Pull-first: wallet tiene mantenimiento de arranque (processRecurringExpenses)
  // que marcaría modified → push-first con data vieja pisaría el cloud. Las tx
  // resuelven por timestamp (LWW) y el resto es aditivo; tombstones cubren
  // borrados. Después del pull, push del estado mergeado.
  if (!state.walletInit) {
    state.walletInit = true
    const { wallets, transactions, currencies } = useWalletStore.getState()
    const hasLocal = wallets.length > 0 || transactions.length > 0 || currencies.length > 0
    await pullWallet()
    if (hasLocal) await pushWallet().catch((e) => console.error('Wallet post-pull push failed', e))
  }

  // ─── Trading ──────────────────────────────────────────────────────────
  // Push-first (si hay cambios locales sin sincronizar): trading NO tiene
  // updatedAt por fila, así que en conflicto gana remote. Push-first sube tu
  // edición local PRIMERO para que sea la canónica y no la pise el pull. No hay
  // mantenimiento de arranque que ensucie el flag → push-first solo corre con
  // ediciones reales. Tombstones igual propagan los borrados.
  if (!state.tradingInit) {
    state.tradingInit = true
    const { firms, accounts, trades } = useTradingStore.getState()
    const hasLocal = firms.length > 0 || accounts.length > 0 || trades.length > 0
    if (hasLocal && hasUnsyncedChanges('trading')) {
      await pushTrading().catch((e) => console.error('Trading initial push failed', e))
    }
    await pullTrading()
  }

  // ─── Habits ───────────────────────────────────────────────────────────
  // Push-first (idem trading): escalares (nombre/icono) sin updatedAt → push
  // primero para preservar renombres locales. Las marcas diarias se UNEN
  // (mergeHabit) en cualquier dirección, y tombstones propagan borrados.
  if (!state.habitsInit) {
    state.habitsInit = true
    const { habits } = useHabitsStore.getState()
    if (habits.length > 0 && hasUnsyncedChanges('habits')) {
      await pushHabits().catch((e) => console.error('Habits initial push failed', e))
    }
    await pullHabits()
  }

  // ─── Gym basics ───────────────────────────────────────────────────────
  // Pull-first: pesos/sesiones resuelven por fecha (LWW) y todo es aditivo;
  // tombstones cubren borrados.
  if (!state.gymBasicsInit) {
    state.gymBasicsInit = true
    const { weightEntries, routines, sessions, trainingPlan } = useGymStore.getState()
    const hasLocal = weightEntries.length > 0
      || routines.length > 0
      || sessions.length > 0
      || Object.keys(trainingPlan).length > 0
    await pullGymBasics()
    if (hasLocal) await pushGymBasics().catch((e) => console.error('Gym basics post-pull push failed', e))
  }

  // ─── Health ───────────────────────────────────────────────────────────
  // Pull-first: snapshots resuelven por syncedAt (LWW) + tombstones.
  if (!state.healthInit) {
    state.healthInit = true
    const { snapshots } = useHealthStore.getState()
    const hasLocal = Object.keys(snapshots).length > 0
    await pullHealth()
    if (hasLocal) await pushHealth().catch((e) => console.error('Health post-pull push failed', e))
  }

  // ─── Chat ─────────────────────────────────────────────────────────────
  // Pull-first: mensajes resuelven por timestamp (LWW) y son aditivos.
  if (!state.chatInit) {
    state.chatInit = true
    const { messages } = useChatStore.getState()
    const hasLocal = messages.length > 0
    await pullChat()
    if (hasLocal) await pushChat().catch((e) => console.error('Chat post-pull push failed', e))
  }

  // ─── Food ─────────────────────────────────────────────────────────────
  if (!state.foodInit) {
    state.foodInit = true
    const { stages, shopping, notes } = useFoodStore.getState()
    const hasLocal = stages.length > 0 || shopping.length > 0 || !!notes
    if (hasLocal && hasUnsyncedChanges('food')) {
      await pushFood().catch((e) => console.error('Food initial push failed', e))
    }
    await pullFood()
  }

  // ─── SPI ──────────────────────────────────────────────────────────────
  // Pull-first: sesiones con deep-merge (mergeSpiSession) + LWW por updatedAt
  // + tombstones. No pisa respuestas de otro device.
  if (!state.spiInit) {
    state.spiInit = true
    const { sessions, bitacoraEntries } = useSPIStore.getState()
    const hasLocal = sessions.length > 0 || bitacoraEntries.length > 0
    await pullSPI()
    if (hasLocal) await pushSPI().catch((e) => console.error('SPI post-pull push failed', e))
  }

  // ─── Projection ───────────────────────────────────────────────────────
  // Pull-first: deep-merge (mergeProjectionPlan) + LWW por updatedAt + tombstones.
  if (!state.projectionInit) {
    state.projectionInit = true
    const { plans } = useProjectionStore.getState()
    const hasLocal = plans.length > 0
    await pullProjection()
    if (hasLocal) await pushProjection().catch((e) => console.error('Projection post-pull push failed', e))
  }

  // ─── Lab ──────────────────────────────────────────────────────────────
  // Pull-first: deep-merge (mergeLabSession) + LWW por updatedAt + tombstones.
  if (!state.labInit) {
    state.labInit = true
    const { sessions, beliefs } = useLabStore.getState()
    const hasLocal = sessions.length > 0 || beliefs.length > 0
    await pullLab()
    if (hasLocal) await pushLab().catch((e) => console.error('Lab post-pull push failed', e))
  }

  // ─── App preferences ──────────────────────────────────────────────────
  // Excepción: fila única por user_id, sin deleteSurplus. Pusheamos solo
  // si hay cambios locales sin sincronizar — sino, pull primero (multi-device
  // safe). El local store SIEMPRE tiene defaults pero eso no significa que
  // tengamos cambios sin syncronizar.
  if (!state.appPrefsInit) {
    state.appPrefsInit = true
    if (hasUnsyncedChanges('appPrefs')) {
      await pushAppPrefs().catch((e) => console.error('App prefs initial push failed', e))
    }
    await pullAppPrefs()
  }

  // ─── Mind maps ────────────────────────────────────────────────────────
  // Pull-first: LWW por updatedAt + tombstones.
  if (!state.mindmapInit) {
    state.mindmapInit = true
    const { maps } = useMindMapStore.getState()
    const hasLocal = maps.length > 0
    await pullMindMaps()
    if (hasLocal) await pushMindMaps().catch((e) => console.error('Mindmaps post-pull push failed', e))
  }

  // ─── Backtests (hojas de backtesting de trading) ──────────────────────
  // Pull-first: LWW por updatedAt + tombstones (mismo patrón que mindmaps).
  if (!state.backtestInit) {
    state.backtestInit = true
    const { sets } = useBacktestStore.getState()
    const hasLocal = sets.length > 0
    await pullBacktests()
    if (hasLocal) await pushBacktests().catch((e) => console.error('Backtests post-pull push failed', e))
  }

  // ─── My Journal ───────────────────────────────────────────────────────
  // Pull-first: LWW por updatedAt + tombstones (mismo patrón que mindmaps).
  if (!state.journalInit) {
    state.journalInit = true
    const { entries } = useJournalStore.getState()
    const hasLocal = entries.length > 0
    await pullJournal()
    if (hasLocal) await pushJournal().catch((e) => console.error('Journal post-pull push failed', e))
  }

  // ─── Mapas de conceptos (materias modo 'conceptos') ───────────────────
  // Pull-first: LWW por updatedAt + tombstones (mismo patrón que mindmaps).
  if (!state.conceptInit) {
    state.conceptInit = true
    const { maps } = useConceptStore.getState()
    const hasLocal = maps.length > 0
    await pullConcepts()
    if (hasLocal) await pushConcepts().catch((e) => console.error('Concepts post-pull push failed', e))
  }

  // ─── KPIs (library de definiciones) ───────────────────────────────────
  // Sincroniza la library completa de KPIs entre devices. Las activaciones
  // por semana y los valores cargados viven dentro de SPI sessions, NO
  // acá — esta tabla solo guarda definiciones (nombre, target, etc.).
  // Pull-first: LWW por updatedAt + tombstones.
  if (!state.kpisInit) {
    state.kpisInit = true
    const { definitions } = useKpisStore.getState()
    const hasLocal = definitions.length > 0
    await pullKpis()
    if (hasLocal) await pushKpis().catch((e) => console.error('KPIs post-pull push failed', e))
  }

  // ─── Estudio (Carrera › Materia › Parcial › Tema) ──────────────────────
  // Pull-first: todos los niveles tienen updatedAt → LWW seguro + tombstones.
  if (!state.studyInit) {
    state.studyInit = true
    const { carreras, materias, parciales, temas } = useStudyStore.getState()
    const hasLocal = carreras.length > 0 || materias.length > 0 || parciales.length > 0 || temas.length > 0
    await pullStudy()
    if (hasLocal) await pushStudy().catch((e) => console.error('Study post-pull push failed', e))
  }

  // ─── Contenido (Content Strategy) ─────────────────────────────────────
  // Push-first-si-unsynced (protege ediciones locales pendientes). Seed
  // inicial: si no había nada remoto y el baseline está vacío, subimos lo
  // local para sembrar el cloud.
  if (!state.contentInit) {
    state.contentInit = true
    const { profiles, items, campaigns } = useContentStore.getState()
    const hasLocal = profiles.length > 0 || items.length > 0 || campaigns.length > 0
    let pushFailed = false
    if (hasLocal && hasUnsyncedChanges('content')) {
      await pushContent().catch((e) => { pushFailed = true; console.error('Content initial push failed', e) })
    }
    const pulled = await pullContent()
    if (hasLocal && !pulled && getBaseline('content:profiles').size === 0) {
      await pushContent().catch((e) => console.error('Content seed push failed', e))
    } else if (pushFailed) {
      // El push-first falló (típico: red fría al reabrir la app en el celu).
      // El merge del pull conservó las ediciones locales (LWW + deep-merge de
      // perfil), pero quedaron SIN propagar y el markSynced del pull acaba de
      // taparlas del tracking. Reintento ahora que la red probó estar viva
      // (el pull funcionó) para que suban ya y no queden solo en este device.
      await pushContent().catch((e) => console.error('Content retry push failed', e))
    }
  }
}

/** Mount once at the app root. Wires all domains for sync. */
export function useSupabaseSync() {
  const subscribedRef = useRef(false)

  useEffect(() => {
    if (!hasSupabaseConfig()) return
    const sb = getSupabaseBrowser()
    let mounted = true

    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!mounted) return
      state.userId = user?.id ?? null
      if (user) authExpiredHandled = false
      state.ready = true
      await initAllDomains()
    })()

    // Subscribe to local store changes
    if (!subscribedRef.current) {
      subscribedRef.current = true
      // markModifiedIfNotPulling: registra que el user hizo un cambio
      // local, IGNORANDO el setState que viene de un pull en curso. Sin
      // este filtro, cada pull hidrataría el store y dispararía subscribe,
      // marcando "modified" cuando en realidad es "remoto vino para acá".
      //
      // CRÍTICO: el markModified NO está gateado por state.userId.
      // Si vos editás ANTES de que getUser() resuelva (lo cual puede
      // demorar 100-500ms en mobile), el subscribe fire con userId=null.
      // Antes esto saltaba el markModified → la edición no quedaba
      // registrada como "unsynced" → al recargar, hasUnsyncedChanges
      // devolvía false → pull-first → pisaba tu edición.
      // Ahora SIEMPRE marcamos modified. El schedule sí depende del
      // userId porque no podés pushear sin sesión.
      useTasksStore.subscribe(() => { markModifiedIfNotPulling('tasks'); if (state.userId) scheduleTasks() })
      useWalletStore.subscribe(() => { markModifiedIfNotPulling('wallet'); if (state.userId) scheduleWallet() })
      useTradingStore.subscribe(() => { markModifiedIfNotPulling('trading'); if (state.userId) scheduleTrading() })
      useHabitsStore.subscribe(() => { markModifiedIfNotPulling('habits'); if (state.userId) scheduleHabits() })
      useGymStore.subscribe(() => { markModifiedIfNotPulling('gym'); if (state.userId) scheduleGymBasics() })
      useHealthStore.subscribe(() => { markModifiedIfNotPulling('health'); if (state.userId) scheduleHealth() })
      useChatStore.subscribe(() => { markModifiedIfNotPulling('chat'); if (state.userId) scheduleChat() })
      useFoodStore.subscribe(() => { markModifiedIfNotPulling('food'); if (state.userId) scheduleFood() })
      useSPIStore.subscribe(() => { markModifiedIfNotPulling('spi'); if (state.userId) scheduleSPI() })
      useProjectionStore.subscribe(() => { markModifiedIfNotPulling('projection'); if (state.userId) scheduleProjection() })
      useLabStore.subscribe(() => { markModifiedIfNotPulling('lab'); if (state.userId) scheduleLab() })
      useAppStore.subscribe(() => { markModifiedIfNotPulling('appPrefs'); if (state.userId) scheduleAppPrefs() })
      useMindMapStore.subscribe(() => { markModifiedIfNotPulling('mindmaps'); if (state.userId) scheduleMindMaps() })
      useKpisStore.subscribe(() => { markModifiedIfNotPulling('kpis'); if (state.userId) scheduleKpis() })
      useStudyStore.subscribe(() => { markModifiedIfNotPulling('study'); if (state.userId) scheduleStudy() })
      useContentStore.subscribe(() => { markModifiedIfNotPulling('content'); if (state.userId) scheduleContent() })
      useBacktestStore.subscribe(() => { markModifiedIfNotPulling('backtests'); if (state.userId) scheduleBacktests() })
      useJournalStore.subscribe(() => { markModifiedIfNotPulling('journal'); if (state.userId) scheduleJournal() })
      useConceptStore.subscribe(() => { markModifiedIfNotPulling('concepts'); if (state.userId) scheduleConcepts() })
    }

    // Auth state changes — when the user signs in *after* mount (e.g. from
    // /login → /dashboard), re-run init so the new user's data gets pulled.
    const { data: sub } = sb.auth.onAuthStateChange((_event: string, session: { user?: { id: string } } | null) => {
      const newId = session?.user?.id ?? null
      if (newId === state.userId) return
      state.userId = newId
      // Nuevo login → rehabilitamos el manejo de "sesión vencida" para la
      // próxima vez que caduque (si no, tras un re-login no volvería a avisar).
      if (newId) authExpiredHandled = false
      state.tasksInit = false
      state.walletInit = false
      state.tradingInit = false
      state.habitsInit = false
      state.gymBasicsInit = false
      state.healthInit = false
      state.chatInit = false
      state.foodInit = false
      state.spiInit = false
      state.projectionInit = false
      state.labInit = false
      state.appPrefsInit = false
      state.mindmapInit = false
      state.kpisInit = false
      state.studyInit = false
      state.contentInit = false
      state.backtestInit = false
      state.journalInit = false
      state.conceptInit = false
      if (newId) {
        initAllDomains().catch((e) => console.error('Init after auth change failed', e))
      }
    })

    // ── Auto-refresh al volver al tab / abrir la app ─────────────────────
    //
    // Caso de uso: cerrás la app en el cel, editás en la PC, abrís el cel
    // de nuevo horas después. Antes solo pulleaba en mount (que ya pasó).
    // Ahora también pulleamos cuando el tab vuelve a estar visible o
    // recibe focus. Sin necesidad de tocar nada.
    //
    // Throttle de 30s para no pegarle a Supabase si alternás rápido entre
    // tabs. El sync periódico de cambios locales ya tiene su propio
    // debounce, esto es ADICIONAL para "trae lo último de otros devices".
    let lastPullAt = 0
    const PULL_THROTTLE_MS = 30_000

    const tryAutoPull = async () => {
      if (!state.userId) return
      if (typeof document !== 'undefined' && document.hidden) return
      const now = Date.now()
      if (now - lastPullAt < PULL_THROTTLE_MS) return
      lastPullAt = now

      // Validar/refrescar la sesión ANTES de sincronizar. Si el token venció
      // en background, getSession lo renueva → el sync usa un token válido y
      // no caen 401. Si está muerto (no refrescable) → cerramos sesión sola.
      if (!(await ensureSession())) { await handleSessionExpired(); return }

      // Resetear init flags así initAllDomains corre las pulls de nuevo.
      // Si hay cambios locales pendientes, push-first los sube primero
      // (hasUnsyncedChanges los detecta). Si no, solo pull-first.
      state.tasksInit = false
      state.walletInit = false
      state.tradingInit = false
      state.habitsInit = false
      state.gymBasicsInit = false
      state.healthInit = false
      state.chatInit = false
      state.foodInit = false
      state.spiInit = false
      state.projectionInit = false
      state.labInit = false
      state.appPrefsInit = false
      state.mindmapInit = false
      state.kpisInit = false
      state.studyInit = false
      state.contentInit = false
      state.backtestInit = false
      state.journalInit = false
      state.conceptInit = false
      try {
        await initAllDomains()
      } catch (e) {
        console.error('Auto-pull on visibility failed', e)
      }
    }

    const onVisibilityChange = () => {
      if (typeof document === 'undefined') return
      if (document.hidden) {
        // ─── App se va a background ──────────────────────────────────────
        // FLUSH inmediato de cualquier push debounceado pendiente. Sin
        // esto, las ediciones que vos hiciste 0.5s antes de bloquear el
        // cel quedaban con su debounce de 1.5s colgado — el browser
        // pausa setTimeout cuando el tab no es visible, y cuando volvés
        // 6h después esos pushes NUNCA se mandaron a Supabase mientras
        // tanto. Otro device que abriste en el medio no vio tus cambios.
        // Ahora forzamos el push antes de que el browser pause JS.
        void flushAllPendingPushes()
      } else {
        tryAutoPull()
      }
    }
    const onFocus = () => tryAutoPull()
    // pagehide es más confiable que beforeunload en iOS Safari y se
    // dispara también cuando el user va al app switcher. Mismo flush.
    const onPageHide = () => { void flushAllPendingPushes() }
    // Al RECUPERAR conexión: reintentar el sync enseguida (bypass del throttle
    // de 30s). Así, si un push falló por "Load failed" (red caída), apenas
    // vuelve internet se sube solo, sin esperar ni que el user haga nada.
    const onOnline = () => { lastPullAt = 0; void tryAutoPull(); void flushAllPendingPushes() }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus)
      window.addEventListener('pagehide', onPageHide)
      window.addEventListener('online', onOnline)
    }

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus)
        window.removeEventListener('pagehide', onPageHide)
        window.removeEventListener('online', onOnline)
      }
    }
  }, [])
}

// Sync forzado de TODOS los dominios — útil para un botón "Sync ahora" o
// para llamar manualmente cuando el user lo necesita. Resetea init flags
// y vuelve a correr todo el ciclo.
export async function forceSyncAll(): Promise<void> {
  state.tasksInit = false
  state.walletInit = false
  state.tradingInit = false
  state.habitsInit = false
  state.gymBasicsInit = false
  state.healthInit = false
  state.chatInit = false
  state.foodInit = false
  state.spiInit = false
  state.projectionInit = false
  state.labInit = false
  state.appPrefsInit = false
  state.mindmapInit = false
  state.kpisInit = false
  state.studyInit = false
  state.contentInit = false
  state.backtestInit = false
  state.journalInit = false
  state.conceptInit = false
  await initAllDomains()
}

// ─── Manual triggers ──────────────────────────────────────────────────────────

export async function forceSyncTasks()    { await pushTasks() }
export async function forcePullTasks()    { return pullTasks() }

/** "Este dispositivo: descartar tareas locales y adoptar el cloud."
 *
 *  Para limpiar de una vez una divergencia vieja (data que quedó en este device
 *  de ANTES del sistema de tombstones y que de otro modo podría volver a
 *  pushearse/resucitar). Borra el store de tareas + sus baselines locales y
 *  hace un pull limpio: como local queda vacío, el merge devuelve EXACTAMENTE lo
 *  que hay en Supabase. NO sube nada de este device antes de bajar, así que es
 *  imposible que reviva o pise lo del cloud.
 *
 *  Devuelve cuántos projects/tasks quedaron tras adoptar el cloud. */
export async function resyncTasksFromCloud(): Promise<{ projects: number; tasks: number } | null> {
  // 1) Vaciar el store local (proyectos + tareas) y sus baselines, así el merge
  //    no conserva ninguna fila "local-only".
  startPulling('tasks') // evita que el setState de abajo marque modified
  try {
    useTasksStore.setState({ projects: {}, tasks: {} })
  } finally {
    endPulling('tasks')
  }
  setBaseline('tasks:projects', [])
  setBaseline('tasks:tasks', [])
  setBaseline('tasks:subtasks', [])
  // 2) Pull limpio: trae el estado canónico del cloud (incluye tombstones).
  return pullTasks()
}
export async function forceSyncWallet()   { await pushWallet() }
export async function forcePullWallet()   { return pullWallet() }
export async function forceSyncTrading()  { await pushTrading() }
export async function forcePullTrading()  { return pullTrading() }
export async function forceSyncHabits()   { await pushHabits() }
export async function forcePullHabits()   { return pullHabits() }
export async function forceSyncGymBasics() { await pushGymBasics() }
export async function forcePullGymBasics() { return pullGymBasics() }
export async function forceSyncHealth()   { await pushHealth() }
export async function forcePullHealth()   { return pullHealth() }
export async function forceSyncChat()     { await pushChat() }
export async function forcePullChat()     { return pullChat() }
export async function forceSyncFood()     { await pushFood() }
export async function forcePullFood()     { return pullFood() }
export async function forceSyncSPI()      { await pushSPI() }
export async function forcePullSPI()      { return pullSPI() }
export async function forceSyncProjection() { await pushProjection() }
export async function forcePullProjection() { return pullProjection() }
export async function forceSyncLab()      { await pushLab() }
export async function forcePullLab()      { return pullLab() }
export async function forceSyncAppPrefs() { await pushAppPrefs() }
export async function forcePullAppPrefs() { return pullAppPrefs() }
export async function forceSyncMindMaps() { await pushMindMaps() }
export async function forcePullMindMaps() { return pullMindMaps() }
export async function forceSyncKpis()     { await pushKpis() }
export async function forcePullKpis()     { return pullKpis() }
export async function forceSyncStudy()    { await pushStudy() }
export async function forcePullStudy()    { return pullStudy() }
export async function forceSyncContent()  { await pushContent() }
export async function forcePullContent()  { return pullContent() }
export async function forceSyncBacktests() { await pushBacktests() }
export async function forcePullBacktests() { return pullBacktests() }
export async function forceSyncJournal()   { await pushJournal() }
export async function forcePullJournal()   { return pullJournal() }
export async function forceSyncConcepts()  { await pushConcepts() }
export async function forcePullConcepts()  { return pullConcepts() }
