/** npx tsx lib/store/decisionsStore.test.ts */
import {
  sortDecisions, filterDecisions, decisionStats, formatDecisionDate,
  type Decision,
} from './decisionsStore'

let pass = 0, fail = 0
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label} ${extra}`) }
}

const mk = (p: Partial<Decision> & { id: string }): Decision => ({
  date: '2026-09-01', title: '', body: '', outcome: '',
  verdict: 'pendiente', important: false,
  createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
  ...p,
})

function main() {
  console.log('\n1) Orden: la última arriba, y dentro del día por creación')
  {
    const out = sortDecisions([
      mk({ id: 'vieja', date: '2026-08-01' }),
      mk({ id: 'hoy-1', date: '2026-09-04', createdAt: '2026-09-04T09:00:00.000Z' }),
      mk({ id: 'hoy-2', date: '2026-09-04', createdAt: '2026-09-04T18:00:00.000Z' }),
    ])
    check('más nueva primero', out.map((d) => d.id).join(',') === 'hoy-2,hoy-1,vieja', out.map((d) => d.id).join(','))
  }
  {
    const orig = [mk({ id: 'a' }), mk({ id: 'b', date: '2026-09-09' })]
    sortDecisions(orig)
    check('no muta el array original', orig[0].id === 'a')
  }
  {
    const out = sortDecisions([
      mk({ id: 'importante', date: '2026-08-01', important: true }),
      mk({ id: 'reciente', date: '2026-09-04' }),
    ])
    check('la ⭐ NO se sube al tope (rompería la línea de tiempo)', out[0].id === 'reciente')
  }

  console.log('\n2) Filtros')
  const data = [
    mk({ id: '1', verdict: 'correcta', important: true, projectId: 'p1', title: 'Cerrar la oferta' }),
    mk({ id: '2', verdict: 'incorrecta', projectId: 'p1', body: 'contratar sin prueba' }),
    mk({ id: '3', verdict: 'pendiente', projectId: 'p2', outcome: 'todavía nada' }),
    mk({ id: '4', verdict: 'correcta', important: true }),
  ]
  const ids = (ds: Decision[]) => ds.map((d) => d.id).join(',')
  check('sin filtros devuelve todo', ids(filterDecisions(data, {})) === '1,2,3,4')
  check('"todas"/"todos" no filtran', ids(filterDecisions(data, { verdict: 'todas', projectId: 'todos' })) === '1,2,3,4')
  check('por veredicto', ids(filterDecisions(data, { verdict: 'correcta' })) === '1,4')
  check('por proyecto', ids(filterDecisions(data, { projectId: 'p1' })) === '1,2')
  check('solo importantes', ids(filterDecisions(data, { onlyImportant: true })) === '1,4')
  check('combinado (proyecto + importante)', ids(filterDecisions(data, { projectId: 'p1', onlyImportant: true })) === '1')
  check('busca en el título', ids(filterDecisions(data, { query: 'oferta' })) === '1')
  check('busca en el texto', ids(filterDecisions(data, { query: 'CONTRATAR' })) === '2')
  check('busca en el resultado', ids(filterDecisions(data, { query: 'todavía' })) === '3')
  check('query en blanco no filtra', ids(filterDecisions(data, { query: '   ' })) === '1,2,3,4')

  console.log('\n3) Estadísticas')
  {
    const s = decisionStats(data)
    check('cuenta cada estado', s.total === 4 && s.correctas === 2 && s.incorrectas === 1 && s.pendientes === 1,
      JSON.stringify(s))
    check('acierto sobre las JUZGADAS, no sobre el total', s.aciertoPct === 67, String(s.aciertoPct))
  }
  {
    const s = decisionStats([mk({ id: 'x' }), mk({ id: 'y' })])
    check('sin juzgar ninguna, el acierto es null (0% sería mentira)', s.aciertoPct === null, String(s.aciertoPct))
  }
  {
    const s = decisionStats([])
    check('lista vacía no explota', s.total === 0 && s.aciertoPct === null)
  }
  {
    const s = decisionStats([mk({ id: 'a', verdict: 'incorrecta' }), mk({ id: 'b', verdict: 'incorrecta' })])
    check('todas mal → 0%', s.aciertoPct === 0, String(s.aciertoPct))
  }

  console.log('\n4) La fecha se lee en hora LOCAL (no se corre un día por UTC)')
  {
    const txt = formatDecisionDate('2026-09-04', 'es-AR')
    check('incluye el día correcto', txt.includes('4'), txt)
    check('no se corre al 3', !txt.includes(' 3 '), txt)
    check('una fecha inválida se devuelve tal cual', formatDecisionDate('nada') === 'nada')
  }
}

main()
console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${pass} ok, ${fail} fail\n`)
process.exit(fail === 0 ? 0 : 1)
