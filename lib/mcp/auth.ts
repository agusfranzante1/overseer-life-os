/** Autenticación del bridge con Claude.
 *
 *  `/api/mcp` y `/api/export/brief` son los ÚNICOS endpoints que entran a los
 *  datos del usuario sin cookie de sesión. Se autentican con un token personal
 *  que el usuario genera en Configuración → Conexión con Claude.
 *
 *  Reglas (BASE nº6 — un fallo silencioso es peor que uno ruidoso):
 *    - token ausente/inválido/revocado → 401 explícito, nunca 200 vacío.
 *    - el token en claro no se guarda ni se loguea NUNCA (solo su sha256).
 */

import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const PREFIX = 'ovs_'

/** Genera un token nuevo. Devuelve el valor en claro (para mostrárselo al
 *  usuario una única vez) y su hash (lo único que se persiste). */
export function generateToken(): { token: string; hash: string } {
  const token = PREFIX + crypto.randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex')
}

/** Saca el token del request: header `Authorization: Bearer ovs_...` o, como
 *  alternativa para poder pegar la URL en cualquier lado, `?token=`.
 *  El header tiene prioridad. */
export function extractToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (header) {
    const m = /^Bearer\s+(.+)$/i.exec(header.trim())
    if (m) return m[1].trim()
  }
  try {
    const qs = new URL(req.url).searchParams.get('token')
    if (qs) return qs.trim()
  } catch { /* URL inválida — no hay token y listo */ }
  return null
}

export interface ResolvedToken {
  userId: string
  hash: string
  label: string
}

/**
 * Resuelve el token del request al `user_id` dueño.
 * Devuelve null si no hay token, no existe, o está revocado.
 *
 * Actualiza `last_used_at` sin esperar la respuesta (que un fallo al escribir
 * la marca de uso no tire abajo un request que por lo demás es válido).
 */
export async function resolveUserFromBearer(req: Request): Promise<ResolvedToken | null> {
  const token = extractToken(req)
  if (!token) return null

  const hash = hashToken(token)
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('mcp_tokens')
    .select('user_id, label, revoked_at')
    .eq('token_hash', hash)
    .maybeSingle()

  if (error || !data || data.revoked_at) return null

  void sb.from('mcp_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('token_hash', hash)
    .then(undefined, () => { /* la marca de uso es best-effort */ })

  return { userId: data.user_id as string, hash, label: (data.label as string) ?? 'Claude' }
}

/** Respuesta 401 uniforme para los dos endpoints del bridge. */
export function unauthorized(detail = 'Token ausente, inválido o revocado.') {
  return Response.json(
    { ok: false, error: 'unauthorized', detail },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
  )
}

/** Resultado de autenticar: el usuario, o la respuesta de error a devolver.
 *
 *  Distinguir "token inválido" (401) de "no puedo consultar la base" (503) no
 *  es cosmético: si la base se cae y respondemos 401, el usuario sale a
 *  regenerar tokens buscando un problema que no existe. BASE nº6 — el fallo
 *  tiene que decir lo que realmente pasó. */
export async function authenticate(
  req: Request,
): Promise<{ auth: ResolvedToken } | { response: Response }> {
  let resolved: ResolvedToken | null
  try {
    resolved = await resolveUserFromBearer(req)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return {
      response: Response.json(
        { ok: false, error: 'auth_backend_unavailable', detail },
        { status: 503 },
      ),
    }
  }
  if (!resolved) return { response: unauthorized() }
  if (rateLimited(resolved.hash)) return { response: tooManyRequests() }
  return { auth: resolved }
}

// ---------------------------------------------------------------------------
// Rate limit — en memoria, por token.
// ---------------------------------------------------------------------------
// Es un uso personal (un usuario, un par de clientes), así que un Map alcanza.
// OJO: en Vercel cada instancia serverless tiene el suyo, así que esto NO es
// una garantía dura — es un freno contra un loop desbocado del lado del
// cliente, no una defensa contra un atacante. La defensa real es que el token
// sea largo, aleatorio y revocable.
const HITS = new Map<string, number[]>()
const WINDOW_MS = 60_000
const MAX_HITS = 60

export function rateLimited(hash: string): boolean {
  const now = Date.now()
  const recent = (HITS.get(hash) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  HITS.set(hash, recent)
  // Poda defensiva: que el Map no crezca sin techo si rotan muchos tokens.
  if (HITS.size > 200) {
    for (const [k, v] of HITS) if (v.every((t) => now - t >= WINDOW_MS)) HITS.delete(k)
  }
  return recent.length > MAX_HITS
}

export function tooManyRequests() {
  return Response.json(
    { ok: false, error: 'rate_limited', detail: `Máximo ${MAX_HITS} requests por minuto.` },
    { status: 429 },
  )
}
