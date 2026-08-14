import { buildOutline, parseOutline, parseOutlineToTasks } from './parseOutline'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const indented = parseOutline(`
Proyecto
  Paso A Hacer
    Subpaso Copied
  Paso B
Otro proyecto
`)

assert(indented.map((line) => `${line.depth}:${line.title}`).join('|') === '0:Proyecto|1:Paso A|2:Subpaso|1:Paso B|0:Otro proyecto', 'indent parser should preserve hierarchy')

const built = buildOutline(indented)
assert(built.tasks.length === 2, 'builder creates two tasks')
assert(built.tasks[0].subtasks[0].subtasks[0].title === 'Subpaso', 'builder nests grandchildren')

const fallback = parseOutlineToTasks(`
13/8/26, 18:59 ⚙️ Procesos - TickTick
⚙️ Procesos
1️⃣ Revisar inbox Completada 1
Sin emoji va adentro Hacer
https://ticktick.com/webapp/
🧠 Ideas
11. Segunda capa
Nota profunda Anotacion
`)

assert(fallback.tasks.length === 2, 'emoji fallback creates root tasks from non-number emoji')
assert(fallback.tasks[0].title === 'Procesos', 'root emoji is stripped')
assert(fallback.tasks[0].subtasks[0].title === 'Revisar inbox', 'number keycap becomes depth 1')
assert(fallback.tasks[0].subtasks[0].subtasks[0].title === 'Sin emoji va adentro', 'plain lines become depth 2')
assert(fallback.tasks[1].subtasks[0].title === 'Segunda capa', 'numeric prefix becomes depth 1')
assert(fallback.tasks[1].subtasks[0].subtasks[0].title === 'Nota profunda', 'status suffix is stripped')

console.log('parseOutline: OK')
