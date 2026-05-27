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

    const {
      summary, description, location, start, end, allDay,
      // When applyToSeries is true AND `recurringEventId` is provided,
      // we patch the MASTER event instead of the instance. Google then
      // propagates the change across the entire series. For time-only
      // moves, we also shift the master's start/end by the same delta.
      applyToSeries, recurringEventId,
    } = await req.json() as {
      summary?: string; description?: string; location?: string
      start?: string; end?: string; allDay?: boolean
      applyToSeries?: boolean
      recurringEventId?: string
    }

    const calendar = google.calendar({ version: 'v3', auth })

    if (applyToSeries && recurringEventId) {
      // ── Series mode: shift the master by the same delta the user gave ──
      // We need the OLD start of the INSTANCE to compute the delta.
      // Patching the master with the new dateTime directly would set
      // its absolute start (changing the series anchor), so we fetch
      // the instance, compute delta, then add delta to the master's
      // current start/end.
      const instance = await calendar.events.get({ calendarId, eventId: id })
      const masterEv = await calendar.events.get({ calendarId, eventId: recurringEventId })

      const oldInstanceStart = instance.data.start?.dateTime
      const newInstanceStart = start
      const masterStart = masterEv.data.start?.dateTime
      const masterEnd = masterEv.data.end?.dateTime

      const patch: Record<string, unknown> = {}
      if (summary !== undefined) patch.summary = summary
      if (description !== undefined) patch.description = description
      if (location !== undefined) patch.location = location

      if (oldInstanceStart && newInstanceStart && masterStart && masterEnd) {
        const deltaMs = new Date(newInstanceStart).getTime() - new Date(oldInstanceStart).getTime()
        const newMasterStart = new Date(new Date(masterStart).getTime() + deltaMs).toISOString()
        const newMasterEnd   = new Date(new Date(masterEnd).getTime()   + deltaMs).toISOString()
        // Send WITH the existing timezone so Google preserves the wall-clock
        // shift across DST boundaries instead of recomputing to UTC.
        patch.start = {
          dateTime: newMasterStart,
          timeZone: masterEv.data.start?.timeZone ?? undefined,
        }
        patch.end = {
          dateTime: newMasterEnd,
          timeZone: masterEv.data.end?.timeZone ?? undefined,
        }
      }

      const res = await calendar.events.patch({
        calendarId,
        eventId: recurringEventId,
        requestBody: patch,
      })
      return NextResponse.json({ ok: true, event: res.data, scope: 'series' })
    }

    // ── Single instance mode (default) ──
    // Patching the instance id creates a Google "exception" so only this
    // occurrence changes. The master + other instances stay intact.
    const patch: Record<string, unknown> = {}
    if (summary !== undefined) patch.summary = summary
    if (description !== undefined) patch.description = description
    if (location !== undefined) patch.location = location
    if (start) patch.start = allDay ? { date: start.slice(0, 10) } : { dateTime: start }
    if (end)   patch.end   = allDay ? { date: end.slice(0, 10)   } : { dateTime: end }

    const res = await calendar.events.patch({ calendarId, eventId: id, requestBody: patch })
    return NextResponse.json({ ok: true, event: res.data, scope: 'instance' })
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
