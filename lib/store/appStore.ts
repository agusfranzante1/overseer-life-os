'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Language, DayType, MetricEntry } from '@/types'

export interface ScheduleSlot {
  label: string
  time: string
  icon: string
  color: string
}

// Free-form string — built-in keys ('almuerzo', 'cafe', etc.) coexist with user-created ones
export type ScheduleKey = string

export const DEFAULT_SCHEDULE: Record<string, ScheduleSlot> = {
  almuerzo:       { label: 'Almuerzo',      time: '13:00', icon: '🍽️',  color: '#10b981' },
  cafe:           { label: 'Café',          time: '10:00', icon: '☕',   color: '#f59e0b' },
  fruta_snack:    { label: 'Fruta Snack',   time: '16:00', icon: '🍎',   color: '#ef4444' },
  merienda:       { label: 'Merienda',      time: '17:00', icon: '🍪',   color: '#f97316' },
  cena:           { label: 'Cena',          time: '21:00', icon: '🌙',   color: '#6366f1' },
  entrenamiento:  { label: 'Entrenamiento', time: '18:00', icon: '🏋️',  color: '#ec4899' },
}

export const DEFAULT_SCHEDULE_ORDER: ScheduleKey[] = [
  'cafe', 'almuerzo', 'fruta_snack', 'merienda', 'entrenamiento', 'cena',
]

interface AppState {
  language: Language
  sidebarCollapsed: boolean
  dayType: DayType | null
  activeSection: 'dashboard' | 'calendar' | 'tasks'
  metrics: MetricEntry
  chatOpen: boolean
  idealSchedule: Record<string, ScheduleSlot>
  scheduleOrder: ScheduleKey[]

  setLanguage: (lang: Language) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  setDayType: (type: DayType | null) => void
  setActiveSection: (s: AppState['activeSection']) => void
  updateMetric: <K extends keyof MetricEntry>(key: K, value: MetricEntry[K]) => void
  setChatOpen: (v: boolean) => void
  updateSchedule: (key: ScheduleKey, time: string) => void
  reorderSchedule: (order: ScheduleKey[]) => void
  addScheduleSlot: (slot: { label: string; icon: string; color: string; time?: string }) => string
  removeScheduleSlot: (key: ScheduleKey) => void

  // Sidebar nav order (persisted)
  navOrder: string[]
  setNavOrder: (keys: string[]) => void

  // AI provider settings (persisted)
  aiProvider: 'off' | 'ollama' | 'anthropic'
  anthropicApiKey: string
  anthropicModel: string
  setAiProvider: (p: 'off' | 'ollama' | 'anthropic') => void
  setAnthropicApiKey: (k: string) => void
  setAnthropicModel: (m: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      language: 'en',
      sidebarCollapsed: false,
      dayType: null,
      activeSection: 'dashboard',
      chatOpen: false,
      idealSchedule: DEFAULT_SCHEDULE,
      scheduleOrder: DEFAULT_SCHEDULE_ORDER,
      metrics: {
        focus: 72,
        energy: 61,
        sleep: 6.67,
        stress: 45,
        steps: 4200,
        wakeTime: '07:00',
        sleepDebt: 1.5,
        workload: 70,
      },

      setLanguage: (lang) => set({ language: lang }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setDayType: (type) => set({ dayType: type }),
      setActiveSection: (activeSection) => set({ activeSection }),
      updateMetric: (key, value) =>
        set((s) => ({ metrics: { ...s.metrics, [key]: value } })),
      setChatOpen: (v) => set({ chatOpen: v }),
      updateSchedule: (key, time) =>
        set((s) => ({
          idealSchedule: {
            ...s.idealSchedule,
            [key]: { ...s.idealSchedule[key], time },
          },
        })),
      reorderSchedule: (order) => set({ scheduleOrder: order }),
      addScheduleSlot: ({ label, icon, color, time }) => {
        const base = label.toLowerCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '') || 'slot'
        let assignedId = base
        set((s) => {
          let id = base
          let i = 2
          while (id in s.idealSchedule) { id = `${base}_${i++}` }
          assignedId = id
          const slot: ScheduleSlot = { label, icon, color, time: time ?? '12:00' }
          return {
            idealSchedule: { ...s.idealSchedule, [id]: slot },
            scheduleOrder: [...s.scheduleOrder, id],
          }
        })
        return assignedId
      },
      removeScheduleSlot: (key: ScheduleKey) => set((s) => {
        const next = { ...s.idealSchedule }
        delete next[key]
        return {
          idealSchedule: next,
          scheduleOrder: s.scheduleOrder.filter((k) => k !== key),
        }
      }),

      navOrder: [],  // empty = use default order from Sidebar's NAV_ITEMS
      setNavOrder: (keys) => set({ navOrder: keys }),

      aiProvider: 'off',
      anthropicApiKey: '',
      anthropicModel: 'claude-haiku-4-5',
      setAiProvider: (p) => set({ aiProvider: p }),
      setAnthropicApiKey: (k) => set({ anthropicApiKey: k }),
      setAnthropicModel: (m) => set({ anthropicModel: m }),
    }),
    {
      name: 'overseer-app',
      // Migrate older persisted state — adds new fields, repairs corrupted ones
      migrate: (persisted) => {
        const p = persisted as Partial<AppState> | undefined
        if (!p) return p
        // Repair wakeTime if it got saved as a number (bug from parseFloat("07:00") = 7)
        if (p.metrics && typeof p.metrics.wakeTime !== 'string') {
          p.metrics = { ...p.metrics, wakeTime: '07:00' }
        }
        const sched = { ...DEFAULT_SCHEDULE, ...(p.idealSchedule ?? {}) }
        const order = p.scheduleOrder && p.scheduleOrder.length > 0
          ? [
              ...p.scheduleOrder.filter((k) => k in sched),
              ...DEFAULT_SCHEDULE_ORDER.filter((k) => !p.scheduleOrder!.includes(k)),
            ]
          : DEFAULT_SCHEDULE_ORDER
        return { ...p, idealSchedule: sched, scheduleOrder: order } as AppState
      },
      version: 3,
    }
  )
)
