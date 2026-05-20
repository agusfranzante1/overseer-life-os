import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getGCalCredentials, saveGCalTokens } from '@/lib/google/credentialStore'
import { makeOAuthClient } from '@/lib/google/oauthClient'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')
    const state = url.searchParams.get('state') // user ID encoded at auth start

    if (error) {
      return NextResponse.redirect(new URL(`/calendar?google_error=${encodeURIComponent(error)}`, req.url))
    }
    if (!code) {
      return NextResponse.redirect(new URL('/calendar?google_error=no_code', req.url))
    }
    if (!state) {
      return NextResponse.redirect(new URL('/calendar?google_error=no_state', req.url))
    }

    const userId = state
    const sb = getSupabaseAdmin()

    const creds = await getGCalCredentials(sb, userId)
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

    await saveGCalTokens(sb, userId, tokens)
    return NextResponse.redirect(new URL('/calendar?google_connected=1', req.url))
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.redirect(new URL(`/calendar?google_error=${encodeURIComponent(message)}`, req.url))
  }
}
