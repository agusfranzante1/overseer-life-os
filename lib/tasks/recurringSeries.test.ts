/** Tests de las SERIES RECURRENTES sobre el store real.
 *
 *  Correr con:  npx tsx lib/tasks/recurringSeries.test.ts
 *
 *  Cubre el incidente de "las recurrencias se multiplican y no hay forma de
 *  detenerlas": una serie cuya MADRE desaparece (borrada, o todavía no
 *  llegó a este device por sync) se fragmentaba en una serie por instancia y
 *  cada apertura de /tasks generaba copias del mismo día. */

import { useTasksStore } from '@/lib/store/tasksStore'
import { DEFAULT_STATUSES } from '@/lib/utils/constants'
import type { Task } from '@/types'

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const now = new Date()
const iso = now.toISOString()
const plus = (i: number) => { const d = new Date(now); d.setDate(now.getDate() + i); return fmt(d) }

let pass = 0, fail = 0
function check(label: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label} ${extra}`) }
}

const BASE = {
  projectId: 'P1', status: 'To Do', priority: 'medium' as const, importance: 'medium' as const,
  subtasks: [], createdAt: iso, updatedAt: iso, postponedCount: 0,
  recurrence: { kind: 'daily' as const }, title: 'Backtesting sesh',
}

/** Siembra una serie diaria: madre hoy + 6 instancias. */
function seed(opts: { mother: 'live' | 'archived' | 'gone'; fragmented?: boolean }) {
  const tasks: Record<string, Task> = {}
  if (opts.mother !== 'gone') {
    tasks['mother1'] = {
      ...BASE, id: 'mother1', dueDate: fmt(now), recurringHeadId: 'mother1',
      ...(opts.mother === 'archived' ? { archivedAt: iso, completedAt: iso } : {}),
    } as Task
  }
  for (let i = 1; i <= 6; i++) {
    const dd = plus(i)
    const id = `rec_mother1_${dd}`
    // `fragmented` simula datos YA rotos por el bug: cada instancia quedó
    // anclada a sí misma (serie propia) en vez de a la madre.
    tasks[id] = { ...BASE, id, dueDate: dd, recurringHeadId: opts.fragmented ? id : 'mother1' } as Task
  }
  useTasksStore.setState({
    projects: { P1: { id: 'P1', name: 'Trading', color: '#8b5cf6', statuses: DEFAULT_STATUSES,
      taskIds: Object.keys(tasks), createdAt: iso } as never },
    tasks,
  })
}

/** Lo que corre la app al abrir: heal de heads + buffer + rollover + dedupe. */
function openApp() {
  const st = useTasksStore.getState()
  const todayKey = fmt(new Date())
  st.migrateRecurringHeads()
  for (const t of Object.values(useTasksStore.getState().tasks)
    .filter((t) => t.recurrence && t.dueDate && !t.archivedAt && !t.completedAt)) {
    useTasksStore.getState().ensureRecurringBuffer(t.id, 14, 2, todayKey)
  }
  useTasksStore.getState().ensureRecurringSpawns(todayKey)
  useTasksStore.getState().dedupeRecurringInstances()
}

function stats() {
  const all = Object.values(useTasksStore.getState().tasks)
  const live = all.filter((t) => !t.archivedAt)
  const byDate: Record<string, number> = {}
  for (const t of live) byDate[t.dueDate ?? '-'] = (byDate[t.dueDate ?? '-'] ?? 0) + 1
  return {
    total: all.length,
    live: live.length,
    series: new Set(live.map((t) => t.recurringHeadId ?? 'none')).size,
    maxPerDate: Math.max(0, ...Object.values(byDate)),
  }
}

console.log('\n1) Serie sana: llena 2 semanas y es idempotente')
seed({ mother: 'live' })
openApp(); const a1 = stats()
openApp(); const a2 = stats()
check('llena hasta el fin de la semana siguiente', a1.live > 7, JSON.stringify(a1))
check('no crece en la 2da apertura', a1.live === a2.live, `${a1.live} vs ${a2.live}`)
check('sigue siendo UNA serie', a2.series === 1, JSON.stringify(a2))
check('sin duplicados por fecha', a2.maxPerDate === 1, JSON.stringify(a2))

console.log('\n2) Madre BORRADA: no se fragmenta ni duplica (era 6 → 39 tareas / 7 series)')
seed({ mother: 'gone' })
openApp(); const b1 = stats()
openApp(); openApp(); const b2 = stats()
check('una sola serie', b1.series === 1, JSON.stringify(b1))
check('sin duplicados por fecha', b1.maxPerDate === 1, JSON.stringify(b1))
check('idempotente en 3 aperturas', b1.live === b2.live, `${b1.live} vs ${b2.live}`)

console.log('\n3) Datos YA fragmentados por el bug: el heal los vuelve a unir y dedupea')
seed({ mother: 'gone', fragmented: true })
openApp(); const c1 = stats()
check('quedó una sola serie', c1.series === 1, JSON.stringify(c1))
check('una tarea por fecha', c1.maxPerDate === 1, JSON.stringify(c1))

console.log('\n4) Madre en la PAPELERA: la cadena se detiene')
seed({ mother: 'archived' })
const before = stats().live
openApp(); const d = stats()
check('no spawnea ni una instancia nueva', d.live === before, `${before} → ${d.live}`)

console.log('\n5) Borrar la madre (papelera) detiene la serie y se lleva las futuras')
seed({ mother: 'live' }); openApp()
useTasksStore.getState().deleteTask('mother1')
const e1 = stats()
openApp(); const e2 = stats()
check('las futuras no completadas van a la papelera', e1.live === 0, JSON.stringify(e1))
check('reabrir la app no la resucita', e2.live === 0, JSON.stringify(e2))

console.log('\n6) "Detener recurrencia" y "borrar serie completa" siguen andando')
seed({ mother: 'live' }); openApp()
useTasksStore.getState().removeRecurringSeries('mother1', true)
const f1 = stats()
openApp(); const f2 = stats()
check('detener deja SOLO el head, sin recurrencia', f1.live === 1 && f2.live === 1, JSON.stringify(f2))
check('el head ya no repite', !useTasksStore.getState().tasks['mother1']?.recurrence)
seed({ mother: 'live' }); openApp()
useTasksStore.getState().removeRecurringSeries('mother1', false)
const g1 = stats(); openApp(); const g2 = stats()
check('borrar la serie completa no deja nada', g1.live === 0 && g2.live === 0, JSON.stringify(g2))

console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${pass} ok, ${fail} fail\n`)
process.exit(fail === 0 ? 0 : 1)
