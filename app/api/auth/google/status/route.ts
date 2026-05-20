import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'
import { hasGCalConnection } from '@/lib/google/credentialStore'

export async function GET() {
  try {
    const sb = await getSupabaseServer()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ connected: false })

    const connected = await hasGCalConnection(sb, user.id)
    return NextResponse.json({ connected })
  } catch {
    return NextResponse.json({ connected: false })
  }
}
