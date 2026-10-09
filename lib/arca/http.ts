import 'server-only'
import https from 'node:https'

/**
 * El transporte HTTPS hacia ARCA.
 *
 * ── Por qué no `fetch` ──────────────────────────────────────────────────
 * El servidor de facturación de PRODUCCIÓN (`servicios1.afip.gov.ar`) cifra
 * con DHE y una clave Diffie-Hellman de **1024 bits**. OpenSSL en el nivel de
 * seguridad 2 —el default actual, y el que corre en Vercel— la rechaza con
 * `dh key too small`, y Node lo reporta como un `fetch failed` pelado, sin la
 * causa. Pasó así el 2026-10-09: homologación andaba perfecto (usa ECDHE) y
 * producción no contestaba nunca desde Vercel, aunque desde una PC sí.
 *
 * `fetch` no deja tocar la configuración TLS sin sumar una dependencia; el
 * módulo `https` de Node sí, con un `Agent` propio.
 *
 * ── Por qué SOLO para ese servidor ──────────────────────────────────────
 * Bajar el nivel de seguridad es aceptar un cifrado más débil. Se hace donde
 * ARCA no deja otra opción y en ningún otro lado: la autenticación (WSAA, donde
 * viaja el certificado firmado) y homologación negocian ECDHE sin problema y
 * siguen en el nivel estricto. Si ARCA algún día actualiza ese servidor, sacar
 * el host de la lista alcanza.
 *
 * ── De paso ─────────────────────────────────────────────────────────────
 * `keepAlive`: traer el historial son decenas de consultas seguidas al mismo
 * servidor, y reabrir la conexión TLS en cada una es lo que más tarda.
 * Timeout explícito: sin él, un ARCA colgado se come todo el tiempo de la
 * función y el error que llega es el corte de Vercel, no "ARCA no respondió".
 */

/** Servidores de ARCA que solo negocian DHE con clave de 1024 bits. */
export const HOSTS_DH_DEBIL = new Set(['servicios1.afip.gov.ar'])

const agenteEstricto = new https.Agent({ keepAlive: true })
const agenteDhDebil = new https.Agent({ keepAlive: true, ciphers: 'DEFAULT@SECLEVEL=1' })

/** Qué agente le toca a cada servidor. Puro, para poder testearlo. */
export function usaSeguridadRelajada(hostname: string): boolean {
  return HOSTS_DH_DEBIL.has(hostname.toLowerCase())
}

export interface RespuestaXml {
  status: number
  text: string
}

/**
 * POST de un sobre SOAP. Los errores de red salen con su CÓDIGO y el servidor
 * (`ECONNRESET`, `ERR_SSL_…`), no como "fetch failed": la diferencia entre "ARCA
 * está caído" y "no podemos negociar el cifrado" es justo la que hace falta
 * para arreglarlo (BASE nº6).
 */
export function postXml(
  url: string, body: string, headers: Record<string, string>, timeoutMs = 25_000,
): Promise<RespuestaXml> {
  const u = new URL(url)
  const agent = usaSeguridadRelajada(u.hostname) ? agenteDhDebil : agenteEstricto
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      agent,
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body, 'utf8') },
    }, (res) => {
      const partes: Buffer[] = []
      res.on('data', (c: Buffer) => partes.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(partes).toString('utf8') }))
      res.on('error', (e) => reject(new Error(`se cortó la respuesta de ${u.hostname}: ${e.message}`)))
    })
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`${u.hostname} no respondió en ${Math.round(timeoutMs / 1000)} s`))
    })
    req.on('error', (e: NodeJS.ErrnoException) => {
      reject(new Error(`no se pudo conectar con ${u.hostname}: ${[e.code, e.message].filter(Boolean).join(' · ')}`))
    })
    req.end(body, 'utf8')
  })
}
