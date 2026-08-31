/** npx tsx lib/calendar/overlapLayout.test.ts */
import { computeOverlapLayout, hasColumnCollision, type PositionedBlock } from './overlapLayout'

let pass = 0, fail = 0
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label} ${extra}`) }
}
// 1 hora = 60px, para leer los casos como horarios.
const bloque = (id: string, desdeH: number, hastaH: number): PositionedBlock =>
  ({ id, top: desdeH * 60, height: (hastaH - desdeH) * 60 })
const desc = (l: Map<string, { leftPct: number; widthPct: number }>) =>
  [...l].map(([id, s]) => `${id}@${s.leftPct}%/${s.widthPct}%`).join(' ')

console.log('\n1) Sin solapes: nadie se reparte nada (siguen a ancho completo)')
{
  const bs = [bloque('a', 9, 10), bloque('b', 10, 11), bloque('c', 11, 12)]
  const l = computeOverlapLayout(bs)
  check('ningún bloque queda posicionado', l.size === 0, desc(l))
  check('sin colisiones', !hasColumnCollision(bs, l))
}

console.log('\n2) Dos a la misma hora: mitad y mitad')
{
  const bs = [bloque('a', 9, 10), bloque('b', 9, 10)]
  const l = computeOverlapLayout(bs)
  check('los dos se posicionan', l.size === 2, desc(l))
  check('50% cada uno', [...l.values()].every((s) => s.widthPct === 50), desc(l))
  check('uno a la izquierda y otro a la derecha',
    new Set([...l.values()].map((s) => s.leftPct)).size === 2, desc(l))
  check('ninguno tapa al otro', !hasColumnCollision(bs, l))
}

console.log('\n3) Tres a la misma hora: un tercio cada uno')
{
  const bs = [bloque('a', 9, 10), bloque('b', 9, 10), bloque('c', 9, 10)]
  const l = computeOverlapLayout(bs)
  check('33% cada uno', [...l.values()].every((s) => Math.round(s.widthPct) === 33), desc(l))
  check('tres columnas distintas', new Set([...l.values()].map((s) => s.leftPct)).size === 3, desc(l))
  check('ninguno tapa a otro', !hasColumnCollision(bs, l))
}

console.log('\n4) Solape PARCIAL en cadena: se reusa la columna libre')
{
  // A 9-10, B 9:30-10:30, C 10:15-11 → A y C no se tocan: alcanza con 2 columnas.
  const bs = [bloque('a', 9, 10), bloque('b', 9.5, 10.5), bloque('c', 10.25, 11)]
  const l = computeOverlapLayout(bs)
  check('2 columnas, no 3', [...l.values()].every((s) => s.columns === 2), desc(l))
  check('A y C comparten columna', l.get('a')!.leftPct === l.get('c')!.leftPct, desc(l))
  check('B va al lado', l.get('b')!.leftPct !== l.get('a')!.leftPct, desc(l))
  check('ninguno tapa a otro', !hasColumnCollision(bs, l))
}

console.log('\n5) Tocarse por el borde no es solaparse')
{
  const bs = [bloque('a', 9, 10), bloque('b', 10, 11)]
  const l = computeOverlapLayout(bs)
  check('siguen a ancho completo', l.size === 0, desc(l))
}

console.log('\n6) Un evento largo con varios cortos adentro')
{
  const bs = [bloque('largo', 9, 13), bloque('x', 9.5, 10), bloque('y', 11, 11.5)]
  const l = computeOverlapLayout(bs)
  check('el largo se angosta a la mitad', l.get('largo')!.widthPct === 50, desc(l))
  check('los cortos comparten la otra mitad',
    l.get('x')!.leftPct === l.get('y')!.leftPct && l.get('x')!.leftPct !== l.get('largo')!.leftPct, desc(l))
  check('nada se tapa', !hasColumnCollision(bs, l))
}

console.log('\n7) Grupos separados no se contagian el ancho')
{
  const bs = [bloque('a', 9, 10), bloque('b', 9, 10), bloque('solo', 15, 16)]
  const l = computeOverlapLayout(bs)
  check('el de las 15 queda a ancho completo', !l.has('solo'), desc(l))
  check('los de las 9 al 50%', l.get('a')!.widthPct === 50 && l.get('b')!.widthPct === 50, desc(l))
}

console.log('\n8) Es estable: mismo input en otro orden → mismo resultado')
{
  const bs = [bloque('a', 9, 10), bloque('b', 9.5, 10.5), bloque('c', 10.25, 11)]
  const l1 = computeOverlapLayout(bs)
  const l2 = computeOverlapLayout([...bs].reverse())
  check('mismas posiciones', desc(l1) === desc([...l2].sort() as never) || JSON.stringify([...l1].sort()) === JSON.stringify([...l2].sort()),
    `${desc(l1)} vs ${desc(l2)}`)
}

console.log('\n9) Caso real reportado: dos eventos de Google Calendar a la misma hora')
{
  const bs = [bloque('gcal-reunion', 14, 15), bloque('gcal-llamada', 14, 15)]
  const l = computeOverlapLayout(bs)
  check('se ven los dos, uno al lado del otro', l.size === 2 && !hasColumnCollision(bs, l), desc(l))
}

console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${pass} ok, ${fail} fail\n`)
process.exit(fail === 0 ? 0 : 1)
