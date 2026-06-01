import type { Task, Priority } from '@/types'

/** Orden numérico para comparar prioridades. Mayor = más urgente. */
const PRIORITY_RANK: Record<Priority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
}

/** Prioridad EFECTIVA de una tarea para display y filtros.
 *
 *  Regla de escalamiento heredado:
 *   - Si la tarea tiene al menos una subtarea ABIERTA (no completed, no
 *     archivada) con `priority === 'urgent'`, la madre se trata como
 *     `'high'` aunque su priority real sea más baja.
 *   - El priority real NUNCA se sobreescribe en el store — solo lo
 *     computamos al leer. Cuando la sub-urgent desaparece (se completa,
 *     se borra, o cambia de prioridad), la madre vuelve a su priority
 *     original sin necesidad de "deshacer" nada.
 *
 *  Casos especiales:
 *   - Si la tarea ya es 'urgent' o 'high' por sí misma, gana la suya
 *     (max). No "desescala" por tener hijas urgentes.
 *   - Sólo escala a 'high' (no a 'urgent') — pedido del usuario para
 *     diferenciar entre una tarea intrínsecamente urgente y una madre
 *     que arrastra urgencia de abajo. */
export function effectivePriority(task: Task): Priority {
  let derived: Priority = task.priority
  const hasUrgentChild = task.subtasks.some(
    (sub) => sub.priority === 'urgent' && !sub.completed && !sub.archivedAt
  )
  if (hasUrgentChild) {
    // Si la propia es URGENT, queda urgent (no podemos "bajar" a high).
    // Si la propia es LOW/MEDIUM/HIGH, queda HIGH.
    derived = PRIORITY_RANK[derived] > PRIORITY_RANK.high ? derived : 'high'
  }
  return derived
}

/** Verdadero si la prioridad EFECTIVA fue escalada por una hija urgente
 *  (es decir, distinta de la prioridad almacenada). Útil para mostrar
 *  un indicador visual sutil al usuario ("esta tarea está como high
 *  porque tiene una subtarea urgente"). */
export function isPriorityEscalated(task: Task): boolean {
  return effectivePriority(task) !== task.priority
}
