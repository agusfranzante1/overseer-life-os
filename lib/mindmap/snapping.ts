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
  delta: number   // cuánto hay que mover el rect para alinear
  pos: number     // coordenada de la línea resultante
  dist: number    // distancia al nodo de referencia (desempate)
}

/** Mejor alineación sobre un eje: la de menor corrección; a igual corrección,
 *  la del nodo más cercano. */
function bestCandidate(
  moving: SnapRect,
  others: SnapRect[],
  tolerance: number,
  edgesOf: (r: SnapRect) => number[],
): Candidate | null {
  let best: Candidate | null = null
  for (const other of others) {
    const dist = centerDistance(moving, other)
    for (const movingEdge of edgesOf(moving)) {
      for (const otherEdge of edgesOf(other)) {
        const delta = otherEdge - movingEdge
        const abs = Math.abs(delta)
        if (abs > tolerance) continue
        if (
          best === null ||
          abs < Math.abs(best.delta) - EPS ||
          // Empate en corrección → desempata el nodo más cercano.
          (abs <= Math.abs(best.delta) + EPS && dist < best.dist)
        ) {
          best = { delta, pos: otherEdge, dist }
        }
      }
    }
  }
  return best
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
  return { axis, pos, start: lo, end: hi }
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

  const guides: AlignGuide[] = []
  if (bestX) guides.push(buildGuide('x', bestX.pos, snapped, others))
  if (bestY) guides.push(buildGuide('y', bestY.pos, snapped, others))
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
