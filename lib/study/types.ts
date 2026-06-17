/**
 * Modelo del módulo ESTUDIO — INDEPENDIENTE del task manager.
 *
 * Jerarquía: Carrera › Materia › Parcial › Tema › (ítems del tema).
 *
 * Antes "Estudio" vivía sobre projects/tasks (Project type='subject' +
 * SubjectParcial + Task.parcialId). Eso ensuciaba el task manager. Ahora vive
 * en su propio store (`lib/store/studyStore.ts`) y sus propias tablas Supabase
 * (`supabase/migration_study.sql`), normalizado y plano para que cada nivel
 * sincronice como una colección con LWW + tombstones.
 */

/** Ítem marcable dentro de un Tema (la sub-checklist). */
export interface TemaItem {
  id: string
  text: string
  done: boolean
  sortOrder: number
}

/** Tema = un punto de estudio dentro de un parcial. Tiene una sub-checklist
 *  de ítems; si no tiene ítems, su propio flag `done` cuenta como 1 unidad. */
export interface Tema {
  id: string
  parcialId: string
  title: string
  notes?: string
  done: boolean
  items: TemaItem[]
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** Parcial / sección dentro de una materia — agrupa temas. */
export interface Parcial {
  id: string
  materiaId: string
  label: string
  /** Fecha del examen/entrega (YYYY-MM-DD). Opcional. */
  examDate?: string
  /** Marcado como cerrado/aprobado → se renderea atenuado. */
  closed?: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** Materia dentro de una carrera. */
export interface Materia {
  id: string
  carreraId: string
  name: string
  icon?: string
  color?: string
  profesor?: string
  codigo?: string
  cuatrimestre?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** Carrera — nivel raíz del módulo de estudio. */
export interface Carrera {
  id: string
  name: string
  icon?: string
  color?: string
  institucion?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** Stats de progreso de cualquier nivel (unidades de estudio completadas). */
export interface StudyProgress {
  done: number
  total: number
  pct: number
}
