import type { Project, Subtask } from '@/types'
import { sortSubtasks, type KanbanSort } from '@/lib/utils/taskSort'

export interface SubtaskTreeNode {
  subtask: Subtask
  children: SubtaskTreeNode[]
}

function manualSubtaskCompare(a: Subtask, b: Subtask): number {
  return (a.order ?? 0) - (b.order ?? 0)
    || a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' })
    || a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
}

export function buildSubtaskTree(
  subtasks: Subtask[],
  options: { sortMode?: KanbanSort; project?: Project | null } = {},
): SubtaskTreeNode[] {
  const visible = subtasks.filter((subtask) => !subtask.archivedAt)
  const ids = new Set(visible.map((subtask) => subtask.id))
  const nodes = new Map<string, SubtaskTreeNode>()
  for (const subtask of visible) nodes.set(subtask.id, { subtask, children: [] })

  const roots: SubtaskTreeNode[] = []
  for (const node of nodes.values()) {
    const parentId = node.subtask.parentId
    const parent = parentId && parentId !== node.subtask.id && ids.has(parentId)
      ? nodes.get(parentId)
      : null
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sortNodes = (list: SubtaskTreeNode[]) => {
    const sortedSubtasks = options.sortMode
      ? sortSubtasks(list.map((node) => node.subtask), options.sortMode, options.project ?? null)
      : [...list.map((node) => node.subtask)].sort(manualSubtaskCompare)
    const rank = new Map(sortedSubtasks.map((subtask, index) => [subtask.id, index]))
    list.sort((a, b) => (rank.get(a.subtask.id) ?? 0) - (rank.get(b.subtask.id) ?? 0))
    for (const node of list) sortNodes(node.children)
  }

  sortNodes(roots)
  return roots
}

export function collectDescendantSubtaskIds(subtasks: Subtask[], rootId: string): Set<string> {
  const childrenByParent = new Map<string, Subtask[]>()
  for (const subtask of subtasks) {
    if (!subtask.parentId) continue
    if (!childrenByParent.has(subtask.parentId)) childrenByParent.set(subtask.parentId, [])
    childrenByParent.get(subtask.parentId)!.push(subtask)
  }

  const descendants = new Set<string>()
  const stack = [...(childrenByParent.get(rootId) ?? [])]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (descendants.has(current.id)) continue
    descendants.add(current.id)
    stack.push(...(childrenByParent.get(current.id) ?? []))
  }
  return descendants
}

export function isDescendantSubtask(subtasks: Subtask[], maybeDescendantId: string, ancestorId: string): boolean {
  let current = subtasks.find((subtask) => subtask.id === maybeDescendantId)
  const seen = new Set<string>()
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true
    if (seen.has(current.parentId)) return false
    seen.add(current.parentId)
    current = subtasks.find((subtask) => subtask.id === current!.parentId)
  }
  return false
}
