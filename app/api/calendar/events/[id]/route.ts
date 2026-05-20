import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getAuthedClient } from '@/lib/google/oauthClient'

async function getAuth(req: NextRequest) {
  const sb = await getSupabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { origin } = new URL(req.url)
  return getAuthedClient(sb, user.id, `${origin}/api/auth/google/callback`)
}

// PATCH /api/calendar/events/<id>?calendarId=<id>
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuth(req)
    if (!auth) return NextResponse.json({ ok: false, error: 'not_connected' }, { status: 401 })

    const { id } = await ctx.params
    const url = new URL(req.url)
    const calendarId = url.searchParams.get('calendarId')
    if (!calendarId) return NextResponse.json({ ok: false, error: 'missing_calendarId' }, { status: 400 })

    const { summary, description, location, start, end, allDay } = await req.json() as {
      summary?: string; description?: string; location?: string
      start?: string; end?: string; allDay?: boolean
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
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}

// DELETE /api/calendar/events/<id>?calendarId=<id>
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuth(req)
    if (!auth) return NextResponse.json({ ok: false, error: 'not_connected' }, { status: 401 })

    const { id } = await ctx.params
    const url = new URL(req.url)
    const calendarId = url.searchParams.get('calendarId')
    if (!calendarId) return NextResponse.json({ ok: false, error: 'missing_calendarId' }, { status: 400 })

    const calendar = google.calendar({ version: 'v3', auth })
    await calendar.events.delete({ calendarId, eventId: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
