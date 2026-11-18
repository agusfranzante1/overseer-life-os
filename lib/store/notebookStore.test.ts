/** Cuaderno: helpers puros + acciones del store. Correr: npx tsx lib/store/notebookStore.test.ts */
import {
  sanitizeHoja, indiceCuaderno, correrDia, resumenHoja, hojaTieneAlgo, idDia,
  useNotebookStore, sanitizeTapa, TAPA_DEFAULT, type HojaCuaderno,
} from './notebookStore'
import { enderezar } from '../../components/notebook/HojaLibre'
import { encajarRect, rectInicial, migrarUi, useNotebookUiStore } from './notebookUiStore'

let ok = 0, fail = 0
const t = (n: string, c: boolean) => { if (c) ok++; else { fail++; console.log('  ✗ ' + n) } }

const mk = (p: Partial<HojaCuaderno> & { id: string }): HojaCuaderno => ({
  tipo: 'dia', fecha: '2026-11-18', titulo: '', texto: '', papel: 'renglones', stickies: [], bloques: [], trazos: [],
  createdAt: '2026-11-18T10:00:00Z', updatedAt: '2026-11-18T10:00:00Z', ...p,
})

console.log('\n1) sanitize del pull (BASE nº2: lo que no está acá se borra)')
{
  const h = mk({
    id: 'nb_dia_2026-11-18', texto: 'hola', papel: 'puntos', titulo: 'x',
    stickies: [{ id: 's1', texto: 'comprar', color: 'rosa', x: 0.4, y: 120, rot: 2 }],
  })
  const s = sanitizeHoja(JSON.parse(JSON.stringify(h)))
  const ord = (o: object) => JSON.stringify(o, Object.keys(o).sort().concat(['id','texto','color','x','y','rot']))
  t('round-trip idéntico', ord(s) === ord(h))
  const raro = sanitizeHoja({ id: 'a', papel: 'papiro', tipo: 'otra', fecha: 'ayer', createdAt: '2026-01-02T00:00:00Z',
    stickies: [{ id: 's', color: 'negro', x: 7, y: -3, rot: 90 }, null, { texto: 'sin id' }] })
  t('papel desconocido → renglones', raro.papel === 'renglones')
  t('tipo desconocido → dia', raro.tipo === 'dia')
  t('fecha inválida → la de createdAt', raro.fecha === '2026-01-02')
  t('sticky sin id se descarta', raro.stickies.length === 1)
  t('color desconocido → amarillo', raro.stickies[0].color === 'amarillo')
  t('x se topea a 1, y a 0, rot a 4', raro.stickies[0].x === 1 && raro.stickies[0].y === 0 && raro.stickies[0].rot === 4)
  t('payload vacío no explota', sanitizeHoja(undefined).id === '' && sanitizeHoja(null).stickies.length === 0)
}

console.log('\n2) Índice')
{
  const hojas = [
    mk({ id: 'd1', fecha: '2026-11-16', texto: 'a' }),
    mk({ id: 'd2', fecha: '2026-11-18', texto: 'b' }),
    mk({ id: 'd3', fecha: '2026-11-17' }), // vacía: solo se miró
    mk({ id: 'n1', tipo: 'nota', titulo: 'Ideas', updatedAt: '2026-11-18T09:00:00Z' }),
    mk({ id: 'n2', tipo: 'nota', texto: 'lista', updatedAt: '2026-11-18T12:00:00Z' }),
  ]
  const { dias, notas } = indiceCuaderno(hojas)
  t('días más nuevos primero', dias.map((h) => h.id).join() === 'd2,d1')
  t('el día vacío no aparece', !dias.some((h) => h.id === 'd3'))
  t('notas por última edición', notas.map((h) => h.id).join() === 'n2,n1')
  t('una nota con solo título cuenta', hojaTieneAlgo(hojas[3]))
}

console.log('\n3) Fechas en calendario local')
t('suma un día', correrDia('2026-11-18', 1) === '2026-11-19')
t('cruza mes', correrDia('2026-11-30', 1) === '2026-12-01')
t('cruza año hacia atrás', correrDia('2026-01-01', -1) === '2025-12-31')
t('bisiesto', correrDia('2028-02-28', 1) === '2028-02-29')

