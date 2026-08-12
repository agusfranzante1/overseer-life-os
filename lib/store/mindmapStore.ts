'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { deleteMindmapImage } from '@/lib/mindmap/imageUpload'

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Visual shape used to render a node.
 *   - 'rect'    → rounded rectangle (default, current behavior)
 *   - 'circle'  → ellipse inscribed in the bounding box (becomes a true
 *                 circle when width === height)
 *   - 'bracket' → corchete/llave/paréntesis vectorizado (SVG) para AGRUPAR
 *                 visualmente. No tiene texto; su tipo y orientación viven en
 *                 `bracketKind` / `bracketDir`.
 *   - 'text'    → texto puro, sin borde, fondo ni caja visible. */
export type MindMapNodeShape = 'rect' | 'circle' | 'bracket' | 'text'

export interface MindMapNode {
  id: string
  x: number          // canvas coords (top-left of the bounding box)
  y: number
  width: number      // explicit so drag math is clean
  height: number
  text: string
  /** Optional accent color (border / text). Defaults to indigo. */
  color?: string
  /** Optional shape. Undefined = 'rect' for back-compat with maps created
   *  before this field existed. */
  shape?: MindMapNodeShape
  /** Solo para shape==='bracket': qué corchete y hacia dónde abre. */
  bracketKind?: import('@/lib/mindmap/brackets').BracketKind   // 'square' | 'curly' | 'round'
  bracketDir?: import('@/lib/mindmap/brackets').BracketDir     // 'left' | 'right' | 'top' | 'bottom'
  /** Optional text size in pixels. Undefined = 14 (text-sm) for back-compat
   *  with maps created before this field existed. The user can bump it from
   *  the toolbar; auto-grow logic factors it into the measured height. */
  fontSize?: number
  /** Si está seteado, este nodo está VINCULADO a otro mapa mental. Se muestra
   *  un botón 🔗 que, al clickear, abre ese mapa. Se setea escribiendo `@` en
   *  el texto del nodo y eligiendo un mapa del menú. */
  linkedMapId?: string
  /** URL pública de una imagen (bucket `mindmap-images`). Cuando está seteada,
   *  el nodo se renderiza como "nodo imagen": la foto llena la caja, clipeada
   *  a los bordes redondeados (o al círculo si shape==='circle'). El texto se
   *  oculta. Sigue siendo movible/redimensionable como cualquier nodo. */
  imageUrl?: string
  /** Path del objeto en Storage (<userId>/<mapId>/<imageId>.<ext>). Lo
   *  guardamos para poder borrar el archivo cuando se borra el nodo. */
  imagePath?: string
  /** Cómo encaja la imagen en la caja. 'cover' (default) llena y recorta;
   *  'contain' muestra la imagen completa con posible letterbox. */
  imageFit?: 'cover' | 'contain'
}

/** Visual shape used to render the connector between two nodes.
 *   - 'straight'    → direct line, single break point at midpoint
 *   - 'curved'      → smooth cubic bezier, break point at curve midpoint
 *   - 'orthogonal'  → L-shape elbow with right-angle corners (break points
 *                     at each corner); default 90° for now, 45° chamfers
 *                     could be added later as a sub-variant. */
export type MindMapEdgeShape = 'straight' | 'curved' | 'orthogonal'

/** Modo de alineación de un conjunto de nodos, relativo a la bounding box de
 *  la selección (estilo Figma):
 *   - horizontal: 'left' | 'hcenter' | 'right' → comparten borde/centro en X
 *   - vertical:   'top'  | 'vcenter' | 'bottom' → comparten borde/centro en Y */
export type MindMapAlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

/** Eje de distribución — reparte los nodos con espacios iguales entre sí. */
export type MindMapDistributeAxis = 'horizontal' | 'vertical'

