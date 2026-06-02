import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { sendPushToMany, type StoredSubscription } from '@/lib/push/server'
import { localTimeIn, localYmdHmToUtc } from '@/lib/notifications/tz'
import { withinWindow, withinWindowAt } from '@/lib/notifications/timeWindow'
import { wasSent, logSent } from '@/lib/notifications/idempotency'
import {
  buildHabitReminderPayload,
  buildTaskDuePayload,
  buildTaskOverduePayload,
  buildSpiNewPayload,
} from '@/lib/notifications/builders'

// Necesitamos `nodejs` (no edge) porque web-push usa criptografía Node.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'   // que cron NUNCA cachee la respuesta
export const maxDuration = 60            // segundos — el dispatcher de pocos usuarios cabe holgado

/** Cron secret esperado en `Authorization: Bearer ${CRON_SECRET}`. Vercel
 *  cron lo manda automáticamente cuando configurás el cron en vercel.json
 *  y el secret en env vars (ver docs/notifications-dispatcher-plan.md
 *  Etapa 5). */
function isAuthed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') ?? ''
  const expected = process.env.CRON_SECRET
  if (!expected) return false  // sin secret configurado, NUNCA permitir
  return auth === `Bearer ${expected}`
}

const WINDOW_MIN = 5

interface DispatchStats {
  habit: number
  task_due: number
  task_overdue: number
  spi_new: number
  skipped: number
  errors: number
  gone_subs_removed: number
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const now = new Date()
  const stats: DispatchStats = {
    habit: 0, task_due: 0, task_overdue: 0, spi_new: 0,
    skipped: 0, errors: 0, gone_subs_removed: 0,
  }

  try {
    // ── 1) Listar usuarios con AL MENOS 1 suscripción push activa ──────
    const { data: subsAll, error: subsErr } = await sb
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth, enabled')
      .eq('enabled', true)

    if (subsErr) {
      return NextResponse.json({ ok: false, error: subsErr.message }, { status: 500 })
    }
    const subsByUser = new Map<string, StoredSubscription[]>()
    for (const s of subsAll ?? []) {
      if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, [])
      subsByUser.get(s.user_id)!.push({ id: s.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth })
    }
    const userIds = Array.from(subsByUser.keys())
    if (userIds.length === 0) {
      return NextResponse.json({ ok: true, ts: now.toISOString(), ...stats, note: 'no subscribed users' })
    }

    // ── 2) Bulk-load user_settings de TODOS los usuarios suscritos ────
    const { data: settingsAll } = await sb
      .from('user_settings')
      .select('*')
      .in('user_id', userIds)
    const settingsByUser = new Map<string, UserSettings>()
    for (const s of settingsAll ?? []) {
      settingsByUser.set(s.user_id, s as UserSettings)
    }

