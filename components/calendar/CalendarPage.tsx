'use client'
import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/hooks/useTranslation'
import { useTasksStore } from '@/lib/store/tasksStore'
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
  const { tasks, projects } = useTasksStore()
  const gcal = useGoogleCalendarStore()

  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date())
  const view: ViewMode = gcal.view
  const setView = (v: ViewMode) => gcal.setView(v)
  const [showEventModal, setShowEventModal] = useState<{ mode: 'create' | 'edit'; event?: GEvent; date?: Date; startHour?: number } | null>(null)
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [mounted, setMounted] = useState(false)

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

  // Initial load
  useEffect(() => {
    if (!mounted) return
    ;(async () => {
      await gcal.refreshStatus()
      if (useGoogleCalendarStore.getState().connected) {
        await gcal.loadCalendars()
        await gcal.loadEvents()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  // Re-load events when visibility toggles change
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
    const map = new Map<string, GEvent[]>()
    for (const ev of gcal.events) {
      // For all-day events ev.start is YYYY-MM-DD; for timed it's full ISO
      const dateKey = ev.start.slice(0, 10)
      if (!map.has(dateKey)) map.set(dateKey, [])
      map.get(dateKey)!.push(ev)
    }
    return map
  }, [gcal.events])

  const calendarById = useMemo(() => {
    const map = new Map<string, GCalendar>()
    for (const c of gcal.calendars) map.set(c.id, c)
    return map
  }, [gcal.calendars])

  const getTasksForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return Object.values(tasks).filter((t) => t.dueDate === dateStr)
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
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
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
        <div className="flex items-center gap-2">
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
            <button onClick={() => gcal.loadEvents()} title="Refrescar eventos"
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

      {/* Banner */}
      <AnimatePresence>
        {banner && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border ${
              banner.kind === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{banner.text}</span>
            <button onClick={() => setBanner(null)} className="ml-auto opacity-50 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`grid grid-cols-1 gap-6 ${gcal.showSideRail ? 'xl:grid-cols-[1fr_300px]' : ''}`}>
        {/* Calendar grid (month OR week) */}
        {view === 'month' ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-7 border-b border-zinc-800">
              {weekDays.map((day) => (
                <div key={day} className="py-3 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map((day, i) => {
                const dayTasks = getTasksForDay(day)
                const dayEvents = eventsByDay.get(format(day, 'yyyy-MM-dd')) ?? []
                const isCurrentMonth = isSameMonth(day, currentDate)
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
                      !isCurrentMonth ? 'opacity-30' : ''
                    } ${isSelected ? 'bg-indigo-600/10' : 'hover:bg-zinc-800/50'}`}
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
            events={gcal.events}
            tasks={Object.values(tasks)}
            projects={projects}
            calendarById={calendarById}
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
            hideNight={gcal.hideNight}
            hideStart={gcal.hideStart}
            hideEnd={gcal.hideEnd}
            onEventClick={(ev) => setShowEventModal({ mode: 'edit', event: ev })}
            onCreateAt={(date, hour) => setShowEventModal({ mode: 'create', date, startHour: hour })}
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

      {/* Event modal */}
      <AnimatePresence>
        {showEventModal && (
          <EventModal
            mode={showEventModal.mode}
            event={showEventModal.event}
            date={showEventModal.date}
            startHour={showEventModal.startHour}
            calendars={gcal.calendars}
            onClose={() => setShowEventModal(null)}
            onSave={async (data) => {
              try {
                if (showEventModal.mode === 'create') {
                  await gcal.createEvent(data)
                } else if (showEventModal.event) {
                  await gcal.updateEvent(showEventModal.event.id, showEventModal.event.calendarId, data)
                }
                setShowEventModal(null)
              } catch (e) {
                setBanner({ kind: 'error', text: `Error: ${e instanceof Error ? e.message : 'unknown'}` })
              }
            }}
            onDelete={async () => {
              if (!showEventModal.event) return
              if (!confirm(`¿Eliminar "${showEventModal.event.summary}"?`)) return
              try {
                await gcal.deleteEvent(showEventModal.event.id, showEventModal.event.calendarId)
                setShowEventModal(null)
              } catch (e) {
                setBanner({ kind: 'error', text: `Error: ${e instanceof Error ? e.message : 'unknown'}` })
              }
            }}
          />
        )}
      </AnimatePresence>
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
  onSave: (data: Omit<GEvent, 'id'>) => Promise<void>
  onDelete: () => Promise<void>
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
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!summary.trim() || !calendarId) return
    setSaving(true)
    try {
      const startISO = allDay ? startDate : `${startDate}T${startTime}:00`
      const endISO   = allDay ? endDate   : `${endDate}T${endTime}:00`
      await onSave({
        calendarId,
        summary: summary.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        start: startISO,
        end: endISO,
        allDay,
      })
    } finally {
      setSaving(false)
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
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)}
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
          <button onClick={handleSave} disabled={saving || !summary.trim() || !calendarId}
            className="px-4 py-2 rounded-lg bg-indigo-500/15 border border-indigo-500/30 hover:bg-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-400 text-sm font-bold transition-colors">
            {saving ? 'Guardando…' : 'Guardar'}
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
  tasks: { id: string; title: string; dueDate?: string; projectId: string }[]
  projects: Record<string, { color: string; name: string } | undefined> | Record<string, { color: string; name: string }>
  calendarById: Map<string, GCalendar>
  selectedDay: Date | null
  setSelectedDay: (d: Date) => void
  hideNight: boolean
  hideStart: number
  hideEnd: number
  onEventClick: (ev: GEvent) => void
  onCreateAt: (date: Date, hour: number) => void
}

function WeekView({ anchor, events, tasks, projects, calendarById, selectedDay, setSelectedDay, hideNight, hideStart, hideEnd, onEventClick, onCreateAt }: WeekViewProps) {
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 })
  const weekEnd   = endOfWeek(anchor, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd })

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
    for (const t of tasks) {
      if (!t.dueDate) continue
      if (!map.has(t.dueDate)) map.set(t.dueDate, [])
      map.get(t.dueDate)!.push(t)
    }
    return map
  }, [tasks])

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
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 160px)' }}>
      {/* Header row */}
      <div className="grid border-b border-zinc-800 shrink-0" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
        <div /> {/* empty corner */}
        {days.map((day) => {
          const selected = selectedDay && isSameDay(day, selectedDay)
          const today = isToday(day)
          return (
            <button key={day.toISOString()} onClick={() => setSelectedDay(day)}
              className={`py-2.5 text-center transition-colors border-l border-zinc-800 ${
                selected ? 'bg-indigo-600/10' : 'hover:bg-zinc-800/40'
              }`}>
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                {format(day, 'EEE')}
              </p>
              <p className={`text-lg font-bold ${today ? 'text-indigo-400' : selected ? 'text-white' : 'text-zinc-300'}`}>
                {format(day, 'd')}
              </p>
            </button>
          )
        })}
      </div>

      {/* All-day strip */}
      {[...allDayEventsByDay.values()].some((arr) => arr.length > 0) || days.some((d) => (tasksByDay.get(format(d, 'yyyy-MM-dd')) ?? []).length > 0) ? (
        <div className="grid border-b border-zinc-800 shrink-0" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
          <div className="flex items-center justify-end pr-2">
            <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-600">all-day</span>
          </div>
          {days.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd')
            const allDay = allDayEventsByDay.get(dateKey) ?? []
            const dayTasks = tasksByDay.get(dateKey) ?? []
            return (
              <div key={dateKey} className="border-l border-zinc-800 p-1 min-h-[34px] space-y-0.5">
                {allDay.map((ev) => {
                  const cal = calendarById.get(ev.calendarId)
                  const color = resolveEventColor(ev, cal?.backgroundColor)
                  const fg = contrastText(color)
                  return (
                    <button key={ev.id} onClick={() => onEventClick(ev)}
                      title={ev.summary}
                      className="w-full text-[10px] px-1.5 py-0.5 rounded truncate text-left font-semibold hover:brightness-110 transition-all"
                      style={{ backgroundColor: color, color: fg }}>
                      {ev.summary}
                    </button>
                  )
                })}
                {dayTasks.map((tsk) => {
                  const proj = (projects as Record<string, { color: string; name: string } | undefined>)[tsk.projectId]
                  return (
                    <div key={tsk.id}
                      className="w-full text-[10px] px-1.5 py-0.5 rounded truncate text-left border-l-2"
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
          {/* Hours column */}
          <div className="border-r border-zinc-800">
            {visibleHours.map((h, idx) => {
              const prevVisible = idx > 0 ? visibleHours[idx - 1] : -1
              const gapBefore = h !== prevVisible + 1 && idx > 0
              return (
                <div key={h} className={`text-right pr-2 text-[9px] font-mono text-zinc-600 relative ${gapBefore ? 'border-t border-dashed border-zinc-700' : ''}`}
                  style={{ height: HOUR_PX }}>
                  <span className="absolute -top-1.5 right-2">{String(h).padStart(2, '0')}:00</span>
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
              <div key={dateKey} className="relative border-l border-zinc-800" style={{ height: HOUR_PX * visibleHours.length }}>
                {/* Hour cells (clickable to create) — only visible hours */}
                {visibleHours.map((h, idx) => (
                  <button key={h} onClick={() => onCreateAt(day, h)}
                    className="absolute left-0 right-0 hover:bg-indigo-500/5 transition-colors border-b border-zinc-800/60 group"
                    style={{ top: idx * HOUR_PX, height: HOUR_PX }}
                    title={`Crear evento a las ${String(h).padStart(2, '0')}:00`}>
                    <span className="opacity-0 group-hover:opacity-100 absolute top-1 right-1 text-[10px] text-indigo-400 font-mono">+ {String(h).padStart(2, '0')}:00</span>
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

                {/* Events */}
                {dayEvents.map((ev) => {
                  const layout = eventLayout(ev, dayStart, dayEnd)
                  if (!layout) return null
                  const { top, height } = layout
                  const cal = calendarById.get(ev.calendarId)
                  const color = resolveEventColor(ev, cal?.backgroundColor)
                  const fg = contrastText(color)
                  return (
                    <button key={ev.id} onClick={(e) => { e.stopPropagation(); onEventClick(ev) }}
                      className="absolute left-1 right-1 rounded-md p-1.5 text-left overflow-hidden hover:brightness-110 transition-all z-10 shadow-sm"
                      style={{
                        top, height,
                        background: color,
                        color: fg,
                        minHeight: 18,
                      }}
                      title={`${ev.summary}\n${format(parseISO(ev.start), 'HH:mm')} – ${format(parseISO(ev.end), 'HH:mm')}`}>
                      <p className="text-[10px] font-bold truncate">{ev.summary}</p>
                      {height > 30 && (
                        <p className="text-[9px] font-mono opacity-90 truncate">
                          {format(parseISO(ev.start), 'HH:mm')} – {format(parseISO(ev.end), 'HH:mm')}
                        </p>
                      )}
                    </button>
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
