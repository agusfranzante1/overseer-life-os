/** npx tsx lib/arca/misComprobantes.test.ts */
import {
  interpretarMisComprobantes, importeAr, fechaAr, codigoDeTipo, codigoDeDocumento,
  decodificar, detectarSeparador, type LecturaMisComprobantes,
} from './misComprobantes'

let pass = 0, fail = 0
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fail++; console.log(`  FAIL ${label} ${extra}`) }
}
const ok = (r: ReturnType<typeof interpretarMisComprobantes>): LecturaMisComprobantes => {
  if ('error' in r) throw new Error('se esperaba lectura, vino error: ' + r.error)
  return r
}

// El formato real de "Mis Comprobantes → Emitidos → CSV" (punto y coma, comillas).
const ENC = '"Fecha de Emisión";"Tipo de Comprobante";"Punto de Venta";"Número Desde";"Número Hasta";"Cód. Autorización";"Tipo Doc. Receptor";"Nro. Doc. Receptor";"Denominación Receptor";"Tipo Cambio";"Moneda";"Imp. Neto Gravado";"Imp. Neto No Gravado";"Imp. Op. Exentas";"Otros Tributos";"IVA";"Imp. Total"'
const fila = (f: string, tipo: string, pv: string, nro: string, cae: string, tdoc: string, ndoc: string, den: string, mon: string, total: string) =>
  `"${f}";"${tipo}";"${pv}";"${nro}";"${nro}";"${cae}";"${tdoc}";"${ndoc}";"${den}";"1,00";"${mon}";"0,00";"0,00";"0,00";"0,00";"0,00";"${total}"`

const CSV = [
  ENC,
  fila('01/10/2026', '11 - Factura C', '1', '135', '86405538656000', 'CUIT', '30710265522', 'CLIENTE DE PRUEBA SA', '$', '1103661,00'),
  fila('01/09/2026', '11 - Factura C', '1', '134', '86405538650000', 'CUIT', '30710265522', 'CLIENTE DE PRUEBA SA', '$', '1.050.000,00'),
  fila('15/08/2026', '13 - Nota de Crédito C', '1', '7', '86405538640000', 'CUIT', '30710265522', 'CLIENTE DE PRUEBA SA', '$', '50000,00'),
  fila('02/08/2026', '11 - Factura C', '1', '133', '86405538630000', '', '', 'Consumidor Final', '$', '25000,50'),
].join('\r\n')

console.log('\n1) Lee el export real de Mis Comprobantes')
{
  const r = ok(interpretarMisComprobantes(CSV))
  check('las 4 filas', r.comprobantes.length === 4, String(r.comprobantes.length))
  check('ninguna descartada', r.descartadas.length === 0)
  const c = r.comprobantes[0]
  check('id determinista de PRODUCCIÓN', c.id === 'arca_produccion_1_11_135', c.id)
  check('siempre producción (Mis Comprobantes solo existe ahí)', r.comprobantes.every((x) => x.entorno === 'produccion'))
  check('fecha a YYYY-MM-DD', c.fecha === '2026-10-01')
  check('tipo "11 - Factura C" → 11', c.tipo === 11)
  check('punto de venta y número', c.puntoVenta === 1 && c.numero === 135)
  check('importe con coma decimal', c.importe === 1103661)
  check('importe con puntos de miles', r.comprobantes[1].importe === 1050000)
  check('importe con centavos', r.comprobantes[3].importe === 25000.5)
  check('el CAE', c.cae === '86405538656000')
  check('el NOMBRE del cliente viene en el archivo', c.receptorNombre === 'CLIENTE DE PRUEBA SA')
  check('CUIT del receptor', c.docTipo === 80 && c.docNro === '30710265522')
  check('nota de crédito C → 13', r.comprobantes[2].tipo === 13)
  check('sin documento → consumidor final', r.comprobantes[3].docTipo === 99 && r.comprobantes[3].docNro === '0')
  check('el concepto NO se inventa: 0 = no se sabe', r.comprobantes.every((x) => x.concepto === 0))
  check('origen importado', c.origen === 'importado')
  check('sin detalle (el archivo no lo trae)', c.descripcion === '')
  check('en pesos no lleva observaciones', c.observaciones.length === 0)
}

