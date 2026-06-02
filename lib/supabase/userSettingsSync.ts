'use client'
import { getSupabaseBrowser, hasSupabaseConfig } from './client'
import type { AppState } from '@/lib/store/appStore'

/** Sincroniza al server las pocas preferencias que el dispatcher de
 *  notificaciones necesita leer del lado server (cron job). Se llama
 *  cada vez que el usuario cambia algo en Settings que afecte el envío
 *  de notificaciones (toggle de canal, lead time, hora del recordatorio).
 *
 *  No mata la UX si falla: error silente con console.warn, porque la
 *  pref local del browser ya quedó persistida en zustand y el dispatcher
 *  va a usar lo que esté en Supabase (defaults si no hay nada). */
export async function syncUserSettingsToSupabase(
  prefs: AppState['notificationPrefs'],
  timezone: string,
): Promise<void> {
  if (typeof window === 'undefined') return
  if (!hasSupabaseConfig()) return
  try {
    const sb = getSupabaseBrowser()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return  // No-logged-in browser → nada que syncear.

    await sb.from('user_settings').upsert({
      user_id: user.id,
      timezone,
      notification_prefs: {
        spiNewSession: prefs.spiNewSession ?? true,
        taskDueSoon: prefs.taskDueSoon ?? true,
        taskOverdue: prefs.taskOverdue ?? true,
        habitReminder: prefs.habitReminder ?? false,
      },
      habit_reminder_hour: prefs.habitReminderHour ?? 21,
      habit_reminder_minute: prefs.habitReminderMinute ?? 0,
      task_due_lead_minutes: prefs.taskDueLeadMinutes ?? 60,
      spi_new_lead_minutes: prefs.spiNewSessionLeadMinutes ?? 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  } catch (e) {
    console.warn('[user_settings sync] failed:', e instanceof Error ? e.message : 'unknown')
  }
}
