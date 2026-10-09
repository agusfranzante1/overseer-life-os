/** Un comprobante ya emitido: identidad, numeración y "repetir esta factura".
 *
 *  **Todo puro.** No importa el store ni Supabase, así que lo usan igual la
 *  ruta del servidor (que es la que emite) y la UI.
 *
 *  ── Por qué el id es determinista ───────────────────────────────────────
 *  Un comprobante fiscal YA tiene identidad propia: entorno + punto de venta
 *  + tipo + número. No hay dos distintos con esos cuatro datos, y no existe
 *  "el mismo comprobante con otro número". Usar `genId()` acá rompería dos
 *  cosas a la vez: la emisión escribe del lado del servidor y el cliente la
 *  agrega a su store sin esperar el pull — con ids al azar serían dos filas
 *  para una sola factura. Y el importador (que relee de ARCA lo ya emitido)
 *  volvería a insertar todo en cada corrida en vez de reconocer lo que ya
 *  está. Determinista, las dos cosas son idempotentes solas.
 *
 *  ── Por qué el ENTORNO entra en la identidad ────────────────────────────
 *  Homologación y producción son dos universos separados, y los dos empiezan
 *  a numerar en 1. La factura C nº 1 de homologación es una prueba sin valor
 *  fiscal; la nº 1 de producción es una factura de verdad. Si compartieran id
 *  se pisarían, y el listado mentiría sobre lo facturado.
 */

export type EntornoArca = 'homologacion' | 'produccion'

/** Los datos fiscales de un comprobante: lo que ARCA sabe de él.
 *  El store le suma lo nuestro (descripción, notas, timestamps). */
export interface ComprobanteFiscal {
  entorno: EntornoArca
  puntoVenta: number
  /** 11 Factura C · 12 Nota de Débito C · 13 Nota de Crédito C. */
  tipo: number
  numero: number
  /** `YYYY-MM-DD`. */
  fecha: string
  concepto: number
  docTipo: number
  /** Sin guiones. "0" con consumidor final. */
  docNro: string
  importe: number
  cae?: string
  /** `YYYY-MM-DD`. */
  vencimientoCae?: string
  servicioDesde?: string
  servicioHasta?: string
  vencimientoPago?: string
}

export function idComprobante(
  entorno: EntornoArca, puntoVenta: number, tipo: number, numero: number,
): string {
  return `arca_${entorno}_${puntoVenta}_${tipo}_${numero}`
}

const NOMBRES: Record<number, string> = {
  11: 'Factura C',
  12: 'Nota de Débito C',
  13: 'Nota de Crédito C',
}

export function nombreTipo(tipo: number): string {
  return NOMBRES[tipo] ?? `Comprobante tipo ${tipo}`
}

/** Como lo escribe ARCA en el PDF: `00003-00000012`. */
export function numeroVisible(puntoVenta: number, numero: number): string {
  return `${String(puntoVenta).padStart(5, '0')}-${String(numero).padStart(8, '0')}`
}

/** El que sigue. La numeración es consecutiva por (punto de venta, tipo) y
 *  ARCA rechaza cualquier salto, así que esto NO se elige: se deriva de
 *  `FECompUltimoAutorizado`. */
export function proximoNumero(ultimoAutorizado: number): number {
  return Math.max(0, Math.trunc(ultimoAutorizado)) + 1
}

/**
 * Qué números pedirle a ARCA para traer el historial.
 *
 * No existe un "listame todas": el webservice consulta **de a un número**
 * (`FECompConsultar`). Entonces el historial se reconstruye recorriendo de 1
 * hasta el último autorizado. Para que no sea una barrida entera cada vez:
 *   · se arranca por los MÁS NUEVOS (que es lo que uno quiere ver primero),
 *   · se saltean los que ya tenemos → la segunda corrida casi no pide nada,
 *   · y se topea el lote, porque cada número es un viaje de red.
 */
export function numerosAImportar(
  ultimoAutorizado: number, yaTengo: ReadonlySet<number>, max = 50,
): number[] {
  const out: number[] = []
  for (let n = Math.trunc(ultimoAutorizado); n >= 1 && out.length < max; n--) {
    if (!yaTengo.has(n)) out.push(n)
  }
  return out
}

// ─── Repetir una factura ────────────────────────────────────────────────────

function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate()
}

