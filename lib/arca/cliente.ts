import 'server-only'
import forge from 'node-forge'
import { buildTRA, parseLoginTicketResponse, type TicketAcceso } from './tra'
import type { DetalleArca, ResultadoCae } from './facturaC'

/** Cliente de ARCA: WSAA (autenticación) + WSFEv1 (facturación electrónica).
 *
 *  **Server-only, y no por formalidad:** acá se usa la CLAVE PRIVADA del
 *  certificado. Si este módulo entrara en un bundle del cliente, la clave
 *  viajaría al navegador. El `import 'server-only'` hace que el build falle
 *  antes que eso pase.
 *
 *  ── Credenciales ────────────────────────────────────────────────────────
 *  Van en variables de entorno, NUNCA en el repo:
 *    ARCA_CUIT            CUIT del emisor, 11 dígitos
 *    ARCA_CERT            certificado .crt completo, en PEM
 *    ARCA_KEY             clave privada .key, en PEM
 *    ARCA_ENTORNO         'homologacion' (default) | 'produccion'
 *  En Vercel se cargan como env vars multilínea (el PEM va entero, con sus
 *  líneas BEGIN/END). También se acepta el PEM en base64, que es más cómodo
 *  de pegar y se detecta solo.
 *
 *  ── Por qué SOAP a mano ─────────────────────────────────────────────────
 *  Igual que el servidor MCP del proyecto: son cuatro llamadas con un sobre
 *  fijo. Sumar una librería SOAP (y su árbol de dependencias) para esto no se
 *  paga, y las librerías de SOAP suelen pelearse con el bundling de Next.
 */

const ENDPOINTS = {
  homologacion: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  },
  produccion: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
  },
} as const

export type Entorno = keyof typeof ENDPOINTS

export interface ConfigArca {
  cuit: string
  cert: string
  key: string
  entorno: Entorno
}

/** Lee la config del entorno. Devuelve qué falta en vez de explotar: la UI
 *  tiene que poder decir "falta el certificado" sin tirar un 500. */
export function leerConfig(): { ok: true; config: ConfigArca } | { ok: false; faltan: string[]; entorno: Entorno } {
  const entorno: Entorno = process.env.ARCA_ENTORNO === 'produccion' ? 'produccion' : 'homologacion'
  const cuit = (process.env.ARCA_CUIT ?? '').replace(/\D/g, '')
  const cert = desarmarPem(process.env.ARCA_CERT ?? '')
  const key = desarmarPem(process.env.ARCA_KEY ?? '')
  const faltan: string[] = []
  if (!cuit) faltan.push('ARCA_CUIT')
  if (!cert.includes('BEGIN CERTIFICATE')) faltan.push('ARCA_CERT')
  if (!/BEGIN (RSA )?PRIVATE KEY/.test(key)) faltan.push('ARCA_KEY')
  if (faltan.length > 0) return { ok: false, faltan, entorno }
  return { ok: true, config: { cuit, cert, key, entorno } }
}

/** Acepta el PEM tal cual o pegado en base64 (más cómodo en un panel web). */
function desarmarPem(v: string): string {
  const s = v.trim()
  if (!s) return ''
  if (s.includes('-----BEGIN')) return s.replace(/\\n/g, '\n')
  try {
    const decoded = Buffer.from(s, 'base64').toString('utf8')
    return decoded.includes('-----BEGIN') ? decoded : s
  } catch { return s }
}

// ─── WSAA ────────────────────────────────────────────────────────────────────

/** Firma el TRA como CMS/PKCS#7 en DER y lo devuelve en base64, que es lo que
 *  espera `loginCms`.
 *
 *  Nota sobre `node-forge`: su aviso de seguridad conocido es sobre la
 *  VERIFICACIÓN de firmas PKCS#1 v1.5 — acá solo se FIRMA con nuestra propia
 *  clave y no se verifica nada de terceros, así que no aplica. */
export function firmarCms(tra: string, cert: string, key: string): string {
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(tra, 'utf8')
  p7.addCertificate(forge.pki.certificateFromPem(cert))
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(key),
    certificate: forge.pki.certificateFromPem(cert),
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
    ],
  })
  p7.sign({ detached: false })
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes()
  return forge.util.encode64(der)
}

/** Ticket cacheado en memoria del proceso. Dura 12 h del lado de ARCA y pedir
 *  otro antes de tiempo da el error "El CEE ya posee un TA valido": no es un
 *  lujo, es parte del protocolo. */
const ticketCache = new Map<string, TicketAcceso>()

export async function obtenerTicket(cfg: ConfigArca): Promise<TicketAcceso> {
  const clave = `${cfg.entorno}:${cfg.cuit}`
  const cacheado = ticketCache.get(clave)
  // Margen de 5 min: un ticket que vence mientras viaja el pedido es un error
  // críptico del otro lado.
  if (cacheado && cacheado.expiraEn - Date.now() > 5 * 60_000) return cacheado

  const tra = buildTRA('wsfe', { now: new Date() })
  const cms = firmarCms(tra, cfg.cert, cfg.key)
  const sobre = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`

  const res = await fetch(ENDPOINTS[cfg.entorno].wsaa, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body: sobre,
  })
  const xml = await res.text()
  // El cuerpo viene escapado dentro de <loginCmsReturn>.
  const inner = /<loginCmsReturn>([\s\S]*?)<\/loginCmsReturn>/.exec(xml)?.[1]
  const ticket = parseLoginTicketResponse(inner ? desescapar(inner) : xml)
  ticketCache.set(clave, ticket)
  return ticket
}

function desescapar(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

// ─── WSFEv1 ──────────────────────────────────────────────────────────────────

async function llamarWsfe(cfg: ConfigArca, accion: string, cuerpo: string): Promise<string> {
  const sobre = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
<soap:Body>${cuerpo}</soap:Body></soap:Envelope>`
  const res = await fetch(ENDPOINTS[cfg.entorno].wsfe, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `http://ar.gov.afip.dif.FEV1/${accion}` },
    body: sobre,
  })
  const xml = await res.text()
  const fault = /<faultstring>([\s\S]*?)<\/faultstring>/.exec(xml)?.[1]
  if (fault) throw new Error(`ARCA (${accion}): ${fault}`)
  return xml
}

