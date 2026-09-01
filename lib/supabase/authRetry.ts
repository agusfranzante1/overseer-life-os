/** El token vencido NO es un error: se renueva y se reintenta.
 *
 *  ── EL PROBLEMA ──────────────────────────────────────────────────────────
 *  El access token de Supabase dura una hora. Con la app abierta de fondo (o
 *  el cel en el bolsillo) caduca, y el primer push que sale después rebota con
 *  `PGRST303 · JWT expired`. Eso pasaba dos cosas malas a la vez:
 *
 *   1. El usuario veía un toast rojo — "Sync push failed: JWT expired ·
 *      PGRST303" — que no le dice nada ni puede accionar.
 *   2. Ese push se perdía. El cambio quedaba marcado unsynced y no volvía a
 *      intentarse hasta el próximo foco de la app (`tryAutoPull`, throttle de
 *      30s), que puede ser mucho después.
 *
 *  ── POR QUÉ SE ARREGLA SOLO ──────────────────────────────────────────────
 *  El refresh token sigue vivo: `auth.getSession()` renueva el access token
 *  cuando está vencido. O sea que el mismo push, corrido de nuevo un
 *  milisegundo después, funciona. Lo único que faltaba era volver a correrlo.
 *
 *  ── QUÉ NO HACE ──────────────────────────────────────────────────────────
 *  No reintenta cualquier error. Una migración que falta, una policy de RLS o
 *  un problema de red se comportan como antes (los maneja el caller). Y si
 *  después de renovar la sesión el push VUELVE a fallar, se reporta: esto
 *  silencia lo transitorio, no los fallos de verdad (BASE nº6).
 */

/** Errores en los que renovar la sesión puede cambiar el resultado.
 *
 *  A propósito ACOTADO al token: un 401 genérico o una violación de RLS no
 *  entran, porque renovar no los arregla y silenciarlos sería esconder un
 *  fallo real. Acepta el error crudo de Supabase (tiene `code`/`message` pero
 *  no es un `Error`) o un mensaje ya formateado. */
export function isTokenExpiredError(e: unknown): boolean {
  if (e && typeof e === 'object') {
    const code = (e as { code?: unknown }).code
    if (code === 'PGRST303' || code === 'PGRST301') return true
  }
  const text = typeof e === 'string'
    ? e
    : e && typeof e === 'object'
      ? [(e as { message?: unknown }).message, (e as { code?: unknown }).code]
          .filter((x): x is string => typeof x === 'string').join(' ')
      : ''
  if (!text) return false
  return /\bPGRST(301|303)\b/.test(text)
    || /jwt (is )?expired/i.test(text)
    || /token (is |has )?expired/i.test(text)
    || /jwt (is )?(invalid|malformed)/i.test(text)
    || /jwserror/i.test(text)
    || /invalid claim/i.test(text)
}

export type PushOutcome =
  /** Salió a la primera. */
  | { status: 'ok' }
  /** Falló por token vencido, se renovó la sesión y el reintento salió bien. */
  | { status: 'retried' }
  /** No hay sesión renovable: hay que volver a loguearse. */
  | { status: 'session-dead' }
  /** Falló de verdad. `error` es el del ÚLTIMO intento. */
  | { status: 'failed'; error: unknown }

/**
 * Corre un push tolerando un token vencido: lo renueva y lo reintenta UNA vez.
 *
 * `refresh` devuelve si quedó una sesión válida (en la app es `ensureSession`,
 * que llama a `getSession()` y de paso renueva). Si `refresh` explota —típico
 * de un corte de red— NO se asume que la sesión murió: eso desloguearía al
 * usuario por un problema de conexión. Se devuelve el fallo original y se
 * reintenta en el próximo ciclo, como cualquier otro error.
 */
export async function pushWithAuthRetry(
  run: () => Promise<void>,
  refresh: () => Promise<boolean>,
): Promise<PushOutcome> {
  try {
    await run()
    return { status: 'ok' }
  } catch (first) {
    if (!isTokenExpiredError(first)) return { status: 'failed', error: first }

    let alive: boolean
    try {
      alive = await refresh()
    } catch {
      return { status: 'failed', error: first }
    }
    if (!alive) return { status: 'session-dead' }

    try {
      await run()
      return { status: 'retried' }
    } catch (second) {
      return { status: 'failed', error: second }
    }
  }
}
