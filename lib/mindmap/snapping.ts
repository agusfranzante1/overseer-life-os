// Alignment guides ("smart guides") para el canvas de mapas mentales.
//
// Problema que resuelve: mover nodos es totalmente libre, así que al intentar
// correr un nodo un poco a la derecha terminás desalineándolo verticalmente sin
// darte cuenta. Igual que en Figma/Miro, mientras arrastrás detectamos cuando
// el nodo queda casi alineado con otro y lo enganchamos, dibujando la línea de
// referencia para que se vea CONTRA QUÉ nodo se está alineando.
//
// Todo acá es puro (sin React, sin DOM) para poder razonarlo y testearlo solo.

export interface SnapRect {
  x: number       // coords de canvas, esquina superior izquierda
  y: number
  width: number
  height: number
}

export interface AlignGuide {
  /** 'x' = línea VERTICAL (alinea izquierda/centro/derecha).
   *  'y' = línea HORIZONTAL (alinea arriba/centro/abajo). */
  axis: 'x' | 'y'
  /** Coordenada de canvas donde va la línea. */
  pos: number
  /** Extremos del segmento sobre el eje perpendicular, para que la línea
   *  cubra exactamente desde el nodo arrastrado hasta el de referencia. */
  start: number
  end: number
  /** true si la línea pasa por el CENTRO del nodo que se está moviendo (y no
   *  por uno de sus bordes). Se dibuja distinto: cuando dos nodos del mismo
   *  tamaño quedan alineados salen las tres líneas juntas, y así se distingue
   *  de un vistazo cuál es la del medio. */
  center: boolean
}

export interface SnapResult {
  /** Corrección a SUMAR a la posición cruda para que quede alineada. */
  dx: number
  dy: number
  guides: AlignGuide[]
}

/** Tolerancia por defecto, en PÍXELES DE PANTALLA. Quien llama debe dividirla
 *  por el zoom: con el canvas alejado, 6px de pantalla son muchas más unidades
 *  de canvas, y si no se ajusta el snap se vuelve pegajoso al alejarse. */
export const SNAP_TOLERANCE_PX = 6

/** Margen de igualdad para comparar coordenadas en float. */
const EPS = 0.01

/** Las tres líneas candidatas de un rect sobre el eje X: izquierda, centro,
 *  derecha. (Sobre Y: arriba, centro, abajo.) */
function edgesX(r: SnapRect): number[] {
  return [r.x, r.x + r.width / 2, r.x + r.width]
}
function edgesY(r: SnapRect): number[] {
  return [r.y, r.y + r.height / 2, r.y + r.height]
}

function centerX(r: SnapRect) { return r.x + r.width / 2 }
function centerY(r: SnapRect) { return r.y + r.height / 2 }

/** Distancia entre centros — se usa SOLO para desempatar. Si dos nodos ofrecen
 *  la misma corrección, gana el más cercano, que es contra el que el usuario
 *  intuitivamente está alineando. */
function centerDistance(a: SnapRect, b: SnapRect): number {
  return Math.hypot(centerX(a) - centerX(b), centerY(a) - centerY(b))
}

interface Candidate {
  delta: number    // cuánto hay que mover el rect
  score: number    // cuántas alineaciones quedan satisfechas con ese delta
  nearest: number  // distancia al vecino alineado más cercano (último desempate)
}

/**
 * Mejor corrección sobre un eje.
 *
 * La decisión NO es "el borde más cercano gana". Se enumeran todos los
 * desplazamientos que producen alguna alineación y se elige el que satisface
 * MÁS alineaciones a la vez.
 *
 * Por qué: si tenés un vecino suelto a la derecha y una columna de nodos a la
 * izquierda, con el criterio de cercanía ganaba siempre el de la derecha por
 * estar más cerca — aunque estuvieras armando la columna de la izquierda.
 * Puntuando por cantidad de alineaciones, la columna pesa más y gana, que es
 * lo que uno está tratando de hacer. Recién a igualdad de puntaje decide la
 * corrección más chica, y después la cercanía.
 */
function bestCandidate(
  moving: SnapRect,
  others: SnapRect[],
  tolerance: number,
  edgesOf: (r: SnapRect) => number[],
): Candidate | null {
  const movingEdges = edgesOf(moving)

  // Desplazamientos candidatos: los que alinean alguna línea del nodo movido
  // con alguna de algún vecino, dentro de la tolerancia.
  const deltas: number[] = []
  for (const other of others) {
    for (const otherEdge of edgesOf(other)) {
      for (const movingEdge of movingEdges) {
        const delta = otherEdge - movingEdge
        if (Math.abs(delta) > tolerance) continue
        if (!deltas.some((d) => Math.abs(d - delta) <= EPS)) deltas.push(delta)
      }
    }
  }
  if (deltas.length === 0) return null

  let best: Candidate | null = null
  for (const delta of deltas) {
    let score = 0
    let nearest = Infinity
    for (const other of others) {
      let matches = 0
      for (const movingEdge of movingEdges) {
        for (const otherEdge of edgesOf(other)) {
          if (Math.abs(otherEdge - (movingEdge + delta)) <= EPS) matches++
        }
      }
      if (matches > 0) {
        score += matches
        nearest = Math.min(nearest, centerDistance(moving, other))
      }
    }
    const cand: Candidate = { delta, score, nearest }
    const better =
      best === null ||
      cand.score > best.score ||
      (cand.score === best.score && Math.abs(cand.delta) < Math.abs(best.delta) - EPS) ||
      (cand.score === best.score &&
        Math.abs(cand.delta) <= Math.abs(best.delta) + EPS &&
        cand.nearest < best.nearest)
    if (better) best = cand
  }
  return best
}

