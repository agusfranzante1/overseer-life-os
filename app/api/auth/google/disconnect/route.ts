import { NextResponse } from 'next/server'
import { getAuthedClient } from '@/lib/google/oauthClient'
import { deleteTokens } from '@/lib/google/tokenStore'

export async function POST() {
  try {
    const client = await getAuthedClient()
    if (client) {
      const creds = client.credentials
      const token = creds.access_token || creds.refresh_token
      if (token) {
        try { await client.revokeToken(token) } catch { /* ignore */ }
      }
    }
    await deleteTokens()
    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    // Even if revoke fails, delete local tokens so user can re-auth
    await deleteTokens()
    return NextResponse.json({ ok: true, warning: message })
  }
}
