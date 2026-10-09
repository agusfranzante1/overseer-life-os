/**
 * El PDF de la factura — o más exactamente, el HTML que se imprime.
 *
 * ── Por qué existe esto ─────────────────────────────────────────────────
 * Facturando por la web, ARCA genera el comprobante en PDF y vos se lo
 * mandás al cliente. Por **webservice ARCA no genera nada**: te devuelve un
 * CAE y listo. El papel lo tenés que emitir vos. Sin esto hay factura válida
 * ante ARCA y nada que entregar.
 *
 * ── Por qué HTML y no una librería de PDF ───────────────────────────────
 * El navegador ya sabe imprimir y exportar a PDF, y lo hace mejor que
 * cualquier librería que sumemos al bundle: respeta A4, tipografías y
 * saltos de página. Esto devuelve un documento **autocontenido** (sus
 * propios estilos, nada de la app) que se abre en una ventana aparte, y de
 * ahí sale "Imprimir" o "Guardar como PDF". Cero dependencias nuevas.
 *
 * ── El formato ──────────────────────────────────────────────────────────
 * Copia el comprobante que emite ARCA, campo por campo, porque ese es el
 * que el cliente y el contador esperan ver. Tres copias — ORIGINAL,
 * DUPLICADO y TRIPLICADO — cada una en su hoja, igual que el original.
 *
 * Todo puro: entra data, sale un string. Testeable sin navegador.
 */

import type { DatosEmisor } from './emisor'
import { nombreTipo } from './comprobante'
import { DOC } from './facturaC'

export interface ComprobanteParaImprimir {
  puntoVenta: number
  tipo: number
  numero: number
  /** `YYYY-MM-DD`. */
  fecha: string
  docTipo: number
  docNro: string
  importe: number
  cae?: string
  /** `YYYY-MM-DD`. */
  vencimientoCae?: string
  servicioDesde?: string
  servicioHasta?: string
  vencimientoPago?: string
  /** El texto que describe lo facturado. Es lo único que el cliente lee. */
  descripcion: string
  receptorNombre: string
  receptorDomicilio?: string
  receptorCondicionIva?: string
  condicionVenta?: string
}

/** Las tres copias que lleva un comprobante en papel. */
const COPIAS = ['ORIGINAL', 'DUPLICADO', 'TRIPLICADO'] as const

/** `YYYY-MM-DD` → `DD/MM/YYYY`, que es como se imprime acá. */
export function fechaImpresa(ymd: string | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ''
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

/** Importes como los escribe ARCA: miles sin separador, coma decimal. */
export function importeImpreso(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',')
}

/** El código del comprobante como va en la cajita: `COD. 011`. */
export function codigoImpreso(tipo: number): string {
  return `COD. ${String(tipo).padStart(3, '0')}`
}

/** La letra grande del recuadro. Los comprobantes C terminan todos en C. */
export function letraComprobante(tipo: number): string {
  if ([1, 2, 3, 4, 5].includes(tipo)) return 'A'
  if ([6, 7, 8, 9, 10].includes(tipo)) return 'B'
  if ([11, 12, 13, 15].includes(tipo)) return 'C'
  return 'X'
}

/** Nada de lo que entra acá viene de nosotros: escapar o se rompe el HTML
 *  (y un `<` en el nombre de un cliente no tiene por qué romper una factura). */
