/** npx tsx lib/supabase/staleGuard.test.ts */
import { isRemoteNewer, chunk, findStaleIds } from './staleGuard'

let ok = 0, fail = 0
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) { ok++; console.log(`  ok  ${msg}`) }
  else { fail++; console.error(`  FAIL ${msg}\n       esperado ${e}\n       fue      ${a}`) }
}

console.log('\nLA TRAMPA DE LAS FECHAS — Postgres manda +00:00, el cliente manda Z')
// Mismo instante, distinto formato. Comparados como TEXTO, 'Z' > '+' y da al revés.
eq(isRemoteNewer('2026-08-31T22:23:54.589Z', '2026-08-31T22:23:54.589+00:00'), false,
   'mismo instante en los dos formatos NO es "remoto mas nuevo"')
eq('2026-08-31T22:23:54.589+00:00' > '2026-08-31T22:23:54.589Z', false,
   '(control) como texto el orden miente: por eso se parsea')
eq(isRemoteNewer('2026-08-31T22:00:00.000Z', '2026-08-31T22:23:54.589+00:00'), true,
   'remoto posterior en formato Postgres SI se detecta')
eq(isRemoteNewer('2026-08-31T23:00:00.000Z', '2026-08-31T22:23:54.589+00:00'), false,
   'local posterior gana')

console.log('\nEL CASO REAL — el bridge marca, la app pisa')
// Claude completa una subtarea a las 22:23 (bumpea la madre). La app tiene la
// copia de las 19:10 y va a pushear.
const localApp = '2026-08-31T19:10:00.000Z'
const remotoBridge = '2026-09-01T01:23:54.589+00:00'
eq(isRemoteNewer(localApp, remotoBridge), true,
   'la copia vieja de la app NO debe pisar la edicion del bridge')
// Y al reves: si el usuario edita DESPUES en la app, su edicion tiene que ganar.
eq(isRemoteNewer('2026-09-01T02:00:00.000Z', remotoBridge), false,
   'si el usuario edito despues, su cambio SI se pushea')

console.log('\ncasos borde')
eq(isRemoteNewer('2026-01-01T00:00:00Z', undefined), false, 'sin fecha remota (fila nueva) → se pushea')
eq(isRemoteNewer('2026-01-01T00:00:00Z', null), false, 'remoto null → se pushea')
eq(isRemoteNewer(undefined, '2026-01-01T00:00:00Z'), true, 'sin fecha local pero si remota → no pisa')
eq(isRemoteNewer('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'), false, 'iguales → se pushea (inocuo)')
eq(isRemoteNewer('cualquier cosa', '2026-01-01T00:00:00Z'), true, 'local ilegible → no pisa')
eq(isRemoteNewer('2026-01-01T00:00:00Z', 'cualquier cosa'), false, 'remoto ilegible → se pushea, como siempre')
eq(isRemoteNewer('', ''), false, 'vacios → se pushea')

console.log('\nchunk')
eq(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]], 'parte en tandas')
eq(chunk([], 10), [], 'vacio')

console.log('\nfindStaleIds contra un cliente falso')
const fake = (filas: { id: string; updated_at: string }[]) => ({
  from: () => ({ select: () => ({ eq: () => ({ in: async (_c: string, ids: string[]) => ({
    data: filas.filter((f) => ids.includes(f.id)), error: null,
  }) }) }) }),
})

async function pruebasAsync() {
const stale = await findStaleIds(
  fake([
    { id: 'a', updated_at: '2026-09-01T01:00:00+00:00' },  // remoto mas nuevo
    { id: 'b', updated_at: '2026-08-01T00:00:00+00:00' },  // remoto mas viejo
  ]),
  'u1', 'tasks',
  [
    { id: 'a', updated_at: '2026-08-31T00:00:00.000Z' },
    { id: 'b', updated_at: '2026-08-31T00:00:00.000Z' },
    { id: 'c', updated_at: '2026-08-31T00:00:00.000Z' },  // no existe remoto
  ],
)
eq([...stale], ['a'], 'solo marca la que quedo vieja; la nueva y la inexistente se pushean')

console.log('\nsi la consulta falla, el push NO se bloquea')
const roto = {
  from: () => ({ select: () => ({ eq: () => ({ in: async () => ({ data: null, error: { message: 'boom' } }) }) }) }),
}
const s2 = await findStaleIds(roto, 'u1', 'tasks', [{ id: 'a', updated_at: '2026-08-31T00:00:00.000Z' }])
eq([...s2], [], 'error de lectura → set vacio → se pushea todo, como antes')
}

pruebasAsync().then(() => {
  console.log(`\n${ok} ok, ${fail} fail\n`)
  if (fail > 0) process.exit(1)
})
