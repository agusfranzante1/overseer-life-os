'use client'
import type { Subtask, Task, Project, Priority } from '@/types'
import type { ContentStageId, ContentItem, ContentProfile, ContentCampaign } from '@/types/content'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useContentStore } from '@/lib/store/contentStore'
import { DEFAULT_STATUSES } from '@/lib/utils/constants'

const CS_NAME = 'Content Strategy'
const SUB_PREFIX = 'cs_'

/** Medalla del perfil → prioridad de su tarea madre en el task manager.
 *  oro = alta, bronce = media, plata = baja (sin medalla → media). */
function medalPriority(medal: ContentProfile['medal']): Priority {
  return medal === 'gold' ? 'high' : medal === 'silver' ? 'low' : 'medium'
}
/** Id FIJO del proyecto "Content Strategy". Determinístico para que todos los
 *  dispositivos usen el MISMO proyecto y las tareas madre no apunten a un id
 *  que no existe en otro device (evita FK 23503). */
const CS_PROJ_ID = 'proj_content_root'

/** Asegura el proyecto "Content Strategy" con id fijo, fusionando cualquier
 *  proyecto de contenido viejo (root con id random de versiones previas, o
 *  sub-proyectos v1 `type:'content'`) y limpiando sus tareas huérfanas. */
function ensureCsProject(): string {
  useTasksStore.setState((s) => {
    const projects = { ...s.projects }
    const tasks = { ...s.tasks }
    const now = new Date().toISOString()

    if (!projects[CS_PROJ_ID]) {
      projects[CS_PROJ_ID] = {
        id: CS_PROJ_ID, name: CS_NAME, color: '#d946ef', icon: '🎬',
        statuses: DEFAULT_STATUSES, taskIds: [], createdAt: now, archived: false,
        isSystemProject: true, systemProjectKey: 'content-root',
      } as Project
    }
    const keepIds = new Set<string>(projects[CS_PROJ_ID].taskIds ?? [])

    for (const p of Object.values(projects)) {
      if (p.id === CS_PROJ_ID) continue
      const isOldRoot = p.systemProjectKey === 'content-root'
      const isV1Sub = p.type === 'content'
      if (!isOldRoot && !isV1Sub) continue
      for (const t of Object.values(tasks)) {
        if (t.projectId !== p.id) continue
        if (isOldRoot) { tasks[t.id] = { ...t, projectId: CS_PROJ_ID }; keepIds.add(t.id) }
        else { delete tasks[t.id] }   // tarea espejo v1 → ya no se usa
      }
      delete projects[p.id]
    }
    projects[CS_PROJ_ID] = {
      ...projects[CS_PROJ_ID],
      taskIds: Array.from(keepIds).filter((id) => !!tasks[id]),
    }
    return { projects, tasks }
  })
  return CS_PROJ_ID
}

/** Etiqueta corta de la etapa, usada como prefijo del título de la subtarea. */
export const CS_STAGE_LABEL: Record<ContentStageId, string> = {
  idea: 'Idea', script: 'Guion', recording: 'Grabación',
  editing: 'Edición', scheduled: 'Agendado', published: 'Publicado',
}

/** ¿El perfil tiene contenido real? Evita crear una tarea madre para el
 *  perfil "Personal" vacío que cada device siembra al arrancar. */
function profileIsReal(p: ContentProfile, items: ContentItem[], campaigns: ContentCampaign[]): boolean {
  if (items.some((it) => it.profileId === p.id)) return true
  if (campaigns.some((c) => c.profileId === p.id)) return true
  if ((p.visualStyle ?? []).some((cat) => (cat.images?.length ?? 0) > 0)) return true
  const dna = (p.brandDNA ?? {}) as unknown as Record<string, unknown>
  return Object.values(dna).some((v) => typeof v === 'string' && v.trim() !== '')
}

function subtaskTitle(item: ContentItem): string {
  return `${CS_STAGE_LABEL[item.stage]} · ${item.title?.trim() || '(sin título)'}`
}

/** Reconcilia Content Strategy → task manager. Idempotente. Estructura:
 *  UN proyecto "Content Strategy" → una TAREA MADRE por perfil → una SUBTAREA
 *  por pieza (id `cs_<itemId>`, título con prefijo de etapa, completada cuando
 *  la pieza está Publicada). Las subtareas del usuario (no `cs_`) no se tocan,
 *  así puede agregar tareas normales dentro de cada perfil. NO borra: las bajas
 *  se manejan en contentStore (removeItem / removeProfile). */
