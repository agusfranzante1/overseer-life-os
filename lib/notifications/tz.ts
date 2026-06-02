/** Helpers de tiempo y zona horaria para el dispatcher de notificaciones.
 *  El cron corre en UTC (Vercel cron arranca en UTC). Cada usuario tiene
 *  su `timezone` (IANA) guardada en user_settings. Estas helpers convierten
 *  el `now` UTC a hora LOCAL del usuario para decidir si toca disparar
 *  un aviso (ej. "hábitos a las 21:00 hora local del usuario"). */

/** Devuelve { hour, minute, ymd } en hora LOCAL del `timezone` dado. */
export function localTimeIn(timezone: string, now: Date = new Date()): {
  hour: number
  minute: number
  ymd: string  // YYYY-MM-DD
} {
  // Intl.DateTimeFormat con timeZone IANA hace el cálculo correcto
  // incluyendo DST. Extraemos por partes para evitar parseo de strings.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  const y = get('year'), m = get('month'), d = get('day')
  let h = parseInt(get('hour'), 10)
  // Algunas locales devuelven hour='24' a medianoche. Normalizamos a 0.
  if (h === 24) h = 0
  return {
    hour: h,
    minute: parseInt(get('minute'), 10),
    ymd: `${y}-${m}-${d}`,
  }
}

/** Calcula el timestamp UTC absoluto de "el día YMD a la hora HH:MM en
 *  tz". Útil para convertir el dueDate+dueTime+tz del usuario a un Date
 *  comparable con el `now` del cron. */
export function localYmdHmToUtc(ymd: string, hour: number, minute: number, timezone: string): Date {
  // Construimos un Date "naive" como si fuera UTC con esa fecha y hora,
  // y después calculamos el offset que el tz tiene para esa fecha y lo
  // restamos. Approach simple sin libs externas — funciona OK con DST
  // porque el offset se calcula al momento.
  const [y, m, d] = ymd.split('-').map(Number)
  // Asumimos UTC primero
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hour, minute, 0))
  // Cuánto difiere el tz del usuario respecto a UTC PARA ESA FECHA-HORA
  const offsetMin = timezoneOffsetMinutes(timezone, utcGuess)
  // Ajustamos: si el usuario está en UTC-3, su 21:00 local = 24:00 UTC.
  // utcGuess está en 21:00 UTC; necesitamos sumarle (3h) → restamos -3.
  return new Date(utcGuess.getTime() - offsetMin * 60_000)
}

/** Offset en minutos del `timezone` respecto a UTC para una fecha dada.
 *  Positivo = adelantado a UTC (Tokyo +9 → 540). Negativo = atrasado
 *  (Buenos Aires -3 → -180). */
export function timezoneOffsetMinutes(timezone: string, when: Date): number {
  // Truco: pedimos a Intl que formatee el mismo instante en UTC y en la
  // TZ del usuario, comparamos los strings y la diferencia es el offset.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = dtf.formatToParts(when)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  let h = parseInt(get('hour'), 10)
  if (h === 24) h = 0
  const localAsUtc = Date.UTC(
    parseInt(get('year'), 10),
    parseInt(get('month'), 10) - 1,
    parseInt(get('day'), 10),
    h,
    parseInt(get('minute'), 10),
    parseInt(get('second'), 10),
  )
  return (localAsUtc - when.getTime()) / 60_000
}
