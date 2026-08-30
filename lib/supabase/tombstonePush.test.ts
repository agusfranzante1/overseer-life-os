/** npx tsx lib/supabase/tombstonePush.test.ts
 *
 *  El push tiene que RESPETAR los tombstones. Sin esto, un dispositivo con la
 *  app abierta re-subía con su upsert las filas que otro dispositivo — o Claude
 *  por el bridge MCP — había borrado, y el borrado se deshacía solo: la
 *  subtarea "volvía a aparecer" sin que nadie la recreara. */

import { isTombstoned } from './syncMerge'

let pass = 0, fail = 0
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label} ${extra}`) }
}

const T0 = Date.parse('2026-08-30T12:00:00Z')   // momento del borrado
const antes = '2026-08-30T11:00:00Z'
const despues = '2026-08-30T13:00:00Z'
const tombs = new Map<string, number>([['borrada', T0]])

console.log('\n1) Subtareas (no tienen updatedAt propio): cualquier tombstone las mata')
check('la borrada no se sube', isTombstoned(tombs, 'borrada'))
check('una que nadie borró sí se sube', !isTombstoned(tombs, 'viva'))

console.log('\n2) Tareas (tienen updatedAt): gana la más nueva')
check('borrada después de la última edición → no se sube', isTombstoned(tombs, 'borrada', antes))
check('editada DESPUÉS del borrado → se sube (la revivís a propósito)', !isTombstoned(tombs, 'borrada', despues))
check('sin tombstone se sube igual', !isTombstoned(tombs, 'otra', antes))

console.log('\n3) El caso real: Claude borra por el bridge y la app sigue abierta')
{
  // El store local todavía tiene la subtarea; el bridge ya la borró + tombstone.
  const subtasksLocales = ['paso-1', 'comprar-cuentas', 'paso-3']
  const borradaPorElBridge = new Map<string, number>([['comprar-cuentas', T0]])
  const loQueSeSube = subtasksLocales.filter((id) => !isTombstoned(borradaPorElBridge, id))
  check('el upsert ya no la incluye', !loQueSeSube.includes('comprar-cuentas'), loQueSeSube.join(','))
  check('las demás se siguen subiendo', loQueSeSube.length === 2, loQueSeSube.join(','))
}

console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${pass} ok, ${fail} fail\n`)
process.exit(fail === 0 ? 0 : 1)
