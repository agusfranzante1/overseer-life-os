'use client'
import QRCode from 'qrcode'
import { facturaHtml, type ComprobanteParaImprimir } from './facturaHtml'
import { urlQrAfip } from './qr'
import { emisorCompleto, camposFaltantesEmisor, type DatosEmisor } from './emisor'
import { CONDICIONES_IVA_C } from './facturaC'

/**
 * Abre la factura en una ventana aparte, lista para imprimir o guardar en PDF.
 *
 * Va en una ventana NUEVA y no en un modal por una razón concreta: el
 * documento tiene que ser autocontenido. Dentro de la app, el CSS del shell
 * (alturas fijas, `overflow:hidden`, el tema oscuro) se mete en la impresión y
 * lo que sale por la impresora no es lo que se ve. Así, lo que se ve ES lo que
 * sale.
 *
 * Devuelve un error legible en vez de abrir una factura inválida: un
 * comprobante sin QR o sin los datos del emisor no cumple, y entregarlo igual
 * sería peor que no imprimirlo (BASE nº6).
 */
export async function imprimirFactura(args: {
  comprobante: ComprobanteParaImprimir & { condicionIvaReceptor?: number }
  emisor: DatosEmisor | undefined
  cuitEmisor: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { comprobante, emisor, cuitEmisor } = args

  if (!emisor || !emisorCompleto(emisor)) {
    return {
      ok: false,
      error: `Faltan tus datos de emisor para poder imprimir: ${camposFaltantesEmisor(emisor).join(', ')}. Cargalos en la pestaña "Mis datos".`,
    }
  }
  if (!comprobante.cae) {
    return { ok: false, error: 'Este comprobante no tiene CAE, así que no se puede imprimir.' }
  }
  if (!cuitEmisor) {
    return { ok: false, error: 'No se pudo leer tu CUIT. Probá la conexión con ARCA y reintentá.' }
  }

  let qrDataUrl: string | undefined
  try {
    qrDataUrl = await QRCode.toDataURL(urlQrAfip({
      fecha: comprobante.fecha,
      cuit: cuitEmisor,
      puntoVenta: comprobante.puntoVenta,
      tipoComprobante: comprobante.tipo,
      numero: comprobante.numero,
      importeTotal: comprobante.importe,
      docTipoReceptor: comprobante.docTipo,
      docNroReceptor: comprobante.docNro,
      cae: comprobante.cae,
    }), { margin: 1, width: 240 })
  } catch {
    // Sin QR el comprobante NO cumple la RG 4892. Se sigue, pero la hoja lo
    // dice en rojo: esconderlo sería entregar una factura inválida sin aviso.
    qrDataUrl = undefined
  }

  const html = facturaHtml({
    comprobante: {
      ...comprobante,
      receptorCondicionIva: comprobante.receptorCondicionIva
        ?? CONDICIONES_IVA_C.find((c) => c.id === comprobante.condicionIvaReceptor)?.desc
        ?? '',
    },
    emisor,
    cuitEmisor,
    qrDataUrl,
  })

  const win = window.open('', '_blank')
  if (!win) {
    return { ok: false, error: 'El navegador bloqueó la ventana. Permití las ventanas emergentes de este sitio y probá de nuevo.' }
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  return { ok: true }
}
