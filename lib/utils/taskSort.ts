import type { Subtask, Project } from '@/types'

/** Modos de ordenamiento para tareas y sub-tareas — compartido entre la
 *  vista de proyecto (top-level tasks) y los sub-tasks dentro de cada
 *  TaskCard. Cuando el usuario elige un modo en el toolbar del proyecto,
 *  se aplica al mismo tiempo a madres y a todos los niveles de sub-tasks.
 *
 *  El nombre `KanbanSort` se mantiene por compatibilidad histórica — el
 *  modo aplica a list, kanban Y subtasks, no solo Kanban. */
export type KanbanSort =
  | 'priority'         // urgent → high → medium → low
  | 'priorityAsc'      // low → medium → high → urgent
  | 'status'           // según el orden definido en el proyecto
  | 'statusReverse'    // orden de proyecto invertido
  | 'dueDate'          // próximas primero, sin fecha al final
  | 'alphabetical'     // por título A→Z
  | 'newest'           // creadas más recientes primero
  | 'oldest'           // más viejas primero
  | 'manual'           // respeta el orden manual del usuario

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}

/** Ordena una lista de Subtasks aplicando el mismo modo que las tasks
 *  top-level, pero con dos reglas extra ineludibles:
 *
 *    1. "Completadas primero" SIEMPRE — se agrupan arriba para que las
 *       activas ("to-do") queden en la mitad inferior donde el user
 *       trabaja. Esto matchea el patrón visual histórico de la app.
 *    2. Si el modo es 'manual', dentro de cada grupo se respeta el
 *       campo `order` (drag-and-drop manual). En cualquier otro modo,
 *       el orden secundario lo decide ese modo.
 *
 *  Los archived NO se incluyen — quien llama debe pre-filtrarlos. */
export function sortSubtasks(
  subs: Subtask[],
  mode: KanbanSort,
  project: Project | null,
): Subtask[] {
  // Map de status label → orden numérico del proyecto, para sort por
  // status. Null cuando el proyecto no está disponible (multi-proyecto
  // view), en cuyo caso caemos a alfabético.
  const statusOrder: Map<string, number> | null = project
    ? new Map(project.statuses.map((s) => [s.label, s.order]))
    : null

  // Tiebreaker para "recién agregadas al final": el campo `order` lo
  // setea addSubtask a `subtasks.length` cuando se crea, así que
  // ascendiente refleja orden de inserción (oldest → newest).
  const ageTiebreak = (a: Subtask, b: Subtask) => a.order - b.order

  // Dentro del mismo bucket de prioridad: con dueDate pesa más que sin.
  // Espejo de la regla en sortTasks (TasksPage.tsx).
  const dueDateTiebreak = (a: Subtask, b: Subtask): number => {
    if (!a.dueDate && !b.dueDate) return 0
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate.localeCompare(b.dueDate)
  }

  const secondary = (a: Subtask, b: Subtask): number => {
    switch (mode) {
      case 'priority': {
        const d = (PRIORITY_RANK[a.priority ?? 'low'] ?? 9) - (PRIORITY_RANK[b.priority ?? 'low'] ?? 9)
        if (d !== 0) return d
        const dd = dueDateTiebreak(a, b)
        return dd !== 0 ? dd : ageTiebreak(a, b)
      }
      case 'priorityAsc': {
        const d = (PRIORITY_RANK[b.priority ?? 'low'] ?? 9) - (PRIORITY_RANK[a.priority ?? 'low'] ?? 9)
        if (d !== 0) return d
        const dd = dueDateTiebreak(a, b)
        return dd !== 0 ? dd : ageTiebreak(a, b)
      }
      case 'status': {
        if (statusOrder) {
          const oa = statusOrder.get(a.status) ?? 999
          const ob = statusOrder.get(b.status) ?? 999
          if (oa !== ob) return oa - ob
        }
        const d = a.status.localeCompare(b.status)
        return d !== 0 ? d : ageTiebreak(a, b)
      }
      case 'statusReverse': {
        if (statusOrder) {
          const oa = statusOrder.get(a.status) ?? 999
          const ob = statusOrder.get(b.status) ?? 999
          if (oa !== ob) return ob - oa
        }
        const d = b.status.localeCompare(a.status)
        return d !== 0 ? d : ageTiebreak(a, b)
      }
      case 'dueDate':
        // Subtasks tienen dueDate opcional. Sin fecha → al final.
        if (!a.dueDate && !b.dueDate) return ageTiebreak(a, b)
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate.localeCompare(b.dueDate) || ageTiebreak(a, b)
      case 'alphabetical': {
        const d = a.title.localeCompare(b.title)
        return d !== 0 ? d : ageTiebreak(a, b)
      }
      case 'newest':
        // Subtasks no tienen createdAt — usamos id que tiene timestamp
        // embebido al final (ver `genId()`). Aproximación suficiente
        // para "más reciente arriba".
        return b.id.localeCompare(a.id)
      case 'oldest':
        return a.id.localeCompare(b.id)
      case 'manual':
      default:
        return a.order - b.order
    }
  }

  return [...subs].sort((a, b) => {
    // Regla #1: completadas arriba (true sortea antes que false).
    if (a.completed !== b.completed) return a.completed ? -1 : 1
    // Regla #2: dentro del grupo, ordenar según el modo.
    return secondary(a, b)
  })
}
