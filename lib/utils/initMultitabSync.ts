'use client'
import { wireCrossTabSync } from './multitabSync'
import { useAppStore } from '@/lib/store/appStore'
import { useChatStore } from '@/lib/store/chatStore'
import { useFavoritesStore } from '@/lib/store/favoritesStore'
import { useFoodStore } from '@/lib/store/foodStore'
import { useGoogleCalendarStore } from '@/lib/store/googleCalendarStore'
import { useGymStore } from '@/lib/store/gymStore'
import { useHabitsStore } from '@/lib/store/habitsStore'
import { useHealthStore } from '@/lib/store/healthStore'
import { useKpisStore } from '@/lib/store/kpisStore'
import { useLabStore } from '@/lib/store/labStore'
import { useMindMapStore } from '@/lib/store/mindmapStore'
import { useProjectionStore } from '@/lib/store/projectionStore'
import { useSPIStore } from '@/lib/store/spiStore'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useTaskUiStore } from '@/lib/store/taskUiStore'
import { useTradingStore } from '@/lib/store/tradingStore'
import { useWalletStore } from '@/lib/store/walletStore'

/** Inicializa el sync multi-tab para TODOS los stores persistidos.
 *  Se llama UNA VEZ desde AppShell (montado en el root layout).
 *
 *  Cuando otra pestaña escribe a localStorage, el evento `storage` se
 *  dispara en esta pestaña → `wireCrossTabSync` llama a `persist.rehydrate()`
 *  → el store en memoria refleja el nuevo localStorage → todos los
 *  componentes suscritos re-renderean automáticamente.
 *
 *  Sin esto, las pestañas que no recibieron el cambio guardan su estado
 *  VIEJO sobre el localStorage, perdiendo lo que hizo otra pestaña. */
let initialized = false
export function initMultitabSync(): void {
  if (typeof window === 'undefined') return
  if (initialized) return
  initialized = true

  wireCrossTabSync(useAppStore, 'overseer-app')
  wireCrossTabSync(useChatStore, 'overseer-chat')
  wireCrossTabSync(useFavoritesStore, 'overseer-favorites')
  wireCrossTabSync(useFoodStore, 'overseer-food')
  wireCrossTabSync(useGoogleCalendarStore, 'overseer-gcal')
  wireCrossTabSync(useGymStore, 'overseer-gym')
  wireCrossTabSync(useHabitsStore, 'overseer-habits')
  wireCrossTabSync(useHealthStore, 'overseer-health')
  wireCrossTabSync(useKpisStore, 'overseer-kpis')
  wireCrossTabSync(useLabStore, 'overseer-lab')
  wireCrossTabSync(useMindMapStore, 'overseer-mindmaps')
  wireCrossTabSync(useProjectionStore, 'overseer-projection')
  wireCrossTabSync(useSPIStore, 'overseer-spi')
  wireCrossTabSync(useTasksStore, 'overseer-tasks')
  wireCrossTabSync(useTaskUiStore, 'overseer-task-ui')
  wireCrossTabSync(useTradingStore, 'overseer-trading')
  wireCrossTabSync(useWalletStore, 'overseer-wallet')
}
