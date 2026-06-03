/** KPIs semanales — métricas de output que el usuario trackea para medir
 *  el avance de proyectos, contenido, hobbies, etc. Conceptualmente
 *  distintos de los hábitos:
 *   - Hábito = acción binaria diaria (entrené hoy SÍ/NO)
 *   - KPI    = conteo SEMANAL contra un target (3 entrenos de 5 esta semana)
 *
 *  Los KPIs se DEFINEN una sola vez en /kpis (la library) y se ACTIVAN
 *  por semana desde dentro del SPI semanal. Cada sesión guarda los
 *  valores que el usuario cargó esa semana. */

export type KPIKind = 'count' | 'percent' | 'boolean'

export interface KPIDefinition {
  id: string
  name: string                                    // "Entrenos"
  icon: string                                    // 🏋️
  color: string                                   // hex
  kind: KPIKind
  /** Techo objetivo. Para `count` es un entero (5 = "5 entrenos"); para
   *  `percent` es un número 0-100; para `boolean` se ignora (target
   *  implícito = 1 = "cumplir"). Para KPIs sin techo dejá undefined.
   *  En v1 NO soportamos "lowerIsBetter" (excluido por decisión del user). */
  target?: number
  /** Área de la rueda a la que pertenece este KPI. Usado para filtrar
   *  el picker en "Qué buscás esta semana" por área. Opcional — un KPI
   *  puede no estar atado a ninguna área específica. */
  areaKey?: string
  /** Grupo libre para agrupar visualmente en el scoreboard (ej. 'gym',
   *  'trading', 'contenido'). Texto que vos elegís. */
  group?: string
  /** Soft-delete: cuando el usuario archiva un KPI, dejamos de mostrarlo
   *  en pickers nuevos pero mantenemos los valores históricos. */
  archivedAt?: string
  /** Fecha desde la que este KPI cuenta (YYYY-MM-DD). Cuando se crea,
   *  se setea al lunes de la semana de creación. Las sesiones SPI cuyo
   *  weekStartDate sea ANTERIOR a este valor NO renderean el KPI — un
   *  KPI nuevo no aparece retroactivamente en semanas viejas, "empieza
   *  a contar desde que lo agregaste". */
  activatedAt: string
  createdAt: string
  updatedAt: string

  /** ─── Meta ACUMULADA opcional (solo aplica a kind='count') ─────────
   *  Para objetivos de largo plazo donde el `target` semanal es solo el
   *  ritmo deseado y la meta real es la SUMA TOTAL a lo largo de varias
   *  semanas. Ejemplo: "hacer 300 sesiones de backtesting" — `target=30`
   *  por semana, `cumulativeTarget=300`. El scoreboard muestra DOS bars:
   *  el del valor semanal vs `target`, y el del acumulado total vs
   *  `cumulativeTarget` (sumando todas las semanas desde
   *  `cumulativeStartDate`).
   *
   *  Si no se setean, el KPI sigue siendo puramente semanal (compat con
   *  todo el código viejo). */
  cumulativeTarget?: number
  /** YYYY-MM-DD — desde qué semana empieza a sumar para el acumulado.
   *  Default al setearlo: la fecha de hoy (semana en curso). El user lo
   *  puede backdate-ar si la meta arrancó hace tiempo. */
  cumulativeStartDate?: string
  /** YYYY-MM-DD opcional — fecha tope para cumplir el `cumulativeTarget`.
   *  Si se setea, el scoreboard también dice "deberías ir en X/300 a
   *  esta altura, vas Y" — visibilidad de "voy en hora / atrasado". */
  cumulativeDeadline?: string
}

/** Valor de un KPI capturado en una semana específica. Vive DENTRO de la
 *  SPISession para que el snapshot del cierre lo incluya sin queries
 *  adicionales. `value` es siempre string en el storage (alineado con
 *  el resto de session.values) — se parsea según el `kind` del KPI. */
export interface KPIWeeklyValue {
  kpiId: string
  value: string
}

/** Snapshot frozen al cerrar el SPI semanal. Incluye TODO lo necesario
 *  para renderear la fila del KPI sin tener que consultar la library
 *  (que podría haber cambiado nombre/target después). */
export interface KPISnapshot {
  id: string                                      // KPIDefinition.id al momento del cierre
  name: string
  icon: string
  color: string
  kind: KPIKind
  group?: string
  areaKey?: string
  /** Target efectivo de la semana — puede venir de un override per-session
   *  o del valor en la library al momento del cierre. */
  target?: number
  /** Valor numérico parseado. Para `boolean` es 0 o 1. */
  value: number
  /** % de cumplimiento sobre `target`. Si no hay target, undefined. */
  completionPct?: number
}
