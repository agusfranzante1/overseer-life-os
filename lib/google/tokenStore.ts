import { promises as fs } from 'fs'
import path from 'path'
import type { Credentials } from 'google-auth-library'

const TOKEN_FILE = path.join(process.cwd(), 'data', 'google-tokens.json')

export async function readTokens(): Promise<Credentials | null> {
  try {
    const raw = await fs.readFile(TOKEN_FILE, 'utf-8')
    return JSON.parse(raw) as Credentials
  } catch {
    return null
  }
}

export async function writeTokens(tokens: Credentials): Promise<void> {
  await fs.mkdir(path.dirname(TOKEN_FILE), { recursive: true })
  await fs.writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2), 'utf-8')
}

export async function deleteTokens(): Promise<void> {
  try {
    await fs.unlink(TOKEN_FILE)
  } catch {
    /* already gone */
  }
}

export async function hasTokens(): Promise<boolean> {
  const t = await readTokens()
  return !!t?.refresh_token
}
