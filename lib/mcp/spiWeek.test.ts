/** npx tsx lib/mcp/spiWeek.test.ts */
import { lastSaturdayYmd, spiPlannedWeek, isYmd, isSaturday } from './spiWeek'

let ok = 0, fail = 0
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) { ok++; console.log(`  ok  ${msg}`) }
  else { fail++; console.error(`  FAIL ${msg}\n       esperado ${e}\n       fue      ${a}`) }
}

// Fechas locales (el store también trabaja en local, no en UTC).
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0)

console.log('\nlastSaturdayYmd')
eq(lastSaturdayYmd(at(2026, 8, 29)), '2026-08-29', 'un sábado se devuelve a sí mismo')
eq(lastSaturdayYmd(at(2026, 8, 30)), '2026-08-29', 'domingo → el sábado de ayer')
eq(lastSaturdayYmd(at(2026, 8, 31)), '2026-08-29', 'lunes 31/08 → sábado 29/08 (el caso real)')
eq(lastSaturdayYmd(at(2026, 9, 4)),  '2026-08-29', 'viernes → sigue siendo el mismo sábado')
eq(lastSaturdayYmd(at(2026, 9, 5)),  '2026-09-05', 'el sábado siguiente ya es otra sesión')
eq(lastSaturdayYmd(at(2026, 1, 1)),  '2025-12-27', 'cruza el año hacia atrás sin romperse')
eq(lastSaturdayYmd(at(2026, 3, 2)),  '2026-02-28', 'cruza el mes hacia atrás')

console.log('\nspiPlannedWeek — la sesión del sábado planifica la semana SIGUIENTE')
eq(spiPlannedWeek('2026-08-29'), { from: '2026-08-31', to: '2026-09-06' },
   'sábado 29/08 planifica lunes 31/08 → domingo 06/09 (la semana que estamos armando)')
eq(spiPlannedWeek('2026-09-05'), { from: '2026-09-07', to: '2026-09-13' }, 'la siguiente encadena')
eq(spiPlannedWeek('2025-12-27'), { from: '2025-12-29', to: '2026-01-04' }, 'cruza el año hacia adelante')

console.log('\nisYmd')
eq(isYmd('2026-08-29'), true,  'fecha válida')
eq(isYmd('2026-02-31'), false, 'un 31 de febrero NO pasa (Date lo rueda a marzo)')
eq(isYmd('2026-8-9'),   false, 'sin padding no pasa')
eq(isYmd('hoy'),        false, 'texto suelto no pasa')
eq(isYmd(''),           false, 'vacío no pasa')
eq(isYmd(undefined),    false, 'undefined no pasa')

console.log('\nisSaturday — anclar a otro día deja la sesión invisible en la app')
eq(isSaturday('2026-08-29'), true,  'sábado')
eq(isSaturday('2026-08-31'), false, 'lunes NO')
eq(isSaturday('2026-08-30'), false, 'domingo NO')
eq(isSaturday('no-es-fecha'), false, 'basura NO')

console.log(`\n${ok} ok, ${fail} fail\n`)
if (fail > 0) process.exit(1)
