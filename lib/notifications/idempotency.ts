import type { SupabaseClient } from '@supabase/supabase-js'

export type NotificationType = 'habit_reminder' | 'habit_specific' | 'task_due' | 'task_overdue' | 'spi_new'

/** Pregunta a la tabla `notification_log` si ya se envió esta notificación
 *  a este usuario con esta `dedupe_key`. Si SÍ → caller skipea.
 *
 *  Implementación: SELECT con LIMIT 1 sobre el unique compound index. El
 *  query es <1ms en condiciones normales por el index. */
export async function wasSent(
  sb: SupabaseClient,
  userId: string,
  type: NotificationType,
  dedupeKey: string,
): Promise<boolean> {
  const { data, error } = await sb
    .from('notification_log')
    .select('id')
    .eq('user_id', userId)
    .eq('notification_type', type)
    .eq('dedupe_key', dedupeKey)
    .limit(1)
    .maybeSingle()
  if (error) {
    // Si hay un error consultando el log, ASUMIMOS que NO se mandó para
    // no quedarnos atrapados sin enviar nunca. Lo loguéamos para debug.
    console.warn('[notif:wasSent] error', { userId, type, dedupeKey, err: error.message })
    return false
  }
  return !!data
}

/** Inserta la fila de log POST-envío. El unique constraint asegura que
 *  si dos corridas del cron pisan el mismo target (race condition rara),
 *  el segundo INSERT falla con 23505 y no se duplica el log.
 *
 *  Pasamos también el `payload` enviado y el `result` del web-push
 *  (cuántos devices recibieron, cuáles murieron, errores) para debug. */
export async function logSent(
  sb: SupabaseClient,
  userId: string,
  type: NotificationType,
  dedupeKey: string,
  payload: unknown,
  result: unknown,
): Promise<void> {
  const { error } = await sb.from('notification_log').insert({
    user_id: userId,
    notification_type: type,
    dedupe_key: dedupeKey,
    payload,
    result,
  })
  if (error && error.code !== '23505') {
    // 23505 = unique violation → otra corrida del cron ya logueó esto.
    // No es crítico para el dispatcher (la notif se mandó igual), solo
    // significa que nuestro tracking quedó desincronizado por una
    // race. Cualquier otro error sí merece atención.
    console.warn('[notif:logSent] error', { userId, type, dedupeKey, err: error.message })
  }
}
