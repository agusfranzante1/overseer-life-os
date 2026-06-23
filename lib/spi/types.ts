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
  /** ⚡ Prioridad del día — needle-mover. En el Panel estas tareas aparecen
   *  como checkboxes y se piden completar PRIMERO para desbloquear la vista
   *  diaria (agenda + tareas de hoy). Distinto de `important` (⭐ Pareto):
   *  Pareto = "alto impacto", priority = "esto va antes que nada hoy". */
  priority?: boolean
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

  /** IDs de KPIs (definidos en kpisStore) que el usuario "activó" para
   *  esta semana. El scoreboard semanal solo renderea estos. Los valores
   *  van en `values.kpis[kpiId]`; los overrides de target por-sesión
   *  (cuando el usuario quiere cambiar el target SOLO esta semana) van
   *  en `values.kpiTargets[kpiId]`. */
  selectedKpiIds?: string[]

  /** Snapshot capturado al cerrar la semana — grid de 7 días por hábito
   *  + KPIs de la semana. Imagen congelada para que la revisión histórica
   *  sobreviva a cambios futuros en el hábito (renombrar, borrar, etc.). */
  weekSnapshot?: WeekClosureSnapshot
  /** Snapshot del CALENDARIO de la semana — congela los bloques timeados
   *  (eventos GCal + tareas/subtareas con dueTime) tal como quedaron al
   *  cierre, con su estado de completion. Permite ver semana a semana
   *  cómo se organizó el tiempo y qué se cumplió de lo planeado. */
  calendarSnapshot?: CalendarWeekSnapshot
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
  /** KPIs activos esta semana, snapshot del valor cargado por el usuario.
   *  Snapshot porque la library puede cambiar después; lo congelado acá
   *  preserva nombre/target/valor del momento del cierre. */
  kpis?: import('@/lib/kpi/types').KPISnapshot[]
}

/** Bloque timeado capturado dentro de la semana. Mantiene lo mínimo
 *  para re-renderizar el grid en la revisión histórica sin depender de
 *  la fuente original (que puede haber cambiado o desaparecido). */
export interface CalendarSnapshotBlock {
  id: string
  /** Título visible — copiado tal cual estaba al cierre. */
  summary: string
  /** ISO con offset local — la hora que el usuario quiso. */
  start: string
  end: string
  /** Color hex para repintarlo igual que en su momento. */
  color: string
  /** Fuente del bloque: 'gcal' para eventos de Google Calendar,
   *  'task' para tareas madre con dueTime, 'subtask' para subtareas
   *  con dueTime. La UI usa esto para iconografía. */
  source: 'gcal' | 'task' | 'subtask'
  /** True si la task/subtask estaba completada al momento del cierre.
   *  Para fuente 'gcal' siempre false. */
  isCompleted: boolean
  /** True si el bloque es "all-day" (sin hora). En la vista del snapshot
   *  se renderiza en una franja arriba de la grilla horaria, igual que en
   *  el calendario real. Para timed blocks queda undefined/false. */
  isAllDay?: boolean
}

/** Snapshot del calendario semanal — se captura cuando se cierra el
 *  SPI semanal. Conserva el "qué planeé" + "qué cumplí" de los bloques
 *  timeados de los 7 días (lunes a domingo).
 *
 *  Nota: usamos lunes-a-domingo (no sábado-a-viernes como WeekClosureSnapshot)
 *  porque el calendario visual siempre empieza el lunes. Para el render
 *  histórico recomputamos el lunes desde `weekStartDate`. */
export interface CalendarWeekSnapshot {
  /** ISO YYYY-MM-DD del lunes que arranca la semana del calendario. */
  weekStartDate: string
  /** ISO timestamp del momento de captura. */
  capturedAt: string
  /** Todos los bloques timeados de los 7 días. Pueden venir desordenados
   *  — el renderer los agrupa por día via parseISO(start).slice(0,10). */
  blocks: CalendarSnapshotBlock[]
  /** Total de bloques que eran tareas/subtareas planificadas, para el
   *  contador rápido "X de Y completadas". */
  tasksTotal: number
  tasksDone: number
}
