/** Promover una subtarea a tarea, ida y vuelta por el sync.
 *  npx tsx lib/tasks/promoteSubtask.test.ts
 *
 *  El bug que fija este archivo: al promover una subtarea1 con hijas, las hijas
 *  viajaban bien a la tarea nueva, pero el siguiente pull las RESUCITABA dentro
 *  de la tarea original y quedaban duplicadas en las dos. Causa: el merge
 *  trataba "esta tarea quedó sin subtareas" como un wipe del store y revivía
 *  todo lo borrado, ignorando tombstones y baseline. */

import { useTasksStore } from '@/lib/store/tasksStore'
import { mergeById, mergeTaskWithSubtasks } from '@/lib/supabase/syncMerge'
import { DEFAULT_STATUSES } from '@/lib/utils/constants'
import type { Task, Subtask } from '@/types'

const iso = new Date().toISOString()
let pass = 0, fail = 0
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label} ${extra}`) }
}

/** Siembra una tarea con subtarea1 → 2 hijas → 1 nieta. Devuelve el snapshot
 *  que representa lo que ya está en la NUBE (antes de promover). */
function seed(extra: Subtask[] = []) {
  const subtasks: Subtask[] = [
    { id: 's1', title: 'Subtarea 1', completed: false, status: 'To Do', order: 0 },
    { id: 's1a', title: 'Hija A', completed: false, status: 'To Do', order: 1, parentId: 's1' },
    { id: 's1b', title: 'Hija B', completed: false, status: 'To Do', order: 2, parentId: 's1' },
    { id: 's1a1', title: 'Nieta', completed: false, status: 'To Do', order: 3, parentId: 's1a' },
    ...extra,
  ]
  const T = { id: 'T', projectId: 'P1', title: 'Tarea madre', status: 'To Do', priority: 'medium',
    importance: 'medium', subtasks, createdAt: iso, updatedAt: iso, postponedCount: 0 } as Task
  useTasksStore.setState({ projects: { P1: { id: 'P1', name: 'P', color: '#8b5cf6',
    statuses: DEFAULT_STATUSES, taskIds: ['T'], createdAt: iso } as never }, tasks: { T } })
  return JSON.parse(JSON.stringify([T])) as Task[]
}

/** Pull: mismo merge que `pullTasks` (usa la función real de syncMerge). */
function pull(remote: Task[], baselineTasks: Set<string>, baselineSubs: Set<string>) {
  const merged = mergeById<Task>({
    local: Object.values(useTasksStore.getState().tasks),
    remote,
    baseline: baselineTasks,
    getId: (t) => t.id,
    getUpdatedAt: (t) => t.updatedAt,
    tombstones: new Map<string, number>(),
    mergeItem: (l, r) => mergeTaskWithSubtasks<Task, Subtask>(l, r, {
      subtaskBaseline: baselineSubs,
      tombSubtasks: new Map<string, number>(),
      getSubtaskId: (s) => s.id,
    }),
  })
  useTasksStore.setState({ tasks: Object.fromEntries(merged.map((t) => [t.id, t])) })
}

const titles = (id: string) =>
  (useTasksStore.getState().tasks[id]?.subtasks ?? []).map((s) => s.title).sort().join(', ')
const promoted = () => Object.values(useTasksStore.getState().tasks).find((t) => t.id !== 'T')!

console.log('\n1) Promover se lleva TODO el subárbol (hijas y nietas)')
{
  seed()
  const newId = useTasksStore.getState().promoteSubtaskToTask('T', 's1')
  check('devuelve la tarea nueva', !!newId)
  const nueva = useTasksStore.getState().tasks[newId!]
  check('la tarea nueva se llama como la subtarea', nueva.title === 'Subtarea 1')
  check('se llevó hija, hija y nieta', titles(newId!) === 'Hija A, Hija B, Nieta', titles(newId!))
  check('la original quedó sin ellas', titles('T') === '', titles('T'))
  const hijaA = nueva.subtasks.find((s) => s.title === 'Hija A')!
  const nieta = nueva.subtasks.find((s) => s.title === 'Nieta')!
  check('la hija quedó en la raíz de la tarea nueva', !hijaA.parentId, String(hijaA.parentId))
  check('la nieta sigue colgando de su madre', nieta.parentId === hijaA.id, String(nieta.parentId))
}

console.log('\n2) El pull NO las devuelve a la tarea original (quedaban en las dos)')
{
  const cloud = seed()
  const baseSubs = new Set(cloud.flatMap((t) => t.subtasks.map((s) => s.id)))
  const newId = useTasksStore.getState().promoteSubtaskToTask('T', 's1')!
  // Pull con la nube TODAVÍA vieja (el push aún no borró nada allá).
  pull(cloud, new Set(['T']), baseSubs)
  check('la original sigue vacía', titles('T') === '', titles('T'))
  check('la tarea nueva conserva su subárbol', titles(newId) === 'Hija A, Hija B, Nieta', titles(newId))
}

console.log('\n3) Igual con la original conservando otras subtareas')
{
  const cloud = seed([{ id: 's2', title: 'Otra suelta', completed: false, status: 'To Do', order: 9 }])
  const baseSubs = new Set(cloud.flatMap((t) => t.subtasks.map((s) => s.id)))
  const newId = useTasksStore.getState().promoteSubtaskToTask('T', 's1')!
  pull(cloud, new Set(['T']), baseSubs)
  check('la original queda solo con la suelta', titles('T') === 'Otra suelta', titles('T'))
  check('la tarea nueva conserva su subárbol', titles(newId) === 'Hija A, Hija B, Nieta', titles(newId))
}

console.log('\n4) Borrar la ÚLTIMA subtarea de una tarea tampoco la resucita')
{
  const cloud = seed()
  const baseSubs = new Set(cloud.flatMap((t) => t.subtasks.map((s) => s.id)))
  for (const id of ['s1a1', 's1a', 's1b', 's1']) useTasksStore.getState().deleteSubtask('T', id)
  check('quedó sin subtareas', titles('T') === '', titles('T'))
  pull(cloud, new Set(['T']), baseSubs)
  check('el pull no las trae de vuelta', titles('T') === '', titles('T'))
}

console.log('\n5) Pero un pull con el store REALMENTE vacío sigue resucitando (auto-heal intacto)')
{
  const cloud = seed()
  useTasksStore.setState({ tasks: {} })
  pull(cloud, new Set(['T']), new Set(cloud.flatMap((t) => t.subtasks.map((s) => s.id))))
  check('la tarea vuelve de la nube', !!useTasksStore.getState().tasks['T'])
  check('con sus subtareas', titles('T') === 'Hija A, Hija B, Nieta, Subtarea 1', titles('T'))
}

console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${pass} ok, ${fail} fail\n`)
process.exit(fail === 0 ? 0 : 1)
