/** npx tsx lib/tasks/timeline.test.ts */
import {
  addDaysYmd, daysBetween, barOf, placeInWindow, applyDrag, barLength,
  type TimelineTask,
} from './timeline'

let pass = 0, fail = 0
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label} ${extra}`) }
}
const T = (id: string, p: Partial<TimelineTask> = {}): TimelineTask => ({ id, ...p })

console.log('\n1) Aritmética de días (en calendario local, no en texto)')
check('suma simple', addDaysYmd('2026-10-08', 3) === '2026-10-11')
check('cruza el mes', addDaysYmd('2026-10-30', 3) === '2026-11-02')
check('cruza el año', addDaysYmd('2026-12-30', 3) === '2027-01-02')
check('resta', addDaysYmd('2026-11-02', -3) === '2026-10-30')
check('año bisiesto', addDaysYmd('2028-02-28', 1) === '2028-02-29')
check('cambio de hora (ARG no tiene, pero no debe redondear mal)',
  addDaysYmd('2026-03-14', 1) === '2026-03-15')
check('diferencia', daysBetween('2026-10-08', '2026-10-11') === 3)
check('diferencia cruzando mes', daysBetween('2026-10-30', '2026-11-02') === 3)
check('diferencia negativa', daysBetween('2026-10-11', '2026-10-08') === -3)
check('mismo día = 0', daysBetween('2026-10-08', '2026-10-08') === 0)

console.log('\n2) La barra de una tarea')
{
  const b = barOf(T('x', { startDate: '2026-10-10', dueDate: '2026-10-14' }))!
  check('con inicio y fin → tramo', b.from === '2026-10-10' && b.to === '2026-10-14' && !b.single)
  check('largo en días (inclusive)', barLength(b) === 5, String(barLength(b)))
}
check('solo vencimiento → un día', (() => {
  const b = barOf(T('x', { dueDate: '2026-10-14' }))!
  return b.from === '2026-10-14' && b.to === '2026-10-14' && b.single
})())
check('solo inicio → un día (no inventamos el fin)', (() => {
  const b = barOf(T('x', { startDate: '2026-10-10' }))!
  return b.from === '2026-10-10' && b.to === '2026-10-10' && b.single
})())
check('sin fechas → sin barra', barOf(T('x')) === null)
{
  // El dato roto se DIBUJA y se marca; esconderlo sería tapar justo lo que hay
  // que arreglar.
  const b = barOf(T('x', { startDate: '2026-10-14', dueDate: '2026-10-10' }))!
  check('invertida: se ordena de menor a mayor', b.from === '2026-10-10' && b.to === '2026-10-14')
  check('invertida: queda marcada', b.inverted)
}

console.log('\n3) Ubicar en la ventana visible')
const W = '2026-10-05'   // lunes; ventana de 14 días → hasta el 18
{
  const r = placeInWindow([
    T('dentro', { startDate: '2026-10-06', dueDate: '2026-10-08' }),
    T('sinFechas'),
    T('antes', { startDate: '2026-09-01', dueDate: '2026-09-30' }),
    T('despues', { dueDate: '2026-11-20' }),
    T('archivada', { dueDate: '2026-10-07', archivedAt: 'x' }),
  ], W, 14)
  const p = r.placed.find((x) => x.task.id === 'dentro')!
  check('offset = días desde el inicio de la ventana', p.offset === 1, String(p.offset))
  check('span inclusive', p.span === 3, String(p.span))
  check('sin fechas va aparte', r.undated.map((t) => t.id).join(',') === 'sinFechas')
  check('lo que cae afuera se cuenta, no se dibuja', r.hiddenCount === 2, String(r.hiddenCount))
  check('archivada no aparece en ningún lado',
    !r.placed.some((x) => x.task.id === 'archivada') && !r.undated.some((t) => t.id === 'archivada'))
}
{
  // El caso que más se rompe: una barra que entra por un borde.
  const r = placeInWindow([
    T('entraPorIzq', { startDate: '2026-10-01', dueDate: '2026-10-07' }),
    T('salePorDer', { startDate: '2026-10-16', dueDate: '2026-10-25' }),
    T('masLargaQueLaVentana', { startDate: '2026-09-01', dueDate: '2026-12-01' }),
  ], W, 14)
  const izq = r.placed.find((x) => x.task.id === 'entraPorIzq')!
  check('recortada a la izquierda arranca en 0', izq.offset === 0 && izq.span === 3, `${izq.offset}/${izq.span}`)
  check('y se marca como continuada', izq.clippedLeft && !izq.clippedRight)
  const der = r.placed.find((x) => x.task.id === 'salePorDer')!
  check('recortada a la derecha no se pasa del ancho', der.offset + der.span === 14, String(der.offset + der.span))
  check('y se marca del otro lado', der.clippedRight && !der.clippedLeft)
  const larga = r.placed.find((x) => x.task.id === 'masLargaQueLaVentana')!
  check('más larga que la ventana: la ocupa entera', larga.offset === 0 && larga.span === 14)
  check('marcada de los dos lados', larga.clippedLeft && larga.clippedRight)
}
{
  // Bordes exactos: empieza el último día / termina el primero. Ninguna se pierde.
  const r = placeInWindow([
    T('ultimoDia', { dueDate: '2026-10-18' }),
    T('primerDia', { dueDate: '2026-10-05' }),
    T('justoAfuera', { dueDate: '2026-10-19' }),
  ], W, 14)
  check('el último día de la ventana entra', r.placed.some((x) => x.task.id === 'ultimoDia'))
  check('el primero también', r.placed.some((x) => x.task.id === 'primerDia'))
  check('un día después, no', !r.placed.some((x) => x.task.id === 'justoAfuera') && r.hiddenCount === 1)
}
{
  const r = placeInWindow([
    T('b', { startDate: '2026-10-06', dueDate: '2026-10-06' }),
    T('a', { startDate: '2026-10-06', dueDate: '2026-10-09' }),
    T('c', { startDate: '2026-10-05', dueDate: '2026-10-05' }),
  ], W, 14)
  check('ordena por inicio, y a igual inicio la más larga arriba',
    r.placed.map((x) => x.task.id).join(',') === 'c,a,b', r.placed.map((x) => x.task.id).join(','))
}
check('ventana vacía no explota', placeInWindow([], W, 14).placed.length === 0)

console.log('\n4) Arrastrar la barra')
{
  const t = T('x', { startDate: '2026-10-10', dueDate: '2026-10-14' })
  const r = applyDrag(t, 'move', 2)!
  check('mover corre las DOS puntas', r.startDate === '2026-10-12' && r.dueDate === '2026-10-16')
  const back = applyDrag(t, 'move', -5)!
  check('y hacia atrás también', back.startDate === '2026-10-05' && back.dueDate === '2026-10-09')
  check('delta 0 no escribe nada', applyDrag(t, 'move', 0) === null)
}
{
  const t = T('x', { startDate: '2026-10-10', dueDate: '2026-10-14' })
  check('estirar el inicio hacia atrás', applyDrag(t, 'start', -3)!.startDate === '2026-10-07')
  check('estirar el fin hacia adelante', applyDrag(t, 'end', 3)!.dueDate === '2026-10-17')
  check('no escribe el campo que no tocó', applyDrag(t, 'start', -3)!.dueDate === undefined)
}
{
  // El tope: nunca una barra invertida POR ARRASTRE.
  const t = T('x', { startDate: '2026-10-10', dueDate: '2026-10-14' })
  check('el inicio no puede pasar del fin', applyDrag(t, 'start', 99)!.startDate === '2026-10-14')
  check('el fin no puede quedar antes del inicio', applyDrag(t, 'end', -99)!.dueDate === '2026-10-10')
}
{
  // A una tarea que solo tiene vencimiento, estirar el borde izquierdo le CREA
  // el inicio: es la forma natural de decir "esto arranca antes".
  const t = T('x', { dueDate: '2026-10-14' })
  check('estirar a la izquierda crea el inicio', applyDrag(t, 'start', -4)!.startDate === '2026-10-10')
  check('mover una tarea sin inicio solo corre el vencimiento', (() => {
    const r = applyDrag(t, 'move', 2)!
    return r.dueDate === '2026-10-16' && r.startDate === undefined
  })())
}
{
  const t = T('x', { startDate: '2026-10-10' })
  check('con solo inicio, estirar a la derecha crea el vencimiento',
    applyDrag(t, 'end', 4)!.dueDate === '2026-10-14')
}
check('una tarea sin fechas no se puede arrastrar', applyDrag(T('x'), 'move', 3) === null)

console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${pass} ok, ${fail} fail\n`)
process.exit(fail === 0 ? 0 : 1)
