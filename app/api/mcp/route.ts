/** Servidor MCP de Overseer — el vínculo entre Claude y la cuenta del usuario.
 *
 * Claude (corriendo en la SUSCRIPCIÓN del usuario, sin API key facturada por
 * uso) se conecta acá y puede leer tareas/agenda y escribir el plan del día.
 *
 * Conectar desde Claude Code:
 *   claude mcp add --transport http overseer https://TU-APP/api/mcp \
 *     --header "Authorization: Bearer ovs_..."
 *
 * Protocolo: JSON-RPC 2.0 sobre HTTP (transport "Streamable HTTP" de MCP).
 * Implementado a mano — son tres métodos (`initialize`, `tools/list`,
 * `tools/call`) y así el proyecto no suma una dependencia por eso.
 *
 * Auth: `Authorization: Bearer ovs_...` en cada request. Sin token válido,
 * 401 explícito (BASE nº6 — nada de responder 200 igual).
 */

import { NextRequest } from 'next/server'
import { authenticate } from '@/lib/mcp/auth'
import { TOOLS, callTool } from '@/lib/mcp/tools'

export const runtime = 'nodejs'
// El bridge lee datos vivos: nunca se cachea.
export const dynamic = 'force-dynamic'

const PROTOCOL_VERSION = '2025-06-18'

interface RpcRequest {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return Response.json({ jsonrpc: '2.0', id: id ?? null, result })
}

function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return Response.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
}

export async function POST(req: NextRequest) {
  const gate = await authenticate(req)
  if ('response' in gate) return gate.response
  const { auth } = gate

  let body: RpcRequest
  try {
    body = await req.json()
  } catch {
    return rpcError(null, -32700, 'JSON inválido.')
  }

  const { id, method, params } = body
  const origin = new URL(req.url).origin

  switch (method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'overseer', version: '1.0.0' },
        instructions:
          'Overseer Life OS — el "second brain" de Agustín. Antes de proponer un plan: leé ' +
          'get_planner_profile (lo aprendido) y get_agenda (huecos libres REALES, ya calculados). ' +
          'No adivines disponibilidad. Al guardar con save_day_plan, linkeá cada bloque a su ' +
          'taskId y escribí el "reason" de por qué va ahí. Nada de este bridge borra datos.',
      })

    // Notificaciones del handshake: no llevan respuesta.
    case 'notifications/initialized':
    case 'initialized':
      return new Response(null, { status: 202 })

    case 'ping':
      return rpcResult(id, {})

    case 'tools/list':
      return rpcResult(id, { tools: TOOLS })

    case 'tools/call': {
      const name = String(params?.name ?? '')
      const args = (params?.arguments ?? {}) as Record<string, unknown>
      if (!name) return rpcError(id, -32602, 'Falta params.name.')
      try {
        const out = await callTool(name, args, { userId: auth.userId, origin })
        return rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
        })
      } catch (err) {
        // El error se DEVUELVE, no se traga (BASE nº6). Si algo falla, Claude
        // tiene que enterarse y decirlo, no seguir planificando a ciegas.
        const detail = err instanceof Error ? err.message : String(err)
        return rpcResult(id, {
          isError: true,
          content: [{ type: 'text', text: `Error ejecutando "${name}": ${detail}` }],
        })
      }
    }

    // `resources` y `prompts` no se implementan; se responde vacío para que un
    // cliente que los pida no rompa el handshake.
    case 'resources/list':
      return rpcResult(id, { resources: [] })
    case 'prompts/list':
      return rpcResult(id, { prompts: [] })

    default:
      return rpcError(id, -32601, `Método no soportado: ${method}`)
  }
}

/** GET sirve para verificar de un vistazo que el token anda (pegar la URL en
 *  el browser con ?token=...). No expone datos. */
export async function GET(req: NextRequest) {
  const gate = await authenticate(req)
  if ('response' in gate) return gate.response
  const { auth } = gate
  return Response.json({
    ok: true,
    server: 'overseer-mcp',
    protocolVersion: PROTOCOL_VERSION,
    token: auth.label,
    tools: TOOLS.map((t) => t.name),
  })
}
