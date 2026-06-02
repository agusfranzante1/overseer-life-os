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