export interface MindMapEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  shape?: MindMapEdgeShape  // undefined = 'straight' (back-compat)
  /** Punto de pliegue (bend / waypoint) opcional en COORDENADAS DE CONTENT.
   *  Cuando está definido, el path se rutea a través de este punto en
   *  vez de ir directo. Aplica a 'straight' (polyline) y 'curved'
   *  (bezier cuadrático con bend como control). 'orthogonal' por ahora
   *  ignora el bend — su ruteo en L se calcula del medio del eje
   *  dominante y no tiene sentido pisarlo con un waypoint libre. */
  bend?: { x: number; y: number }
  /** Anchor opcional de salida en el nodo "from". Punto en COORDENADAS DE
   *  CONTENT (mundo) donde la flecha sale del nodo. Si no está definido,
   *  el endpoint se calcula desde el centro del nodo hacia el target.
   *  Cuando está, se snappea al borde del nodo más cercano a este punto.
   *  Sirve para mover manualmente el punto de conexión. */
  fromAnchor?: { x: number; y: number }
  /** Anchor opcional de llegada en el nodo "to" — mismo concepto. */
  toAnchor?: { x: number; y: number }
}

/** Forma libre para DELIMITAR conjuntos de nodos (encerrar un grupo, tirar una
 *  línea divisoria). No tiene texto ni conexiones: es puro trazo.
 *
 *  Se dibujan SIN relleno y por DEBAJO de los nodos, a propósito: el interior
 *  no recibe clicks, así que clickear adentro sigue seleccionando el nodo que
 *  esté ahí. Para agarrar la forma hay que clickear su borde. */
export type MindMapShapeKind = 'rect' | 'ellipse' | 'line'

export interface MindMapShape {
  id: string
  kind: MindMapShapeKind
  /** Esquina superior izquierda del bounding box. Para 'line', el punto de
   *  inicio (y width/height son el desplazamiento hasta el fin, con signo). */
  x: number
  y: number
  width: number
  height: number
  color?: string        // undefined = zinc por defecto
  strokeWidth?: number  // undefined = 2
  dashed?: boolean
}

/** Carpeta para agrupar mapas. La pestaña "General" no es una carpeta: es la
 *  vista de TODOS los mapas ordenados por más reciente. */
export interface MindMapFolder {
  id: string
  name: string
  /** Orden de las pestañas. Menor = más a la izquierda. */
  order: number
  /** Carpeta del sistema: no se puede renombrar ni borrar, y sus mapas no se
   *  pueden mover afuera. Sirve para que un módulo se adueñe de una carpeta y
   *  sus mapas no se pierdan por accidente. */
  locked?: boolean
  createdAt: string
  updatedAt: string
}

export interface MindMap {
  id: string
  title: string
  /** Carpeta a la que pertenece. undefined = suelto (solo aparece en General). */
  folderId?: string
  nodes: MindMapNode[]
  edges: MindMapEdge[]
  /** Opcional por back-compat: los mapas creados antes de las formas no lo
   *  tienen. Tratar siempre como `?? []`. */
  shapes?: MindMapShape[]
  createdAt: string
  updatedAt: string
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const NODE_DEFAULT_WIDTH = 160
const NODE_DEFAULT_HEIGHT = 64

export const NODE_PALETTE = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  '#ec4899', '#a855f7', '#14b8a6', '#f97316', '#facc15',
  '#000000',
]

// ─── Store ────────────────────────────────────────────────────────────────────

interface MindMapState {
  maps: MindMap[]
  /** Carpetas del usuario. Se sincronizan junto con los mapas (mismo dominio
   *  de sync) porque conceptualmente son la misma cosa. */
  folders: MindMapFolder[]

  createFolder: (name: string, opts?: { locked?: boolean }) => string
  renameFolder: (folderId: string, name: string) => void
  /** Borra la carpeta y manda sus mapas a "sin carpeta" (siguen en General —
   *  nunca se borran mapas por borrar una carpeta). Noop si es del sistema. */
  deleteFolder: (folderId: string) => void
  /** Mueve un mapa. `folderId` null = sacarlo de toda carpeta. Noop si el mapa
   *  está en una carpeta bloqueada. */
  moveMapToFolder: (mapId: string, folderId: string | null) => void
  /** true si el mapa vive en una carpeta bloqueada (no se borra ni se mueve). */
  isMapLocked: (mapId: string) => boolean

