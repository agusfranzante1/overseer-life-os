'use client'
import { Star, CheckCircle2, Circle, CornerDownRight } from 'lucide-react'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useTranslation } from '@/hooks/useTranslation'
import { format } from 'date-fns'
import type { Task, Subtask } from '@/types'

/** Widget "Favoritas" del Dashboard — junta TODO lo marcado con ⭐ sin importar
 *  en qué proyecto vive, para tenerlo a la vista y completarlo desde acá.
 *
 *  Incluye:
 *   - Tareas madre favoritas (⭐ desde el menú ⋯ de la TaskCard).
 *   - Subtareas favoritas (⭐ desde el menú ⋯ de la subtarea) — se muestran
 *     SOLAS, con su proyecto y la tarea madre a la que pertenecen, para
 *     ubicarlas sin abrir el proyecto.
 *
 *  - Ordena: pendientes primero, completadas al fondo (atenuadas).
 *  - El check togglea completar (bidireccional). La estrella quita de favoritas.
 *  - Archivadas NO aparecen (ya están en la papelera). */
type FavItem =
  | { kind: 'task'; task: Task }
  | { kind: 'sub'; task: Task; sub: Subtask }

export function FavoriteTasksPanel() {
  const tasks = useTasksStore((s) => s.tasks)
  const projects = useTasksStore((s) => s.projects)
  const completeTask = useTasksStore((s) => s.completeTask)
  const toggleFavorite = useTasksStore((s) => s.toggleFavorite)
  const toggleSubtask = useTasksStore((s) => s.toggleSubtask)
  const toggleSubtaskFavorite = useTasksStore((s) => s.toggleSubtaskFavorite)
  const { dfLocale } = useTranslation()

  const isTaskDone = (task: Task): boolean => {
    if (task.completedAt) return true
    const proj = projects[task.projectId]
    return !!proj?.statuses.find((st) => st.label === task.status)?.countsAsDone
  }

  const isItemDone = (it: FavItem) =>
    it.kind === 'task' ? isTaskDone(it.task) : it.sub.completed

  const dueOf = (it: FavItem): string | undefined =>
    it.kind === 'task' ? it.task.dueDate : it.sub.dueDate

  const titleOf = (it: FavItem) =>
    it.kind === 'task' ? it.task.title : it.sub.title

  const favTasks: FavItem[] = Object.values(tasks)
    .filter((t) => t.favorite && !t.archivedAt)
    .map((task) => ({ kind: 'task', task }))

  const favSubs: FavItem[] = Object.values(tasks)
    .filter((t) => !t.archivedAt)
    .flatMap((task) =>
      (task.subtasks ?? [])
        .filter((s) => s.favorite && !s.archivedAt)
        .map((sub) => ({ kind: 'sub' as const, task, sub })),
    )

  const items: FavItem[] = [...favTasks, ...favSubs].sort((a, b) => {
    const aDone = isItemDone(a)
    const bDone = isItemDone(b)
    if (aDone !== bDone) return aDone ? 1 : -1 // pendientes primero
    const ad = dueOf(a)
    const bd = dueOf(b)
    if (ad && bd) return ad.localeCompare(bd)
    if (ad) return -1
    if (bd) return 1
    return titleOf(a).localeCompare(titleOf(b))
  })

  const fmtDue = (dueDate?: string, dueTime?: string): string | null => {
    if (!dueDate) return null
    const [y, m, d] = dueDate.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    const base = format(dt, 'EEE d MMM', { locale: dfLocale })
    return dueTime ? `${base} · ${dueTime}` : base
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Star className="w-4 h-4 text-amber-400 fill-current" />
        <h2 className="text-sm font-bold text-white">Favoritas</h2>
        <span className="text-[10px] font-mono text-zinc-600">
          {items.length} {items.length === 1 ? 'ítem' : 'ítems'}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-6 text-xs text-zinc-600 italic">
          Sin favoritas. Marcá una tarea o subtarea con la <Star className="w-3 h-3 inline text-amber-400/70" /> desde su
          menú <strong>⋯</strong>.
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((it) => {
            const done = isItemDone(it)
            const proj = projects[it.task.projectId]
            const isSub = it.kind === 'sub'
            const dueLabel = isSub
              ? fmtDue(it.sub.dueDate, it.sub.dueTime)
              : fmtDue(it.task.dueDate, it.task.dueTime)
            const key = isSub ? `sub:${it.sub.id}` : `task:${it.task.id}`
            const onToggleDone = () =>
              isSub ? toggleSubtask(it.task.id, it.sub.id) : completeTask(it.task.id)
            const onUnfav = () =>
              isSub ? toggleSubtaskFavorite(it.task.id, it.sub.id) : toggleFavorite(it.task.id)
            return (
              <div
                key={key}
                className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-xl border transition-colors ${
                  done
                    ? 'bg-black/20 border-white/[0.04] opacity-60'
                    : 'bg-black/25 border-white/[0.06] hover:border-amber-500/25'
                }`}
              >
                <button
                  onClick={onToggleDone}
                  title={done ? 'Marcar como pendiente' : 'Marcar como completada'}
                  className={`shrink-0 transition-colors ${done ? 'text-emerald-400' : 'text-zinc-600 hover:text-emerald-400'}`}
                >
                  {done ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-medium truncate flex items-center gap-1 ${done ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>
                    {isSub && <CornerDownRight className="w-3 h-3 text-zinc-600 shrink-0" />}
                    <span className="truncate">{titleOf(it)}</span>
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {proj && (
                      <span className="flex items-center gap-1 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: proj.color }} />
                        <span className="text-[10px] text-zinc-600 truncate">{proj.name}</span>
                      </span>
                    )}
                    {/* Para subtareas: mostramos la tarea madre para ubicarla. */}
                    {isSub && (
                      <span className="text-[10px] text-zinc-600 truncate">
                        en <span className="text-zinc-500">{it.task.title}</span>
                      </span>
                    )}
                    {dueLabel && (
                      <span className="text-[10px] text-zinc-500 shrink-0">{dueLabel}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={onUnfav}
                  title="Quitar de favoritas"
                  className="shrink-0 text-amber-400 hover:text-amber-300 opacity-70 group-hover:opacity-100 transition-all"
                >
                  <Star className="w-3.5 h-3.5 fill-current" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
