import { NextResponse } from 'next/server'
import { hasTokens } from '@/lib/google/tokenStore'

export async function GET() {
  const connected = await hasTokens()
  return NextResponse.json({ connected })
}