  /** Undo de 1 SOLO nivel (por diseño — "solo 1 así es fácil"). Guarda el
   *  estado (nodos + edges) de UN mapa justo ANTES del último cambio. Las
   *  ráfagas rápidas (arrastrar, redimensionar) se agrupan en un único punto
   *  de undo vía coalescing temporal, así Ctrl+Z deshace el gesto completo y
   *  no un micro-paso. No se persiste (se recalcula por sesión). */
  undoSnapshot: { mapId: string; nodes: MindMapNode[]; edges: MindMapEdge[]; shapes: MindMapShape[] } | null
  /** Restaura el `undoSnapshot` y lo limpia. Noop si no hay nada que deshacer. */
  undo: () => void

  // Map-level CRUD
  createMap: (title?: string) => string
  renameMap: (mapId: string, title: string) => void
  deleteMap: (mapId: string) => void

  // Node CRUD
  addNode: (mapId: string, args: {
    x: number; y: number; text?: string; color?: string
    // Opcionales para "nodos imagen" — cuando se crean desde una subida.
    width?: number; height?: number
    imageUrl?: string; imagePath?: string; imageFit?: 'cover' | 'contain'
  }) => string
  updateNode: (mapId: string, nodeId: string, patch: Partial<Omit<MindMapNode, 'id'>>) => void
  removeNode: (mapId: string, nodeId: string) => void

  // Shape CRUD — formas libres para delimitar grupos de nodos.
  addShape: (mapId: string, args: {
    kind: MindMapShapeKind
    x: number; y: number; width: number; height: number
    color?: string; strokeWidth?: number; dashed?: boolean
  }) => string
  updateShape: (mapId: string, shapeId: string, patch: Partial<Omit<MindMapShape, 'id'>>) => void
  removeShape: (mapId: string, shapeId: string) => void

  /** Duplicate a node — copy text, color, shape, dimensions, fontSize. The
   *  copy is offset (x+24, y+24) so it doesn't sit exactly on top of the
   *  original. Returns the new node's id (or null if the source doesn't
   *  exist). Edges are NOT copied — too easy to accidentally clone a
   *  whole subgraph; the user can wire connections explicitly. */
  duplicateNode: (mapId: string, nodeId: string) => string | null
  /** Pega un subgrafo (nodos + edges internas) en un mapa: genera ids nuevos,
   *  remapea las edges a esos ids, y offsetea posiciones (y bend/anchors) por
   *  (dx,dy) para que no caigan exactamente encima. Preserva la estructura
   *  relativa "tal cual estaba". Devuelve los ids de los nodos nuevos (para
   *  seleccionarlos tras pegar). Sirve para copiar/pegar ENTRE mapas. */
  pasteSubgraph: (
    mapId: string,
    payload: { nodes: MindMapNode[]; edges: MindMapEdge[] },
    offset?: { dx: number; dy: number },
  ) => string[]

  // Edge CRUD
  addEdge: (mapId: string, fromNodeId: string, toNodeId: string) => string | null
  removeEdge: (mapId: string, edgeId: string) => void
  /** Change the visual shape of an existing edge (straight / curved / orthogonal). */
  setEdgeShape: (mapId: string, edgeId: string, shape: MindMapEdgeShape) => void
  /** Setea (o limpia, con `undefined`) el bend point de una edge. Cuando
   *  el usuario arrastra el círculo-breakpoint, su nueva posición se
   *  persiste acá. Pasar `undefined` resetea al midpoint calculado. */
  setEdgeBend: (mapId: string, edgeId: string, bend: { x: number; y: number } | undefined) => void
  /** Mueve el anchor de la salida ('from') o la llegada ('to') de una
   *  edge a un punto específico (COORDENADAS DE CONTENT). Pasar undefined
   *  lo limpia y vuelve al cálculo por borde-centro. */
  setEdgeAnchor: (mapId: string, edgeId: string, side: 'from' | 'to', anchor: { x: number; y: number } | undefined) => void
  /** Change the visual shape of a node (rect / circle). */
  setNodeShape: (mapId: string, nodeId: string, shape: MindMapNodeShape) => void
  /** Change the text size of a node, in pixels. Pass `undefined` to reset
   *  to the default (14px). */
  setNodeFontSize: (mapId: string, nodeId: string, fontSize: number | undefined) => void
  /** Alinea los nodos indicados respecto a la bounding box de la selección
   *  (izquierda/centro/derecha en X; arriba/medio/abajo en Y). Necesita 2+. */
  alignNodes: (mapId: string, nodeIds: string[], mode: MindMapAlignMode) => void
  /** Distribuye los nodos con espacios iguales entre sí a lo largo del eje.
   *  Los extremos quedan fijos; se reacomodan los del medio. Necesita 3+. */
  distributeNodes: (mapId: string, nodeIds: string[], axis: MindMapDistributeAxis) => void

