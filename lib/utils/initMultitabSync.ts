'use client'
import { wireCrossTabSync } from './multitabSync'
import { useAppStore } from '@/lib/store/appStore'
import { useBacktestStore } from '@/lib/store/backtestStore'
import { useBooksStore } from '@/lib/store/booksStore'
import { useChatStore } from '@/lib/store/chatStore'
import { useConceptStore } from '@/lib/store/conceptStore'
import { useContentStore } from '@/lib/store/contentStore'
import { useFavoritesStore } from '@/lib/store/favoritesStore'
import { useFoodStore } from '@/lib/store/foodStore'
import { useGoogleCalendarStore } from '@/lib/store/googleCalendarStore'
import { useGymStore } from '@/lib/store/gymStore'
import { useHabitsStore } from '@/lib/store/habitsStore'
import { useHealthStore } from '@/lib/store/healthStore'
import { useJournalStore } from '@/lib/store/journalStore'
import { useKpisStore } from '@/lib/store/kpisStore'
import { useLabStore } from '@/lib/store/labStore'
import { useMeditationsStore } from '@/lib/store/meditationsStore'
import { useMindMapStore } from '@/lib/store/mindmapStore'
import { useOffersStore } from '@/lib/store/offersStore'
import { useProjectionStore } from '@/lib/store/projectionStore'
import { useReviewsStore } from '@/lib/store/reviewsStore'
import { useSPIStore } from '@/lib/store/spiStore'
import { useStudyStore } from '@/lib/store/studyStore'
import { useTaskSnapshotsStore } from '@/lib/store/taskSnapshotsStore'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useTaskUiStore } from '@/lib/store/taskUiStore'
import { useTradingStore } from '@/lib/store/tradingStore'
import { useWalletStore } from '@/lib/store/walletStore'
import { useYoutubeStore } from '@/lib/store/youtubeStore'

/** Inicializa el sync multi-tab para TODOS los stores persistidos.
 *  Se llama UNA VEZ desde AppShell (montado en el root layout).
 *
 *  Cuando otra pestaña escribe a localStorage, el evento `storage` se
 *  dispara en esta pestaña → `wireCrossTabSync` llama a `persist.rehydrate()`
 *  → el store en memoria refleja el nuevo localStorage → todos los
 *  componentes suscritos re-renderean automáticamente.
 *
 *  Sin esto, las pestañas que no recibieron el cambio guardan su estado
 *  VIEJO sobre el localStorage, perdiendo lo que hizo otra pestaña.
 *
 *  ESTA LISTA TIENE QUE INCLUIR *TODOS* LOS STORES PERSISTIDOS. Si creás un
 *  store nuevo con `persist` y te olvidás de engancharlo acá, sus datos se
 *  pierden en cuanto el usuario tenga dos pestañas abiertas: la que quedó con
 *  el estado viejo pisa a la otra al primer cambio. Ya pasó con Ofertas —
 *  el usuario cargaba 5 ofertas, editaba cualquier cosa en otra pestaña, y
 *  desaparecían. La regla de oro (BASES nº1) es "todo es multi-dispositivo";
 *  esto es el mínimo indispensable para que también sea multi-PESTAÑA. */
let initialized = false
export function initMultitabSync(): void {
  if (typeof window === 'undefined') return
  if (initialized) return
  initialized = true

  wireCrossTabSync(useAppStore, 'overseer-app')
  wireCrossTabSync(useBacktestStore, 'overseer-backtest')
  wireCrossTabSync(useBooksStore, 'overseer-books')
  wireCrossTabSync(useChatStore, 'overseer-chat')
  wireCrossTabSync(useConceptStore, 'overseer-concepts')
  wireCrossTabSync(useContentStore, 'overseer-content')
  wireCrossTabSync(useFavoritesStore, 'overseer-favorites')
  wireCrossTabSync(useFoodStore, 'overseer-food')
  wireCrossTabSync(useGoogleCalendarStore, 'overseer-gcal')
  wireCrossTabSync(useGymStore, 'overseer-gym')
  wireCrossTabSync(useHabitsStore, 'overseer-habits')
  wireCrossTabSync(useHealthStore, 'overseer-health')
  wireCrossTabSync(useJournalStore, 'overseer-journal')
  wireCrossTabSync(useKpisStore, 'overseer-kpis')
  wireCrossTabSync(useLabStore, 'overseer-lab')
  wireCrossTabSync(useMeditationsStore, 'overseer-meditations')
  wireCrossTabSync(useMindMapStore, 'overseer-mindmaps')
  wireCrossTabSync(useOffersStore, 'overseer-offers')
  wireCrossTabSync(useProjectionStore, 'overseer-projection')
  wireCrossTabSync(useReviewsStore, 'overseer-reviews')
  wireCrossTabSync(useSPIStore, 'overseer-spi')
  wireCrossTabSync(useStudyStore, 'overseer-study')
  wireCrossTabSync(useTaskSnapshotsStore, 'overseer-task-snapshots')
  wireCrossTabSync(useTasksStore, 'overseer-tasks')
  wireCrossTabSync(useTaskUiStore, 'overseer-task-ui')
  wireCrossTabSync(useTradingStore, 'overseer-trading')
  wireCrossTabSync(useWalletStore, 'overseer-wallet')
  wireCrossTabSync(useYoutubeStore, 'overseer-youtube')
}
