/** Helpers puros de ARCA. Correr: npx tsx lib/store/arcaStore.test.ts */
import {
  comprobantesDe, totalFacturado, numerosConocidos, descripcionesUsadas,
  type ComprobanteArca,
} from './arcaStore'
import { idComprobante, type EntornoArca } from '@/lib/arca/comprobante'

let ok = 0, fail = 0
const t = (n: string, c: boolean) => { if (c) ok++; else { fail++; console.log('  ✗ ' + n) } }

const mk = (p: Partial<ComprobanteArca> & { numero: number }): ComprobanteArca => {
  const entorno: EntornoArca = p.entorno ?? 'produccion'
  const puntoVenta = p.puntoVenta ?? 3
  const tipo = p.tipo ?? 11
  return {
    id: p.id ?? idComprobante(entorno, puntoVenta, tipo, p.numero),
    entorno, puntoVenta, tipo, numero: p.numero,
    fecha: p.fecha ?? '2026-10-01',
    concepto: p.concepto ?? 2,
    docTipo: p.docTipo ?? 80,
    docNro: p.docNro ?? '30710265522',
    importe: p.importe ?? 1000,
    cae: p.cae, vencimientoCae: p.vencimientoCae,
    servicioDesde: p.servicioDesde, servicioHasta: p.servicioHasta, vencimientoPago: p.vencimientoPago,
    descripcion: p.descripcion ?? '',
    receptorNombre: p.receptorNombre ?? '',
    resultado: p.resultado ?? 'A',
    observaciones: p.observaciones ?? [],
    origen: p.origen ?? 'overseer',
    createdAt: p.createdAt ?? '2026-10-01T10:00:00Z',
    updatedAt: p.updatedAt ?? '2026-10-01T10:00:00Z',
  }
}

const mezcla: ComprobanteArca[] = [
  mk({ numero: 1, fecha: '2026-09-30', importe: 100, descripcion: 'Marketing' }),
  mk({ numero: 2, fecha: '2026-10-01', importe: 200, descripcion: 'Marketing' }),
  mk({ numero: 3, fecha: '2026-10-05', importe: 300, descripcion: 'Consultoría' }),
  mk({ numero: 1, fecha: '2026-10-05', importe: 999, entorno: 'homologacion', descripcion: 'Prueba' }),
]

console.log('\n1) Los entornos NO se mezclan')
t('solo los de producción', comprobantesDe(mezcla, 'produccion').length === 3)
t('solo los de homologación', comprobantesDe(mezcla, 'homologacion').length === 1)
t('el total de producción ignora la prueba de 999',
  totalFacturado(mezcla, 'produccion') === 600)
t('el total de homologación es solo la prueba',
  totalFacturado(mezcla, 'homologacion') === 999)

console.log('\n2) Orden: lo más nuevo arriba')
{
  const l = comprobantesDe(mezcla, 'produccion')
  t('el más nuevo primero', l[0].numero === 3)
  t('el más viejo último', l[2].numero === 1)
}
{
  // Dos del mismo día: desempata el número, que es cronológico por definición.
  const l = comprobantesDe([
    mk({ numero: 7, fecha: '2026-10-05' }), mk({ numero: 9, fecha: '2026-10-05' }),
  ], 'produccion')
  t('mismo día → el número mayor primero', l[0].numero === 9)
}

console.log('\n3) Total por mes')
t('octubre de producción', totalFacturado(mezcla, 'produccion', '2026-10') === 500)
t('septiembre de producción', totalFacturado(mezcla, 'produccion', '2026-09') === 100)
t('un mes sin facturas da 0', totalFacturado(mezcla, 'produccion', '2026-01') === 0)

console.log('\n4) Qué números ya tengo (hace incremental la importación)')
{
  const n = numerosConocidos(mezcla, 'produccion', 3, 11)
  t('los tres de producción', n.size === 3 && n.has(1) && n.has(2) && n.has(3))
  t('NO cuenta el de homologación como conocido en producción',
    numerosConocidos(mezcla, 'homologacion', 3, 11).size === 1)
  t('otro punto de venta no comparte numeración',
    numerosConocidos(mezcla, 'produccion', 4, 11).size === 0)
  t('otro tipo de comprobante tampoco',
    numerosConocidos(mezcla, 'produccion', 3, 13).size === 0)
}

console.log('\n5) Descripciones ya usadas (para ofrecerlas al facturar)')
{
  const d = descripcionesUsadas(mezcla, 'produccion')
  t('sin repetir', d.length === 2)
  t('la más reciente primero', d[0] === 'Consultoría')
  t('no trae la de homologación', !d.includes('Prueba'))
  t('las vacías no entran',
    descripcionesUsadas([mk({ numero: 1, descripcion: '' }), mk({ numero: 2, descripcion: '   ' })], 'produccion').length === 0)
  t('no duplica por mayúsculas',
    descripcionesUsadas([
      mk({ numero: 1, descripcion: 'Marketing' }), mk({ numero: 2, descripcion: 'marketing' }),
    ], 'produccion').length === 1)
}

console.log(`\n${fail === 0 ? 'TODO OK' : 'HAY FALLAS'} — ${ok} ok, ${fail} fail\n`)
process.exit(fail === 0 ? 0 : 1)
