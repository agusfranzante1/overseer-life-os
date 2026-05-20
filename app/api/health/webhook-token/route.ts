import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getSupabaseServer } from '@/lib/supabase/server'

// GET — returns the current user's webhook token (or null if not generated yet).
export async function GET() {
  try {
    const sb = await getSupabaseServer()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { data } = await sb
      .from('health_config')
      .select('webhook_token')
      .eq('user_id', user.id)
      .maybeSingle()

    return NextResponse.json({ token: (data?.webhook_token as string) ?? null })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}

// POST — generate a new token (rotates if one already exists).
export async function POST() {
  try {
    const sb = await getSupabaseServer()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const token = randomBytes(32).toString('hex')

    const { error } = await sb.from('health_config').upsert(
      { user_id: user.id, webhook_token: token, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ token })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
