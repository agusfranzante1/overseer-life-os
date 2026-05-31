import webpush, { type PushSubscription as WebPushSubscription } from 'web-push'

/** Configure web-push with the VAPID keys from env. Call once per server
 *  start — subsequent calls are cheap no-ops. */
let configured = false
function ensureConfigured() {
  if (configured) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:hi@overseer.app'
  if (!publicKey || !privateKey) {
    throw new Error(
      'Missing VAPID keys. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in your env. ' +
      'Generate a pair with: npx web-push generate-vapid-keys'
    )
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

export interface PushPayload {
  title: string
  body?: string
  url?: string
  icon?: string
  badge?: string
  tag?: string
}

/** Single subscription as stored in Supabase. */
export interface StoredSubscription {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/** Send a push to a single subscription. Returns true if the push was
 *  accepted by the push service. Returns false if the subscription is
 *  expired/gone (HTTP 404/410) — caller should delete that row from the
 *  database. Throws on transient errors. */
export async function sendPushToSubscription(
  sub: StoredSubscription,
  payload: PushPayload,
): Promise<{ ok: true } | { gone: true } | { ok: false; error: string }> {
  ensureConfigured()
  const webPushSub: WebPushSubscription = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  }
  try {
    await webpush.sendNotification(webPushSub, JSON.stringify(payload))
    return { ok: true }
  } catch (e: unknown) {
    const err = e as { statusCode?: number; message?: string }
    // 404 (not found) and 410 (gone) mean this subscription is dead.
    // Tell the caller to clean up.
    if (err.statusCode === 404 || err.statusCode === 410) {
      return { gone: true }
    }
    return { ok: false, error: err.message ?? 'unknown push error' }
  }
}

/** Send to a list of subscriptions in parallel. Returns the list of
 *  subscription ids that came back as "gone" so the caller can prune them. */
export async function sendPushToMany(
  subs: StoredSubscription[],
  payload: PushPayload,
): Promise<{ sent: number; gone: string[]; failed: string[] }> {
  const results = await Promise.allSettled(
    subs.map((s) => sendPushToSubscription(s, payload).then((r) => ({ id: s.id, result: r })))
  )
  const gone: string[] = []
  const failed: string[] = []
  let sent = 0
  for (const r of results) {
    if (r.status !== 'fulfilled') { failed.push('?'); continue }
    if ('gone' in r.value.result) gone.push(r.value.id)
    else if ('error' in r.value.result) failed.push(r.value.id)
    else sent++
  }
  return { sent, gone, failed }
}