    // ── 3) Por cada usuario, despachar en serie (no en paralelo masivo
    //    para no pegar a Supabase con un fan-out gigante). El dispatcher
    //    de pocos usuarios cabe en los 60s del maxDuration sin drama. ─
    for (const userId of userIds) {
      const settings = settingsByUser.get(userId) ?? defaultSettings(userId)
      const subs = subsByUser.get(userId) ?? []
      if (subs.length === 0) continue
      const prefs = (settings.notification_prefs ?? {}) as Record<string, unknown>
      const tz = settings.timezone || 'UTC'
      const local = localTimeIn(tz, now)

      // ── CANAL 1: habit_reminder ──
      if (prefs.habitReminder === true || prefs.habitReminder === 'true') {
        const targetH = settings.habit_reminder_hour ?? 21
        const targetM = settings.habit_reminder_minute ?? 0
        if (withinWindow(local.hour, local.minute, targetH, targetM, WINDOW_MIN)) {
          const dedupe = `habit:${local.ymd}`
          if (!(await wasSent(sb, userId, 'habit_reminder', dedupe))) {
            const habits = await fetchUserHabits(sb, userId)
            const pending = computePendingHabits(habits, local.ymd)
            if (pending.length > 0) {
              const payload = buildHabitReminderPayload(pending)
              const result = await sendPushToMany(subs, payload)
              await pruneGoneSubs(sb, result.gone, stats)
              await logSent(sb, userId, 'habit_reminder', dedupe, payload, result)
              stats.habit++
            } else {
              stats.skipped++
            }
          } else {
            stats.skipped++
          }
        }
      }

      // ── CANAL 2: task_due ──
      if (prefs.taskDueSoon !== false) {
        const leadGlobal = settings.task_due_lead_minutes ?? 60
        const tasks = await fetchUserUpcomingTasks(sb, userId, now)
        for (const t of tasks) {
          const dueAt = computeTaskDueAt(t, tz)
          if (!dueAt) continue
          const lead = (t.notify_before_minutes as number | null) ?? leadGlobal
          const fireAt = new Date(dueAt.getTime() - lead * 60_000)
          if (!withinWindowAt(now, fireAt, WINDOW_MIN)) continue
          const dedupe = `task:${t.id}:due`
          if (await wasSent(sb, userId, 'task_due', dedupe)) { stats.skipped++; continue }
          const payload = buildTaskDuePayload(
            {
              id: t.id,
              title: t.title,
              description: t.description ?? undefined,
              dueDate: t.due_date ?? undefined,
              dueTime: t.due_time ?? undefined,
            },
            lead,
          )
          const result = await sendPushToMany(subs, payload)
          await pruneGoneSubs(sb, result.gone, stats)
          await logSent(sb, userId, 'task_due', dedupe, payload, result)
          stats.task_due++
        }
      }

      // ── CANAL 3: task_overdue ──
      if (prefs.taskOverdue !== false) {
        // Solo una vez por día a la hora del recordatorio de hábitos para
        // no spammear. Reusamos esa hora porque "tareas vencidas" suelen
        // ir junto al check de fin del día.
        const reminderH = settings.habit_reminder_hour ?? 21
        const reminderM = settings.habit_reminder_minute ?? 0
        if (withinWindow(local.hour, local.minute, reminderH, reminderM, WINDOW_MIN)) {
          const dedupe = `overdue:${local.ymd}`
          if (!(await wasSent(sb, userId, 'task_overdue', dedupe))) {
            const overdue = await fetchUserOverdueTasks(sb, userId, local.ymd)
            if (overdue.length > 0) {
              const payload = buildTaskOverduePayload(overdue.map((t) => ({ id: t.id, title: t.title })))
              const result = await sendPushToMany(subs, payload)
              await pruneGoneSubs(sb, result.gone, stats)
              await logSent(sb, userId, 'task_overdue', dedupe, payload, result)
              stats.task_overdue++
            } else {
              stats.skipped++
            }
          }
        }
      }

      // ── CANAL 4: spi_new ──
      // Solo dispara los SÁBADOS a la hora del recordatorio si la sesión
      // de esta semana NO existe todavía.
      if (prefs.spiNewSession !== false) {
        // Día de la semana en TZ local: 0=Dom, 6=Sáb.
        const localDow = computeLocalDayOfWeek(now, tz)
        if (localDow === 6) {
          const targetH = settings.habit_reminder_hour ?? 21    // re-use; ok p/v1
          const targetM = settings.habit_reminder_minute ?? 0
          if (withinWindow(local.hour, local.minute, targetH, targetM, WINDOW_MIN)) {
            const dedupe = `spi:${local.ymd}`
            if (!(await wasSent(sb, userId, 'spi_new', dedupe))) {
              const has = await hasSpiSessionForWeek(sb, userId, local.ymd)
              if (!has) {
                const payload = buildSpiNewPayload(local.ymd)
                const result = await sendPushToMany(subs, payload)
                await pruneGoneSubs(sb, result.gone, stats)
                await logSent(sb, userId, 'spi_new', dedupe, payload, result)
                stats.spi_new++
              } else {
                stats.skipped++
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ ok: true, ts: now.toISOString(), ...stats })
  } catch (e) {
    stats.errors++
    console.error('[dispatch] unexpected error', e)
    return NextResponse.json({
      ok: false,
      ts: now.toISOString(),
      error: e instanceof Error ? e.message : 'unknown',
      ...stats,
    }, { status: 500 })
  }
}

// Vercel cron también pega via GET por compatibilidad — aceptamos ambos.
export async function GET(req: NextRequest) {
  return POST(req)
}

// ─── Helpers ─────────────────────────────────────────────────────────

interface UserSettings {
  user_id: string
  timezone: string
  notification_prefs: Record<string, unknown>
  habit_reminder_hour: number
  habit_reminder_minute: number
  task_due_lead_minutes: number
  spi_new_lead_minutes: number
}

function defaultSettings(userId: string): UserSettings {
  return {
    user_id: userId,
    timezone: 'UTC',
    notification_prefs: { spiNewSession: true, taskDueSoon: true, taskOverdue: true, habitReminder: false },
    habit_reminder_hour: 21,
    habit_reminder_minute: 0,
    task_due_lead_minutes: 60,
    spi_new_lead_minutes: 0,
  }
}

/** Borra las suscripciones que el push service marcó como "gone" (404/410)
 *  para que el próximo cron no las reintente. */
async function pruneGoneSubs(
  sb: ReturnType<typeof getSupabaseAdmin>,
  goneIds: string[],
  stats: DispatchStats,
): Promise<void> {
  if (goneIds.length === 0) return
  const { error } = await sb.from('push_subscriptions').delete().in('id', goneIds)
  if (!error) stats.gone_subs_removed += goneIds.length
}

interface HabitRow {
  id: string
  name: string
  icon: string
  target_days: number[] | null
  completed_dates: string[] | null
  skipped_dates: string[] | null
}

async function fetchUserHabits(sb: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<HabitRow[]> {
  const { data } = await sb.from('habits').select('id, name, icon, target_days, completed_dates, skipped_dates').eq('user_id', userId)
  return data ?? []
}

/** Hábitos NO marcados HOY (no done, no skipped). Filtra los que no
 *  aplican para hoy (target_days no incluye el día de la semana). */
function computePendingHabits(habits: HabitRow[], ymd: string): { name: string; icon: string }[] {
  const [y, m, d] = ymd.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()  // 0=Sun..6=Sat — local, OK porque ymd es local
  return habits
    .filter((h) => {
      const td = h.target_days ?? []
      const appliesToday = td.length === 0 || td.includes(dow)
      if (!appliesToday) return false
      if ((h.completed_dates ?? []).includes(ymd)) return false
      if ((h.skipped_dates ?? []).includes(ymd)) return false
      return true
    })
    .map((h) => ({ name: h.name, icon: h.icon }))
}

interface TaskRow {
  id: string
  title: string
  description: string | null
  due_date: string | null
  due_time: string | null
  notify_before_minutes: number | null
  archived_at: string | null
  completed_at: string | null
  status: string
}

async function fetchUserUpcomingTasks(sb: ReturnType<typeof getSupabaseAdmin>, userId: string, now: Date): Promise<TaskRow[]> {
  // Tareas con dueDate en los próximos 3 días (suficiente para que cualquier
  // lead time razonable las atrape) y no archivadas / no completadas.
  const inFuture = new Date(now.getTime() + 3 * 86400_000)
  const toYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const { data } = await sb
    .from('tasks')
    .select('id, title, description, due_date, due_time, notify_before_minutes, archived_at, completed_at, status')
    .eq('user_id', userId)
    .is('archived_at', null)
    .is('completed_at', null)
    .gte('due_date', toYmd(now))
    .lte('due_date', toYmd(inFuture))
  return data ?? []
}

async function fetchUserOverdueTasks(sb: ReturnType<typeof getSupabaseAdmin>, userId: string, todayYmd: string): Promise<TaskRow[]> {
  const { data } = await sb
    .from('tasks')
    .select('id, title, description, due_date, due_time, notify_before_minutes, archived_at, completed_at, status')
    .eq('user_id', userId)
    .is('archived_at', null)
    .is('completed_at', null)
    .lt('due_date', todayYmd)
  return data ?? []
}

function computeTaskDueAt(t: TaskRow, tz: string): Date | null {
  if (!t.due_date) return null
  const time = t.due_time ?? '09:00'
  const [hh, mm] = time.split(':').map(Number)
  return localYmdHmToUtc(t.due_date, hh, mm, tz)
}

function computeLocalDayOfWeek(now: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' })
  const name = fmt.format(now)
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[name.slice(0, 3) as 'Sun'] ?? 0
}

async function hasSpiSessionForWeek(sb: ReturnType<typeof getSupabaseAdmin>, userId: string, satYmd: string): Promise<boolean> {
  const { data } = await sb
    .from('spi_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('week_start_date', satYmd)
    .limit(1)
    .maybeSingle()
  return !!data
}
