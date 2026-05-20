import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getGCalCredentials, hasGCalConnection, saveGCalCredentials } from '@/lib/google/credentialStore'

// GET — returns whether credentials exist and if connected (never returns the secret)
export async function GET() {
  try {
    const sb = await getSupabaseServer()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const creds = await getGCalCredentials(sb, user.id)
    const connected = creds ? await hasGCalConnection(sb, user.id) : false

    return NextResponse.json({
      hasCredentials: !!creds,
      connected,
      clientIdHint: creds ? creds.clientId.slice(-12) : null,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}

// POST — save (or update) credentials
export async function POST(req: NextRequest) {
  try {
    const sb = await getSupabaseServer()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { clientId, clientSecret } = await req.json() as { clientId: string; clientSecret: string }
    if (!clientId?.trim() || !clientSecret?.trim()) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    await saveGCalCredentials(sb, user.id, clientId.trim(), clientSecret.trim())
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
