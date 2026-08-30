/** Ventana de match para el dispatcher.
 *
 *  El cron corre cada N minutos (5 por default). Si la hora target es
 *  21:00 y el cron corre a las 21:02, está dentro de la ventana → dispara.
 *  Si corre a las 21:08, está fuera (ya pasaron más de 5 min) — pero
 *  no importa porque la idempotencia ya tiene la fila del log y no
 *  vuelve a mandar igual. La ventana de 5 min es solo "¿estamos cerca
 *  del horario target ahora?".
 *
 *  Compara HH:MM con HH:MM en minutos absolutos del día (0-1439). Si
 *  cruza medianoche (ej. target=23:58, now=00:02) lo manejamos viendo
 *  el delta circular. */

export function withinWindow(
  nowHour: number,
  nowMinute: number,
  targetHour: number,
  targetMinute: number,
  windowMin: number,
): boolean {
  const nowAbs = nowHour * 60 + nowMinute
  const targetAbs = targetHour * 60 + targetMinute
  const delta = nowAbs - targetAbs
  // Caso normal: now llega DESPUÉS del target hace 0..windowMin minutos.
  if (delta >= 0 && delta <= windowMin) return true
  // Caso medianoche: target=23:58, now=00:02 → delta = -1436. Sumamos
  // 1440 (un día) → delta efectivo = 4 min. Si cae dentro de la ventana, OK.
  if (delta < 0 && delta + 1440 <= windowMin) return true
  return false
}

/** Misma idea pero con timestamps absolutos. Usado para notificaciones
 *  basadas en tiempo absoluto (ej. una task que vence en X minutos). */
export function withinWindowAt(now: Date, target: Date, windowMin: number): boolean {
  const delta = (now.getTime() - target.getTime()) / 60_000
  return delta >= 0 && delta <= windowMin
}

// ─── Recuperar lo pendiente (catch-up) ──────────────────────────────────────
//
// La ventana de 5 minutos de arriba asume un cron que corre cada 5 minutos.
// El cron real (GitHub Actions) corre cuando puede: medido sobre los últimos
// 20 runs, los intervalos fueron de 111 a 700 MINUTOS. Con una ventana de 5
// min, la chance de que un run caiga justo después del horario target es
// mínima → casi ninguna notificación se enviaba, y sin ruido: el cron salía
// verde igual (BASE nº6).
//
// El criterio pasa a ser "¿ya pasó la hora y todavía no se mandó?". Lo que
// evita duplicados NO es la ventana sino la idempotencia (`notification_log`
// + dedupe key), que ya existía.

/** Cuánto tiempo después del horario objetivo se sigue considerando útil
 *  mandar el recordatorio. Más allá de esto ya no es un recordatorio, es
 *  ruido a destiempo. */
export const CATCH_UP_MIN = 6 * 60

/** ¿Corresponde disparar un recordatorio de hora fija (HH:MM en la zona del
 *  usuario)?
 *
 *  `true` si el target YA PASÓ hoy y no pasaron más de `catchUpMin` minutos.
 *  A propósito NO cruza medianoche: la dedupe key de estos canales es por día
 *  local (`habit:${ymd}`), así que recuperar el de ayer pasada la medianoche
 *  se contaría como el de HOY y bloquearía el de hoy de verdad. */
export function shouldFireDaily(
  nowHour: number,
  nowMinute: number,
  targetHour: number,
  targetMinute: number,
  catchUpMin: number = CATCH_UP_MIN,
): boolean {
  const delta = (nowHour * 60 + nowMinute) - (targetHour * 60 + targetMinute)
  return delta >= 0 && delta <= catchUpMin
}

/** ¿Corresponde disparar un aviso anclado a un instante (ej. "esta tarea
 *  vence en 60 min")? Vale desde `fireAt` hasta `until` — pasado ese punto el
 *  aviso ya no sirve (para lo vencido está el canal task_overdue).
 *
 *  Con esto, si el cron pasó 3 horas sin correr, el aviso igual llega mientras
 *  la tarea NO haya vencido; antes se perdía para siempre. */
export function shouldFireUntil(now: Date, fireAt: Date, until: Date): boolean {
  return now.getTime() >= fireAt.getTime() && now.getTime() <= until.getTime()
}

/** Minutos que faltan para `target` desde `now`, nunca negativo. El texto del
 *  push se arma con ESTO y no con el lead configurado: si el aviso sale tarde,
 *  "vence en 60 min" seria mentira. */
export function minutesUntil(now: Date, target: Date): number {
  return Math.max(0, Math.round((target.getTime() - now.getTime()) / 60_000))
}
