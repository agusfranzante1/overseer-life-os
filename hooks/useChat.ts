'use client'
import { useCallback } from 'react'
import { useChatStore } from '@/lib/store/chatStore'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useAppStore } from '@/lib/store/appStore'
import { useGymStore } from '@/lib/store/gymStore'
import { detectIntent, type Intent, type IntentType } from '@/lib/ai/intentDetector'
import { handleIntent } from '@/lib/ai/intentHandlers'
import { getAiHeaders } from '@/lib/ai/headers'

const LLM_FALLBACK_TYPES: IntentType[] = ['unknown']  // only call LLM when regex couldn't classify

async function classifyWithLLM(message: string, context: Record<string, unknown>): Promise<Intent | null> {
  const headers = getAiHeaders()
  if (!headers) return null  // AI disabled in settings
  try {
    const res = await fetch('/api/ai/interpret', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, context }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) return null
    const json = await res.json()
    if (!json.ok || !json.intent?.type) return null
    return {
      type: json.intent.type as IntentType,
      raw: message,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extracted: (json.intent.extracted ?? {}) as any,
    }
  } catch {
    return null
  }
}

export function useChat() {
  const chatStore = useChatStore()
  const tasksStore = useTasksStore()
  const { language, metrics, updateSchedule } = useAppStore()
  const gymStore = useGymStore()

  const sendMessage = useCallback(async (text: string) => {
    chatStore.addMessage({ role: 'user', content: text })
    chatStore.setThinking(true)

    // Small delay for UX
    await new Promise((r) => setTimeout(r, 400))

    try {
      const projectNames = Object.values(tasksStore.projects).map((p) => p.name)
      const pending = chatStore.pendingIntent

      let intent: Intent = pending?.type === 'task_create_no_project'
        ? { type: 'clarify_project' as const, raw: text, extracted: { taskTitle: pending.extracted?.taskTitle } }
        : detectIntent(text, projectNames)

      // LLM fallback when regex couldn't classify
      if (LLM_FALLBACK_TYPES.includes(intent.type)) {
        const llm = await classifyWithLLM(text, {
          projects: projectNames,
          activeGymSession: gymStore.activeSession?.name ?? null,
          currentExercise: gymStore.currentExerciseName ?? null,
          language,
        })
        if (llm && llm.type !== 'unknown') intent = llm
      }

      const result = await handleIntent(
        intent,
        {
          tasks: tasksStore,
          gym: gymStore,
          metrics,
          updateSchedule: (key: string, time: string) => updateSchedule(key as import('@/lib/store/appStore').ScheduleKey, time),
          setPendingIntent: chatStore.setPendingIntent,
          getPendingIntent: () => chatStore.pendingIntent,
        },
        language
      )

      chatStore.addMessage({
        role: 'assistant',
        content: result.content,
        ...(result.actionType ? {
          actionCard: { type: result.actionType as 'ask_project', payload: result.payload ?? {}, confirmed: false }
        } : {}),
      })
    } finally {
      chatStore.setThinking(false)
    }
  }, [chatStore, tasksStore, gymStore, language, metrics, updateSchedule])

  return {
    messages: chatStore.messages,
    isThinking: chatStore.isThinking,
    sendMessage,
    clearHistory: chatStore.clearHistory,
  }
}
