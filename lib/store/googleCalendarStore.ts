'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface GCalendar {
  id: string
  summary: string
  summaryOverride?: string | null
  description?: string | null
  backgroundColor?: string | null
  foregroundColor?: string | null
  primary: boolean
  accessRole?: string | null
  timeZone?: string | null
}

export interface GEvent {
  id: string
  calendarId: string
  summary: string
  description?: string
  location?: string
  start: string  // ISO
  end: string
  allDay: boolean
  htmlLink?: string
  colorId?: string  // 1..11 per-event override (Google Calendar palette)
  /** Set when this event is an INSTANCE of a recurring series. Holds the
   *  id of the master recurring event (without the date suffix). Used by
   *  the UI to offer "this event only" vs "all events in the series"
   *  when editing/moving a recurring instance. */
  recurringEventId?: string
}

// Standard Google Calendar event color palette (matches the colors users see in calendar.google.com)
export const GCAL_EVENT_COLORS: Record<string, { bg: string; fg: string; name: string }> = {
  '1':  { bg: '#7986cb', fg: '#ffffff', name: 'Lavender' },
  '2':  { bg: '#33b679', fg: '#ffffff', name: 'Sage' },
  '3':  { bg: '#8e24aa', fg: '#ffffff', name: 'Grape' },
  '4':  { bg: '#e67c73', fg: '#ffffff', name: 'Flamingo' },
  '5':  { bg: '#f6bf26', fg: '#1f1f1f', name: 'Banana' },
  '6':  { bg: '#f4511e', fg: '#ffffff', name: 'Tangerine' },
  '7':  { bg: '#039be5', fg: '#ffffff', name: 'Peacock' },
  '8':  { bg: '#616161', fg: '#ffffff', name: 'Graphite' },
  '9':  { bg: '#3f51b5', fg: '#ffffff', name: 'Blueberry' },
  '10': { bg: '#0b8043', fg: '#ffffff', name: 'Basil' },
  '11': { bg: '#d50000', fg: '#ffffff', name: 'Tomato' },
}

/** Resolves the display color for an event: per-event colorId override → calendar default → fallback */
export function resolveEventColor(event: GEvent, calendarBg?: string | null): string {
  if (event.colorId && GCAL_EVENT_COLORS[event.colorId]) {
    return GCAL_EVENT_COLORS[event.colorId].bg
  }
  return calendarBg ?? '#6366f1'
}

/** Computes contrasting foreground color (white or near-black) for a given hex background. */
export function contrastText(hex: string): string {
  const h = hex.replace('#', '')
  if (h.length !== 6 && h.length !== 3) return '#ffffff'
  const full = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  // Relative luminance per WCAG (simplified)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#1f1f1f' : '#ffffff'
}

interface State {
  connected: boolean
  calendars: GCalendar[]
  visibleIds: string[]          // which calendars are toggled ON
  events: GEvent[]
  lastFetchedAt: number | null
  loading: boolean
  error: string | null

  // Selected view (persisted across navigation)
  view: 'month' | 'week'
  setView: (v: 'month' | 'week') => void

  // Right side rail visibility (persisted)
  showSideRail: boolean
  setShowSideRail: (v: boolean) => void

  // Night-hours preference (week view only)
  hideNight: boolean
  hideStart: number             // 0-23 inclusive
  hideEnd: number               // 0-23 exclusive
  setHideNight: (v: boolean) => void
  setHideRange: (start: number, end: number) => void

  setConnected: (v: boolean) => void
  refreshStatus: () => Promise<void>
  loadCalendars: () => Promise<void>
  toggleVisible: (id: string) => void
  setAllVisible: (visible: boolean) => void
  loadEvents: () => Promise<void>
  disconnect: () => Promise<void>

  createEvent: (input: Omit<GEvent, 'id'>) => Promise<void>
  /** Patch a Google Calendar event.
   *  - For one-off events, omit `applyToSeries`.
   *  - For RECURRING instances, set `applyToSeries: true` AND pass the
   *    master id in `recurringEventId` to propagate the change to all
   *    occurrences. The API computes the delta automatically. */
  updateEvent: (
    id: string,
    calendarId: string,
    patch: Partial<Omit<GEvent, 'id' | 'calendarId'>> & {
      applyToSeries?: boolean
      recurringEventId?: string
    }
  ) => Promise<void>
  deleteEvent: (id: string, calendarId: string) => Promise<void>
}