  // Selectors
  getMap: (mapId: string) => MindMap | null
}

function touch(map: MindMap): MindMap {
  return { ...map, updatedAt: new Date().toISOString() }
}

// Ventana de coalescing del undo: mutaciones al mismo mapa dentro de este
// lapso se consideran UN solo gesto (arrastrar/redimensionar disparan muchos
// updateNode seguidos). Vive a nivel de módulo porque es solo timing y no
// necesita reactividad.
const UNDO_COALESCE_MS = 500
let lastUndoCaptureAt = 0

export const useMindMapStore = create<MindMapState>()(
  persist(
    (set, get) => {
      /** Aplica una mutación a un mapa capturando ANTES su estado para el
       *  undo de 1 nivel. Reemplaza a `set` en todas las acciones que editan
       *  el contenido del mapa (nodos/edges). Ráfagas <500ms → un solo undo. */
      const mutate = (
        mapId: string,
        updater: (s: MindMapState) => Partial<MindMapState>,
      ) => set((s) => {
        const now = Date.now()
        const coalesce =
          now - lastUndoCaptureAt < UNDO_COALESCE_MS && s.undoSnapshot?.mapId === mapId
        lastUndoCaptureAt = now
        const m = s.maps.find((mm) => mm.id === mapId)
        // Los arrays son inmutables (cada acción crea nuevos) → guardar la
        // referencia actual es un snapshot válido sin deep-clone.
        const undoSnapshot = coalesce || !m
          ? s.undoSnapshot
          : { mapId, nodes: m.nodes, edges: m.edges, shapes: m.shapes ?? [] }
        return { ...updater(s), undoSnapshot }
      })

      return {
      maps: [],
      folders: [],
      undoSnapshot: null,

      createFolder: (name, opts) => {
        const now = new Date().toISOString()
        const id = genId()
        set((s) => ({
          folders: [...s.folders, {
            id,
            name: name.trim() || 'Carpeta',
            order: s.folders.length,
            ...(opts?.locked ? { locked: true } : {}),
            createdAt: now,
            updatedAt: now,
          }],
        }))
        return id
      },

      renameFolder: (folderId, name) => set((s) => ({
        folders: s.folders.map((f) => f.id !== folderId || f.locked
          ? f
          : { ...f, name: name.trim() || f.name, updatedAt: new Date().toISOString() }),
      })),

      deleteFolder: (folderId) => set((s) => {
        const folder = s.folders.find((f) => f.id === folderId)
        if (!folder || folder.locked) return {}
        return {
          folders: s.folders.filter((f) => f.id !== folderId),
          // Los mapas NO se borran: quedan sueltos y siguen visibles en General.
          maps: s.maps.map((m) => m.folderId !== folderId ? m : touch({ ...m, folderId: undefined })),
        }
      }),

      moveMapToFolder: (mapId, folderId) => set((s) => {
        const map = s.maps.find((m) => m.id === mapId)
        if (!map) return {}
        // No se puede sacar un mapa de una carpeta bloqueada.
        const current = s.folders.find((f) => f.id === map.folderId)
        if (current?.locked) return {}
        return {
          maps: s.maps.map((m) => m.id !== mapId
            ? m
            : touch({ ...m, folderId: folderId ?? undefined })),
        }
      }),

      undo: () => set((s) => {
        const snap = s.undoSnapshot
        if (!snap) return {}
        // Tras deshacer, el próximo cambio arranca un punto de undo nuevo.
        lastUndoCaptureAt = 0
        return {
          maps: s.maps.map((m) => m.id !== snap.mapId
            ? m
            : touch({ ...m, nodes: snap.nodes, edges: snap.edges, shapes: snap.shapes })),
          undoSnapshot: null,
        }
      }),

      createMap: (title) => {
        const now = new Date().toISOString()
        const id = genId()
        const map: MindMap = {
          id,
          title: title?.trim() || `Mapa ${get().maps.length + 1}`,
          nodes: [],
          edges: [],
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ maps: [map, ...s.maps] }))
        return id
      },

      renameMap: (mapId, title) => set((s) => ({
        maps: s.maps.map((m) => m.id !== mapId ? m : touch({ ...m, title: title.trim() || m.title })),
      })),

      // Un mapa que vive en una carpeta BLOQUEADA no se borra. Hoy son los
      // mapas espejo de los perfiles de Content Strategy: borrarlos dejaría
      // al perfil apuntando a un mapa fantasma y se perdería el trabajo.
      // El guard va en el store (y no solo escondiendo el botón) para que
      // ninguna otra vía de borrado se lo saltee.
      deleteMap: (mapId) => set((s) => {
        const map = s.maps.find((m) => m.id === mapId)
        if (!map) return {}
        if (map.folderId && s.folders.find((f) => f.id === map.folderId)?.locked) return {}
        return { maps: s.maps.filter((m) => m.id !== mapId) }
      }),

      /** ¿Este mapa está protegido contra borrado/movimiento? Lo usa la UI
       *  para no ofrecer acciones que el store va a rechazar igual. */
      isMapLocked: (mapId) => {
        const s = get()
        const map = s.maps.find((m) => m.id === mapId)
        if (!map?.folderId) return false
        return !!s.folders.find((f) => f.id === map.folderId)?.locked
      },

      addNode: (mapId, args) => {
        const nodeId = genId()
        mutate(mapId, (s) => ({
          maps: s.maps.map((m) => {
            if (m.id !== mapId) return m
            const newNode: MindMapNode = {
              id: nodeId,
              x: args.x, y: args.y,
              width: args.width ?? NODE_DEFAULT_WIDTH,
              height: args.height ?? NODE_DEFAULT_HEIGHT,
              // Default to empty. The view renders "Idea" as a placeholder
              // when text is empty so the box doesn't look broken, but the
              // edit textarea opens BLANK — no need for the user to delete
              // the literal word "Idea" before typing their actual idea.
              text: args.text ?? '',
              color: args.color,
              // Campos de "nodo imagen" — solo presentes si se creó desde una subida.
              ...(args.imageUrl ? { imageUrl: args.imageUrl } : {}),
              ...(args.imagePath ? { imagePath: args.imagePath } : {}),
              ...(args.imageFit ? { imageFit: args.imageFit } : {}),
            }
            return touch({ ...m, nodes: [...m.nodes, newNode] })
          }),
        }))
        return nodeId
      },

      updateNode: (mapId, nodeId, patch) => mutate(mapId, (s) => ({
        maps: s.maps.map((m) => {
          if (m.id !== mapId) return m
          return touch({
            ...m,
            nodes: m.nodes.map((n) => n.id !== nodeId ? n : { ...n, ...patch }),
          })
        }),
      })),

      duplicateNode: (mapId, nodeId) => {
        const map = get().maps.find((m) => m.id === mapId)
        if (!map) return null
        const source = map.nodes.find((n) => n.id === nodeId)
        if (!source) return null
        const newId = genId()
        const copy: MindMapNode = {
          ...source,
          id: newId,
          x: source.x + 24,
          y: source.y + 24,
        }
        mutate(mapId, (s) => ({
          maps: s.maps.map((m) => m.id !== mapId ? m : touch({ ...m, nodes: [...m.nodes, copy] })),
        }))
        return newId
      },

      removeNode: (mapId, nodeId) => {
        // Si el nodo borrado es un "nodo imagen", limpiamos su archivo del
        // bucket (best-effort, fire-and-forget). Lo hacemos acá —y no en cada
        // call site— porque removeNode es el único punto por el que pasa todo
        // borrado de nodos (tecla Supr, toolbar, etc.).
        //
        // Guard contra duplicados: Duplicar / copiar-pegar generan nodos que
        // COMPARTEN el mismo imagePath (apuntan al mismo objeto en Storage).
        // Solo borramos el archivo si NINGÚN otro nodo (en ningún mapa) lo
        // sigue usando — si no, romperíamos la imagen de las copias.
        const allMaps = get().maps
        const node = allMaps.find((m) => m.id === mapId)?.nodes.find((n) => n.id === nodeId)
        if (node?.imagePath) {
          const path = node.imagePath
          const stillUsedElsewhere = allMaps.some((m) =>
            m.nodes.some((n) => !(m.id === mapId && n.id === nodeId) && n.imagePath === path)
          )
          if (!stillUsedElsewhere) void deleteMindmapImage(path)
        }
        mutate(mapId, (s) => ({
          maps: s.maps.map((m) => {
            if (m.id !== mapId) return m
            return touch({
              ...m,
              nodes: m.nodes.filter((n) => n.id !== nodeId),
              // Cascade: any edge that touches this node dies too.
              edges: m.edges.filter((e) => e.fromNodeId !== nodeId && e.toNodeId !== nodeId),
            })
          }),
        }))
      },

      addShape: (mapId, args) => {
        const shapeId = genId()
        mutate(mapId, (s) => ({
          maps: s.maps.map((m) => {
            if (m.id !== mapId) return m
            const shape: MindMapShape = {
              id: shapeId,
              kind: args.kind,
              x: args.x, y: args.y,
              width: args.width, height: args.height,
              ...(args.color ? { color: args.color } : {}),
              ...(args.strokeWidth ? { strokeWidth: args.strokeWidth } : {}),
              ...(args.dashed ? { dashed: args.dashed } : {}),
            }
            return touch({ ...m, shapes: [...(m.shapes ?? []), shape] })
          }),
        }))
        return shapeId
      },

      updateShape: (mapId, shapeId, patch) => mutate(mapId, (s) => ({
        maps: s.maps.map((m) => {
          if (m.id !== mapId) return m
          return touch({
            ...m,
            shapes: (m.shapes ?? []).map((sh) => sh.id !== shapeId ? sh : { ...sh, ...patch }),
          })
        }),
      })),

      removeShape: (mapId, shapeId) => mutate(mapId, (s) => ({
        maps: s.maps.map((m) => {
          if (m.id !== mapId) return m
          return touch({ ...m, shapes: (m.shapes ?? []).filter((sh) => sh.id !== shapeId) })
        }),
      })),

      pasteSubgraph: (mapId, payload, offset = { dx: 40, dy: 40 }) => {
        const srcNodes = Array.isArray(payload?.nodes) ? payload.nodes : []
        if (srcNodes.length === 0) return []
        const srcEdges = Array.isArray(payload?.edges) ? payload.edges : []
        // old id → new id, para remapear las edges al subgrafo recién pegado.
        const idMap = new Map<string, string>()
        const newNodes: MindMapNode[] = srcNodes.map((n) => {
          const newId = genId()
          idMap.set(n.id, newId)
          return { ...n, id: newId, x: (n.x ?? 0) + offset.dx, y: (n.y ?? 0) + offset.dy }
        })
        const newEdges: MindMapEdge[] = srcEdges
          // Solo edges cuyos DOS extremos están en el subgrafo copiado.
          .filter((e) => idMap.has(e.fromNodeId) && idMap.has(e.toNodeId))
          .map((e) => {
            const ne: MindMapEdge = {
              ...e,
              id: genId(),
              fromNodeId: idMap.get(e.fromNodeId)!,
              toNodeId: idMap.get(e.toNodeId)!,
            }
            // bend/anchors viven en coords de content → offsetear igual que los nodos.
            if (e.bend) ne.bend = { x: e.bend.x + offset.dx, y: e.bend.y + offset.dy }
            if (e.fromAnchor) ne.fromAnchor = { x: e.fromAnchor.x + offset.dx, y: e.fromAnchor.y + offset.dy }
            if (e.toAnchor) ne.toAnchor = { x: e.toAnchor.x + offset.dx, y: e.toAnchor.y + offset.dy }
            return ne
          })
        mutate(mapId, (s) => ({
          maps: s.maps.map((m) => m.id !== mapId ? m : touch({
            ...m,
            nodes: [...m.nodes, ...newNodes],
            edges: [...m.edges, ...newEdges],
          })),
        }))
        return newNodes.map((n) => n.id)
      },

      addEdge: (mapId, fromNodeId, toNodeId) => {
        if (fromNodeId === toNodeId) return null
        const map = get().maps.find((m) => m.id === mapId)
        if (!map) return null
        // Dedupe — don't create a parallel edge if one already exists in
        // the same direction. (Reverse direction IS allowed — it's its own
        // edge with its own arrow.)
        if (map.edges.some((e) => e.fromNodeId === fromNodeId && e.toNodeId === toNodeId)) return null
        const id = genId()
        mutate(mapId, (s) => ({
          maps: s.maps.map((m) => m.id !== mapId ? m : touch({
            ...m,
            edges: [...m.edges, { id, fromNodeId, toNodeId }],
          })),
        }))
        return id
      },

      removeEdge: (mapId, edgeId) => mutate(mapId, (s) => ({
        maps: s.maps.map((m) => m.id !== mapId ? m : touch({
          ...m,
          edges: m.edges.filter((e) => e.id !== edgeId),
        })),
      })),

      setEdgeShape: (mapId, edgeId, shape) => mutate(mapId, (s) => ({
        maps: s.maps.map((m) => m.id !== mapId ? m : touch({
          ...m,
          edges: m.edges.map((e) => e.id !== edgeId ? e : { ...e, shape }),
        })),
      })),

      setEdgeBend: (mapId, edgeId, bend) => mutate(mapId, (s) => ({
        maps: s.maps.map((m) => m.id !== mapId ? m : touch({
          ...m,
          edges: m.edges.map((e) => {
            if (e.id !== edgeId) return e
            const next = { ...e }
            if (bend === undefined) delete next.bend
            else next.bend = bend
            return next
          }),
        })),
      })),

      setEdgeAnchor: (mapId, edgeId, side, anchor) => mutate(mapId, (s) => ({
        maps: s.maps.map((m) => m.id !== mapId ? m : touch({
          ...m,
          edges: m.edges.map((e) => {
            if (e.id !== edgeId) return e
            const next = { ...e }
            const key = side === 'from' ? 'fromAnchor' : 'toAnchor'
            if (anchor === undefined) delete next[key]
            else next[key] = anchor
            return next
          }),
        })),
      })),

      setNodeFontSize: (mapId, nodeId, fontSize) => mutate(mapId, (s) => ({
        maps: s.maps.map((m) => m.id !== mapId ? m : touch({
          ...m,
          nodes: m.nodes.map((n) => {
            if (n.id !== nodeId) return n
            // `undefined` clears the override → falls back to the default 14
            // via the `node.fontSize ?? 14` reads downstream.
            const next = { ...n }
            if (fontSize === undefined) delete next.fontSize
            else next.fontSize = fontSize
            return next
          }),
        })),
      })),

      setNodeShape: (mapId, nodeId, shape) => mutate(mapId, (s) => ({
        maps: s.maps.map((m) => m.id !== mapId ? m : touch({
          ...m,
          nodes: m.nodes.map((n) => {
            if (n.id !== nodeId) return n
            if (shape === 'circle') {
              // Force SQUARE dimensions so the circle is a real circle, not
              // an elongated pill. We use `max(width, height)` with a 96px
              // floor so text fits comfortably. Default nodes are 160×64,
              // which without this would become a 160×64 elongated ellipse
              // (border-radius: 50% on a non-square rect = pill shape).
              const size = Math.max(n.width, n.height, 96)
              // Snap top-left so the circle stays centered on the previous
              // rectangle's center — otherwise turning a wide rect into a
              // square circle yanks it visually to the right.
              const cx = n.x + n.width / 2
              const cy = n.y + n.height / 2
              return { ...n, shape, width: size, height: size, x: cx - size / 2, y: cy - size / 2 }
            }
            // Going back to rect — keep whatever dimensions the user had.
            // (If the node was a square circle, it stays square as a rect;
            // user can edit if they want non-square later.)
            return { ...n, shape }
          }),
        })),
      })),

      alignNodes: (mapId, nodeIds, mode) => mutate(mapId, (s) => ({
        maps: s.maps.map((m) => {
          if (m.id !== mapId) return m
          const idset = new Set(nodeIds)
          const sel = m.nodes.filter((n) => idset.has(n.id))
          if (sel.length < 2) return m
          // Bounding box de la selección — la referencia de alineación.
          const minX = Math.min(...sel.map((n) => n.x))
          const maxRight = Math.max(...sel.map((n) => n.x + n.width))
          const minY = Math.min(...sel.map((n) => n.y))
          const maxBottom = Math.max(...sel.map((n) => n.y + n.height))
          const cx = (minX + maxRight) / 2
          const cy = (minY + maxBottom) / 2
          return touch({
            ...m,
            nodes: m.nodes.map((n) => {
              if (!idset.has(n.id)) return n
              switch (mode) {
                case 'left':    return { ...n, x: minX }
                case 'right':   return { ...n, x: maxRight - n.width }
                case 'hcenter': return { ...n, x: cx - n.width / 2 }
                case 'top':     return { ...n, y: minY }
                case 'bottom':  return { ...n, y: maxBottom - n.height }
                case 'vcenter': return { ...n, y: cy - n.height / 2 }
                default:        return n
              }
            }),
          })
        }),
      })),

      distributeNodes: (mapId, nodeIds, axis) => mutate(mapId, (s) => ({
        maps: s.maps.map((m) => {
          if (m.id !== mapId) return m
          const idset = new Set(nodeIds)
          const sel = m.nodes.filter((n) => idset.has(n.id))
          if (sel.length < 3) return m  // con 2 no hay "medio" que repartir
          const horiz = axis === 'horizontal'
          // Orden por posición a lo largo del eje; extremos fijos, gap uniforme.
          const sorted = [...sel].sort((a, b) => (horiz ? a.x - b.x : a.y - b.y))
          const start = horiz ? sorted[0].x : sorted[0].y
          const end = horiz
            ? Math.max(...sorted.map((n) => n.x + n.width))
            : Math.max(...sorted.map((n) => n.y + n.height))
          const totalSize = sorted.reduce((sum, n) => sum + (horiz ? n.width : n.height), 0)
          const gap = (end - start - totalSize) / (sorted.length - 1)
          const newPos = new Map<string, number>()
          let cursor = start
          for (const n of sorted) {
            newPos.set(n.id, cursor)
            cursor += (horiz ? n.width : n.height) + gap
          }
          return touch({
            ...m,
            nodes: m.nodes.map((n) => {
              if (!newPos.has(n.id)) return n
              return horiz ? { ...n, x: newPos.get(n.id)! } : { ...n, y: newPos.get(n.id)! }
            }),
          })
        }),
      })),

      getMap: (mapId) => get().maps.find((m) => m.id === mapId) ?? null,
      }
    },
    {
      name: 'overseer-mindmaps',
      partialize: (s) => ({ maps: s.maps }),
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.maps)) state.maps = []
      },
    }
  )
)
