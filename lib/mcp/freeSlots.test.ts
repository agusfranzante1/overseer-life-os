/** Tests del cálculo de huecos libres del bridge.
 *
 *  Correr con:  npx tsx lib/mcp/freeSlots.test.ts
 *
 *  El planificador se para entero sobre esto: si `computeFreeSlots` miente,
 *  Claude agenda 2hs de trabajo arriba de una reunión. */

import { computeFreeSlots, totalFreeMinutes, dayWindow } from './freeSlots'

let pass = 0, fail = 0
function check(label: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label} ${extra}`) }
}

const D = '2026-09-01'
const W_START = `${D}T12:00:00.000Z`   // 09:00 en Buenos Aires (-180)
const W_END   = `${D}T24:00:00.000Z`   // 21:00 BA → medianoche UTC
const at = (h: number, m = 0) => new Date(Date.parse(W_START) + (h * 60 + m) * 60000).toISOString()

console.log('\n--- ventana vacía / bordes ---')
{
  const slots = computeFreeSlots(W_START, W_END, [])
  check('sin eventos → un solo hueco de toda la ventana', slots.length === 1 && slots[0].minutes === 720,
    JSON.stringify(slots))

  check('ventana invertida → []', computeFreeSlots(W_END, W_START, []).length === 0)
  check('ventana de largo cero → []', computeFreeSlots(W_START, W_START, []).length === 0)
  check('fecha basura → []', computeFreeSlots('no-es-fecha', W_END, []).length === 0)
}

console.log('\n--- un evento en el medio ---')
{
  const slots = computeFreeSlots(W_START, W_END, [{ start: at(2), end: at(3) }])
  check('parte la ventana en dos', slots.length === 2, JSON.stringify(slots))
  check('el primer hueco son 120 min', slots[0]?.minutes === 120)
  check('el segundo hueco son 540 min', slots[1]?.minutes === 540)
  check('el total libre son 660 min', totalFreeMinutes(slots) === 660)
}

console.log('\n--- eventos desordenados y solapados ---')
{
  // A propósito fuera de orden: la función tiene que ordenarlos ella.
  const slots = computeFreeSlots(W_START, W_END, [
    { start: at(5), end: at(6) },
    { start: at(1), end: at(3) },
    { start: at(2), end: at(4) },   // solapa con el anterior → se fusionan en 1h-4h
  ])
  check('los solapados se fusionan', slots.length === 3, JSON.stringify(slots))
  check('hueco 1: 0h-1h = 60min', slots[0]?.minutes === 60)
  check('hueco 2: 4h-5h = 60min', slots[1]?.minutes === 60)
  check('hueco 3: 6h-12h = 360min', slots[2]?.minutes === 360)
}

console.log('\n--- eventos pegados (sin hueco de 0 minutos) ---')
{
  const slots = computeFreeSlots(W_START, W_END, [
    { start: at(1), end: at(2) },
    { start: at(2), end: at(3) },   // arranca justo cuando termina el anterior
  ])
  check('no inventa un hueco de 0 min entre eventos pegados', slots.length === 2, JSON.stringify(slots))
  check('no hay ningún hueco de 0 minutos', slots.every((s) => s.minutes > 0))
}

console.log('\n--- eventos que se salen de la ventana ---')
{
  const antes = new Date(Date.parse(W_START) - 3 * 3600000).toISOString()
  const slots = computeFreeSlots(W_START, W_END, [{ start: antes, end: at(1) }])
  check('evento que empieza ANTES de la ventana se recorta', slots.length === 1 && slots[0].minutes === 660,
    JSON.stringify(slots))

  const despues = new Date(Date.parse(W_END) + 3 * 3600000).toISOString()
  const slots2 = computeFreeSlots(W_START, W_END, [{ start: at(11), end: despues }])
  check('evento que termina DESPUÉS de la ventana se recorta',
    slots2.length === 1 && slots2[0].minutes === 660, JSON.stringify(slots2))

  const fuera = computeFreeSlots(W_START, W_END, [
    { start: new Date(Date.parse(W_START) - 7200000).toISOString(),
      end:   new Date(Date.parse(W_START) - 3600000).toISOString() },
  ])
  check('evento COMPLETAMENTE fuera se ignora', fuera.length === 1 && fuera[0].minutes === 720)
}

console.log('\n--- día lleno ---')
{
  const slots = computeFreeSlots(W_START, W_END, [{ start: W_START, end: W_END }])
  check('día 100% ocupado → []', slots.length === 0, JSON.stringify(slots))

  const desborde = computeFreeSlots(W_START, W_END, [
    { start: new Date(Date.parse(W_START) - 3600000).toISOString(),
      end:   new Date(Date.parse(W_END) + 3600000).toISOString() },
  ])
  check('evento que tapa toda la ventana y más → []', desborde.length === 0)
}

console.log('\n--- huecos chicos descartados ---')
{
  const slots = computeFreeSlots(W_START, W_END, [
    { start: at(0, 10), end: at(6) },   // deja un hueco inicial de 10 min
  ])
  check('el hueco de 10 min NO aparece (min 15)', slots.length === 1, JSON.stringify(slots))
  check('el hueco grande sí aparece', slots[0]?.minutes === 360)

  const conMin5 = computeFreeSlots(W_START, W_END, [{ start: at(0, 10), end: at(6) }], 5)
  check('con minMinutes=5 el hueco chico sí aparece', conMin5.length === 2, JSON.stringify(conMin5))
}

console.log('\n--- intervalos inválidos ---')
{
  const slots = computeFreeSlots(W_START, W_END, [
    { start: at(3), end: at(2) },        // end < start
    { start: at(4), end: at(4) },        // largo cero
    { start: 'basura', end: at(5) },     // no parseable
    { start: at(6), end: at(7) },        // este sí vale
  ])
  check('descarta los inválidos y respeta el válido', slots.length === 2, JSON.stringify(slots))
  check('el corte lo hace solo el evento válido', slots[0]?.minutes === 360 && slots[1]?.minutes === 300)
}

console.log('\n--- dayWindow ---')
{
  const w = dayWindow(D, '09:00', '21:00', -180)
  check('09:00 BA = 12:00 UTC', w?.start === `${D}T12:00:00.000Z`, JSON.stringify(w))
  check('21:00 BA = 00:00 UTC del día siguiente', w?.end === '2026-09-02T00:00:00.000Z', JSON.stringify(w))
  check('offset 0 (UTC) sale igual que la hora local', dayWindow(D, '09:00', '21:00', 0)?.start === `${D}T09:00:00.000Z`)
  check('fin <= inicio → null', dayWindow(D, '21:00', '09:00', -180) === null)
  check('hora inválida → null', dayWindow(D, '25:00', '21:00', -180) === null)
  check('formato inválido → null', dayWindow(D, 'nueve', '21:00', -180) === null)
}

console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${pass} ok, ${fail} fail\n`)
process.exit(fail === 0 ? 0 : 1)
