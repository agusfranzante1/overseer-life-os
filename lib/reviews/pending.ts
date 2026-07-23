/** Detección de REVISIONES PERIÓDICAS pendientes (SPI + Proyección).
 *
 *  El usuario tiene 4 rituales de revisión con distinta cadencia:
 *    - semanal    → sesión SPI del sábado (spiStore)              sin cerrar
 *    - mensual    → plan Proyección level 'month'  del mes actual sin cerrar
 *    - trimestral → plan Proyección level 'quarter' del Q actual  sin cerrar
 *    - semestral  → plan Proyección level 'eagle' (Vista de Águila) no revisado
 *                   dentro del semestre en curso
 *
 *  Una revisión está PENDIENTE si su plan/sesión del período ACTUAL no está
 *  cerrado. El badge del sidebar además la oculta si el usuario ya "vio" ese
 *  período (entró a la pestaña) — eso lo maneja reviewsStore, no este módulo.
 *
 *  Este archivo es PURO (sin React/stores) para poder reusarlo en el
 *  dispatcher server-side de notificaciones push. NO importa spiStore
 *  (es 'use client' + zustand) — la clave de semana se calcula acá.
 */
import { currentMonthKey, currentQuarterKey, labelForPeriod } from '@/lib/projection/period'

/** YYYY-MM-DD del sábado más reciente (hoy si hoy ES sábado) — es la sesión
 *  SPI que el usuario está completando esta semana. Copia PURA de la lógica
 *  de spiStore.lastSaturdayYmd (que no se puede importar server-side). */
export function lastSaturdayYmd(now: Date = new Date()): string {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()               // 0 Dom … 6 Sáb
  const diff = day === 6 ? 0 : (day + 1)
  d.setDate(d.getDate() - diff)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export type ReviewCadence = 'weekly' | 'monthly' | 'quarterly' | 'semestral'

export const REVIEW_CADENCES: ReviewCadence[] = ['weekly', 'monthly', 'quarterly', 'semestral']

/** Pestaña de la ProjectionPage que "cubre" cada cadencia (para limpiar el
 *  badge al entrar). 'week'|'month'|'quarter'|'eagle' son los activeLevel. */
export const CADENCE_TAB: Record<ReviewCadence, 'week' | 'month' | 'quarter' | 'eagle'> = {
  weekly: 'week',
  monthly: 'month',
  quarterly: 'quarter',
  semestral: 'eagle',
}

/** Inverso: qué cadencia corresponde a una pestaña (o null si no trackeada). */
export function cadenceForTab(tab: string): ReviewCadence | null {
  const found = (Object.keys(CADENCE_TAB) as ReviewCadence[]).find((c) => CADENCE_TAB[c] === tab)
  return found ?? null
}

export const CADENCE_LABEL: Record<ReviewCadence, string> = {
  weekly: 'SPI semanal',
  monthly: 'Revisión mensual',
  quarterly: 'Revisión trimestral',
  semestral: 'Vista de Águila (semestral)',
}

export const CADENCE_SHORT: Record<ReviewCadence, string> = {
  weekly: 'semanal',
  monthly: 'mensual',
  quarterly: 'trimestral',
  semestral: 'semestral',
}

/** Semestre calendario: H1 = Ene-Jun, H2 = Jul-Dic. Key = 'YYYY-H1' | 'YYYY-H2'. */
export function currentSemesterKey(now: Date = new Date()): string {
  const h = now.getMonth() < 6 ? 1 : 2
  return `${now.getFullYear()}-H${h}`
}

/** Fecha de inicio (00:00) del semestre que contiene `now`. */
export function semesterStart(now: Date = new Date()): Date {
  const startMonth = now.getMonth() < 6 ? 0 : 6
  return new Date(now.getFullYear(), startMonth, 1)
}

/** Clave del período ACTUAL para una cadencia — identifica "de qué revisión
 *  estamos hablando ahora". Se usa como dedupe (push) y como marca de "visto". */
export function currentPeriodKey(cadence: ReviewCadence, now: Date = new Date()): string {
  switch (cadence) {
    case 'weekly':    return lastSaturdayYmd(now)
    case 'monthly':   return currentMonthKey(now)
    case 'quarterly': return currentQuarterKey(now)
    case 'semestral': return currentSemesterKey(now)
  }
}

/** Label humano para el período actual de una cadencia. */
export function currentPeriodLabel(cadence: ReviewCadence, now: Date = new Date()): string {
  switch (cadence) {
    case 'weekly':    return `semana del ${lastSaturdayYmd(now)}`
    case 'monthly':   return labelForPeriod(currentMonthKey(now))
    case 'quarterly': return labelForPeriod(currentQuarterKey(now))
    case 'semestral': {
      const h = now.getMonth() < 6 ? '1er' : '2do'
      return `${h} semestre ${now.getFullYear()}`
    }
  }
}

/** Datos mínimos que necesita `isCadencePending` — se arman desde los stores
 *  (cliente) o desde Supabase (server). `closedAt` en ISO string o null. */
export interface ReviewFacts {
  /** ¿Existe y está CERRADA la sesión SPI del sábado actual? */
  weeklyClosed: boolean
  /** closedAt (ISO) del plan mensual del mes actual, o null si no existe/abierto. */
  monthlyClosedAt: string | null
  /** closedAt (ISO) del plan trimestral del Q actual. */
  quarterlyClosedAt: string | null
  /** closedAt (ISO) del plan 'eagle'. Se compara contra el inicio del semestre. */
  eagleClosedAt: string | null
}

/** ¿La revisión de esta cadencia está pendiente (no completada este período)? */
export function isCadencePending(cadence: ReviewCadence, facts: ReviewFacts, now: Date = new Date()): boolean {
  switch (cadence) {
    case 'weekly':
      return !facts.weeklyClosed
    case 'monthly':
      return !facts.monthlyClosedAt
    case 'quarterly':
      return !facts.quarterlyClosedAt
    case 'semestral': {
      // Pendiente si la Vista de Águila no se cerró DENTRO del semestre actual.
      if (!facts.eagleClosedAt) return true
      return new Date(facts.eagleClosedAt).getTime() < semesterStart(now).getTime()
    }
  }
}
