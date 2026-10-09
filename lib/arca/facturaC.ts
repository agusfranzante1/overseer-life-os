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

/**
 * Condición frente al IVA del RECEPTOR (RG 5616, obligatoria desde 2025).
 *
 * Sin este campo ARCA rechaza con **10246**. La fuente de verdad es el método
 * `FEParamGetCondicionIvaReceptor` del propio webservice, y la pantalla usa esa
 * lista cuando la puede traer; esto es el respaldo para que el formulario
 * funcione igual si esa llamada falla. Son los códigos de la tabla oficial.
 */
export const CONDICION_IVA = {
  responsableInscripto: 1,
  exento: 4,
  consumidorFinal: 5,
  monotributo: 6,
  noCategorizado: 7,
  proveedorDelExterior: 8,
  clienteDelExterior: 9,
  liberadoLey19640: 10,
  monotributistaSocial: 13,
  noAlcanzado: 15,
  monotributoIndependientePromovido: 16,
} as const

/** Las que acepta un comprobante clase C, con su nombre tal como lo lista ARCA. */
export const CONDICIONES_IVA_C: { id: number; desc: string }[] = [
  { id: CONDICION_IVA.responsableInscripto, desc: 'IVA Responsable Inscripto' },
  { id: CONDICION_IVA.exento, desc: 'IVA Sujeto Exento' },
  { id: CONDICION_IVA.consumidorFinal, desc: 'Consumidor Final' },
  { id: CONDICION_IVA.monotributo, desc: 'Responsable Monotributo' },
  { id: CONDICION_IVA.noCategorizado, desc: 'Sujeto No Categorizado' },
  { id: CONDICION_IVA.proveedorDelExterior, desc: 'Proveedor del Exterior' },
  { id: CONDICION_IVA.clienteDelExterior, desc: 'Cliente del Exterior' },
  { id: CONDICION_IVA.liberadoLey19640, desc: 'IVA Liberado – Ley 19.640' },
  { id: CONDICION_IVA.monotributistaSocial, desc: 'Monotributista Social' },
  { id: CONDICION_IVA.noAlcanzado, desc: 'IVA No Alcanzado' },
  { id: CONDICION_IVA.monotributoIndependientePromovido, desc: 'Monotributo Trabajador Independiente Promovido' },
]

/**
 * La condición que corresponde por default según a quién le facturás.
 *
 * Es un ATAJO, no una regla: con "consumidor final" la condición no puede ser
 * otra (y ARCA lo valida), pero con un CUIT es lo más común y el usuario lo
 * puede cambiar. Un DNI casi siempre es una persona comprando como consumidor
 * final, así que arrancar en "Responsable Inscripto" ahí sería pedir un
 * rechazo.
 */
export function condicionIvaPorDefecto(docTipo: number): number {
  if (docTipo === DOC.consumidorFinal || docTipo === DOC.dni) return CONDICION_IVA.consumidorFinal
  return CONDICION_IVA.responsableInscripto
}

export interface BorradorFacturaC {
  puntoVenta: number
  tipo: TipoComprobante
  concepto: Concepto
  docTipo: TipoDoc
  /** Sin guiones. Con consumidor final va 0. */
  docNro: string
  /** Importe total en pesos. En la C no se desglosa nada. */
  importe: number
  /** RG 5616: condición del receptor frente al IVA. Ver `CONDICION_IVA`. */
  condicionIvaReceptor: number
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

  // Condición frente al IVA del receptor (RG 5616). Sin esto ARCA devuelve el
  // 10246, que es un rechazo entero por un campo que el formulario conoce.
  if (!CONDICIONES_IVA_C.some((c) => c.id === b.condicionIvaReceptor)) {
    errores.push('Falta la condición del receptor frente al IVA.')
  } else if (b.docTipo === DOC.consumidorFinal
    && b.condicionIvaReceptor !== CONDICION_IVA.consumidorFinal) {
    // Coherencia que ARCA valida igual: sin documento, el receptor es
    // consumidor final por definición.
    errores.push('Si no identificás al receptor, su condición de IVA tiene que ser "Consumidor Final".')
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
/**
 * El cuerpo de `FECAEDetRequest`. Snake/Pascal como lo pide el WS.
 *
 * **El ORDEN de los campos importa.** El XML se arma recorriendo este objeto y
 * el esquema de ARCA es una *sequence*: los elementos tienen que ir en el orden
 * del WSDL. Esta interfaz está escrita en ese orden a propósito — agregar un
 * campo al final "porque es nuevo" es cómo se rompe un request que andaba.
 */
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
  ImpTrib: number
  ImpIVA: number
  FchServDesde?: string
  FchServHasta?: string
  FchVtoPago?: string
  MonId: string
  MonCotiz: number
  /** RG 5616: la condición frente al IVA de QUIEN RECIBE la factura.
   *  Obligatorio desde 2025 — sin esto ARCA rechaza con el error 10246. */
  CondicionIVAReceptorId: number
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
    ImpTrib: 0,
    ImpIVA: 0,
    // Las fechas de servicio van ACÁ en la sequence del WSDL (antes de MonId),
    // aunque solo existan cuando el concepto incluye servicios.
    FchServDesde: hayServicios ? aFechaArca(b.servicioDesde!) : undefined,
    FchServHasta: hayServicios ? aFechaArca(b.servicioHasta!) : undefined,
    FchVtoPago: hayServicios ? aFechaArca(b.vencimientoPago!) : undefined,
    MonId: 'PES',
    MonCotiz: 1,
    CondicionIVAReceptorId: b.condicionIvaReceptor,
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
