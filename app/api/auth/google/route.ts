import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getGCalCredentials } from '@/lib/google/credentialStore'
import { makeOAuthClient, SCOPES } from '@/lib/google/oauthClient'

export async function GET(req: NextRequest) {
  try {
    const sb = await getSupabaseServer()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.redirect(new URL('/login', req.url))

    const creds = await getGCalCredentials(sb, user.id)
    if (!creds) {
      return NextResponse.redirect(new URL('/settings?gcal_error=no_credentials', req.url))
    }

    const { origin } = new URL(req.url)
    const redirectUri = `${origin}/api/auth/google/callback`

    const client = makeOAuthClient(creds.clientId, creds.clientSecret, redirectUri)
    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    })
    return NextResponse.redirect(url)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
