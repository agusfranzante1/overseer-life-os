'use client'
import { Star, CheckCircle2, Circle } from 'lucide-react'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useTranslation } from '@/hooks/useTranslation'
import { format } from 'date-fns'

/** Widget "Favoritas" del Dashboard — junta TODAS las tareas marcadas con ⭐
 *  (desde el menú ⋯ de la TaskCard) sin importar en qué proyecto viven, para
 *  tenerlas a la vista y poder completarlas desde acá con un checkbox.
 *
 *  - Ordena: pendientes primero, completadas al fondo (atenuadas).
 *  - El check togglea `completeTask` (bidireccional: re-abre si estaba hecha).
 *  - La estrella quita de favoritas (no borra la tarea).
 *  - Archivadas NO aparecen (ya están en la papelera). */
export function FavoriteTasksPanel() {
  const tasks = useTasksStore((s) => s.tasks)
  const projects = useTasksStore((s) => s.projects)
  const completeTask = useTasksStore((s) => s.completeTask)
  const toggleFavorite = useTasksStore((s) => s.toggleFavorite)
  const { dfLocale } = useTranslation()

  const isTaskDone = (taskId: string): boolean => {
    const task = tasks[taskId]
    if (!task) return false
    if (task.completedAt) return true
    const proj = projects[task.projectId]
    return !!proj?.statuses.find((st) => st.label === task.status)?.countsAsDone
  }

  const favorites = Object.values(tasks)
    .filter((t) => t.favorite && !t.archivedAt)
    .sort((a, b) => {
      const aDone = isTaskDone(a.id)
      const bDone = isTaskDone(b.id)
      if (aDone !== bDone) return aDone ? 1 : -1 // pendientes primero
      // Dentro del grupo: con fecha antes que sin, y por fecha ascendente.
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
      if (a.dueDate) return -1
      if (b.dueDate) return 1
      return a.title.localeCompare(b.title)
    })

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Star className="w-4 h-4 text-amber-400 fill-current" />
        <h2 className="text-sm font-bold text-white">Favoritas</h2>
        <span className="text-[10px] font-mono text-zinc-600">
          {favorites.length} {favorites.length === 1 ? 'tarea' : 'tareas'}
        </span>
      </div>

      {favorites.length === 0 ? (
        <div className="text-center py-6 text-xs text-zinc-600 italic">
          Sin tareas favoritas. Marcá una con la <Star className="w-3 h-3 inline text-amber-400/70" /> desde el
          menú <strong>⋯</strong> de cualquier tarea.
        </div>
      ) : (
        <div className="space-y-1.5">
          {favorites.map((task) => {
            const done = isTaskDone(task.id)
            const proj = projects[task.projectId]
            const dueLabel = task.dueDate
              ? (() => {
                  const [y, m, d] = task.dueDate.split('-').map(Number)
                  const dt = new Date(y, m - 1, d)
                  const base = format(dt, 'EEE d MMM', { locale: dfLocale })
                  return task.dueTime ? `${base} · ${task.dueTime}` : base
                })()
              : null
            return (
              <div
                key={task.id}
                className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-xl border transition-colors ${
                  done
                    ? 'bg-black/20 border-white/[0.04] opacity-60'
                    : 'bg-black/25 border-white/[0.06] hover:border-amber-500/25'
                }`}
              >
                <button
                  onClick={() => completeTask(task.id)}
                  title={done ? 'Marcar como pendiente' : 'Marcar como completada'}
                  className={`shrink-0 transition-colors ${done ? 'text-emerald-400' : 'text-zinc-600 hover:text-emerald-400'}`}
                >
                  {done ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-medium truncate ${done ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {proj && (
                      <span className="flex items-center gap-1 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: proj.color }} />
                        <span className="text-[10px] text-zinc-600 truncate">{proj.name}</span>
                      </span>
                    )}
                    {dueLabel && (
                      <span className="text-[10px] text-zinc-500 shrink-0">{dueLabel}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => toggleFavorite(task.id)}
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
