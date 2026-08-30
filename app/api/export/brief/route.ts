/** Export read-only del estado del usuario — el puente rápido.
 *
 * Mismo token que `/api/mcp`, pero un solo GET que devuelve todo junto:
 * agenda con huecos libres, tareas pendientes, perfil del planificador e
 * historial de planes. Sirve para leer los datos con un fetch común, sin
 * configurar el MCP.
 *
 *   GET /api/export/brief?token=ovs_...&days=14
 *   GET /api/export/brief   con header Authorization: Bearer ovs_...
 *
 * READ-ONLY: no tiene ningún efecto secundario. Toda la lógica es la misma de
 * lib/mcp/queries.ts — acá no se duplica nada.
 */

import { NextRequest } from 'next/server'
import { authenticate } from '@/lib/mcp/auth'
import { getBrief } from '@/lib/mcp/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await authenticate(req)
  if ('response' in gate) return gate.response
  const { auth } = gate

  const daysParam = Number(new URL(req.url).searchParams.get('days'))
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 31) : 14

  try {
    const brief = await getBrief(auth.userId, new URL(req.url).origin, days)
    return Response.json({ ok: true, ...brief })
  } catch (err) {
    // Ruidoso a propósito (BASE nº6): mejor un 500 que decir la verdad que un
    // 200 con la agenda vacía, que se leería como "no tenés nada que hacer".
    const detail = err instanceof Error ? err.message : String(err)
    return Response.json({ ok: false, error: 'brief_failed', detail }, { status: 500 })
  }
}
