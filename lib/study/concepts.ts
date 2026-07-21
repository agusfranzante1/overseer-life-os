/**
 * Mapa de CONCEPTOS de una materia (modo `mode: 'conceptos'`).
 *
 * A diferencia del tracker de checklist (Parcial › Tema), acá una materia es
 * una base de conocimiento visual: un lienzo libre de nodos-concepto que se
 * mueven a mano, agrupados en ÁREAS por color, con autor y cuerpo desplegable.
 *
 * Todo el mapa de una materia viaja como UN blob JSONB (tabla
 * `study_concept_maps`, id = materiaId). Merge multi-device: LWW por updatedAt.
 */

/** Área temática dentro del mapa (ej. "Liderazgo", "Finanzas"). Es el color
 *  con el que se pintan los conceptos que le pertenecen. */
export interface ConceptArea {
  id: string
  name: string
  color: string
}

/** Un concepto = un nodo del lienzo. */
export interface Concept {
  id: string
  /** Área a la que pertenece (null = sin área). Mover entre áreas = cambiar esto. */
  areaId: string | null
  title: string
  /** Autor / fuente del concepto (ej. "Naval", "Kiyosaki"). */
  author?: string
  /** Cuerpo — la explicación del concepto. Se ve al desplegar la tarjeta. */
  body?: string
  /** Posición en el lienzo (coords de content). */
  x: number
  y: number
  createdAt: string
  updatedAt: string
}

/** El mapa entero de una materia. `materiaId` es también su id de fila. */
export interface ConceptMap {
  materiaId: string
  areas: ConceptArea[]
  concepts: Concept[]
  createdAt: string
  updatedAt: string
}

/** Paleta para áreas nuevas (se cicla por orden de creación). */
export const AREA_PALETTE = [
  '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6',
  '#a855f7', '#14b8a6', '#f97316', '#ef4444', '#0ea5e9',
]

/** Áreas semilla al crear un mapa nuevo — arrancás con algo, después editás. */
export function makeDefaultAreas(genId: () => string): ConceptArea[] {
  return [
    { id: genId(), name: 'General', color: AREA_PALETTE[0] },
  ]
}
