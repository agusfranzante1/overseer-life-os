import { NextRequest, NextResponse } from 'next/server'
import { llmChat, safeJsonParse } from '@/lib/ai/llmClient'

/**
 * POST /api/ai/projection-breakdown
 * Body: { parentGoal: string, level: 'quarter' | 'month', context?: string }
 * Returns: { ok: true, subgoals: string[] } — exactly 3 sub-goals.
 *
 * Used to break a higher-level goal (annual or quarterly) into 3
 * concrete next-level sub-goals (quarterly or monthly). User can
 * re-roll to get different options.
 */

const SYSTEM_PROMPT = `You are a strategic planning assistant for "Overseer", a personal life-OS. The user gives you a high-level personal goal AND the time level they want to break it down to. Your job: return EXACTLY 3 concrete sub-goals at that time level.

OUTPUT FORMAT: ONLY a single JSON object. No markdown, no explanation, no preface. Schema:

{
  "subgoals": [
    "string — concrete, measurable, scoped to the requested time level",
    "string",
    "string"
  ]
}

RULES:
- EXACTLY 3 sub-goals. Never more, never less.
- Each sub-goal must be CONCRETE and ACTIONABLE — avoid vague ("mejorar la salud") in favor of measurable ("3 sesiones de fuerza/semana sostenidas todo el Q").
- Scope to the time level:
  · quarter → results achievable in 12 weeks (e.g. "Cuenta de USD 50k fondeada")
  · month → results achievable in 4 weeks (e.g. "Backtesting completo de la estrategia A")
- Each sub-goal under 120 chars.
- Match the user's language (Spanish in → Spanish out, English in → English out).
- Don't repeat the parent goal as a sub-goal.
- Don't add fluff or generic productivity tips.
- The 3 sub-goals should be COMPLEMENTARY (cover different angles of the parent) rather than redundant.
- If the parent goal mentions a specific area (gym, finance, etc.), keep sub-goals in that domain.`

interface BreakdownOut {
  subgoals: string[]
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parentGoal = (body?.parentGoal as string)?.trim() ?? ''
    const level = (body?.level as 'quarter' | 'month') ?? 'quarter'
    const context = (body?.context as string)?.trim() ?? ''

    if (!parentGoal) {
      return NextResponse.json({ ok: false, error: 'empty_parent_goal' }, { status: 400 })
    }

    const levelLabel = level === 'quarter' ? 'TRIMESTRE (próximos 90 días)' : 'MES (próximas 4 semanas)'
    const userPrompt =
      `PARENT GOAL: ${parentGoal}\n` +
      `BREAK IT DOWN INTO 3 SUB-GOALS FOR: ${levelLabel}\n` +
      (context ? `EXTRA CONTEXT: ${context}\n` : '') +
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
        // Higher temperature than intent classifier — we WANT some
        // variety so the user can re-roll to get different angles.
        { provider, anthropicApiKey, anthropicModel, format: 'json', temperature: 0.85, numPredict: 500 },
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown'
      return NextResponse.json({ ok: false, error: provider === 'anthropic' ? 'anthropic_failed' : 'ollama_unreachable', detail: msg }, { status: 503 })
    }

    const parsed = safeJsonParse<BreakdownOut>(raw)
    if (!parsed || !Array.isArray(parsed.subgoals)) {
      return NextResponse.json({ ok: false, error: 'invalid_json', raw }, { status: 500 })
    }

    // Trim to 3 (defensive — if model returns more or less).
    const subgoals = parsed.subgoals.slice(0, 3).filter((s) => typeof s === 'string' && s.trim().length > 0)
    if (subgoals.length === 0) {
      return NextResponse.json({ ok: false, error: 'no_subgoals_generated', raw }, { status: 500 })
    }

    return NextResponse.json({ ok: true, subgoals })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
