import type { Task } from '@/types'

/** Una fila de la lista de tareas: o una tarea suelta, o una SERIE recurrente
 *  colapsada (madre + instancias). */
export type TaskRow =
  | { kind: 'single'; task: Task }
  | { kind: 'series'; headId: string; mother: Task; instances: Task[] }

/** Clave de serie recurrente de una tarea, o null si no es recurrente.
 *  - Instancia hija: su `recurringHeadId`.
 *  - Madre (o tarea con recurrencia sin head): su propio id. */
function seriesKey(t: Task): string | null {
  if (t.recurringHeadId) return t.recurringHeadId
  if (t.recurrence) return t.id
  return null
}

/** Agrupa instancias recurrentes de la misma serie en una sola fila
 *  ('series'), preservando el orden del input (la serie se ancla en la
 *  posición de su PRIMER miembro). Grupos de 1 miembro y tareas no
 *  recurrentes se emiten como 'single'. */
export function groupRecurringSeries(tasks: Task[]): TaskRow[] {
  const groups = new Map<string, Task[]>()
  const firstIndex = new Map<string, number>()
  const rows: Array<{ idx: number; row: TaskRow }> = []

  tasks.forEach((t, idx) => {
    const key = seriesKey(t)
    if (!key) {
      rows.push({ idx, row: { kind: 'single', task: t } })
      return
    }
    if (!groups.has(key)) { groups.set(key, []); firstIndex.set(key, idx) }
    groups.get(key)!.push(t)
  })

  for (const [key, members] of groups) {
    const idx = firstIndex.get(key)!
    if (members.length === 1) {
      rows.push({ idx, row: { kind: 'single', task: members[0] } })
      continue
    }
    const byDue = [...members].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    const mother = members.find((m) => m.recurringHeadId === m.id) ?? byDue[0]
    rows.push({ idx, row: { kind: 'series', headId: key, mother, instances: byDue } })
  }

  rows.sort((a, b) => a.idx - b.idx)
  return rows.map((r) => r.row)
}
