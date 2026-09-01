/** Detector de "espacio declarado pero sin completar". Puro, con test.
 *
 *  Nace de un pedido textual del usuario: *"quiero tener el espacio para
 *  completar con la cifra o el objetivo que yo tenga. Si no hay objetivo, está
 *  el espacio, vos te das cuenta, me pedís que lo complete"*.
 *
 *  El caso que lo motivó es real y está en su plan del semestre 2026-H2:
 *
 *      "Generar retiros por $. del trading para fin de anio"
 *                            ↑ el signo peso y un punto. La cifra nunca llegó.
 *
 *  Un campo así **no está vacío** — cualquier chequeo de `trim() === ''` lo da
 *  por completo. Por eso hace falta mirar el CONTENIDO, no la presencia.
 *
 *  ── LA REGLA QUE ORDENA TODO ESTE ARCHIVO ────────────────────────────────
 *  **Nunca inventar el valor que falta.** Esto detecta y pregunta; jamás
 *  rellena. Un objetivo numérico inventado por Claude es peor que un hueco
 *  visible: se mide contra él y el resultado no significa nada.
 *
 *  ── SOBRE LA CONFIANZA ───────────────────────────────────────────────────
 *  Cada detección viaja con `confianza`. Las heurísticas de texto libre se
 *  equivocan, y una detección dudosa presentada como certeza hace que el
 *  usuario deje de creerle a la herramienta. `alta` = el patrón es inequívoco
 *  (un `$` sin dígitos detrás). `media` = probable pero podría ser prosa
 *  legítima. Nada se reporta por debajo de eso.
 */

export type TipoHueco = 'vacio' | 'placeholder' | 'cifra_faltante' | 'fecha_faltante'
export type Confianza = 'alta' | 'media'

export interface Hueco {
  tipo: TipoHueco
  confianza: Confianza
  /** Qué falta, en una palabra, para armar la pregunta: "monto", "número", … */
  faltaQue: string
  /** El fragmento exacto que disparó la detección. Sirve para citárselo. */
  evidencia?: string
}

/** Marcadores que la gente deja cuando piensa "esto lo completo después".
 *  Se comparan contra el texto entero ya normalizado, no como substring: un
 *  `?` suelto es un hueco, pero "¿cuánto?" adentro de una frase no. */
const PLACEHOLDERS_SOLOS = new Set([
  '?', '??', '???', '-', '--', '---', '_', '__', '___', '.', '..', '...',
  'x', 'xx', 'xxx', 'n/a', 'na', 'tbd', 'todo', 'pendiente', 'completar',
  'definir', 'a definir', 'por definir', 'ver', 'falta', 'sin definir',
])

/** Un `$` sin ningún dígito detrás. El símbolo existe para preceder a un
 *  número: sin número está truncado. El caso real del usuario, "$. del
 *  trading", cae exactamente acá. El `(?<!u)` deja pasar el "u$s". */
const SIMBOLO_SIN_CIFRA = /(?<!u)\$(?!\s*[\d.,]*\d)/i

/** "USD" y "ARS" escritos como palabra son distintos: en prosa se usan como
 *  sustantivo — *"comprar USD, dividirlo en dos meses"* no es un hueco, es una
 *  frase normal. Solo cuentan cuando lo que sigue es un marcador de faltante o
 *  el final del texto ("USD ___", "USD ?").
 *
 *  ⚠️ El punto y la coma quedan FUERA a propósito: son la puntuación de
 *  cualquier oración, y meterlos hacía que "comprar USD, comprar las cuentas"
 *  se reportara como monto faltante. Pasó de verdad al cargar el plan de
 *  septiembre. */
const PALABRA_SIN_CIFRA = /\b(?:usd|ars)\b(?=\s*(?:[_?\-]|$))/i

