/** npx tsx lib/mcp/offerWrites.test.ts */
import { normalizarBloques } from './offerWrites'

let ok = 0, fail = 0
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) { ok++; console.log(`  ok  ${msg}`) }
  else { fail++; console.error(`  FAIL ${msg}\n       esperado ${e}\n       fue      ${a}`) }
}
/** Los ids son aleatorios: se comparan la forma y el contenido, no los ids. */
const forma = (bs: ReturnType<typeof normalizarBloques>): unknown =>
  bs.map((b) => ({
    t: b.type, x: b.text,
    ...(b.children ? { h: forma(b.children) } : {}),
    ...(b.collapsed !== undefined ? { c: b.collapsed } : {}),
  }))

console.log('\nstrings sueltos')
eq(forma(normalizarBloques(['Hola', 'Chau'])),
   [{ t: 'text', x: 'Hola' }, { t: 'text', x: 'Chau' }], 'dos párrafos')
eq(forma(normalizarBloques(['- primero', '• segundo', '* tercero'])),
   [{ t: 'bullet', x: 'primero' }, { t: 'bullet', x: 'segundo' }, { t: 'bullet', x: 'tercero' }],
   'los tres marcadores de viñeta se detectan y el marcador NO queda en el texto')
eq(forma(normalizarBloques(['  ', ''])), [], 'los vacíos se descartan')

console.log('\nobjetos con tipo')
eq(forma(normalizarBloques([{ tipo: 'toggle', texto: 'Espionaje', hijos: ['- keyword uno', 'una nota'] }])),
   [{ t: 'toggle', x: 'Espionaje', h: [{ t: 'bullet', x: 'keyword uno' }, { t: 'text', x: 'una nota' }], c: false }],
   'toggle con hijos, y arranca abierto')
eq(forma(normalizarBloques([{ type: 'page', text: 'Competencia', children: ['algo'] }])),
   [{ t: 'page', x: 'Competencia', h: [{ t: 'text', x: 'algo' }] }],
   'acepta también las claves en inglés (type/text/children)')

console.log('\nlas hojas NUNCA llevan hijos')
eq(forma(normalizarBloques([{ tipo: 'text', texto: 'suelto', hijos: ['no van'] }])),
   [{ t: 'text', x: 'suelto' }],
   'un text con hijos los pierde: la app no los renderiza y guardarlos es basura invisible')
eq(forma(normalizarBloques([{ tipo: 'bullet', texto: 'viñeta', hijos: ['tampoco'] }])),
   [{ t: 'bullet', x: 'viñeta' }], 'idem bullet')

console.log('\ntipos inválidos caen a text, no rompen')
eq(forma(normalizarBloques([{ tipo: 'heading', texto: 'Titulo' }])),
   [{ t: 'text', x: 'Titulo' }], 'un tipo que no existe se degrada a párrafo')

console.log('\nentradas raras')
eq(normalizarBloques('no es array'), [], 'string suelto → vacío')
eq(normalizarBloques(null), [], 'null → vacío')
eq(normalizarBloques([null, 42, undefined]), [], 'elementos no-string no-objeto se descartan')

console.log('\ntope de anidamiento')
const hondo = (n: number): unknown => n === 0 ? 'fondo' : { tipo: 'toggle', texto: `n${n}`, hijos: [hondo(n - 1)] }
const prof = normalizarBloques([hondo(9)])
let niveles = 0, cur: { children?: unknown[] }[] = prof as never
while (cur?.[0]?.children) { niveles++; cur = cur[0].children as never }
eq(niveles <= 6, true, `corta el anidamiento (llegó a ${niveles} niveles, no infinito)`)

console.log('\nids únicos')
const bs = normalizarBloques(['uno', 'dos', { tipo: 'toggle', texto: 'tres', hijos: ['cuatro'] }])
const ids = [bs[0].id, bs[1].id, bs[2].id, bs[2].children![0].id]
eq(new Set(ids).size, 4, 'cada bloque tiene su propio id')

console.log(`\n${ok} ok, ${fail} fail\n`)
if (fail > 0) process.exit(1)
