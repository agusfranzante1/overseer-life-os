/** npx tsx lib/arca/facturaC.test.ts */
import {
  CBTE, CONCEPTO, DOC, CONDICION_IVA, CONDICIONES_IVA_C, condicionIvaPorDefecto,
  cuitValido, validarFacturaC, armarDetalleC, aFechaArca,
  type BorradorFacturaC,
} from './facturaC'
import { buildTRA, isoConOffset, parseLoginTicketResponse } from './tra'

let pass = 0, fail = 0
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label} ${extra}`) }
}
const HOY = '2026-10-09'
const base = (p: Partial<BorradorFacturaC> = {}): BorradorFacturaC => ({
  puntoVenta: 1, tipo: CBTE.facturaC, concepto: CONCEPTO.servicios,
  docTipo: DOC.cuit, docNro: '30710265522', importe: 150000,
  condicionIvaReceptor: CONDICION_IVA.responsableInscripto,
  fecha: HOY, servicioDesde: '2026-10-01', servicioHasta: '2026-10-31',
  vencimientoPago: '2026-11-10', ...p,
})

console.log('\n1) CUIT con dígito verificador')
check('CUIT de empresa válido', cuitValido('30710265522'))
check('CUIL de persona válido', cuitValido('20409378995'))
check('con guiones también', cuitValido('30-71026552-2'))
check('un dígito cambiado NO valida', !cuitValido('30710265521'))
check('10 dígitos no alcanza', !cuitValido('3071026552'))
check('todos iguales no valida', !cuitValido('11111111111'))
check('texto vacío no valida', !cuitValido(''))

console.log('\n2) El borrador que está bien, pasa')
check('sin errores', validarFacturaC(base(), HOY).length === 0, validarFacturaC(base(), HOY).join(' | '))

console.log('\n3) Lo que ARCA rechazaría, se ataja antes')
const err = (p: Partial<BorradorFacturaC>) => validarFacturaC(base(p), HOY).join(' | ')
check('importe 0', err({ importe: 0 }).includes('mayor a cero'))
check('importe negativo', err({ importe: -5 }).includes('mayor a cero'))
check('tres decimales', err({ importe: 100.555 }).includes('dos decimales'), err({ importe: 100.555 }))
check('dos decimales SÍ pasan', !err({ importe: 100.55 }).includes('decimales'))
check('punto de venta 0', err({ puntoVenta: 0 }).includes('punto de venta'))
check('CUIT inválido', err({ docNro: '30710265521' }).includes('dígito verificador'))
check('consumidor final con número cargado', err({ docTipo: DOC.consumidorFinal, docNro: '30710265522' }).includes('va en 0'))
// Consumidor final arrastra su condición de IVA: ARCA no acepta otra (ver §8).
check('consumidor final con 0 está bien', validarFacturaC(
  base({ docTipo: DOC.consumidorFinal, docNro: '0', condicionIvaReceptor: CONDICION_IVA.consumidorFinal }), HOY).length === 0)
check('DNI de 5 dígitos', err({ docTipo: DOC.dni, docNro: '12345' }).includes('7 u 8'))
check('DNI de 8 pasa', !err({ docTipo: DOC.dni, docNro: '40937899' }).includes('DNI'))

console.log('\n4) Fechas de servicio (el rechazo más común de la C)')
check('servicios sin fechas', err({ servicioDesde: undefined }).includes('hacen falta las fechas'))
check('período invertido', err({ servicioDesde: '2026-10-31', servicioHasta: '2026-10-01' }).includes('empieza después'))
check('concepto PRODUCTOS no las exige', (() => {
  const b: BorradorFacturaC = { ...base(), concepto: CONCEPTO.productos, servicioDesde: undefined, servicioHasta: undefined, vencimientoPago: undefined }
  return validarFacturaC(b, HOY).length === 0
})())

console.log('\n5) La ventana de fecha contra hoy')
check('productos: 6 días atrás se rechaza', (() => {
  const b: BorradorFacturaC = { ...base(), concepto: CONCEPTO.productos, servicioDesde: undefined, servicioHasta: undefined, vencimientoPago: undefined, fecha: '2026-10-03' }
  return validarFacturaC(b, HOY).some((e) => e.includes('hasta 5'))
})())
check('productos: 5 días atrás pasa', (() => {
  const b: BorradorFacturaC = { ...base(), concepto: CONCEPTO.productos, servicioDesde: undefined, servicioHasta: undefined, vencimientoPago: undefined, fecha: '2026-10-04' }
  return validarFacturaC(b, HOY).length === 0
})())
check('servicios: 10 días atrás pasa', !err({ fecha: '2026-09-29' }).includes('días de hoy'))
check('servicios: 11 días atrás se rechaza', err({ fecha: '2026-09-28' }).includes('hasta 10'))
check('cruzando el mes hacia adelante', !err({ fecha: '2026-10-14' }).includes('días de hoy'))

console.log('\n6) El detalle que viaja a ARCA')
{
  const d = armarDetalleC(base(), 43, HOY)
  check('numeración: desde = hasta = el que sigue', d.CbteDesde === 43 && d.CbteHasta === 43)
  check('fecha sin guiones', d.CbteFch === '20261009', d.CbteFch)
  check('FACTURA C: el total es el neto', d.ImpTotal === 150000 && d.ImpNeto === 150000)
  check('FACTURA C: IVA y conceptos en CERO', d.ImpIVA === 0 && d.ImpTotConc === 0 && d.ImpOpEx === 0 && d.ImpTrib === 0)
  check('NO viaja el array Iva (rechazo clásico de la C)', !('Iva' in d))
  check('pesos, cotización 1', d.MonId === 'PES' && d.MonCotiz === 1)
  check('fechas de servicio en formato ARCA', d.FchServDesde === '20261001' && d.FchServHasta === '20261031' && d.FchVtoPago === '20261110')
  check('CUIT como número', d.DocNro === 30710265522)
}
{
  const d = armarDetalleC(
    base({ docTipo: DOC.consumidorFinal, docNro: '0', condicionIvaReceptor: CONDICION_IVA.consumidorFinal }), 1, HOY)
  check('consumidor final → DocNro 0', d.DocNro === 0 && d.DocTipo === 99)
  check('consumidor final → condición 5', d.CondicionIVAReceptorId === CONDICION_IVA.consumidorFinal)
}
{
  const b: BorradorFacturaC = { ...base(), concepto: CONCEPTO.productos, servicioDesde: undefined, servicioHasta: undefined, vencimientoPago: undefined }
  const d = armarDetalleC(b, 7, HOY)
  check('productos: NO manda fechas de servicio', d.FchServDesde === undefined && d.FchVtoPago === undefined)
}
{
  const d = armarDetalleC(base({ importe: 1234.5 }), 2, HOY)
  check('redondeo a 2 decimales', d.ImpTotal === 1234.5)
}
check('un borrador inválido TIRA en vez de mandarse', (() => {
  try { armarDetalleC(base({ importe: 0 }), 1, HOY); return false } catch { return true }
})())
check('aFechaArca', aFechaArca('2026-01-05') === '20260105')

console.log('\n7) El TRA del WSAA')
{
  const now = new Date(2026, 9, 9, 12, 0, 0)
  const xml = buildTRA('wsfe', { now, uniqueId: 12345 })
  check('es un loginTicketRequest', xml.includes('<loginTicketRequest version="1.0">'))
  check('pide el servicio wsfe', xml.includes('<service>wsfe</service>'))
  check('lleva el uniqueId', xml.includes('<uniqueId>12345</uniqueId>'))
  check('generación 10 min ANTES (reloj desincronizado)', xml.includes('T11:50:00'), xml)
  check('expiración 10 min después', xml.includes('T12:10:00'))
  check('offset explícito, no Z', !xml.includes('Z<') && /[+-]\d{2}:\d{2}</.test(xml))
}
check('una ventana de más de 24 h no se arma', (() => {
  try { buildTRA('wsfe', { now: new Date(), ttlMin: 24 * 60 + 1 }); return false } catch { return true }
})())
check('isoConOffset con un dígito paddea', isoConOffset(new Date(2026, 0, 5, 9, 8, 7)).startsWith('2026-01-05T09:08:07'))

console.log('\n8) La respuesta del WSAA')
{
  const xml = `<loginTicketResponse><header><expirationTime>2026-10-09T23:59:59-03:00</expirationTime></header><credentials><token>ABC123</token><sign>FIRMA==</sign></credentials></loginTicketResponse>`
  const t = parseLoginTicketResponse(xml)
  check('saca token y sign', t.token === 'ABC123' && t.sign === 'FIRMA==')
  check('saca el vencimiento que dice ARCA', t.expiraEn === Date.parse('2026-10-09T23:59:59-03:00'))
}
check('un fault se reporta con su texto, no mudo', (() => {
  try {
    parseLoginTicketResponse('<soapenv:Fault><faultstring>El CEE ya posee un TA valido</faultstring></soapenv:Fault>')
    return false
  } catch (e) { return (e as Error).message.includes('El CEE ya posee un TA valido') }
})())
check('una respuesta ilegible tampoco pasa callada', (() => {
  try { parseLoginTicketResponse('<html>502 Bad Gateway</html>'); return false }
  catch (e) { return (e as Error).message.includes('no se entiende') }
})())

console.log('\n8) Condición de IVA del receptor (RG 5616 — el rechazo 10246)')
check('un borrador SIN condición no pasa',
  validarFacturaC(base({ condicionIvaReceptor: 0 }), HOY).some((e) => e.includes('condición')))
check('una condición inventada tampoco',
  validarFacturaC(base({ condicionIvaReceptor: 99 }), HOY).some((e) => e.includes('condición')))
check('responsable inscripto con CUIT pasa',
  validarFacturaC(base({ condicionIvaReceptor: CONDICION_IVA.responsableInscripto }), HOY).length === 0)
check('monotributo con CUIT pasa',
  validarFacturaC(base({ condicionIvaReceptor: CONDICION_IVA.monotributo }), HOY).length === 0)
check('consumidor final sin documento pasa',
  validarFacturaC(base({ docTipo: DOC.consumidorFinal, docNro: '0', condicionIvaReceptor: CONDICION_IVA.consumidorFinal }), HOY).length === 0)
check('consumidor final NO puede ser responsable inscripto',
  validarFacturaC(base({ docTipo: DOC.consumidorFinal, docNro: '0', condicionIvaReceptor: CONDICION_IVA.responsableInscripto }), HOY)
    .some((e) => e.includes('Consumidor Final')))
check('el default de un CUIT es responsable inscripto',
  condicionIvaPorDefecto(DOC.cuit) === CONDICION_IVA.responsableInscripto)
check('el default de un DNI es consumidor final (no pedir un rechazo)',
  condicionIvaPorDefecto(DOC.dni) === CONDICION_IVA.consumidorFinal)
check('el default sin documento es consumidor final',
  condicionIvaPorDefecto(DOC.consumidorFinal) === CONDICION_IVA.consumidorFinal)
check('todos los defaults son condiciones que la factura C admite',
  [DOC.cuit, DOC.cuil, DOC.dni, DOC.consumidorFinal]
    .every((d) => CONDICIONES_IVA_C.some((c) => c.id === condicionIvaPorDefecto(d))))

console.log('\n9) El ORDEN de los campos que viajan a ARCA')
{
  const det = armarDetalleC(base(), 7, HOY)
  check('lleva la condición del receptor', det.CondicionIVAReceptorId === CONDICION_IVA.responsableInscripto)
  // El esquema de ARCA es una SEQUENCE y el XML se arma recorriendo el objeto:
  // el orden de las claves ES el orden de los elementos. Agregar un campo "al
  // final porque es nuevo" rompe un request que andaba.
  const orden = Object.keys(det)
  const esperado = ['Concepto', 'DocTipo', 'DocNro', 'CbteDesde', 'CbteHasta', 'CbteFch',
    'ImpTotal', 'ImpTotConc', 'ImpNeto', 'ImpOpEx', 'ImpTrib', 'ImpIVA',
    'FchServDesde', 'FchServHasta', 'FchVtoPago', 'MonId', 'MonCotiz', 'CondicionIVAReceptorId']
  check('el orden es el del WSDL', JSON.stringify(orden) === JSON.stringify(esperado), JSON.stringify(orden))
  check('ImpTrib va antes que ImpIVA', orden.indexOf('ImpTrib') < orden.indexOf('ImpIVA'))
  check('las fechas de servicio van antes de MonId', orden.indexOf('FchServDesde') < orden.indexOf('MonId'))
  check('la condición va después de MonCotiz',
    orden.indexOf('CondicionIVAReceptorId') > orden.indexOf('MonCotiz'))
}
{
  const det = armarDetalleC(base({ concepto: CONCEPTO.productos }), 7, HOY)
  check('productos: no se mandan fechas de servicio',
    det.FchServDesde === undefined && det.FchServHasta === undefined && det.FchVtoPago === undefined)
  check('productos: igual lleva la condición de IVA',
    det.CondicionIVAReceptorId === CONDICION_IVA.responsableInscripto)
}

console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${pass} ok, ${fail} fail\n`)
process.exit(fail === 0 ? 0 : 1)
