/** WSAA — el Ticket de Requerimiento de Acceso (TRA).
 *
 *  Para hablar con cualquier webservice de ARCA primero hay que pedirle un
 *  ticket al WSAA: se arma este XML, se firma como CMS con el certificado, y
 *  ARCA devuelve un `token` + `sign` que valen **12 horas**.
 *
 *  Acá solo se arma el XML (puro y testeable). La firma y la llamada viven en
 *  `wsaa.ts`, que es server-only porque toca la clave privada.
 *
 *  Las tres cosas que ARCA rechaza y por las que uno pierde una tarde:
 *   1. `generationTime` en el FUTURO (aunque sea por el reloj desincronizado):
 *      por eso se resta un margen.
 *   2. Ventana mayor a 24 h entre generación y expiración.
 *   3. Repetir el `uniqueId` dentro de una ventana todavía válida.
 *
 *  Las fechas van en ISO 8601 **con offset explícito** (`-03:00`), no en UTC
 *  con `Z` ni en hora local sin offset.
 */

/** Servicios de ARCA que se piden por TRA. `wsfe` = Facturación Electrónica v1. */
export type ServicioArca = 'wsfe'

export interface TraOpts {
  /** Momento de referencia. Se pasa explícito para que el test sea determinista. */
  now: Date
  /** Minutos hacia atrás para `generationTime`. Cubre el desfasaje de reloj. */
  marginMin?: number
  /** Minutos hacia adelante para `expirationTime`. ARCA topea en 24 h. */
  ttlMin?: number
  /** Identificador del pedido. Por default, los segundos del epoch (cabe en
   *  32 bits y es creciente). Se puede fijar para testear. */
  uniqueId?: number
}

/** Fecha en ISO 8601 con el offset local explícito: `2026-10-09T12:00:00-03:00`. */
export function isoConOffset(d: Date): string {
  const p = (n: number, w = 2) => String(Math.abs(Math.trunc(n))).padStart(w, '0')
  const offMin = -d.getTimezoneOffset()
  const signo = offMin >= 0 ? '+' : '-'
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    + `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    + `${signo}${p(offMin / 60)}:${p(offMin % 60)}`
}

const MAX_VENTANA_MIN = 24 * 60

/** Arma el XML del TRA. Tira si la ventana pedida supera las 24 h de ARCA. */
export function buildTRA(service: ServicioArca, opts: TraOpts): string {
  const marginMin = opts.marginMin ?? 10
  const ttlMin = opts.ttlMin ?? 10
  if (marginMin + ttlMin > MAX_VENTANA_MIN) {
    throw new Error(`La ventana del TRA (${marginMin + ttlMin} min) supera las 24 h que acepta ARCA`)
  }
  const gen = new Date(opts.now.getTime() - marginMin * 60_000)
  const exp = new Date(opts.now.getTime() + ttlMin * 60_000)
  const uniqueId = opts.uniqueId ?? Math.floor(opts.now.getTime() / 1000)

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<loginTicketRequest version="1.0">',
    '<header>',
    `<uniqueId>${uniqueId}</uniqueId>`,
    `<generationTime>${isoConOffset(gen)}</generationTime>`,
    `<expirationTime>${isoConOffset(exp)}</expirationTime>`,
    '</header>',
    `<service>${service}</service>`,
    '</loginTicketRequest>',
  ].join('')
}

export interface TicketAcceso {
  token: string
  sign: string
  /** Epoch ms en que el ticket deja de servir (lo dice ARCA, no nosotros). */
  expiraEn: number
}

/** Saca `token`, `sign` y el vencimiento de la respuesta del WSAA.
 *
 *  Se parsea con expresiones regulares a propósito: la respuesta es un XML
 *  chico y fijo, y sumar un parser entero (con sus CVEs y su peso) para tres
 *  campos no se paga. Si algo no está, se avisa con el texto crudo — un fallo
 *  mudo acá deja "no puedo facturar" sin explicación (BASE nº6). */
export function parseLoginTicketResponse(xml: string): TicketAcceso {
  const token = /<token>([\s\S]*?)<\/token>/.exec(xml)?.[1]?.trim()
  const sign = /<sign>([\s\S]*?)<\/sign>/.exec(xml)?.[1]?.trim()
  const expira = /<expirationTime>([\s\S]*?)<\/expirationTime>/.exec(xml)?.[1]?.trim()
  if (!token || !sign) {
    const fault = /<faultstring>([\s\S]*?)<\/faultstring>/.exec(xml)?.[1]?.trim()
    throw new Error(fault
      ? `WSAA rechazó el pedido: ${fault}`
      : `WSAA devolvió algo que no se entiende: ${xml.slice(0, 300)}`)
  }
  const expiraEn = expira ? Date.parse(expira) : NaN
  return {
    token,
    sign,
    // Sin fecha legible, se asume la ventana corta en vez de guardar un ticket
    // que quizás ya venció: reintentar el login es barato, facturar con un
    // ticket muerto es un error críptico.
    expiraEn: Number.isNaN(expiraEn) ? Date.now() + 10 * 60_000 : expiraEn,
  }
}
