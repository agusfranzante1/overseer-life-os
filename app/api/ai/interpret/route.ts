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
   When user logs ONE set with a SINGLE weight/reps pair. Examples: "hice 80kg 5 reps", "press banca 82.5 por 8", "120 por 5", "metí 100 ocho veces"
   Default unit is "kg" if not stated. exerciseName can be null if user is continuing the previous exercise.

3b. {"type":"gym_log_sets","extracted":{"exerciseName":"<string|null>","sets":[{"weight":<number>,"reps":<number>,"unit":"kg|lb"}, ...]}}
   When user logs MULTIPLE sets of the SAME exercise with DIFFERENT weights or reps per set. Examples:
   - "hice 3 series, la primera 8 con 75kg, la segunda 10 reps con 80kg, la tercera 8 con 85kg"
        → exerciseName: null (continuing previous), sets: [{weight:75,reps:8,unit:"kg"},{weight:80,reps:10,unit:"kg"},{weight:85,reps:8,unit:"kg"}]
   - "press banca: 8x80, 6x85, 4x90"
        → exerciseName: "press banca", sets: [{weight:80,reps:8,unit:"kg"},{weight:85,reps:6,unit:"kg"},{weight:90,reps:4,unit:"kg"}]
   - "sentadilla 10@100, 8@110, 6@120"
        → 3 sets escalonados de sentadilla
   - "tres series de 8 reps con 70" (todas iguales) → STILL use gym_log_sets with 3 identical entries
   This is the right intent whenever the user describes MULTIPLE sets within ONE exercise, even if the weights are all equal.

4. {"type":"gym_batch","extracted":{"gymActions":[ ...array of {"kind":"session_start"|"exercise","name":"...","sets":N,"reps":N,"weight":N,"unit":"kg|lb"} ]}}
   When user describes MULTIPLE DIFFERENT exercises in one message. Example: "empezamos piernas, primer ejercicio sentadilla 4 series de 8 con 100kg, segundo ejercicio prensa 3 de 12 con 200kg"
   Note: ONE exercise with N sets at varying weights goes to gym_log_sets, NOT here.

5. {"type":"gym_switch_exercise","extracted":{"exerciseName":"<string>"}}
   When user changes exercise WITHOUT logging a set. Examples: "ahora pasamos a curl", "cambio de ejercicio", "siguiente: peso muerto"

6. {"type":"task_create_no_project","extracted":{"taskTitle":"<string>"}}
   When user wants to add a SINGLE task without specifying a project. Examples: "agregá llamar al banco", "tengo que comprar leche", "nueva tarea: revisar emails"

6b. {"type":"task_create_with_project","extracted":{"taskTitle":"<string>","projectName":"<string>"}}
   When user wants to add a SINGLE task IN a specific project. Example: "agregá llamar al banco en personal"
   projectName MUST be one of the project names in CONTEXT.projects (exact match, case-insensitive). If the user references a project that doesn't exist, fall back to task_create_no_project.

6c. {"type":"task_create_batch","extracted":{"taskBatch":[{"taskTitle":"<string>","projectName":"<string|null>"}, ...]}}
   When user wants to add MULTIPLE tasks in ONE message, possibly across DIFFERENT projects. Each array item is one task.
   Examples:
   - "necesito agregar revisar precios en personal, y llamar al cliente en nqn survey"
       → taskBatch: [{taskTitle:"revisar precios", projectName:"Personal"}, {taskTitle:"llamar al cliente", projectName:"NQN Survey"}]
   - "agregame: comprar leche y enviar mail a juan, ambas en personal"
       → taskBatch: [{taskTitle:"comprar leche", projectName:"Personal"}, {taskTitle:"enviar mail a juan", projectName:"Personal"}]
   - "tengo que terminar el informe, después arrancar la presentación y mandarle el budget a maria"
       → taskBatch: 3 items, all with projectName:null (no project specified)
   - "agrega X tarea en personal, también Y en gym"
       → taskBatch: [{taskTitle:"X tarea", projectName:"Personal"}, {taskTitle:"Y", projectName:"Gym"}]
   Rules: split on ", y / y también / también / coma+verbo". Trim trailing project mention from each title. projectName must match one in CONTEXT.projects or be null.

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
- For weight/reps, parse Spanish phrasings: "ochenta por cinco" = weight 80, reps 5.
- "primera/segunda/tercera serie" or "X@Y" or "AxB, CxD" patterns → gym_log_sets (one exercise, many sets).
- Multiple DIFFERENT exercises in one message → gym_batch.
- ONE exercise + ONE set → gym_add_set.
- ONE exercise + MULTIPLE sets (even if all identical) → gym_log_sets.
- MULTIPLE tasks (esp. in different projects) → task_create_batch.
- ONE task with a project → task_create_with_project.
- ONE task without a project → task_create_no_project.
- Be tolerant of typos, abbreviations, and informal language.
- Use CONTEXT.recentChat to resolve references like "esa misma", "la última que dijiste", "agregale otra". If the previous assistant message asked about a specific exercise/task/project, prefer that as the target.
- If the user's message is a simple "sí / no / dale / ok" confirming the previous assistant question, infer the intent from that context (e.g. if the assistant just asked "¿agrego dropset al Press Inclinado?", a "sí" should be the relevant gym intent, not greeting).
- When in doubt between conversation/question and an action, prefer the action ONLY if there are unambiguous signals (numbers, exercise names, project names, explicit verbs).`

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
