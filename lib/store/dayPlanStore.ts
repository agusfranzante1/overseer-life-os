'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Plan de acción de un día.
 *
 *  Lo escribe Claude a través del bridge (`/api/mcp` → `save_day_plan`) y el
 *  usuario lo ve y lo tilda desde el widget "Plan de hoy" del Panel, en
 *  cualquier dispositivo.
 *
 *  El `id` es DETERMINISTA (`plan_<YYYY-MM-DD>`): UN plan por día. Con un id
 *  random, dos dispositivos generarían planes distintos para la misma fecha y
 *  el merge por id los sumaría en vez de resolverlos — es el mismo bug que ya
 *  pasó con las instancias recurrentes. */

export type DayPlanBlockKind = 'task' | 'event' | 'break' | 'focus'

export interface DayPlanBlock {
  id: string
  /** Hora de inicio "HH:MM". Opcional: un bloque puede ser "en algún momento". */
  start?: string
  end?: string
  /** Tarea real que se trabaja en este bloque, si hay. */
  taskId?: string
  title: string
  kind: DayPlanBlockKind
  /** Por qué Claude puso este bloque acá. Es lo que le permite al usuario
   *  entender el plan y corregirlo. */
  reason?: string
  done?: boolean
}

export interface DayPlan {
  id: string          // `plan_<YYYY-MM-DD>`
  date: string        // YYYY-MM-DD
  blocks: DayPlanBlock[]
  note?: string
  source: 'claude' | 'manual'
  createdAt: string
  updatedAt: string
}

export function dayPlanId(date: string): string {
  return `plan_${date}`
}

interface DayPlanState {
  plans: DayPlan[]
  getPlan: (date: string) => DayPlan | undefined
  upsertPlan: (date: string, patch: Partial<Omit<DayPlan, 'id' | 'date'>>) => void
  toggleBlockDone: (date: string, blockId: string) => void
  removePlan: (date: string) => void
}

const nowISO = () => new Date().toISOString()

export const useDayPlanStore = create<DayPlanState>()(
  persist(
    (set, get) => ({
      plans: [],

      getPlan: (date) => get().plans.find((p) => p.date === date),

      upsertPlan: (date, patch) => set((s) => {
        const id = dayPlanId(date)
        const now = nowISO()
        const existing = s.plans.find((p) => p.id === id)
        if (existing) {
          return {
            plans: s.plans.map((p) =>
              p.id === id ? { ...p, ...patch, id, date, updatedAt: now } : p),
          }
        }
        return {
          plans: [...s.plans, {
            id, date,
            blocks: patch.blocks ?? [],
            note: patch.note,
            source: patch.source ?? 'manual',
            createdAt: now,
            updatedAt: now,
          }],
        }
      }),

      // Tildar un bloque bumpea el `updatedAt` del plan entero: es lo que hace
      // que el push lo suba y que el merge LWW del pull no lo pise con la copia
      // vieja del otro dispositivo (BASE nº1).
      toggleBlockDone: (date, blockId) => set((s) => ({
        plans: s.plans.map((p) => p.date !== date ? p : {
          ...p,
          blocks: p.blocks.map((b) => b.id === blockId ? { ...b, done: !b.done } : b),
          updatedAt: nowISO(),
        }),
      })),

      removePlan: (date) => set((s) => ({ plans: s.plans.filter((p) => p.date !== date) })),
    }),
    { name: 'overseer-dayplans' },
  ),
)
