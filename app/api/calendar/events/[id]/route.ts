import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getAuthedClient } from '@/lib/google/oauthClient'

// PATCH /api/calendar/events/<eventId>?calendarId=<id>
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthedClient()
    if (!auth) return NextResponse.json({ ok: false, error: 'not_connected' }, { status: 401 })

    const { id } = await ctx.params
    const url = new URL(req.url)
    const calendarId = url.searchParams.get('calendarId')
    if (!calendarId) return NextResponse.json({ ok: false, error: 'missing_calendarId' }, { status: 400 })

    const body = await req.json()
    const { summary, description, location, start, end, allDay } = body as {
      summary?: string
      description?: string
      location?: string
      start?: string
      end?: string
      allDay?: boolean
    }

    const patch: Record<string, unknown> = {}
    if (summary !== undefined) patch.summary = summary
    if (description !== undefined) patch.description = description
    if (location !== undefined) patch.location = location
    if (start) patch.start = allDay ? { date: start.slice(0, 10) } : { dateTime: start }
    if (end)   patch.end   = allDay ? { date: end.slice(0, 10)   } : { dateTime: end }

    const calendar = google.calendar({ version: 'v3', auth })
    const res = await calendar.events.patch({ calendarId, eventId: id, requestBody: patch })
    return NextResponse.json({ ok: true, event: res.data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

// DELETE /api/calendar/events/<eventId>?calendarId=<id>
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthedClient()
    if (!auth) return NextResponse.json({ ok: false, error: 'not_connected' }, { status: 401 })

    const { id } = await ctx.params
    const url = new URL(req.url)
    const calendarId = url.searchParams.get('calendarId')
    if (!calendarId) return NextResponse.json({ ok: false, error: 'missing_calendarId' }, { status: 400 })

    const calendar = google.calendar({ version: 'v3', auth })
    await calendar.events.delete({ calendarId, eventId: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