console.log('\n4) Resumen')
t('primera línea con texto', resumenHoja(mk({ id: 'a', texto: '\n\n  Hola mundo \nchau' })) === 'Hola mundo')
t('corta largo', resumenHoja(mk({ id: 'a', texto: 'x'.repeat(100) }), 10).length === 10)
t('solo stickies', resumenHoja(mk({ id: 'a', stickies: [{ id: 's', texto: '', color: 'rosa', x: 0, y: 0, rot: 0 }] })) === '1 nota pegada')

console.log('\n5) Store: el diario se crea al escribir y converge por id')
{
  const st = useNotebookStore.getState()
  useNotebookStore.setState({ hojas: [] })
  st.editarDia('2026-11-18', { texto: 'primera' }, 'puntos')
  let hojas = useNotebookStore.getState().hojas
  t('crea UNA hoja con id determinista', hojas.length === 1 && hojas[0].id === idDia('2026-11-18'))
  t('con el papel por default', hojas[0].papel === 'puntos')
  const antes = hojas[0].updatedAt
  st.editarDia('2026-11-18', { texto: 'segunda' }, 'liso')
  hojas = useNotebookStore.getState().hojas
  t('la segunda escritura NO crea otra', hojas.length === 1 && hojas[0].texto === 'segunda')
  t('no le cambia el papel', hojas[0].papel === 'puntos')
  t('bumpea updatedAt', hojas[0].updatedAt >= antes)
  const sid = st.agregarSticky(hojas[0].id, { texto: '', color: 'verde', x: 0.2, y: 60, rot: 1 })
  st.editarSticky(hojas[0].id, sid, { texto: 'llamar', y: 200 })
  const sk = useNotebookStore.getState().hojas[0].stickies[0]
  t('sticky editada', sk.texto === 'llamar' && sk.y === 200 && sk.color === 'verde')
  st.borrarSticky(hojas[0].id, sid)
  t('sticky borrada', useNotebookStore.getState().hojas[0].stickies.length === 0)
  const nid = st.crearNota('cuadricula', 'Compras')
  t('nota nueva arriba', useNotebookStore.getState().hojas[0].id === nid && useNotebookStore.getState().hojas[0].tipo === 'nota')
  st.borrarHoja(nid)
  t('nota borrada', useNotebookStore.getState().hojas.length === 1)
}

console.log('\n6) Ventana flotante adentro de la pantalla')
{
  const r = encajarRect({ x: 1800, y: 900, w: 700, h: 600 }, 1366, 768)
  t('vuelve adentro (PC → notebook)', r.x + r.w <= 1366 - 8 && r.y + r.h <= 768 - 8 && r.x >= 8 && r.y >= 8)
  const chico = encajarRect({ x: 0, y: 0, w: 50, h: 50 }, 1366, 768)
  t('tamaño mínimo', chico.w === 320 && chico.h === 420)
  const ini = rectInicial(1920, 1080)
  t('arranca contra el borde derecho', ini.x + ini.w === 1920 - 36)
  t('proporción A5', Math.abs(ini.h / ini.w - 1.41) < 0.02)
  t('entra en una notebook chica', (() => { const r = rectInicial(1280, 650); return r.y >= 8 && r.y + r.h <= 642 })())
}

console.log('\n7) Tapa')
{
  t('tapa válida se conserva', JSON.stringify(sanitizeTapa({ color: 'bosque', estilo: 'tela', nombre: 'Agus' })) === JSON.stringify({ color: 'bosque', estilo: 'tela', nombre: 'Agus' }))
  t('color desconocido → default', sanitizeTapa({ color: 'fucsia' }).color === TAPA_DEFAULT.color)
  t('nombre topeado a 40', sanitizeTapa({ nombre: 'x'.repeat(90) }).nombre.length === 40)
  t('payload vacío → default', JSON.stringify(sanitizeTapa(undefined)) === JSON.stringify(TAPA_DEFAULT))
  useNotebookStore.getState().setTapa({ color: 'rosa' })
  t('setTapa mergea', useNotebookStore.getState().tapa.color === 'rosa' && useNotebookStore.getState().tapa.estilo === 'cuero')
}

