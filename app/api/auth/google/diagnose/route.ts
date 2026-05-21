import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getAuthedClient } from '@/lib/google/oauthClient'

/**
 * Diagnostic endpoint for Google Calendar setup. Walks every step of the flow
 * and reports exactly which one fails. Auth required (uses user's Supabase
 * session). Safe — does not expose secrets.
 *
 * GET /api/auth/google/diagnose
 */
export async function GET(req: NextRequest) {
  const steps: Record<string, unknown> = {}
  const { origin } = new URL(req.url)
  const expectedRedirectUri = `${origin}/api/auth/google/callback`

  try {
    // 1. Server env vars
    steps.envVars = {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    }

    // 2. Supabase session (uses request cookies)
    const sb = await getSupabaseServer()
    const { data: { user } } = await sb.auth.getUser()
    steps.session = {
      authenticated: !!user,
      userId: user?.id ?? null,
      email: user?.email ?? null,
    }
    if (!user) {
      return NextResponse.json({
        ok: false,
        failedAt: 'session',
        hint: 'You are not logged into Overseer in this browser. Open the app, log in, then hit this URL again.',
        steps,
      })
    }

    // 3. Per-user Google credentials row
    const { data: credsRow, error: credsErr } = await sb
      .from('gcal_credentials')
      .select('client_id, refresh_token, access_token, token_expiry, connected, updated_at')
      .eq('user_id', user.id)
      .maybeSingle()

    steps.credentials = {
      rowExists: !!credsRow,
      hasClientId: !!credsRow?.client_id,
      clientIdPreview: credsRow?.client_id ? String(credsRow.client_id).slice(0, 20) + '…' : null,
      hasRefreshToken: !!credsRow?.refresh_token,
      hasAccessToken: !!credsRow?.access_token,
      tokenExpiry: credsRow?.token_expiry ?? null,
      tokenExpiryHuman: credsRow?.token_expiry ? new Date(credsRow.token_expiry as number).toISOString() : null,
      connectedFlag: credsRow?.connected ?? false,
      updatedAt: credsRow?.updated_at ?? null,
      error: credsErr?.message ?? null,
    }

    if (!credsRow?.client_id) {
      return NextResponse.json({
        ok: false,
        failedAt: 'credentials_missing',
        hint: 'Settings → Google Calendar: paste your Client ID and Client Secret and click "Save".',
        steps,
      })
    }

    // 4. Redirect URI consistency
    steps.redirectUri = {
      expected: expectedRedirectUri,
      hint: 'This EXACT URL must be listed in your Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client → Authorized redirect URIs.',
    }

    if (!credsRow.refresh_token) {
      return NextResponse.json({
        ok: false,
        failedAt: 'no_refresh_token',
        hint: 'OAuth was never completed for this user OR Google did not return a refresh_token (revoke previous grant + reconnect). Go to Settings → "Conectar Google Calendar".',
        steps,
      })
    }

    // 5. Build authed client + try a real Google call
    const auth = await getAuthedClient(sb, user.id, expectedRedirectUri)
    if (!auth) {
      return NextResponse.json({
        ok: false,
        failedAt: 'authed_client_null',
        hint: 'getAuthedClient returned null — credentials or tokens went missing between the DB read and client construction.',
        steps,
      })
    }
    steps.authedClient = { built: true }

    // 6. Try to list calendars
    try {
      const calendar = google.calendar({ version: 'v3', auth })
      const listRes = await calendar.calendarList.list({ maxResults: 250 })
      const items = listRes.data.items ?? []
      steps.calendarList = {
        ok: true,
        count: items.length,
        names: items.slice(0, 10).map((c) => ({
          id: c.id,
          summary: c.summary,
          primary: c.primary ?? false,
          accessRole: c.accessRole,
        })),
      }

      // 7. Try to fetch events from the primary calendar (next 7 days)
      const primary = items.find((c) => c.primary)
      if (primary?.id) {
        try {
          const evRes = await calendar.events.list({
            calendarId: primary.id,
            timeMin: new Date().toISOString(),
            timeMax: new Date(Date.now() + 7 * 86400000).toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 5,
          })
          const evs = evRes.data.items ?? []
          steps.eventsSample = {
            ok: true,
            count: evs.length,
            sample: evs.slice(0, 3).map((e) => ({
              summary: e.summary,
              start: e.start?.dateTime ?? e.start?.date,
            })),
          }
        } catch (eErr) {
          steps.eventsSample = {
            ok: false,
            error: eErr instanceof Error ? eErr.message : 'unknown',
          }
        }
      } else {
        steps.eventsSample = { ok: false, reason: 'no_primary_calendar' }
      }
    } catch (calErr) {
      const msg = calErr instanceof Error ? calErr.message : 'unknown'
      // googleapis errors have a structured shape we can extract
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const code = (calErr as any)?.code ?? (calErr as any)?.response?.status
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (calErr as any)?.response?.data ?? (calErr as any)?.errors
      steps.calendarList = {
        ok: false,
        errorMessage: msg,
        errorCode: code ?? null,
        errorDetail: detail ?? null,
        hint: code === 401
          ? 'Token rejected by Google. Refresh token may be revoked — reconnect from Settings.'
          : code === 403
            ? 'Forbidden — your OAuth Consent Screen probably lacks the calendar scope, OR your account is not in the test users list, OR the Calendar API is not enabled for this Google Cloud project.'
            : code === 404
              ? 'Calendar not found — unusual.'
              : 'Unknown Google API failure.',
      }
      return NextResponse.json({ ok: false, failedAt: 'calendar_list_failed', steps })
    }

    return NextResponse.json({
      ok: true,
      summary: 'All steps passed. Google Calendar should work end-to-end.',
      steps,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, failedAt: 'unexpected_error', error: msg, steps }, { status: 500 })
  }
}
