'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ChatMessage, ChatActionCard } from '@/types'

interface PendingIntent {
  type: string
  raw: string
  extracted: Record<string, string | undefined>
}

/** A user-supplied correction. Captured when the user says "no era eso" on
 *  an assistant action message. Future intent classification calls inject
 *  the most recent N corrections as few-shot examples — Claude sees what
 *  the user CORRECTED in similar past inputs and adapts.
 *
 *  Stored locally (Zustand persist) and lasts forever until the user clears
 *  them. Caps at 100 entries — once full, drops oldest. */
export interface ChatCorrection {
  id: string
  createdAt: string
  /** The exact original user message that was misinterpreted. */
  userInput: string
  /** Brief description of what the bot mistakenly did. */
  wrongInterpretation: string
  /** What the user says SHOULD have happened. Free text — Claude understands. */
  correctInterpretation: string
}

interface ChatState {
  messages: ChatMessage[]
  pendingIntent: PendingIntent | null
  isThinking: boolean
  corrections: ChatCorrection[]

  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  setPendingIntent: (intent: PendingIntent | null) => void
  setThinking: (v: boolean) => void
  confirmActionCard: (messageId: string) => void
  clearHistory: () => void
  addCorrection: (c: Omit<ChatCorrection, 'id' | 'createdAt'>) => void
  removeCorrection: (id: string) => void
  clearCorrections: () => void
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
      corrections: [],

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

      addCorrection: (c) =>
        set((s) => {
          const next: ChatCorrection = {
            ...c,
            id: genId(),
            createdAt: new Date().toISOString(),
          }
          // Cap at 100 entries; drop oldest if full.
          const list = [next, ...s.corrections].slice(0, 100)
          return { corrections: list }
        }),

      removeCorrection: (id) =>
        set((s) => ({ corrections: s.corrections.filter((c) => c.id !== id) })),

      clearCorrections: () => set({ corrections: [] }),
    }),
    { name: 'overseer-chat' }
  )
)