console.log('\n8) La ventana vieja (v0) pasa al cuaderno flotante')
{
  const mig = migrarUi
  const a = mig({ modo: 'lateral', flotante: null, papelDefault: 'puntos' }, 0) as unknown as Record<string, unknown>
  t('lateral → abierto', a.modo === 'abierto' && a.rect === null && a.papelDefault === 'puntos')
  const b = mig({ modo: 'flotante', flotante: { x: 10, y: 20, w: 500, h: 600 } }, 0) as unknown as Record<string, unknown>
  t('flotante conserva la posición', b.modo === 'abierto' && JSON.stringify(b.rect) === JSON.stringify({ x: 10, y: 20, w: 500, h: 600 }))
  const c = mig({ modo: 'cerrado' }, 0) as unknown as Record<string, unknown>
  t('cerrado → oculto', c.modo === 'oculto')
  const u = useNotebookUiStore.getState()
  u.set({ modo: 'abierto' }); u.esconder()
  t('esconder recuerda abierto', useNotebookUiStore.getState().modo === 'oculto' && useNotebookUiStore.getState().ultimoVisible === 'abierto')
  useNotebookUiStore.getState().mostrar()
  t('mostrar vuelve a abierto', useNotebookUiStore.getState().modo === 'abierto')
}

console.log('\n9) Texto en cualquier renglón y líneas con regla')
{
  const h = sanitizeHoja({ id: 'a', bloques: [{ id: 'b1', x: 0.4, y: 240, texto: 'acá' }, { x: 1 }], trazos: [{ id: 't1', x1: 0.1, y1: 89.5, x2: 0.9, y2: 89.5, tinta: 'rojo' }, { id: 't2', x1: 3, y1: -4, x2: 0, y2: 0, tinta: 'dorado' }] })
  t('bloque sobrevive al pull (BASE nº2)', h.bloques.length === 1 && h.bloques[0].texto === 'acá' && h.bloques[0].y === 240)
  t('trazo sobrevive al pull', h.trazos[0].tinta === 'rojo' && h.trazos[0].y1 === 89.5)
  t('trazo raro se acota', h.trazos[1].x1 === 1 && h.trazos[1].y1 === 0 && h.trazos[1].tinta === 'tinta')
  t('hoja sin bloques (versión vieja) → listas vacías', sanitizeHoja({ id: 'v' }).bloques.length === 0 && sanitizeHoja({ id: 'v' }).trazos.length === 0)
  t('una hoja con solo una línea cuenta', hojaTieneAlgo(mk({ id: 'x', trazos: [{ id: 't', x1: 0, y1: 0, x2: 1, y2: 0, tinta: 'azul' }] })))
  t('resumen usa el texto suelto si arriba está vacío', resumenHoja(mk({ id: 'x', bloques: [{ id: 'b', x: 0.5, y: 300, texto: 'abajo' }, { id: 'c', x: 0.1, y: 120, texto: 'arriba' }] })) === 'arriba')


  const casiH = enderezar({ x: 10, y: 92 }, { x: 300, y: 100 })
  t('casi horizontal → horizontal', casiH.a.y === casiH.b.y)
  t('y se apoya en el renglón cercano', casiH.a.y === 89.5)
  const lejos = enderezar({ x: 10, y: 105 }, { x: 300, y: 106 })
  t('lejos del renglón no se mueve', lejos.a.y === 105 && lejos.b.y === 105)
  const casiV = enderezar({ x: 50, y: 10 }, { x: 54, y: 300 })
  t('casi vertical → vertical', casiV.b.x === 50)
  const diag = enderezar({ x: 0, y: 0 }, { x: 100, y: 100 })
  t('diagonal queda como está', diag.b.x === 100 && diag.b.y === 100)

  useNotebookStore.setState({ hojas: [] })
  const st = useNotebookStore.getState()
  st.editarDia('2026-11-20', {}, 'renglones')
  const id = idDia('2026-11-20')
  const b = st.agregarBloque(id, { x: 0.3, y: 180, texto: '' })
  st.editarBloque(id, b, { texto: 'turno' })
  st.agregarTrazo(id, { x1: 0.1, y1: 89.5, x2: 0.8, y2: 89.5, tinta: 'azul' })
  const hh = useNotebookStore.getState().hojas[0]
  t('bloque y trazo guardados', hh.bloques[0].texto === 'turno' && hh.trazos.length === 1)
  st.borrarTrazo(id, hh.trazos[0].id); st.borrarBloque(id, b)
  const h2 = useNotebookStore.getState().hojas[0]
  t('se borran', h2.bloques.length === 0 && h2.trazos.length === 0)
}

console.log(`\n${ok} ok, ${fail} fallaron`)
if (fail) process.exit(1)
