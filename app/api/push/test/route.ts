import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'
import { sendPushToMany, type StoredSubscription, type PushPayload } from '@/lib/push/server'

/** POST /api/push/test
 *
 *  Sends a test push to ALL push_subscriptions rows belonging to the
 *  authenticated user. Used by the Settings UI's "send test notification"
 *  button so the user can confirm end-to-end push delivery works.
 *
 *  Optional body: { title?, body?, url? } to customize the notification. */
export async function POST(req: NextRequest) {
  try {
    const sb = await getSupabaseServer()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as Partial<PushPayload>
    const payload: PushPayload = {
      title: body.title ?? '✅ Overseer está listo',
      body:  body.body  ?? 'Las notificaciones push están funcionando correctamente.',
      url:   body.url   ?? '/dashboard',
      icon:  '/logo.png',
      badge: '/logo.png',
      tag:   'overseer-test',
    }

    // Fetch all enabled subscriptions for this user.
    const subsRes = await sb
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', user.id)
      .eq('enabled', true)

    if (subsRes.error) {
      return NextResponse.json({
        ok: false,
        error: `No pude leer suscripciones: ${subsRes.error.message}. Corré la migration push_subscriptions si no lo hiciste.`,
      }, { status: 500 })
    }
    const subs = (subsRes.data ?? []) as StoredSubscription[]
    if (subs.length === 0) {
      return NextResponse.json({
        ok: false,
        error: 'No tenés ninguna suscripción registrada. Activá las notificaciones en Configuración primero.',
      }, { status: 400 })
    }

    const { sent, gone, failed } = await sendPushToMany(subs, payload)

    // Prune "gone" subscriptions (HTTP 410 — the push service told us the
    // subscription is dead). Keeps the table clean.
    if (gone.length > 0) {
      await sb.from('push_subscriptions').delete().in('id', gone)
    }

    return NextResponse.json({
      ok: sent > 0,
      sent,
      pruned: gone.length,
      failed: failed.length,
      total: subs.length,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
