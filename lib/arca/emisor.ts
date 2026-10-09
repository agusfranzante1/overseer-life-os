/**
 * Tus datos como emisor: lo que la factura tiene que mostrar de vos.
 *
 * Esto NO viaja a ARCA (ARCA ya sabe quién sos por el CUIT del certificado):
 * existe porque el comprobante impreso lo tiene que llevar, y facturando por
 * webservice el PDF lo emitimos nosotros, no ARCA.
 *
 * Se carga una vez y queda. Vive en el blob `app_preferences`, así que
 * sincroniza entre dispositivos como el resto de la configuración.
 */

export interface DatosEmisor {
  /** "FRANZANTE AGUSTIN HUGO" — como figura en ARCA, no un nombre de fantasía. */
  razonSocial: string
  domicilioComercial: string
  /** Para un monotributista, "Responsable Monotributo". */
  condicionIva: string
  /** Suele ser el mismo número que el CUIT. */
  ingresosBrutos: string
  /** `YYYY-MM-DD`. Se imprime como DD/MM/YYYY. */
  inicioActividades: string
}

export const EMISOR_VACIO: DatosEmisor = {
  razonSocial: '',
  domicilioComercial: '',
  condicionIva: 'Responsable Monotributo',
  ingresosBrutos: '',
  inicioActividades: '',
}

const ETIQUETAS: Record<keyof DatosEmisor, string> = {
  razonSocial: 'Razón social',
  domicilioComercial: 'Domicilio comercial',
  condicionIva: 'Condición frente al IVA',
  ingresosBrutos: 'Ingresos brutos',
  inicioActividades: 'Fecha de inicio de actividades',
}

/**
 * Qué falta para poder imprimir una factura válida.
 *
 * Son todos obligatorios en el comprobante: no es una validación nuestra, es
 * lo que tiene que decir el papel. Se listan por nombre para que la pantalla
 * diga QUÉ falta en vez de un "completá tus datos" que no ayuda.
 */
export function camposFaltantesEmisor(e: Partial<DatosEmisor> | undefined): string[] {
  const d = e ?? {}
  return (Object.keys(ETIQUETAS) as (keyof DatosEmisor)[])
    .filter((k) => !String(d[k] ?? '').trim())
    .map((k) => ETIQUETAS[k])
}

export function emisorCompleto(e: Partial<DatosEmisor> | undefined): e is DatosEmisor {
  return camposFaltantesEmisor(e).length === 0
}
