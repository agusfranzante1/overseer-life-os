/** npx tsx lib/calendar/seriesShift.test.ts */
import { shiftSeries } from './seriesShift'

let pass = 0, fail = 0
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; return }
  fail++; console.log(`✗ ${name}\n   got  ${g}\n   want ${w}`)
}

// La serie real del 08/10: "NQN Survey · bloque de trabajo", ma/ju 14:00–18:30 ART.
const masterStart = '2026-09-01T14:00:00-03:00'
const masterEnd = '2026-09-01T18:30:00-03:00'
const instanceStart = '2026-10-08T14:00:00-03:00'
const instanceEnd = '2026-10-08T18:30:00-03:00'

// 1. EL CASO REPORTADO: achicar desde el borde (solo cambia el fin) → la serie
//    tiene que terminar 17:00, no quedar igual.
{
  const r = shiftSeries({ instanceStart, instanceEnd, newStart: '2026-10-08T17:00:00.000Z', newEnd: '2026-10-08T20:00:00.000Z', masterStart, masterEnd })
  eq('achicar: ok', r.ok, true)
  if (r.ok) {
    eq('achicar: inicio igual', r.start, '2026-09-01T17:00:00.000Z')
    eq('achicar: fin 17:00 ART', r.end, '2026-09-01T20:00:00.000Z')
    eq('achicar: hubo cambio', r.changed, true)
  }
}

// 2. Mover (inicio y fin +1 h) sigue andando como antes.
{
  const r = shiftSeries({ instanceStart, instanceEnd, newStart: '2026-10-08T18:00:00.000Z', newEnd: '2026-10-08T22:30:00.000Z', masterStart, masterEnd })
  eq('mover: inicio +1h', r.ok && r.start, '2026-09-01T18:00:00.000Z')
  eq('mover: fin +1h', r.ok && r.end, '2026-09-01T22:30:00.000Z')
}

// 3. Agrandar desde el borde.
{
  const r = shiftSeries({ instanceStart, instanceEnd, newStart: instanceStart, newEnd: '2026-10-08T19:30:00-03:00', masterStart, masterEnd })
  eq('agrandar: fin 19:30 ART', r.ok && r.end, '2026-09-01T22:30:00.000Z')
}

// 4. Solo inicio, sin fin: el fin acompaña (conserva la duración).
{
  const r = shiftSeries({ instanceStart, instanceEnd, newStart: '2026-10-08T15:00:00-03:00', masterStart, masterEnd })
  eq('solo inicio: fin acompaña', r.ok && r.end, '2026-09-01T22:30:00.000Z')
}

// 5. Sin cambios reales → changed:false (título editado, horario igual).
{
  const r = shiftSeries({ instanceStart, instanceEnd, newStart: instanceStart, newEnd: instanceEnd, masterStart, masterEnd })
  eq('sin cambio', r.ok && r.changed, false)
}

// 6. Fin antes del inicio → error, no un patch roto.
{
  const r = shiftSeries({ instanceStart, instanceEnd, newStart: instanceStart, newEnd: '2026-10-08T13:00:00-03:00', masterStart, masterEnd })
  eq('fin antes del inicio', r.ok ? 'ok' : r.error, 'fin_antes_del_inicio')
}

// 7. Fecha ilegible → error.
{
  const r = shiftSeries({ instanceStart, instanceEnd, newStart: 'basura', masterStart, masterEnd })
  eq('fecha invalida', r.ok ? 'ok' : r.error, 'fecha_invalida')
}

// 8. Sin fin de instancia: el fin acompaña al inicio (comportamiento viejo).
{
  const r = shiftSeries({ instanceStart, instanceEnd: null, newStart: '2026-10-08T15:00:00-03:00', newEnd: '2026-10-08T17:00:00-03:00', masterStart, masterEnd })
  eq('sin fin de instancia', r.ok && r.end, '2026-09-01T22:30:00.000Z')
}

console.log(`seriesShift: ${pass}/${pass + fail}`)
if (fail) process.exit(1)
