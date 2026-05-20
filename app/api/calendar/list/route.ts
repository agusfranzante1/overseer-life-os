import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getAuthedClient } from '@/lib/google/oauthClient'

export async function GET(req: NextRequest) {
  try {
    const sb = await getSupabaseServer()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const { origin } = new URL(req.url)
    const auth = await getAuthedClient(sb, user.id, `${origin}/api/auth/google/callback`)
    if (!auth) return NextResponse.json({ ok: false, error: 'not_connected' }, { status: 401 })

    const calendar = google.calendar({ version: 'v3', auth })
    const res = await calendar.calendarList.list({ maxResults: 250 })
    const items = (res.data.items ?? []).map((c) => ({
      id: c.id,
      summary: c.summary,
      summaryOverride: c.summaryOverride,
      description: c.description,
      backgroundColor: c.backgroundColor,
      foregroundColor: c.foregroundColor,
      primary: c.primary ?? false,
      accessRole: c.accessRole,
      timeZone: c.timeZone,
    }))
    return NextResponse.json({ ok: true, calendars: items })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
