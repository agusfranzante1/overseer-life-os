/** Proyección — strategic planning levels above the weekly SPI ritual.
 *
 *  Hierarchy:
 *    Año (2026)
 *      └── Trimestre (2026-Q1 = Jan-Mar)
 *           └── Mes (2026-03 = Marzo)
 *                └── Semana SPI (Saturday-anchored) ← already in spiStore
 *
 *  Each level has its OWN plan with its own questions/fields, but they
 *  share the same SectionField/SPISection vocabulary as the SPI template
 *  so we can reuse the field renderer. Plans are scoped by `periodKey`
 *  (a canonical string per period) to enable trivial lookup.
 */

import type { SPISection, SectionField, SPILane } from '@/lib/spi/types'

// 'eagle' queda SOLO por compat de datos viejos (Vista de Águila jubilada).
// La jerarquía activa es year → semester → quarter → month → (week/SPI).
export type ProjectionLevel = 'eagle' | 'year' | 'semester' | 'quarter' | 'month'

/** Period key encoding (string-sortable, locale-independent):
 *    eagle:    'current' (legacy singleton — Vista de Águila jubilada)
 *    year:     'YYYY'        e.g. '2026'
 *    semester: 'YYYY-HN'     e.g. '2026-H1'
 *    quarter:  'YYYY-QN'     e.g. '2026-Q1'
 *    month:    'YYYY-MM'     e.g. '2026-03'
 */
export type PeriodKey = string

export interface ProjectionPlan {
  id: string
  level: ProjectionLevel
  /** Canonical key — uniquely identifies the period this plan covers. */
  periodKey: PeriodKey
  createdAt: string
  updatedAt: string
  /** Closing timestamp. Like SPI sessions, "closing" finalizes the plan
   *  with mood/score/notes and signals it's been reviewed. Reopenable. */
  closedAt?: string
  /** Field values keyed by section.key → field.key → value */
  values: Record<string, Record<string, string>>
  /** Mood when closing (1-10). */
  mood?: number
  /** Auto-computed 0-100 score based on child-plan completion + mood.
   *  Year score averages quarter scores. Quarter averages months.
   *  Month averages weekly SPI session scores. */
  score?: number
  /** Closing reflection. */
  notes?: string
  /** Template version snapshot for backward compat. */
  templateVersion: number
  /** For plans whose template has `lanes` (currently only 'eagle'): which
   *  thematic lanes the user has selected to display. Empty / undefined =
   *  show all lanes. Sections without `laneKey` render regardless. */
  selectedLanes?: string[]
  /** Snapshot capturado al cerrar el plan. Solo se popula en planes
   *  mensuales — fixed-frozen-en-el-tiempo de hábitos + ingresos del mes
   *  para que la revisión histórica muestre cómo te fue ese mes incluso
   *  si después borrás hábitos o transacciones. */
  monthSnapshot?: MonthClosureSnapshot
}

/** Captura al cerrar un mes: estado de hábitos (qué se cumplió cada día)
 *  + ingresos totales por moneda. Pensado como "imagen congelada" del
 *  mes para revisarlo después aunque el dataset live cambie. */
export interface MonthClosureSnapshot {
  /** Para cada hábito, qué pasó cada día del mes.
   *   - 'done'    → marcado como cumplido
   *   - 'skipped' → N/A (no cuenta)
   *   - 'missed'  → ni done ni skipped (perdido)
   *   - 'future'  → día posterior a hoy al cierre (no aplica) */
  habits: Array<{
    id: string
    name: string
    icon: string
    color: string
    /** Array paralelo a los días del mes (1-31). Índice i = día i+1. */
    days: Array<'done' | 'skipped' | 'missed' | 'future'>
    /** % de cumplimiento sobre días NO-skipped y NO-future. */
    completionPct: number
  }>
  /** Total de ingresos del mes agrupado por código de moneda. */
  income: Array<{ currencyCode: string; total: number; count: number }>
  /** ISO timestamp del cierre — para mostrar "snapshot del X de marzo". */
  capturedAt: string
}

/** A template for one projection level — same shape as SPITemplate.
 *  The optional `lanes` field is only used by 'eagle' so the user can
 *  pick which thematic lanes to focus on during the reflection. */
export interface ProjectionTemplate {
  level: ProjectionLevel
  version: number
  /** Title shown above the form for this level. */
  title: string
  /** Short prose shown at the top — sets the tone of the level. */
  intro: string
  sections: SPISection[]
  /** Optional thematic lanes (currently only on 'eagle'). When present,
   *  the user can pick which lanes to render via plan.selectedLanes. */
  lanes?: SPILane[]
}

export type { SPISection, SectionField, SPILane }
