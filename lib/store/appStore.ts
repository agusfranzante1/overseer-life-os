'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Language, DayType, DayTypeConfig, MetricEntry } from '@/types'
import { detectTimezone } from '@/lib/utils/dateInTz'

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

// Built-in day types. Users can add and remove (including these defaults).
export const DEFAULT_DAY_TYPES: DayTypeConfig[] = [
  { id: 'deep_work', label: 'Deep Work',  color: '#6366f1', icon: '🧠' },
  { id: 'admin',     label: 'Admin',      color: '#94a3b8', icon: '💼' },
  { id: 'recovery',  label: 'Recovery',   color: '#10b981', icon: '❤️' },
  { id: 'legs_day',  label: 'Legs Day',   color: '#f59e0b', icon: '🏋️' },
  { id: 'trading',   label: 'Trading',    color: '#3b82f6', icon: '📈' },
  { id: 'content',   label: 'Content',    color: '#ec4899', icon: '📷' },
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
  dayTypes: DayTypeConfig[]
  /** IANA timezone (e.g. "America/Argentina/Buenos_Aires"). Determines the
   *  app's notion of "today" for habits, task auto-purge, etc. */
  timezone: string
  /** Toggle for auto-deleting tasks the day after they're completed. */
  autoPurgeCompletedTasks: boolean

  /** Per-channel notification preferences. Each value is a boolean; if
   *  `undefined` we treat it as enabled (opt-out model — sane defaults).
   *  Consumers (push schedulers, SPI Saturday banner, task due banners,
   *  etc) should check the corresponding key before firing. */
  notificationPrefs: {
    spiNewSession?: boolean    // Sábado AM: "Tu nuevo SPI está habilitado"
    taskDueSoon?: boolean      // Tareas con dueDate hoy/mañana
    taskOverdue?: boolean      // Tareas vencidas
    habitReminder?: boolean    // Reminder diario de hábitos no marcados
    /** Cuántos minutos ANTES del dueDate/dueTime se dispara la notificación
     *  "vencimiento de tareas". Default: 60 min (1 hora antes). Si la tarea
     *  no tiene `dueTime`, se asume 9:00 AM como hora del día. Override
     *  por-tarea vía `Task.notifyBeforeMinutes`. */
    taskDueLeadMinutes?: number
    /** Cuántos minutos antes del sábado a la madrugada disparar el aviso
     *  "Nuevo SPI habilitado". Default: 0 (en el momento). */
    spiNewSessionLeadMinutes?: number
  }
  setNotificationPref: (key: keyof AppState['notificationPrefs'], value: boolean | number) => void

  setLanguage: (lang: Language) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  setDayType: (type: DayType | null) => void
  addDayType: (cfg: { label: string; color: string; icon: string }) => string
  removeDayType: (id: string) => void
  updateDayType: (id: string, patch: Partial<Omit<DayTypeConfig, 'id'>>) => void
  setTimezone: (tz: string) => void
  setAutoPurgeCompletedTasks: (v: boolean) => void
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
      dayTypes: DEFAULT_DAY_TYPES,
      timezone: detectTimezone(),
      autoPurgeCompletedTasks: true,
      notificationPrefs: {
        spiNewSession: true,
        taskDueSoon: true,
        taskOverdue: true,
        habitReminder: false,
        taskDueLeadMinutes: 60,         // 1 hora antes por default
        spiNewSessionLeadMinutes: 0,    // en el momento
      },
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
      addDayType: ({ label, color, icon }) => {
        const base = label.toLowerCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '') || 'day_type'
        let assignedId = base
        set((s) => {
          let id = base
          let i = 2
          while (s.dayTypes.some((d) => d.id === id)) { id = `${base}_${i++}` }
          assignedId = id
          return { dayTypes: [...s.dayTypes, { id, label, color, icon }] }
        })
        return assignedId
      },
      removeDayType: (id) => set((s) => ({
        dayTypes: s.dayTypes.filter((d) => d.id !== id),
        // If the removed type is currently selected, clear it
        dayType: s.dayType === id ? null : s.dayType,
      })),
      updateDayType: (id, patch) => set((s) => ({
        dayTypes: s.dayTypes.map((d) => d.id === id ? { ...d, ...patch } : d),
      })),
      setTimezone: (tz) => set({ timezone: tz }),
      setAutoPurgeCompletedTasks: (v) => set({ autoPurgeCompletedTasks: v }),
      setNotificationPref: (key, value) => set((s) => ({
        notificationPrefs: { ...s.notificationPrefs, [key]: value },
      })),
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
        const dayTypes = Array.isArray(p.dayTypes) && p.dayTypes.length > 0
          ? p.dayTypes
          : DEFAULT_DAY_TYPES
        const timezone = typeof p.timezone === 'string' && p.timezone.length > 0
          ? p.timezone
          : detectTimezone()
        const autoPurgeCompletedTasks =
          typeof p.autoPurgeCompletedTasks === 'boolean' ? p.autoPurgeCompletedTasks : true
        return {
          ...p,
          idealSchedule: sched, scheduleOrder: order, dayTypes,
          timezone, autoPurgeCompletedTasks,
        } as AppState
      },
      version: 5,
    }
  )
)
