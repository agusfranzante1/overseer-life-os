import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getAuthedClient } from '@/lib/google/oauthClient'

// GET /api/calendar/events?calendars=cal1,cal2&from=ISO&to=ISO
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedClient()
    if (!auth) return NextResponse.json({ ok: false, error: 'not_connected' }, { status: 401 })

    const url = new URL(req.url)
    const calendarsParam = url.searchParams.get('calendars')
    const fromParam = url.searchParams.get('from')
    const toParam = url.searchParams.get('to')

    if (!calendarsParam) {
      return NextResponse.json({ ok: true, events: [] })
    }
    const calendarIds = calendarsParam.split(',').filter(Boolean)

    // Default window: 35 days back, 60 days forward (covers month view + buffer)
    const now = Date.now()
    const timeMin = fromParam ?? new Date(now - 35 * 86400000).toISOString()
    const timeMax = toParam ?? new Date(now + 60 * 86400000).toISOString()

    const calendar = google.calendar({ version: 'v3', auth })

    const results = await Promise.allSettled(
      calendarIds.map((id) =>
        calendar.events.list({
          calendarId: id,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 250,
        })
      )
    )

    type EventOut = {
      id: string
      calendarId: string
      summary: string
      description?: string
      location?: string
      start: string  // ISO
      end: string    // ISO
      allDay: boolean
      htmlLink?: string
      colorId?: string  // 1..11 — per-event color override (Google Calendar palette)
    }

    const events: EventOut[] = []
    results.forEach((r, idx) => {
      const calId = calendarIds[idx]
      if (r.status !== 'fulfilled') return
      const items = r.value.data.items ?? []
      for (const ev of items) {
        const startDt = ev.start?.dateTime ?? ev.start?.date
        const endDt = ev.end?.dateTime ?? ev.end?.date
        if (!startDt || !endDt || !ev.id) continue
        events.push({
          id: ev.id,
          calendarId: calId,
          summary: ev.summary ?? '(sin título)',
          description: ev.description ?? undefined,
          location: ev.location ?? undefined,
          start: startDt,
          end: endDt,
          allDay: !ev.start?.dateTime,
          htmlLink: ev.htmlLink ?? undefined,
          colorId: ev.colorId ?? undefined,
        })
      }
    })

    events.sort((a, b) => a.start.localeCompare(b.start))
    return NextResponse.json({ ok: true, events })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

// POST /api/calendar/events  → create
// body: { calendarId, summary, description?, location?, start, end, allDay? }
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedClient()
    if (!auth) return NextResponse.json({ ok: false, error: 'not_connected' }, { status: 401 })

    const body = await req.json()
    const {
      calendarId, summary, description, location, start, end, allDay,
    } = body as {
      calendarId: string
      summary: string
      description?: string
      location?: string
      start: string  // ISO datetime or YYYY-MM-DD
      end: string
      allDay?: boolean
    }

    if (!calendarId || !summary || !start || !end) {
      return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 })
    }

    const calendar = google.calendar({ version: 'v3', auth })
    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary,
        description,
        location,
        start: allDay ? { date: start.slice(0, 10) } : { dateTime: start },
        end:   allDay ? { date: end.slice(0, 10)   } : { dateTime: end },
      },
    })

    return NextResponse.json({ ok: true, event: res.data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
