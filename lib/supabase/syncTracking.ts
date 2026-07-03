'use client'

/** Tracking de timestamps para decidir dirección del sync inicial.
 *
 *  El problema que arregla:
 *  ─────────────────────────
 *  Antes hacíamos push-then-pull SIEMPRE en `initAllDomains`. Eso
 *  arreglaba el caso "single-device, edito y refresco rápido antes de
 *  que dispare el debounce", pero rompía multi-device:
 *
 *  1. Notebook edita → push ✓ → Supabase actualizada.
 *  2. PC abre → pull (PC trae lo de notebook) → PC edita → push ✓.
 *     Supabase ahora tiene la mezcla.
 *  3. Notebook abre con su data VIEJA (no se enteró del paso 2).
 *  4. initAllDomains hace push first → notebook manda su data vieja
 *     a Supabase y `deleteSurplus` BORRA lo que la PC había sumado.
 *  5. Pull trae lo mismo que acabamos de pushear (su data vieja).
 *  6. Notebook ve lo viejo. PC perdió todo en Supabase.
 *
 *  Cómo lo arreglamos:
 *  ────────────────────
 *  Tracking de DOS timestamps por dominio en localStorage:
 *
 *  - `lastModified`: la última vez que el USER hizo un cambio local en
 *    ese dominio. Lo actualizamos desde el subscribe handler de zustand,
 *    SOLO cuando el cambio no vino de un pull (= hidratación desde remote).
 *
 *  - `lastSynced`: la última vez que sabemos que local y remoto quedaron
 *    en sync. Actualizado después de push exitoso O pull exitoso.
 *
 *  Decisión en initAllDomains:
 *  - Si `lastModified > lastSynced` → hay cambios locales SIN sincronizar
 *    → push-then-pull (preserva los cambios locales).
 *  - Si NO → pull-then-(quizás)push (deja que remote sea source of truth
 *    en este device).
 *
 *  Edge case "primera vez en el device":
 *  - No hay timestamps → hasUnsyncedChanges devuelve false → pull-first.
 *    Si remote también está vacío, pull devuelve nada y arrancamos limpio
 *    con un push si tenemos data local sembrada.
 */

const MODIFIED_PREFIX = 'overseer-sync-modified:'
const SYNCED_PREFIX = 'overseer-sync-synced:'
const BASELINE_PREFIX = 'overseer-sync-baseline:'

// ─── Baseline de ids sincronizados ──────────────────────────────────────────
//
// El baseline de un dominio/tabla es el conjunto de ids de filas que sabemos
// quedaron en sync tras el último push/pull exitoso. Es la pieza que permite
// distinguir DOS situaciones que el viejo `deleteSurplus` confundía:
//
//   - "esta fila está en remoto pero NO en mi local porque OTRO device la
//     creó" → NO la tengo que borrar (id ∉ baseline).
//   - "esta fila está en remoto pero NO en mi local porque YO la borré a
//     propósito" → SÍ la borro de remoto (id ∈ baseline, ya la había
//     sincronizado y ahora no está local).
//
// Y en el pull, para el caso inverso (id en mi local pero no en remoto):
//   - id ∈ baseline → fue borrada en otro device → la saco de local.
//   - id ∉ baseline → la creé local y todavía no pusheé → la conservo.
//
// Vive en localStorage (no necesita schema en Supabase). Para usuarios
// existentes arranca vacío → el primer ciclo es no-destructivo (unión).
//
// La `key` es por TABLA, no por dominio, ej: 'tasks:tasks', 'tasks:subtasks',
// 'spi:sessions'. Así un dominio con varias tablas trackea cada una aparte.

export function getBaseline(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(BASELINE_PREFIX + key)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr as string[]) : new Set()
  } catch { return new Set() }
}

export function setBaseline(key: string, ids: Iterable<string>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(BASELINE_PREFIX + key, JSON.stringify([...ids]))
  } catch { /* QuotaExceeded etc — best-effort */ }
}

/** Dominios que están CURRENTLY haciendo pull. Mientras un dominio está
 *  en este set, los subscribe handlers NO marcan modified (esos cambios
 *  vienen de remote, no del user). Es un Set en memoria — no persiste
 *  ni necesita persistir, porque solo dura mientras el pull está en
 *  vuelo dentro de la misma sesión del browser. */
const pullingDomains = new Set<string>()

export function startPulling(domain: string): void {
  pullingDomains.add(domain)
}
export function endPulling(domain: string): void {
  pullingDomains.delete(domain)
}

/** Llamado desde el subscribe handler de cada store en `useSupabaseSync`.
 *  Solo registra timestamp si NO estamos en medio de un pull del mismo
 *  dominio — durante el pull, el setState de hidratación dispararía
 *  subscribe y marcaría falso modified. */
export function markModifiedIfNotPulling(domain: string): void {
  if (pullingDomains.has(domain)) return
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(MODIFIED_PREFIX + domain, new Date().toISOString())
  } catch { /* QuotaExceeded etc — best-effort */ }
}

/** Llamado tras push exitoso O pull exitoso — local y remoto están en
 *  sync ahora.
 *
 *  `at` (opcional): timestamp ISO del momento en que se TOMÓ el snapshot que
 *  se subió. Los push deben pasarlo (capturado al inicio, antes de leer
 *  getState()): si el user edita MIENTRAS el push viaja (típico tipeando en
 *  un textarea en el celu), esa edición tiene lastModified > snapshot y sigue
 *  contando como "unsynced" → el próximo ciclo la pushea. Sin esto, el
 *  markSynced del final estampaba "ahora" y la edición en vuelo quedaba
 *  marcada como sincronizada sin haberse subido nunca → un pull posterior la
 *  pisaba. Los pull no lo pasan (el estado post-merge recién se materializó). */
export function markSynced(domain: string, at?: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SYNCED_PREFIX + domain, at ?? new Date().toISOString())
  } catch { /* best-effort */ }
}

/** ¿Hay cambios locales que nunca llegaron a remoto?
 *  True = lastModified > lastSynced (modificó después del último sync,
 *         O modificó alguna vez pero NUNCA hizo sync).
 *  False = no hubo modificaciones, o todo está al día. */
export function hasUnsyncedChanges(domain: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const mod = localStorage.getItem(MODIFIED_PREFIX + domain)
    if (!mod) return false
    const sync = localStorage.getItem(SYNCED_PREFIX + domain)
    if (!sync) return true
    return mod > sync
  } catch { return false }
}
