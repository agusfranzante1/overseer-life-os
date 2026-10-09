/**
 * El código QR obligatorio de la factura (RG 4892).
 *
 * Todo comprobante electrónico tiene que llevar impreso un QR que apunta a
 * ARCA con los datos del comprobante codificados. Es lo que permite que
 * cualquiera verifique que la factura existe de verdad. No es decoración:
 * sin el QR el comprobante no cumple.
 *
 * El contenido es una URL fija con un parámetro `p` que es el JSON de abajo
 * en base64. Los nombres de las claves y su tipo están definidos por la
 * resolución — `cuit` y `codAut` van como NÚMERO, no como texto, y mandarlos
 * entre comillas hace que el visor de ARCA no lo reconozca.
 *
 * Todo puro: no depende del navegador ni de Node. El dibujo del QR en sí lo
 * hace la librería `qrcode` sobre la URL que devuelve `urlQrAfip`.
 */

export interface DatosQr {
  /** Fecha de emisión, `YYYY-MM-DD`. */
  fecha: string
  /** CUIT del EMISOR, sin guiones. */
  cuit: string
  puntoVenta: number
  /** Código de tipo de comprobante (11 = Factura C). */
  tipoComprobante: number
  numero: number
  importeTotal: number
  /** 'PES' salvo moneda extranjera. */
  moneda?: string
  cotizacion?: number
  /** Tipo y número de documento del receptor. Se omiten si no hay. */
  docTipoReceptor?: number
  docNroReceptor?: string
  /** El CAE. */
  cae: string
}

/** La base de la URL. Fija por la resolución. */
export const BASE_QR = 'https://www.afip.gob.ar/fe/qr/?p='

/** base64 que anda igual en el navegador y en Node (el test corre en Node). */
export function aBase64(texto: string): string {
  if (typeof btoa === 'function') {
    // `btoa` es byte-a-byte: sin esto, un carácter no-ASCII lo rompe.
    const bytes = new TextEncoder().encode(texto)
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin)
  }
  return Buffer.from(texto, 'utf8').toString('base64')
}

/**
 * El JSON que va adentro del QR, como objeto.
 *
 * El orden de las claves es el del ejemplo oficial. No cambia nada
 * técnicamente (es JSON), pero facilita comparar contra la documentación
 * cuando algo no valida.
 */
export function payloadQrAfip(d: DatosQr): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ver: 1,
    fecha: d.fecha,
    cuit: Number(d.cuit.replace(/\D/g, '')),
    ptoVta: d.puntoVenta,
    tipoCmp: d.tipoComprobante,
    nroCmp: d.numero,
    importe: Math.round(d.importeTotal * 100) / 100,
    moneda: d.moneda ?? 'PES',
    ctz: d.cotizacion ?? 1,
  }
  // Con consumidor final sin identificar, estas dos claves NO van. Mandar
  // `nroDocRec: 0` es declarar un documento que no existe.
  const nro = (d.docNroReceptor ?? '').replace(/\D/g, '')
  if (d.docTipoReceptor && nro && nro !== '0') {
    payload.tipoDocRec = d.docTipoReceptor
    payload.nroDocRec = Number(nro)
  }
  // 'E' = autorizado por CAE (el caso de la facturación en línea).
  payload.tipoCodAut = 'E'
  payload.codAut = Number(d.cae.replace(/\D/g, ''))
  return payload
}

/** La URL completa que se dibuja como QR. */
export function urlQrAfip(d: DatosQr): string {
  return BASE_QR + aBase64(JSON.stringify(payloadQrAfip(d)))
}