export function reconcileContentTasks(): void {
  const content = useContentStore.getState()
  const { profiles, items, campaigns } = content
  const realProfiles = profiles.filter((p) => profileIsReal(p, items, campaigns))
  if (realProfiles.length === 0) return

  // 1. Proyecto único "Content Strategy" (id fijo + limpieza de viejos).
  const projId = ensureCsProject()
  const firstStatus = useTasksStore.getState().projects[projId]?.statuses[0]?.label ?? 'To Do'

  // 2. Tarea madre por perfil con id DETERMINÍSTICO `csmom_<profileId>`. Es
  //    clave que sea estable cross-device: si cada device le pusiera un id
  //    random, la misma subtarea `cs_<itemId>` quedaría bajo dos madres
  //    distintas y el push de subtareas duplicaría el id (Postgres 21000).
  const motherByProfile = new Map<string, string>()
  const profilePatches: Record<string, Partial<ContentProfile>> = {}
  for (const profile of realProfiles) {
    const motherId = `csmom_${profile.id}`
    motherByProfile.set(profile.id, motherId)
    useTasksStore.setState((s) => {
      const proj = s.projects[projId]
      if (!proj) return s
      const now = new Date().toISOString()
      const prio = medalPriority(profile.medal)
      const existing = s.tasks[motherId]
      if (!existing) {
        const t: Task = {
          id: motherId, projectId: projId, title: profile.name,
          status: firstStatus, priority: prio, importance: 'medium',
          subtasks: [], createdAt: now, updatedAt: now,
        }
        return {
          tasks: { ...s.tasks, [motherId]: t },
          projects: { ...s.projects, [projId]: { ...proj, taskIds: Array.from(new Set([...(proj.taskIds ?? []), motherId])) } },
        }
      }
      const needsTitle = existing.title !== profile.name
      const needsProj = existing.projectId !== projId
      const needsPrio = existing.priority !== prio
      const inList = (proj.taskIds ?? []).includes(motherId)
      if (!needsTitle && !needsProj && !needsPrio && inList) return s
      return {
        tasks: { ...s.tasks, [motherId]: { ...existing, title: profile.name, projectId: projId, priority: prio, updatedAt: now } },
        projects: inList ? s.projects : { ...s.projects, [projId]: { ...proj, taskIds: [...(proj.taskIds ?? []), motherId] } },
      }
    })
    if (profile.linkedTaskId !== motherId) profilePatches[profile.id] = { linkedTaskId: motherId }
  }
  if (Object.keys(profilePatches).length > 0) {
    useContentStore.setState((s) => ({
      profiles: s.profiles.map((p) => profilePatches[p.id] ? { ...p, ...profilePatches[p.id] } : p),
    }))
  }

  // Consolidación de DUPLICADOS: cualquier tarea madre de contenido con id no
  // determinístico (creada por versiones previas, incluso VACÍA) se fusiona en
  // la `csmom_<profileId>` correcta y se borra. Se la reconoce por su título
  // (= nombre del perfil) o por tener subtareas de pieza (`cs_`). Las subtareas
  // que el usuario agregó a mano se mueven a la madre buena (no se pierden).
  {
    const fresh = useTasksStore.getState()
    const validMomIds = new Set(motherByProfile.values())
    const profileIdByName = new Map(realProfiles.map((p) => [p.name, p.id]))
    const itemsById = new Map(items.map((it) => [it.id, it]))
    const inProj = Object.values(fresh.tasks).filter((t) => t.projectId === projId)
    const moves: Array<{ target: string; userSubs: Subtask[]; deleteId: string }> = []
    for (const t of inProj) {
      if (validMomIds.has(t.id)) continue
      const csSub = (t.subtasks ?? []).find((st) => st.id.startsWith(SUB_PREFIX))
      let profileId = profileIdByName.get(t.title)
      if (!profileId && csSub) profileId = itemsById.get(csSub.id.slice(SUB_PREFIX.length))?.profileId
      if (!profileId) continue   // no es una madre de contenido → no tocar
      const target = motherByProfile.get(profileId)
      if (!target || target === t.id) continue
      moves.push({ target, userSubs: (t.subtasks ?? []).filter((st) => !st.id.startsWith(SUB_PREFIX)), deleteId: t.id })
    }
    if (moves.length > 0) {
      useTasksStore.setState((s) => {
        const tasks = { ...s.tasks }
        for (const mv of moves) {
          const tgt = tasks[mv.target]
          if (tgt && mv.userSubs.length > 0) {
            tasks[mv.target] = { ...tgt, subtasks: [...(tgt.subtasks ?? []), ...mv.userSubs], updatedAt: new Date().toISOString() }
          }
        }
        return { tasks }
      })
      for (const mv of moves) useTasksStore.getState().deleteTask(mv.deleteId)
    }
  }

  // 3. Subtarea `cs_<itemId>` por pieza, agrupadas por tarea madre.
  const itemsByMother = new Map<string, ContentItem[]>()
  for (const item of items) {
    const motherId = motherByProfile.get(item.profileId)
    if (!motherId) continue
    const arr = itemsByMother.get(motherId) ?? []
    arr.push(item)
    itemsByMother.set(motherId, arr)
  }

  useTasksStore.setState((s) => {
    let changed = false
    const tasks = { ...s.tasks }
    for (const [motherId, its] of itemsByMother) {
      const mother = tasks[motherId]
      if (!mother) continue
      const existing = mother.subtasks ?? []
      const prevCs = new Map(existing.filter((st) => st.id.startsWith(SUB_PREFIX)).map((st) => [st.id, st]))
      const userSubs = existing.filter((st) => !st.id.startsWith(SUB_PREFIX))
      const now = new Date().toISOString()
      const desiredCs: Subtask[] = its.map((item, i) => {
        const id = `${SUB_PREFIX}${item.id}`
        const prev = prevCs.get(id)
        const completed = item.stage === 'published'
        return {
          id,
          title: subtaskTitle(item),
          completed,
          status: prev?.status ?? firstStatus,
          order: prev?.order ?? userSubs.length + i,
          notes: prev?.notes ?? '',
          priority: prev?.priority ?? 'low',
          dueDate: item.scheduledYmd || undefined,
          dueTime: item.scheduledTime || undefined,
          completedAt: completed ? (prev?.completedAt ?? now) : undefined,
        }
      })
      const prevStr = JSON.stringify(existing.filter((st) => st.id.startsWith(SUB_PREFIX)))
      const nextStr = JSON.stringify(desiredCs)
      if (prevStr !== nextStr) {
        tasks[motherId] = { ...mother, subtasks: [...userSubs, ...desiredCs], updatedAt: now }
        changed = true
      }
    }
    return changed ? { tasks } : s
  })
}

