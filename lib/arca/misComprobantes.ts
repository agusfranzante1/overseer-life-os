/**
 * Lectura del CSV que exporta "Mis Comprobantes" de ARCA (emitidos).
 *
 * ── Por qué existe ──────────────────────────────────────────────────────
 * El webservice NO deja consultar los puntos de venta de "Factura en Línea"
 * (error 11002, confirmado el 2026-10-09 con el PV 1 del usuario). Todo lo
 * facturado por la web de ARCA —en su caso, 135 facturas— solo se puede traer
 * con este export.
 *
 * ── De dónde sale ───────────────────────────────────────────────────────
 * Portado del proyecto `cuenca` (`src/lib/arca.ts` + `src/lib/importar.ts`),
 * que ya lo tenía maduro: ARCA cambió el formato más de una vez ("Fecha" o
 * "Fecha de Emisión", tipo con código o con texto, coma o punto y coma), así
 * que las columnas se reconocen por sinónimos y no por posición.
 *
 * Todo puro: corre en el navegador sobre el archivo que sube el usuario, sin
 * clave fiscal y sin tocar ARCA.
 */
import { idComprobante } from './comprobante'
import type { ComprobanteArca } from '@/lib/store/arcaStore'

// ─── Lectura genérica de CSV (de cuenca/importar.ts) ────────────────────────

/** Minúsculas, sin acentos y sin signos: para comparar encabezados escritos de mil formas. */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()
}

/** UTF-8 si el archivo lo es; si no, Windows-1252 (lo que suelen exportar los sistemas acá). */
export function decodificar(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

function contarFueraDeComillas(linea: string, sep: string): number {
  let n = 0
  let comillas = false
  for (const c of linea) {
    if (c === '"') comillas = !comillas
    else if (c === sep && !comillas) n++
  }
  return n
}

/** El separador que divide las líneas en la misma cantidad de columnas. */
export function detectarSeparador(texto: string): string {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 40)
  let mejor = ';'
  let puntaje = 0
  for (const sep of [';', ',', '\t', '|']) {
    const cuentas = lineas.map((l) => contarFueraDeComillas(l, sep)).filter((n) => n > 0)
    if (!cuentas.length) continue
    const frecuencia = new Map<number, number>()
    for (const n of cuentas) frecuencia.set(n, (frecuencia.get(n) ?? 0) + 1)
    const [columnas, veces] = [...frecuencia.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]
    const p = veces * 100 + columnas
    if (p > puntaje) { puntaje = p; mejor = sep }
  }
  return mejor
}

/** CSV con comillas, comillas dobles escapadas y saltos de línea dentro de un campo. */
export function leerCsv(texto: string, sep = detectarSeparador(texto)): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let comillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (comillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++ } else comillas = false
      } else campo += c
    } else if (c === '"') comillas = true
    else if (c === sep) { fila.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo); filas.push(fila); fila = []; campo = ''
    } else campo += c
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila) }
  return filas.map((f) => f.map((x) => x.trim())).filter((f) => f.some((x) => x !== ''))
}

