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

/** Un APORTE a un concepto: la mirada de UN autor sobre él. Un mismo concepto
 *  (ej. "Disciplina") puede tener varios aportes de distintas personas. */
export interface ConceptSource {
  id: string
  /** Autor / fuente del aporte (ej. "Goggins", "Jocko"). */
  author: string
  /** La explicación de ese autor sobre el concepto. */
  body: string
}

/** Un concepto = un nodo del lienzo. Agrupa uno o varios APORTES de distintos
 *  autores, y un flag `studied` para el seguimiento de avance. */
export interface Concept {
  id: string
  /** Área a la que pertenece (null = sin área). Mover entre áreas = cambiar esto. */
  areaId: string | null
  title: string
  /** Aportes de distintos autores sobre este concepto. */
  sources: ConceptSource[]
  /** ¿Ya lo estudiaste? Alimenta la vista Progreso (estudiados / total). */
  studied?: boolean
  /** Posición en el lienzo (coords de content). */
  x: number
  y: number
  createdAt: string
  updatedAt: string
  // ── Legacy (pre-aportes): concepto con un solo autor+cuerpo. Se migra a
  //    `sources` vía normalizeConcept. No escribir estos campos en código nuevo.
  /** @deprecated usar `sources` */ author?: string
  /** @deprecated usar `sources` */ body?: string
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

/** Normaliza un concepto potencialmente legacy (author/body sueltos) al modelo
 *  con `sources[]`. Idempotente: si ya tiene sources, lo deja igual (limpiando
 *  los campos legacy). Un genId opcional evita ids duplicados entre aportes. */
export function normalizeConcept(c: Concept, genId: () => string): Concept {
  // Ya está en el modelo nuevo (con sources) y sin campos legacy → tal cual.
  if (Array.isArray(c.sources) && c.sources.length > 0 && c.author === undefined && c.body === undefined) {
    return c
  }
  const legacyAuthor = (c.author ?? '').trim()
  const legacyBody = (c.body ?? '').trim()
  const sources: ConceptSource[] = (Array.isArray(c.sources) && c.sources.length > 0)
    ? c.sources
    : (legacyAuthor || legacyBody)
      ? [{ id: genId(), author: legacyAuthor, body: legacyBody }]
      : [{ id: genId(), author: '', body: '' }]
  // Reconstrucción explícita → descarta author/body legacy sin binds sin usar.
  return {
    id: c.id, areaId: c.areaId, title: c.title, sources,
    studied: c.studied, x: c.x, y: c.y,
    createdAt: c.createdAt, updatedAt: c.updatedAt,
  }
}

/** Progreso de estudio de un conjunto de conceptos (estudiados / total). */
export function conceptProgress(concepts: Concept[]): { done: number; total: number; pct: number } {
  const total = concepts.length
  const done = concepts.filter((c) => c.studied).length
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
}

/** Etiqueta corta de los autores de un concepto para la tarjeta colapsada. */
export function authorsLabel(c: Concept): string {
  const names = (c.sources ?? []).map((s) => s.author.trim()).filter(Boolean)
  if (names.length === 0) return ''
  if (names.length <= 2) return names.join(' · ')
  return `${names[0]} · ${names[1]} +${names.length - 2}`
}
