import { NextRequest, NextResponse } from 'next/server'
import { makeOAuthClient } from '@/lib/google/oauthClient'
import { writeTokens } from '@/lib/google/tokenStore'

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

    const client = makeOAuthClient()
    const { tokens } = await client.getToken(code)

    if (!tokens.refresh_token) {
      // Should not happen because we use prompt=consent, but guard anyway
      return NextResponse.redirect(new URL('/calendar?google_error=no_refresh_token', req.url))
    }

    await writeTokens(tokens)
    return NextResponse.redirect(new URL('/calendar?google_connected=1', req.url))
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.redirect(new URL(`/calendar?google_error=${encodeURIComponent(message)}`, req.url))
  }
}
