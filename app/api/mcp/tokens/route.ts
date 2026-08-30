/** Gestión de los tokens del bridge desde la app (Configuración → Conexión
 *  con Claude).
 *
 *  A diferencia de `/api/mcp`, esta ruta se autentica con la SESIÓN normal del
 *  usuario (cookie), no con un token: es la que crea los tokens, así que no
 *  puede depender de tener uno.
 *
 *  El token en claro se devuelve UNA sola vez, en la respuesta del POST. Después
 *  ya no existe en ningún lado más que en la máquina del usuario.
 */

import { NextRequest } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { generateToken } from '@/lib/mcp/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Devuelve el user_id, o la respuesta de error a mandar.
 *
 *  Se distingue "no hay sesión" (401) de "no puedo hablar con Supabase" (503):
 *  si el backend se cae y respondemos 401, el usuario cree que se deslogueó y
 *  sale a buscar un problema que no existe (BASE nº6). */
async function requireUser(): Promise<{ userId: string } | { response: Response }> {
  try {
    const sb = await getSupabaseServer()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { response: Response.json({ ok: false, error: 'unauthorized' }, { status: 401 }) }
    return { userId: user.id }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return {
      response: Response.json({ ok: false, error: 'backend_unavailable', detail }, { status: 503 }),
    }
  }
}

const migrationHint = (msg: string) =>
  `${msg} — ¿corriste supabase/migration_mcp_tokens.sql?`

/** GET → lista los tokens activos. Nunca devuelve el token en claro (no lo
 *  tenemos: solo guardamos el hash). */
export async function GET() {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const { userId } = gate

  const { data, error } = await getSupabaseAdmin()
    .from('mcp_tokens')
    .select('token_hash, label, created_at, last_used_at')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })

  if (error) return Response.json({ ok: false, error: 'db_error', detail: migrationHint(error.message) }, { status: 500 })

  return Response.json({
    ok: true,
    tokens: (data ?? []).map((t) => ({
      // Los primeros 8 chars del hash alcanzan para distinguir filas en la UI
      // y no permiten reconstruir el token.
      ref: (t.token_hash as string).slice(0, 8),
      label: t.label,
      createdAt: t.created_at,
      lastUsedAt: t.last_used_at,
    })),
  })
}

/** POST { label } → genera un token nuevo. Devuelve el valor en claro UNA vez. */
export async function POST(req: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const { userId } = gate

  let label = 'Claude'
  try {
    const body = await req.json()
    if (typeof body?.label === 'string' && body.label.trim()) label = body.label.trim().slice(0, 60)
  } catch { /* sin body → label por defecto */ }

  const { token, hash } = generateToken()
  const { error } = await getSupabaseAdmin()
    .from('mcp_tokens')
    .insert({ token_hash: hash, user_id: userId, label })

  if (error) return Response.json({ ok: false, error: 'db_error', detail: migrationHint(error.message) }, { status: 500 })

  return Response.json({ ok: true, token, label, ref: hash.slice(0, 8) })
}

/** DELETE ?ref=xxxxxxxx → revoca. No borra la fila: deja el rastro de que
 *  existió y de cuándo se usó por última vez. */
export async function DELETE(req: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const { userId } = gate

  const ref = new URL(req.url).searchParams.get('ref')
  if (!ref) return Response.json({ ok: false, error: 'missing_ref' }, { status: 400 })

  const sb = getSupabaseAdmin()
  // No se puede filtrar por prefijo con `.eq`, así que resolvemos el hash
  // completo entre los tokens DE ESTE USUARIO. Nunca se toca uno ajeno.
  const { data } = await sb
    .from('mcp_tokens').select('token_hash').eq('user_id', userId).is('revoked_at', null)

  const match = (data ?? []).find((t) => (t.token_hash as string).startsWith(ref))
  if (!match) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  const { error } = await sb
    .from('mcp_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', match.token_hash)
    .eq('user_id', userId)

  if (error) return Response.json({ ok: false, error: 'db_error', detail: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
