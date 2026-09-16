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

type Row = { id: string; updated_at: string }
const VIEJO = '2026-09-01T00:00:00Z'
function fakeSb(remote: string[] | Record<string, string>) {
  const borrados: string[] = []
  const rows: Row[] = Array.isArray(remote)
    ? remote.map((id) => ({ id, updated_at: VIEJO }))
    : Object.entries(remote).map(([id, updated_at]) => ({ id, updated_at }))
  const sb = {
    from: () => ({
      select: () => ({ eq: async () => ({ data: rows }) }),
      delete: () => ({ eq: () => ({ in: async (_c: string, ids: string[]) => { borrados.push(...ids); return {} } }) }),
    }),
  }
  return { sb: sb as never, borrados }
}
// Esta pestaña pulleó el 11/09 al mediodía. Las filas "viejas" son de antes.
const PULL = Date.parse('2026-09-11T12:00:00Z')

const run = async () => {
  // 1 · El caso REAL: 8 en baseline, 4 en local → 4 a borrar = 50% ≥ 40% y ≥ 4.
  {
    const base = new Set(['a','b','c','d','e','f','g','h'])
    const { sb, borrados } = fakeSb([...base])
    const r = await reconcileDeletes(sb, 'mindmap_folders', 'u1', ['a','b','c','d'], base, 'id', PULL)
    t('borrado masivo: no borra nada', borrados.length === 0)
    t('borrado masivo: NO devuelve nada para tombstonear', r.length === 0)
  }
  // 2 · Local vacío (store que no rehidrató): ni borra ni tombstonea.
  {
    const base = new Set(['a','b','c'])
    const { sb, borrados } = fakeSb([...base])
    const r = await reconcileDeletes(sb, 'mindmaps', 'u1', [], base, 'id', PULL)
    t('local vacío: no borra', borrados.length === 0)
    t('local vacío: no tombstonea', r.length === 0)
  }
  // 3 · Un borrado REAL de a uno sigue funcionando y SÍ se tombstonea.
  {
    const base = new Set(['a','b','c','d','e'])
    const { sb, borrados } = fakeSb([...base])
    const r = await reconcileDeletes(sb, 'mindmaps', 'u1', ['a','b','c','d'], base, 'id', PULL)
    t('borrado de a uno: borra', borrados.join() === 'e')
    t('borrado de a uno: tombstonea exactamente eso', r.join() === 'e')
  }
  // 4 · Lo que no existe en remoto no se tombstonea (lápida fantasma).
  {
    const base = new Set(['a','b','c','d','e'])
    const { sb } = fakeSb(['a','b','c','d'])          // 'e' ya no está en la nube
    const r = await reconcileDeletes(sb, 'mindmaps', 'u1', ['a','b','c','d'], base, 'id', PULL)
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
  // 6 · EL CASO DEL 12/09: la pestaña pulleó el 11 al mediodía; el bridge creó
  //     3 tareas después; otra pestaña pulleó y metió esas 3 en el baseline
  //     compartido. Esta pestaña pushea con su store viejo → 3 candidatas.
  {
    const base = new Set(['t1','t2','t3','plantilla','limpieza','pilates'])
    const { sb, borrados } = fakeSb({
      t1: VIEJO, t2: VIEJO, t3: VIEJO,
      plantilla: '2026-09-11T20:00:00Z', limpieza: '2026-09-11T21:00:00Z', pilates: '2026-09-11T21:30:00Z',
    })
    const r = await reconcileDeletes(sb, 'tasks', 'u1', ['t1','t2','t3'], base, 'id', PULL)
    t('12/09: las 3 del bridge NO se borran (más nuevas que mi pull)', borrados.length === 0 && r.length === 0)
  }
  // 7 · Un borrado REAL de una fila vieja sigue andando aunque haya nuevas al lado.
  {
    const base = new Set(['t1','t2','t3','nueva'])
    const { sb, borrados } = fakeSb({ t1: VIEJO, t2: VIEJO, t3: VIEJO, nueva: '2026-09-11T20:00:00Z' })
    const r = await reconcileDeletes(sb, 'tasks', 'u1', ['t1','t2'], base, 'id', PULL)
    t('borrado real de fila vieja: borra t3, protege la nueva', borrados.join() === 't3' && r.join() === 't3')
  }
  // 8 · Pestaña que NUNCA pulleó (pulledAtMs undefined): no borra nada.
  {
    const base = new Set(['t1','t2','t3','t4','t5'])
    const { sb, borrados } = fakeSb(['t1','t2','t3','t4','t5'])
    const r = await reconcileDeletes(sb, 'tasks', 'u1', ['t1','t2','t3','t4'], base)
    t('sin pull previo en esta pestaña: no borra', borrados.length === 0 && r.length === 0)
  }
  console.log(`\n${ok}/${ok + fail} OK`)
  if (fail) process.exit(1)
}
run()
