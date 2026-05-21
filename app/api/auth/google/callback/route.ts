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

    let tokens
    try {
      const tokenRes = await client.getToken(code)
      tokens = tokenRes.tokens
    } catch (tokenErr) {
      // Capture Google's actual error so the user sees what's wrong on the redirect.
      const msg = tokenErr instanceof Error ? tokenErr.message : 'token_exchange_failed'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (tokenErr as any)?.response?.data
      const detailStr = detail ? `_${JSON.stringify(detail).slice(0, 200)}` : ''
      console.error('[gcal callback] token exchange failed', { msg, detail })
      return NextResponse.redirect(new URL(
        `/calendar?google_error=${encodeURIComponent('token_exchange:' + msg + detailStr)}`,
        req.url,
      ))
    }

    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL(
        '/calendar?google_error=no_refresh_token_revoke_previous_grant_first',
        req.url,
      ))
    }

    try {
      await saveGCalTokens(sb, userId, tokens)
    } catch (saveErr) {
      const msg = saveErr instanceof Error ? saveErr.message : 'save_failed'
      console.error('[gcal callback] saveGCalTokens failed', { msg })
      return NextResponse.redirect(new URL(
        `/calendar?google_error=${encodeURIComponent('save_tokens:' + msg)}`,
        req.url,
      ))
    }

    return NextResponse.redirect(new URL('/calendar?google_connected=1', req.url))
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    console.error('[gcal callback] outer error', { message, error: e })
    return NextResponse.redirect(new URL(`/calendar?google_error=${encodeURIComponent('outer:' + message)}`, req.url))
  }
}
