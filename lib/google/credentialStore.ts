import type { SupabaseClient } from '@supabase/supabase-js'
import type { Credentials } from 'google-auth-library'

// ─── Credential reads ─────────────────────────────────────────────────────────

export async function getGCalCredentials(
  sb: SupabaseClient,
  userId: string,
): Promise<{ clientId: string; clientSecret: string } | null> {
  const { data } = await sb
    .from('gcal_credentials')
    .select('client_id, client_secret')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return null
  return { clientId: data.client_id as string, clientSecret: data.client_secret as string }
}

export async function getGCalTokens(
  sb: SupabaseClient,
  userId: string,
): Promise<Credentials | null> {
  const { data } = await sb
    .from('gcal_credentials')
    .select('refresh_token, access_token, token_expiry')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data?.refresh_token) return null
  return {
    refresh_token: data.refresh_token as string,
    access_token: (data.access_token as string) ?? undefined,
    expiry_date: (data.token_expiry as number) ?? undefined,
  }
}

export async function hasGCalConnection(
  sb: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await sb
    .from('gcal_credentials')
    .select('refresh_token')
    .eq('user_id', userId)
    .maybeSingle()
  return !!(data as Record<string, unknown> | null)?.refresh_token
}

// ─── Credential writes ────────────────────────────────────────────────────────

export async function saveGCalCredentials(
  sb: SupabaseClient,
  userId: string,
  clientId: string,
  clientSecret: string,
): Promise<void> {
  await sb.from('gcal_credentials').upsert(
    { user_id: userId, client_id: clientId, client_secret: clientSecret, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
}

export async function saveGCalTokens(
  sb: SupabaseClient,
  userId: string,
  tokens: Credentials,
): Promise<void> {
  await sb.from('gcal_credentials').upsert(
    {
      user_id: userId,
      refresh_token: tokens.refresh_token ?? undefined,
      access_token: tokens.access_token ?? undefined,
      token_expiry: tokens.expiry_date ?? undefined,
      connected: !!tokens.refresh_token,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
}

export async function disconnectGCal(
  sb: SupabaseClient,
  userId: string,
): Promise<void> {
  await sb
    .from('gcal_credentials')
    .update({ refresh_token: null, access_token: null, token_expiry: null, connected: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
}
