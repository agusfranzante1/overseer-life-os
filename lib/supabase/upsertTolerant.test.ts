/** npx tsx lib/supabase/upsertTolerant.test.ts */
import { missingColumnFrom, upsertTolerant } from './upsertTolerant'

let pass = 0, fail = 0
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label} ${extra}`) }
}

async function main() {
  console.log('\n1) Detecta el nombre de la columna en los errores reales')
  check('PostgREST PGRST204', missingColumnFrom({ message: "Could not find the 'favorite' column of 'tasks' in the schema cache", code: 'PGRST204' }) === 'favorite')
  check('Postgres 42703 (of relation)', missingColumnFrom({ message: 'column "tags" of relation "tasks" does not exist', code: '42703' }) === 'tags')
  check('Postgres 42703 (tabla.columna)', missingColumnFrom({ message: 'column tasks.favorite does not exist' }) === 'favorite')
  check('un error de otra cosa NO es columna faltante', missingColumnFrom({ message: 'new row violates row-level security policy' }) === null)
  check('sin error', missingColumnFrom(null) === null)

  console.log('\n2) Descarta las columnas que faltan y sincroniza el resto')
  {
    const existing = new Set(['id', 'title', 'updated_at'])
    const seen: Record<string, unknown>[][] = []
    const run = async (rows: Record<string, unknown>[]) => {
      seen.push(rows)
      const missing = Object.keys(rows[0]).find((k) => !existing.has(k))
      return missing
        ? { error: { message: `Could not find the '${missing}' column of 'tasks' in the schema cache`, code: 'PGRST204' } }
        : { error: null }
    }
    const rows = [{ id: '1', title: 'a', updated_at: 'x', favorite: true, tags: ['t'] }]
    const r = await upsertTolerant(run, rows, 'tasks')
    check('termina sin error', r.error === null, JSON.stringify(r.error))
    check('reporta las 2 columnas faltantes', [...r.dropped].sort().join(',') === 'favorite,tags', r.dropped.join(','))
    check('la última llamada solo lleva columnas que existen',
      Object.keys(seen[seen.length - 1][0]).every((k) => existing.has(k)), JSON.stringify(seen[seen.length - 1][0]))
    check('no muta las filas originales', 'favorite' in rows[0])
  }

  console.log('\n3) Un error que NO es de columna se devuelve tal cual (el caller corta)')
  {
    const run = async () => ({ error: { message: 'new row violates row-level security policy' } })
    const r = await upsertTolerant(run, [{ id: '1' }], 'tasks')
    check('propaga el error', r.error?.message?.includes('row-level security') === true)
    check('no descartó nada', r.dropped.length === 0)
  }

  console.log('\n4) No entra en loop si el backend repite la misma columna')
  {
    let calls = 0
    const run = async () => { calls++; return { error: { message: "Could not find the 'favorite' column of 'tasks' in the schema cache" } } }
    const r = await upsertTolerant(run, [{ id: '1', favorite: true }], 'tasks')
    check('corta al segundo intento', calls === 2, `calls=${calls}`)
    check('devuelve error', r.error !== null)
  }
}

main().then(() => {
  console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${pass} ok, ${fail} fail\n`)
  process.exit(fail === 0 ? 0 : 1)
})