/** Una promesa de fecha sin fecha detrás. "para el ___", "antes del ?" */
const FECHA_SIN_FECHA = /\b(?:para el|antes del|hasta el|deadline|fecha l[ií]mite)\s*[:\-]?\s*(?:[_?.\-x]{1,6}\b|$)/i

/** Un número con el hueco adelante: "llegar a ___ clientes", "hacer X videos". */
const CANTIDAD_SIN_NUMERO = /\b(?:llegar a|alcanzar|hacer|conseguir|sumar|cerrar)\s+(?:[_?]{2,}|x{1,3}|n)\s+\w/i

/** Normaliza para comparar: minúsculas, sin acentos, sin espacios de más. */
function normalizar(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Devuelve el hueco encontrado, o `null` si el texto está completo.
 *
 * El orden importa: primero lo inequívoco (vacío, placeholder puro) y recién
 * después las heurísticas sobre prosa. Así un campo que dice solo "?" no se
 * reporta como "cifra faltante".
 */
export function detectarHueco(valor: unknown): Hueco | null {
  if (valor === null || valor === undefined) {
    return { tipo: 'vacio', confianza: 'alta', faltaQue: 'todo' }
  }
  const crudo = String(valor)
  const texto = crudo.trim()

  if (texto === '') return { tipo: 'vacio', confianza: 'alta', faltaQue: 'todo' }

  // Un checklist vacío se guarda como "[]" (JSON), no como string vacío.
  if (texto === '[]') return { tipo: 'vacio', confianza: 'alta', faltaQue: 'todo' }

  const norm = normalizar(texto)

  if (PLACEHOLDERS_SOLOS.has(norm)) {
    return { tipo: 'placeholder', confianza: 'alta', faltaQue: 'el contenido', evidencia: texto }
  }

  // "$." — la cifra que falta.
  const moneda = crudo.match(SIMBOLO_SIN_CIFRA) ?? crudo.match(PALABRA_SIN_CIFRA)
  if (moneda) {
    return {
      tipo: 'cifra_faltante',
      confianza: 'alta',
      faltaQue: 'el monto',
      evidencia: recorte(crudo, moneda.index ?? 0),
    }
  }

  const fecha = crudo.match(FECHA_SIN_FECHA)
  if (fecha) {
    return {
      tipo: 'fecha_faltante',
      confianza: 'media',
      faltaQue: 'la fecha',
      evidencia: recorte(crudo, fecha.index ?? 0),
    }
  }

  const cantidad = crudo.match(CANTIDAD_SIN_NUMERO)
  if (cantidad) {
    return {
      tipo: 'cifra_faltante',
      confianza: 'media',
      faltaQue: 'la cantidad',
      evidencia: recorte(crudo, cantidad.index ?? 0),
    }
  }

  return null
}

/** 40 caracteres alrededor del match, para citarlo sin volcar el campo entero. */
function recorte(texto: string, at: number): string {
  const desde = Math.max(0, at - 15)
  const hasta = Math.min(texto.length, at + 25)
  return (desde > 0 ? '…' : '') + texto.slice(desde, hasta).trim() + (hasta < texto.length ? '…' : '')
}

/** La pregunta que se le hace al usuario. Cita SU texto: reconocer lo que
 *  escribió es lo que hace que la pregunta no se sienta un formulario. */
export function preguntaPara(h: Hueco, contexto: { seccion: string; campo: string; periodo: string }): string {
  const donde = `En ${contexto.periodo}, "${contexto.seccion} › ${contexto.campo}"`
  switch (h.tipo) {
    case 'vacio':
      return `${donde} está en blanco. ¿Qué querés poner ahí?`
    case 'placeholder':
      return `${donde} quedó como "${h.evidencia}". ¿Lo completamos?`
    case 'cifra_faltante':
      return `${donde} escribiste «${h.evidencia}» — falta ${h.faltaQue}. ¿Cuánto?`
    case 'fecha_faltante':
      return `${donde} escribiste «${h.evidencia}» — falta ${h.faltaQue}. ¿Para cuándo?`
  }
}
