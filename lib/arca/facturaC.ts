/** Factura C (monotributo) — armado y validación del pedido de CAE.
 *
 *  Todo lo de acá es PURO: arma el payload de `FECAESolicitar` y lo valida
 *  ANTES de mandarlo. La razón es concreta: ARCA contesta con códigos tipo
 *  "10015" y textos truncados, y cada rechazo es un viaje de ida y vuelta.
 *  Lo que se puede saber sin preguntar, se sabe acá.
 *
 *  ── Lo propio de la factura C ────────────────────────────────────────────
 *  El monotributista NO discrimina IVA. Entonces:
 *    · `ImpTotal` = `ImpNeto` (el importe de la factura, y nada más)
 *    · `ImpIVA`, `ImpTotConc`, `ImpOpEx`, `ImpTrib` van en 0
 *    · **no se manda el array `Iva`** — mandarlo, aunque sea vacío o en 0, es
 *      uno de los rechazos clásicos de la C.
 *
 *  ── Lo que ARCA valida y conviene atajar antes ───────────────────────────
 *    · La numeración es CONSECUTIVA por punto de venta y tipo: hay que pedir
 *      `FECompUltimoAutorizado` y usar ese número + 1. Un salto se rechaza.
 *    · Si el concepto incluye SERVICIOS, las tres fechas de servicio son
 *      obligatorias (desde, hasta, vencimiento de pago).
 *    · La fecha del comprobante no puede alejarse de hoy más de 5 días
 *      (productos) o 10 (servicios).
 *    · Con "consumidor final" (doc 99) el número de documento va en 0; con
 *      CUIT, el dígito verificador tiene que cerrar.
 */

/** 11 = Factura C · 12 = Nota de Débito C · 13 = Nota de Crédito C. */
export const CBTE = { facturaC: 11, notaDebitoC: 12, notaCreditoC: 13 } as const
export type TipoComprobante = typeof CBTE[keyof typeof CBTE]

/** 1 = productos · 2 = servicios · 3 = productos y servicios. */
export const CONCEPTO = { productos: 1, servicios: 2, ambos: 3 } as const
export type Concepto = typeof CONCEPTO[keyof typeof CONCEPTO]

/** 80 = CUIT · 86 = CUIL · 96 = DNI · 99 = consumidor final. */
export const DOC = { cuit: 80, cuil: 86, dni: 96, consumidorFinal: 99 } as const
export type TipoDoc = typeof DOC[keyof typeof DOC]

export interface BorradorFacturaC {
  puntoVenta: number
  tipo: TipoComprobante
  concepto: Concepto
  docTipo: TipoDoc
  /** Sin guiones. Con consumidor final va 0. */
  docNro: string
  /** Importe total en pesos. En la C no se desglosa nada. */
  importe: number
  /** Fecha del comprobante, `YYYY-MM-DD`. */
  fecha: string
  /** Obligatorias si el concepto incluye servicios (`YYYY-MM-DD`). */
  servicioDesde?: string
  servicioHasta?: string
  vencimientoPago?: string
}

/** `YYYY-MM-DD` → `YYYYMMDD`, que es como lo pide ARCA. */
export function aFechaArca(ymd: string): string {
  return ymd.replace(/-/g, '')
}

/** Días enteros entre dos `YYYY-MM-DD` (b − a), en calendario local. */
function diasEntre(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86_400_000)
}

/** Valida un CUIT/CUIL con su dígito verificador. ARCA lo rechaza igual, pero
 *  acá el error se ve antes de gastar una llamada y un número de comprobante. */
export function cuitValido(cuit: string): boolean {
  const s = cuit.replace(/\D/g, '')
  if (s.length !== 11) return false
  if (/^(\d)\1{10}$/.test(s)) return false          // 00000000000 y amigos
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(s[i]), 0)
  const resto = suma % 11
  const dv = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto
  return dv === Number(s[10])
}

const ES_YMD = /^\d{4}-\d{2}-\d{2}$/

