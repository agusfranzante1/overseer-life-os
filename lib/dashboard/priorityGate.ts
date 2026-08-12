'use client'
import { useDailyPriorities } from '@/lib/dashboard/priorities'

/** Resultado del gate de prioridades — única fuente de verdad de acceso.
 *  Lo consumen el wrapper visual <PriorityGate> y las pantallas que se
 *  bloquean (Panel, Task Manager, Calendario). No hay otra derivación de
 *  "locked" en toda la app: siempre pasa por acá. */
export interface PriorityGateState {
  /** true = el contenido debe bloquearse (hay prioridades sin completar). */
  locked: boolean
  /** Hay al menos una prioridad activa hoy. */
  hasPriorities: boolean
  /** Todas completas (solo true si hay >=1). */
  allDone: boolean
  /** Prioridades completadas. */
  doneCount: number
  /** Total de prioridades activas hoy (para mostrar doneCount/total). */
  total: number
}

export function usePriorityGate(): PriorityGateState {
  const { hasPriorities, allDone, doneCount, items } = useDailyPriorities()
  return {
    locked: hasPriorities && !allDone,
    hasPriorities,
    allDone,
    doneCount,
    total: items.length,
  }
}
