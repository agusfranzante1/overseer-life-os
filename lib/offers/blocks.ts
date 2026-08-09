/**
 * Bloques del editor tipo Notion.
 *
 * El documento es una lista de bloques. Un bloque de texto es un párrafo
 * suelto; un `toggle` (desplegable) y una `page` (subpágina) ocupan el renglón
 * entero y pueden tener bloques adentro.
 *
 * La operación central es `convertSelection`: agarrás un pedazo de texto de un
 * párrafo y lo convertís en desplegable o página. El párrafo se PARTE en hasta
 * tres: lo que quedaba antes, el bloque nuevo a lo ancho, y lo que quedaba
 * después. Eso es lo que hace que se sienta como Notion — el bloque nuevo
 * siempre arranca en su propio renglón y el texto sigue abajo.
 *
 * Todo acá es puro (sin React ni DOM) para poder testearlo solo.
 */

export type BlockType = 'text' | 'bullet' | 'toggle' | 'page'

export interface Block {
  id: string
  type: BlockType
  text: string
  /** Contenido de un toggle o de una página. Los 'text' no tienen. */
  children?: Block[]
  /** Solo toggle: si está cerrado. */
  collapsed?: boolean
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/** Los bloques "hoja" (texto y viñeta) no llevan hijos; los contenedores sí. */
export function isLeaf(type: BlockType): boolean {
  return type === 'text' || type === 'bullet'
}

export function emptyBlock(type: BlockType = 'text', text = ''): Block {
  return isLeaf(type)
    ? { id: newId(), type, text }
    : { id: newId(), type, text, children: [], ...(type === 'toggle' ? { collapsed: false } : {}) }
}

/** Documento vacío = un párrafo, para que siempre haya dónde escribir. */
export function emptyDoc(): Block[] {
  return [emptyBlock('text')]
}

/** Recorre el árbol y devuelve el bloque con ese id, o null. */
export function findBlock(blocks: Block[], id: string): Block | null {
  for (const b of blocks) {
    if (b.id === id) return b
    const inner = b.children ? findBlock(b.children, id) : null
    if (inner) return inner
  }
  return null
}

/** Aplica `fn` al bloque con ese id, devolviendo un árbol nuevo (inmutable).
 *  Si `fn` devuelve un array, ese bloque se REEMPLAZA por esos bloques —
 *  así una conversión puede partir un párrafo en tres de una sola pasada. */
export function replaceBlock(
  blocks: Block[],
  id: string,
  fn: (b: Block) => Block | Block[] | null,
): Block[] {
  const out: Block[] = []
  for (const b of blocks) {
    if (b.id === id) {
      const res = fn(b)
      if (res === null) continue
      if (Array.isArray(res)) out.push(...res)
      else out.push(res)
      continue
    }
    if (b.children) {
      const kids = replaceBlock(b.children, id, fn)
      out.push(kids === b.children ? b : { ...b, children: kids })
    } else {
      out.push(b)
    }
  }
  return out
}

/** Inserta `block` justo después del bloque `afterId` (a cualquier nivel). */
export function insertAfter(blocks: Block[], afterId: string, block: Block): Block[] {
  return replaceBlock(blocks, afterId, (b) => [b, block])
}

/** Mete `block` como último hijo del contenedor `parentId`. */
export function appendChild(blocks: Block[], parentId: string, block: Block): Block[] {
  return replaceBlock(blocks, parentId, (b) => ({
    ...b,
    children: [...(b.children ?? []), block],
  }))
}

export function removeBlock(blocks: Block[], id: string): Block[] {
  return replaceBlock(blocks, id, () => null)
}

export function setText(blocks: Block[], id: string, text: string): Block[] {
  return replaceBlock(blocks, id, (b) => ({ ...b, text }))
}

export function toggleCollapsed(blocks: Block[], id: string): Block[] {
  return replaceBlock(blocks, id, (b) => ({ ...b, collapsed: !b.collapsed }))
}

export interface ConvertResult {
  blocks: Block[]
  /** Id del bloque creado — para enfocarlo o abrir la página recién hecha. */
  newBlockId: string | null
}

/**
 * Convierte el fragmento [start, end) de un bloque de texto en un `toggle` o
 * una `page`.
 *
 * El párrafo original se parte:
 *   "hola MUNDO chau"  + convertir "MUNDO" en toggle
 *   →  ["hola"]  [toggle "MUNDO"]  ["chau"]
 *
 * Los pedazos vacíos no se crean (si seleccionaste desde el principio, no
 * queda un párrafo vacío colgando arriba). Si el bloque no es de texto, o la
 * selección está vacía, no se toca nada.
 */
export function convertSelection(
  blocks: Block[],
  blockId: string,
  start: number,
  end: number,
  type: Exclude<BlockType, 'text'>,
): ConvertResult {
  const target = findBlock(blocks, blockId)
  // Se puede convertir desde un párrafo o desde una viñeta: los dos son texto.
  if (!target || !isLeaf(target.type)) return { blocks, newBlockId: null }

  const from = Math.max(0, Math.min(start, end))
  const to = Math.min(target.text.length, Math.max(start, end))
  const selected = target.text.slice(from, to).trim()
  if (!selected) return { blocks, newBlockId: null }

  const before = target.text.slice(0, from).trim()
  const after = target.text.slice(to).trim()
  const created = emptyBlock(type, selected)

  const next = replaceBlock(blocks, blockId, () => {
    const parts: Block[] = []
    if (before) parts.push({ ...target, text: before })
    parts.push(created)
    // El "resto" va en un bloque NUEVO (id nuevo) para no duplicar el id del
    // original si también hubo un pedazo antes.
    if (after) parts.push(emptyBlock(target.type, after))
    return parts
  })
  return { blocks: next, newBlockId: created.id }
}

/** Título que se muestra para una página/toggle sin texto. */
export function blockLabel(b: Block): string {
  return b.text.trim() || (b.type === 'page' ? 'Página sin título' : 'Sin título')
}

/** Cuenta bloques (para mostrar "N elementos" en una página). */
export function countChildren(b: Block): number {
  return (b.children ?? []).filter((c) => c.type !== 'text' || c.text.trim() !== '').length
}
