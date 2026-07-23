'use client'
/**
 * Estado local de "revisiones vistas" — soporte del badge de pendientes.
 *
 * Guarda, por cadencia, la clave del período que el usuario YA reconoció
 * (entró a la pestaña correspondiente). El badge del sidebar titila solo
 * cuando hay una revisión PENDIENTE cuyo período todavía NO fue visto.
 *
 * Es local al dispositivo (no se sincroniza): el nudge cross-device lo cubre
 * la notificación push. Acá solo se trata de "dejá de titilar en ESTE device
 * porque ya lo miré".
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ReviewCadence } from '@/lib/reviews/pending'

interface ReviewsState {
  /** cadencia → periodKey reconocido más recientemente. */
  seen: Partial<Record<ReviewCadence, string>>
  /** Marca una cadencia como vista para el período dado (al entrar a la pestaña). */
  markSeen: (cadence: ReviewCadence, periodKey: string) => void
}

export const useReviewsStore = create<ReviewsState>()(
  persist(
    (set) => ({
      seen: {},
      markSeen: (cadence, periodKey) =>
        set((s) => (s.seen[cadence] === periodKey ? s : { seen: { ...s.seen, [cadence]: periodKey } })),
    }),
    {
      name: 'overseer-reviews',
      onRehydrateStorage: () => (state) => {
        if (state && (typeof state.seen !== 'object' || state.seen === null)) state.seen = {}
      },
    },
  ),
)
