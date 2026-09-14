'use client'

import { getSupabaseBrowser, hasSupabaseConfig } from '@/lib/supabase/client'

/** Public VAPID key — used by the browser to encrypt subscription payloads.
 *  Lives in NEXT_PUBLIC_VAPID_PUBLIC_KEY so it's available client-side.
 *  Pair with VAPID_PRIVATE_KEY (server-only) used by /api/push/send. */
function getVapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null
}

/** Convert a base64-url-encoded public key into the Uint8Array format that
 *  the Push subscription API expects. The Web Push spec uses URL-safe
 *  base64 (no padding, '-' and '_' instead of '+' and '/'). */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i)
  return output
}

export interface PushCapability {
  /** True if the runtime supports the APIs needed. */
  supported: boolean
  /** Current permission state: 'default' | 'granted' | 'denied'. */
  permission: NotificationPermission
  /** True if there's an active subscription registered locally. */
  subscribed: boolean
  /** True si el servidor tiene guardada la suscripción de ESTE dispositivo
   *  (mismo endpoint). `null` = no se pudo consultar (sin sesión / sin
   *  Supabase). Es lo que de verdad importa: sin la fila en la nube, el
   *  dispatcher no tiene a quién mandarle nada, aunque acá diga "suscripto". */
  registeredOnServer: boolean | null
  /** Why it's not supported — useful for showing the user a hint. */
  reason?: string
}

/** Probe what's available in the current browser. iOS Safari < 16.4 doesn't
 *  support push notifications. Apps not added to the home screen on iOS
 *  won't fire pushes even if subscribed. */
export async function getPushCapability(): Promise<PushCapability> {
  if (typeof window === 'undefined') {
    return { supported: false, permission: 'default', subscribed: false, registeredOnServer: null, reason: 'ssr' }
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return {
      supported: false,
      permission: 'default',
      subscribed: false,
      registeredOnServer: null,
      reason: 'API no disponible — necesitás iOS 16.4+ o un browser moderno.',
    }
  }
  if (!getVapidPublicKey()) {
    return {
      supported: false,
      permission: Notification.permission,
      subscribed: false,
      registeredOnServer: null,
      reason: 'Falta configurar NEXT_PUBLIC_VAPID_PUBLIC_KEY en el server.',
    }
  }

  let subscribed = false
  let endpoint: string | null = null
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    subscribed = !!sub
    endpoint = sub?.endpoint ?? null
  } catch { /* noop */ }

  return {
    supported: true,
    permission: Notification.permission,
    subscribed,
    registeredOnServer: endpoint ? await isEndpointOnServer(endpoint) : (subscribed ? null : false),
  }
}

/** ¿El servidor tiene una fila con este endpoint? RLS ya limita al usuario
 *  logueado. `null` si no hay cómo preguntar (sin sesión / sin Supabase). */
async function isEndpointOnServer(endpoint: string): Promise<boolean | null> {
  if (!hasSupabaseConfig()) return null
  try {
    const sb = getSupabaseBrowser()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return null
    const { data, error } = await sb.from('push_subscriptions')
      .select('id').eq('user_id', user.id).eq('endpoint', endpoint).eq('enabled', true).limit(1)
    if (error) return null
    return (data?.length ?? 0) > 0
  } catch {
    return null
  }
}

// ─── Auto-reparación de la suscripción ──────────────────────────────────────
//
// EL BUG QUE ARREGLA: la fila de push_subscriptions solo se escribía cuando
// el usuario tocaba "Activar". Después el browser puede ROTAR o INVALIDAR el
// endpoint (pasa solo, sin avisar: Apple y Google lo hacen cada tanto), el
// dispatcher recibe 410 Gone, borra la fila… y nadie vuelve a escribirla. El
// celu sigue diciendo "suscripción activa" (mira solo su estado local) y la
// tabla en la nube queda VACÍA: cada corrida del cron no tiene a quién
// mandarle nada. Así estuvo el usuario desde el 2026-09-10 (medido en la base:
// 0 filas, y el último log con gone = [la única que había]).
//
// Acá, cada vez que se abre la app: si el permiso está otorgado, nos
// aseguramos de que la suscripción local exista (si el browser la tiró, se
// vuelve a suscribir SIN prompt: el permiso ya está) y de que el servidor
// tenga exactamente ese endpoint. Idempotente (upsert por endpoint) y barato,
// pero igual se throttlea para no pegarle a Supabase en cada foco.

const SYNC_STAMP_KEY = 'overseer-push-synced-at'
const SYNC_EVERY_MS = 6 * 60 * 60 * 1000

export type EnsureResult =
  | { status: 'skipped'; reason: string }
  | { status: 'ok'; resubscribed: boolean }
  | { status: 'error'; error: string }

/** Repara la suscripción de este dispositivo si hace falta. Pensado para
 *  correr al abrir la app y al volver al foco. No pide permiso nunca: si el
 *  usuario no activó las notificaciones, no hace nada. */
