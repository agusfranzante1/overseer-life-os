/** Tests de la validación de tareas creadas desde el bridge.
 *
 *  Correr con:  npx tsx lib/mcp/taskInput.test.ts
 *
 *  Lo que fija:
 *   - el estado sale de los estados REALES del proyecto (que están en español),
 *     no de un "To Do" hardcodeado que en ese tablero no existe;
 *   - una tarea entra al calendario de Overseer solo con fecha + hora;
 *   - una recurrencia inválida FALLA en vez de "arreglarse" sola. */

import {
  resolveStatus, normalizeTaskInput, validateRecurrence, normalizeSubtasks,
  normalizePriority, normalizeImportance, bridgeId,
} from './taskInput'

let pass = 0, fail = 0
function check(label: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label} ${extra}`) }
}

// Estados como los tiene el usuario (en español, con "Hecho" al final).
const ES = [
  { label: 'Hacer', order: 0, countsAsDone: false },
  { label: 'Haciendo', order: 1, countsAsDone: false },
  { label: 'Hecho', order: 3, countsAsDone: true },
]

console.log('\n--- resolveStatus ---')
{
  check('sin pedido → primer estado NO-hecho del proyecto', resolveStatus(ES) === 'Hacer')
  check('respeta el pedido si existe', resolveStatus(ES, 'Haciendo') === 'Haciendo')
  check('case-insensitive', resolveStatus(ES, 'haciendo') === 'Haciendo')
  check('pedido inexistente → cae al primero no-hecho', resolveStatus(ES, 'To Do') === 'Hacer')
  check('ignora el orden del array y usa `order`',
    resolveStatus([{ label: 'Hecho', order: 3, countsAsDone: true }, { label: 'Hacer', order: 0 }]) === 'Hacer')
  check('proyecto sin estados → fallback To Do', resolveStatus([]) === 'To Do')
  check('proyecto undefined → fallback To Do', resolveStatus(undefined) === 'To Do')
  check('todos cuentan como hecho → usa el primero igual',
    resolveStatus([{ label: 'Listo', order: 0, countsAsDone: true }]) === 'Listo')
}

console.log('\n--- prioridad / importancia ---')
{
  check('prioridad válida pasa', normalizePriority('urgent') === 'urgent')
  check('prioridad basura → medium', normalizePriority('altísima') === 'medium')
  check('prioridad ausente → medium', normalizePriority(undefined) === 'medium')
  check('importancia high pasa', normalizeImportance('high') === 'high')
  check('importancia urgent NO existe → medium', normalizeImportance('urgent') === 'medium')
}

console.log('\n--- calendario de Overseer (fecha + hora) ---')
{
  const conAmbos = normalizeTaskInput({ title: 'Backtesting', dueDate: '2026-09-01', dueTime: '9:30' }, ES)
  check('fecha + hora → entra al calendario', conAmbos.task?.showsInCalendar === true)
  check('la hora se normaliza a HH:MM', conAmbos.task?.dueTime === '09:30', conAmbos.task?.dueTime)

  const soloFecha = normalizeTaskInput({ title: 'Leer', dueDate: '2026-09-01' }, ES)
  check('solo fecha → NO entra al calendario', soloFecha.task?.showsInCalendar === false)

  const soloHora = normalizeTaskInput({ title: 'Leer', dueTime: '10:00' }, ES)
  check('solo hora → no entra y avisa', soloHora.task?.showsInCalendar === false
    && soloHora.warnings.some((w) => w.includes('NO va a aparecer en el calendario')), JSON.stringify(soloHora.warnings))

  const dur = normalizeTaskInput({ title: 'X', durationMinutes: 90 }, ES)
  check('duración sin hora → avisa que no se usa',
    dur.warnings.some((w) => w.includes('solo se usa cuando hay `dueTime`')), JSON.stringify(dur.warnings))
}

console.log('\n--- validaciones que FALLAN (no se arreglan solas) ---')
{
  check('sin título → error', normalizeTaskInput({}, ES).ok === false)
  check('fecha inválida → error', normalizeTaskInput({ title: 'X', dueDate: '01/09/2026' }, ES).ok === false)
  check('hora inválida → error', normalizeTaskInput({ title: 'X', dueTime: '25h' }, ES).ok === false)
  check('duración 0 → error', normalizeTaskInput({ title: 'X', durationMinutes: 0 }, ES).ok === false)
  check('energía 9 → error', normalizeTaskInput({ title: 'X', energyEstimate: 9 }, ES).ok === false)
  check('scheduledFor raro → error', normalizeTaskInput({ title: 'X', scheduledFor: 'ayer' }, ES).ok === false)
  check('tags no-array → error', normalizeTaskInput({ title: 'X', tags: 'software' }, ES).ok === false)
}

console.log('\n--- estado pedido que no existe: avisa ---')
{
  const r = normalizeTaskInput({ title: 'X', status: 'In Progress' }, ES)
  check('usa un estado real del proyecto', r.task?.status === 'Hacer', r.task?.status)
  check('y lo avisa', r.warnings.some((w) => w.includes('no existe en ese proyecto')), JSON.stringify(r.warnings))
}

console.log('\n--- recurrencia ---')
{
  const ok = validateRecurrence({ kind: 'weekly', daysOfWeek: [3, 1, 1] })
  check('weekly con días válidos', ok.ok === true)
  check('dedupe + orden de daysOfWeek',
    ok.ok && JSON.stringify(ok.recurrence.daysOfWeek) === '[1,3]',
    ok.ok ? JSON.stringify(ok.recurrence.daysOfWeek) : '')

  check('kind inválido → error', validateRecurrence({ kind: 'yearly' }).ok === false)
  check('sin kind → error', validateRecurrence({}).ok === false)
  check('no-objeto → error', validateRecurrence('daily').ok === false)
  check('day 7 → error', validateRecurrence({ kind: 'weekly', daysOfWeek: [7] }).ok === false)
  check('until mal formado → error', validateRecurrence({ kind: 'daily', until: '2026/12/31' }).ok === false)
  check('until válido pasa',
    validateRecurrence({ kind: 'daily', until: '2026-12-31' }).ok === true)

  // El ancla es lo que hace que la serie sepa desde dónde generar.
  const sinFecha = normalizeTaskInput({ title: 'Gym', recurrence: { kind: 'daily' } }, ES)
  check('recurrente SIN dueDate → error explícito', sinFecha.ok === false
    && !!sinFecha.error?.includes('ancla'), sinFecha.error)

  const conFecha = normalizeTaskInput({ title: 'Gym', recurrence: { kind: 'daily' }, dueDate: '2026-09-01' }, ES)
  check('recurrente CON dueDate → ok', conFecha.ok === true && conFecha.task?.recurrence?.kind === 'daily')
}

console.log('\n--- subtareas ---')
{
  let n = 0
  const id = () => `sub${n++}`
  const r = normalizeSubtasks(['comprar', { title: '  cocinar  ' }, '', { nope: 1 }], id)
  check('acepta strings y objetos, descarta vacíos',
    r.ok && r.subtasks.length === 2, r.ok ? JSON.stringify(r.subtasks) : '')
  check('trimea el título', r.ok && r.subtasks[1].title === 'cocinar')
  check('mantiene el orden', r.ok && r.subtasks[0].order === 0 && r.subtasks[1].order === 1)
  check('undefined → lista vacía', normalizeSubtasks(undefined, id).ok === true)
  check('no-array → error', normalizeSubtasks('comprar', id).ok === false)
}

console.log('\n--- ids del bridge ---')
{
  const id = bridgeId()
  check('no contiene `__` (lo usa el spawn de subtareas recurrentes)', !id.includes('__'), id)
  check('no arranca con `rec_` ni `recsub_`', !id.startsWith('rec_') && !id.startsWith('recsub_'), id)
  check('dos ids seguidos son distintos', bridgeId() !== bridgeId())
}

console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${pass} ok, ${fail} fail\n`)
process.exit(fail === 0 ? 0 : 1)
