/** npx tsx lib/supabase/authRetry.test.ts */
import { isTokenExpiredError, pushWithAuthRetry } from './authRetry'

let pass = 0, fail = 0
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label} ${extra}`) }
}

async function main() {
  console.log('\n1) Reconoce el token vencido (errores reales de Supabase)')
  check('PGRST303 crudo', isTokenExpiredError({ code: 'PGRST303', message: 'JWT expired' }))
  check('PGRST301 (JWT inválido)', isTokenExpiredError({ code: 'PGRST301', message: 'JWSError JWSInvalidSignature' }))
  check('el mensaje YA formateado por errMsg', isTokenExpiredError('Sync push failed: JWT expired · PGRST303'))
  check('sin code, solo mensaje', isTokenExpiredError({ message: 'JWT expired' }))
  check('claim inválido', isTokenExpiredError({ message: 'invalid claim: missing sub claim' }))
  check('Error() con el texto', isTokenExpiredError(new Error('JWT expired')))

  console.log('\n2) NO se come los errores que sí hay que mostrar')
  check('RLS', !isTokenExpiredError({ code: '42501', message: 'new row violates row-level security policy for table "tasks"' }))
  check('migración sin correr', !isTokenExpiredError({ code: 'PGRST204', message: "Could not find the 'favorite' column of 'tasks' in the schema cache" }))
  check('red caída', !isTokenExpiredError(new Error('Failed to fetch')))
  check('401 pelado (no alcanza: renovar no lo arregla)', !isTokenExpiredError({ message: 'Unauthorized', status: 401 }))
  check('null', !isTokenExpiredError(null))
  check('objeto vacío', !isTokenExpiredError({}))

  console.log('\n3) El push que sale bien no toca la sesión')
  {
    let runs = 0, refreshes = 0
    const r = await pushWithAuthRetry(async () => { runs++ }, async () => { refreshes++; return true })
    check('status ok', r.status === 'ok', r.status)
    check('corrió una sola vez', runs === 1, `runs=${runs}`)
    check('no renovó la sesión al pedo', refreshes === 0, `refreshes=${refreshes}`)
  }

  console.log('\n4) EL CASO REPORTADO: token vencido → renueva y reintenta')
  {
    let runs = 0, refreshes = 0
    const r = await pushWithAuthRetry(
      async () => { runs++; if (runs === 1) throw { code: 'PGRST303', message: 'JWT expired' } },
      async () => { refreshes++; return true },
    )
    check('status retried', r.status === 'retried', r.status)
    check('reintentó una vez', runs === 2, `runs=${runs}`)
    check('renovó la sesión antes del reintento', refreshes === 1, `refreshes=${refreshes}`)
  }

  console.log('\n5) Un error que NO es de token no se reintenta')
  {
    let runs = 0, refreshes = 0
    const boom = { code: 'PGRST204', message: "Could not find the 'tags' column of 'tasks' in the schema cache" }
    const r = await pushWithAuthRetry(async () => { runs++; throw boom }, async () => { refreshes++; return true })
    check('status failed', r.status === 'failed', r.status)
    check('devuelve el error original', r.status === 'failed' && r.error === boom)
    check('no reintentó', runs === 1, `runs=${runs}`)
    check('ni tocó la sesión', refreshes === 0, `refreshes=${refreshes}`)
  }

  console.log('\n6) Sesión muerta (no renovable) → hay que re-loguear, no reintentar')
  {
    let runs = 0
    const r = await pushWithAuthRetry(
      async () => { runs++; throw { code: 'PGRST303', message: 'JWT expired' } },
      async () => false,
    )
    check('status session-dead', r.status === 'session-dead', r.status)
    check('no reintentó a ciegas', runs === 1, `runs=${runs}`)
  }

  console.log('\n7) Si el reintento vuelve a fallar, se reporta (BASE nº6: nada callado)')
  {
    let runs = 0
    const segundo = { code: '42501', message: 'new row violates row-level security policy' }
    const r = await pushWithAuthRetry(
      async () => { runs++; if (runs === 1) throw { code: 'PGRST303', message: 'JWT expired' }; throw segundo },
      async () => true,
    )
    check('status failed', r.status === 'failed', r.status)
    check('devuelve el error del ÚLTIMO intento', r.status === 'failed' && r.error === segundo)
    check('no insiste una tercera vez', runs === 2, `runs=${runs}`)
  }

  console.log('\n8) Si renovar EXPLOTA (red caída) no se desloguea al usuario')
  {
    let runs = 0
    const primero = { code: 'PGRST303', message: 'JWT expired' }
    const r = await pushWithAuthRetry(
      async () => { runs++; throw primero },
      async () => { throw new Error('Failed to fetch') },
    )
    check('NO da session-dead', r.status !== 'session-dead', r.status)
    check('status failed con el error original', r.status === 'failed' && r.error === primero)
    check('no reintentó sin sesión válida', runs === 1, `runs=${runs}`)
  }
}

main().then(() => {
  console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${pass} ok, ${fail} fail\n`)
  process.exit(fail === 0 ? 0 : 1)
})
