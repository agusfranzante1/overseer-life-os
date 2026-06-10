import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { sendPushToMany, type StoredSubscription } from '@/lib/push/server'
import {
  buildHabitReminderPayload,
  buildHabitSpecificPayload,
  buildTaskDuePayload,
  buildTaskOverduePayload,
  buildSpiNewPayload,
} from '@/lib/notifications/builders'
import { sendEmail, pushPayloadToEmail } from '@/lib/notifications/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Endpoint para que el USUARIO autenticado fuerce el dispatch de UN canal
 *  ahora mismo, ignorando ventana de tiempo y dedupe. Útil para:
 *   - Smoke-test desde Settings al activar un canal por primera vez.
 *   - Debug cuando "no me llegó el aviso de las 21" — apretás el botón
 *     y comprobás que el push viaja end-to-end (server → push service →
 *     service worker → notificación).
 *
 *  Body JSON:
 *    { "type": "habit_reminder" | "task_due" | "task_overdue" | "spi_new" }
 *
 *  Auth: usa la sesión del usuario logueado (NO el cron secret). Solo
 *  manda al usuario que pega — NO recorre la base entera. */
export async function POST(req: NextRequest) {
  const sbUser = await getSupabaseServer()
  const { data: { user } } = await sbUser.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: { type?: string; emailOnly?: boolean } = {}
  try { body = await req.json() } catch { /* empty body OK */ }
  const type = (body.type ?? 'habit_reminder') as
    'habit_reminder' | 'habit_specific' | 'task_due' | 'task_overdue' | 'spi_new'
  const emailOnly = body.emailOnly === true

  const sb = getSupabaseAdmin()

  // Suscripciones del usuario — opcionales si emailOnly=true
  let subs: StoredSubscription[] = []
  if (!emailOnly) {
    const { data: subsRaw } = await sb
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', user.id)
      .eq('enabled', true)
    subs = subsRaw ?? []
    if (subs.length === 0) {
      return NextResponse.json({
        ok: false,
        error: 'No tenés ninguna suscripción push activa. Activala arriba primero ("Suscribir este dispositivo").',
      }, { status: 400 })
    }
  }

  // Armar un payload de muestra según el tipo
  let payload
  switch (type) {
    case 'habit_reminder':
      payload = buildHabitReminderPayload([
        { name: 'Tomar agua', icon: '💧' },
        { name: 'Leer 30min', icon: '📚' },
      ])
      break
    case 'habit_specific':
      payload = buildHabitSpecificPayload({ name: 'Meditar 10min', icon: '🧘' }, '08:00')
      break
    case 'task_due':
      payload = buildTaskDuePayload({ id: 'test', title: 'Tarea de ejemplo' }, 60)
      break
    case 'task_overdue':
      payload = buildTaskOverduePayload([{ id: 'test', title: 'Tarea vencida' }])
      break
    case 'spi_new':
      const today = new Date()
      payload = buildSpiNewPayload(`${today.getDate()}/${today.getMonth() + 1}`)
      break
  }

  // Si es emailOnly, no manda push — solo email. Si no, hace ambos.
  const pushResult = emailOnly
    ? { sent: 0, gone: [] as string[], failed: [] as unknown[] }
    : await sendPushToMany(subs, payload)

  // Email — mandamos si emailOnly=true (botón "Probar" del panel email)
  // O si el user tiene emailNotifications=true en sus settings (botones
  // "🔔 probar ahora" de cada canal deben también pegarle por email para
  // que el user pueda verificar que efectivamente le llega al Gmail).
  const { data: settings } = await sb
    .from('user_settings')
    .select('notification_email, notification_prefs')
    .eq('user_id', user.id)
    .maybeSingle()
  type SettingsRow = { notification_email?: string | null; notification_prefs?: Record<string, unknown> | null }
  const settingsRow = settings as SettingsRow | null
  const prefs = (settingsRow?.notification_prefs ?? {}) as Record<string, unknown>
  const userEmailEnabled = prefs.emailNotifications === true || prefs.emailNotifications === 'true'
  const shouldSendEmail = emailOnly || userEmailEnabled

  let emailSent: { ok: boolean; to?: string; error?: string; skipped?: boolean } | null = null
  if (shouldSendEmail) {
    const customEmail = settingsRow?.notification_email
    const to = customEmail || user.email
    if (!to) {
      if (emailOnly) {
        return NextResponse.json({
          ok: false,
          error: 'No hay email destino: ni custom en settings ni en tu cuenta.',
        }, { status: 400 })
      }
      // Sin destino en modo no-emailOnly: skipeamos sin romper el push.
      emailSent = { ok: false, error: 'no email destination', skipped: true }
    } else {
      const emailPayload = pushPayloadToEmail(payload, to)
      const r = await sendEmail(emailPayload)
      emailSent = { ok: r.ok, to, error: r.error, skipped: r.skipped }
      if (!r.ok && emailOnly) {
        return NextResponse.json({
          ok: false,
          error: r.skipped
            ? 'RESEND_API_KEY no está configurado en el server. Pedile al admin que lo agregue a Vercel.'
            : r.error ?? 'Falló el envío de email',
        }, { status: 500 })
      }
    }
  }

  return NextResponse.json({
    ok: true,
    sent: pushResult.sent,
    gone: pushResult.gone.length,
    failed: pushResult.failed.length,
    email: emailSent?.to,
    emailOk: emailSent?.ok,
    emailError: emailSent && !emailSent.ok ? emailSent.error : undefined,
  })
}
