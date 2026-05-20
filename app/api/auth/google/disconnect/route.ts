import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getGCalCredentials, getGCalTokens, disconnectGCal } from '@/lib/google/credentialStore'
import { makeOAuthClient } from '@/lib/google/oauthClient'

export async function POST(req: NextRequest) {
  try {
    const sb = await getSupabaseServer()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    // Try to revoke token at Google before deleting locally
    const [creds, tokens] = await Promise.all([
      getGCalCredentials(sb, user.id),
      getGCalTokens(sb, user.id),
    ])
    if (creds && tokens) {
      const { origin } = new URL(req.url)
      const client = makeOAuthClient(creds.clientId, creds.clientSecret, `${origin}/api/auth/google/callback`)
      client.setCredentials(tokens)
      const token = tokens.access_token ?? tokens.refresh_token
      if (token) {
        try { await client.revokeToken(token) } catch { /* ignore */ }
      }
    }

    await disconnectGCal(sb, user.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: true, warning: message })
  }
}
