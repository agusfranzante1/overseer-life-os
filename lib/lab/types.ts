/** Laboratorio — un espacio para trabajar la mente.
 *
 *  Modelo conceptual:
 *
 *    CATEGORÍA  (creencias / emociones / pensamientos / yo-soy / problemas / inercia)
 *      └── EJERCICIO  (ej: "Sistema SIMPLE de reencuadre", "Refinador de pensamientos")
 *           └── SESIÓN  (cada vez que corrés el ejercicio: tu trabajo guardado)
 *
 *  Las CATEGORÍAS y los EJERCICIOS están definidos en `lib/lab/templates.ts`
 *  (estáticos, parte del código). Las SESIONES son los datos del usuario,
 *  persistidos en `labStore` + Supabase.
 *
 *  Cada sesión tiene un "título corto" — un resumen de lo que se trabajó
 *  ("Creencia: 'es difícil hacer dinero'") — para que después aparezcan
 *  bien identificadas en el historial de la categoría.
 *
 *  Status:
 *    - 'open'      → en progreso, podés volver a editar
 *    - 'closed'    → cerraste con outcome / aprendizaje
 *    - 'archived'  → vieja, no la querés ver mezclada (collapsable)
 */

import type { SectionField } from '@/lib/spi/types'

export type LabSessionStatus = 'open' | 'closed' | 'archived'

/** Una categoría del laboratorio (estática). */
export interface LabCategory {
  key: string
  emoji: string
  title: string
  /** Color hex usado para el chip y el header de la categoría. */
  color: string
  /** Tagline corto, mostrado debajo del título. */
  tagline: string
  /** Texto largo opcional — la filosofía detrás de esta categoría. */
  intro?: string
}

/** Una sub-sección dentro de un ejercicio (para ejercicios largos con
 *  pasos / capas). Cada sub-sección agrupa fields temáticamente. */
export interface LabExerciseStep {
  key: string
  emoji?: string
  title: string
  intro?: string
  fields: SectionField[]
  /** When true, this step starts COLLAPSED in the runner. Useful for
   *  optional/advanced steps that the user may want to skip. */
  defaultCollapsed?: boolean
}

/** Un ejercicio del laboratorio (estático). Puede tener:
 *    - solo `fields` (ejercicio de 1 paso)
 *    - solo `steps` (ejercicio multi-paso, cada step es colapsable)
 *    - los dos (fields globales arriba + steps abajo)
 */
export interface LabExercise {
  key: string
  categoryKey: string
  emoji: string
  title: string
  /** Una línea — para preview en cards. */
  shortDescription: string
  /** Texto largo opcional, mostrado en el detalle. */
  intro?: string
  /** Fields globales (renderizados arriba, fuera de steps). */
  fields?: SectionField[]
  steps?: LabExerciseStep[]
  /** Mensaje filosófico mostrado al final, sirve como recordatorio. */
  outro?: string
  /** Si está marcado, este ejercicio es "rápido" (< 5 min) — útil para
   *  el preset picker del SPI semanal cuando hay poco tiempo. */
  isQuick?: boolean
}

/** Estado de una creencia en el catálogo del usuario. */
export type LabBeliefStatus = 'open' | 'working' | 'resolved'

/** Una creencia detectada por el usuario.
 *  Vive como ENTIDAD DE PRIMERA CLASE en el laboratorio (no como una sesión
 *  de ejercicio), persistida en su propia tabla / array de la store. Esto
 *  permite que el usuario la lance al ejercicio de Reencuadre con un click
 *  y la marque como "trabajada" o "resuelta" desde la lista.
 *
 *  Hoy vive solo en categoryKey='creencias', pero el campo está para que
 *  podamos extender el patrón a "emociones a regular", "pensamientos a
 *  refinar", etc. más adelante. */
export interface LabBelief {
  id: string
  categoryKey: string
  /** El texto de la creencia, en frase corta. */
  text: string
  status: LabBeliefStatus
  createdAt: string
  updatedAt: string
  resolvedAt?: string
  /** Opcional — la insight con la que te quedaste al resolverla. */
  insight?: string
  /** Ids de las sesiones del lab que trabajaron sobre esta creencia.
   *  Útil para mostrar "trabajaste 2 reencuadres sobre esto" como historial. */
  linkedSessionIds?: string[]
}

/** Una sesión del usuario corriendo un ejercicio. */
export interface LabSession {
  id: string
  exerciseKey: string
  categoryKey: string
  /** Título corto — el usuario lo edita para identificar la sesión
   *  ("Creencia: el dinero es difícil", "Emoción: ansiedad antes de operar"). */
  title: string
  status: LabSessionStatus
  createdAt: string
  updatedAt: string
  closedAt?: string
  /** Field values: stepKey ("__root" para fields globales) → fieldKey → string. */
  values: Record<string, Record<string, string>>
  /** "¿Qué te llevás?" — escrito al cerrar la sesión. */
  outcome?: string
  /** Si esta sesión fue lanzada DESDE un SPI semanal, este es el id del
   *  spi_sessions row. Sirve para mostrar el link de vuelta y para que
   *  el SPI semanal pueda mostrar las sesiones de lab linkeadas. */
  spiSessionId?: string
  /** Si esta sesión fue lanzada desde la lista de Creencias para trabajar
   *  una creencia específica, este es el id de la `LabBelief`. Permite
   *  marcar automáticamente la creencia como "working" cuando se abre y
   *  ofrecer un botón "resolver creencia" al cerrar. */
  linkedBeliefId?: string
}
