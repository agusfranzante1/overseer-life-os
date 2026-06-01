/** SPI: Sistema de Progreso Infinito — type definitions.
 *
 *  A SPI session is a weekly reflection/planning ritual (typically every
 *  Saturday). The user fills out a structured template with reflection
 *  prompts across multiple sections, ending in a list of tasks to execute
 *  during the upcoming week.
 *
 *  Each session is persisted forever, forming a journal-like archive
 *  the user can revisit and learn from. Sessions also generate XP and a
 *  streak counter to gamify the consistency of doing this ritual weekly.
 */

/** A task generated during the planning session. Lives in the SPISession
 *  but, once the session is "closed", is mirrored into the global Tasks
 *  store under a non-deletable project called "SPI". */
export interface SPITask {
  id: string
  title: string
  /** ⭐ Pareto flag — the user marks tasks that are part of the 20% that
   *  drives 80% of the outcomes. Used for prioritization in the UI. */
  important: boolean
  /** ISO date string (YYYY-MM-DD) — when the user plans to do it. */
  dueDate?: string
  /** "Para qué" — the purpose/why behind this task. Lives only here
   *  (not in the global Task model) per user's design choice. */
  whyPurpose?: string
  /** If the session has been closed, the corresponding global Task id. */
  linkedTaskId?: string
  /** If the user moved the linked task from "SPI" project to another
   *  one, this records the destination project so we still know where
   *  it ended up. */
  movedToProjectId?: string
}

export type SectionFieldType = 'text' | 'textarea' | 'select' | 'checklist' | 'score'

export interface SectionField {
  key: string
  label: string
  type: SectionFieldType
  placeholder?: string
  /** Options for type='select'. */
  options?: string[]
  /** Small italic hint shown ABOVE the field for context. */
  hint?: string
  /** Italic blockquote shown above the field (philosophy / mantra). */
  blockquote?: string
  /** Below-field epigraph (also italic blockquote, often the closing
   *  thought of a section). */
  epigraph?: string
}

export interface SPISection {
  key: string
  emoji: string
  title: string
  /** Short intro paragraph, shown collapsed when the section is closed. */
  intro?: string
  /** Whether this section is collapsed by default. */
  defaultCollapsed?: boolean
  /** Optional sub-sections inside this one (for nested "Necesito profundidad"
   *  style accordions). Each subsection is rendered as a nested collapsible. */
  subsections?: SPISection[]
  fields?: SectionField[]
  /** Which lane ("carril") this section belongs to. Lanes group sections
   *  thematically so the user can pick which areas to work on each Saturday
   *  (e.g. just Táctico, or all four). Undefined → renders in every lane
   *  (use for sections that should always appear). */
  laneKey?: string
}

/** A thematic lane the user can pick when starting a session. Allows
 *  shorter Saturdays ("just Táctico today") or full-depth ones ("all four").
 *  Configurable from the template editor. */
export interface SPILane {
  key: string
  emoji: string
  title: string
  /** One-liner shown in the picker so the user knows when to pick this. */
  description: string
  /** Accent color (hex) used for lane chips / picker cards. */
  color: string
}

/** The full template — defines what sections and fields appear in each
 *  weekly session. Versioned so we can migrate older sessions whose
 *  structure was different. */
export interface SPITemplate {
  version: number
  sections: SPISection[]
  /** The top-level main checklist — items the user ticks during execution
   *  of the SPI session (e.g. "Ejecutar Protocolo AAA"). */
  mainChecklist: { key: string; label: string }[]
  /** Thematic lanes available to pick from when starting a session.
   *  Sections are tagged with `laneKey` to indicate which lane they
   *  belong to. The user selects 1-4 lanes per session. */
  lanes: SPILane[]
}

/** Entry in the Bitácora de Calibración — a CROSS-SESSION knowledge base
 *  of what's working (and why) and what's NOT working (and how to fix it).
 *
 *  Unlike session field values which are scoped to a single Saturday,
 *  bitácora entries live globally and are visible from every SPI session.
 *  This is the user's running journal of personal patterns:
 *
 *    kind: 'working'  → situation: "Pomodoros de 50min"
 *                       dominoEffect: "Energía estable hasta las 13"
 *    kind: 'broken'   → situation: "Me levanto tarde, no llego al sol"
 *                       dominoEffect: "Apegarme al plan, dormir 23:30"
 *                       resolved: true  ← marcado cuando ya lo arreglaste
 */
export interface BitacoraEntry {
  id: string
  kind: 'working' | 'broken'
  situation: string
  dominoEffect: string
  /** Only meaningful for `kind: 'broken'` — set true when the user has
   *  applied the fix and the situation is no longer an issue. */
  resolved?: boolean
  createdAt: string
  updatedAt: string
}

export interface SPISession {
  id: string
  /** ISO YYYY-MM-DD — the Saturday this session "belongs to". */
  weekStartDate: string
  createdAt: string
  updatedAt: string
  closedAt?: string

  /** State of the top-level checklist (key → ticked). */
  mainChecklist: Record<string, boolean>

  /** Lanes the user picked at the start of this session. Determines
   *  which sections render. Empty array → picker is shown (user hasn't
   *  chosen yet). User can re-pick anytime; existing values for de-selected
   *  lanes are NOT erased (just hidden). */
  selectedLanes: string[]

  /** Field values: sectionKey → fieldKey → value (string). For checklist
   *  fields the value is JSON-encoded array of strings; for select it's
   *  the option label. */
  values: Record<string, Record<string, string>>

  /** Tasks generated this week. */
  tasks: SPITask[]

  /** Mood after closing — 1-10 scale. */
  mood?: number
  /** Auto-calculated 0-100 score. Combines main checklist completion,
   *  task completion ratio, and mood. Computed at close time. */
  score?: number
  /** Optional closing notes / reflection. */
  notes?: string

  /** Template version this session was built against — for backward
   *  compat when we change the template in the future. */
  templateVersion: number

  /** Snapshot capturado al cerrar la semana — grid de 7 días por hábito
   *  + KPIs de la semana. Imagen congelada para que la revisión histórica
   *  sobreviva a cambios futuros en el hábito (renombrar, borrar, etc.). */
  weekSnapshot?: WeekClosureSnapshot
}

/** Captura al cerrar una semana SPI: estado de hábitos de los 7 días que
 *  cubre la semana (Sáb → Vie). Mismo concepto que `MonthClosureSnapshot`
 *  pero con horizonte de 7 días y sin ingresos (eso se ve mejor a nivel
 *  mensual). */
export interface WeekClosureSnapshot {
  /** Para cada hábito, qué pasó cada uno de los 7 días de la semana.
   *   - 'done'    → marcado como cumplido
   *   - 'skipped' → N/A (no cuenta)
   *   - 'missed'  → ni done ni skipped (perdido)
   *   - 'future'  → día posterior a hoy al cierre (cuando cerrás antes
   *                 de que termine la semana, los días futuros se
   *                 marcan así para no contarlos en contra). */
  habits: Array<{
    id: string
    name: string
    icon: string
    color: string
    /** Array de 7 entradas, Sáb → Vie (índice 0 = sábado, 6 = viernes). */
    days: Array<'done' | 'skipped' | 'missed' | 'future'>
    /** % de cumplimiento sobre días NO-skipped y NO-future. */
    completionPct: number
  }>
  /** ISO YYYY-MM-DD del sábado que arranca la semana — duplicado de
   *  `weekStartDate` para que el render no dependa del session padre. */
  weekStartDate: string
  /** ISO timestamp del cierre. */
  capturedAt: string
}
