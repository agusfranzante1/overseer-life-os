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