function partes(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split('-').map(Number)
  return [y, m, d]
}

const fmt = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** Corre una fecha N meses, respetando el fin de mes.
 *
 *  Las dos reglas importan para un abono mensual: un período que terminaba el
 *  31 de enero tiene que terminar el 28 de febrero (no el 3 de marzo), y uno
 *  que terminaba el 30 de abril tiene que terminar el 31 de mayo — si no, el
 *  período repetido deja días afuera o se superpone con el siguiente. */
export function correrMeses(ymd: string, meses: number): string {
  const [y, m, d] = partes(ymd)
  const total = y * 12 + (m - 1) + meses
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const ultimoNuevo = ultimoDiaDelMes(ny, nm)
  const eraFinDeMes = d === ultimoDiaDelMes(y, m)
  return fmt(ny, nm, eraFinDeMes ? ultimoNuevo : Math.min(d, ultimoNuevo))
}

/** Meses enteros de calendario entre dos fechas (b − a). */
export function mesesEntre(a: string, b: string): number {
  const [ay, am] = partes(a)
  const [by, bm] = partes(b)
  return (by * 12 + bm) - (ay * 12 + am)
}

function sumarDias(ymd: string, dias: number): string {
  const [y, m, d] = partes(ymd)
  const t = new Date(y, m - 1, d + dias)
  return fmt(t.getFullYear(), t.getMonth() + 1, t.getDate())
}

function diasEntre(a: string, b: string): number {
  const [ay, am, ad] = partes(a)
  const [by, bm, bd] = partes(b)
  return Math.round((new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86_400_000)
}

/** Lo que cambia al repetir, y lo que no. */
export interface BorradorRepetido {
  puntoVenta: number
  tipo: number
  concepto: number
  docTipo: number
  docNro: string
  importe: number
  fecha: string
  servicioDesde?: string
  servicioHasta?: string
  vencimientoPago?: string
  /** Nuestras (no viajan a ARCA), pero se repiten igual: si facturás siempre
   *  lo mismo al mismo cliente, volver a escribirlos es la fricción que hace
   *  que no factures. */
  descripcion?: string
  receptorNombre?: string
}

/**
 * "Repetir esta factura": el mismo comprobante, con las fechas puestas al día.
 *
 * El importe, el receptor y el concepto se copian tal cual — eso es lo que uno
 * quiere cuando factura siempre lo mismo. Lo que NO se copia son las fechas:
 *
 *   · la fecha del comprobante pasa a ser HOY. Repetir con la fecha de la
 *     anterior la haría rechazar (ARCA acepta ±5 o ±10 días de hoy), y peor,
 *     emitiría un comprobante fechado en un mes ya cerrado.
 *   · el período de servicio se corre los mismos MESES que pasaron desde la
 *     factura original. Un abono de septiembre repetido en octubre tiene que
 *     decir octubre: si no, se factura dos veces el mismo período, que es un
 *     problema fiscal, no un detalle de interfaz.
 *   · el vencimiento de pago conserva su distancia en días al fin del
 *     período (vencía 10 días después → sigue venciendo 10 días después).
 *
 * El resultado es un BORRADOR editable, no una emisión: el usuario lo ve en
 * el formulario y confirma.
 */
export function repetirBorrador(
  c: ComprobanteFiscal & { descripcion?: string; receptorNombre?: string },
  hoy: string,
): BorradorRepetido {
  const base: BorradorRepetido = {
    puntoVenta: c.puntoVenta,
    tipo: c.tipo,
    concepto: c.concepto,
    docTipo: c.docTipo,
    docNro: c.docNro,
    importe: c.importe,
    fecha: hoy,
    descripcion: c.descripcion,
    receptorNombre: c.receptorNombre,
  }
  if (!c.servicioDesde || !c.servicioHasta) return base

  const meses = mesesEntre(c.fecha, hoy)
  const desde = correrMeses(c.servicioDesde, meses)
  const hasta = correrMeses(c.servicioHasta, meses)
  const offsetVto = c.vencimientoPago ? diasEntre(c.servicioHasta, c.vencimientoPago) : 0
  return {
    ...base,
    servicioDesde: desde,
    servicioHasta: hasta,
    vencimientoPago: c.vencimientoPago ? sumarDias(hasta, offsetVto) : undefined,
  }
}