/** "1.234,56", "1234.56", "$ 1.234,56", "(1.234,56)" → CENTAVOS, o null si no es un número. */
export function importeAr(entrada: string | null | undefined): number | null {
  if (entrada === null || entrada === undefined) return null
  let s = String(entrada).trim()
  if (!s) return null
  let negativo = false
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1) }
  if (/-\s*$/.test(s)) { negativo = true; s = s.replace(/-\s*$/, '') }
  if (/^\s*\$?\s*[-−]/.test(s)) negativo = true
  s = s.replace(/[^\d,.]/g, '')
  if (!/\d/.test(s)) return null
  const coma = s.lastIndexOf(',')
  const punto = s.lastIndexOf('.')
  if (coma > -1 && punto > -1) {
    // El separador decimal es el que aparece más a la derecha.
    s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (coma > -1) {
    // Varias comas, o una que deja tres dígitos: separa miles.
    const varias = s.indexOf(',') !== coma
    s = varias || s.length - coma - 1 === 3 ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (punto > -1) {
    const partes = s.split('.')
    const dec = s.length - punto - 1
    if (partes.length > 2 || dec === 3) s = s.replace(/\./g, '')
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  const cents = Math.round(n * 100)
  return negativo ? -cents : cents
}

function esFechaValida(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number)
  const f = new Date(Date.UTC(y, m - 1, d))
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d
}

/** 31/12/2026, 31-12-26, 2026-12-31, 20261231 → `YYYY-MM-DD`. */
export function fechaAr(entrada: string | null | undefined): string | null {
  if (!entrada) return null
  const s = String(entrada).trim()
  const dos = (n: number) => String(n).padStart(2, '0')
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s)
  if (m) {
    const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    const iso = `${anio}-${dos(Number(m[2]))}-${dos(Number(m[1]))}`
    return esFechaValida(iso) ? iso : null
  }
  m = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/.exec(s)
  if (m) {
    const iso = `${m[1]}-${dos(Number(m[2]))}-${dos(Number(m[3]))}`
    return esFechaValida(iso) ? iso : null
  }
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s)
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}`
    return esFechaValida(iso) ? iso : null
  }
  return null
}

/** Qué columna corresponde a cada campo. Una columna asignada no se reutiliza:
 *  "Tipo Doc. Receptor" no puede quedar como el tipo de COMPROBANTE. */
export function mapearColumnas<C extends string>(
  encabezados: string[], campos: Record<C, readonly string[]>,
): Partial<Record<C, number>> {
  const norm = encabezados.map(normalizar)
  const usadas = new Set<number>()
  const mapa: Partial<Record<C, number>> = {}
  for (const campo of Object.keys(campos) as C[]) {
    const sinonimos = campos[campo].map(normalizar)
    let elegida = -1
    let calidad = 0
    norm.forEach((h, i) => {
      if (usadas.has(i) || !h) return
      for (const s of sinonimos) {
        const q = h === s ? 3 : h.startsWith(`${s} `) || h.endsWith(` ${s}`) ? 2 : h.includes(s) ? 1 : 0
        if (q > calidad) { calidad = q; elegida = i }
      }
    })
    if (elegida >= 0) { mapa[campo] = elegida; usadas.add(elegida) }
  }
  return mapa
}

/** La fila de encabezados: ARCA a veces pone renglones arriba (CUIT, período…). */
export function detectarEncabezado<C extends string>(
  filas: string[][], campos: Record<C, readonly string[]>, minimos = 2,
): { fila: number; mapa: Partial<Record<C, number>> } | null {
  let mejor: { fila: number; mapa: Partial<Record<C, number>>; puntos: number } | null = null
  for (let i = 0; i < Math.min(filas.length, 40); i++) {
    const mapa = mapearColumnas(filas[i], campos)
    const puntos = Object.keys(mapa).length
    if (puntos >= minimos && (!mejor || puntos > mejor.puntos)) mejor = { fila: i, mapa, puntos }
  }
  return mejor ? { fila: mejor.fila, mapa: mejor.mapa } : null
}

// ─── Lo propio de Mis Comprobantes (de cuenca/arca.ts) ──────────────────────

/** Sinónimos de cada columna. El ORDEN importa: "tipo" se resuelve antes que
 *  "tipoDoc", y como una columna no se reutiliza, la exacta gana. */
export const CAMPOS_ARCA = {
  fecha: ['fecha de emision', 'fecha', 'fecha emision', 'fecha de comprobante'],
  tipo: ['tipo de comprobante', 'tipo', 'tipo comprobante'],
  puntoVenta: ['punto de venta', 'pto vta', 'punto venta', 'pv'],
  numero: ['numero desde', 'numero de comprobante', 'nro desde', 'numero'],
  cae: ['cod autorizacion', 'codigo de autorizacion', 'cae', 'cod de autorizacion'],
  tipoDoc: ['tipo doc receptor', 'tipo de documento receptor', 'tipo doc'],
  nroDoc: ['nro doc receptor', 'numero de documento receptor', 'nro doc', 'numero de documento'],
  denominacion: ['denominacion receptor', 'denominacion', 'razon social'],
  moneda: ['moneda'],
  total: ['imp total', 'importe total', 'total'],
} as const
type CampoArca = keyof typeof CAMPOS_ARCA

/** Código de ARCA del tipo de comprobante: "11 - Factura C", "11" o "Factura C". */
export function codigoDeTipo(texto: string): number | null {
  const m = /^\s*(\d{1,3})\b/.exec(texto)
  if (m) return Number(m[1])
  const n = normalizar(texto)
  const porNombre: [RegExp, number][] = [
    [/nota de credito \bc\b/, 13], [/nota de debito \bc\b/, 12], [/factura \bc\b/, 11],
    [/nota de credito \bb\b/, 8], [/nota de debito \bb\b/, 7], [/factura \bb\b/, 6],
    [/nota de credito \ba\b/, 3], [/nota de debito \ba\b/, 2], [/factura \ba\b/, 1],
  ]
  for (const [re, cod] of porNombre) if (re.test(n)) return cod
  return null
}

/** "CUIT", "80", "DNI"… → código de documento de ARCA. Sin dato, consumidor final. */
export function codigoDeDocumento(texto: string): number {
  const m = /^\s*(\d{1,3})\b/.exec(texto)
  if (m) return Number(m[1])
  const n = normalizar(texto)
  if (n.includes('cuit')) return 80
  if (n.includes('cuil')) return 86
  if (n.includes('dni')) return 96
  return 99
}

export interface LecturaMisComprobantes {
  comprobantes: ComprobanteArca[]
  /** Filas que no se pudieron leer, con el motivo: se muestran, no se tragan. */
  descartadas: { fila: number; motivo: string }[]
}

/**
 * Del texto del CSV a comprobantes listos para el store.
 *
 * Siempre son de PRODUCCIÓN: "Mis Comprobantes" solo existe ahí, y un
 * comprobante de este archivo es una factura real.
 *
 * El `concepto` (productos/servicios) **no viene en el archivo**, así que va
 * en 0 = "no se sabe". No se inventa: el formulario, al repetir uno de estos,
 * no lo pisa y deja el que tenga elegido.
 *
 * Rechaza el export de RECIBIDOS: son facturas de tus proveedores, no tuyas,
 * y meterlas como emitidas inflaría lo facturado.
 */
export function interpretarMisComprobantes(texto: string): LecturaMisComprobantes | { error: string } {
  const filas = leerCsv(texto)
  if (!filas.length) return { error: 'El archivo está vacío.' }
  const det = detectarEncabezado(filas, CAMPOS_ARCA, 5)
  if (!det) {
    return { error: 'No parece un archivo de Mis Comprobantes: no encontré las columnas de fecha, tipo, punto de venta, número e importe total.' }
  }
  const encabezados = filas[det.fila]
  const encNorm = encabezados.map(normalizar).join(' | ')
  if (/emisor|vendedor/.test(encNorm) && !/receptor|comprador/.test(encNorm)) {
    return { error: 'Este es el export de comprobantes RECIBIDOS (los que te facturaron a vos). Para traer tus facturas, en Mis Comprobantes elegí "Emitidos".' }
  }
  const mapa = mapearColumnas(encabezados, CAMPOS_ARCA)
  for (const [c, nombre] of [['fecha', 'Fecha'], ['tipo', 'Tipo'], ['puntoVenta', 'Punto de Venta'],
    ['numero', 'Número Desde'], ['total', 'Imp. Total']] as const) {
    if (mapa[c] === undefined) return { error: `Falta la columna "${nombre}".` }
  }

  const celda = (f: string[], c: CampoArca) => (mapa[c] === undefined ? '' : (f[mapa[c]!] ?? ''))
  const comprobantes: ComprobanteArca[] = []
  const descartadas: LecturaMisComprobantes['descartadas'] = []
  const ahora = new Date().toISOString()

  for (let i = det.fila + 1; i < filas.length && comprobantes.length < 20_000; i++) {
    const f = filas[i]
    const fecha = fechaAr(celda(f, 'fecha'))
    const tipo = codigoDeTipo(celda(f, 'tipo'))
    const puntoVenta = Number(celda(f, 'puntoVenta').replace(/\D/g, ''))
    const numero = Number(celda(f, 'numero').replace(/\D/g, ''))
    if (!fecha || !tipo || !puntoVenta || !numero) {
      // Una fila casi vacía es relleno del archivo, no un dato perdido.
      if (f.filter(Boolean).length > 2) descartadas.push({ fila: i + 1, motivo: 'Sin fecha, tipo, punto de venta o número' })
      continue
    }
    const totalCents = importeAr(celda(f, 'total'))
    if (totalCents === null) { descartadas.push({ fila: i + 1, motivo: 'Sin importe total' }); continue }

    const monedaCruda = celda(f, 'moneda').trim().toUpperCase()
    const moneda = !monedaCruda || monedaCruda === '$' ? 'PES' : monedaCruda
    const docNro = celda(f, 'nroDoc').replace(/\D/g, '') || '0'
    const docTipo = docNro === '0' ? 99 : codigoDeDocumento(celda(f, 'tipoDoc') || 'CUIT')

    comprobantes.push({
      id: idComprobante('produccion', puntoVenta, tipo, numero),
      entorno: 'produccion',
      puntoVenta, tipo, numero, fecha,
      concepto: 0,
      docTipo, docNro,
      importe: totalCents / 100,
      cae: celda(f, 'cae').replace(/\D/g, '') || undefined,
      descripcion: '',
      receptorNombre: celda(f, 'denominacion').trim().slice(0, 200),
      resultado: 'A',
      // Una factura en moneda extranjera: el importe es en ESA moneda. Se dice.
      observaciones: moneda === 'PES' ? [] : [`Importe en ${moneda}`],
      origen: 'importado',
      createdAt: ahora,
      updatedAt: ahora,
    })
  }
  return { comprobantes, descartadas }
}
