/** Layout de eventos SOLAPADOS en la vista de día/semana.
 *
 *  Antes cada bloque se dibujaba con `left-1 right-1`: ocupaba todo el ancho de
 *  la columna del día. Dos eventos a la misma hora se pisaban y solo se veía el
 *  último dibujado — el de abajo quedaba invisible.
 *
 *  Acá se reparten el ancho, como en Google Calendar:
 *   1. Se agrupan los que se tocan (directa o transitivamente) en un CLUSTER.
 *   2. Dentro del cluster, cada evento va a la primera columna libre — la
 *      primera cuyo último evento ya terminó antes de que este empiece.
 *   3. Todos los del cluster usan el mismo ancho = 1 / columnas-del-cluster.
 *
 *  El paso 2 importa: con A(9-10), B(9:30-10:30) y C(10:15-11), A y C NO se
 *  tocan, así que comparten columna y el cluster necesita 2 y no 3 → los
 *  bloques quedan el doble de anchos.
 *
 *  Trabaja en píxeles ya calculados (top/height), no en horas: la vista clipea
 *  los eventos que caen en horas ocultas, así que la geometría real es la única
 *  fuente de verdad de qué se pisa con qué. */

export interface PositionedBlock {
  id: string
  top: number
  height: number
}

export interface OverlapSlot {
  /** Offset desde el borde izquierdo de la columna del día, en %. */
  leftPct: number
  /** Ancho del bloque, en % de la columna del día. */
  widthPct: number
  /** Columna asignada dentro del cluster (0-based) y cuántas hay. Útil para
   *  apilar z-index o depurar. */
  column: number
  columns: number
}

/** Dos bloques se pisan si sus rangos verticales se cruzan. Tocarse por el
 *  borde (uno termina justo donde empieza el otro) NO es pisarse. */
function overlaps(a: PositionedBlock, b: PositionedBlock): boolean {
  return a.top < b.top + b.height && b.top < a.top + a.height
}

/** id → posición horizontal. Los ids que no estén en el resultado se dibujan
 *  como siempre (ancho completo). */
export function computeOverlapLayout(blocks: PositionedBlock[]): Map<string, OverlapSlot> {
  const out = new Map<string, OverlapSlot>()
  if (blocks.length === 0) return out

  // Orden estable: por inicio, después el más largo primero, y el id como
  // desempate final para que dos eventos idénticos no bailen entre renders.
  const sorted = [...blocks].sort((a, b) =>
    a.top - b.top
    || b.height - a.height
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )

  // ── 1) Clusters: se corta cuando un evento empieza después de que TODOS los
  //    anteriores del grupo terminaron.
  let cluster: PositionedBlock[] = []
  let clusterEnd = -Infinity

  const flush = () => {
    if (cluster.length === 0) return
    // ── 2) Columnas: primera libre.
    const columnEnds: number[] = []          // fin (px) del último bloque de cada columna
    const columnOf = new Map<string, number>()
    for (const b of cluster) {
      let col = columnEnds.findIndex((end) => end <= b.top)
      if (col === -1) { columnEnds.push(b.top + b.height); col = columnEnds.length - 1 }
      else columnEnds[col] = b.top + b.height
      columnOf.set(b.id, col)
    }
    // ── 3) Reparto del ancho.
    const columns = columnEnds.length
    const widthPct = 100 / columns
    for (const b of cluster) {
      const column = columnOf.get(b.id)!
      out.set(b.id, { leftPct: column * widthPct, widthPct, column, columns })
    }
    cluster = []
    clusterEnd = -Infinity
  }

  for (const b of sorted) {
    if (cluster.length > 0 && b.top >= clusterEnd) flush()
    cluster.push(b)
    clusterEnd = Math.max(clusterEnd, b.top + b.height)
  }
  flush()

  // Un bloque solo en su cluster no necesita repartir nada: se deja fuera del
  // map para que la vista lo dibuje a ancho completo, como siempre.
  for (const [id, slot] of [...out]) {
    if (slot.columns === 1) out.delete(id)
  }
  return out
}

/** Chequeo usado por los tests: ¿algún par de bloques comparte columna aunque
 *  se pisen? Si esto da true, el layout está mal. */
export function hasColumnCollision(
  blocks: PositionedBlock[],
  layout: Map<string, OverlapSlot>,
): boolean {
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j]
      if (!overlaps(a, b)) continue
      const la = layout.get(a.id), lb = layout.get(b.id)
      // Si se pisan, AMBOS tienen que estar posicionados y en columnas
      // distintas — si no, uno tapa al otro.
      if (!la || !lb) return true
      if (la.leftPct === lb.leftPct) return true
    }
  }
  return false
}
