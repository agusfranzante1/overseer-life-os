/** npx tsx lib/arca/facturaHtml.test.ts */
import {
  facturaHtml, fechaImpresa, importeImpreso, codigoImpreso, letraComprobante, esc,
  type ComprobanteParaImprimir,
} from './facturaHtml'
import { payloadQrAfip, urlQrAfip, aBase64, BASE_QR } from './qr'
import { camposFaltantesEmisor, emisorCompleto, EMISOR_VACIO, type DatosEmisor } from './emisor'

let pass = 0, fail = 0
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label} ${extra}`) }
}

const emisor: DatosEmisor = {
  razonSocial: 'FRANZANTE AGUSTIN HUGO',
  domicilioComercial: 'Profesor Aurelio Garcia 3520 - Neuquen, Neuquén',
  condicionIva: 'Responsable Monotributo',
  ingresosBrutos: '20414370161',
  inicioActividades: '1900-01-01',
}

// El comprobante REAL que mandó el usuario, para comparar contra su PDF.
const real: ComprobanteParaImprimir = {
  puntoVenta: 1, tipo: 11, numero: 135, fecha: '2026-10-01',
  docTipo: 80, docNro: '30639251663', importe: 1103661,
  cae: '86405538656000', vencimientoCae: '2026-10-11',
  servicioDesde: '2026-09-01', servicioHasta: '2026-09-30', vencimientoPago: '2026-10-15',
  descripcion: 'Servicio de Asesoramiento prestado en el mes de Septiembre de 2026',
  receptorNombre: 'MUNICIPALIDAD DE NEUQUEN',
  receptorDomicilio: 'Av Argentina Y Roca 0 - Neuquen, Neuquén',
  receptorCondicionIva: 'IVA Sujeto Exento',
  condicionVenta: 'Contado',
}

console.log('\n1) Cómo se imprime cada dato')
check('fecha DD/MM/YYYY', fechaImpresa('2026-10-01') === '01/10/2026')
check('una fecha vacía no imprime "undefined"', fechaImpresa(undefined) === '')
check('una fecha con formato raro tampoco', fechaImpresa('01/10/2026') === '')
check('importe con coma decimal', importeImpreso(1103661) === '1103661,00')
check('importe con centavos', importeImpreso(150000.5) === '150000,50')
check('importe redondea a 2 decimales', importeImpreso(10.005) === '10,01')
check('cero', importeImpreso(0) === '0,00')
check('código con 3 dígitos', codigoImpreso(11) === 'COD. 011')
check('nota de crédito', codigoImpreso(13) === 'COD. 013')
check('la factura C es letra C', letraComprobante(11) === 'C')
check('la nota de crédito C también', letraComprobante(13) === 'C')
check('una A es A', letraComprobante(1) === 'A')

console.log('\n2) Nada de lo que entra puede romper el HTML')
check('escapa <', esc('<script>') === '&lt;script&gt;')
check('escapa comillas', esc('Juan "El Rojo"').includes('&quot;'))
check('escapa &', esc('Perez & Asoc') === 'Perez &amp; Asoc')
check('undefined no imprime "undefined"', esc(undefined) === '')
{
  const html = facturaHtml({ comprobante: { ...real, receptorNombre: '<img onerror=x>' }, emisor, cuitEmisor: '20414370161' })
  check('un nombre con HTML no se inyecta', !html.includes('<img onerror=x>'))
}

console.log('\n3) La factura lleva TODO lo que exige el comprobante')
{
  const html = facturaHtml({ comprobante: real, emisor, cuitEmisor: '20414370161', qrDataUrl: 'data:image/png;base64,AAA' })
  const tiene = (s: string) => html.includes(s)
  check('las tres copias', tiene('ORIGINAL') && tiene('DUPLICADO') && tiene('TRIPLICADO'))
  check('la letra C y su código', tiene('>C<') && tiene('COD. 011'))
  check('dice FACTURA', tiene('FACTURA'))
  check('punto de venta con 5 dígitos', tiene('00001'))
  check('número con 8 dígitos', tiene('00000135'))
  check('fecha de emisión', tiene('01/10/2026'))
  check('razón social del emisor', tiene('FRANZANTE AGUSTIN HUGO'))
  check('domicilio comercial', tiene('Profesor Aurelio Garcia 3520'))
  check('condición de IVA del emisor', tiene('Responsable Monotributo'))
  check('CUIT del emisor', tiene('20414370161'))
  check('ingresos brutos', tiene('Ingresos Brutos'))
  check('inicio de actividades impreso', tiene('01/01/1900'))
  check('período facturado', tiene('01/09/2026') && tiene('30/09/2026'))
  check('vencimiento de pago', tiene('15/10/2026'))
  check('CUIT del receptor', tiene('30639251663'))
  check('nombre del receptor', tiene('MUNICIPALIDAD DE NEUQUEN'))
  check('domicilio del receptor', tiene('Av Argentina Y Roca'))
  check('condición de IVA del receptor', tiene('IVA Sujeto Exento'))
  check('condición de venta', tiene('Contado'))
  check('el concepto, que es lo que lee el cliente',
    tiene('Servicio de Asesoramiento prestado en el mes de Septiembre de 2026'))
  check('el importe, tres veces (unitario, subtotal y total)',
    (html.match(/1103661,00/g) ?? []).length >= 3 * 3)   // 3 copias
  check('CAE', tiene('86405538656000'))
  check('vencimiento del CAE', tiene('11/10/2026'))
  check('dice Comprobante Autorizado', tiene('Comprobante Autorizado'))
  check('lleva el QR', tiene('data:image/png;base64,AAA'))
  check('A4 en la hoja impresa', tiene('size: A4'))
  check('cada copia en su hoja', tiene('page-break-after'))
}

console.log('\n4) Un comprobante SIN QR no disimula que le falta')
{
  const html = facturaHtml({ comprobante: real, emisor, cuitEmisor: '20414370161' })
  check('lo dice en la cara', html.includes('Falta el código QR'))
}

console.log('\n5) Sin período de servicio no se imprime la fila del período')
{
  const html = facturaHtml({
    comprobante: { ...real, servicioDesde: undefined, servicioHasta: undefined, vencimientoPago: undefined },
    emisor, cuitEmisor: '20414370161',
  })
  check('no aparece "Período Facturado"', !html.includes('Período Facturado'))
  check('pero el resto sigue', html.includes('86405538656000'))
}

console.log('\n6) Consumidor final: no se inventa un documento')
{
  const html = facturaHtml({
    comprobante: { ...real, docTipo: 99, docNro: '0', receptorNombre: '', receptorDomicilio: '' },
    emisor, cuitEmisor: '20414370161',
  })
  check('no imprime el documento 0', !html.includes('>0<') && !html.includes(' 0</span>'))
  check('igual lleva el CAE', html.includes('86405538656000'))
}

console.log('\n7) El QR de la RG 4892')
{
  const url = urlQrAfip({
    fecha: '2026-10-01', cuit: '20414370161', puntoVenta: 1, tipoComprobante: 11,
    numero: 135, importeTotal: 1103661, docTipoReceptor: 80, docNroReceptor: '30639251663',
    cae: '86405538656000',
  })
  check('apunta a ARCA', url.startsWith(BASE_QR))
  const json = JSON.parse(Buffer.from(url.slice(BASE_QR.length), 'base64').toString('utf8'))
  check('versión 1', json.ver === 1)
  check('fecha como texto', json.fecha === '2026-10-01')
  check('el CUIT va como NÚMERO, no como texto', typeof json.cuit === 'number' && json.cuit === 20414370161)
  check('el CAE va como número', typeof json.codAut === 'number' && json.codAut === 86405538656000)
  check('tipoCodAut E (autorizado por CAE)', json.tipoCodAut === 'E')
  check('punto de venta', json.ptoVta === 1)
  check('tipo y número', json.tipoCmp === 11 && json.nroCmp === 135)
  check('importe', json.importe === 1103661)
  check('moneda y cotización por default', json.moneda === 'PES' && json.ctz === 1)
  check('documento del receptor', json.tipoDocRec === 80 && json.nroDocRec === 30639251663)
}
{
  // Consumidor final: las claves del receptor NO van. Mandar nroDocRec: 0 es
  // declarar un documento que no existe.
  const p = payloadQrAfip({
    fecha: '2026-10-01', cuit: '20414370161', puntoVenta: 1, tipoComprobante: 11,
    numero: 1, importeTotal: 1000, docTipoReceptor: 99, docNroReceptor: '0', cae: '123',
  })
  check('sin documento no van tipoDocRec ni nroDocRec',
    !('tipoDocRec' in p) && !('nroDocRec' in p))
}
check('base64 de un texto con acentos no rompe',
  Buffer.from(aBase64('ñandú'), 'base64').toString('utf8') === 'ñandú')

console.log('\n8) Tus datos de emisor: qué falta para poder imprimir')
check('un emisor vacío lista todo lo que falta', camposFaltantesEmisor(EMISOR_VACIO).length === 4)
check('y los nombra', camposFaltantesEmisor(EMISOR_VACIO).includes('Razón social'))
check('el emisor real está completo', emisorCompleto(emisor))
check('sin razón social no está completo', !emisorCompleto({ ...emisor, razonSocial: '' }))
check('un espacio no cuenta como dato', !emisorCompleto({ ...emisor, domicilioComercial: '   ' }))
check('undefined no explota', camposFaltantesEmisor(undefined).length === 5)

console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${pass} ok, ${fail} fail\n`)
process.exit(fail === 0 ? 0 : 1)
