import { NextRequest, NextResponse } from 'next/server'
import { llmChat, safeJsonParse, getOllamaConfig } from '@/lib/ai/llmClient'

/**
 * POST /api/ai/breakdown
 * Body: { task: string, context?: string }
 * Returns: { ok: true, subtasks: { title: string; priority?: 'low'|'medium'|'high'|'urgent' }[] }
 *
 * Uses local LLM (Ollama) to break a task description into actionable sub-steps.
 */

const SYSTEM_PROMPT = `You are a task-breakdown assistant for "Overseer", a personal life OS. The user gives you a high-level task description (in Spanish or English). Your job: break it into 3-10 small, specific, actionable sub-steps that the user can mark complete one by one.

OUTPUT FORMAT: ONLY a single JSON object. No markdown, no explanation, no preface. Schema:

{
  "subtasks": [
    { "title": "string — imperative phrasing, under 80 chars", "priority": "low" | "medium" | "high" | "urgent" }
  ]
}

RULES:
- 3 to 10 subtasks. Never more. Be concise.
- Use imperative voice: "Investigar X", "Llamar a Y", "Escribir borrador Z".
- Order subtasks logically (do-first → do-last).
- Use "high" only if the subtask is critical-path or has a hard deadline.
- Use "urgent" only if delaying would cause material consequences.
- Most subtasks should be "medium" or unspecified.
- Each title <80 chars.
- Match the input language (Spanish in / Spanish out, English in / English out).
- Don't include the parent task as a subtask.
- Don't add fluff like "investigar opciones" if a more concrete step is possible.`

interface BreakdownOut {
  subtasks: { title: string; priority?: 'low' | 'medium' | 'high' | 'urgent' }[]
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const task = (body?.task as string)?.trim() ?? ''
    const context = (body?.context as string)?.trim() ?? ''

    if (!task) {
      return NextResponse.json({ ok: false, error: 'empty_task' }, { status: 400 })
    }

    const userPrompt =
      `Task: ${task}\n` +
      (context ? `Extra context: ${context}\n` : '') +
      `\nOutput the JSON now:`

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
        { provider, anthropicApiKey, anthropicModel, format: 'json', temperature: 0.4, numPredict: 800 },
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown'
      return NextResponse.json({ ok: false, error: provider === 'anthropic' ? 'anthropic_failed' : 'ollama_unreachable', detail: msg }, { status: 503 })
    }

    const parsed = safeJsonParse<BreakdownOut>(raw)
    if (!parsed || !Array.isArray(parsed.subtasks)) {
      return NextResponse.json({ ok: false, error: 'invalid_json', raw }, { status: 500 })
    }

    // Sanitize: drop empty titles, cap to 10
    const cleaned = parsed.subtasks
      .filter((s) => s && typeof s.title === 'string' && s.title.trim().length > 0)
      .map((s) => ({
        title: s.title.trim().slice(0, 120),
        priority: ['low', 'medium', 'high', 'urgent'].includes(s.priority as string) ? s.priority : undefined,
      }))
      .slice(0, 10)

    return NextResponse.json({ ok: true, subtasks: cleaned })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function GET() {
  const cfg = getOllamaConfig()
  return NextResponse.json({ ok: true, ...cfg, hint: 'POST { task, context? } to break down a task' })
}
