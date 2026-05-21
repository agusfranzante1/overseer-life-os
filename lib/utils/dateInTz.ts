/**
 * Timezone-aware date key helpers.
 *
 * The app needs a consistent definition of "what date is it" that respects the
 * user's chosen IANA timezone (so habits, auto-purge of completed tasks, etc.
 * roll over on THEIR day, not the server's UTC day or whatever the browser
 * happens to think).
 *
 * Everything here is pure — no I/O, no store access. Pass the timezone in.
 */

/** Returns the date in YYYY-MM-DD for the given IANA timezone. */
export function dateKeyInTz(date: Date, timezone: string): string {
  try {
    // 'en-CA' locale uses ISO-style YYYY-MM-DD output for date formatting.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    // Invalid timezone string — fall back to local date.
    const d = date
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
}

/** Today's date key in the given timezone. */
export function todayKeyInTz(timezone: string): string {
  return dateKeyInTz(new Date(), timezone)
}

/** Browser's detected timezone, e.g. "America/Argentina/Buenos_Aires". */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Full IANA timezone list (empty array on older runtimes). */
export function listTimezones(): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (Intl as any).supportedValuesOf
    if (typeof fn === 'function') return fn('timeZone') as string[]
  } catch {
    /* fall through */
  }
  // Minimal fallback for runtimes without supportedValuesOf
  return [
    'UTC', 'America/Argentina/Buenos_Aires', 'America/Sao_Paulo',
    'America/Mexico_City', 'America/Lima', 'America/New_York',
    'America/Los_Angeles', 'America/Chicago', 'Europe/Madrid',
    'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Australia/Sydney',
  ]
}

/** Human-readable current offset for a TZ, e.g. "GMT-3" or "GMT+5:30". */
export function formatTzOffset(timezone: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, timeZoneName: 'shortOffset',
    }).formatToParts(at)
    const offset = parts.find((p) => p.type === 'timeZoneName')?.value
    return offset ?? ''
  } catch {
    return ''
  }
}
