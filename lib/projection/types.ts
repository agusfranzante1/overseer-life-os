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

export type ProjectionLevel = 'eagle' | 'year' | 'quarter' | 'month'

/** Period key encoding (string-sortable, locale-independent):
 *    eagle:   'current' (singleton, on-demand reflection workspace)
 *    year:    'YYYY'        e.g. '2026'
 *    quarter: 'YYYY-QN'     e.g. '2026-Q1'
 *    month:   'YYYY-MM'     e.g. '2026-03'
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
