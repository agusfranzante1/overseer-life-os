'use client'
/**
 * Hook que calcula qué revisiones periódicas están PENDIENTES y todavía no
 * fueron vistas — alimenta el badge titilante del sidebar.
 *
 * Junta el estado de tres stores:
 *   - spiStore        → sesión SPI del sábado actual (semanal)
 *   - projectionStore → planes month / quarter / eagle (mensual / trimestral / semestral)
 *   - reviewsStore    → qué períodos ya "vio" el usuario (para ocultar el badge)
 */
import { useMemo } from 'react'
import { useSPIStore } from '@/lib/store/spiStore'
import { useProjectionStore } from '@/lib/store/projectionStore'
import { useReviewsStore } from '@/lib/store/reviewsStore'
import {
  REVIEW_CADENCES, currentPeriodKey, isCadencePending, lastSaturdayYmd,
  type ReviewCadence, type ReviewFacts,
} from '@/lib/reviews/pending'
import { currentMonthKey, currentQuarterKey, currentSemesterKey } from '@/lib/projection/period'

export interface PendingReviews {
  /** Cadencias pendientes Y no vistas todavía (lo que hace titilar el badge). */
  pending: ReviewCadence[]
  /** Cantidad de pendientes no vistas. */
  count: number
  /** Cadencias pendientes SIN importar si se vieron (para la vista interna). */
  pendingRaw: ReviewCadence[]
}

export function usePendingReviews(): PendingReviews {
  const sessions = useSPIStore((s) => s.sessions)
  const plans = useProjectionStore((s) => s.plans)
  const seen = useReviewsStore((s) => s.seen)

  return useMemo(() => {
    const now = new Date()
    const satYmd = lastSaturdayYmd(now)
    const weekSession = sessions.find((s) => s.weekStartDate === satYmd)
    const monthPlan = plans.find((p) => p.level === 'month' && p.periodKey === currentMonthKey(now))
    const quarterPlan = plans.find((p) => p.level === 'quarter' && p.periodKey === currentQuarterKey(now))
    const semesterPlan = plans.find((p) => p.level === 'semester' && p.periodKey === currentSemesterKey(now))

    const facts: ReviewFacts = {
      weeklyClosed: !!weekSession?.closedAt,
      monthlyClosedAt: monthPlan?.closedAt ?? null,
      quarterlyClosedAt: quarterPlan?.closedAt ?? null,
      semesterClosedAt: semesterPlan?.closedAt ?? null,
    }

    const pendingRaw: ReviewCadence[] = []
    const pending: ReviewCadence[] = []
    for (const cadence of REVIEW_CADENCES) {
      if (!isCadencePending(cadence, facts, now)) continue
      pendingRaw.push(cadence)
      // El badge solo cuenta lo que NO se vio para el período actual.
      if (seen[cadence] !== currentPeriodKey(cadence, now)) pending.push(cadence)
    }

    return { pending, count: pending.length, pendingRaw }
  }, [sessions, plans, seen])
}
