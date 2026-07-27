/** Serializa una tarea madre + sus subtareas a texto indentado para el
 *  portapapeles (checklist en markdown). Pensado para pegar en notas, docs, o
 *  de vuelta en el task manager.
 *
 *  Formato:
 *    Título de la tarea madre
 *    - [ ] subtarea nivel 1
 *      - [x] subtarea nivel 2 (completada)
 *    - [ ] otra subtarea
 */
import type { Task } from '@/types'

export function taskToClipboardText(task: Task): string {
  const box = (done: boolean) => (done ? '[x]' : '[ ]')
  const lines: string[] = [task.title.trim() || 'Sin título']

  const live = (task.subtasks ?? []).filter((s) => !s.archivedAt)
  const roots = live.filter((s) => !s.parentId)
  for (const root of roots) {
    lines.push(`- ${box(root.completed)} ${root.title.trim()}`)
    const children = live.filter((s) => s.parentId === root.id)
    for (const child of children) {
      lines.push(`  - ${box(child.completed)} ${child.title.trim()}`)
    }
  }
  return lines.join('\n')
}

/** Copia el texto al portapapeles. Devuelve true si funcionó. Fallback a
 *  execCommand para contextos sin `navigator.clipboard` (http, viejos). */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* cae al fallback */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
