'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Surface a Google Calendar failure via the same toast mechanism used by
 *  Supabase sync errors (AppShell listens to this event). Logged-only errors
 *  are too easy to miss — events disappearing is a serious "what just happened"
 *  moment that deserves a visible toast.
 *
 *  Optional `action` adds a clickable button to the toast — used e.g. for
 *  "Reconectar" when the refresh token went bad. */
function reportGcalError(message: string, action?: { label: string; href: string }) {
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('overseer-sync-error', {
        detail: { message, at: Date.now(), action },
      }))
    } catch { /* noop */ }
  }
}

/** Detects the "your Google refresh token is dead" family of errors. Google
 *  invalidates refresh tokens after 6 months of disuse, password changes,
 *  scope revocation, etc. Retrying won't help — the user MUST re-OAuth.
 *  When we see this, mark the store as disconnected so the UI surfaces a
 *  "Conectar" / "Reconectar" CTA. */
function isAuthDead(msg: string): boolean {
  const low = msg.toLowerCase()
  return low.includes('invalid_grant')
      || low.includes('token has been expired or revoked')
      || low.includes('refresh token')
}

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
  /** Cuando es true, este "evento" en realidad es una TASK de Overseer
   *  con dueTime — renderizada como bloque timeado en el calendario
   *  pero no es un evento GCal real. El click en este bloque debe abrir
   *  el TaskDetail, no el modal de evento. `linkedTaskId` apunta a la
   *  task de origen. */
  isTask?: boolean
  linkedTaskId?: string
  /** Cuando el bloque sintético representa a una SUBTAREA con `dueTime`,
   *  además del `linkedTaskId` (que apunta a la tarea madre) seteamos
   *  este id. El click abre el SubtaskDetailModal en lugar del TaskDetail. */
  linkedSubtaskId?: string
  /** True cuando la task (o subtask) linkeada está completada. La UI lo
   *  usa para tacharla en el calendario sin perder presencia visual
   *  hasta que el auto-purge la archive al cierre de la semana. */
  isCompleted?: boolean
  /** Color del STATUS de la task linkeada (To Do / In Progress / Done / etc.).
   *  En el calendario lo usamos para pintar el fondo del bloque, mientras
   *  el borde-izquierdo conserva el color del proyecto — así de un vistazo
   *  ves a qué proyecto pertenece (borde) y en qué estado está (fondo). */
  taskStatusColor?: string
  /** Color del proyecto al que pertenece la task — para colorear el
   *  bloque sin tener que mirar el calendar.bg. */
  projectColor?: string
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

  /** Create an event. `timeZone` (IANA) es requerido por Google para
   *  eventos recurrentes con horario — mandalo siempre desde el cliente.
   *  Si `recurrence` (array of RRULE strings) is included
   *  in `input`, Google creates a recurring series. */
  createEvent: (input: Omit<GEvent, 'id'> & { recurrence?: string[]; timeZone?: string }) => Promise<void>
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
      timeZone?: string
    }
  ) => Promise<void>
  /** Delete an event. Pass `scope='series'` + `recurringEventId` to remove
   *  the entire recurring series (otherwise only this instance is deleted). */
  deleteEvent: (
    id: string,
    calendarId: string,
    opts?: { scope?: 'instance' | 'series'; recurringEventId?: string }
  ) => Promise<void>
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
          // Defensive: if Google returned an EMPTY calendars array but we
          // previously had some, that's a transient glitch — don't wipe.
          // Without this guard, a single bad response could clear visibleIds
          // and cascade into the events store being wiped too.
          const prev = get().calendars
          if (calendars.length === 0 && prev.length > 0) {
            console.warn('[gcal] loadCalendars returned 0 but cache had', prev.length, '— keeping cache')
            reportGcalError('Google Calendar: la lista de calendarios vino vacía. Manteniendo cache.')
            set({ loading: false })
            return
          }
          // Filter stale visibleIds (could be from a previous Google account) to only those that
          // still exist. If none survive, auto-select primary OR first calendar as fallback.
          let visibleIds = get().visibleIds.filter((id) => calendars.some((c) => c.id === id))
          if (visibleIds.length === 0 && calendars.length > 0) {
            const primary = calendars.find((c) => c.primary)
            visibleIds = [primary?.id ?? calendars[0].id]
          }
          set({ calendars, visibleIds, loading: false })
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'unknown'
          console.error('[gcal] loadCalendars failed, keeping cache:', msg)
          if (isAuthDead(msg)) {
            // Refresh token is dead — no point pretending we're connected.
            // Marking disconnected makes the "Conectar" CTA reappear.
            set({ loading: false, error: msg, connected: false })
            reportGcalError(
              'Tu sesión de Google expiró — tocá "Reconectar" para volver a darle permisos. (No perdés ningún dato).',
              { label: 'Reconectar', href: '/api/auth/google' },
            )
          } else {
            reportGcalError(`Google Calendar (calendars): ${msg}`)
            set({ loading: false, error: msg })
          }
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
        const { visibleIds, events: cachedEvents } = get()
        if (visibleIds.length === 0) {
          set({ events: [], lastFetchedAt: Date.now() })
          return
        }
        set({ loading: true, error: null })
        try {
          const r = await fetch(`/api/calendar/events?calendars=${visibleIds.join(',')}`, { cache: 'no-store' })
          const j = await r.json()
          if (!j.ok) {
            // ALL calendars failed (HTTP 502 from our route). Keep the cached
            // events so the user doesn't suddenly see a blank calendar — they
            // can still see what they had until the issue clears.
            const msg = j.error ?? 'fetch_failed'
            console.error('[gcal] loadEvents failed, keeping cache:', msg)
            if (isAuthDead(msg)) {
              set({ loading: false, error: msg, connected: false })
              reportGcalError(
                'Tu sesión de Google expiró — tocá "Reconectar" para volver a darle permisos. (No perdés ningún dato).',
                { label: 'Reconectar', href: '/api/auth/google' },
              )
            } else {
              reportGcalError(`Google Calendar: ${msg}`)
              set({ loading: false, error: msg })
            }
            return
          }
          // Partial failure: some calendars came back but others errored.
          // Keep their events but surface a warning so the user knows.
          if (Array.isArray(j.errors) && j.errors.length > 0) {
            const summary = j.errors.map((e: { calendarId: string; message: string }) => `${e.calendarId}: ${e.message}`).join(' · ')
            console.warn('[gcal] partial fetch errors:', summary)
            reportGcalError(`Google Calendar: ${j.errors.length} calendario(s) fallaron — ${summary}`)
          }
          // Extra safety: if the API returned an EMPTY events array but we
          // previously had events AND there were no errors reported, that's
          // suspicious. Don't wipe — let the next successful fetch resolve it.
          // (This protects against a Google API that returns 200/empty during
          // transient glitches.)
          if ((j.events?.length ?? 0) === 0 && cachedEvents.length > 0 && (!j.errors || j.errors.length === 0)) {
            console.warn('[gcal] API returned 0 events but cache had', cachedEvents.length, '— keeping cache to avoid spurious wipe')
            set({ loading: false, lastFetchedAt: Date.now() })
            return
          }
          set({ events: j.events ?? [], lastFetchedAt: Date.now(), loading: false })
        } catch (e) {
          // Network error, JSON parse error, etc — keep the cache and surface.
          const msg = e instanceof Error ? e.message : 'unknown'
          console.error('[gcal] loadEvents threw, keeping cache:', msg)
          if (isAuthDead(msg)) {
            set({ loading: false, error: msg, connected: false })
            reportGcalError(
              'Tu sesión de Google expiró — tocá "Reconectar" para volver a darle permisos. (No perdés ningún dato).',
              { label: 'Reconectar', href: '/api/auth/google' },
            )
          } else {
            reportGcalError(`Google Calendar: ${msg}`)
            set({ loading: false, error: msg })
          }
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

      deleteEvent: async (id, calendarId, opts) => {
        const qs = new URLSearchParams({ calendarId })
        if (opts?.scope === 'series' && opts.recurringEventId) {
          qs.set('scope', 'series')
          qs.set('recurringEventId', opts.recurringEventId)
        }
        const r = await fetch(`/api/calendar/events/${encodeURIComponent(id)}?${qs.toString()}`, {
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