export function esc(s: string | number | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** El nombre que ARCA le da a cada tipo de documento del receptor. */
function etiquetaDoc(docTipo: number): string {
  if (docTipo === DOC.cuit) return 'CUIT'
  if (docTipo === DOC.cuil) return 'CUIL'
  if (docTipo === DOC.dni) return 'DNI'
  return 'Doc.'
}

export interface OpcionesFactura {
  comprobante: ComprobanteParaImprimir
  emisor: DatosEmisor
  /** CUIT del emisor, sin guiones. Sale de la config de ARCA, no se tipea. */
  cuitEmisor: string
  /** El QR ya dibujado, como data URL. Sin esto el comprobante NO cumple la
   *  RG 4892, así que se deja un hueco visible en vez de disimularlo. */
  qrDataUrl?: string
}

/** Una de las tres hojas. */
function hoja(o: OpcionesFactura, copia: string): string {
  const { comprobante: c, emisor: e } = o
  const hayServicios = !!(c.servicioDesde || c.servicioHasta)
  const sinDoc = c.docTipo === DOC.consumidorFinal || !c.docNro || c.docNro === '0'
  const total = importeImpreso(c.importe)

  return `
<section class="hoja">
  <div class="copia">${esc(copia)}</div>

  <div class="cabecera">
    <div class="letra">
      <div class="letra-grande">${esc(letraComprobante(c.tipo))}</div>
      <div class="letra-cod">${esc(codigoImpreso(c.tipo))}</div>
    </div>
    <div class="col izq">
      <div class="emisor-nombre">${esc(e.razonSocial)}</div>
      <div class="campo"><b>Razón Social:</b> ${esc(e.razonSocial)}</div>
      <div class="campo"><b>Domicilio Comercial:</b> ${esc(e.domicilioComercial)}</div>
      <div class="campo"><b>Condición frente al IVA:</b> ${esc(e.condicionIva)}</div>
    </div>
    <div class="col der">
      <div class="titulo">${esc(nombreTipo(c.tipo)).replace(/ C$/, '').toUpperCase()}</div>
      <div class="campo"><b>Punto de Venta:</b> ${String(c.puntoVenta).padStart(5, '0')}
        &nbsp;&nbsp;<b>Comp. Nro:</b> ${String(c.numero).padStart(8, '0')}</div>
      <div class="campo"><b>Fecha de Emisión:</b> ${esc(fechaImpresa(c.fecha))}</div>
      <div class="sep"></div>
      <div class="campo"><b>CUIT:</b> ${esc(o.cuitEmisor)}</div>
      <div class="campo"><b>Ingresos Brutos:</b> ${esc(e.ingresosBrutos)}</div>
      <div class="campo"><b>Fecha de Inicio de Actividades:</b> ${esc(fechaImpresa(e.inicioActividades))}</div>
    </div>
  </div>

  ${hayServicios ? `<div class="periodo">
    <span><b>Período Facturado Desde:</b> ${esc(fechaImpresa(c.servicioDesde))}</span>
    <span><b>Hasta:</b> ${esc(fechaImpresa(c.servicioHasta))}</span>
    <span><b>Fecha de Vto. para el pago:</b> ${esc(fechaImpresa(c.vencimientoPago))}</span>
  </div>` : ''}

  <div class="receptor">
    <div class="fila">
      <span><b>${esc(etiquetaDoc(c.docTipo))}:</b> ${sinDoc ? '' : esc(c.docNro)}</span>
      <span><b>Apellido y Nombre / Razón Social:</b> ${esc(c.receptorNombre)}</span>
    </div>
    <div class="fila">
      <span><b>Condición frente al IVA:</b> ${esc(c.receptorCondicionIva)}</span>
      <span><b>Domicilio:</b> ${esc(c.receptorDomicilio)}</span>
    </div>
    <div class="fila">
      <span><b>Condición de venta:</b> ${esc(c.condicionVenta)}</span>
    </div>
  </div>

  <table class="detalle">
    <thead>
      <tr>
        <th class="c">Código</th><th>Producto / Servicio</th><th class="r">Cantidad</th>
        <th class="c">U. Medida</th><th class="r">Precio Unit.</th><th class="r">% Bonif</th>
        <th class="r">Imp. Bonif.</th><th class="r">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="c">001</td>
        <td>${esc(c.descripcion)}</td>
        <td class="r">1,00</td>
        <td class="c chico">otras<br/>unidades</td>
        <td class="r">${total}</td>
        <td class="r">0,00</td>
        <td class="r">0,00</td>
        <td class="r">${total}</td>
      </tr>
    </tbody>
  </table>

  <div class="totales">
    <div><span>Subtotal: $</span><b>${total}</b></div>
    <div><span>Importe Otros Tributos: $</span><b>0,00</b></div>
    <div><span>Importe Total: $</span><b>${total}</b></div>
  </div>

  <div class="pie">
    <div class="qr">
      ${o.qrDataUrl
        ? `<img src="${esc(o.qrDataUrl)}" alt="Código QR del comprobante" />`
        : `<div class="qr-falta">Falta el código QR</div>`}
      <div class="marca">ARCA</div>
      <div class="autorizado">Comprobante Autorizado</div>
      <div class="legal">Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación</div>
    </div>
    <div class="pagina">Pág. 1/1</div>
    <div class="cae">
      <div><b>CAE N°:</b> ${esc(c.cae)}</div>
      <div><b>Fecha de Vto. de CAE:</b> ${esc(fechaImpresa(c.vencimientoCae))}</div>
    </div>
  </div>
</section>`
}

/**
 * El documento completo, listo para abrir en una ventana e imprimir.
 *
 * Los estilos van embebidos a propósito: la ventana no carga nada de la app,
 * así que lo que se ve en pantalla es exactamente lo que sale impreso.
 */
export function facturaHtml(o: OpcionesFactura): string {
  const { comprobante: c } = o
  const titulo = `${nombreTipo(c.tipo)} ${String(c.puntoVenta).padStart(5, '0')}-${String(c.numero).padStart(8, '0')}`
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>${esc(titulo)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #000; background: #fff; }
  .hoja { border: 1px solid #000; padding: 0; page-break-after: always; }
  .hoja:last-child { page-break-after: auto; }
  .copia { text-align: center; font-size: 13pt; font-weight: bold; padding: 6px 0; border-bottom: 1px solid #000; }

  .cabecera { display: flex; position: relative; border-bottom: 1px solid #000; min-height: 115px; }
  .col { width: 50%; padding: 26px 10px 8px; }
  .izq { border-right: 1px solid #000; }
  /* El recuadro de la letra monta 27px sobre esta columna: sin este espacio
     la "F" de FACTURA queda tapada y se lee "ACTURA". */
  .der { padding-left: 40px; }
  .emisor-nombre { text-align: center; font-weight: bold; font-size: 11pt; margin-bottom: 14px; }
  .titulo { font-size: 19pt; font-weight: bold; margin-bottom: 8px; }
  .campo { margin: 3px 0; }
  .sep { height: 7px; }

  /* El recuadro de la letra monta sobre la division de las dos columnas,
     igual que en el comprobante de ARCA. */
  .letra { position: absolute; left: 50%; top: 0; transform: translateX(-50%);
           width: 54px; border: 1px solid #000; background: #fff; text-align: center; padding: 2px 0; }
  .letra-grande { font-size: 25pt; font-weight: bold; line-height: 1; }
  .letra-cod { font-size: 6.5pt; font-weight: bold; }

  .periodo { display: flex; justify-content: space-between; gap: 10px;
             padding: 6px 10px; border-bottom: 1px solid #000; font-size: 9.5pt; }
  .receptor { padding: 7px 10px; border-bottom: 1px solid #000; }
  .receptor .fila { display: flex; gap: 18px; margin: 4px 0; }
  .receptor .fila span { flex: 1; }

  .detalle { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .detalle th { background: #d9d9d9; border: 1px solid #000; padding: 4px 5px; font-size: 8pt; }
  .detalle td { padding: 5px; font-size: 8.5pt; vertical-align: top; }
  .detalle .r { text-align: right; }
  .detalle .c { text-align: center; }
  .detalle .chico { font-size: 7pt; }

  .totales { margin: 150px 10px 0; border: 1px solid #000; padding: 10px; }
  .totales div { display: flex; justify-content: flex-end; gap: 14px; margin: 5px 0; font-size: 10pt; }
  .totales span { font-weight: bold; }
  .totales b { min-width: 110px; text-align: right; }

  .pie { display: flex; align-items: flex-start; gap: 14px; padding: 14px 10px 10px; }
  .qr { width: 56%; }
  .qr img { width: 115px; height: 115px; float: left; margin-right: 10px; }
  .qr-falta { width: 115px; height: 115px; float: left; margin-right: 10px; border: 1px dashed #c00;
              color: #c00; font-size: 7.5pt; display: flex; align-items: center;
              justify-content: center; text-align: center; padding: 4px; }
  .marca { font-size: 15pt; font-weight: bold; letter-spacing: 1px; }
  .autorizado { font-style: italic; font-weight: bold; font-size: 9pt; margin-top: 16px; }
  .legal { font-size: 6pt; font-weight: bold; margin-top: 3px; }
  .pagina { width: 14%; text-align: center; font-weight: bold; font-size: 10pt; padding-top: 8px; }
  .cae { width: 30%; text-align: right; font-size: 10pt; padding-top: 8px; }
  .cae div { margin: 3px 0; }

  @media screen {
    body { background: #525659; padding: 16px; }
    .hoja { background: #fff; max-width: 210mm; margin: 0 auto 16px; }
  }
</style></head>
<body>${COPIAS.map((copia) => hoja(o, copia)).join('')}
<script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 350) })</script>
</body></html>`
}