export const useGoogleCalendarStore = create<State>()(
  persist(
    (set, get) => ({
      connected: false,
      calendars: [],
      visibleIds: [],
      events: [],
      lastFetchedAt: null,
      loading: false,
      error: null,

      view: 'month',
      setView: (v) => set({ view: v }),

      showSideRail: true,
      setShowSideRail: (v) => set({ showSideRail: v }),

      hideNight: false,
      hideStart: 0,
      hideEnd: 7,
      setHideNight: (v) => set({ hideNight: v }),
      setHideRange: (start, end) => set({
        hideStart: Math.max(0, Math.min(23, Math.round(start))),
        hideEnd:   Math.max(0, Math.min(24, Math.round(end))),
      }),

      setConnected: (v) => set({ connected: v }),

      refreshStatus: async () => {
        try {
          const r = await fetch('/api/auth/google/status', { cache: 'no-store' })
          const j = await r.json()
          set({ connected: !!j.connected })
        } catch {
          set({ connected: false })
        }
      },

      loadCalendars: async () => {
        set({ loading: true, error: null })
        try {
          const r = await fetch('/api/calendar/list', { cache: 'no-store' })
          const j = await r.json()
          if (!j.ok) throw new Error(j.error ?? 'load_failed')
          const calendars: GCalendar[] = j.calendars ?? []
          // Filter stale visibleIds (could be from a previous Google account) to only those that
          // still exist. If none survive, auto-select primary OR first calendar as fallback.
          let visibleIds = get().visibleIds.filter((id) => calendars.some((c) => c.id === id))
          if (visibleIds.length === 0 && calendars.length > 0) {
            const primary = calendars.find((c) => c.primary)
            visibleIds = [primary?.id ?? calendars[0].id]
          }
          set({ calendars, visibleIds, loading: false })
        } catch (e) {
          set({ loading: false, error: e instanceof Error ? e.message : 'unknown' })
        }
      },

      toggleVisible: (id) => set((s) => ({
        visibleIds: s.visibleIds.includes(id)
          ? s.visibleIds.filter((x) => x !== id)
          : [...s.visibleIds, id],
      })),

      setAllVisible: (visible) => set((s) => ({
        visibleIds: visible ? s.calendars.map((c) => c.id) : [],
      })),

      loadEvents: async () => {
        const { visibleIds } = get()
        if (visibleIds.length === 0) {
          set({ events: [], lastFetchedAt: Date.now() })
          return
        }
        set({ loading: true, error: null })
        try {
          const r = await fetch(`/api/calendar/events?calendars=${visibleIds.join(',')}`, { cache: 'no-store' })
          const j = await r.json()
          if (!j.ok) throw new Error(j.error ?? 'fetch_failed')
          set({ events: j.events, lastFetchedAt: Date.now(), loading: false })
        } catch (e) {
          set({ loading: false, error: e instanceof Error ? e.message : 'unknown' })
        }
      },

      disconnect: async () => {
        await fetch('/api/auth/google/disconnect', { method: 'POST' })
        set({ connected: false, calendars: [], visibleIds: [], events: [] })
      },

      createEvent: async (input) => {
        const r = await fetch('/api/calendar/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
        const j = await r.json()
        if (!j.ok) throw new Error(j.error ?? 'create_failed')
        await get().loadEvents()
      },

      updateEvent: async (id, calendarId, patch) => {
        const r = await fetch(`/api/calendar/events/${encodeURIComponent(id)}?calendarId=${encodeURIComponent(calendarId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        const j = await r.json()
        if (!j.ok) throw new Error(j.error ?? 'update_failed')
        await get().loadEvents()
      },

      deleteEvent: async (id, calendarId) => {
        const r = await fetch(`/api/calendar/events/${encodeURIComponent(id)}?calendarId=${encodeURIComponent(calendarId)}`, {
          method: 'DELETE',
        })
        const j = await r.json()
        if (!j.ok) throw new Error(j.error ?? 'delete_failed')
        await get().loadEvents()
      },
    }),
    {
      name: 'overseer-gcal',
      // Persist events too so the calendar paints instantly on next load.
      // We refresh in the background to keep data fresh (stale-while-revalidate).
      partialize: (s) => ({
        connected: s.connected,
        calendars: s.calendars,
        visibleIds: s.visibleIds,
        events: s.events,
        lastFetchedAt: s.lastFetchedAt,
        view: s.view,
        showSideRail: s.showSideRail,
        hideNight: s.hideNight,
        hideStart: s.hideStart,
        hideEnd: s.hideEnd,
      }),
    }
  )
)
