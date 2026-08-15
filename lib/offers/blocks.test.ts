/**
 * Tests puros de las operaciones de bloques nuevas (unwrap + move).
 * Correr:  npx tsx lib/offers/blocks.test.ts
 */
import { unwrapBlock, moveBlock, findBlock, type Block } from './blocks'

let passed = 0
let failed = 0
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; return }
  failed++
  console.error('  ✗ ' + msg)
}
const ids = (bs: Block[]) => bs.map((b) => b.id)

// ── unwrapBlock ──────────────────────────────────────────────────────────────
{
  const inner: Block = { id: 'tgl', type: 'toggle', text: 'sub', children: [{ id: 'x', type: 'text', text: 'x' }], collapsed: false }
  const doc: Block[] = [
    { id: 'a', type: 'text', text: 'antes' },
    { id: 'pg', type: 'page', text: 'Mi página', children: [
      { id: 'c1', type: 'text', text: 'uno' },
      inner,
    ] },
    { id: 'z', type: 'text', text: 'despues' },
  ]
  const out = unwrapBlock(doc, 'pg')
  // La página se reemplaza por: [text("Mi página"), c1, tgl] en su lugar.
  assert(ids(out).length === 5, 'unwrap: 3 → 5 bloques (título + 2 hijos, menos el contenedor)')
  assert(out[0].id === 'a' && out[out.length - 1].id === 'z', 'unwrap: vecinos intactos')
  assert(out[1].type === 'text' && out[1].text === 'Mi página', 'unwrap: título queda como texto')
  assert(out[2].id === 'c1' && out[2].type === 'text', 'unwrap: hijo texto se preserva')
  assert(out[3].id === 'tgl' && out[3].type === 'toggle', 'unwrap: toggle interno sigue siendo toggle, pero afuera')
  assert(findBlock(out, 'pg') === null, 'unwrap: el contenedor ya no existe')
}
{
  const doc: Block[] = [{ id: 't1', type: 'text', text: 'hola' }]
  const out = unwrapBlock(doc, 't1')
  assert(out.length === 1 && out[0] === doc[0] && out[0].type === 'text', 'unwrap sobre un bloque hoja = no-op (bloque intacto)')
}
{
  const doc: Block[] = [{ id: 'e', type: 'toggle', text: '', children: [], collapsed: false }]
  const out = unwrapBlock(doc, 'e')
  assert(out.length === 1 && out[0].type === 'text', 'unwrap de contenedor vacío deja un párrafo (no desaparece)')
}

// ── moveBlock ────────────────────────────────────────────────────────────────
{
  const doc: Block[] = [
    { id: 'a', type: 'text', text: 'a' },
    { id: 'b', type: 'text', text: 'b' },
    { id: 'c', type: 'text', text: 'c' },
  ]
  assert(ids(moveBlock(doc, 'c', 'a', 'before')).join() === 'c,a,b', 'move: c antes de a')
  assert(ids(moveBlock(doc, 'a', 'c', 'after')).join() === 'b,c,a', 'move: a después de c')
  assert(moveBlock(doc, 'a', 'a', 'after') === doc, 'move: sobre sí mismo = no-op')
  assert(moveBlock(doc, 'nope', 'a', 'after') === doc, 'move: id inexistente = no-op')
}
{
  // Cross-level: meter un bloque de la raíz DENTRO de un desplegable.
  const doc: Block[] = [
    { id: 'tg', type: 'toggle', text: 'T', children: [{ id: 'in', type: 'text', text: 'in' }], collapsed: false },
    { id: 'out', type: 'text', text: 'out' },
  ]
  const moved = moveBlock(doc, 'out', 'in', 'after')
  assert(ids(moved).join() === 'tg', 'move cross-level: "out" salió de la raíz')
  const tg = findBlock(moved, 'tg')!
  assert(ids(tg.children ?? []).join() === 'in,out', 'move cross-level: "out" quedó dentro del toggle, después de "in"')
}
{
  // Guarda anti-ciclo: no se puede meter un contenedor en su propio hijo.
  const doc: Block[] = [
    { id: 'p', type: 'page', text: 'P', children: [{ id: 'ch', type: 'text', text: 'ch' }] },
  ]
  assert(moveBlock(doc, 'p', 'ch', 'after') === doc, 'move: meter contenedor en su propio hijo = no-op')
}

console.log(`\n${failed === 0 ? '✓ OK' : '✗ FALLÓ'} — ${passed} asserts pasaron, ${failed} fallaron`)
process.exit(failed === 0 ? 0 : 1)
