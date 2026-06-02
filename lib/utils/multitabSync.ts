'use client'

/** Multi-tab sync para stores zustand persistidos.
 *
 *  Problema que resuelve:
 *  ─────────────────────
 *  Zustand `persist` guarda en localStorage. Pero NO escucha cambios
 *  de OTRAS pestañas. Cuando tenés la app abierta en 2+ tabs:
 *
 *    1. Tab A crea Tarea X → escribe localStorage.
 *    2. Tab B no se entera (ya tiene su estado en memoria).
 *    3. Tab B hace cualquier cambio → escribe localStorage con su estado
 *       VIEJO (sin Tarea X) → PISA el cambio de Tab A.
 *    4. Cualquier refresh ahora muestra el estado de Tab B → Tarea X perdida.
 *
 *  La fix: el evento `storage` del browser SE DISPARA en TODAS las
 *  tabs cuando OTRA escribe localStorage. Acá listenamos y le decimos
 *  al store que re-hidrate desde localStorage cuando eso pasa.
 *
 *  Cómo usar:
 *  ──────────
 *  En el archivo del store, después del `create(...)`, agregar:
 *
 *    if (typeof window !== 'undefined') {
 *      wireCrossTabSync(useTasksStore, 'overseer-tasks')
 *    }
 *
 *  O directamente con el helper batch al final del module init. */

import type { StoreApi, UseBoundStore } from 'zustand'

interface PersistableStore<T> extends UseBoundStore<StoreApi<T>> {
  persist: {
    rehydrate: () => void | Promise<void>
  }
}

/** Adjunta un listener `storage` que re-hidrata el store cuando otra
 *  tab escribe la key de localStorage que le corresponde.
 *
 *  Idempotente: si ya hay un listener para esta key, no agrega otro.
 *  Esto importa porque el módulo puede re-evaluarse en HMR. */
const wired = new Set<string>()
export function wireCrossTabSync<T>(
  store: PersistableStore<T>,
  storageKey: string,
): void {
  if (typeof window === 'undefined') return
  if (wired.has(storageKey)) return
  wired.add(storageKey)

  window.addEventListener('storage', (e) => {
    // `e.key === null` cuando se hizo `localStorage.clear()` — re-hidratar
    // de todas formas (probablemente perdimos data, pero al menos el
    // store en memoria refleja la realidad).
    if (e.key === null || e.key === storageKey) {
      try {
        store.persist.rehydrate()
      } catch {
        // Re-hidratar puede fallar si el JSON quedó corrupto; lo logueamos
        // solo a consola para no romper la UI.
        console.warn(`[multitab] rehydrate failed for "${storageKey}"`)
      }
    }
  })
}
