'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Language, DayType, DayTypeConfig, MetricEntry } from '@/types'
import { detectTimezone } from '@/lib/utils/dateInTz'
import { syncUserSettingsToSupabase } from '@/lib/supabase/userSettingsSync'

// Debounce el sync a Supabase — el usuario puede togglear varios switches
// seguidos; queremos un solo upsert al final, no uno por click.
let syncTimer: ReturnType<typeof setTimeout> | null = null
function debouncedSyncSettings() {
  if (typeof window === 'undefined') return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    const state = useAppStore.getState()
    syncUserSettingsToSupabase(state.notificationPrefs, state.timezone)
  }, 800)
}

// AppState se exporta debajo, antes del export del store. Tipo público
// para que helpers externos (sync, dispatcher) tipen los argumentos.
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

export type ThemeMode = 'dark' | 'light'

export interface AppState {
  language: Language
  /** Modo de color de toda la app. 'dark' (default, navy-black) o 'light'
   *  (claro). La clase se aplica en <html> y flipea la paleta neutra
   *  (zinc/white) vía CSS variables — ver globals.css y AppShell. */
  theme: ThemeMode
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
  /** Día y hora local en que se materializan las recurrentes de la
   *  PRÓXIMA semana, para que estén visibles al hacer el SPI del sábado.
   *  Por default: viernes 22:00. Cuando pasa este momento (o si ya es
   *  sábado/domingo), `ensureRecurringSpawns` usa el lunes siguiente
   *  como "fecha efectiva" y dispara el spawn anticipado.
   *  - hour: 0..23
   *  - dayOfWeek: 0=Dom, 1=Lun ... 5=Vie, 6=Sáb. Default 5 (viernes). */
  recurringSpawnAdvanceHour: number
  recurringSpawnAdvanceDayOfWeek: number

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
    /** Hora del día (0-23) en HORA LOCAL del usuario en la que el server
     *  dispara el recordatorio de hábitos pendientes. Default: 21. */
    habitReminderHour?: number
    /** Minuto del día (0-59) en HORA LOCAL del usuario. Default: 0. */
    habitReminderMinute?: number
    /** Master toggle para los recordatorios POR-HÁBITO (cada hábito puede
     *  tener su propia hora en `Habit.reminderTime`). Independiente del
     *  recordatorio general nocturno (`habitReminder`). */
    habitSpecificReminders?: boolean
    /** Recibir las mismas notificaciones también por EMAIL. Útil cuando
     *  no se quiere o no se puede configurar push en el celular. Para
     *  que funcione, el server necesita RESEND_API_KEY en env vars. */
    emailNotifications?: boolean
    /** Email destino para el canal email. Si está vacío, el server usa
     *  el email de auth (con el que te logueás). Sirve para mandar las
     *  notis a un email distinto del de la cuenta. */
    notificationEmail?: string
  }

  /** Sync de tareas-con-horario a Google Calendar.
   *   - `gcalSyncTasks`: master toggle. Default false.
   *   - `gcalSyncCalendarId`: calendar destino donde se crean los eventos.
   *     Si está vacío y `gcalSyncTasks=true`, el sync espera a que el user
   *     elija un calendario (no hace nada). */
  gcalTasksSync: {
    enabled?: boolean
    calendarId?: string
  }
  setGcalTasksSync: (patch: Partial<AppState['gcalTasksSync']>) => void
  setNotificationPref: (key: keyof AppState['notificationPrefs'], value: boolean | number | string) => void

  /** Colores custom del usuario. `null` = usar el default del tema.
   *   - darkBg / lightBg: fondo base de cada tema (--app-bg).
   *   - accent: color de acento de botones/resaltados (--app-accent +
   *     override de indigo/violet). Se aplica en ambos temas. */
  themeColors: {
    darkBg: string | null
    lightBg: string | null
    accent: string | null
  }

  setLanguage: (lang: Language) => void
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  setThemeColor: (key: 'darkBg' | 'lightBg' | 'accent', value: string | null) => void
  resetThemeColors: () => void
  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  setDayType: (type: DayType | null) => void
  addDayType: (cfg: { label: string; color: string; icon: string }) => string
  removeDayType: (id: string) => void
  updateDayType: (id: string, patch: Partial<Omit<DayTypeConfig, 'id'>>) => void
  setTimezone: (tz: string) => void
  setAutoPurgeCompletedTasks: (v: boolean) => void
  setRecurringSpawnAdvance: (dayOfWeek: number, hour: number) => void
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
      theme: 'dark',
      themeColors: { darkBg: null, lightBg: null, accent: null },
      sidebarCollapsed: false,
      dayType: null,
      activeSection: 'dashboard',
      chatOpen: false,
      idealSchedule: DEFAULT_SCHEDULE,
      scheduleOrder: DEFAULT_SCHEDULE_ORDER,
      dayTypes: DEFAULT_DAY_TYPES,
      timezone: detectTimezone(),
      autoPurgeCompletedTasks: true,
      recurringSpawnAdvanceHour: 22,
      recurringSpawnAdvanceDayOfWeek: 5,
      notificationPrefs: {
        spiNewSession: true,
        taskDueSoon: true,
        taskOverdue: true,
        habitReminder: false,
        taskDueLeadMinutes: 60,         // 1 hora antes por default
        spiNewSessionLeadMinutes: 0,    // en el momento
        habitReminderHour: 21,          // 21:00 hora local
        habitReminderMinute: 0,
        habitSpecificReminders: true,   // los reminders por-hábito están ON por default
      },
      gcalTasksSync: {
        enabled: false,
        calendarId: '',
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
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setThemeColor: (key, value) => set((s) => ({
        themeColors: { ...s.themeColors, [key]: value },
      })),
      resetThemeColors: () => set({ themeColors: { darkBg: null, lightBg: null, accent: null } }),
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
      setTimezone: (tz) => {
        set({ timezone: tz })
        // Disparar sync a user_settings — el dispatcher de notificaciones
        // lo necesita para matchear horas locales. Antes este setter no
        // sincronizaba y si el user cambiaba TZ desde Settings, el
        // dispatcher seguía con el TZ viejo (o UTC default).
        debouncedSyncSettings()
      },
      setAutoPurgeCompletedTasks: (v) => set({ autoPurgeCompletedTasks: v }),
      setRecurringSpawnAdvance: (dayOfWeek, hour) =>
        set({
          recurringSpawnAdvanceDayOfWeek: ((dayOfWeek % 7) + 7) % 7,
          recurringSpawnAdvanceHour: Math.max(0, Math.min(23, Math.floor(hour))),
        }),
      setGcalTasksSync: (patch) => set((s) => ({
        gcalTasksSync: { ...s.gcalTasksSync, ...patch },
      })),
      setNotificationPref: (key, value) => {
        set((s) => ({
          notificationPrefs: { ...s.notificationPrefs, [key]: value },
        }))
        // Sync best-effort al server para que el dispatcher de notificaciones
        // (que corre del lado server desde un cron job) lea las prefs
        // actualizadas. Falla silenciosamente si no hay sesión Supabase —
        // las prefs locales del cliente ya quedaron persistidas en zustand.
        debouncedSyncSettings()
      },
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
        const theme: ThemeMode = p.theme === 'light' ? 'light' : 'dark'
        const themeColors = p.themeColors && typeof p.themeColors === 'object'
          ? {
              darkBg: p.themeColors.darkBg ?? null,
              lightBg: p.themeColors.lightBg ?? null,
              accent: p.themeColors.accent ?? null,
            }
          : { darkBg: null, lightBg: null, accent: null }
        return {
          ...p,
          idealSchedule: sched, scheduleOrder: order, dayTypes,
          timezone, autoPurgeCompletedTasks, theme, themeColors,
        } as AppState
      },
      version: 5,
    }
  )
)
