import { NextResponse } from 'next/server'
import { makeOAuthClient, SCOPES } from '@/lib/google/oauthClient'

export async function GET() {
  try {
    const client = makeOAuthClient()
    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent', // forces refresh_token to be returned every time
    })
    return NextResponse.redirect(url)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
