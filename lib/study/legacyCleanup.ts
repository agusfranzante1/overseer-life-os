'use client'
/**
 * Limpieza one-time del viejo sistema de Estudio que vivía sobre el task
 * manager: Materias = Project type='subject' colgadas de un contenedor
 * "Estudios". Ahora ESTUDIO es un módulo independiente (`studyStore`), así que
 * esos proyectos ya no se usan y solo ensucian el task manager / el sync.
 *
 * Esta función los borra UNA sola vez por dispositivo (guard con flag en
 * localStorage). Es idempotente: si no hay nada que limpiar, solo deja el flag.
 * Los borrados se propagan a otros devices por los tombstones del sync.
 *
 * NO toca proyectos de Contenido (type='content') ni el contenedor "Contenido".
 */
import { useTasksStore } from '@/lib/store/tasksStore'

const FLAG = 'overseer-study-legacy-cleaned-v1'

export function cleanupLegacySubjectProjects(): void {
  if (typeof window === 'undefined') return
  try {
    if (localStorage.getItem(FLAG)) return
  } catch {
    return
  }

  const store = useTasksStore.getState()
  const projects = Object.values(store.projects)

  // 1) Materias viejas: proyectos type='subject'. deleteProject borra también
  //    sus tasks (las "clases").
  const subjectIds = projects.filter((p) => p.type === 'subject').map((p) => p.id)
  for (const id of subjectIds) store.deleteProject(id)

  // 2) Contenedor "Estudios" (name === 'Estudios' && sin parent). Lo borramos
  //    solo si quedó sin tasks vivas propias, para no llevarnos por delante
  //    tareas que el user haya cargado ahí a mano.
  const containers = Object.values(useTasksStore.getState().projects).filter(
    (p) => p.name === 'Estudios' && !p.parentProjectId && p.type !== 'content',
  )
  const tasksNow = useTasksStore.getState().tasks
  for (const c of containers) {
    const liveTasks = c.taskIds.filter((tid) => {
      const t = tasksNow[tid]
      return t && !t.archivedAt
    })
    if (liveTasks.length === 0) useTasksStore.getState().deleteProject(c.id)
  }

  try {
    localStorage.setItem(FLAG, new Date().toISOString())
  } catch {
    /* best-effort */
  }
}
