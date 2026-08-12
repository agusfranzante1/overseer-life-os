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
  /** Autor / fuente del aporte (ej. "Goggins", "Jocko"). Nombre denormalizado
   *  (se muestra tal cual si no hay `authorId`, o como fallback). */
  author: string
  /** Si está seteado, referencia a un StudyAuthor del registro de la carrera.
   *  El nombre a mostrar se resuelve desde ahí → renombrar el autor una vez
   *  actualiza todos los aportes. Es la "variable" del autor. */
  authorId?: string
  /** La explicación de ese autor sobre el concepto. */
  body: string
}

/** Un concepto = un nodo del lienzo. Agrupa uno o varios APORTES de distintos
 *  autores, y un flag `studied` para el seguimiento de avance. */
export interface Concept {
  id: string
  /** Si existe, este concepto es espejo de un Parcial de Estudio. */
  parcialId?: string
  /** Área a la que pertenece (null = sin área). Mover entre áreas = cambiar esto. */
  areaId: string | null
  title: string
  /** Aportes de distintos autores sobre este concepto. */
  sources: ConceptSource[]
  /** @deprecated Las notas de relación ya NO viven dentro del concepto: son
   *  nodos NOTA independientes en el mapa (`ConceptMap.noteNodes`). Este campo
   *  se conserva solo para migrar datos viejos (su texto se mueve a un nodo
   *  NOTA vía `migrateMapNotes`) y no debe escribirse en código nuevo. */
  notes?: string
  /** ¿Ya lo estudiaste? Alimenta la vista Progreso (estudiados / total). */
  studied?: boolean
  /** Posición en el lienzo (coords de content). */
  x: number
  y: number
  /** Ancho de la tarjeta en px (opcional). Sin valor → ancho default. El user
   *  lo estira con el handle del borde derecho para acomodar aportes largos. */
  w?: number
  createdAt: string
  updatedAt: string
  // ── Legacy (pre-aportes): concepto con un solo autor+cuerpo. Se migra a
  //    `sources` vía normalizeConcept. No escribir estos campos en código nuevo.
  /** @deprecated usar `sources` */ author?: string
  /** @deprecated usar `sources` */ body?: string
}

/** Un nodo NOTA del mapa — texto libre a nivel MATERIA (no dentro de un
 *  concepto). Sirve para armar resúmenes que hilvanan varios conceptos y
 *  autores: el texto mezcla prosa con `@`menciones que se guardan como tokens
 *  `[[conceptId]]` (concepto) y `((authorId))` (autor). Se arrastra y
 *  redimensiona en el lienzo como cualquier nodo. */
export interface MapNote {
  id: string
  /** Si existe, esta nota es espejo de un Tema de Estudio. */
  temaId?: string
  text: string
  x: number
  y: number
  /** Ancho en px (opcional). Sin valor → ancho default. */
  w?: number
  createdAt: string
  updatedAt: string
}

/** El mapa entero de una materia. `materiaId` es también su id de fila. */
export interface ConceptMap {
  materiaId: string
  areas: ConceptArea[]
  concepts: Concept[]
  /** Nodos NOTA (resúmenes de texto libre) del mapa. Opcional para
   *  back-compat con mapas creados antes de esta feature. */
  noteNodes?: MapNote[]
  createdAt: string
  updatedAt: string
}

/** Ancho de tarjeta: default y límites del resize manual. */
export const NODE_W_DEFAULT = 208
export const NODE_W_MIN = 184
export const NODE_W_MAX = 640

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
    id: c.id, parcialId: c.parcialId, areaId: c.areaId, title: c.title, sources, notes: c.notes,
    studied: c.studied, x: c.x, y: c.y, w: c.w,
    createdAt: c.createdAt, updatedAt: c.updatedAt,
  }
}

/** Migra un mapa al modelo de nodos NOTA: garantiza `noteNodes[]` y mueve el
 *  texto de cualquier `concept.notes` viejo (la nota que antes vivía DENTRO del
 *  concepto) a un nodo NOTA nuevo, ubicado a la derecha del concepto. Preserva
 *  los tokens `[[conceptId]]` del texto (siguen resolviendo). Idempotente: tras
 *  correr, los `concept.notes` quedan en undefined y no vuelve a extraer nada. */
export function migrateMapNotes(m: ConceptMap, genId: () => string): ConceptMap {
  const hasStrandedNotes = m.concepts.some((c) => (c.notes ?? '').trim() !== '')
  if (Array.isArray(m.noteNodes) && !hasStrandedNotes) return m

  const ts = new Date().toISOString()
  const extracted: MapNote[] = []
  const concepts = m.concepts.map((c) => {
    const text = (c.notes ?? '').trim()
    if (!text) return c.notes === undefined ? c : { ...c, notes: undefined }
    extracted.push({
      id: genId(),
      text,
      x: c.x + (c.w ?? NODE_W_DEFAULT) + 40,
      y: c.y,
      createdAt: c.createdAt ?? ts,
      updatedAt: ts,
    })
    return { ...c, notes: undefined }
  })
  return { ...m, noteNodes: [...(m.noteNodes ?? []), ...extracted], concepts }
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
