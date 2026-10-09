/** npx tsx lib/arca/comprobante.test.ts */
import {
  idComprobante, nombreTipo, numeroVisible, proximoNumero, numerosAImportar,
  correrMeses, mesesEntre, repetirBorrador, type ComprobanteFiscal,
} from './comprobante'

let pass = 0, fail = 0
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label} ${extra}`) }
}

const fiscal = (p: Partial<ComprobanteFiscal> = {}): ComprobanteFiscal => ({
  entorno: 'homologacion', puntoVenta: 3, tipo: 11, numero: 12,
  fecha: '2026-09-30', concepto: 2, docTipo: 80, docNro: '30710265522',
  importe: 150000, servicioDesde: '2026-09-01', servicioHasta: '2026-09-30',
  vencimientoPago: '2026-10-10', ...p,
})

console.log('\n1) Identidad del comprobante')
check('id determinista', idComprobante('produccion', 3, 11, 12) === 'arca_produccion_3_11_12')
check('el mismo comprobante da el MISMO id dos veces',
  idComprobante('homologacion', 1, 11, 7) === idComprobante('homologacion', 1, 11, 7))
check('homologación y producción NO comparten id',
  idComprobante('homologacion', 1, 11, 1) !== idComprobante('produccion', 1, 11, 1))
check('distinto punto de venta, distinto id',
  idComprobante('produccion', 1, 11, 5) !== idComprobante('produccion', 2, 11, 5))
check('distinto tipo, distinto id',
  idComprobante('produccion', 1, 11, 5) !== idComprobante('produccion', 1, 13, 5))

console.log('\n2) Cómo se muestra')
check('número como en el PDF', numeroVisible(3, 12) === '00003-00000012')
check('punto de venta largo no se recorta', numeroVisible(12345, 99999999) === '12345-99999999')
check('nombre de la factura C', nombreTipo(11) === 'Factura C')
check('nota de crédito', nombreTipo(13) === 'Nota de Crédito C')
check('un tipo que no conocemos no rompe', nombreTipo(201).includes('201'))

console.log('\n3) El número que sigue')
check('después del 12 va el 13', proximoNumero(12) === 13)
check('sin comprobantes previos, el 1', proximoNumero(0) === 1)
check('un último negativo (no debería pasar) no da 0 ni negativo', proximoNumero(-5) === 1)

console.log('\n4) Qué números pedirle a ARCA para traer el historial')
check('arranca por los más nuevos',
  JSON.stringify(numerosAImportar(5, new Set())) === JSON.stringify([5, 4, 3, 2, 1]))
check('no pide los que ya tengo',
  JSON.stringify(numerosAImportar(5, new Set([4, 2]))) === JSON.stringify([5, 3, 1]))
check('ya tengo todo → no pide nada', numerosAImportar(3, new Set([1, 2, 3])).length === 0)
check('sin nada emitido tampoco pide', numerosAImportar(0, new Set()).length === 0)
check('respeta el tope del lote', numerosAImportar(1000, new Set(), 10).length === 10)
check('el tope empieza por el más nuevo', numerosAImportar(1000, new Set(), 3)[0] === 1000)
check('nunca pide el número 0', !numerosAImportar(2, new Set()).includes(0))

console.log('\n5) Correr fechas de mes (abono mensual)')
check('1 de septiembre → 1 de octubre', correrMeses('2026-09-01', 1) === '2026-10-01')
check('fin de mes sigue siendo fin de mes: 30/9 → 31/10', correrMeses('2026-09-30', 1) === '2026-10-31')
check('31 de enero → 28 de febrero (no se va a marzo)', correrMeses('2026-01-31', 1) === '2026-02-28')
check('año bisiesto: 31/1/2028 → 29/2/2028', correrMeses('2028-01-31', 1) === '2028-02-29')
check('cruza el año: diciembre → enero', correrMeses('2026-12-15', 1) === '2027-01-15')
check('correr 0 meses no cambia nada', correrMeses('2026-05-17', 0) === '2026-05-17')
check('correr hacia atrás', correrMeses('2026-03-10', -2) === '2026-01-10')
check('un día del medio no se mueve al fin de mes', correrMeses('2026-01-15', 1) === '2026-02-15')
check('meses entre septiembre y octubre', mesesEntre('2026-09-30', '2026-10-05') === 1)
check('mismo mes → 0', mesesEntre('2026-10-01', '2026-10-31') === 0)
check('cruzando el año', mesesEntre('2026-11-01', '2027-02-01') === 3)

console.log('\n6) Repetir una factura')
{
  const r = repetirBorrador(fiscal(), '2026-10-09')
  check('copia el importe', r.importe === 150000)
  check('copia el receptor', r.docNro === '30710265522' && r.docTipo === 80)
  check('copia el punto de venta y el tipo', r.puntoVenta === 3 && r.tipo === 11)
  check('NO copia el número (lo pone ARCA)', !('numero' in r))
  check('NO copia el CAE', !('cae' in r))
  check('la fecha pasa a ser hoy', r.fecha === '2026-10-09')
  check('el período se corre al mes nuevo', r.servicioDesde === '2026-10-01')
  check('y respeta el fin de mes: 30/9 → 31/10', r.servicioHasta === '2026-10-31')
  check('el vencimiento conserva sus 10 días de distancia', r.vencimientoPago === '2026-11-10')
}
{
  // El caso que importa de verdad: repetir el abono dentro del MISMO mes no
  // tiene que correr el período (si no, se factura octubre dos veces y el
  // segundo dice noviembre).
  const r = repetirBorrador(fiscal({ fecha: '2026-10-01', servicioDesde: '2026-10-01', servicioHasta: '2026-10-31', vencimientoPago: '2026-11-10' }), '2026-10-09')
  check('mismo mes → el período NO se mueve', r.servicioDesde === '2026-10-01' && r.servicioHasta === '2026-10-31')
  check('y el vencimiento tampoco', r.vencimientoPago === '2026-11-10')
}
{
  const r = repetirBorrador(fiscal({ concepto: 1, servicioDesde: undefined, servicioHasta: undefined, vencimientoPago: undefined }), '2026-10-09')
  check('una factura de productos no inventa fechas de servicio',
    r.servicioDesde === undefined && r.servicioHasta === undefined && r.vencimientoPago === undefined)
  check('pero sí se fecha hoy', r.fecha === '2026-10-09')
}
{
  // Tres meses después: el salto es de tres meses, no de uno.
  const r = repetirBorrador(fiscal({ fecha: '2026-07-31', servicioDesde: '2026-07-01', servicioHasta: '2026-07-31' }), '2026-10-09')
  check('tres meses de atraso corren tres meses', r.servicioDesde === '2026-10-01' && r.servicioHasta === '2026-10-31')
}
{
  // Un período que NO es un mes calendario (quincena) conserva su forma.
  const r = repetirBorrador(fiscal({ fecha: '2026-09-15', servicioDesde: '2026-09-01', servicioHasta: '2026-09-15', vencimientoPago: '2026-09-20' }), '2026-10-02')
  check('una quincena sigue siendo quincena', r.servicioDesde === '2026-10-01' && r.servicioHasta === '2026-10-15')
  check('y su vencimiento mantiene los 5 días', r.vencimientoPago === '2026-10-20')
}
{
  // Sin vencimiento de pago original no se inventa uno.
  const r = repetirBorrador(fiscal({ vencimientoPago: undefined }), '2026-10-09')
  check('sin vencimiento original, sigue sin vencimiento', r.vencimientoPago === undefined)
}

console.log('\n7) Repetir también repite lo NUESTRO')
{
  // El cliente y el detalle son justo lo que no se quiere volver a escribir
  // cuando se factura siempre lo mismo. No viajan a ARCA, pero se repiten.
  const r = repetirBorrador(
    { ...fiscal(), descripcion: 'Abono mensual', receptorNombre: 'Estudio Pérez' }, '2026-10-09')
  check('repite el detalle', r.descripcion === 'Abono mensual')
  check('repite el cliente', r.receptorNombre === 'Estudio Pérez')
}
{
  const r = repetirBorrador(fiscal(), '2026-10-09')
  check('sin notas previas no inventa ninguna',
    r.descripcion === undefined && r.receptorNombre === undefined)
}

console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${pass} ok, ${fail} fail\n`)
process.exit(fail === 0 ? 0 : 1)