/** `fresh`: tirar la suscripción local y crear una NUEVA antes de registrar.
 *  Para el botón "Reparar": si el servidor la borró fue porque el endpoint
 *  devolvía 410, o sea que la local puede estar muerta aunque exista — y
 *  re-registrar un endpoint muerto solo repite el ciclo. */
export async function ensurePushSubscriptionSynced(opts?: { force?: boolean; fresh?: boolean }): Promise<EnsureResult> {
  if (typeof window === 'undefined') return { status: 'skipped', reason: 'ssr' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { status: 'skipped', reason: 'api no disponible' }
  }
  if (Notification.permission !== 'granted') return { status: 'skipped', reason: 'sin permiso' }
  const vapidKey = getVapidPublicKey()
  if (!vapidKey) return { status: 'skipped', reason: 'sin VAPID' }
  if (!hasSupabaseConfig()) return { status: 'skipped', reason: 'sin supabase' }

  if (!opts?.force) {
    try {
      const last = Number(window.localStorage.getItem(SYNC_STAMP_KEY) ?? 0)
      if (Date.now() - last < SYNC_EVERY_MS) return { status: 'skipped', reason: 'reciente' }
    } catch { /* noop */ }
  }

  try {
    const sb = getSupabaseBrowser()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { status: 'skipped', reason: 'sin sesión' }

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    let resubscribed = false
    if (sub && opts?.fresh) {
      try { await sub.unsubscribe() } catch { /* noop */ }
      sub = null
    }
    if (!sub) {
      // El browser tiró la suscripción (o nunca existió en este SW). Con el
      // permiso ya otorgado, subscribe() no muestra ningún prompt.
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as BufferSource,
      })
      resubscribed = true
    }

    const json = sub.toJSON()
    const p256dh = json.keys?.p256dh
    const auth = json.keys?.auth
    if (!json.endpoint || !p256dh || !auth) return { status: 'error', error: 'suscripción incompleta' }

    const res = await sb.from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh,
      auth,
      device_label: defaultDeviceLabel(),
      user_agent: navigator.userAgent,
      enabled: true,
    }, { onConflict: 'endpoint' })
    if (res.error) return { status: 'error', error: res.error.message }

    try { window.localStorage.setItem(SYNC_STAMP_KEY, String(Date.now())) } catch { /* noop */ }
    return { status: 'ok', resubscribed }
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : 'unknown' }
  }
}

/** Request permission and subscribe this browser/device to push notifications.
 *  Stores the subscription in Supabase so the server can send pushes later. */
export async function subscribeToPush(deviceLabel?: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (typeof window === 'undefined') return { ok: false, error: 'No disponible en server' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, error: 'API no soportada en este browser. iOS necesita 16.4+.' }
  }
  const vapidKey = getVapidPublicKey()
  if (!vapidKey) return { ok: false, error: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY no configurada' }

  // 1) Permission
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, error: 'Permiso de notificaciones denegado' }
  }

  // 2) Subscribe via the service worker's PushManager
  let subscription: PushSubscription
  try {
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    // The lib's `BufferSource` type uses ArrayBuffer specifically. Strict
    // TS versions narrow Uint8Array<ArrayBufferLike> in a way that flags
    // this — passing it through a BufferSource cast is correct at runtime
    // since the underlying buffer is always an ArrayBuffer here.
    const appServerKey = urlBase64ToUint8Array(vapidKey) as unknown as BufferSource
    subscription = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey,
    })
  } catch (e) {
    return { ok: false, error: `No pude suscribir el browser: ${e instanceof Error ? e.message : 'unknown'}` }
  }

  // 3) Persist in Supabase. The endpoint is the unique key — upsert so
  //    re-subscribing the same device updates instead of creating a dupe.
  if (!hasSupabaseConfig()) {
    return { ok: false, error: 'Supabase no configurado' }
  }
  const sb = getSupabaseBrowser()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sin sesión activa' }

  const json = subscription.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!json.endpoint || !p256dh || !auth) {
    return { ok: false, error: 'Subscription incompleta — faltan keys' }
  }

  const res = await sb.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: json.endpoint,
    p256dh,
    auth,
    device_label: deviceLabel ?? defaultDeviceLabel(),
    user_agent: navigator.userAgent,
    enabled: true,
  }, { onConflict: 'endpoint' })

  if (res.error) {
    return { ok: false, error: `Falló guardar la suscripción: ${res.error.message}. Corré supabase/migration_push_subscriptions.sql si no lo hiciste.` }
  }

  return { ok: true }
}

/** Tear down the current browser's subscription AND remove it from Supabase. */
export async function unsubscribeFromPush(): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === 'undefined') return { ok: false, error: 'No disponible en server' }
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      const endpoint = sub.endpoint
      await sub.unsubscribe()
      if (hasSupabaseConfig()) {
        const sb = getSupabaseBrowser()
        const { data: { user } } = await sb.auth.getUser()
        if (user) {
          await sb.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', user.id)
        }
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}

/** Best-guess device label based on user-agent. Helps the user identify
 *  which devices are subscribed in the Settings UI. */
function defaultDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Dispositivo'
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'PC'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Dispositivo'
}
