import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getGCalCredentials, getGCalTokens, saveGCalTokens } from './credentialStore'

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.readonly',
]

export function makeOAuthClient(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): OAuth2Client {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

/**
 * Returns an authenticated OAuth2 client for the given user.
 * Reads per-user credentials and tokens from Supabase.
 * Auto-persists refreshed tokens.
 * Returns null if credentials or tokens are missing.
 */
export async function getAuthedClient(
  sb: SupabaseClient,
  userId: string,
  redirectUri: string,
): Promise<OAuth2Client | null> {
  const creds = await getGCalCredentials(sb, userId)
  if (!creds) return null

  const tokens = await getGCalTokens(sb, userId)
  if (!tokens?.refresh_token) return null

  const client = makeOAuthClient(creds.clientId, creds.clientSecret, redirectUri)
  client.setCredentials(tokens)

  client.on('tokens', async (newTokens) => {
    await saveGCalTokens(sb, userId, { ...tokens, ...newTokens })
  })

  return client
}