console.log('\n2) Variantes de formato que ARCA usó')
{
  // Renglones de encabezado arriba de la tabla.
  const conPreambulo = ['"CUIT: 20111111112"', '"Período: 01/2026 - 12/2026"', '', CSV].join('\n')
  const r = ok(interpretarMisComprobantes(conPreambulo))
  check('encuentra la tabla aunque haya renglones antes', r.comprobantes.length === 4)
}
{
  const conComa = CSV.replace(/;/g, ',').replace(/(\d),(\d{2})"/g, '$1.$2"')
  check('detecta la coma como separador', detectarSeparador(conComa) === ',')
  const r = ok(interpretarMisComprobantes(conComa))
  check('y lee igual con coma', r.comprobantes.length === 4 && r.comprobantes[0].importe === 1103661)
}
{
  const conTexto = CSV.replace(/"11 - Factura C"/g, '"Factura C"')
  const r = ok(interpretarMisComprobantes(conTexto))
  check('tipo escrito sin código ("Factura C")', r.comprobantes[0].tipo === 11)
}
{
  const dolar = [ENC, fila('01/10/2026', '11 - Factura C', '1', '140', '1', 'CUIT', '30710265522', 'X', 'DOL', '1000,00')].join('\n')
  const r = ok(interpretarMisComprobantes(dolar))
  check('una factura en otra moneda lo dice', r.comprobantes[0].observaciones[0] === 'Importe en DOL')
}

console.log('\n3) Lo que NO se importa, y se dice por qué')
{
  const recibidos = CSV.replace(/Receptor/g, 'Emisor')
  const r = interpretarMisComprobantes(recibidos)
  check('el export de RECIBIDOS se rechaza', 'error' in r && r.error.includes('RECIBIDOS'))
}
{
  const sinTotal = CSV.replace('"Imp. Total"', '"Otra cosa"')
  const r = interpretarMisComprobantes(sinTotal)
  check('sin la columna de total, error con el nombre', 'error' in r && (r.error.includes('Imp. Total') || r.error.includes('no encontré')))
}
{
  const r = interpretarMisComprobantes('')
  check('archivo vacío', 'error' in r && r.error.includes('vacío'))
}
{
  const r = interpretarMisComprobantes('hola;mundo\nesto;no es\nun;export')
  check('cualquier otro CSV', 'error' in r)
}
{
  const conRota = [CSV, fila('no-es-fecha', '11 - Factura C', '1', '999', '1', 'CUIT', '1', 'X', '$', '10,00')].join('\n')
  const r = ok(interpretarMisComprobantes(conRota))
  check('una fila rota se descarta…', r.comprobantes.length === 4)
  check('…y se informa con su número de fila', r.descartadas.length === 1 && r.descartadas[0].fila === 6)
}

console.log('\n4) Las piezas')
check('importe 1.234,56', importeAr('1.234,56') === 123456)
check('importe 1234.56', importeAr('1234.56') === 123456)
check('importe $ 1.234,56', importeAr('$ 1.234,56') === 123456)
check('importe negativo entre paréntesis', importeAr('(1.234,56)') === -123456)
check('importe vacío → null', importeAr('') === null)
check('fecha 31/12/2026', fechaAr('31/12/2026') === '2026-12-31')
check('fecha 2026-12-31', fechaAr('2026-12-31') === '2026-12-31')
check('fecha 20261231', fechaAr('20261231') === '2026-12-31')
check('fecha imposible 31/02/2026 → null', fechaAr('31/02/2026') === null)
check('tipo "011"', codigoDeTipo('011') === 11)
check('documento "CUIT"', codigoDeDocumento('CUIT') === 80)
check('documento "96"', codigoDeDocumento('96') === 96)
check('documento "DNI"', codigoDeDocumento('DNI') === 96)
{
  // "Emisión" en Windows-1252: la é es 0xE9. Leído como UTF-8 se rompe.
  const bytes = new Uint8Array([0x45, 0x6d, 0x69, 0x73, 0x69, 0xf3, 0x6e])
  check('lee Windows-1252 cuando no es UTF-8', decodificar(bytes.buffer) === 'Emisión')
}
{
  const utf8 = new TextEncoder().encode('﻿Emisión')
  check('lee UTF-8 y le saca el BOM', decodificar(utf8.buffer as ArrayBuffer) === 'Emisión')
}

console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${pass} ok, ${fail} fail\n`)
process.exit(fail === 0 ? 0 : 1)
