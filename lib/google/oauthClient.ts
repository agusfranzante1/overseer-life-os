import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import { readTokens, writeTokens } from './tokenStore'

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar',          // read + write events
  'https://www.googleapis.com/auth/calendar.readonly', // list calendars
]

export function makeOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI in .env.local')
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

/**
 * Returns an authenticated OAuth2 client loaded with stored tokens.
 * Auto-refreshes the access token if expired and persists the new one.
 * Returns null if no tokens are stored yet.
 */
export async function getAuthedClient(): Promise<OAuth2Client | null> {
  const tokens = await readTokens()
  if (!tokens?.refresh_token) return null

  const client = makeOAuthClient()
  client.setCredentials(tokens)

  // Persist refreshed tokens automatically
  client.on('tokens', async (newTokens) => {
    const merged = { ...tokens, ...newTokens }
    await writeTokens(merged)
  })

  return client
}