function auth(cfg: ConfigArca, t: TicketAcceso): string {
  return `<ar:Auth><ar:Token>${t.token}</ar:Token><ar:Sign>${t.sign}</ar:Sign><ar:Cuit>${cfg.cuit}</ar:Cuit></ar:Auth>`
}

const tag = (xml: string, name: string): string | undefined =>
  new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml)?.[1]?.trim()

/** `FEDummy`: el pulso de ARCA. NO requiere autenticación, así que distingue
 *  "ARCA está caído" de "mi certificado no sirve" — sin eso, los dos fallos se
 *  ven igual desde afuera. */
export async function estadoServidores(cfg: ConfigArca): Promise<{ app: string; db: string; auth: string }> {
  const xml = await llamarWsfe(cfg, 'FEDummy', '<ar:FEDummy/>')
  return {
    app: tag(xml, 'AppServer') ?? '?',
    db: tag(xml, 'DbServer') ?? '?',
    auth: tag(xml, 'AuthServer') ?? '?',
  }
}

/** Último número autorizado para un punto de venta y tipo. El que sigue es
 *  este + 1: la numeración es consecutiva y ARCA rechaza cualquier salto. */
export async function ultimoAutorizado(cfg: ConfigArca, puntoVenta: number, tipo: number): Promise<number> {
  const t = await obtenerTicket(cfg)
  const xml = await llamarWsfe(cfg, 'FECompUltimoAutorizado',
    `<ar:FECompUltimoAutorizado>${auth(cfg, t)}<ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${tipo}</ar:CbteTipo></ar:FECompUltimoAutorizado>`)
  const errs = leerErrores(xml)
  if (errs.length > 0) throw new Error(errs.join(' · '))
  return Number(tag(xml, 'CbteNro') ?? 0)
}

/** Los puntos de venta habilitados del CUIT. Sirve para no hacerle escribir un
 *  número que después ARCA rechaza. */
export async function puntosDeVenta(cfg: ConfigArca): Promise<{ nro: number; tipo: string; bloqueado: boolean }[]> {
  const t = await obtenerTicket(cfg)
  const xml = await llamarWsfe(cfg, 'FEParamGetPtosVenta',
    `<ar:FEParamGetPtosVenta>${auth(cfg, t)}</ar:FEParamGetPtosVenta>`)
  const out: { nro: number; tipo: string; bloqueado: boolean }[] = []
  for (const m of xml.matchAll(/<PtoVenta>([\s\S]*?)<\/PtoVenta>/g)) {
    const b = m[1]
    out.push({
      nro: Number(tag(b, 'Nro') ?? 0),
      tipo: tag(b, 'EmisionTipo') ?? '',
      bloqueado: (tag(b, 'Bloqueado') ?? 'N').toUpperCase() === 'S',
    })
  }
  return out
}

function leerErrores(xml: string): string[] {
  const out: string[] = []
  for (const m of xml.matchAll(/<Err>([\s\S]*?)<\/Err>/g)) {
    out.push(`${tag(m[1], 'Code') ?? '?'}: ${tag(m[1], 'Msg') ?? ''}`.trim())
  }
  return out
}

/** Pide el CAE de un comprobante. **Esto EMITE** — una factura con CAE existe
 *  para ARCA y solo se deshace con una nota de crédito. */
export async function solicitarCae(
  cfg: ConfigArca, puntoVenta: number, tipo: number, det: DetalleArca,
): Promise<ResultadoCae> {
  const t = await obtenerTicket(cfg)
  const campos = Object.entries(det)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `<ar:${k}>${v}</ar:${k}>`)
    .join('')
  const xml = await llamarWsfe(cfg, 'FECAESolicitar',
    `<ar:FECAESolicitar>${auth(cfg, t)}<ar:FeCAEReq>`
    + `<ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${tipo}</ar:CbteTipo></ar:FeCabReq>`
    + `<ar:FeDetReq><ar:FECAEDetRequest>${campos}</ar:FECAEDetRequest></ar:FeDetReq>`
    + `</ar:FeCAEReq></ar:FECAESolicitar>`)

  const observaciones = [
    ...leerErrores(xml),
    ...[...xml.matchAll(/<Obs>([\s\S]*?)<\/Obs>/g)]
      .map((m) => `${tag(m[1], 'Code') ?? '?'}: ${tag(m[1], 'Msg') ?? ''}`.trim()),
  ]
  const resultado = (tag(xml, 'Resultado') ?? 'R') as 'A' | 'R' | 'P'
  const cae = tag(xml, 'CAE')
  return {
    resultado,
    cae: cae && cae.length > 0 ? cae : undefined,
    vencimientoCae: tag(xml, 'CAEFchVto'),
    numero: Number(tag(xml, 'CbteDesde') ?? 0) || undefined,
    observaciones,
  }
}
