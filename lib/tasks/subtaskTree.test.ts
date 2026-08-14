import { buildSubtaskTree, collectDescendantSubtaskIds, isDescendantSubtask } from './subtaskTree'
import type { Subtask } from '@/types'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const subs: Subtask[] = [
  { id: 'child-b', title: 'B', completed: false, status: 'todo', order: 1, parentId: 'root' },
  { id: 'root', title: 'Root', completed: false, status: 'todo', order: 0 },
  { id: 'grand', title: 'Grand', completed: false, status: 'todo', order: 0, parentId: 'child-a' },
  { id: 'arch', title: 'Archived', completed: false, status: 'todo', order: 2, parentId: 'root', archivedAt: '2026-08-13T00:00:00.000Z' },
  { id: 'child-a', title: 'A', completed: false, status: 'todo', order: 0, parentId: 'root' },
  { id: 'orphan', title: 'Orphan', completed: false, status: 'todo', order: 1, parentId: 'missing' },
]

const tree = buildSubtaskTree(subs)

assert(tree.length === 2, 'root + orphan should be top-level')
assert(tree[0].subtask.id === 'root', 'manual order keeps root first')
assert(tree[0].children.map((node) => node.subtask.id).join(',') === 'child-a,child-b', 'children keep order')
assert(tree[0].children[0].children[0].subtask.id === 'grand', 'grandchild is nested')
assert(!tree[0].children.some((node) => node.subtask.id === 'arch'), 'archived subtasks are filtered')
assert([...collectDescendantSubtaskIds(subs, 'root')].sort().join(',') === 'arch,child-a,child-b,grand', 'descendants include full subtree')
assert(isDescendantSubtask(subs, 'grand', 'root'), 'grand is descendant of root')
assert(!isDescendantSubtask(subs, 'root', 'grand'), 'root is not descendant of grand')

console.log('subtaskTree: OK')
