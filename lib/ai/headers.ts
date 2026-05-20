'use client'
import { useAppStore } from '@/lib/store/appStore'

/**
 * Returns headers to send with /api/ai/* requests based on user's settings.
 * If aiProvider is 'off', returns null (caller should skip the request).
 */
export function getAiHeaders(): Record<string, string> | null {
  const { aiProvider, anthropicApiKey, anthropicModel } = useAppStore.getState()
  if (aiProvider === 'off') return null
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-ai-provider': aiProvider }
  if (aiProvider === 'anthropic') {
    if (!anthropicApiKey) return null
    headers['x-anthropic-key'] = anthropicApiKey
    if (anthropicModel) headers['x-anthropic-model'] = anthropicModel
  }
  return headers
}