/** Todas las líneas que se cumplen sobre un eje en la posición YA ENGANCHADA.
 *
 *  Ojo: no alcanza con dibujar la que ganó el cálculo del delta. Cuando dos
 *  nodos tienen el mismo ancho, alinear por izquierda, por centro y por derecha
 *  dan EXACTAMENTE la misma corrección — el ganador se decide por orden de
 *  iteración y siempre salía el borde izquierdo, así que el centro y el borde
 *  derecho no se veían nunca aunque estuvieran igual de alineados.
 *
 *  Acá recorremos las tres líneas del nodo movido contra las tres de cada
 *  vecino y emitimos una guía por cada coordenada distinta que coincida. */
function guidesOnAxis(
  axis: 'x' | 'y',
  snappedMoving: SnapRect,
  others: SnapRect[],
): AlignGuide[] {
  const edgesOf = axis === 'x' ? edgesX : edgesY
  const movingEdges = edgesOf(snappedMoving)
  const positions: number[] = []
  for (const other of others) {
    for (const otherEdge of edgesOf(other)) {
      // ¿Alguna línea del nodo movido cae justo acá?
      if (!movingEdges.some((me) => Math.abs(me - otherEdge) <= EPS)) continue
      // Evitar duplicar la misma línea si varios vecinos la comparten:
      // buildGuide ya se encarga de estirarla sobre todos ellos.
      if (positions.some((p) => Math.abs(p - otherEdge) <= EPS)) continue
      positions.push(otherEdge)
    }
  }
  return positions.map((pos) => buildGuide(axis, pos, snappedMoving, others))
}

/** Construye la guía visual: la línea se extiende para cubrir el nodo movido
 *  YA ALINEADO más todos los otros nodos que comparten esa misma coordenada
 *  (si hay tres alineados, la línea los cruza a los tres, como en Figma). */
function buildGuide(
  axis: 'x' | 'y',
  pos: number,
  snappedMoving: SnapRect,
  others: SnapRect[],
): AlignGuide {
  const edgesOf = axis === 'x' ? edgesX : edgesY
  // Sobre el eje perpendicular es donde se estira la línea.
  const spanLo = (r: SnapRect) => (axis === 'x' ? r.y : r.x)
  const spanHi = (r: SnapRect) => (axis === 'x' ? r.y + r.height : r.x + r.width)

  let lo = spanLo(snappedMoving)
  let hi = spanHi(snappedMoving)
  for (const other of others) {
    if (!edgesOf(other).some((e) => Math.abs(e - pos) <= EPS)) continue
    lo = Math.min(lo, spanLo(other))
    hi = Math.max(hi, spanHi(other))
  }
  const movingCenter = axis === 'x' ? centerX(snappedMoving) : centerY(snappedMoving)
  return { axis, pos, start: lo, end: hi, center: Math.abs(pos - movingCenter) <= EPS }
}

/**
 * Calcula el enganche de `moving` contra `others`.
 *
 * Los ejes se resuelven de forma INDEPENDIENTE: podés quedar enganchado
 * verticalmente contra un nodo y horizontalmente contra otro distinto. Eso es
 * justamente lo que se quiere al mover un nodo "un poco al costado" sin perder
 * la alineación que ya tenía con el de arriba.
 *
 * @param moving    rect del nodo (o bounding box de la selección) en su
 *                  posición CRUDA, sin corregir.
 * @param others    rects de los nodos que NO se están moviendo.
 * @param tolerance máxima corrección aceptada, en unidades de canvas
 *                  (típicamente SNAP_TOLERANCE_PX / zoom).
 */
export function computeSnap(
  moving: SnapRect,
  others: SnapRect[],
  tolerance: number,
): SnapResult {
  if (others.length === 0 || tolerance <= 0) return { dx: 0, dy: 0, guides: [] }

  const bestX = bestCandidate(moving, others, tolerance, edgesX)
  const bestY = bestCandidate(moving, others, tolerance, edgesY)

  const dx = bestX?.delta ?? 0
  const dy = bestY?.delta ?? 0
  const snapped: SnapRect = { ...moving, x: moving.x + dx, y: moving.y + dy }

  // Se emiten TODAS las alineaciones que quedan satisfechas, no solo la que
  // ganó el cálculo: si el nodo queda alineado por izquierda con uno y por
  // derecha con otro, se ven las dos líneas. Y si además coinciden los
  // centros, se ve la del centro.
  const guides: AlignGuide[] = [
    ...guidesOnAxis('x', snapped, others),
    ...guidesOnAxis('y', snapped, others),
  ]
  return { dx, dy, guides }
}

/** Bounding box de varios rects — para arrastrar una multi-selección como un
 *  bloque: se alinea la caja completa, no cada nodo por separado. */
export function unionRect(rects: SnapRect[]): SnapRect | null {
  if (rects.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.width)
    maxY = Math.max(maxY, r.y + r.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