/** Los problemas del borrador, en castellano. Vacío = se puede mandar. */
export function validarFacturaC(b: BorradorFacturaC, hoy: string): string[] {
  const errores: string[] = []

  if (!Number.isInteger(b.puntoVenta) || b.puntoVenta <= 0) {
    errores.push('El punto de venta tiene que ser un número mayor a cero.')
  }
  if (!ES_YMD.test(b.fecha)) {
    errores.push('La fecha del comprobante no tiene formato YYYY-MM-DD.')
  }

  // Importe: positivo y con 2 decimales exactos. Un tercer decimal se redondea
  // del lado de ARCA y el total deja de coincidir con lo que viste en pantalla.
  if (!(b.importe > 0)) {
    errores.push('El importe tiene que ser mayor a cero.')
  } else if (Math.round(b.importe * 100) !== Number((b.importe * 100).toFixed(0))
    || Math.abs(b.importe * 100 - Math.round(b.importe * 100)) > 1e-6) {
    errores.push('El importe no puede tener más de dos decimales.')
  }

  // Identificación del receptor.
  if (b.docTipo === DOC.consumidorFinal) {
    if (b.docNro.replace(/\D/g, '') !== '' && b.docNro.replace(/\D/g, '') !== '0') {
      errores.push('Con "consumidor final" el número de documento va en 0.')
    }
  } else if (b.docTipo === DOC.cuit || b.docTipo === DOC.cuil) {
    if (!cuitValido(b.docNro)) errores.push(`El CUIT/CUIL ${b.docNro} no es válido (no cierra el dígito verificador).`)
  } else if (!/^\d{7,8}$/.test(b.docNro.replace(/\D/g, ''))) {
    errores.push('El DNI tiene que tener 7 u 8 dígitos.')
  }

  // Fechas de servicio: obligatorias y coherentes cuando hay servicios.
  const hayServicios = b.concepto === CONCEPTO.servicios || b.concepto === CONCEPTO.ambos
  if (hayServicios) {
    const faltan = (['servicioDesde', 'servicioHasta', 'vencimientoPago'] as const)
      .filter((k) => !b[k] || !ES_YMD.test(b[k]!))
    if (faltan.length > 0) {
      errores.push(`Con servicios hacen falta las fechas: ${faltan.join(', ')}.`)
    } else if (b.servicioDesde! > b.servicioHasta!) {
      errores.push('El período de servicio empieza después de terminar.')
    }
  }

  // Ventana de fecha contra hoy.
  if (ES_YMD.test(b.fecha)) {
    const margen = hayServicios ? 10 : 5
    const dif = Math.abs(diasEntre(hoy, b.fecha))
    if (dif > margen) {
      errores.push(`La fecha se aleja ${dif} días de hoy; ARCA acepta hasta ${margen} para este concepto.`)
    }
  }

  return errores
}

/** El cuerpo de `FEDetRequest` que viaja a ARCA. Snake/Pascal como lo pide el WS. */
export interface DetalleArca {
  Concepto: number
  DocTipo: number
  DocNro: number
  CbteDesde: number
  CbteHasta: number
  CbteFch: string
  ImpTotal: number
  ImpTotConc: number
  ImpNeto: number
  ImpOpEx: number
  ImpIVA: number
  ImpTrib: number
  MonId: string
  MonCotiz: number
  FchServDesde?: string
  FchServHasta?: string
  FchVtoPago?: string
}

/**
 * Arma el detalle del comprobante. `numero` es el que sigue
 * (`FECompUltimoAutorizado` + 1) — **no** lo adivina este módulo: pedirlo es
 * una llamada de red y acá adentro todo es puro.
 *
 * Tira si el borrador no valida: mandar algo que ya sabemos mal quema un
 * número de comprobante y devuelve un código que no dice nada.
 */
export function armarDetalleC(b: BorradorFacturaC, numero: number, hoy: string): DetalleArca {
  const errores = validarFacturaC(b, hoy)
  if (errores.length > 0) throw new Error(errores.join(' '))

  const importe = Math.round(b.importe * 100) / 100
  const hayServicios = b.concepto === CONCEPTO.servicios || b.concepto === CONCEPTO.ambos

  const det: DetalleArca = {
    Concepto: b.concepto,
    DocTipo: b.docTipo,
    DocNro: b.docTipo === DOC.consumidorFinal ? 0 : Number(b.docNro.replace(/\D/g, '')),
    CbteDesde: numero,
    CbteHasta: numero,
    CbteFch: aFechaArca(b.fecha),
    // Factura C: todo el importe es "neto" y no hay IVA ni otros conceptos.
    ImpTotal: importe,
    ImpTotConc: 0,
    ImpNeto: importe,
    ImpOpEx: 0,
    ImpIVA: 0,
    ImpTrib: 0,
    MonId: 'PES',
    MonCotiz: 1,
  }
  if (hayServicios) {
    det.FchServDesde = aFechaArca(b.servicioDesde!)
    det.FchServHasta = aFechaArca(b.servicioHasta!)
    det.FchVtoPago = aFechaArca(b.vencimientoPago!)
  }
  return det
}

/** Resultado del pedido de CAE, ya leído de la respuesta de ARCA. */
export interface ResultadoCae {
  /** 'A' aprobado · 'R' rechazado · 'P' parcial. */
  resultado: 'A' | 'R' | 'P'
  cae?: string
  vencimientoCae?: string
  numero?: number
  /** Observaciones y errores que devolvió ARCA, ya legibles. */
  observaciones: string[]
}
