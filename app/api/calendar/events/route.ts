import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getAuthedClient } from '@/lib/google/oauthClient'

async function getAuth(req: NextRequest) {
  const sb = await getSupabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { auth: null, error: 'unauthorized' }
  const { origin } = new URL(req.url)
  const auth = await getAuthedClient(sb, user.id, `${origin}/api/auth/google/callback`)
  return { auth, error: auth ? null : 'not_connected' }
}

// GET /api/calendar/events?calendars=cal1,cal2&from=ISO&to=ISO
export async function GET(req: NextRequest) {
  try {
    const { auth, error } = await getAuth(req)
    if (!auth) return NextResponse.json({ ok: false, error }, { status: 401 })

    const url = new URL(req.url)
    const calendarsParam = url.searchParams.get('calendars')
    const fromParam = url.searchParams.get('from')
    const toParam = url.searchParams.get('to')

    if (!calendarsParam) return NextResponse.json({ ok: true, events: [] })
    const calendarIds = calendarsParam.split(',').filter(Boolean)

    const now = Date.now()
    const timeMin = fromParam ?? new Date(now - 35 * 86400000).toISOString()
    const timeMax = toParam ?? new Date(now + 60 * 86400000).toISOString()

    const calendar = google.calendar({ version: 'v3', auth })

    // For each calendar, page through ALL events in the time window.
    // Without this, calendars with many recurring events (e.g. "Personal"
    // with daily wake-up/trading/lunch entries) hit the 2500-item per-page
    // cap with past events and never return future ones.
    const fetchAllPages = async (calendarId: string) => {
      const all: import('googleapis').calendar_v3.Schema$Event[] = []
      let pageToken: string | undefined
      let safety = 0  // hard cap on iterations so a bad token never loops forever
      do {
        const res = await calendar.events.list({
          calendarId, timeMin, timeMax,
          singleEvents: true, orderBy: 'startTime',
          maxResults: 2500, pageToken,
        })
        if (res.data.items) all.push(...res.data.items)
        pageToken = res.data.nextPageToken ?? undefined
        safety++
      } while (pageToken && safety < 20)
      return { data: { items: all } }
    }

    const results = await Promise.allSettled(
      calendarIds.map((id) => fetchAllPages(id))
    )

    type EventOut = {
      id: string; calendarId: string; summary: string; description?: string
      location?: string; start: string; end: string; allDay: boolean
      htmlLink?: string; colorId?: string
      recurringEventId?: string
    }

    const events: EventOut[] = []
    // Track per-calendar errors so the client can decide whether to trust
    // the (possibly partial / empty) events array or keep its cache.
    // Previously these were silently dropped — if a transient token issue
    // killed ALL calendars at once, the client received {ok:true,events:[]}
    // and happily wiped its cache with nothing.
    const errors: { calendarId: string; message: string }[] = []
    let successfulCalendars = 0

    results.forEach((r, idx) => {
      const calId = calendarIds[idx]
      if (r.status !== 'fulfilled') {
        const message = r.reason instanceof Error ? r.reason.message : String(r.reason ?? 'unknown')
        errors.push({ calendarId: calId, message })
        console.error(`[calendar/events] fetch failed for ${calId}:`, message)
        return
      }
      successfulCalendars++
      for (const ev of r.value.data.items ?? []) {
        const startDt = ev.start?.dateTime ?? ev.start?.date
        const endDt = ev.end?.dateTime ?? ev.end?.date
        if (!startDt || !endDt || !ev.id) continue
        events.push({
          id: ev.id, calendarId: calId,
          summary: ev.summary ?? '(sin título)',
          description: ev.description ?? undefined,
          location: ev.location ?? undefined,
          start: startDt, end: endDt,
          allDay: !ev.start?.dateTime,
          htmlLink: ev.htmlLink ?? undefined,
          colorId: ev.colorId ?? undefined,
          // Master id of the recurring series this event is an instance of.
          // Undefined for one-off events. The UI uses this to detect when
          // to offer the "this/all" choice on edit/move.
          recurringEventId: ev.recurringEventId ?? undefined,
        })
      }
    })

    events.sort((a, b) => a.start.localeCompare(b.start))

    // If EVERY requested calendar failed, signal it as a hard error so the
    // client keeps its cached events instead of replacing them with [].
    if (calendarIds.length > 0 && successfulCalendars === 0) {
      return NextResponse.json({
        ok: false,
        error: `Todos los calendarios fallaron: ${errors.map((e) => e.message).join(' · ')}`,
        errors,
      }, { status: 502 })
    }

    return NextResponse.json({ ok: true, events, errors })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}

// POST /api/calendar/events → create
export async function POST(req: NextRequest) {
  try {
    const { auth, error } = await getAuth(req)
    if (!auth) return NextResponse.json({ ok: false, error }, { status: 401 })

    const { calendarId, summary, description, location, start, end, allDay, recurrence, timeZone } = await req.json() as {
      calendarId: string; summary: string; description?: string
      location?: string; start: string; end: string; allDay?: boolean
      // Optional RRULE array (e.g. ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR']).
      // When present, Google creates a recurring series instead of a one-off.
      recurrence?: string[]
      // IANA timezone (e.g. "America/Argentina/Buenos_Aires"). REQUIRED by
      // Google for recurring events with dateTime — without it, the API
      // returns 400 "Recurring events must have a time zone".
      timeZone?: string
    }

    if (!calendarId || !summary || !start || !end) {
      return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 })
    }

    // Para eventos recurrentes con horario (no all-day), Google exige
    // start.timeZone Y end.timeZone. Si el cliente no lo mandó, lo
    // bloqueamos con un error claro en vez de dejar que Google devuelva
    // un mensaje genérico que se pierde en el banner.
    const isRecurringTimed = !allDay && recurrence && recurrence.length > 0
    if (isRecurringTimed && !timeZone) {
      return NextResponse.json({
        ok: false,
        error: 'Falta timeZone — eventos recurrentes con horario requieren IANA timezone.',
      }, { status: 400 })
    }

    const calendar = google.calendar({ version: 'v3', auth })
    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary, description, location,
        start: allDay
          ? { date: start.slice(0, 10) }
          : { dateTime: start, ...(timeZone ? { timeZone } : {}) },
        end:   allDay
          ? { date: end.slice(0, 10) }
          : { dateTime: end,   ...(timeZone ? { timeZone } : {}) },
        ...(recurrence && recurrence.length > 0 ? { recurrence } : {}),
      },
    })
    return NextResponse.json({ ok: true, event: res.data })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
