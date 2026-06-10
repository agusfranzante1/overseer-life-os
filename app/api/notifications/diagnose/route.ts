import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { localTimeIn } from '@/lib/notifications/tz'
import { withinWindow } from '@/lib/notifications/timeWindow'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Endpoint de diagnóstico para entender por qué una notificación de hábito
 * no llegó. Para cada hábito del user logueado, devuelve TODOS los gates
 * que el dispatcher evalúa, con un explainer en español.
 *
 * Pegale desde la UI o desde el browser: GET /api/notifications/diagnose
 * (devuelve JSON). Útil para responder "por qué no me llegó X".
 */
const WINDOW_MIN = 5

export async function GET(_req: NextRequest) {
  const sbUser = await getSupabaseServer()
  const { data: { user } } = await sbUser.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const now = new Date()

  // 1) user_settings — timezone, prefs, email
  const { data: settings } = await sb
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  const tz = (settings?.timezone as string) || 'UTC'
  const local = localTimeIn(tz, now)
  const prefs = ((settings?.notification_prefs ?? {}) as Record<string, unknown>) || {}

  // 2) push_subscriptions count
  const { data: subs } = await sb
    .from('push_subscriptions')
    .select('id, enabled, endpoint')
    .eq('user_id', user.id)
    .eq('enabled', true)

  // 3) Habits del user
  const { data: habits } = await sb
    .from('habits')
    .select('id, name, icon, target_days, completed_dates, skipped_dates, reminder_time')
    .eq('user_id', user.id)

  // 4) Para cada hábito con reminder_time, calculamos los gates
  const dow = (() => {
    const [yT, mT, dT] = local.ymd.split('-').map(Number)
    return new Date(yT, mT - 1, dT).getDay()
  })()

  const habitDiag = (habits ?? []).map((h) => {
    const rt = h.reminder_time as string | null
    const gates: { gate: string; pass: boolean; detail: string }[] = []

    gates.push({
      gate: 'reminder_time seteado',
      pass: !!rt,
      detail: rt
        ? `Hora configurada: ${rt} (TZ del user: ${tz})`
        : 'Este hábito no tiene hora de recordatorio (editá el hábito y poné una hora).',
    })

    if (!rt) return { id: h.id, name: h.name, gates, wouldFire: false }

    const [rh, rm] = (rt as string).split(':').map(Number)
    const hourValid = Number.isFinite(rh) && Number.isFinite(rm)
    gates.push({
      gate: 'formato hora válido',
      pass: hourValid,
      detail: hourValid ? 'HH:MM válido' : `Formato inválido: "${rt}"`,
    })

    const inWindow = hourValid ? withinWindow(local.hour, local.minute, rh, rm, WINDOW_MIN) : false
    gates.push({
      gate: 'dentro de ventana ±5min',
      pass: inWindow,
      detail: hourValid
        ? `Ahora son ${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')} (TZ ${tz}). El cron solo dispara si está entre ${String(rh).padStart(2, '0')}:${String(Math.max(0, rm - WINDOW_MIN)).padStart(2, '0')} y ${String(rh).padStart(2, '0')}:${String(rm + WINDOW_MIN).padStart(2, '0')}.`
        : '—',
    })

    const targetDays = (h.target_days as number[] | null) ?? []
    const targetMatches = targetDays.length === 0 || targetDays.includes(dow)
    gates.push({
      gate: 'aplica al día de la semana',
      pass: targetMatches,
      detail: targetDays.length === 0
        ? 'Sin filtro de días — aplica todos los días.'
        : `Días configurados: [${targetDays.join(',')}] (0=Dom..6=Sáb). Hoy es ${dow}. ${targetMatches ? 'OK' : 'HOY NO APLICA.'}`,
    })

    const completedToday = ((h.completed_dates as string[] | null) ?? []).includes(local.ymd)
    gates.push({
      gate: 'no marcado como hecho hoy',
      pass: !completedToday,
      detail: completedToday ? `Ya está marcado hecho el ${local.ymd}.` : 'OK',
    })

    const skippedToday = ((h.skipped_dates as string[] | null) ?? []).includes(local.ymd)
    gates.push({
      gate: 'no marcado skipped hoy',
      pass: !skippedToday,
      detail: skippedToday ? `Está marcado skipped el ${local.ymd}.` : 'OK',
    })

    // dedupe
    const dedupe = `habit-time:${h.id}:${local.ymd}`
    return { id: h.id as string, name: h.name as string, gates, dedupe, wouldFire: gates.every((g) => g.pass) }
  })

  // 5) Check de notification_log (últimas 24h)
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recentLogs } = await sb
    .from('notification_log')
    .select('channel, dedupe_key, created_at')
    .eq('user_id', user.id)
    .gte('created_at', yesterday)
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    timezone: tz,
    localTime: `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`,
    localDate: local.ymd,
    prefs: {
      habitSpecificReminders: prefs.habitSpecificReminders ?? '(default true)',
      habitReminder:          prefs.habitReminder          ?? '(default false)',
      taskDueSoon:            prefs.taskDueSoon            ?? '(default true)',
      taskOverdue:            prefs.taskOverdue            ?? '(default true)',
      emailNotifications:     prefs.emailNotifications     ?? '(default false)',
    },
    notificationEmail: settings?.notification_email ?? '(usa email de auth)',
    pushSubscriptions: subs?.length ?? 0,
    habits: habitDiag,
    recentNotificationLog: recentLogs ?? [],
    summary: {
      anyHabitWouldFireNow: habitDiag.some((h) => h.wouldFire),
      habitsWithReminderTime: habitDiag.filter((h) => h.gates[0].pass).length,
      totalHabits: habitDiag.length,
    },
  })
}