/** Saca la subtarea de una pieza de su tarea madre (desde removeItem). */
export function deleteItemSubtask(item: ContentItem | undefined): void {
  if (!item) return
  const motherId = useContentStore.getState().profiles.find((p) => p.id === item.profileId)?.linkedTaskId
  if (!motherId) return
  const subId = `${SUB_PREFIX}${item.id}`
  useTasksStore.setState((s) => {
    const t = s.tasks[motherId]
    if (!t) return s
    const subtasks = (t.subtasks ?? []).filter((st) => st.id !== subId)
    if (subtasks.length === (t.subtasks?.length ?? 0)) return s
    return { tasks: { ...s.tasks, [motherId]: { ...t, subtasks, updatedAt: new Date().toISOString() } } }
  })
}

/** Borra la tarea madre de un perfil (desde removeProfile). */
export function deleteProfileMother(profileId: string): void {
  const motherId = useContentStore.getState().profiles.find((p) => p.id === profileId)?.linkedTaskId
  if (motherId && useTasksStore.getState().tasks[motherId]) {
    useTasksStore.getState().deleteTask(motherId)
  }
}

/** Dirección inversa: al togglear/completar una subtarea de contenido (`cs_`)
 *  en el manager, refleja la etapa de la pieza (completar → Publicado;
 *  des-completar una pieza publicada → Agendado). Escritura directa, sin loop.
 *  Se llama desde tasksStore.toggleSubtask / updateSubtask. */
export function syncSubtaskCompletionToItem(subtaskId: string, completed: boolean): void {
  if (!subtaskId.startsWith(SUB_PREFIX)) return
  const itemId = subtaskId.slice(SUB_PREFIX.length)
  const item = useContentStore.getState().items.find((it) => it.id === itemId)
  if (!item) return
  const wantStage: ContentStageId = completed
    ? 'published'
    : (item.stage === 'published' ? 'scheduled' : item.stage)
  if (wantStage === item.stage) return
  useContentStore.setState((s) => ({
    items: s.items.map((it) => it.id === itemId ? { ...it, stage: wantStage, updatedAt: new Date().toISOString() } : it),
  }))
}
