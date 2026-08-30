/** npx tsx lib/notifications/timeWindow.test.ts
 *
 *  Fija el cambio de criterio del dispatcher: de "¿estamos dentro de los 5
 *  minutos del horario target?" a "¿ya pasó la hora y todavía no se mandó?".
 *  El motivo está medido: el cron de GitHub Actions corrió con intervalos de
 *  111 a 700 minutos, así que la ventana de 5 min casi nunca acertaba. */

import { withinWindow, shouldFireDaily, shouldFireUntil, minutesUntil, CATCH_UP_MIN } from './timeWindow'

let pass = 0, fail = 0
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label} ${extra}`) }
}

console.log('\n1) Recordatorio de hora fija: se dispara aunque el cron llegue tarde')
check('justo a la hora (21:00)', shouldFireDaily(21, 0, 21, 0))
check('2 min después', shouldFireDaily(21, 2, 21, 0))
check('90 min después (el cron se atrasó)', shouldFireDaily(22, 30, 21, 0))
check('5 h después, todavía dentro del catch-up', shouldFireDaily(2 + 24 - 24, 0, 21, 0) === false, 'cruzar medianoche NO')
check('5 h 59 después de las 09:00', shouldFireDaily(14, 59, 9, 0))
check('6 h 01 después ya no (es ruido a destiempo)', !shouldFireDaily(15, 1, 9, 0))
check('antes de la hora, no', !shouldFireDaily(20, 59, 21, 0))

console.log('\n2) No cruza medianoche (la dedupe key es por día local)')
check('23:58 target, 00:02 del día siguiente → NO', !shouldFireDaily(0, 2, 23, 58))
check('23:58 target, 23:59 → sí', shouldFireDaily(23, 59, 23, 58))

console.log('\n3) El escenario real: cron cada 2-11 h contra un recordatorio a las 21:00')
{
  // Horas reales de corrida tomadas de los últimos runs del workflow.
  const corridas: Array<[number, number]> = [[19, 54], [17, 21], [13, 0], [7, 17], [1, 29], [23, 25], [21, 17]]
  const conVentanaVieja = corridas.filter(([h, m]) => withinWindow(h, m, 21, 0, 5)).length
  const conCatchUp = corridas.filter(([h, m]) => shouldFireDaily(h, m, 21, 0)).length
  check('con la ventana de 5 min no acertaba casi ninguna', conVentanaVieja <= 1, String(conVentanaVieja))
  check('con catch-up alguna corrida lo agarra', conCatchUp >= 1, String(conCatchUp))
}

console.log('\n4) Aviso de tarea: vale hasta el vencimiento, no 5 minutos')
{
  const due = new Date('2026-08-30T15:00:00Z')
  const fire = new Date('2026-08-30T14:00:00Z')   // lead 60 min
  check('a la hora de disparo', shouldFireUntil(new Date('2026-08-30T14:00:00Z'), fire, due))
  check('40 min tarde (el cron se atrasó) todavía sirve', shouldFireUntil(new Date('2026-08-30T14:40:00Z'), fire, due))
  check('justo al vencer', shouldFireUntil(new Date('2026-08-30T15:00:00Z'), fire, due))
  check('ya vencida → no (de eso se ocupa task_overdue)', !shouldFireUntil(new Date('2026-08-30T15:01:00Z'), fire, due))
  check('antes del disparo → no', !shouldFireUntil(new Date('2026-08-30T13:59:00Z'), fire, due))
}

console.log('\n5) El texto usa los minutos REALES que faltan, no el lead configurado')
{
  const due = new Date('2026-08-30T15:00:00Z')
  check('60 min antes → 60', minutesUntil(new Date('2026-08-30T14:00:00Z'), due) === 60)
  check('aviso atrasado 40 min → dice 20, no 60', minutesUntil(new Date('2026-08-30T14:40:00Z'), due) === 20)
  check('nunca negativo', minutesUntil(new Date('2026-08-30T15:30:00Z'), due) === 0)
}

console.log('\n6) El catch-up es de 6 h')
check('CATCH_UP_MIN = 360', CATCH_UP_MIN === 360, String(CATCH_UP_MIN))

console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${pass} ok, ${fail} fail\n`)
process.exit(fail === 0 ? 0 : 1)
