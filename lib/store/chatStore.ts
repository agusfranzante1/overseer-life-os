'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ChatMessage, ChatActionCard } from '@/types'

interface PendingIntent {
  type: string
  raw: string
  extracted: Record<string, string | undefined>
}

interface ChatState {
  messages: ChatMessage[]
  pendingIntent: PendingIntent | null
  isThinking: boolean

  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  setPendingIntent: (intent: PendingIntent | null) => void
  setThinking: (v: boolean) => void
  confirmActionCard: (messageId: string) => void
  clearHistory: () => void
}

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      pendingIntent: null,
      isThinking: false,

      addMessage: (msg) =>
        set((s) => ({
          messages: [
            ...s.messages,
            { ...msg, id: genId(), timestamp: new Date().toISOString() },
          ],
        })),

      setPendingIntent: (intent) => set({ pendingIntent: intent }),
      setThinking: (v) => set({ isThinking: v }),

      confirmActionCard: (messageId) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === messageId && m.actionCard
              ? { ...m, actionCard: { ...m.actionCard, confirmed: true } }
              : m
          ),
        })),

      clearHistory: () => set({ messages: [], pendingIntent: null }),
    }),
    { name: 'overseer-chat' }
  )
)
