/** npx tsx lib/utils/navOrder.test.ts */
import { mergeNavOrder } from './navOrder'

let pass = 0, fail = 0
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label} ${extra}`) }
}

// El orden del código (NAV_ITEMS), con la sección nueva abajo de journal.
const REF = ['dashboard', 'spi', 'lab', 'journal', 'decisiones', 'youtube', 'tasks', 'settings']

console.log('\n1) EL CASO: una sección nueva cae en su lugar, no al fondo')
{
  // El usuario reordenó su menú en algún momento; 'decisiones' no existe ahí.
  const saved = ['dashboard', 'tasks', 'journal', 'spi', 'lab', 'youtube', 'settings']
  const out = mergeNavOrder(saved, REF)
  check('entra JUSTO DESPUÉS de journal', out[out.indexOf('journal') + 1] === 'decisiones', out.join(','))
  check('no queda al final', out[out.length - 1] !== 'decisiones', out.join(','))
  check('no se pierde ninguna', out.length === saved.length + 1)
  check('respeta el orden que eligió el usuario',
    out.filter((k) => k !== 'decisiones').join(',') === saved.join(','), out.join(','))
}

console.log('\n2) Sin nada guardado, manda el orden del código')
check('vacío → referencia', mergeNavOrder([], REF).join(',') === REF.join(','))

console.log('\n3) Higiene del orden guardado')
check('descarta claves que ya no existen',
  !mergeNavOrder(['dashboard', 'seccion-vieja', 'journal'], REF).includes('seccion-vieja'))
check('descarta repetidos',
  mergeNavOrder(['journal', 'journal', 'dashboard'], REF).filter((k) => k === 'journal').length === 1)
check('nada se duplica en general', (() => {
  const out = mergeNavOrder(['tasks', 'dashboard'], REF)
  return new Set(out).size === out.length
})())
check('aparecen TODAS las del código', (() => {
  const out = mergeNavOrder(['tasks'], REF)
  return REF.every((k) => out.includes(k))
})())

console.log('\n4) Bordes')
{
  // Si el vecino anterior está oculto/ausente, sube al anterior-anterior.
  const out = mergeNavOrder(['dashboard', 'spi', 'youtube', 'tasks'], REF)
  check('sin journal, se cuelga del anterior que SÍ está (spi)',
    out[out.indexOf('spi') + 1] === 'lab' || out.indexOf('decisiones') > out.indexOf('spi'), out.join(','))
  check('queda antes de youtube (su posición relativa)',
    out.indexOf('decisiones') < out.indexOf('youtube'), out.join(','))
}
{
  // La PRIMERA del código no tiene anteriores: cae al final (el de siempre).
  const out = mergeNavOrder(['journal', 'tasks'], ['dashboard', 'journal', 'tasks'])
  check('la primera sin anteriores no rompe nada', out.includes('dashboard') && out.length === 3, out.join(','))
}
check('referencia vacía → devuelve vacío', mergeNavOrder(['a', 'b'], []).length === 0)
{
  const saved = [...REF]
  check('si ya está todo, no cambia nada', mergeNavOrder(saved, REF).join(',') === REF.join(','))
}

console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${pass} ok, ${fail} fail\n`)
process.exit(fail === 0 ? 0 : 1)
