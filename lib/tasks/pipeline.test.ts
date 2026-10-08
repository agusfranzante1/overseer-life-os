/** npx tsx lib/tasks/pipeline.test.ts */
import {
  ymdLocal, startOfWeekMonday, buildDays, sortByTime, bucketByDay, timeLabel,
  type PipelineTask,
} from './pipeline'

let pass = 0, fail = 0
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label} ${extra}`) }
}

const T = (id: string, p: Partial<PipelineTask> = {}): PipelineTask => ({ id, ...p })
const ids = (ts: PipelineTask[]) => ts.map((t) => t.id).join(',')

console.log('\n1) Fechas en hora LOCAL (el bug de UTC que ya mordió dos veces)')
{
  // 23:30 local del 8/10 — con toISOString() en UTC-3 esto da el 9.
  const d = new Date(2026, 9, 8, 23, 30)
  check('ymdLocal no se corre de día', ymdLocal(d) === '2026-10-08', ymdLocal(d))
  check('un dígito se paddea', ymdLocal(new Date(2026, 0, 5)) === '2026-01-05')
}

console.log('\n2) La semana arranca el lunes (igual que el Calendario)')
{
  const jue = new Date(2026, 9, 8)          // jueves
  check('jueves → lunes 5', ymdLocal(startOfWeekMonday(jue)) === '2026-10-05')
  const lun = new Date(2026, 9, 5)
  check('lunes → él mismo', ymdLocal(startOfWeekMonday(lun)) === '2026-10-05')
  const dom = new Date(2026, 9, 11)         // domingo: el borde que se escribe mal
  check('domingo → el lunes ANTERIOR', ymdLocal(startOfWeekMonday(dom)) === '2026-10-05',
    ymdLocal(startOfWeekMonday(dom)))
  const sab = new Date(2026, 9, 10)
  check('sábado → mismo lunes', ymdLocal(startOfWeekMonday(sab)) === '2026-10-05')
}
{
  // Cruce de mes y de año: el +N días tiene que delegar en Date, no sumar texto.
  check('cruza el mes', buildDays(new Date(2026, 8, 29), 4).join(',') === '2026-09-29,2026-09-30,2026-10-01,2026-10-02')
  check('cruza el año', buildDays(new Date(2026, 11, 30), 3).join(',') === '2026-12-30,2026-12-31,2027-01-01')
  check('7 días por default', buildDays(new Date(2026, 9, 5)).length === 7)
}

console.log('\n3) Orden dentro del día: con hora primero, hechas al fondo')
{
  const out = sortByTime([
    T('sinHora'),
    T('tarde', { dueTime: '18:00' }),
    T('temprano', { dueTime: '09:00' }),
    T('hecha', { dueTime: '07:00', completedAt: '2026-10-08T10:00:00Z' }),
  ])
  check('cronológico, sin hora después, hecha al final',
    ids(out) === 'temprano,tarde,sinHora,hecha', ids(out))
}
{
  const a = sortByTime([T('b'), T('a')])
  check('empate → por id (estable entre dispositivos)', ids(a) === 'a,b', ids(a))
  const orig = [T('z'), T('a')]
  sortByTime(orig)
  check('no muta el array original', orig[0].id === 'z')
}

console.log('\n4) El reparto en columnas')
const days = buildDays(new Date(2026, 9, 5))   // lun 5 → dom 11
const HOY = '2026-10-08'
{
  const b = bucketByDay([
    T('sinFecha'),
    T('hoy9', { dueDate: HOY, dueTime: '09:00' }),
    T('hoy18', { dueDate: HOY, dueTime: '18:00' }),
    T('hoySinHora', { dueDate: HOY }),
    T('lunes', { dueDate: '2026-10-05' }),
    T('vencida', { dueDate: '2026-10-01' }),
    T('vencidaHecha', { dueDate: '2026-10-01', completedAt: 'x' }),
    T('semanaQueViene', { dueDate: '2026-10-14' }),
    T('archivada', { dueDate: HOY, archivedAt: 'x' }),
  ], days, HOY)

  check('sin fecha va a su columna', ids(b.undated) === 'sinFecha')
  check('el día ordena por hora', ids(b.byDay.get(HOY)!) === 'hoy9,hoy18,hoySinHora', ids(b.byDay.get(HOY)!))
  check('cada día tiene su columna aunque esté vacío', b.byDay.size === 7)
  check('otro día de la ventana cae en su día', ids(b.byDay.get('2026-10-05')!) === 'lunes')
  check('vencida ABIERTA → columna Atrasadas', ids(b.overdue) === 'vencida', ids(b.overdue))
  check('vencida YA HECHA no ensucia el tablero', !ids(b.overdue).includes('vencidaHecha'))
  check('lo de más adelante se CUENTA, no se dibuja', b.aheadCount === 1, String(b.aheadCount))
  check('archivada (papelera) no aparece en ningún lado',
    !ids(b.undated).includes('archivada') && !ids(b.byDay.get(HOY)!).includes('archivada'))
}
{
  // Hoy es el PRIMER día de la ventana: nada anterior debería colarse al día.
  const b = bucketByDay([T('ayer', { dueDate: '2026-10-04' })], days, '2026-10-05')
  check('ayer, con hoy al borde izquierdo, es Atrasada', ids(b.overdue) === 'ayer')
}
{
  const b = bucketByDay([], days, HOY)
  check('sin tareas no explota', b.overdue.length === 0 && b.undated.length === 0 && b.aheadCount === 0 && b.behindCount === 0)
  check('igual devuelve las 7 columnas', b.byDay.size === 7)
}
{
  // Mirando una semana PASADA: lo de "hoy" queda adelante, no atrasado.
  const pasada = buildDays(new Date(2026, 8, 28))  // lun 28 sep → dom 4 oct
  const b = bucketByDay([T('hoy', { dueDate: HOY })], pasada, HOY)
  check('en una semana pasada, lo de hoy cuenta como "más adelante"',
    b.aheadCount === 1 && b.overdue.length === 0)
}
{
  // Y el reverso, que es el que mentía: mirando la semana QUE VIENE, lo de hoy
  // NO está atrasado — se cuenta como "antes" y no se dibuja.
  const quePviene = buildDays(new Date(2026, 9, 12))   // lun 12 → dom 18
  const b = bucketByDay([
    T('hoy', { dueDate: HOY }),
    T('viejaAbierta', { dueDate: '2026-09-20' }),
  ], quePviene, HOY)
  check('lo de hoy NO figura como atrasado en una ventana futura',
    b.overdue.length === 1 && b.overdue[0].id === 'viejaAbierta', ids(b.overdue))
  check('se cuenta aparte como "antes"', b.behindCount === 1, String(b.behindCount))
}
{
  // La vencida se ve SIEMPRE, mire la semana que mire: es la que hay que reubicar.
  const quePviene = buildDays(new Date(2026, 9, 12))
  const b = bucketByDay([T('vencida', { dueDate: '2026-10-01' })], quePviene, HOY)
  check('una vencida sigue visible desde cualquier semana', ids(b.overdue) === 'vencida')
}

console.log('\n5) El chip de la hora')
check('HH:MM', timeLabel(T('x', { dueTime: '09:30' })) === '09:30')
check('recorta segundos si vinieran', timeLabel(T('x', { dueTime: '09:30:00' })) === '09:30')
check('sin hora → null (la tarjeta no dibuja chip)', timeLabel(T('x')) === null)

console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${pass} ok, ${fail} fail\n`)
process.exit(fail === 0 ? 0 : 1)
