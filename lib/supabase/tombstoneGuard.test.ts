/** El bug del 08/09: la guarda anti-borrado-masivo salvaba las filas en la nube
 *  pero `writeTombstones` corría igual con la lista COMPLETA, así que las filas
 *  quedaban vivas y con lápida — y ningún cliente las volvía a ver. Le pasó a
 *  las carpetas de mapas: 8 filas presentes en Supabase, 0 visibles en la app.
 *
 *  Lo que se fija acá: `reconcileDeletes` devuelve lo que REALMENTE borró, y
 *  ese es el único input de los tombstones. */
import { reconcileDeletes, isTombstoned } from './syncMerge'

let ok = 0, fail = 0
const t = (n: string, c: boolean) => { if (c) { ok++ } else { fail++; console.log('  ✗ ' + n) } }

type Row = { id: string }
function fakeSb(remote: string[]) {
  const borrados: string[] = []
  const sb = {
    from: () => ({
      select: () => ({ eq: async () => ({ data: remote.map((id): Row => ({ id })) }) }),
      delete: () => ({ eq: () => ({ in: async (_c: string, ids: string[]) => { borrados.push(...ids); return {} } }) }),
    }),
  }
  return { sb: sb as never, borrados }
}

const run = async () => {
  // 1 · El caso REAL: 8 en baseline, 4 en local → 4 a borrar = 50% ≥ 40% y ≥ 4.
  {
    const base = new Set(['a','b','c','d','e','f','g','h'])
    const { sb, borrados } = fakeSb([...base])
    const r = await reconcileDeletes(sb, 'mindmap_folders', 'u1', ['a','b','c','d'], base)
    t('borrado masivo: no borra nada', borrados.length === 0)
    t('borrado masivo: NO devuelve nada para tombstonear', r.length === 0)
  }
  // 2 · Local vacío (store que no rehidrató): ni borra ni tombstonea.
  {
    const base = new Set(['a','b','c'])
    const { sb, borrados } = fakeSb([...base])
    const r = await reconcileDeletes(sb, 'mindmaps', 'u1', [], base)
    t('local vacío: no borra', borrados.length === 0)
    t('local vacío: no tombstonea', r.length === 0)
  }
  // 3 · Un borrado REAL de a uno sigue funcionando y SÍ se tombstonea.
  {
    const base = new Set(['a','b','c','d','e'])
    const { sb, borrados } = fakeSb([...base])
    const r = await reconcileDeletes(sb, 'mindmaps', 'u1', ['a','b','c','d'], base)
    t('borrado de a uno: borra', borrados.join() === 'e')
    t('borrado de a uno: tombstonea exactamente eso', r.join() === 'e')
  }
  // 4 · Lo que no existe en remoto no se tombstonea (lápida fantasma).
  {
    const base = new Set(['a','b','c','d','e'])
    const { sb } = fakeSb(['a','b','c','d'])          // 'e' ya no está en la nube
    const r = await reconcileDeletes(sb, 'mindmaps', 'u1', ['a','b','c','d'], base)
    t('id fantasma: no se tombstonea', r.length === 0)
  }
  // 5 · Y por qué importa: una fila con lápida MÁS VIEJA que su updatedAt vive.
  {
    const tomb = new Map([['x', Date.parse('2026-09-08T20:00:00Z')]])
    t('lápida vieja + fila nueva → sobrevive',
      !isTombstoned(tomb, 'x', '2026-09-08T21:00:00Z'))
    t('lápida nueva + fila vieja → muere',
      isTombstoned(tomb, 'x', '2026-09-08T19:00:00Z'))
  }
  console.log(`\n${ok}/${ok + fail} OK`)
  if (fail) process.exit(1)
}
run()
