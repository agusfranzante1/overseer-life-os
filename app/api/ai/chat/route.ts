import { NextRequest, NextResponse } from 'next/server'
import { llmChat } from '@/lib/ai/llmClient'

/**
 * POST /api/ai/chat
 * Body: { message: string, context: { ... } }
 * Returns: { ok: true, content: string }
 *
 * Conversational endpoint. Unlike /api/ai/interpret (which classifies a single
 * intent into structured JSON), this one generates a real prose reply using
 * the full Overseer context.
 *
 * It's the "fallback brain" when no intent matched — the user is asking
 * something open-ended ("¿qué hago ahora?", "¿cómo viene mi semana?",
 * "explicame la rutina de pierna") and deserves an actual answer instead of
 * a canned one.
 */

const SYSTEM_PROMPT = `Sos "Overseer", un asistente personal de productividad / fitness / wellness para Agustín. Hablás en español rioplatense, directo, sin rodeos. Estilo: pragmático, conciso, accionable. No tirás clichés tipo "buena pregunta". Cuando no sepas, pedís info concreta.

Tenés acceso a CONTEXT con el estado actual de la app del usuario:
- projects: lista de proyectos con tareas pendientes
- todayTasks: tareas marcadas para hoy
- gym: estado del entrenamiento (sesión activa, rutinas guardadas, último peso corporal)
- metrics: energía, sueño, pasos, FC de hoy
- schedule: horario diario configurado
- dayType: tipo de día actual (deep_work / admin / etc)

REGLAS:
- Respondés en máximo 3-5 oraciones. Si necesitás listas, máximo 5 ítems con bullets.
- Markdown OK pero parco. Sin emojis salvo que el user los use.
- Si el user te pide AGREGAR / ELIMINAR / MODIFICAR algo, dale instrucciones específicas pero aclarale que por ahora tiene que hacerlo manualmente desde la UI (la integración para ejecutar cambios directos está en desarrollo).
- Si te preguntan sobre fitness, basate en lo que hay en gym.routines y gym.recentSessions. Si no hay datos, decílo.
- Si te preguntan "qué hago ahora", combiná: dayType + energía + tareas urgentes/altas para sugerir UNA tarea concreta.
- Cuando hables de números (peso, pasos, sueño), citá el número exacto del context.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const message = (body?.message as string) ?? ''
    const context = body?.context ?? {}
    const history = Array.isArray(body?.history) ? body.history : []

    if (!message.trim()) {
      return NextResponse.json({ ok: false, error: 'empty_message' }, { status: 400 })
    }

    const provider = (req.headers.get('x-ai-provider') as 'ollama' | 'anthropic' | null) ?? 'ollama'
    const anthropicApiKey = req.headers.get('x-anthropic-key') ?? undefined
    const anthropicModel = req.headers.get('x-anthropic-model') ?? undefined

    // Build the messages array: system → past turns (compact) → context → current message
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ]

    // Recent history (last ~10 turns) for continuity. Trim each to 500 chars.
    const recentHistory = history.slice(-10) as { role: 'user' | 'assistant'; content: string }[]
    for (const h of recentHistory) {
      if (h.role !== 'user' && h.role !== 'assistant') continue
      const trimmed = (h.content ?? '').slice(0, 500)
      if (trimmed) messages.push({ role: h.role, content: trimmed })
    }

    messages.push({
      role: 'user',
      content: `CONTEXT:\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\`\n\nMENSAJE DEL USUARIO:\n${message.trim()}`,
    })

    let content = ''
    try {
      content = await llmChat(messages, {
        provider, anthropicApiKey, anthropicModel,
        temperature: 0.55, numPredict: 600,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown'
      return NextResponse.json({
        ok: false,
        error: provider === 'anthropic' ? 'anthropic_failed' : 'ollama_unreachable',
        detail: msg,
      }, { status: 503 })
    }

    return NextResponse.json({ ok: true, content: content.trim() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
