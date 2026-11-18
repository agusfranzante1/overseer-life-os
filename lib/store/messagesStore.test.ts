/** Helpers puros de Mensajes para Claude. Correr: npx tsx lib/store/messagesStore.test.ts */
import { destinos, filtrarMensajes, ordenarMensajes, type MensajeClaude } from './messagesStore'

let ok = 0, fail = 0
const t = (n: string, c: boolean) => { if (c) ok++; else { fail++; console.log('  ✗ ' + n) } }

const mk = (p: Partial<MensajeClaude> & { id: string }): MensajeClaude => ({
  para: 'Karla Final', texto: 'hola', fecha: '2026-11-18', origen: 'voz', estado: 'pendiente',
  createdAt: '2026-11-18T10:00:00Z', updatedAt: '2026-11-18T10:00:00Z', ...p,
})

const lista = [
  mk({ id: 'a', para: 'Karla Final', texto: 'Revisá el cartero', createdAt: '2026-11-18T09:00:00Z' }),
  mk({ id: 'b', para: 'karla final', texto: 'Otro', estado: 'entregado', createdAt: '2026-11-18T11:00:00Z' }),
  mk({ id: 'c', para: 'Overseer', texto: 'Arreglá los mapas', createdAt: '2026-11-18T12:00:00Z' }),
  mk({ id: 'd', para: '  ', texto: 'sin destino' }),
]

console.log('\n1) Destinos')
{
  const d = destinos(lista)
  t('sin repetir por mayúsculas', d.length === 2)
  t('alfabético', d[0] === 'Karla Final' && d[1] === 'Overseer')
  t('los vacíos no entran', !d.includes(''))
}

console.log('\n2) Filtros')
t('solo pendientes', filtrarMensajes(lista, { estado: 'pendiente' }).length === 3)
t('solo entregados', filtrarMensajes(lista, { estado: 'entregado' }).map((m) => m.id).join() === 'b')
t('por destino sin distinguir mayúsculas', filtrarMensajes(lista, { para: 'KARLA FINAL' }).length === 2)
t('búsqueda en el texto', filtrarMensajes(lista, { query: 'mapas' }).map((m) => m.id).join() === 'c')
t('búsqueda en el destino', filtrarMensajes(lista, { query: 'overseer' }).length === 1)
t('"todos" no filtra', filtrarMensajes(lista, { estado: 'todos', para: 'todos' }).length === 4)

console.log('\n3) Orden')
{
  const o = ordenarMensajes(lista)
  t('los pendientes arriba', o.slice(0, 3).every((m) => m.estado === 'pendiente'))
  t('el entregado al fondo', o[3].id === 'b')
  t('adentro del grupo, lo más nuevo primero', o[0].id === 'c')
}

console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${ok} ok, ${fail} fail\n`)
process.exit(fail === 0 ? 0 : 1)
