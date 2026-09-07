'use client'
/**
 * Estado local de "revisiones vistas" — soporte del badge de pendientes.
 *
 * Guarda, por cadencia, la clave del período que el usuario YA reconoció
 * (entró a la pestaña correspondiente). El badge del sidebar titila solo
 * cuando hay una revisión PENDIENTE cuyo período todavía NO fue visto.
 *
 * ⚠️ CAMBIÓ EL 06/09: antes era local al dispositivo a propósito ("dejá de
 * titilar en ESTE device porque ya lo miré"). Ahora VIAJA en el blob
 * `app_preferences` (`reviewsSeen` en `appPrefsFields`), mergeado por campo.
 *
 * El motivo: el badge quedaba en rojo cuando la revisión se abría y se
 * trabajaba DESDE EL CHAT por el bridge MCP — que no es un dispositivo que el
 * usuario mire, así que nadie marcaba el "visto" y el badge mentía.
 *
 * Consecuencia asumida: reconocer una revisión en el celular la apaga también
 * en la PC. Se prefiere eso a un badge que dice "sin tocar" sobre algo que se
 * acaba de trabajar durante una hora.
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
