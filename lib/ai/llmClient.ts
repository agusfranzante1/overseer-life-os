/**
 * Thin LLM client supporting two providers:
 *   - Ollama (local, free)
 *   - Anthropic Claude (cloud, paid via API key)
 *
 * Configure via env vars in .env.local:
 *   OLLAMA_HOST=http://localhost:11434   (default)
 *   OLLAMA_MODEL=llama3.2:3b             (default)
 *
 * Claude credentials come from the client per-request (via headers) so users can
 * paste their API key in Settings without restarting the server.
 */

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b'

export interface LlmRequestOptions {
  provider?: 'ollama' | 'anthropic'
  anthropicApiKey?: string
  anthropicModel?: string
  /** When 'json' the provider forces valid JSON output. */
  format?: 'json'
  /** Lower = more deterministic. */
  temperature?: number
  /** Max tokens. */
  numPredict?: number
}

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Routes the chat request to the chosen provider.
 * Provider precedence: explicit option → 'ollama' fallback.
 */
export async function llmChat(messages: ChatMsg[], opts: LlmRequestOptions = {}): Promise<string> {
  const provider = opts.provider ?? 'ollama'
  if (provider === 'anthropic') {
    if (!opts.anthropicApiKey) throw new Error('Missing Anthropic API key')
    return anthropicChat(messages, opts)
  }
  return ollamaChat(messages, opts)
}

/** Calls Ollama's chat endpoint. */
export async function ollamaChat(messages: ChatMsg[], opts: LlmRequestOptions = {}): Promise<string> {
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      ...(opts.format ? { format: opts.format } : {}),
      options: {
        temperature: opts.temperature ?? 0.2,
        ...(opts.numPredict ? { num_predict: opts.numPredict } : {}),
      },
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  return (data?.message?.content as string) ?? ''
}

/** Calls Anthropic Claude Messages API. */
export async function anthropicChat(messages: ChatMsg[], opts: LlmRequestOptions = {}): Promise<string> {
  // Anthropic API expects `system` as a top-level field, not in messages
  const systemMsgs = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const chatMsgs = messages.filter((m) => m.role !== 'system').map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const body: Record<string, unknown> = {
    model: opts.anthropicModel ?? 'claude-haiku-4-5',
    max_tokens: opts.numPredict ?? 1024,
    temperature: opts.temperature ?? 0.2,
    messages: chatMsgs,
  }
  if (systemMsgs) body.system = systemMsgs

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.anthropicApiKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Anthropic HTTP ${res.status}: ${text.slice(0, 300)}`)
  }

  const data = await res.json()
  // Claude returns content as an array of blocks
  const text = (data?.content as Array<{ type: string; text?: string }> | undefined)
    ?.filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('') ?? ''
  return text
}

/** Best-effort JSON parse — tolerates LLMs that add stray text around JSON. */
export function safeJsonParse<T = unknown>(raw: string): T | null {
  // Trim, strip code fences if present
  let s = raw.trim()
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  // Try direct parse
  try { return JSON.parse(s) as T } catch { /* fall through */ }
  // Fallback: extract the first { ... } block
  const match = s.match(/\{[\s\S]*\}/)
  if (match) {
    try { return JSON.parse(match[0]) as T } catch { /* nope */ }
  }
  return null
}

export function getOllamaConfig() {
  return { host: OLLAMA_HOST, model: OLLAMA_MODEL }
}
