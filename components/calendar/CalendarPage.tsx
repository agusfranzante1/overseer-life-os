'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/hooks/useTranslation'
import { useTasksStore } from '@/lib/store/tasksStore'
import { TaskDetail } from '@/components/tasks/TaskDetail'
import { expandRecurrenceInRange } from '@/lib/utils/taskRecurrence'
import { useGoogleCalendarStore, resolveEventColor, contrastText, type GEvent, type GCalendar } from '@/lib/store/googleCalendarStore'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, isSameDay,
  addMonths, subMonths, addWeeks, subWeeks, addDays,
  differenceInMinutes, parseISO, max as maxDate, min as minDate,
} from 'date-fns'
import {
  ChevronLeft, ChevronRight, Calendar, Plus, RefreshCw, Trash2, X,
  Link as LinkIcon, Eye, EyeOff, LogOut, ExternalLink, AlertCircle,
  LayoutGrid, Rows, Moon, Sun, Settings as SettingsIcon,
  PanelRightOpen, PanelRightClose,
} from 'lucide-react'

type ViewMode = 'month' | 'week'

export function CalendarPage() {
  const { t } = useTranslation()
  const { tasks, projects, updateTask } = useTasksStore()
  // Selección de task para abrir el detalle al click en un bloque sintético.
  const [selectedTask, setSelectedTask] = useState<import('@/types').Task | null>(null)
  const gcal = useGoogleCalendarStore()

  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date())
  const view: ViewMode = gcal.view
  const setView = (v: ViewMode) => gcal.setView(v)
  const [showEventModal, setShowEventModal] = useState<{ mode: 'create' | 'edit'; event?: GEvent; date?: Date; startHour?: number } | null>(null)
  const [banner, setBanner] = useState<{ kind: 'success' | 'error' | 'loading'; text: string } | null>(null)
  /** Auto-dismiss success/error banners after a few seconds so they don't
   *  linger forever. Loading banners stay until they're replaced. */
  useEffect(() => {
    if (!banner) return
    if (banner.kind === 'loading') return
    const id = setTimeout(() => setBanner(null), banner.kind === 'success' ? 2500 : 5000)
    return () => clearTimeout(id)
  }, [banner])
  const [mounted, setMounted] = useState(false)
  // When the user drag-drops a RECURRING event, we ask "this only" vs
  // "all in series" via this dialog before firing the API.
  const [moveScopePrompt, setMoveScopePrompt] = useState<{
    ev: GEvent; newStart: string; newEnd: string
  } | null>(null)

  // Same idea but for DELETE — when deleting a recurring instance we ask
  // whether to delete just this occurrence or the whole series.
  const [deleteScopePrompt, setDeleteScopePrompt] = useState<{ ev: GEvent } | null>(null)

  const goPrev = () => setCurrentDate(view === 'month' ? subMonths(currentDate, 1) : subWeeks(currentDate, 1))
  const goNext = () => setCurrentDate(view === 'month' ? addMonths(currentDate, 1) : addWeeks(currentDate, 1))

  // Read URL params for OAuth callback feedback
  useEffect(() => {
    setMounted(true)
    const params = new URLSearchParams(window.location.search)
    if (params.get('google_connected') === '1') {
      setBanner({ kind: 'success', text: 'Google Calendar conectado ✓' })
      // Clean URL
      window.history.replaceState({}, '', '/calendar')
    } else if (params.get('google_error')) {
      setBanner({ kind: 'error', text: `Error al conectar: ${params.get('google_error')}` })
      window.history.replaceState({}, '', '/calendar')
    }
  }, [])

  // Initial load — STALE-WHILE-REVALIDATE strategy.
  // If we have cached events from a previous session (lastFetchedAt set),
  // the calendar renders them INSTANTLY from localStorage. Then in parallel
  // we refresh status + reload calendars + events in the background, so
  // changes from other devices arrive seconds later without blocking the UI.
  // Skip the background refresh entirely if the cache is "fresh enough"
  // (under 60s old) to avoid hammering the API when switching tabs rapidly.
  useEffect(() => {
    if (!mounted) return
    const FRESH_THRESHOLD_MS = 60_000
    const ageMs = gcal.lastFetchedAt ? Date.now() - gcal.lastFetchedAt : Infinity
    if (ageMs < FRESH_THRESHOLD_MS) {
      // Cache is fresh — don't even hit the network on mount.
      return
    }
    ;(async () => {
      await gcal.refreshStatus()
      if (useGoogleCalendarStore.getState().connected) {
        // Parallel — calendars rarely change, events change more often.
        // Both update the store as they finish so the UI re-renders piece
        // by piece. The user sees their cached events the whole time.
        await Promise.all([gcal.loadCalendars(), gcal.loadEvents()])
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  // Re-load events when visibility toggles change. This one we want to be
  // somewhat fast because the user just clicked a toggle and expects feedback.
  useEffect(() => {
    if (!mounted || !gcal.connected) return
    gcal.loadEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gcal.visibleIds.join(',')])

  // Build month grid
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const eventsByDay = useMemo(() => {
    // Incluye eventos GCal reales + bloques sintéticos de tasks-with-time.
    // Lo merge se hace acá mismo en lugar de depender de `mergedEvents`
    // (que aplica solo a la vista WeekView) — el mes usa este index.
    const map = new Map<string, GEvent[]>()
    // 1) Eventos GCal — exceptuando los linkeados a una task (para no
    //    renderear dos veces el mismo bloque).
    const linkedIds = new Set<string>()
    for (const t of Object.values(tasks)) {
      if (t.gcalEventId) linkedIds.add(t.gcalEventId)
    }
    for (const ev of gcal.events) {
      if (linkedIds.has(ev.id)) continue
      const dateKey = ev.start.slice(0, 10)
      if (!map.has(dateKey)) map.set(dateKey, [])
      map.get(dateKey)!.push(ev)
    }
    // 2) Tasks con hora → bloque sintético al día correspondiente.
    for (const t of Object.values(tasks)) {
      if (t.archivedAt || t.completedAt) continue
      if (!t.dueDate || !t.dueTime) continue
      const [y, m, d] = t.dueDate.split('-').map(Number)
      const [hh, mm] = t.dueTime.split(':').map(Number)
      const start = new Date(y, m - 1, d, hh, mm, 0)
      const duration = t.durationMinutes ?? 60
      const end = new Date(start.getTime() + duration * 60_000)
      const project = projects[t.projectId]
      const ev: GEvent = {
        id: `task:${t.id}`,
        calendarId: '__overseer_tasks__',
        summary: t.title,
        description: t.description ?? undefined,
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: false,
        isTask: true,
        linkedTaskId: t.id,
        projectColor: project?.color,
      }
      if (!map.has(t.dueDate)) map.set(t.dueDate, [])
      map.get(t.dueDate)!.push(ev)
    }
    return map
  }, [gcal.events, tasks, projects])

  const calendarById = useMemo(() => {
    const map = new Map<string, GCalendar>()
    for (const c of gcal.calendars) map.set(c.id, c)
    return map
  }, [gcal.calendars])

  // ── Tasks-as-events ────────────────────────────────────────────────
  // Las tareas con dueDate + dueTime se renderean como bloques timeados
  // en el calendario. Construimos `syntheticTaskEvents` con shape GEvent
  // para reusar todo el render pipeline. Y filtramos del array de
  // GCal.events los que ya están linkeados a una task — así no se ven
  // dos veces (el evento sincronizado en Google + el bloque de la task).
  const mergedEvents = useMemo(() => {
    const linkedGcalIds = new Set<string>()
    const syntheticEvents: GEvent[] = []
    for (const t of Object.values(tasks)) {
      if (t.archivedAt || t.completedAt) continue
      if (!t.dueDate || !t.dueTime) continue
      // Marcamos el GCal event como "ya cubierto por la task" para
      // evitar duplicar en el render.
      if (t.gcalEventId) linkedGcalIds.add(t.gcalEventId)
      const [y, m, d] = t.dueDate.split('-').map(Number)
      const [hh, mm] = t.dueTime.split(':').map(Number)
      const start = new Date(y, m - 1, d, hh, mm, 0)
      const duration = t.durationMinutes ?? 60
      const end = new Date(start.getTime() + duration * 60_000)
      const project = projects[t.projectId]
      // Construimos como GEvent sintético, con `isTask` + `linkedTaskId`
      // para que el WeekView/MonthView sepa que el click abre TaskDetail.
      syntheticEvents.push({
        id: `task:${t.id}`,
        calendarId: '__overseer_tasks__',
        summary: t.title,
        description: t.description ?? undefined,
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: false,
        isTask: true,
        linkedTaskId: t.id,
        projectColor: project?.color,
      })
    }
    // Filtrar duplicados: los eventos GCal cuyo id está en linkedGcalIds
    // se reemplazan por el bloque sintético de la task (más rico, lleva
    // el color del proyecto y al click abre TaskDetail).
    const filteredGcal = gcal.events.filter((ev) => !linkedGcalIds.has(ev.id))
    return [...filteredGcal, ...syntheticEvents]
  }, [tasks, projects, gcal.events])

  // Una tarea aparece en un día si:
  //   - Tiene `dueDate === ese día`, O
  //   - Tiene `recurrence` y la serie pega en ese día (la instancia
  //     materializada — que se crea al completar — todavía no existe,
  //     pero el calendario igual la previsualiza).
  const getTasksForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return Object.values(tasks).filter((t) => {
      if (!t.dueDate) return false
      if (t.dueDate === dateStr) return true
      if (!t.recurrence) return false
      // Expandimos solo hacia adelante (dueDate < dateStr) — las
      // instancias ya completadas se materializan como tareas reales
      // con su propio dueDate, así que no necesitamos buscar hacia
      // atrás. Cortamos en el día actual para no explotar.
      if (t.dueDate >= dateStr) return false
      const occurrences = expandRecurrenceInRange(t.dueDate, t.recurrence, dateStr, dateStr)
      return occurrences.length > 0
    })
  }

  const selectedDayTasks = selectedDay ? getTasksForDay(selectedDay) : []
  const selectedDayEvents = selectedDay
    ? (eventsByDay.get(format(selectedDay, 'yyyy-MM-dd')) ?? [])
    : []

  const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  const connectGoogle = () => {
    window.location.href = '/api/auth/google'
  }

  const disconnectGoogle = async () => {
    if (!confirm('¿Desconectar Google Calendar? Tus eventos seguirán en Google, sólo se desconecta acá.')) return
    await gcal.disconnect()
    setBanner({ kind: 'success', text: 'Desconectado de Google Calendar' })
  }

  return (
    // `h-full flex flex-col min-h-0`: the page fills the entire available
    // height of the AppShell main area and uses a vertical flex layout so
    // we can size the grid below as `flex-1`. Without this, the calendar
    // grid had to hard-code `calc(100vh - 160px)` which left a black band
    // at the bottom on routes where the ChatBox doesn't render.
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="p-3 sm:p-4 h-full flex flex-col min-h-0"
    >
      {/* Header — stacks vertically on mobile so the action row gets full
          width instead of squeezing next to the title. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">{t('calendar.title')}</h1>
          <p className="text-zinc-500 text-sm">
            {view === 'month'
              ? format(currentDate, 'MMMM yyyy')
              : (() => {
                  const ws = startOfWeek(currentDate, { weekStartsOn: 1 })
                  const we = endOfWeek(currentDate, { weekStartsOn: 1 })
                  return `${format(ws, 'd MMM')} – ${format(we, 'd MMM yyyy')}`
                })()}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
            <button onClick={() => setView('month')}
              title="Vista mensual"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                view === 'month'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}>
              <LayoutGrid className="w-3.5 h-3.5" /> Mes
            </button>
            <button onClick={() => setView('week')}
              title="Vista semanal"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                view === 'week'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}>
              <Rows className="w-3.5 h-3.5" /> Semana
            </button>
          </div>

          {/* Night-hide pill (week view only) */}
          {view === 'week' && (
            <NightHidePill
              enabled={gcal.hideNight}
              start={gcal.hideStart}
              end={gcal.hideEnd}
              onToggle={() => gcal.setHideNight(!gcal.hideNight)}
              onRangeChange={(s, e) => gcal.setHideRange(s, e)}
            />
          )}

          {gcal.connected && (
            <button
              onClick={async () => {
                // Force-reload both calendars AND events. If the user is here
                // because events vanished, this is the manual "try again now"
                // button. Reload calendars first so visibleIds gets refreshed
                // against the actual remote list.
                await gcal.loadCalendars()
                await gcal.loadEvents()
              }}
              title="Refrescar calendarios y eventos"
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors">
              <RefreshCw className={`w-4 h-4 ${gcal.loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button onClick={() => gcal.setShowSideRail(!gcal.showSideRail)}
            title={gcal.showSideRail ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors">
            {gcal.showSideRail
              ? <PanelRightClose className="w-4 h-4" />
              : <PanelRightOpen className="w-4 h-4" />}
          </button>
          <button onClick={goPrev}
            className="text-zinc-400 hover:text-zinc-100 transition-colors p-2 hover:bg-zinc-800 rounded-lg">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setCurrentDate(new Date())}
            className="text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded-lg transition-colors">
            {t('calendar.today')}
          </button>
          <button onClick={goNext}
            className="text-zinc-400 hover:text-zinc-100 transition-colors p-2 hover:bg-zinc-800 rounded-lg">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Banner — success / error / loading. Loading shows a spinner and
          stays until replaced (no auto-dismiss, no close button). */}
      <AnimatePresence>
        {banner && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border ${
              banner.kind === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : banner.kind === 'error'
                  ? 'bg-red-500/10 border-red-500/30 text-red-300'
                  : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
            }`}
          >
            {banner.kind === 'loading' ? (
              <span className="w-4 h-4 rounded-full border-2 border-indigo-300/30 border-t-indigo-300 animate-spin" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            <span className="text-sm">{banner.text}</span>
            {banner.kind !== 'loading' && (
              <button onClick={() => setBanner(null)} className="ml-auto opacity-50 hover:opacity-100">
                <X className="w-4 h-4" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`grid grid-cols-1 gap-6 flex-1 min-h-0 ${gcal.showSideRail ? 'xl:grid-cols-[1fr_300px]' : ''}`}>
        {/* Calendar grid (month OR week) */}
        {view === 'month' ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden h-full flex flex-col min-h-0">
            <div className="grid grid-cols-7 border-b border-zinc-800">
              {weekDays.map((day) => (
                <div key={day} className="py-3 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map((day, i) => {
                const isCurrentMonth = isSameMonth(day, currentDate)
                // Days that fall outside the current month (leading/trailing
                // padding to align the grid to Monday) render as completely
                // BLANK cells — no number, no events, no hover. This avoids
                // "today" appearing in two different months when navigating
                // forward/back and the same calendar week spans both.
                if (!isCurrentMonth) {
                  return (
                    <div
                      key={i}
                      className="p-2 min-h-[90px] border-b border-r border-zinc-800 bg-zinc-950/40"
                      aria-hidden="true"
                    />
                  )
                }
                const dayTasks = getTasksForDay(day)
                const dayEvents = eventsByDay.get(format(day, 'yyyy-MM-dd')) ?? []
                const isSelected = selectedDay && isSameDay(day, selectedDay)
                const isCurrentDay = isToday(day)
                const totalItems = dayTasks.length + dayEvents.length

                return (
                  <motion.button
                    key={i}
                    whileHover={{ scale: 0.98 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setSelectedDay(day)}
                    className={`relative p-2 min-h-[90px] text-left border-b border-r border-zinc-800 transition-colors ${
                      isSelected ? 'bg-indigo-600/10' : 'hover:bg-zinc-800/50'
                    }`}
                  >
                    <span className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-medium mb-1 ${
                      isCurrentDay ? 'bg-indigo-600 text-white' :
                      isSelected ? 'bg-zinc-700 text-white' : 'text-zinc-400'
                    }`}>
                      {format(day, 'd')}
                    </span>

                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 2).map((ev) => {
                        const cal = calendarById.get(ev.calendarId)
                        const color = resolveEventColor(ev, cal?.backgroundColor)
                        const fg = contrastText(color)
                        return (
                          <div key={ev.id}
                            className="text-[10px] px-1.5 py-0.5 rounded truncate flex items-center gap-1 font-medium"
                            style={{ backgroundColor: color, color: fg }}
                            title={ev.summary}
                          >
                            {!ev.allDay && <span className="font-mono opacity-80 text-[9px]">{format(parseISO(ev.start), 'HH:mm')}</span>}
                            <span className="truncate">{ev.summary}</span>
                          </div>
                        )
                      })}
                      {dayTasks.slice(0, Math.max(0, 2 - dayEvents.length)).map((task) => {
                        const proj = projects[task.projectId]
                        return (
                          <div key={task.id}
                            className="text-[10px] px-1 py-0.5 rounded truncate border-l-2"
                            style={{
                              backgroundColor: (proj?.color ?? '#6366f1') + '15',
                              color: proj?.color ?? '#6366f1',
                              borderLeftColor: proj?.color ?? '#6366f1',
                            }}>
                            {task.title}
                          </div>
                        )
                      })}
                      {totalItems > 2 && (
                        <div className="text-[10px] text-zinc-600">+{totalItems - 2} más</div>
                      )}
                    </div>
                  </motion.button>
                )
              })}
            </div>
          </div>
        ) : (
          <WeekView
            anchor={currentDate}
            events={mergedEvents}
            tasks={Object.values(tasks)}
            projects={projects}
            calendarById={calendarById}
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
            hideNight={gcal.hideNight}
            hideStart={gcal.hideStart}
            hideEnd={gcal.hideEnd}
            onEventClick={(ev) => {
              // Click sobre un bloque sintético de task → abrir TaskDetail
              // en lugar del modal de evento GCal.
              if (ev.isTask && ev.linkedTaskId) {
                const task = tasks[ev.linkedTaskId]
                if (task) setSelectedTask(task)
                return
              }
              setShowEventModal({ mode: 'edit', event: ev })
            }}
            onCreateAt={(date, hour) => setShowEventModal({ mode: 'create', date, startHour: hour })}
            onEventMove={async (ev, newStart, newEnd) => {
              // Mover un bloque de task → actualizar dueDate + dueTime
              // + durationMinutes de la task. El sync GCal corre solo.
              if (ev.isTask && ev.linkedTaskId) {
                const task = tasks[ev.linkedTaskId]
                if (!task) return
                const startD = new Date(newStart)
                const endD = new Date(newEnd)
                const dueDate = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}-${String(startD.getDate()).padStart(2, '0')}`
                const dueTime = `${String(startD.getHours()).padStart(2, '0')}:${String(startD.getMinutes()).padStart(2, '0')}`
                const durationMinutes = Math.max(5, Math.round((endD.getTime() - startD.getTime()) / 60_000))
                updateTask(ev.linkedTaskId, { dueDate, dueTime, durationMinutes })
                return
              }
              if (ev.recurringEventId) {
                // Recurring → ask which scope before firing the API.
                setMoveScopePrompt({ ev, newStart, newEnd })
                return
              }
              // One-off → patch directly.
              try {
                await gcal.updateEvent(ev.id, ev.calendarId, { start: newStart, end: newEnd })
              } catch (e) {
                setBanner({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo mover' })
              }
            }}
          />
        )}

        {/* Sidebar */}
        {gcal.showSideRail && (
        <div className="space-y-4">
          {/* Selected day */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-zinc-200">
                  {selectedDay ? format(selectedDay, 'EEEE d MMM') : 'Elegí un día'}
                </h3>
              </div>
              {gcal.connected && selectedDay && (
                <button
                  onClick={() => setShowEventModal({ mode: 'create', date: selectedDay })}
                  title="Nuevo evento"
                  className="p-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/25 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Events */}
            {selectedDayEvents.length > 0 && (
              <div className="space-y-1.5 mb-3">
                <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Eventos</p>
                {selectedDayEvents.map((ev) => {
                  const cal = calendarById.get(ev.calendarId)
                  const color = resolveEventColor(ev, cal?.backgroundColor)
                  const fg = contrastText(color)
                  return (
                    <button key={ev.id} onClick={() => setShowEventModal({ mode: 'edit', event: ev })}
                      className="w-full flex items-start gap-2 p-2 rounded-lg hover:brightness-110 transition-all text-left"
                      style={{ background: color, color: fg }}>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate">{ev.summary}</p>
                        <p className="text-[10px] font-mono opacity-80">
                          {ev.allDay ? 'Todo el día' : `${format(parseISO(ev.start), 'HH:mm')} – ${format(parseISO(ev.end), 'HH:mm')}`}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Tasks */}
            {selectedDayTasks.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Tareas</p>
                {selectedDayTasks.map((task) => {
                  const proj = projects[task.projectId]
                  return (
                    <div key={task.id} className="flex items-start gap-2 p-2 rounded-lg bg-zinc-800/50">
                      <div className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ backgroundColor: proj?.color ?? '#6366f1' }} />
                      <div className="min-w-0">
                        <p className="text-xs text-zinc-200 truncate">{task.title}</p>
                        {proj && <p className="text-[10px] text-zinc-500">{proj.name}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {selectedDayEvents.length === 0 && selectedDayTasks.length === 0 && (
              <p className="text-xs text-zinc-600 text-center py-4">Sin eventos ni tareas</p>
            )}
          </div>

          {/* Google Calendar panel */}
          {!gcal.connected ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-zinc-200 mb-2 flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-indigo-400" /> Conectar Google Calendar
              </h3>
              <p className="text-xs text-zinc-500 mb-3">
                Vas a poder ver y editar todos tus calendarios desde acá. Los eventos creados en Overseer se guardan en Google; las tareas de Overseer NO se suben.
              </p>
              <button onClick={connectGoogle}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800 rounded-lg text-sm text-zinc-200 transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Conectar
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-400" /> Mis calendarios
                </h3>
                <button onClick={disconnectGoogle} title="Desconectar"
                  className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10">
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>

              {gcal.calendars.length > 0 && (
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                    {gcal.visibleIds.length} / {gcal.calendars.length} visibles
                  </p>
                  <div className="flex gap-1">
                    <button onClick={() => gcal.setAllVisible(true)}
                      className="text-[10px] text-zinc-500 hover:text-zinc-200 px-1.5 py-0.5 rounded hover:bg-zinc-800">Todos</button>
                    <button onClick={() => gcal.setAllVisible(false)}
                      className="text-[10px] text-zinc-500 hover:text-zinc-200 px-1.5 py-0.5 rounded hover:bg-zinc-800">Ninguno</button>
                  </div>
                </div>
              )}

              <div className="space-y-1 max-h-[260px] overflow-y-auto">
                {gcal.calendars.map((cal) => {
                  const visible = gcal.visibleIds.includes(cal.id)
                  return (
                    <button key={cal.id} onClick={() => gcal.toggleVisible(cal.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-800/60 transition-colors text-left">
                      <span className="w-3 h-3 rounded shrink-0 border" style={{
                        background: visible ? (cal.backgroundColor ?? '#6366f1') : 'transparent',
                        borderColor: cal.backgroundColor ?? '#6366f1',
                      }} />
                      <span className={`flex-1 text-xs truncate ${visible ? 'text-zinc-200' : 'text-zinc-500'}`}>
                        {cal.summaryOverride || cal.summary}
                        {cal.primary && <span className="text-[9px] ml-1 text-emerald-400 font-mono">PRIMARY</span>}
                      </span>
                      {visible ? <Eye className="w-3 h-3 text-zinc-500" /> : <EyeOff className="w-3 h-3 text-zinc-700" />}
                    </button>
                  )
                })}
                {gcal.calendars.length === 0 && (
                  <p className="text-xs text-zinc-600 text-center py-4">Cargando calendarios…</p>
                )}
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Event modal — close immediately on save/delete, surface status
          through the banner above so the user gets feedback while the
          Google API call is in flight. */}
      <AnimatePresence>
        {showEventModal && (
          <EventModal
            mode={showEventModal.mode}
            event={showEventModal.event}
            date={showEventModal.date}
            startHour={showEventModal.startHour}
            calendars={gcal.calendars}
            onClose={() => setShowEventModal(null)}
            onSave={(data) => {
              const isCreate = showEventModal.mode === 'create'
              if (isCreate) {
                setShowEventModal(null)
                setBanner({
                  kind: 'loading',
                  text: data.recurrence && data.recurrence.length > 0
                    ? `Creando serie "${data.summary}"…`
                    : `Creando "${data.summary}"…`,
                })
                gcal.createEvent(data)
                  .then(() => setBanner({ kind: 'success', text: 'Evento creado ✓' }))
                  .catch((e) => {
                    // Log a consola además del banner — si el usuario no
                    // ve el toast por algún motivo, al menos queda en
                    // devtools. Antes los errores recurrentes pasaban
                    // desapercibidos y se perdían silenciosamente.
                    const msg = e instanceof Error ? e.message : 'unknown'
                    console.error('[calendar] createEvent failed:', msg, data)
                    setBanner({ kind: 'error', text: `No se pudo crear "${data.summary}": ${msg}` })
                  })
                return
              }
              if (showEventModal.event) {
                const ev = showEventModal.event
                // For recurring events, route through the scope prompt
                // so the user explicitly picks "this only" vs "series".
                if (ev.recurringEventId) {
                  setShowEventModal(null)
                  setMoveScopePrompt({ ev, newStart: data.start, newEnd: data.end })
                  return
                }
                setShowEventModal(null)
                setBanner({ kind: 'loading', text: `Guardando "${data.summary}"…` })
                gcal.updateEvent(ev.id, ev.calendarId, data)
                  .then(() => setBanner({ kind: 'success', text: 'Evento actualizado ✓' }))
                  .catch((e) => setBanner({ kind: 'error', text: `Error: ${e instanceof Error ? e.message : 'unknown'}` }))
              }
            }}
            onDelete={() => {
              if (!showEventModal.event) return
              const ev = showEventModal.event
              // Recurring → route to the scope prompt instead of confirm().
              if (ev.recurringEventId) {
                setShowEventModal(null)
                setDeleteScopePrompt({ ev })
                return
              }
              if (!confirm(`¿Eliminar "${ev.summary}"?`)) return
              setShowEventModal(null)
              setBanner({ kind: 'loading', text: `Eliminando "${ev.summary}"…` })
              gcal.deleteEvent(ev.id, ev.calendarId)
                .then(() => setBanner({ kind: 'success', text: 'Evento eliminado ✓' }))
                .catch((e) => setBanner({ kind: 'error', text: `Error: ${e instanceof Error ? e.message : 'unknown'}` }))
            }}
          />
        )}
      </AnimatePresence>

      {/* Recurring DELETE-scope prompt — "this event or whole series?" */}
      <AnimatePresence>
        {deleteScopePrompt && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setDeleteScopePrompt(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-zinc-900 border border-red-500/30 rounded-2xl shadow-2xl p-5"
            >
              <h3 className="text-sm font-bold text-white mb-1">
                Eliminar &quot;{deleteScopePrompt.ev.summary}&quot;
              </h3>
              <p className="text-xs text-zinc-500 mb-4">
                Este evento es recurrente. ¿Qué querés eliminar?
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    const ev = deleteScopePrompt.ev
                    setDeleteScopePrompt(null)
                    setBanner({ kind: 'loading', text: `Eliminando este evento…` })
                    gcal.deleteEvent(ev.id, ev.calendarId)
                      .then(() => setBanner({ kind: 'success', text: 'Evento eliminado ✓' }))
                      .catch((e) => setBanner({ kind: 'error', text: e instanceof Error ? e.message : 'Falló' }))
                  }}
                  className="w-full text-left px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-200 transition-colors"
                >
                  📌 Solo este evento
                  <p className="text-[10px] text-zinc-500 mt-0.5">Crea una excepción. Los demás de la serie no se tocan.</p>
                </button>
                <button
                  onClick={() => {
                    const ev = deleteScopePrompt.ev
                    setDeleteScopePrompt(null)
                    setBanner({ kind: 'loading', text: `Eliminando toda la serie…` })
                    gcal.deleteEvent(ev.id, ev.calendarId, { scope: 'series', recurringEventId: ev.recurringEventId })
                      .then(() => setBanner({ kind: 'success', text: 'Serie eliminada ✓' }))
                      .catch((e) => setBanner({ kind: 'error', text: e instanceof Error ? e.message : 'Falló' }))
                  }}
                  className="w-full text-left px-3 py-2.5 bg-red-500/15 border border-red-500/40 hover:bg-red-500/25 rounded-lg text-sm text-red-300 transition-colors"
                >
                  🔁 Toda la serie
                  <p className="text-[10px] text-red-400/70 mt-0.5">Borra todos los eventos pasados y futuros de la serie.</p>
                </button>
                <button
                  onClick={() => setDeleteScopePrompt(null)}
                  className="w-full px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recurring move-scope prompt — appears when the user drag-drops
          an event that's an instance of a recurring series. Mirrors
          Google Calendar's "this event / all events" choice. */}
      <AnimatePresence>
        {moveScopePrompt && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMoveScopePrompt(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-5"
            >
              <h3 className="text-sm font-bold text-white mb-1">
                Mover "{moveScopePrompt.ev.summary}"
              </h3>
              <p className="text-xs text-zinc-500 mb-4">
                Este es un evento recurrente. ¿Querés cambiar solo esta instancia o toda la serie?
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    const { ev, newStart, newEnd } = moveScopePrompt
                    setMoveScopePrompt(null)
                    setBanner({ kind: 'loading', text: `Moviendo este evento…` })
                    gcal.updateEvent(ev.id, ev.calendarId, { start: newStart, end: newEnd })
                      .then(() => setBanner({ kind: 'success', text: 'Movido solo este evento ✓' }))
                      .catch((e) => setBanner({ kind: 'error', text: e instanceof Error ? e.message : 'Falló' }))
                  }}
                  className="w-full text-left px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-200 transition-colors"
                >
                  📌 Solo este evento
                  <p className="text-[10px] text-zinc-500 mt-0.5">Crea una excepción. Los demás de la serie no cambian.</p>
                </button>
                <button
                  onClick={() => {
                    const { ev, newStart, newEnd } = moveScopePrompt
                    setMoveScopePrompt(null)
                    setBanner({ kind: 'loading', text: `Moviendo toda la serie…` })
                    gcal.updateEvent(ev.id, ev.calendarId, {
                      start: newStart, end: newEnd,
                      applyToSeries: true,
                      recurringEventId: ev.recurringEventId,
                    })
                      .then(() => setBanner({ kind: 'success', text: 'Serie movida ✓' }))
                      .catch((e) => setBanner({ kind: 'error', text: e instanceof Error ? e.message : 'Falló' }))
                  }}
                  className="w-full text-left px-3 py-2.5 bg-indigo-500/15 border border-indigo-500/40 hover:bg-indigo-500/25 rounded-lg text-sm text-indigo-300 transition-colors"
                >
                  🔁 Toda la serie
                  <p className="text-[10px] text-indigo-400/70 mt-0.5">Aplica el mismo desplazamiento a todos los eventos futuros y pasados de la serie.</p>
                </button>
                <button
                  onClick={() => setMoveScopePrompt(null)}
                  className="w-full px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TaskDetail — abierto al clickear un bloque sintético de task
          dentro del calendario. Reusamos el componente del task manager
          para no duplicar UI. */}
      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          project={projects[selectedTask.projectId] ?? null}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </motion.div>
  )
}

// ─── Event Modal ──────────────────────────────────────────────────────────────

interface EventModalProps {
  mode: 'create' | 'edit'
  event?: GEvent
  date?: Date
  startHour?: number
  calendars: GCalendar[]
  onClose: () => void
  /** Fire-and-forget: parent closes the modal + shows a banner. The modal
   *  itself doesn't need to await this. */
  onSave: (data: Omit<GEvent, 'id'> & { recurrence?: string[]; timeZone?: string }) => void
  onDelete: () => void
}

/** UI options for the recurrence selector. The 'custom' option isn't
 *  implemented yet — keep the picker simple for v1. */
type RecurrenceMode = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'

const RECURRENCE_OPTIONS: { value: RecurrenceMode; label: string }[] = [
  { value: 'none',     label: 'No se repite' },
  { value: 'daily',    label: 'Cada día' },
  { value: 'weekdays', label: 'Días de semana (L-V)' },
  { value: 'weekly',   label: 'Cada semana' },
  { value: 'monthly',  label: 'Cada mes' },
  { value: 'yearly',   label: 'Cada año' },
]

function buildRecurrenceRule(mode: RecurrenceMode): string[] | undefined {
  switch (mode) {
    case 'daily':    return ['RRULE:FREQ=DAILY']
    case 'weekdays': return ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR']
    case 'weekly':   return ['RRULE:FREQ=WEEKLY']
    case 'monthly':  return ['RRULE:FREQ=MONTHLY']
    case 'yearly':   return ['RRULE:FREQ=YEARLY']
    default:         return undefined
  }
}

function EventModal({ mode, event, date, startHour, calendars, onClose, onSave, onDelete }: EventModalProps) {
  const writable = calendars.filter((c) => c.accessRole === 'owner' || c.accessRole === 'writer')
  const defaultCal = event?.calendarId
    ?? writable.find((c) => c.primary)?.id
    ?? writable[0]?.id
    ?? ''

  const baseDate = event ? parseISO(event.start) : (date ?? new Date())
  const baseDateStr = format(baseDate, 'yyyy-MM-dd')

  const [calendarId, setCalendarId] = useState(defaultCal)
  const [summary, setSummary] = useState(event?.summary ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [allDay, setAllDay] = useState(event?.allDay ?? false)
  const [startDate, setStartDate] = useState(baseDateStr)
  const defaultStart = startHour !== undefined ? `${String(startHour).padStart(2, '0')}:00` : '09:00'
  const defaultEnd   = startHour !== undefined ? `${String((startHour + 1) % 24).padStart(2, '0')}:00` : '10:00'
  const [startTime, setStartTime] = useState(event && !event.allDay ? format(parseISO(event.start), 'HH:mm') : defaultStart)
  const [endDate, setEndDate] = useState(event ? format(parseISO(event.end), 'yyyy-MM-dd') : baseDateStr)
  const [endTime, setEndTime] = useState(event && !event.allDay ? format(parseISO(event.end), 'HH:mm') : defaultEnd)
  // Recurrence — only editable on CREATE for now. Editing an existing
  // event's recurrence rule via UI is more invasive (changes the master).
  const [recurrence, setRecurrence] = useState<RecurrenceMode>('none')

  const handleSave = () => {
    if (!summary.trim() || !calendarId) return
    try {
      // BUG FIX: previously we sent "YYYY-MM-DDTHH:mm:00" with no timezone
      // offset. Google Calendar interprets such strings in the calendar's
      // default timezone, NOT the user's. If the calendar's TZ is
      // Europe/Madrid (the default for many synced calendars) but the
      // user lives in Argentina, picking "13:00" would be saved as 13:00
      // Madrid time = 08:00 Buenos Aires → visually the event jumps 5h.
      //
      // Fix: build the ISO with the user's LOCAL offset appended (e.g.
      // "...T13:00:00-03:00") so Google knows exactly what wall-clock
      // time the user meant regardless of the calendar's TZ.
      const toLocalISO = (dateStr: string, timeStr: string) => {
        const [y, m, d] = dateStr.split('-').map(Number)
        const [hh, mm] = timeStr.split(':').map(Number)
        const dt = new Date(y, m - 1, d, hh, mm, 0)
        const offsetMin = -dt.getTimezoneOffset()
        const sign = offsetMin >= 0 ? '+' : '-'
        const absMin = Math.abs(offsetMin)
        const offH = String(Math.floor(absMin / 60)).padStart(2, '0')
        const offM = String(absMin % 60).padStart(2, '0')
        return `${dateStr}T${timeStr}:00${sign}${offH}:${offM}`
      }

      // BUG FIX: para eventos all-day, Google Calendar exige que
      // `end.date` sea EXCLUSIVO — el día siguiente al último día del
      // evento. Si el usuario deja `endDate === startDate` (default del
      // modal), GCal devuelve 400 "invalid time range" y el insert
      // falla silenciosamente (el error sube por el banner pero es
      // fácil no notarlo). Lo normalizamos acá: si end <= start en
      // modo all-day, lo bumpeamos al día siguiente del start. Si el
      // usuario eligió explícitamente un end posterior, lo respetamos.
      let normalizedEndDate = endDate
      if (allDay && endDate <= startDate) {
        const [y, m, d] = startDate.split('-').map(Number)
        const next = new Date(y, m - 1, d)
        next.setDate(next.getDate() + 1)
        normalizedEndDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
      }

      const startISO = allDay ? startDate : toLocalISO(startDate, startTime)
      const endISO   = allDay ? normalizedEndDate : toLocalISO(endDate, endTime)
      const recurrenceRule = mode === 'create' ? buildRecurrenceRule(recurrence) : undefined
      // IANA timezone del browser (ej. "America/Argentina/Buenos_Aires").
      // Google Calendar REQUIERE start.timeZone + end.timeZone para
      // eventos recurrentes con horario — sin esto el insert devuelve
      // 400 "Recurring events must have a time zone" y falla silente.
      // Para eventos one-off no es obligatorio pero igual lo mandamos
      // así el calendario lo guarda con la TZ correcta (evita bugs de
      // DST en otra parte). Fallback a UTC si Intl no está disponible.
      const tz = (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC'
      onSave({
        calendarId,
        summary: summary.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        start: startISO,
        end: endISO,
        allDay,
        timeZone: tz,
        ...(recurrenceRule ? { recurrence: recurrenceRule } : {}),
      })
    } catch {
      // Errors are surfaced via banner by the parent — modal is already
      // closed by the time async failures arrive.
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="text-sm font-bold text-white">
            {mode === 'create' ? 'Nuevo evento' : 'Editar evento'}
          </h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Calendario</label>
            <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)}
              disabled={mode === 'edit'}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60">
              {writable.map((c) => (
                <option key={c.id} value={c.id}>{c.summaryOverride || c.summary}{c.primary ? ' (primary)' : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Título</label>
            <input value={summary} onChange={(e) => setSummary(e.target.value)} autoFocus
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={allDay} onChange={(e) => {
              const next = e.target.checked
              setAllDay(next)
              // Al activar "Todo el día", si endDate quedó <= startDate
              // (caso común: ambos iguales por default), bumpeamos endDate
              // un día — GCal requiere end > start para eventos date-based.
              if (next && endDate <= startDate) {
                const [y, m, d] = startDate.split('-').map(Number)
                const nd = new Date(y, m - 1, d)
                nd.setDate(nd.getDate() + 1)
                setEndDate(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-${String(nd.getDate()).padStart(2, '0')}`)
              }
            }}
              className="accent-indigo-500" />
            Todo el día
          </label>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Inicio</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              {!allDay && (
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              )}
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Fin</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              {!allDay && (
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              )}
            </div>
          </div>

          {/* Recurrencia — solo editable al crear. En edit mostramos un
              hint si el evento ya es parte de una serie. */}
          {mode === 'create' ? (
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Repetir</label>
              <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as RecurrenceMode)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                {RECURRENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {recurrence !== 'none' && (
                <p className="text-[10px] text-indigo-400/80 mt-1">
                  ↻ Se va a crear como serie recurrente.
                </p>
              )}
            </div>
          ) : event?.recurringEventId ? (
            <div className="text-[10px] text-indigo-400/80 px-3 py-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5">
              ↻ Este evento es parte de una serie recurrente. Al guardar te vamos a preguntar si los cambios aplican solo a este evento o a toda la serie.
            </div>
          ) : null}

          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Ubicación (opcional)</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Descripción (opcional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none" />
          </div>

          {event?.htmlLink && (
            <a href={event.htmlLink} target="_blank" rel="noreferrer"
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              Abrir en Google Calendar <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        <div className="flex items-center gap-2 p-4 border-t border-zinc-800">
          {mode === 'edit' && (
            <button onClick={onDelete}
              className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 text-sm font-semibold transition-colors flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5" /> Eliminar
            </button>
          )}
          <button onClick={onClose}
            className="ml-auto px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={!summary.trim() || !calendarId}
            className="px-4 py-2 rounded-lg bg-indigo-500/15 border border-indigo-500/30 hover:bg-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-400 text-sm font-bold transition-colors">
            Guardar
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Week View ────────────────────────────────────────────────────────────────

const HOUR_PX = 52
const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i)

// Returns true if hour `h` is hidden given start/end (end is exclusive).
// If start === end → nothing hidden. If start < end → hide [start, end).
// If start > end → wraps midnight, hide [start, 24) ∪ [0, end).
function isHourHidden(h: number, start: number, end: number, enabled: boolean): boolean {
  if (!enabled || start === end) return false
  if (start < end) return h >= start && h < end
  return h >= start || h < end
}

interface WeekViewProps {
  anchor: Date
  events: GEvent[]
  tasks: { id: string; title: string; dueDate?: string; projectId: string; recurrence?: import('@/types').TaskRecurrence }[]
  projects: Record<string, { color: string; name: string } | undefined> | Record<string, { color: string; name: string }>
  calendarById: Map<string, GCalendar>
  selectedDay: Date | null
  setSelectedDay: (d: Date) => void
  hideNight: boolean
  hideStart: number
  hideEnd: number
  onEventClick: (ev: GEvent) => void
  onCreateAt: (date: Date, hour: number) => void
  /** Called when the user finishes drag-and-dropping an event.
   *  Receives the event, the new ISO start, and the new ISO end
   *  (both in local time with offset). The parent decides whether
   *  to fire the PATCH directly or prompt for series-vs-instance. */
  onEventMove?: (ev: GEvent, newStart: string, newEnd: string) => void
}

function WeekView({ anchor, events, tasks, projects, calendarById, selectedDay, setSelectedDay, hideNight, hideStart, hideEnd, onEventClick, onCreateAt, onEventMove }: WeekViewProps) {
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 })
  const weekEnd   = endOfWeek(anchor, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd })

  // ── Drag-and-drop state for event rescheduling ──
  // While dragging: track which event, its original Y, and the live
  // vertical offset in pixels. We render a ghost overlay at the
  // proposed new position so the user has clear feedback.
  const [dragState, setDragState] = useState<{
    evId: string
    originalTop: number
    originalHeight: number
    offsetY: number
    proposedStart: Date
    proposedEnd: Date
  } | null>(null)
  const dragInfoRef = useRef<{
    ev: GEvent
    dayStart: Date
    pointerStartY: number
    originalTop: number
    originalHeight: number
    durationMin: number
  } | null>(null)

  // Live red line for "now"
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Bucket events per day
  const timedEventsByDay = useMemo(() => {
    const map = new Map<string, GEvent[]>()
    for (const ev of events) {
      if (ev.allDay) continue
      const start = parseISO(ev.start)
      // Skip events that don't intersect the visible week
      if (start > weekEnd || parseISO(ev.end) < weekStart) continue
      const key = format(start, 'yyyy-MM-dd')
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(ev)
    }
    return map
  }, [events, weekStart, weekEnd])

  const allDayEventsByDay = useMemo(() => {
    const map = new Map<string, GEvent[]>()
    for (const ev of events) {
      if (!ev.allDay) continue
      const start = parseISO(ev.start + 'T00:00:00')
      if (start > weekEnd || parseISO(ev.end + 'T00:00:00') < weekStart) continue
      const key = ev.start.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(ev)
    }
    return map
  }, [events, weekStart, weekEnd])

  const tasksByDay = useMemo(() => {
    const map = new Map<string, typeof tasks>()
    // Rango visible de la semana — para expandir las recurrentes
    // dentro de esos 7 días sin tener que iterar todas las fechas.
    const weekStartStr = format(weekStart, 'yyyy-MM-dd')
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd')
    for (const t of tasks) {
      if (!t.dueDate) continue
      // Instancia base (la del store).
      if (!map.has(t.dueDate)) map.set(t.dueDate, [])
      map.get(t.dueDate)!.push(t)
      // Instancias recurrentes proyectadas hacia adelante.
      if (t.recurrence) {
        const occurrences = expandRecurrenceInRange(t.dueDate, t.recurrence, weekStartStr, weekEndStr)
        for (const occ of occurrences) {
          if (occ === t.dueDate) continue  // ya la metimos arriba
          if (!map.has(occ)) map.set(occ, [])
          map.get(occ)!.push(t)
        }
      }
    }
    return map
  }, [tasks, weekStart, weekEnd])

  // Visible hours (whole hours rendered as cells)
  const visibleHours = useMemo(
    () => ALL_HOURS.filter((h) => !isHourHidden(h, hideStart, hideEnd, hideNight)),
    [hideNight, hideStart, hideEnd]
  )

  // Map a fractional hour-of-day (0..24) → Y pixel in the COMPRESSED grid.
  // Hidden hours are simply skipped, so the grid is shorter.
  const fractionalToY = (hourF: number): number => {
    let y = 0
    const whole = Math.floor(hourF)
    for (let h = 0; h < whole; h++) {
      if (!isHourHidden(h, hideStart, hideEnd, hideNight)) y += HOUR_PX
    }
    if (!isHourHidden(whole, hideStart, hideEnd, hideNight)) {
      y += (hourF - whole) * HOUR_PX
    }
    return y
  }

  function eventLayout(ev: GEvent, dayStart: Date, dayEnd: Date): { top: number; height: number } | null {
    const evStart = maxDate([parseISO(ev.start), dayStart])
    const evEnd   = minDate([parseISO(ev.end), dayEnd])
    let startF = differenceInMinutes(evStart, dayStart) / 60
    let endF   = differenceInMinutes(evEnd, dayStart) / 60

    // Clip start FORWARD if it begins inside a hidden zone
    while (startF < 24 && isHourHidden(Math.floor(startF), hideStart, hideEnd, hideNight)) {
      startF = Math.floor(startF) + 1
    }
    // Clip end BACKWARD if it ends inside a hidden zone
    while (endF > 0 && isHourHidden(Math.floor(Math.max(0, endF - 0.0001)), hideStart, hideEnd, hideNight)) {
      endF = Math.floor(Math.max(0, endF - 0.0001))
    }
    if (endF <= startF) return null

    const top = fractionalToY(startF)
    const bottom = fractionalToY(endF)
    return { top, height: Math.max(18, bottom - top) }
  }

  return (
    // GCal-look outer container — slightly lighter than zinc-900, no big
    // rounded corners (GCal's panel is more flat), softer border.
    //
    // `h-full min-h-0`: the WeekView fills the grid cell its parent gives
    // it (which is now `flex-1` on the page wrapper). Previously this
    // hard-coded `calc(100vh - 160px)` — that worked on some screens but
    // left a black band at the bottom when the offset didn't match
    // (different headers, mobile top bar, removed ChatBox, etc.).
    <div
      className="border border-zinc-800/60 rounded-xl overflow-hidden flex flex-col h-full min-h-0"
      style={{
        backgroundColor: '#1f1f1f',
        fontFamily: 'Roboto, "Google Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      {/* Header row — GCal style: day abbreviation small + colored circle
          around today's number, larger and bolder numbers. */}
      <div className="grid border-b border-zinc-800/60 shrink-0" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
        <div /> {/* empty corner */}
        {days.map((day) => {
          const selected = selectedDay && isSameDay(day, selectedDay)
          const today = isToday(day)
          return (
            <button key={day.toISOString()} onClick={() => setSelectedDay(day)}
              className={`pt-2 pb-1 text-center transition-colors border-l border-zinc-800/60 ${
                selected ? 'bg-zinc-800/40' : 'hover:bg-zinc-800/30'
              }`}>
              <p className={`text-[11px] font-medium uppercase tracking-wide mb-0.5 ${
                today ? 'text-blue-400' : 'text-zinc-400'
              }`}>
                {format(day, 'EEE')}
              </p>
              {/* Today gets a filled circle behind the number, GCal style. */}
              <div className="flex items-center justify-center">
                <span
                  className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-xl font-normal transition-all ${
                    today
                      ? 'bg-blue-500 text-white'
                      : selected
                        ? 'bg-zinc-700 text-white'
                        : 'text-zinc-200 hover:bg-zinc-800/60'
                  }`}
                >
                  {format(day, 'd')}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* All-day strip */}
      {[...allDayEventsByDay.values()].some((arr) => arr.length > 0) || days.some((d) => (tasksByDay.get(format(d, 'yyyy-MM-dd')) ?? []).length > 0) ? (
        <div className="grid border-b border-zinc-800/60 shrink-0" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
          <div className="flex items-center justify-end pr-2">
            <span className="text-[11px] text-zinc-400">GMT-03</span>
          </div>
          {days.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd')
            const allDay = allDayEventsByDay.get(dateKey) ?? []
            const dayTasks = tasksByDay.get(dateKey) ?? []
            return (
              <div key={dateKey} className="border-l border-zinc-800/60 p-1 min-h-[34px] space-y-0.5">
                {allDay.map((ev) => {
                  const cal = calendarById.get(ev.calendarId)
                  const color = resolveEventColor(ev, cal?.backgroundColor)
                  const fg = contrastText(color)
                  return (
                    <button key={ev.id} onClick={() => onEventClick(ev)}
                      title={ev.summary}
                      className="w-full text-[11px] px-1.5 py-0.5 rounded-md truncate text-left font-medium hover:brightness-110 transition-all"
                      style={{
                        backgroundColor: color,
                        color: fg,
                        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)',
                      }}>
                      {ev.summary}
                    </button>
                  )
                })}
                {dayTasks.map((tsk) => {
                  const proj = (projects as Record<string, { color: string; name: string } | undefined>)[tsk.projectId]
                  return (
                    <div key={tsk.id}
                      className="w-full text-[11px] px-1.5 py-0.5 rounded-md truncate text-left border-l-2"
                      style={{
                        backgroundColor: (proj?.color ?? '#6366f1') + '15',
                        color: proj?.color ?? '#6366f1',
                        borderLeftColor: proj?.color ?? '#6366f1',
                      }}>
                      ✓ {tsk.title}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      ) : null}

      {/* Scrollable hour grid (pt-3 prevents the first hour label from being clipped by the top edge) */}
      <div className="overflow-y-auto flex-1 pt-3" ref={(el) => {
        // Auto-scroll to current hour on mount (skip if current hour is hidden — scroll to first visible)
        if (el && !el.dataset.scrolled) {
          const refHour = isHourHidden(now.getHours(), hideStart, hideEnd, hideNight)
            ? (visibleHours[0] ?? 0)
            : Math.max(0, now.getHours() - 2)
          el.scrollTop = fractionalToY(refHour)
          el.dataset.scrolled = '1'
        }
      }}>
        <div className="grid relative" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
          {/* Hours column — GCal-style: time labels in lighter zinc-300,
              non-mono sans, slightly larger, no quote marks. */}
          <div className="border-r border-zinc-800/60">
            {visibleHours.map((h, idx) => {
              const prevVisible = idx > 0 ? visibleHours[idx - 1] : -1
              const gapBefore = h !== prevVisible + 1 && idx > 0
              return (
                <div key={h}
                  className={`text-right pr-2 text-[11px] text-zinc-300 relative ${gapBefore ? 'border-t border-dashed border-zinc-700' : ''}`}
                  style={{ height: HOUR_PX }}>
                  <span className="absolute -top-2 right-2 tracking-tight">{String(h).padStart(2, '0')}:00</span>
                  {gapBefore && (
                    <span className="absolute -top-2.5 left-1 text-[8px] text-zinc-700">↕ oculto</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd')
            const dayEvents = timedEventsByDay.get(dateKey) ?? []
            const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0)
            const dayEnd   = new Date(day); dayEnd.setHours(23, 59, 59, 999)
            const isNowDay = isSameDay(day, now)
            const nowHourF = now.getHours() + now.getMinutes() / 60
            const nowHidden = isHourHidden(now.getHours(), hideStart, hideEnd, hideNight)
            const nowOffset = isNowDay && !nowHidden ? fractionalToY(nowHourF) : null

            return (
              <div key={dateKey} className="relative border-l border-zinc-800/60" style={{ height: HOUR_PX * visibleHours.length }}>
                {/* Hour cells (clickable to create) — GCal uses blue hover. */}
                {visibleHours.map((h, idx) => (
                  <button key={h} onClick={() => onCreateAt(day, h)}
                    className="absolute left-0 right-0 hover:bg-blue-500/5 transition-colors border-b border-zinc-800/40 group"
                    style={{ top: idx * HOUR_PX, height: HOUR_PX }}
                    title={`Crear evento a las ${String(h).padStart(2, '0')}:00`}>
                    <span className="opacity-0 group-hover:opacity-100 absolute top-1 right-1 text-[10px] text-blue-400">+ {String(h).padStart(2, '0')}:00</span>
                  </button>
                ))}

                {/* Now line */}
                {nowOffset !== null && (
                  <div className="absolute left-0 right-0 z-20 pointer-events-none"
                    style={{ top: nowOffset }}>
                    <div className="h-px bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
                    <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-500" />
                  </div>
                )}

                {/* Events — GCal-style + drag-to-reschedule support. */}
                {dayEvents.map((ev) => {
                  const layout = eventLayout(ev, dayStart, dayEnd)
                  if (!layout) return null
                  const { top, height } = layout
                  const cal = calendarById.get(ev.calendarId)
                  // Para eventos sintéticos de task usamos el color del
                  // proyecto. Los GCal events normales usan resolveEventColor.
                  const color = ev.isTask
                    ? (ev.projectColor ?? '#6366f1')
                    : resolveEventColor(ev, cal?.backgroundColor)
                  const fg = contrastText(color)
                  const isBeingDragged = dragState?.evId === ev.id
                  // While dragging, render at proposed position. Otherwise
                  // at the computed layout position.
                  const visualTop = isBeingDragged
                    ? Math.max(0, dragState.originalTop + dragState.offsetY)
                    : top
                  return (
                    <div
                      key={ev.id}
                      role="button"
                      tabIndex={0}
                      onPointerDown={(e) => {
                        // Only start a drag on primary button. Click-without-move
                        // still fires onEventClick (we use a small threshold).
                        if (e.button !== 0 || !onEventMove) return
                        const target = e.currentTarget
                        target.setPointerCapture(e.pointerId)
                        const startY = e.clientY
                        const evStart = parseISO(ev.start)
                        const evEnd = parseISO(ev.end)
                        const durationMin = (evEnd.getTime() - evStart.getTime()) / 60_000
                        dragInfoRef.current = {
                          ev,
                          dayStart,
                          pointerStartY: startY,
                          originalTop: top,
                          originalHeight: height,
                          durationMin,
                        }
                        // Don't actually start the drag state until they
                        // move > 4px — that way a quick click still opens
                        // the edit modal as before.
                      }}
                      onPointerMove={(e) => {
                        const info = dragInfoRef.current
                        if (!info || info.ev.id !== ev.id) return
                        const offsetY = e.clientY - info.pointerStartY
                        if (!dragState && Math.abs(offsetY) < 4) return  // below threshold
                        // Snap to 15-min increments.
                        const minPerPx = 60 / HOUR_PX
                        const deltaMinRaw = offsetY * minPerPx
                        const deltaMin = Math.round(deltaMinRaw / 15) * 15
                        const snappedOffsetY = deltaMin / minPerPx
                        const baseStart = parseISO(ev.start)
                        const newStart = new Date(baseStart.getTime() + deltaMin * 60_000)
                        const newEnd = new Date(newStart.getTime() + info.durationMin * 60_000)
                        setDragState({
                          evId: ev.id,
                          originalTop: info.originalTop,
                          originalHeight: info.originalHeight,
                          offsetY: snappedOffsetY,
                          proposedStart: newStart,
                          proposedEnd: newEnd,
                        })
                      }}
                      onPointerUp={(e) => {
                        const info = dragInfoRef.current
                        dragInfoRef.current = null
                        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
                        if (dragState && dragState.evId === ev.id && info && onEventMove) {
                          // Commit the move. Build ISO with explicit local
                          // offset so Google receives the wall-clock the
                          // user picked (same trick as the create modal).
                          const toLocalISO = (d: Date) => {
                            const pad = (n: number) => String(n).padStart(2, '0')
                            const offsetMin = -d.getTimezoneOffset()
                            const sign = offsetMin >= 0 ? '+' : '-'
                            const absMin = Math.abs(offsetMin)
                            const offH = pad(Math.floor(absMin / 60))
                            const offM = pad(absMin % 60)
                            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${offH}:${offM}`
                          }
                          onEventMove(ev, toLocalISO(dragState.proposedStart), toLocalISO(dragState.proposedEnd))
                          setDragState(null)
                        } else {
                          // No drag happened — treat as click.
                          onEventClick(ev)
                          setDragState(null)
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onEventClick(ev)
                        }
                      }}
                      className={`absolute left-1 right-1 rounded-lg px-1.5 py-1 text-left overflow-hidden transition-all z-10 cursor-grab active:cursor-grabbing ${
                        isBeingDragged ? 'opacity-90 shadow-2xl scale-[1.02] z-30' : 'hover:brightness-110'
                      }`}
                      style={{
                        top: visualTop, height,
                        // Para tasks usamos un fondo más translúcido + border
                        // dasheado/sólido para distinguir de eventos GCal.
                        background: ev.isTask ? `${color}55` : color,
                        border: ev.isTask ? `1.5px dashed ${color}` : undefined,
                        color: ev.isTask ? '#ffffff' : fg,
                        minHeight: 18,
                        boxShadow: isBeingDragged
                          ? '0 8px 24px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.06)'
                          : 'inset 0 0 0 1px rgba(0,0,0,0.06)',
                        touchAction: 'none',  // prevent mobile scrolling while dragging
                      }}
                      title={`${ev.isTask ? '📋 ' : ''}${ev.summary}\n${format(parseISO(ev.start), 'HH:mm')} – ${format(parseISO(ev.end), 'HH:mm')}${ev.recurringEventId ? '\n(recurrente · arrastrá para reagendar)' : ''}${ev.isTask ? '\n(task · click para abrir)' : ''}`}
                    >
                      <p className="text-[11px] font-medium truncate leading-tight">
                        {ev.isTask && <span className="opacity-80 mr-1">📋</span>}
                        {ev.summary}
                        {ev.recurringEventId && <span className="ml-1 opacity-70">↻</span>}
                      </p>
                      {height > 30 && (
                        <p className="text-[10px] opacity-90 truncate leading-tight mt-0.5">
                          {isBeingDragged && dragState
                            ? `${format(dragState.proposedStart, 'HH:mm')} – ${format(dragState.proposedEnd, 'HH:mm')}`
                            : `${format(parseISO(ev.start), 'HH:mm')} – ${format(parseISO(ev.end), 'HH:mm')}`}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Night-hide Pill (header control) ─────────────────────────────────────────

interface NightHidePillProps {
  enabled: boolean
  start: number
  end: number
  onToggle: () => void
  onRangeChange: (start: number, end: number) => void
}

function NightHidePill({ enabled, start, end, onToggle, onRangeChange }: NightHidePillProps) {
  const [open, setOpen] = useState(false)
  const [draftStart, setDraftStart] = useState(start)
  const [draftEnd, setDraftEnd] = useState(end)

  // Sync drafts when external value changes
  useEffect(() => { setDraftStart(start); setDraftEnd(end) }, [start, end])

  // Close popover on outside click / Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (target && !target.closest('[data-night-pill]')) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [open])

  const apply = () => {
    onRangeChange(draftStart, draftEnd)
    setOpen(false)
  }

  const fmtH = (h: number) => `${String(h).padStart(2, '0')}:00`
  const rangeLabel = start === end ? '—' : `${fmtH(start)}–${fmtH(end)}`
  const hiddenCount = (() => {
    if (start === end) return 0
    return start < end ? (end - start) : (24 - start + end)
  })()

  return (
    <div className="relative" data-night-pill>
      <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <button
          onClick={onToggle}
          title={enabled ? `Mostrar 24h (oculto ahora: ${rangeLabel})` : `Ocultar ${rangeLabel}`}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            enabled ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
          }`}>
          {enabled ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{enabled ? `Oculto ${rangeLabel}` : 'Noche'}</span>
        </button>
        <button
          onClick={() => setOpen((o) => !o)}
          title="Configurar horario oculto"
          className="px-1.5 py-1.5 border-l border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
          <SettingsIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-2 w-72 z-30 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-4"
          >
            <h4 className="text-xs font-bold text-white mb-1 flex items-center gap-2">
              <Moon className="w-3.5 h-3.5 text-indigo-400" /> Ocultar período
            </h4>
            <p className="text-[10px] text-zinc-500 mb-3">
              Las horas dentro de este rango no se muestran en la vista semanal.
              Si el inicio es mayor que el fin, el rango cruza la medianoche.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Desde</label>
                <select value={draftStart} onChange={(e) => setDraftStart(parseInt(e.target.value))}
                  className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500">
                  {ALL_HOURS.map((h) => (
                    <option key={h} value={h}>{fmtH(h)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Hasta</label>
                <select value={draftEnd} onChange={(e) => setDraftEnd(parseInt(e.target.value))}
                  className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500">
                  {ALL_HOURS.map((h) => (
                    <option key={h} value={h}>{fmtH(h)}</option>
                  ))}
                  <option value={24}>24:00</option>
                </select>
              </div>
            </div>

            <p className="text-[10px] text-zinc-500 mt-2">
              Vista: <span className="text-zinc-300 font-mono">{hiddenCount > 0 ? `${24 - hiddenCount}h visibles` : '24h visibles'}</span>
            </p>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-800">
              <div className="flex gap-1.5">
                <button onClick={() => { setDraftStart(0); setDraftEnd(7) }}
                  className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">00–07</button>
                <button onClick={() => { setDraftStart(22); setDraftEnd(7) }}
                  className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">22–07</button>
                <button onClick={() => { setDraftStart(0); setDraftEnd(6) }}
                  className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">00–06</button>
              </div>
              <button onClick={apply}
                className="text-xs px-3 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/40 hover:bg-indigo-500/30 text-indigo-300 font-semibold">
                Aplicar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
