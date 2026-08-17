import type { Task } from '@/types'
import { effectivePriority } from '@/lib/utils/taskPriority'

/** Una "lista guardada" (smart list): un conjunto de criterios de filtro con
 *  nombre, que vive debajo de Recurrentes/Papelera y cruza TODOS los proyectos.
 *  Ej: "Software" (tag=software), "Hacer hoy" (vence hoy O urgente).
 *
 *  Sincroniza multi-device por el blob `app_preferences` (merge por-campo),
 *  igual que `hiddenProjects`. Vive en `taskUiStore`. */
export type SavedViewDue = 'today' | 'todayOrOverdue' | 'week'

export interface SavedTaskView {
  id: string
  name: string
  /** Cómo se combinan las dimensiones activas:
   *   - 'any' (OR): la tarea entra si CUALQUIER dimensión matchea (ej. "vence
   *     hoy O es urgente"). Default — es lo más útil para estas listas.
   *   - 'all' (AND): la tarea entra solo si TODAS las dimensiones activas
   *     matchean (ej. "tag software Y urgente"). */
  match: 'any' | 'all'
  /** Etiquetas — la tarea matchea si tiene AL MENOS una (OR interno). */
  tags?: string[]
  /** Prioridades efectivas — 'urgent'|'high'|'medium'|'low'. */
  priorities?: string[]
  /** Condición de vencimiento (opcional). */
  due?: SavedViewDue | null
  createdAt: string
  updatedAt: string
}

/** YYYY-MM-DD local de hoy. */
export function todayKeyLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function matchesDue(t: Task, due: SavedViewDue, todayKey: string): boolean {
  if (!t.dueDate) return false
  if (due === 'today') return t.dueDate === todayKey
  if (due === 'todayOrOverdue') return t.dueDate <= todayKey
  if (due === 'week') {
    // hoy .. hoy+6 (inclusive)
    const [y, m, d] = todayKey.split('-').map(Number)
    const end = new Date(y, m - 1, d); end.setDate(end.getDate() + 6)
    const endKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
    return t.dueDate >= todayKey && t.dueDate <= endKey
  }
  return false
}

/** ¿La tarea entra en la lista guardada? Las dimensiones vacías se ignoran.
 *  Una lista sin criterios matchea todo. */
export function taskMatchesView(t: Task, view: SavedTaskView, todayKey: string): boolean {
  const checks: boolean[] = []

  if (view.tags && view.tags.length > 0) {
    checks.push((t.tags ?? []).some((tag) => view.tags!.includes(tag)))
  }

  if (view.priorities && view.priorities.length > 0) {
    const eff = effectivePriority(t)
    const bySub = (t.subtasks ?? []).some(
      (s) => !s.completed && !s.archivedAt && !!s.priority && view.priorities!.includes(s.priority),
    )
    checks.push(view.priorities.includes(eff) || bySub)
  }

  if (view.due) {
    checks.push(matchesDue(t, view.due, todayKey))
  }

  if (checks.length === 0) return true
  return view.match === 'all' ? checks.every(Boolean) : checks.some(Boolean)
}

/** Etiqueta humana corta de los criterios — para el subtítulo de la lista. */
export function describeView(view: SavedTaskView): string {
  const parts: string[] = []
  if (view.tags?.length) parts.push(view.tags.map((t) => `#${t}`).join(', '))
  if (view.priorities?.length) {
    const label: Record<string, string> = { urgent: 'urgente', high: 'alta', medium: 'media', low: 'baja' }
    parts.push(view.priorities.map((p) => label[p] ?? p).join('/'))
  }
  if (view.due) {
    const dueLabel: Record<SavedViewDue, string> = {
      today: 'vence hoy', todayOrOverdue: 'vencidas + hoy', week: 'esta semana',
    }
    parts.push(dueLabel[view.due])
  }
  if (parts.length === 0) return 'todas las tareas'
  return parts.join(view.match === 'all' ? ' + ' : ' · ')
}
