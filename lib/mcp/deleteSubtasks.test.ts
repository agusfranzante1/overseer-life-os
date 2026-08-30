/** Test del cálculo de descendientes de `delete_subtasks`.
 *
 *  Correr con:  npx tsx lib/mcp/deleteSubtasks.test.ts
 *
 *  Por qué importa: `subtasks.parent_id` es self-referente con ON DELETE
 *  CASCADE. Si este cálculo se queda corto, se borran filas en Postgres que el
 *  bridge nunca tombstoneó → vuelven desde otro dispositivo. Si se pasa, se
 *  borra de más. Las dos fallan en silencio. */

// Copia exacta de la función privada de deleteSubtasks.ts (misma lógica).
interface SubtaskRow { id: string; task_id: string; parent_id: string | null; title: string }

function collectDescendants(all: SubtaskRow[], ids: Set<string>): Set<string> {
  const out = new Set(ids)
  let changed = true
  let guard = 0
  while (changed && guard++ < 100) {
    changed = false
    for (const s of all) {
      if (s.parent_id && out.has(s.parent_id) && !out.has(s.id)) {
        out.add(s.id); changed = true
      }
    }
  }
  return out
}

let pass = 0, fail = 0
function check(label: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label} ${extra}`) }
}
const S = (id: string, parent: string | null = null, task = 'T1'): SubtaskRow =>
  ({ id, task_id: task, parent_id: parent, title: id })

console.log('\n--- arbol plano ---')
{
  const all = [S('a'), S('b'), S('c')]
  const r = collectDescendants(all, new Set(['b']))
  check('sin hijas, borra solo la pedida', r.size === 1 && r.has('b'), [...r].join(','))
}

console.log('\n--- una rama ---')
{
  //  a
  //  └ a1
  //    └ a11
  //  b
  const all = [S('a'), S('a1', 'a'), S('a11', 'a1'), S('b')]
  const r = collectDescendants(all, new Set(['a']))
  check('arrastra hijas y nietas', r.size === 3 && r.has('a1') && r.has('a11'), [...r].join(','))
  check('NO toca la hermana', !r.has('b'))

  const r2 = collectDescendants(all, new Set(['a1']))
  check('borrar una rama del medio arrastra solo lo suyo',
    r2.size === 2 && r2.has('a1') && r2.has('a11') && !r2.has('a'), [...r2].join(','))
}

console.log('\n--- varias pedidas a la vez ---')
{
  const all = [S('a'), S('a1', 'a'), S('b'), S('b1', 'b'), S('c')]
  const r = collectDescendants(all, new Set(['a', 'b']))
  check('junta los dos subarboles', r.size === 4 && !r.has('c'), [...r].join(','))
}

console.log('\n--- padre e hija pedidas juntas (sin duplicar) ---')
{
  const all = [S('a'), S('a1', 'a')]
  const r = collectDescendants(all, new Set(['a', 'a1']))
  check('no duplica', r.size === 2)
}

console.log('\n--- huerfanas y ciclos (datos rotos) ---')
{
  const all = [S('a', 'no-existe'), S('b')]
  const r = collectDescendants(all, new Set(['b']))
  check('parent_id que apunta a la nada no rompe', r.size === 1 && r.has('b'))

  // Ciclo: x -> y -> x. No debe colgar ni explotar.
  const ciclo = [S('x', 'y'), S('y', 'x'), S('z')]
  const r2 = collectDescendants(ciclo, new Set(['x']))
  check('un ciclo termina y no arrastra a z', r2.has('x') && r2.has('y') && !r2.has('z'), [...r2].join(','))
}

console.log('\n--- profundidad grande ---')
{
  const all: SubtaskRow[] = [S('n0')]
  for (let i = 1; i < 30; i++) all.push(S(`n${i}`, `n${i - 1}`))
  const r = collectDescendants(all, new Set(['n0']))
  check('30 niveles de anidado se arrastran completos', r.size === 30, String(r.size))
}

console.log('\n--- no mezcla tareas distintas ---')
{
  const all = [S('a', null, 'T1'), S('a1', 'a', 'T1'), S('z', null, 'T2')]
  const r = collectDescendants(all, new Set(['a']))
  check('no toca subtareas de otra tarea', !r.has('z') && r.size === 2)
}

console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${pass} ok, ${fail} fail\n`)
process.exit(fail === 0 ? 0 : 1)
