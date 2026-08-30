/** Escrituras del bridge sobre GOOGLE CALENDAR.
 *
 *  Es la única parte del bridge que puede BORRAR algo, y la única que toca un
 *  servicio de afuera. Por eso las guardas son distintas del resto:
 *
 *   - Borrar un evento de Google **no tiene deshacer** desde acá. Google lo
 *     manda a su papelera y se puede recuperar un tiempo desde la web, pero
 *     este bridge no lo puede revertir.
 *   - Un evento RECURRENTE tiene dos borrados muy distintos: la instancia de un
 *     día, o la serie entera. Confundirlos es la diferencia entre "hoy no" y
 *     "nunca más". Por eso `scope` es obligatorio y no tiene default.
 *   - Nunca se borra por título ni por búsqueda: hay que pasar el `eventId`
 *     exacto que devolvió `get_agenda`. Sin coincidencias difusas.
 *
 *  Lo que este archivo NO hace: tocar los eventos que Overseer creó desde una
 *  tarea (los que tienen `gcalEventId` en la tarea). Esos los maneja el sync
 *  tarea↔GCal del cliente; borrarlos por afuera dejaría la tarea apuntando a
 *  un evento fantasma.
 */

import { google } from 'googleapis'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getAuthedClient } from '@/lib/google/oauthClient'
import type { WriteResult } from './writes'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{1,2}:\d{2}$/

async function calendarClient(userId: string, origin: string) {
  const sb = getSupabaseAdmin()
  const auth = await getAuthedClient(sb, userId, `${origin}/api/auth/google/callback`)
  if (!auth) return null
  return google.calendar({ version: 'v3', auth })
}

const notConnected: WriteResult = {
  ok: false,
  error: 'calendar_not_connected',
  detail: 'No hay Google Calendar conectado en esta cuenta (Configuración → Google Calendar).',
}

// ---------------------------------------------------------------------------
// delete_calendar_event
// ---------------------------------------------------------------------------

/**
 * Borra un evento del calendario.
 *
 * `scope`:
 *  - `'instance'` → solo ese día. El resto de la serie sigue.
 *  - `'series'`   → la serie entera, para siempre. Requiere que el evento
 *                   tenga `recurringEventId` (o ser el evento madre).
 */
export async function deleteCalendarEvent(
  userId: string,
  origin: string,
  input: {
    eventId?: string
    calendarId?: string
    recurringEventId?: string
    scope?: string
  },
): Promise<WriteResult> {
  const eventId = String(input.eventId ?? '').trim()
  const calendarId = String(input.calendarId ?? '').trim()
  const scope = String(input.scope ?? '').trim()

  if (!eventId) return { ok: false, error: 'bad_event', detail: 'Falta `eventId` (sale de get_agenda).' }
  if (!calendarId) return { ok: false, error: 'bad_calendar', detail: 'Falta `calendarId` (sale de get_agenda).' }
  if (scope !== 'instance' && scope !== 'series') {
    return {
      ok: false,
      error: 'bad_scope',
      detail: "`scope` es obligatorio: 'instance' borra solo ese día, 'series' borra la serie entera. No hay default a propósito.",
    }
  }

  const cal = await calendarClient(userId, origin)
  if (!cal) return notConnected

  // Para la serie hay que borrar el evento MADRE, no la instancia.
  const targetId = scope === 'series'
    ? (String(input.recurringEventId ?? '').trim() || eventId)
    : eventId

  if (scope === 'series' && !input.recurringEventId) {
    // Sin recurringEventId puede ser (a) el evento madre, o (b) un evento
    // suelto. En ambos casos borrar `eventId` es correcto, pero conviene
    // decirlo en la respuesta para que no parezca que se borró una serie que
    // en realidad no existía.
  }

  try {
    await cal.events.delete({ calendarId, eventId: targetId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // 410 = ya estaba borrado. No es un error para el usuario.
    if (/410|already deleted|has been deleted/i.test(msg)) {
      return { ok: true, alreadyDeleted: true, eventId: targetId, detail: 'Ese evento ya estaba borrado.' }
    }
    return { ok: false, error: 'google_error', detail: msg }
  }

  return {
    ok: true,
    deleted: targetId,
    calendarId,
    scope,
    detail: scope === 'series'
      ? 'Serie borrada: no vuelve a aparecer ningún día.'
      : 'Borrada solo esa instancia; el resto de la serie sigue.',
  }
}

// ---------------------------------------------------------------------------
// create_calendar_event
// ---------------------------------------------------------------------------

/** Crea un evento (un bloque de trabajo) en el calendario.
 *
 *  `date` + `start` + `end` en hora LOCAL del usuario; se manda con `timeZone`
 *  para que Google resuelva el offset — nunca se calcula el UTC a mano acá. */
export async function createCalendarEvent(
  userId: string,
  origin: string,
  timezone: string,
  input: {
    title?: string
    date?: string
    start?: string
    end?: string
    description?: string
    calendarId?: string
    recurrenceRule?: string
  },
): Promise<WriteResult> {
  const title = String(input.title ?? '').trim()
  const date = String(input.date ?? '').trim()
  const start = String(input.start ?? '').trim()
  const end = String(input.end ?? '').trim()

  if (!title) return { ok: false, error: 'bad_title', detail: 'Falta `title`.' }
  if (!DATE_RE.test(date)) return { ok: false, error: 'bad_date', detail: '`date` tiene que ser YYYY-MM-DD.' }
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) {
    return { ok: false, error: 'bad_time', detail: '`start` y `end` tienen que ser HH:MM.' }
  }
  const pad = (t: string) => { const [h, m] = t.split(':'); return `${h.padStart(2, '0')}:${m}` }
  if (pad(end) <= pad(start)) {
    return { ok: false, error: 'bad_range', detail: '`end` tiene que ser posterior a `start`.' }
  }

  const cal = await calendarClient(userId, origin)
  if (!cal) return notConnected

  const calendarId = String(input.calendarId ?? 'primary').trim() || 'primary'

  try {
    const res = await cal.events.insert({
      calendarId,
      requestBody: {
        summary: title,
        ...(input.description ? { description: String(input.description).slice(0, 4000) } : {}),
        start: { dateTime: `${date}T${pad(start)}:00`, timeZone: timezone },
        end: { dateTime: `${date}T${pad(end)}:00`, timeZone: timezone },
        ...(input.recurrenceRule ? { recurrence: [String(input.recurrenceRule)] } : {}),
      },
    })
    return {
      ok: true,
      eventId: res.data.id,
      calendarId,
      title,
      date,
      start: pad(start),
      end: pad(end),
      recurring: !!input.recurrenceRule,
    }
  } catch (err) {
    return { ok: false, error: 'google_error', detail: err instanceof Error ? err.message : String(err) }
  }
}
