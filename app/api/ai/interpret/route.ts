import { NextRequest, NextResponse } from 'next/server'
import { llmChat, safeJsonParse, getOllamaConfig } from '@/lib/ai/llmClient'

/**
 * POST /api/ai/interpret
 * Body: { message: string, context?: { ... } }
 * Returns: { ok: true, intent: { type: string, extracted: {...} } } | { ok: false, error }
 *
 * Uses Ollama (local LLM) to classify a user message into one of the Overseer intent types.
 * Falls back to "unknown" when the LLM is unreachable or returns garbage.
 */

const SYSTEM_PROMPT = `You are an intent classifier for "Overseer", a personal life-OS dashboard. The user writes in Spanish (Argentinian) or English. Your job: read one message and classify it.

OUTPUT FORMAT: ONLY a single JSON object. No markdown, no explanation, no preface.

Available intents (use the EXACT "type" string shown):

1. {"type":"gym_start_session","extracted":{"sessionName":"<string|null>"}}
   When user wants to start a workout. Examples: "nueva sesión de piernas", "empezar gym", "vamos al gym", "hagamos pecho hoy"

2. {"type":"gym_end_session","extracted":{}}
   When user finishes a workout. Examples: "terminé", "fin de sesión", "listo gym", "finalizar"

3. {"type":"gym_add_set","extracted":{"exerciseName":"<string|null>","weight":<number>,"reps":<number>,"unit":"kg"|"lb"}}
   When user logs ONE set. Examples: "hice 80kg 5 reps", "press banca 82.5 por 8", "tres por ocho con cuarenta" (3 sets of 8 reps with 40kg → still ONE entry, prefer sets=3 internally), "120 por 5", "metí 100 ocho veces"
   Default unit is "kg" if not stated. exerciseName can be null if user is continuing the previous exercise.

4. {"type":"gym_batch","extracted":{"gymActions":[ ...array of {"kind":"session_start"|"exercise","name":"...","sets":N,"reps":N,"weight":N,"unit":"kg|lb"} ]}}
   When user describes MULTIPLE exercises in one message. Example: "empezamos piernas, primer ejercicio sentadilla 4 series de 8 con 100kg, segundo ejercicio prensa 3 de 12 con 200kg"

5. {"type":"gym_switch_exercise","extracted":{"exerciseName":"<string>"}}
   When user changes exercise WITHOUT logging a set. Examples: "ahora pasamos a curl", "cambio de ejercicio", "siguiente: peso muerto"

6. {"type":"task_create_no_project","extracted":{"taskTitle":"<string>"}}
   When user wants to add a task. Examples: "agregá llamar al banco", "tengo que comprar leche", "nueva tarea: revisar emails"

7. {"type":"execute_complete","extracted":{"taskTitle":"<string>"}}
   When user wants to mark a task done. Examples: "terminé la tarea de X", "completé Y", "marcá como hecho Z"

8. {"type":"schedule_update","extracted":{"scheduleKey":"<almuerzo|cafe|merienda|cena|entrenamiento|fruta_snack>","scheduleTime":"<HH:MM>"}}
   When user updates a daily-schedule slot. Examples: "almuerzo a las 14", "quiero cenar 21hs", "mover entrenamiento a las 19"

9. {"type":"question","extracted":{}}
   When user asks something open-ended that needs reasoning. Examples: "¿qué me conviene hacer ahora?", "¿cómo viene mi semana?"

10. {"type":"greeting","extracted":{}}
    Just a hello.

11. {"type":"unknown","extracted":{}}
    None of the above clearly applies.

RULES:
- Output ONE single JSON object, nothing else.
- Numbers must be numbers, not strings.
- For weight/reps, parse Spanish phrasings: "ochenta por cinco" = weight 80, reps 5. "tres por ocho con cuarenta" = sets 3 reps 8 weight 40 → use gym_batch.
- If multiple exercises in one message, use gym_batch.
- Be tolerant of typos and informal language.`

interface IntentOut {
  type: string
  extracted?: Record<string, unknown>
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const message = (body?.message as string) ?? ''
    const context = body?.context ?? {}

    if (!message.trim()) {
      return NextResponse.json({ ok: false, error: 'empty_message' }, { status: 400 })
    }

    const userPrompt =
      `MESSAGE: ${message.trim()}\n` +
      `CONTEXT: ${JSON.stringify(context)}\n\n` +
      `Output the JSON now:`

    // Provider routing — client passes "x-ai-provider" header + optional Anthropic credentials
    const provider = (req.headers.get('x-ai-provider') as 'ollama' | 'anthropic' | null) ?? 'ollama'
    const anthropicApiKey = req.headers.get('x-anthropic-key') ?? undefined
    const anthropicModel = req.headers.get('x-anthropic-model') ?? undefined

    let raw = ''
    try {
      raw = await llmChat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        { provider, anthropicApiKey, anthropicModel, format: 'json', temperature: 0.15, numPredict: 400 },
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown'
      return NextResponse.json({ ok: false, error: provider === 'anthropic' ? 'anthropic_failed' : 'ollama_unreachable', detail: msg }, { status: 503 })
    }

    const parsed = safeJsonParse<IntentOut>(raw)
    if (!parsed || typeof parsed.type !== 'string') {
      return NextResponse.json({ ok: false, error: 'invalid_json', raw }, { status: 500 })
    }

    return NextResponse.json({ ok: true, intent: parsed })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function GET() {
  // Quick healthcheck — returns the configured Ollama host & model
  const cfg = getOllamaConfig()
  let reachable = false
  try {
    const r = await fetch(cfg.host, { signal: AbortSignal.timeout(2000) })
    reachable = r.ok || r.status === 404 // Ollama root returns plain text
  } catch { /* unreachable */ }
  return NextResponse.json({ ok: true, ...cfg, reachable })
}
