import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getGCalCredentials, saveGCalTokens } from '@/lib/google/credentialStore'
import { makeOAuthClient } from '@/lib/google/oauthClient'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')

    if (error) {
      return NextResponse.redirect(new URL(`/calendar?google_error=${encodeURIComponent(error)}`, req.url))
    }
    if (!code) {
      return NextResponse.redirect(new URL('/calendar?google_error=no_code', req.url))
    }

    const sb = await getSupabaseServer()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.redirect(new URL('/login', req.url))

    const creds = await getGCalCredentials(sb, user.id)
    if (!creds) {
      return NextResponse.redirect(new URL('/settings?gcal_error=no_credentials', req.url))
    }

    const { origin } = url
    const redirectUri = `${origin}/api/auth/google/callback`

    const client = makeOAuthClient(creds.clientId, creds.clientSecret, redirectUri)
    const { tokens } = await client.getToken(code)

    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL('/calendar?google_error=no_refresh_token', req.url))
    }

    await saveGCalTokens(sb, user.id, tokens)
    return NextResponse.redirect(new URL('/calendar?google_connected=1', req.url))
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.redirect(new URL(`/calendar?google_error=${encodeURIComponent(message)}`, req.url))
  }
}
