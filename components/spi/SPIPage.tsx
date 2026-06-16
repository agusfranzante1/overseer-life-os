'use client'
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Infinity as InfinityIcon, Plus, ChevronDown, ChevronRight, Flame, Trophy,
  Check, Calendar, Star, Trash2, Sparkles, History, X, ArrowRight, Zap, TrendingUp,
  Settings2, FlaskConical, Copy, CalendarDays,
} from 'lucide-react'
import { CalendarSnapshotView } from './CalendarSnapshotView'
import { buildCalendarSnapshot } from '@/lib/spi/calendarSnapshot'
import { sessionToMarkdown, copyMarkdownToClipboard } from '@/lib/projection/exportMarkdown'
import Link from 'next/link'
import { useLabStore, exercisesByCategoryCombined as exercisesByCategory, findExerciseCombined as findExercise, findCategoryCombined as findCategory } from '@/lib/store/labStore'
import { LAB_CATEGORIES } from '@/lib/lab/templates'
import { ExerciseRunner } from '@/components/lab/ExerciseRunner'
import { TemplateEditor } from './TemplateEditor'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
  BarChart, Bar, Cell,
} from 'recharts'
import { useSPIStore, lastSaturdayYmd, activeWeekAnchorYmd } from '@/lib/store/spiStore'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useProjectionStore } from '@/lib/store/projectionStore'
import { useHabitsStore } from '@/lib/store/habitsStore'
import { useKpisStore } from '@/lib/store/kpisStore'
import { buildWeekSnapshot } from '@/lib/spi/weekSnapshot'
import type { WeekClosureSnapshot } from '@/lib/spi/types'
import { KpiScoreboard } from './KpiScoreboard'
import type { SPISection, SectionField, SPISession, SPITask } from '@/lib/spi/types'
import { titleForLevel, type SessionXP } from '@/lib/spi/gamification'
import { quarterOfMonthKey, monthOfSpiWeek, labelForPeriod, weekOfQuarter } from '@/lib/projection/period'
import { useTranslation } from '@/hooks/useTranslation'

export function SPIPage() {
  const { t } = useTranslation()
  const {
    template, sessions, activeSessionId,
    createOrOpenCurrentWeek, setActiveSession,
    toggleChecklistItem, updateValue, closeSession, deleteSession,
    addTask, updateTask, removeTask, pushTaskToManager,
    updateTemplate, resetTemplate, setSessionLanes, setSessionKpis,
    bitacoraEntries, addBitacoraEntry, updateBitacoraEntry, removeBitacoraEntry,
    getStreak, getLevel,
  } = useSPIStore()
  const projectsById = useTasksStore((s) => s.projects)
  const taskMap = useTasksStore((s) => s.tasks)
  const projectionPlans = useProjectionStore((s) => s.plans)

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [showHistory, setShowHistory] = useState(false)
  // `showClose` holds the session id about to be closed (null = closed-modal
  // not shown). Was a boolean back when the page only edited one session;
  // now multiple cards can each request close, so we track the target.
  const [showClose, setShowClose] = useState<string | null>(null)
  const [showTemplateEditor, setShowTemplateEditor] = useState(false)
  /** Set when the just-closed session triggered a level-up — drives the
   *  celebration modal. Cleared on dismiss. */
  const [closeResult, setCloseResult] = useState<null | {
    xp: SessionXP
    leveledUp: boolean
    newLevel: number
    pushedTasks: number
  }>(null)

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  )

  // Defensive — if storage has activeSessionId pointing to a deleted session
  useEffect(() => {
    if (activeSessionId && !activeSession) setActiveSession(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, activeSession])

  if (!mounted) return null

  // ── New list-view model ───────────────────────────────────────────
  // Mirrors the projection PlanList pattern: ALWAYS show a card for the
  // current Saturday (whether it's been started or not, open or closed),
  // followed by past closed sessions newest-first. When a session is
  // closed, it auto-collapses (handled inside <WeekCard> via a closedAt
  // transition effect) — and when a new Saturday rolls around, this list
  // recomputes so the new week shows up on top as "not yet started".
  const currentSaturday = lastSaturdayYmd()
  const currentSession = sessions.find((s) => s.weekStartDate === currentSaturday) ?? null
  const pastClosed = sessions
    .filter((s) => s.weekStartDate !== currentSaturday && !!s.closedAt)
    .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))
  // Sessions that are NOT for the current week but also NOT closed (the
  // user left them mid-edit). Surface them between current and history so
  // they don't get silently buried.
  const pastUnclosed = sessions
    .filter((s) => s.weekStartDate !== currentSaturday && !s.closedAt)
    .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))

  const streak = getStreak()
  const levelInfo = getLevel()

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* ── Header ───────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <InfinityIcon className="w-6 h-6 text-fuchsia-400" />
            {t('spi.fullTitle')}
          </h1>
          <p className="text-xs text-zinc-500 mt-1 max-w-xl">
            {t('spi.fullSubtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Level pill — XP bar + level number + title */}
          <div
            className="px-3 py-1.5 bg-gradient-to-r from-fuchsia-500/10 to-violet-500/10 border border-fuchsia-500/30 rounded-lg flex items-center gap-2 group relative"
            title={`Nivel ${levelInfo.level} · ${titleForLevel(levelInfo.level)}\n${levelInfo.currentLevelXP}/${levelInfo.nextLevelXP} XP al próximo nivel`}
          >
            <Zap className="w-3.5 h-3.5 text-fuchsia-400" />
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-fuchsia-300 font-mono font-bold">L{levelInfo.level}</span>
                <span className="text-[9px] text-fuchsia-400/60 font-mono uppercase tracking-wider">{titleForLevel(levelInfo.level)}</span>
              </div>
              <div className="w-20 h-1 bg-white/[0.03] rounded-full overflow-hidden mt-0.5">
                <div
                  className="h-full bg-gradient-to-r from-fuchsia-400 to-violet-400 transition-all"
                  style={{ width: `${Math.min(100, levelInfo.progress * 100)}%` }}
                />
              </div>
            </div>
          </div>
          {streak > 0 && (
            <div className="px-3 py-1.5 bg-orange-500/10 border border-orange-500/30 rounded-lg flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-xs text-orange-300 font-mono">
                {streak} {streak === 1 ? t('spi.streakSingle') : t('spi.streakPlural')}
              </span>
            </div>
          )}
          <button
            onClick={() => setShowHistory(true)}
            className="px-3 py-1.5 bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.12] text-zinc-400 hover:text-zinc-200 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
          >
            <History className="w-3.5 h-3.5" /> {t('spi.history')} ({sessions.length})
          </button>
          <button
            onClick={() => setShowTemplateEditor(true)}
            className="px-2 py-1.5 bg-white/[0.03] border border-white/[0.08] hover:border-fuchsia-500/40 text-zinc-500 hover:text-fuchsia-300 rounded-lg transition-all"
            title={t('spi.editTemplate')}
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ── Week cards (current first, then any past) ────────────── */}
      {/* Current Saturday — always shown. Body switches between
          "empezar" CTA / open editor / closed summary based on whether
          the session exists and whether it's been closed. */}
      <WeekCard
        key={`current-${currentSaturday}`}
        weekStartDate={currentSaturday}
        isCurrent
        session={currentSession}
        template={template}
        projectsById={projectsById}
        taskMap={taskMap}
        projectionPlans={projectionPlans}
        bitacoraEntries={bitacoraEntries}
        onBitacoraAdd={addBitacoraEntry}
        onBitacoraUpdate={updateBitacoraEntry}
        onBitacoraRemove={removeBitacoraEntry}
        onStart={() => createOrOpenCurrentWeek()}
        onValueChange={updateValue}
        onChecklistToggle={toggleChecklistItem}
        onSetLanes={setSessionLanes}
        onSetKpis={setSessionKpis}
        onAddTask={addTask}
        onUpdateTask={updateTask}
        onRemoveTask={removeTask}
        onPushTask={pushTaskToManager}
        onCloseRequest={(sessId) => setShowClose(sessId)}
        onDeleteRequest={(sessId) => {
          const s = sessions.find((x) => x.id === sessId)
          if (!s) return
          const hasContent =
            Object.values(s.mainChecklist ?? {}).some(Boolean) ||
            Object.keys(s.values ?? {}).length > 0 ||
            (s.tasks?.length ?? 0) > 0 ||
            (s.selectedLanes?.length ?? 0) > 0
          if (hasContent && !confirm('¿Cancelar esta sesión? Vas a perder lo que escribiste en ella.')) return
          deleteSession(sessId)
        }}
      />

      {/* Past sessions that the user STARTED but never closed. Surface
          them between current and the closed history so they're not lost.
          Default collapsed — single line in the header makes it obvious
          they need attention. */}
      {pastUnclosed.map((s) => (
        <WeekCard
          key={s.id}
          weekStartDate={s.weekStartDate}
          isCurrent={false}
          session={s}
          template={template}
          projectsById={projectsById}
          taskMap={taskMap}
          projectionPlans={projectionPlans}
          bitacoraEntries={bitacoraEntries}
          onBitacoraAdd={addBitacoraEntry}
          onBitacoraUpdate={updateBitacoraEntry}
          onBitacoraRemove={removeBitacoraEntry}
          onValueChange={updateValue}
          onChecklistToggle={toggleChecklistItem}
          onSetLanes={setSessionLanes}
          onSetKpis={setSessionKpis}
          onAddTask={addTask}
          onUpdateTask={updateTask}
          onRemoveTask={removeTask}
          onPushTask={pushTaskToManager}
          onCloseRequest={(sessId) => setShowClose(sessId)}
          onDeleteRequest={(sessId) => {
            if (!confirm('¿Eliminar esta sesión incompleta? No se puede deshacer.')) return
            deleteSession(sessId)
          }}
        />
      ))}

      {/* Closed history — collapsed by default, "Done" badge */}
      {pastClosed.map((s) => (
        <WeekCard
          key={s.id}
          weekStartDate={s.weekStartDate}
          isCurrent={false}
          session={s}
          template={template}
          projectsById={projectsById}
          taskMap={taskMap}
          projectionPlans={projectionPlans}
          bitacoraEntries={bitacoraEntries}
          onBitacoraAdd={addBitacoraEntry}
          onBitacoraUpdate={updateBitacoraEntry}
          onBitacoraRemove={removeBitacoraEntry}
          onValueChange={updateValue}
          onChecklistToggle={toggleChecklistItem}
          onSetLanes={setSessionLanes}
          onSetKpis={setSessionKpis}
          onAddTask={addTask}
          onUpdateTask={updateTask}
          onRemoveTask={removeTask}
          onPushTask={pushTaskToManager}
          onCloseRequest={(sessId) => setShowClose(sessId)}
          onDeleteRequest={(sessId) => {
            if (!confirm('¿Eliminar esta sesión del historial?')) return
            deleteSession(sessId)
          }}
        />
      ))}

      {/* ── Modals ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showHistory && (
          <HistoryModal
            sessions={sessions}
            activeSessionId={activeSessionId}
            onClose={() => setShowHistory(false)}
            onOpen={(id) => { setActiveSession(id); setShowHistory(false) }}
          />
        )}
        {(() => {
          if (!showClose) return null
          const closingSession = sessions.find((s) => s.id === showClose) ?? null
          if (!closingSession) return null
          return (
            <CloseSessionModal
              pendingTaskCount={(closingSession.tasks ?? []).filter((t) => !t.linkedTaskId).length}
              onClose={() => setShowClose(null)}
              onConfirm={({ mood, notes }) => {
                const result = closeSession(closingSession.id, { mood, notes })
                setShowClose(null)
                setCloseResult({
                  xp: result.xp,
                  leveledUp: result.leveledUp,
                  newLevel: result.newLevel,
                  pushedTasks: result.pushedTasks,
                })
              }}
            />
          )
        })()}
        {closeResult && (
          <CelebrationModal
            result={closeResult}
            onClose={() => setCloseResult(null)}
          />
        )}
        {showTemplateEditor && (
          <TemplateEditor
            template={template}
            onSave={updateTemplate}
            onReset={resetTemplate}
            onClose={() => setShowTemplateEditor(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// WEEK CARD — collapsible wrapper that holds one weekly session.
//
// Behavior matches the projection PlanList pattern:
//   - Current week, no session yet → expanded card with "Empezar" CTA
//   - Current week, open session   → expanded editor (full ActiveSession)
//   - Current week, closed session → collapsed by default (auto-collapses
//     immediately after the user closes it)
//   - Past closed session          → collapsed by default with score/badge
//
// User can re-expand any card by clicking its header.
// ─────────────────────────────────────────────────────────────────────
function WeekCard({
  weekStartDate, isCurrent, session, template,
  projectsById, taskMap, projectionPlans,
  bitacoraEntries, onBitacoraAdd, onBitacoraUpdate, onBitacoraRemove,
  onStart, onValueChange, onChecklistToggle, onSetLanes, onSetKpis,
  onAddTask, onUpdateTask, onRemoveTask, onPushTask,
  onCloseRequest, onDeleteRequest,
}: {
  weekStartDate: string
  isCurrent: boolean
  session: SPISession | null
  template: ReturnType<typeof useSPIStore.getState>['template']
  projectsById: ReturnType<typeof useTasksStore.getState>['projects']
  taskMap: ReturnType<typeof useTasksStore.getState>['tasks']
  projectionPlans: ReturnType<typeof useProjectionStore.getState>['plans']
  bitacoraEntries: import('@/lib/spi/types').BitacoraEntry[]
  onBitacoraAdd: (e: Omit<import('@/lib/spi/types').BitacoraEntry, 'id' | 'createdAt' | 'updatedAt'>) => string
  onBitacoraUpdate: (id: string, patch: Partial<import('@/lib/spi/types').BitacoraEntry>) => void
  onBitacoraRemove: (id: string) => void
  /** Only provided for the current-week card when no session exists yet. */
  onStart?: () => void
  onValueChange: (sessionId: string, sectionKey: string, fieldKey: string, value: string) => void
  onChecklistToggle: (sessionId: string, key: string) => void
  onSetLanes: (sessionId: string, lanes: string[]) => void
  onSetKpis: (sessionId: string, kpiIds: string[]) => void
  onAddTask: (sessionId: string, t: Omit<SPITask, 'id'>) => string
  onUpdateTask: (sessionId: string, taskId: string, patch: Partial<SPITask>) => void
  onRemoveTask: (sessionId: string, taskId: string) => void
  onPushTask: (sessionId: string, taskId: string) => void
  onCloseRequest: (sessionId: string) => void
  onDeleteRequest: (sessionId: string) => void
}) {
  const isClosed = !!session?.closedAt
  const hasSession = !!session

  // Default-expanded heuristic:
  //   - current week without session → expanded (so the CTA is visible)
  //   - current week with OPEN session → expanded (active editing)
  //   - any closed session → collapsed (history view)
  //   - past unclosed → collapsed (user can choose to resume)
  const initialExpanded = isCurrent && (!hasSession || !isClosed)
  const [expanded, setExpanded] = useState(initialExpanded)

  // Auto-collapse when this session transitions from open → closed. Without
  // this, closing the current session would leave the (now-closed) editor
  // expanded — which contradicts the "save & collapse" UX the user asked for.
  const wasClosedRef = useRef(isClosed)
  useEffect(() => {
    if (isClosed && !wasClosedRef.current) setExpanded(false)
    wasClosedRef.current = isClosed
  }, [isClosed])

  // Pretty week label — Sábado D de mes Y
  const weekLabel = useMemo(() => {
    const [y, m, d] = weekStartDate.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    return date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }, [weekStartDate])

  // Status badge — what color and label to show in the header
  const status: 'not_started' | 'in_progress' | 'done' = !hasSession
    ? 'not_started'
    : isClosed ? 'done' : 'in_progress'
  const badge =
    status === 'in_progress' ? { label: 'En Progreso', cls: 'bg-blue-500/15 border-blue-500/40 text-blue-300' }
    : status === 'done'      ? { label: 'Done',        cls: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' }
    : null  // not_started → no badge, just the "Empezar" CTA inside

  // Color de acento del border-top: fucsia para current, gris para histórico.
  const accentColor = isCurrent ? '#d946ef' : 'var(--surface-fill)'
  return (
    <div
      className="rounded-2xl overflow-hidden transition-all mb-3"
      style={{
        // Glass card con border-top coloreado + glow fucsia sutil para
        // la sesión en curso (matchea el lenguaje visual del task card).
        background: isCurrent
          ? `radial-gradient(circle at 0% 0%, rgba(217, 70, 239, 0.10), transparent 50%), rgba(255, 255, 255, 0.025)`
          : 'var(--card-bg)',
        borderTop: `2px solid ${accentColor}`,
        borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
      }}
    >
      {/* Header — always clickable to expand/collapse */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        {/* Badge icono con halo fucsia para current — más prominente que
            el simple emoji "♾️" del before. */}
        <div
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xl"
          style={{
            background: isCurrent ? 'rgba(217, 70, 239, 0.18)' : 'var(--card-bg)',
            border: `1px solid ${isCurrent ? 'rgba(217,70,239,0.40)' : 'var(--surface-fill)'}`,
          }}
        >
          ♾️
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-white capitalize truncate">
            {weekLabel}
          </p>
          {session?.closedAt && session.score !== undefined && (
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Cerrada · puntuación {session.score}%
            </p>
          )}
          {!hasSession && (
            <p className="text-[11px] text-zinc-500 mt-0.5">Sin empezar todavía</p>
          )}
        </div>
        {badge && (
          <span className={`text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full border ${badge.cls}`}>
            {badge.label}
          </span>
        )}
        {expanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.05] p-5">
              {!hasSession && onStart ? (
                <EmptyWeekCTA onStart={onStart} />
              ) : session ? (
                <ActiveSession
                  session={session}
                  template={template}
                  projectsById={projectsById}
                  taskMap={taskMap}
                  projectionPlans={projectionPlans}
                  bitacoraEntries={bitacoraEntries}
                  onBitacoraAdd={onBitacoraAdd}
                  onBitacoraUpdate={onBitacoraUpdate}
                  onBitacoraRemove={onBitacoraRemove}
                  onChecklistToggle={(key) => onChecklistToggle(session.id, key)}
                  onValueChange={(secKey, fieldKey, v) => onValueChange(session.id, secKey, fieldKey, v)}
                  onSetLanes={(lanes) => onSetLanes(session.id, lanes)}
                  onSetKpis={(kpiIds) => onSetKpis(session.id, kpiIds)}
                  onAddTask={(t) => onAddTask(session.id, t)}
                  onUpdateTask={(taskId, patch) => onUpdateTask(session.id, taskId, patch)}
                  onRemoveTask={(taskId) => onRemoveTask(session.id, taskId)}
                  onPushTask={(taskId) => onPushTask(session.id, taskId)}
                  onCloseRequest={() => onCloseRequest(session.id)}
                  onCancelRequest={() => onDeleteRequest(session.id)}
                />
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Empty-state CTA shown inside the current-week WeekCard when the user
 *  hasn't started this Saturday yet. Centred, fuchsia-tinted, single
 *  primary action — matching the projection "Empezar plan" pattern. */
function EmptyWeekCTA({ onStart }: { onStart: () => void }) {
  return (
    <div className="bg-black/20 border border-white/[0.08] rounded-2xl p-6 text-center">
      <Sparkles className="w-8 h-8 text-fuchsia-400/70 mx-auto mb-2" />
      <p className="text-sm font-semibold text-zinc-200 mb-1">
        No empezaste esta semana todavía
      </p>
      <p className="text-xs text-zinc-500 mb-4 max-w-md mx-auto">
        Sentate con tiempo (idealmente sábado), abrí la sesión, y respondé con la profundidad
        que sientas que necesitás.
      </p>
      <button
        onClick={onStart}
        className="px-4 py-2 bg-fuchsia-500/15 border border-fuchsia-500/40 hover:bg-fuchsia-500/25 active:bg-fuchsia-500/30 text-fuchsia-300 rounded-lg text-sm font-semibold transition-all inline-flex items-center gap-2"
      >
        <Plus className="w-4 h-4" /> Empezar la sesión
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────────────────────────────
function EmptyState({
  hasPastSessions, onStart, onViewHistory,
}: { hasPastSessions: boolean; onStart: () => void; onViewHistory: () => void }) {
  return (
    <div className="bg-black/30 border border-white/[0.08] rounded-2xl p-10 text-center">
      <Sparkles className="w-10 h-10 text-fuchsia-400/70 mx-auto mb-4" />
      <h2 className="text-lg font-semibold text-zinc-200 mb-2">
        {hasPastSessions ? 'No tenés sesión activa esta semana' : 'Primera sesión SPI'}
      </h2>
      <p className="text-sm text-zinc-500 max-w-md mx-auto mb-6">
        Sentate con tiempo (idealmente sábado), abrí tu sesión, y respondé con la profundidad
        que sientas que necesitás. No hace falta llenar todo — la calidad importa más que la cantidad.
      </p>
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={onStart}
          className="px-5 py-2.5 bg-fuchsia-500/15 border border-fuchsia-500/40 hover:bg-fuchsia-500/25 text-fuchsia-300 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Empezar la sesión
        </button>
        {hasPastSessions && (
          <button
            onClick={onViewHistory}
            className="px-5 py-2.5 bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.12] text-zinc-300 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
          >
            <History className="w-4 h-4" /> Ver sesiones anteriores
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// ACTIVE SESSION
// ─────────────────────────────────────────────────────────────────────
function ActiveSession({
  session, template, projectsById, taskMap, projectionPlans,
  bitacoraEntries, onBitacoraAdd, onBitacoraUpdate, onBitacoraRemove,
  onChecklistToggle, onValueChange, onSetLanes, onSetKpis,
  onAddTask, onUpdateTask, onRemoveTask, onPushTask,
  onCloseRequest, onCancelRequest,
}: {
  session: SPISession
  template: ReturnType<typeof useSPIStore.getState>['template']
  projectsById: ReturnType<typeof useTasksStore.getState>['projects']
  taskMap: ReturnType<typeof useTasksStore.getState>['tasks']
  projectionPlans: ReturnType<typeof useProjectionStore.getState>['plans']
  bitacoraEntries: import('@/lib/spi/types').BitacoraEntry[]
  onBitacoraAdd: (e: Omit<import('@/lib/spi/types').BitacoraEntry, 'id' | 'createdAt' | 'updatedAt'>) => string
  onBitacoraUpdate: (id: string, patch: Partial<import('@/lib/spi/types').BitacoraEntry>) => void
  onBitacoraRemove: (id: string) => void
  onChecklistToggle: (key: string) => void
  onValueChange: (sectionKey: string, fieldKey: string, value: string) => void
  onSetLanes: (lanes: string[]) => void
  onSetKpis: (kpiIds: string[]) => void
  onAddTask: (t: Omit<SPITask, 'id'>) => string
  onUpdateTask: (taskId: string, patch: Partial<SPITask>) => void
  onRemoveTask: (taskId: string) => void
  onPushTask: (taskId: string) => void
  onCloseRequest: () => void
  onCancelRequest: () => void
}) {
  const [showLanePicker, setShowLanePicker] = useState(false)
  const weekLabel = useMemo(() => {
    const [y, m, d] = session.weekStartDate.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    return date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }, [session.weekStartDate])

  const isClosed = !!session.closedAt
  // Defensive: a session pulled from Supabase before these fields existed
  // could be missing them. Default to safe empties so renders don't crash.
  const safeMainChecklist = session.mainChecklist ?? {}
  // Forzamos que 'estrategico' SIEMPRE esté incluido — es obligatorio
  // y contiene KPIs + cascada de metas. Las sesiones viejas que no lo
  // tengan se actualizan implícitamente al render.
  const rawSelectedLanes = Array.isArray(session.selectedLanes) ? session.selectedLanes : []
  const safeSelectedLanes = rawSelectedLanes.length > 0 && !rawSelectedLanes.includes('estrategico')
    ? ['estrategico', ...rawSelectedLanes]
    : rawSelectedLanes
  // Forzamos el orden de lanes al render: estrategico SIEMPRE primero,
  // después tactico → reflexivo → profundo. El template se persiste en
  // localStorage (Zustand persist), así que sesiones viejas pueden tener
  // un orden distinto cargado — sin este sort, tactico podía aparecer
  // arriba de estrategico cuando ambos estaban activos.
  const LANE_ORDER = ['estrategico', 'tactico', 'reflexivo', 'profundo']
  const rawLanes = Array.isArray(template.lanes) ? template.lanes : []
  const safeLanes = [...rawLanes].sort((a, b) => {
    const ai = LANE_ORDER.indexOf(a.key)
    const bi = LANE_ORDER.indexOf(b.key)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
  const checklistDone = Object.values(safeMainChecklist).filter(Boolean).length
  const checklistTotal = Object.keys(safeMainChecklist).length

  // Breadcrumb up to projection — shows "Marzo · Q1 · 2026" linking out.
  const [y, m] = session.weekStartDate.split('-')
  const monthKey = `${y}-${m}`
  const monthN = parseInt(m, 10)
  const quarterN = monthN <= 3 ? 1 : monthN <= 6 ? 2 : monthN <= 9 ? 3 : 4
  const monthName = new Date(parseInt(y, 10), monthN - 1, 1)
    .toLocaleDateString('es-AR', { month: 'long' })
  const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1)

  return (
    <div className="space-y-4">
      {/* Session header */}
      <div className="bg-black/30 border border-fuchsia-500/20 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-fuchsia-400/70">
              Sesión de · Semana {weekOfQuarter(session.weekStartDate)} / 12 del Q{quarterN}
            </p>
            <p className="text-base font-semibold text-zinc-200 capitalize">{weekLabel}</p>
            {/* Projection breadcrumb — links each level to /proyeccion. */}
            <p className="text-[10px] text-zinc-600 mt-1">
              Parte de{' '}
              <a href={`/proyeccion?level=month&period=${monthKey}`} className="text-zinc-400 hover:text-indigo-300 transition-colors">
                {monthLabel} {y}
              </a>
              <span className="text-zinc-700"> · </span>
              <a href={`/proyeccion?level=quarter&period=${y}-Q${quarterN}`} className="text-zinc-400 hover:text-indigo-300 transition-colors">
                Q{quarterN} {y}
              </a>
              <span className="text-zinc-700"> · </span>
              <a href={`/proyeccion?level=year&period=${y}`} className="text-zinc-400 hover:text-indigo-300 transition-colors">
                {y}
              </a>
            </p>
            {isClosed && session.score !== undefined && (
              <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                <Trophy className="w-3 h-3" /> Cerrada · puntuación {session.score}%
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <CalendarSnapshotButton session={session} />
            <CopySessionButton session={session} template={template} />
            {!isClosed && (
              <>
                <button
                  onClick={onCancelRequest}
                  title="Descartar esta sesión sin guardarla (no afecta tu streak ni XP)"
                  className="px-2.5 py-1.5 bg-white/[0.03] border border-white/[0.08] hover:border-red-500/40 hover:text-red-400 text-zinc-500 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" /> Cancelar
                </button>
                <button
                  onClick={onCloseRequest}
                  className="px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 text-emerald-300 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                >
                  <Trophy className="w-3.5 h-3.5" /> Cerrar SPI
                </button>
              </>
            )}
          </div>
        </div>

        {/* Main checklist */}
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
            📋 Protocolo · {checklistDone}/{checklistTotal}
          </p>
          <div className="space-y-1.5">
            {template.mainChecklist.map((item) => {
              const checked = !!safeMainChecklist[item.key]
              return (
                <button
                  key={item.key}
                  onClick={() => onChecklistToggle(item.key)}
                  className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors group"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                    checked
                      ? 'bg-emerald-500/20 border-emerald-500'
                      : 'border-white/[0.12] group-hover:border-zinc-500'
                  }`}>
                    {checked && <Check className="w-3 h-3 text-emerald-400" />}
                  </div>
                  <span className={`text-sm transition-colors ${checked ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>
                    {item.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Mini-calendario del mes — orienta al user respecto a qué semana
          está planificando. Resaltada la ventana Mon→Sun del SPI activo. */}
      <SpiWeekMiniCalendar weekStartDate={session.weekStartDate} />

      {/* Bitácora de Calibración — always visible, lane-agnostic. */}
      <BitacoraBlock
        entries={bitacoraEntries}
        onAdd={onBitacoraAdd}
        onUpdate={onBitacoraUpdate}
        onRemove={onBitacoraRemove}
      />

      {/* ── Lane picker — full-screen-ish card when no lanes picked yet ── */}
      {safeSelectedLanes.length === 0 && !showLanePicker && (
        <LanePicker
          lanes={safeLanes}
          selected={[]}
          onConfirm={(picked) => onSetLanes(picked)}
        />
      )}

      {/* ── Lane bar (when lanes ARE picked) ─────────────────────────── */}
      {safeSelectedLanes.length > 0 && (
        <LaneBar
          lanes={safeLanes}
          selectedKeys={safeSelectedLanes}
          onAdjust={() => setShowLanePicker(true)}
        />
      )}

      {/* ── Lane picker modal (when re-adjusting) ────────────────────── */}
      <AnimatePresence>
        {showLanePicker && (
          <LanePickerModal
            lanes={safeLanes}
            selected={safeSelectedLanes}
            onClose={() => setShowLanePicker(false)}
            onConfirm={(picked) => { onSetLanes(picked); setShowLanePicker(false) }}
          />
        )}
      </AnimatePresence>

      {/* ── Sections — only those tagged with a selected lane, grouped ── */}
      {safeSelectedLanes.length > 0 && safeLanes
        .filter((lane) => safeSelectedLanes.includes(lane.key))
        .map((lane) => {
          const laneSections = template.sections.filter((sec) => sec.laneKey === lane.key)
          if (laneSections.length === 0) return null
          return (
            <div key={lane.key} className="space-y-3">
              {/* Lane header */}
              <div className="flex items-center gap-2 px-1 pt-2">
                <span className="text-base">{lane.emoji}</span>
                <h3 className="text-[11px] font-mono uppercase tracking-widest" style={{ color: lane.color }}>
                  {lane.title}
                </h3>
                <div className="flex-1 h-px" style={{ background: `${lane.color}30` }} />
              </div>
              {/* In the strategic lane, surface year/quarter/month anchors
                  from Proyección up top so the user doesn't have to re-write
                  them every week — they only fill the weekly variation. */}
              {lane.key === 'estrategico' && (
                <ProjectionContext
                  weekStartDate={session.weekStartDate}
                  plans={projectionPlans}
                />
              )}
              {laneSections.map((section) => (
                <Section
                  key={section.key}
                  section={section}
                  session={session}
                  parentKey=""
                  onValueChange={onValueChange}
                  onSetKpis={onSetKpis}
                />
              ))}
            </div>
          )
        })}
      {/* Sections WITHOUT a laneKey (e.g. user-added in editor without
          assigning a lane) — always render. */}
      {safeSelectedLanes.length > 0 && template.sections
        .filter((sec) => !sec.laneKey)
        .map((section) => (
          <Section
            key={section.key}
            section={section}
            session={session}
            parentKey=""
            onValueChange={onValueChange}
            onSetKpis={onSetKpis}
          />
        ))}

      {/* Laboratorio — preset picker for mind/emotion exercises.
          Linked to this SPI session via spiSessionId so cualquier sesión
          que arranques desde acá queda asociada al SPI semanal. */}
      <LabBlock spiSessionId={session.id} isClosed={isClosed} />

      {/* Tasks block */}
      <TasksBlock
        session={session}
        projectsById={projectsById}
        taskMap={taskMap}
        onAdd={onAddTask}
        onUpdate={onUpdateTask}
        onRemove={onRemoveTask}
        onPush={onPushTask}
      />

      {/* Scoreboard de KPIs — métricas de output que el usuario trackea
          DURANTE TODA LA SEMANA, no solo al planear. Por eso si el SPI
          está cerrado PERO la semana sigue siendo la actual, los KPIs
          siguen editables.
          Tratamos COMO ACTIVA tanto la sesión que se está editando hoy
          (ritual sábado para próxima semana) como la sesión cuya semana
          Mon→Sun contiene HOY (la que sigue viva hasta domingo noche). */}
      <KpiScoreboard
        session={session}
        isClosed={
          isClosed
          && session.weekStartDate !== lastSaturdayYmd()
          && session.weekStartDate !== activeWeekAnchorYmd()
        }
        onSelectedChange={onSetKpis}
        onValueChange={onValueChange}
      />

      {/* KPIs de hábitos de la semana — espejo del snapshot mensual.
          Si la sesión está cerrada y tiene snapshot guardado, mostramos
          la imagen CONGELADA. Si está abierta o cerrada sin snapshot,
          calculamos en vivo desde habitsStore. */}
      <WeekSnapshotContainer session={session} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// LAB BLOCK — preset picker + active sessions linked to this SPI
// ─────────────────────────────────────────────────────────────────────
function LabBlock({ spiSessionId, isClosed }: { spiSessionId: string; isClosed: boolean }) {
  const sessions = useLabStore((s) => s.sessions)
  const createSession = useLabStore((s) => s.createSession)
  const [showPicker, setShowPicker] = useState(false)
  const [runningSessionId, setRunningSessionId] = useState<string | null>(null)

  const linked = useMemo(
    () => sessions.filter((s) => s.spiSessionId === spiSessionId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [sessions, spiSessionId]
  )

  const launch = (exerciseKey: string) => {
    const id = createSession({ exerciseKey, spiSessionId })
    if (id) {
      setShowPicker(false)
      setRunningSessionId(id)
    }
  }

  return (
    <div className="bg-black/20 border border-fuchsia-500/20 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-fuchsia-400" />
          <h3 className="text-sm font-semibold text-zinc-200">Laboratorio</h3>
          <span className="text-[10px] font-mono text-zinc-600">· trabajá un ejercicio mental/emocional esta semana</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href="/laboratorio"
            className="text-[10px] text-zinc-500 hover:text-fuchsia-300 transition-colors px-2 py-1 rounded hover:bg-white/[0.03]">
            Abrir Lab completo →
          </Link>
          {!isClosed && (
            <button onClick={() => setShowPicker(true)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-fuchsia-500/15 border border-fuchsia-500/40 hover:bg-fuchsia-500/25 text-fuchsia-300 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Elegir ejercicio
            </button>
          )}
        </div>
      </div>

      {linked.length === 0 ? (
        <p className="text-[11px] text-zinc-600 italic">
          No iniciaste ningún ejercicio en esta sesión. Tocá &quot;Elegir ejercicio&quot; para arrancar uno —
          queda guardado en el Laboratorio y vinculado a este SPI.
        </p>
      ) : (
        <div className="space-y-2 mt-2">
          {linked.map((sess) => {
            const ex = findExercise(sess.exerciseKey)
            const cat = findCategory(sess.categoryKey)
            return (
              <button key={sess.id} onClick={() => setRunningSessionId(sess.id)}
                className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.03] border border-white/[0.08] hover:border-fuchsia-500/30 transition-colors group">
                <span className="text-base">{ex?.emoji ?? '🧪'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold text-zinc-200 truncate">{sess.title}</p>
                    {cat && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border"
                        style={{ borderColor: cat.color + '40', color: cat.color, background: cat.color + '10' }}>
                        {cat.emoji} {cat.title}
                      </span>
                    )}
                    {sess.status === 'closed' && (
                      <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border bg-emerald-500/15 border-emerald-500/40 text-emerald-300">
                        cerrada
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{ex?.title ?? '(eliminado)'}</p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-fuchsia-400" />
              </button>
            )
          })}
        </div>
      )}

      <AnimatePresence>
        {showPicker && (
          <LabPickerModal onClose={() => setShowPicker(false)} onPick={launch} />
        )}
        {runningSessionId && (
          <LabRunnerModal sessionId={runningSessionId} onClose={() => setRunningSessionId(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

function LabPickerModal({
  onClose, onPick,
}: { onClose: () => void; onPick: (exerciseKey: string) => void }) {
  const [activeCat, setActiveCat] = useState<string>(LAB_CATEGORIES[0]?.key ?? '')
  const exercises = exercisesByCategory(activeCat)
  const cat = findCategory(activeCat)

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-black/30 border border-fuchsia-500/30 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
      >
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-fuchsia-400" /> Elegí un ejercicio
            </h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">Se va a guardar en el Lab y vinculado a este SPI.</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category chips */}
        <div className="px-5 py-3 border-b border-white/[0.05] flex flex-wrap gap-1.5">
          {LAB_CATEGORIES.map((c) => {
            const isActive = c.key === activeCat
            return (
              <button key={c.key} onClick={() => setActiveCat(c.key)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                  isActive ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-200 border-white/[0.08] bg-white/[0.03]'
                }`}
                style={isActive ? {
                  background: c.color + '20',
                  borderColor: c.color + '60',
                  color: c.color,
                } : {}}>
                {c.emoji} {c.title}
              </button>
            )
          })}
        </div>

        {/* Exercise list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {cat?.intro && (
            <p className="text-xs text-zinc-400 italic leading-relaxed mb-2">{cat.intro}</p>
          )}
          {exercises.map((ex) => (
            <button key={ex.key} onClick={() => onPick(ex.key)}
              className="w-full text-left p-3 rounded-2xl border bg-white/[0.03] border-white/[0.08] hover:border-fuchsia-500/40 hover:bg-white/[0.03] transition-colors flex items-start gap-3 group">
              <span className="text-xl shrink-0">{ex.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-semibold text-zinc-100">{ex.title}</h4>
                  {ex.isQuick && (
                    <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-500/30 text-amber-300">
                      rápido
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5">{ex.shortDescription}</p>
              </div>
              <Plus className="w-4 h-4 text-zinc-600 group-hover:text-fuchsia-400 mt-1 shrink-0" />
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

function LabRunnerModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
    >
      <motion.div
        initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 12 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-black/30 border border-fuchsia-500/30 rounded-2xl w-full max-w-3xl my-8 p-5"
      >
        <ExerciseRunner sessionId={sessionId} onBack={onClose} />
      </motion.div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// LANE PICKER — inline card shown when no lanes selected yet
// ─────────────────────────────────────────────────────────────────────
function LanePicker({
  lanes, selected, onConfirm,
}: {
  lanes: import('@/lib/spi/types').SPILane[]
  selected: string[]
  onConfirm: (picked: string[]) => void
}) {
  // Estratégico SIEMPRE va activo — contiene KPIs + cascada de metas
  // que son el núcleo del SPI semanal. Forzamos que esté en el initial
  // y bloqueamos su toggle. Los otros 3 (Táctico, Reflexivo, Profundo)
  // son opcionales para profundizar la sesión.
  const REQUIRED_LANE = 'estrategico'
  const [picked, setPicked] = useState<string[]>(() => {
    const initial = Array.isArray(selected) ? selected : []
    return initial.includes(REQUIRED_LANE) ? initial : [REQUIRED_LANE, ...initial]
  })
  const toggle = (key: string) => {
    if (key === REQUIRED_LANE) return  // no se puede desactivar
    setPicked((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])
  }
  return (
    <div className="bg-black/30 border border-fuchsia-500/30 rounded-2xl p-6">
      <h2 className="text-base font-semibold text-zinc-100 mb-1">¿En dónde querés concentrarte hoy?</h2>
      <p className="text-xs text-zinc-500 mb-5">
        <span className="text-blue-300 font-semibold">Estratégico</span> está siempre activo — es donde
        viven los KPIs y la cascada de metas. Activá los otros 3 carriles para profundizar la sesión.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        {lanes.map((lane) => {
          const isPicked = picked.includes(lane.key)
          const isRequired = lane.key === REQUIRED_LANE
          return (
            <button
              key={lane.key}
              onClick={() => toggle(lane.key)}
              disabled={isRequired}
              className={`text-left p-4 rounded-2xl border-2 transition-all ${
                isPicked
                  ? 'bg-white/[0.03] shadow-lg'
                  : 'bg-black/20 border-white/[0.08] hover:border-white/[0.12]'
              } ${isRequired ? 'cursor-default' : ''}`}
              style={isPicked ? {
                borderColor: lane.color,
                boxShadow: `0 0 0 1px ${lane.color}40, 0 8px 24px -8px ${lane.color}40`,
              } : {}}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xl">{lane.emoji}</span>
                <span className="font-semibold text-sm" style={{ color: isPicked ? lane.color : '#d4d4d8' }}>
                  {lane.title}
                </span>
                {isRequired && (
                  <span
                    className="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                    style={{
                      background: `${lane.color}22`,
                      border: `1px solid ${lane.color}66`,
                      color: lane.color,
                    }}
                    title="Estratégico está siempre activo — contiene KPIs y cascada de metas"
                  >
                    Obligatorio
                  </span>
                )}
                {isPicked && !isRequired && (
                  <Check className="w-3.5 h-3.5 ml-auto" style={{ color: lane.color }} />
                )}
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">{lane.description}</p>
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-between">
        <button
          onClick={() => setPicked(lanes.map((l) => l.key))}
          className="text-xs text-zinc-500 hover:text-fuchsia-300 transition-colors"
        >
          Seleccionar todos
        </button>
        <button
          onClick={() => onConfirm(picked)}
          className="px-4 py-2 bg-fuchsia-500/15 border border-fuchsia-500/40 hover:bg-fuchsia-500/25 text-fuchsia-300 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
        >
          Confirmar {picked.length > 0 && `(${picked.length})`}
        </button>
      </div>
    </div>
  )
}

function LanePickerModal({
  lanes, selected, onConfirm, onClose,
}: {
  lanes: import('@/lib/spi/types').SPILane[]
  selected: string[]
  onConfirm: (picked: string[]) => void
  onClose: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-black/30 border border-fuchsia-500/30 rounded-2xl w-full max-w-2xl overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-white/[0.08] flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-100">Ajustar carriles activos</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">
          <LanePicker lanes={lanes} selected={selected} onConfirm={onConfirm} />
        </div>
      </motion.div>
    </motion.div>
  )
}

function LaneBar({
  lanes, selectedKeys, onAdjust,
}: {
  lanes: import('@/lib/spi/types').SPILane[]
  selectedKeys: string[]
  onAdjust: () => void
}) {
  const selectedLanes = lanes.filter((l) => selectedKeys.includes(l.key))
  return (
    <div className="flex items-center gap-2 flex-wrap px-1">
      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">carriles activos:</span>
      {selectedLanes.map((lane) => (
        <span
          key={lane.key}
          className="text-[11px] font-mono px-2 py-0.5 rounded border"
          style={{
            color: lane.color,
            borderColor: `${lane.color}40`,
            background: `${lane.color}15`,
          }}
        >
          {lane.emoji} {lane.title}
        </span>
      ))}
      <button
        onClick={onAdjust}
        className="text-[10px] text-zinc-500 hover:text-fuchsia-300 transition-colors px-2 py-0.5 ml-auto"
      >
        ajustar
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// WEEKLY GOALS BY PRINCIPAL AREA
// ─────────────────────────────────────────────────────────────────────
/** Renderiza dinámicamente las "metas semanales por área principal"
 *  dentro de la sección `que_buscamos` del SPI semanal. Para cada área
 *  marcada como principal en el plan anual:
 *   1. Muestra el label del área.
 *   2. Lista las 3 sub-metas mensuales (read-only) como contexto top-down.
 *   3. Provee un textarea de meta semanal específica para esa área.
 *
 *  Persistencia: cada meta semanal vive en
 *  `session.values.que_buscamos.meta_${areaKey}_sem` — un campo dinámico
 *  por área. No hay que tocar el schema porque el storage es key/value. */
const AREA_LABEL_MAP: Record<string, string> = {
  fisica: 'Salud Física',
  mental_emocional: 'Salud Mental/Emocional',
  mental: 'Salud Mental',         // legacy pre-v2
  emocional: 'Salud Emocional',   // legacy pre-v2
  espiritual: 'Conexión Espiritual',
  relaciones: 'Relaciones Personales',
  profesional: 'Profesional',
  financiera: 'Salud Financiera',
  legado: 'Propósito / Legado',
  hobbies: 'Hobbies / Pasiones',
  creatividad: 'Creatividad',
}

function WeeklyGoalsByArea({
  session, fullKey, onValueChange, onSetKpis,
}: {
  session: SPISession
  fullKey: string
  onValueChange: (sectionKey: string, fieldKey: string, value: string) => void
  onSetKpis: (kpiIds: string[]) => void
}) {
  const plans = useProjectionStore((s) => s.plans)
  // La semana SPI arranca el SÁBADO y cubre 7 días (Sáb → Vie). Cuando
  // la semana cae a caballo entre dos meses (típico fin de mes), el mes
  // del weekStartDate (sábado) NO necesariamente es el mes donde el
  // usuario llenó el plan mensual. Por eso elegimos el mes que contiene
  // la MAYORÍA de los días de la semana — esa es la "intención" real
  // del mes que estamos cerrando.
  const [yearStr0, monthStr0, dayStr0] = session.weekStartDate.split('-')
  const sat = new Date(parseInt(yearStr0, 10), parseInt(monthStr0, 10) - 1, parseInt(dayStr0, 10))
  // Contar días por mes para los 7 días Sáb → Vie.
  const counts = new Map<string, number>()
  for (let i = 0; i < 7; i++) {
    const d = new Date(sat)
    d.setDate(sat.getDate() + i)
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    counts.set(mk, (counts.get(mk) ?? 0) + 1)
  }
  // Mes con más días gana. Si hay empate (raro pero posible), gana el
  // segundo (el mes "que viene") porque Sat-Sun + 5 weekdays va al
  // mes nuevo en la práctica.
  let monthKey = `${yearStr0}-${monthStr0}`
  let bestCount = 0
  for (const [mk, c] of counts) {
    if (c >= bestCount) { monthKey = mk; bestCount = c }
  }
  const [yearStr, monthStr] = monthKey.split('-')
  const yearKey = yearStr
  // Quarter del mes elegido (mismo cálculo que antes pero sobre el mes
  // ganador, no sobre el del sábado).
  const monthN = parseInt(monthStr, 10)
  const qN = monthN <= 3 ? 1 : monthN <= 6 ? 2 : monthN <= 9 ? 3 : 4
  const quarterKey = `${yearStr}-Q${qN}`
  const annualPlan = plans.find((p) => p.level === 'year' && p.periodKey === yearKey)
  const quarterPlan = plans.find((p) => p.level === 'quarter' && p.periodKey === quarterKey)
  const monthPlan = plans.find((p) => p.level === 'month' && p.periodKey === monthKey)
  const principalesCsv = annualPlan?.values?.metas_anuales?.principales ?? ''
  const principalKeys = principalesCsv.split(',').filter(Boolean)

  if (principalKeys.length === 0) {
    return (
      <div className="space-y-3">
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
          <p className="text-xs text-amber-200/80">
            No marcaste áreas principales en el plan anual.
          </p>
          <p className="text-[10px] text-zinc-500 mt-1">
            Andá a Proyección → Anual, marcá las áreas que vas a trabajar este año, y van a aparecer acá con sus sub-metas mensuales.
          </p>
        </div>
        {/* KPIs generales — disponibles aunque no haya áreas principales,
            así el user puede tracking transversal igual. */}
        <GeneralKpiChips
          selectedKpiIds={session.selectedKpiIds ?? []}
          onSelectedChange={onSetKpis}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {principalKeys.map((k) => {
        // Sub-metas del trimestre y del mes. Las keys son las mismas en
        // ambos planes (`{areaKey}_subN`) — solo difiere el plan del que
        // leemos. Antes solo leíamos las del mes, así que la columna
        // "Trimestral" no aparecía aunque el usuario las tuviera cargadas.
        const quarterlySubs = [1, 2, 3]
          .map((i) => quarterPlan?.values?.principal_cascade?.[`${k}_sub${i}`] ?? '')
          .filter((s) => s.trim().length > 0)
        const monthlySubs = [1, 2, 3]
          .map((i) => monthPlan?.values?.principal_cascade?.[`${k}_sub${i}`] ?? '')
          .filter((s) => s.trim().length > 0)
        const annualMeta = (annualPlan?.values?.metas_anuales?.[k] ?? '').trim()
        const fieldKey = `meta_${k}_sem`
        const weeklyMeta = session.values[fullKey]?.[fieldKey] ?? ''
        const label = AREA_LABEL_MAP[k] ?? k
        return (
          <div key={k} className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-amber-400">⭐</span>
              <span className="text-xs font-semibold text-amber-200">{label}</span>
            </div>
            {/* Meta anual (read-only) — mismo estilo que las cajas
                trimestral/mensual: fondo zinc oscuro, borde, label
                en mono uppercase arriba. Antes era un párrafo finito
                gris itálico y se perdía visualmente al lado de las
                cajas grandes. */}
            {annualMeta ? (
              <div className="space-y-0.5 mb-1.5 bg-white/[0.02] border border-white/[0.08] rounded px-2 py-1.5">
                <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-600 mb-0.5">
                  Anual
                </p>
                <p className="text-[11px] text-zinc-300 leading-snug whitespace-pre-wrap">
                  {annualMeta}
                </p>
              </div>
            ) : (
              <p className="text-[10px] text-zinc-600 italic mb-1.5">
                Sin meta anual cargada para esta área. Definila en el plan anual.
              </p>
            )}
            {/* Sub-metas trimestrales (read-only) */}
            {quarterlySubs.length > 0 ? (
              <div className="space-y-0.5 mb-1.5 bg-white/[0.02] border border-white/[0.08] rounded px-2 py-1.5">
                <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-600 mb-0.5">
                  Trimestral · Q{qN}
                </p>
                <ul className="space-y-0.5">
                  {quarterlySubs.map((s, i) => (
                    <li key={i} className="text-[11px] text-zinc-300 leading-snug">
                      <span className="text-amber-400/60 font-mono text-[10px]">{i + 1}.</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-[10px] text-zinc-600 italic mb-1.5">
                Sin sub-metas trimestrales cargadas para esta área. Definilas en el plan trimestral.
              </p>
            )}
            {/* Sub-metas mensuales (read-only) */}
            {monthlySubs.length > 0 ? (
              <div className="space-y-0.5 mb-2 bg-white/[0.02] border border-white/[0.08] rounded px-2 py-1.5">
                <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-600 mb-0.5">Mensual</p>
                <ul className="space-y-0.5">
                  {monthlySubs.map((s, i) => (
                    <li key={i} className="text-[11px] text-zinc-300 leading-snug">
                      <span className="text-amber-400/60 font-mono text-[10px]">{i + 1}.</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-[10px] text-zinc-600 italic mb-2">
                Sin sub-metas mensuales cargadas. Definilas en el plan mensual.
              </p>
            )}
            {/* Meta semanal — input dinámico por área */}
            <label className="text-[10px] font-mono uppercase tracking-wider text-fuchsia-400/70 mb-1 block">
              Esta semana
            </label>
            <AutoGrowTextarea
              value={weeklyMeta}
              onChange={(e) => onValueChange(fullKey, fieldKey, e.target.value)}
              placeholder="Qué movés concretamente esta semana en esta área?"
              minRows={2}
              className="w-full text-xs bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1.5 text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-fuchsia-500/40"
            />
            {/* Chips de KPIs filtrados por esta área. Toggle para
                activar/desactivar en la semana, "+ KPI" para crear uno
                nuevo de esta área en la library inline. */}
            <AreaKpiChips
              areaKey={k}
              areaLabel={label}
              selectedKpiIds={session.selectedKpiIds ?? []}
              onSelectedChange={onSetKpis}
            />
          </div>
        )
      })}
      {/* KPIs generales — no atados a ninguna área principal del año.
          Sirven para tracking transversal (ej. Deep Thinking Time) que el
          user quiere recordar agendar cada semana aunque no corresponda a
          un área. Se renderizan SIEMPRE, aunque no haya ninguno creado —
          el empty state explica el caso de uso. */}
      <GeneralKpiChips
        selectedKpiIds={session.selectedKpiIds ?? []}
        onSelectedChange={onSetKpis}
      />
    </div>
  )
}

/** Chips de KPIs filtrados por área. Cada chip representa un KPI de la
 *  library cuyo `areaKey` coincide; al togglear se agrega/quita de
 *  `session.selectedKpiIds` (los KPIs activos para ESTA semana).
 *
 *  El botón "+ KPI" abre un mini-modal para crear un KPI nuevo con el
 *  área pre-cargada. Al crearlo, se suma a la library Y se activa en
 *  la semana actual (queda chequeado).
 *
 *  La herencia semana a semana ocurre en el store (al crear sesión);
 *  acá solo manejamos el set ACTUAL. */
function AreaKpiChips({
  areaKey, areaLabel, selectedKpiIds, onSelectedChange,
}: {
  areaKey: string
  areaLabel: string
  selectedKpiIds: string[]
  onSelectedChange: (next: string[]) => void
}) {
  // IMPORTANTE: el selector NO puede hacer `.filter()` adentro porque
  // devuelve un array nuevo en cada render → React detecta referencia
  // distinta → re-render → loop infinito que crashea la página entera.
  // Suscribimos al array completo (referencia estable) y filtramos en
  // useMemo. Mismo patrón que usamos en todos los demás stores.
  const definitions = useKpisStore((s) => s.definitions)
  const areaKpis = useMemo(
    () => definitions.filter((d) => !d.archivedAt && d.areaKey === areaKey),
    [definitions, areaKey]
  )
  const addKpi = useKpisStore((s) => s.addKpi)
  const [showCreate, setShowCreate] = useState(false)

  const toggle = (id: string) => {
    if (selectedKpiIds.includes(id)) onSelectedChange(selectedKpiIds.filter((x) => x !== id))
    else onSelectedChange([...selectedKpiIds, id])
  }

  return (
    <div className="mt-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[9px] font-mono uppercase tracking-wider text-fuchsia-300/60 mr-1 self-center">
          KPIs a trackear:
        </span>
        {areaKpis.map((kpi) => {
          const active = selectedKpiIds.includes(kpi.id)
          return (
            <button
              key={kpi.id}
              onClick={() => toggle(kpi.id)}
              title={active ? 'Click para sacarlo de esta semana' : 'Click para activarlo esta semana'}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors flex items-center gap-1 ${
                active
                  ? 'bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-200'
                  : 'bg-white/[0.03] border-white/[0.08] text-zinc-500 hover:border-white/[0.12] hover:text-zinc-300'
              }`}
            >
              <span>{kpi.icon}</span>
              <span>{kpi.name}</span>
              {kpi.target !== undefined && (
                <span className="text-zinc-600 ml-0.5">/{kpi.target}{kpi.kind === 'percent' ? '%' : ''}</span>
              )}
            </button>
          )
        })}
        <button
          onClick={() => setShowCreate(true)}
          className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-dashed border-fuchsia-500/40 text-fuchsia-300/80 hover:border-fuchsia-500 hover:bg-fuchsia-500/10 hover:text-fuchsia-200 transition-colors flex items-center gap-1"
        >
          + KPI
        </button>
      </div>

      {showCreate && (
        <QuickKpiModal
          areaKey={areaKey}
          areaLabel={areaLabel}
          onClose={() => setShowCreate(false)}
          onCreate={(input) => {
            const id = addKpi(input)
            // Lo activamos en la semana actual ya que recién lo creó.
            onSelectedChange([...selectedKpiIds, id])
            setShowCreate(false)
          }}
        />
      )}
    </div>
  )
}

/** Chips de KPIs GENERALES — los que no están atados a ninguna área de
 *  la rueda. Sirven para tracking transversal tipo "Deep Thinking Time",
 *  "Revisar SPI", "Limpieza inbox" — cosas que querés recordar agendar
 *  semana a semana pero que no son de un área específica.
 *
 *  Filtra `!d.areaKey` (undefined o ''). El "+ KPI general" crea uno
 *  nuevo con areaKey omitido y group='General'. */
function GeneralKpiChips({
  selectedKpiIds, onSelectedChange,
}: {
  selectedKpiIds: string[]
  onSelectedChange: (next: string[]) => void
}) {
  const definitions = useKpisStore((s) => s.definitions)
  const generalKpis = useMemo(
    () => definitions.filter((d) => !d.archivedAt && !d.areaKey),
    [definitions]
  )
  const addKpi = useKpisStore((s) => s.addKpi)
  const [showCreate, setShowCreate] = useState(false)

  const toggle = (id: string) => {
    if (selectedKpiIds.includes(id)) onSelectedChange(selectedKpiIds.filter((x) => x !== id))
    else onSelectedChange([...selectedKpiIds, id])
  }

  return (
    <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-indigo-400">🧭</span>
        <span className="text-xs font-semibold text-indigo-200">General</span>
        <span className="text-[10px] text-zinc-500 italic">
          — KPIs transversales, no atados a ningún área
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[9px] font-mono uppercase tracking-wider text-indigo-300/60 mr-1 self-center">
          KPIs a trackear:
        </span>
        {generalKpis.map((kpi) => {
          const active = selectedKpiIds.includes(kpi.id)
          return (
            <button
              key={kpi.id}
              onClick={() => toggle(kpi.id)}
              title={active ? 'Click para sacarlo de esta semana' : 'Click para activarlo esta semana'}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors flex items-center gap-1 ${
                active
                  ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-200'
                  : 'bg-white/[0.03] border-white/[0.08] text-zinc-500 hover:border-white/[0.12] hover:text-zinc-300'
              }`}
            >
              <span>{kpi.icon}</span>
              <span>{kpi.name}</span>
              {kpi.target !== undefined && (
                <span className="text-zinc-600 ml-0.5">/{kpi.target}{kpi.kind === 'percent' ? '%' : ''}</span>
              )}
            </button>
          )
        })}
        <button
          onClick={() => setShowCreate(true)}
          className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-dashed border-indigo-500/40 text-indigo-300/80 hover:border-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-200 transition-colors flex items-center gap-1"
        >
          + KPI general
        </button>
      </div>
      {generalKpis.length === 0 && (
        <p className="text-[10px] text-zinc-600 italic mt-1.5">
          Ej.: &quot;Deep Thinking Time&quot; — sentarte a pensar y desgranar qué está
          pasando, no parte de un área pero clave para no perder el norte.
        </p>
      )}

      {showCreate && (
        <QuickKpiModal
          areaKey=""
          areaLabel="General"
          onClose={() => setShowCreate(false)}
          onCreate={(input) => {
            // Stripamos areaKey para que sea estrictamente "sin área".
            // El modal manda areaKey: '' por defecto; el filter de la
            // library trata '' como falsy igual que undefined, pero
            // queremos consistencia con KpisPage que normaliza a undefined.
            const { areaKey: _drop, ...rest } = input
            const id = addKpi({ ...rest, group: 'General' })
            onSelectedChange([...selectedKpiIds, id])
            setShowCreate(false)
          }}
        />
      )}
    </div>
  )
}

/** Mini-modal de creación rápida de KPI con el área pre-cargada. */
function QuickKpiModal({
  areaKey, areaLabel, onClose, onCreate,
}: {
  areaKey: string
  areaLabel: string
  onClose: () => void
  onCreate: (input: Parameters<ReturnType<typeof useKpisStore.getState>['addKpi']>[0]) => void
}) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🎯')
  const [kind, setKind] = useState<'count' | 'percent' | 'boolean'>('count')
  const [target, setTarget] = useState('')

  const canSubmit = name.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-white/[0.08]">
          <h2 className="text-sm font-bold text-white">+ KPI para {areaLabel}</h2>
          <p className="text-[10px] text-zinc-500 mt-0.5">
            Lo agrega a tu library y lo activa esta semana. Editás detalles después en /kpis.
          </p>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value.slice(0, 2))}
              className="w-12 bg-zinc-800 border border-white/[0.12] rounded-lg px-2 py-2 text-center text-lg focus:outline-none focus:border-fuchsia-500"
              maxLength={4}
            />
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre — ej. Sesiones de guitarra"
              className="flex-1 bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500"
            />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(['count', 'percent', 'boolean'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                  kind === k ? 'bg-fuchsia-500/20 border border-fuchsia-500/50 text-fuchsia-200' : 'bg-zinc-800 border border-white/[0.12] text-zinc-400 hover:border-zinc-600'
                }`}
              >
                {k === 'count' && 'Contador'}
                {k === 'percent' && '%'}
                {k === 'boolean' && 'Sí/No'}
              </button>
            ))}
          </div>
          {kind !== 'boolean' && (
            <input
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={`Target ${kind === 'percent' ? '0-100' : '(opcional)'}`}
              className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500"
            />
          )}
        </div>
        <div className="px-5 py-3 border-t border-white/[0.08] flex gap-2">
          <button onClick={onClose} className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-white/[0.08] text-zinc-300 text-xs font-semibold">
            Cancelar
          </button>
          <button
            disabled={!canSubmit}
            onClick={() => {
              const tNum = target.trim() ? parseFloat(target) : undefined
              onCreate({
                name: name.trim(),
                icon: icon || '🎯',
                color: '#a855f7',
                kind,
                target: Number.isFinite(tNum) ? tNum : undefined,
                areaKey,
                group: areaLabel,
              })
            }}
            className="flex-1 px-3 py-1.5 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/30 hover:bg-fuchsia-500/25 disabled:opacity-40 text-fuchsia-300 text-xs font-bold"
          >
            Crear y activar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// SECTION (recursive — supports subsections)
// ─────────────────────────────────────────────────────────────────────
function Section({
  section, session, parentKey, onValueChange, onSetKpis,
}: {
  section: SPISection
  session: SPISession
  parentKey: string
  onValueChange: (sectionKey: string, fieldKey: string, value: string) => void
  /** Solo lo usa la subsección `que_buscamos` para los chips de KPI por
   *  área. El resto lo ignora. */
  onSetKpis?: (kpiIds: string[]) => void
}) {
  // Always start COLLAPSED — the user explicitly asked for everything to
  // be closed by default in every SPI/Proyección view (Vista de Águila,
  // Anual, Trimestre, Mes, Semanal). They open what they need, when they
  // need it, instead of scrolling past a wall of empty fields.
  const [open, setOpen] = useState(false)
  const fullKey = parentKey ? `${parentKey}.${section.key}` : section.key

  return (
    <div className={`bg-black/20 border border-white/[0.08] rounded-2xl ${parentKey ? 'ml-4 mt-2' : ''}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/[0.02] transition-colors rounded-t-xl"
      >
        <span className="text-lg shrink-0">{section.emoji}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-zinc-200">{section.title}</h3>
          {section.intro && !open && (
            <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1">{section.intro}</p>
          )}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-white/[0.05] pt-4">
              {section.intro && (
                <p className="text-xs text-zinc-400 italic leading-relaxed">{section.intro}</p>
              )}
              {/* Render dinámico para "Qué buscás esta semana?": itera las
                  áreas principales del plan anual + sus sub-metas mensuales
                  como contexto, en lugar de los 2 fields hardcoded. */}
              {section.key === 'que_buscamos' && (
                <WeeklyGoalsByArea
                  session={session}
                  fullKey={fullKey}
                  onValueChange={onValueChange}
                  onSetKpis={onSetKpis ?? (() => {})}
                />
              )}
              {section.fields?.map((field) => (
                <Field
                  key={field.key}
                  field={field}
                  value={session.values[fullKey]?.[field.key] ?? ''}
                  onChange={(v) => onValueChange(fullKey, field.key, v)}
                />
              ))}
              {section.subsections?.map((sub) => (
                <Section
                  key={sub.key}
                  section={sub}
                  session={session}
                  parentKey={fullKey}
                  onValueChange={onValueChange}
                  onSetKpis={onSetKpis}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// SPI WEEK MINI CALENDAR — mes en curso con la semana planificada
// (Mon→Sun) resaltada. Mismo lenguaje visual que el QuarterMiniCalendar
// de la proyección trimestral, adaptado a 1 mes.
// ─────────────────────────────────────────────────────────────────────
const SPI_MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function getIsoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)
}

function SpiWeekMiniCalendar({ weekStartDate }: { weekStartDate: string }) {
  // SPI session anchored on Saturday `weekStartDate`. La SEMANA PLANIFICADA
  // arranca el lunes siguiente (Sat+2) y termina el domingo (Sat+8).
  const [yStr, mStr, dStr] = weekStartDate.split('-').map(Number)
  const saturday = new Date(yStr, mStr - 1, dStr)
  const plannedMonday = new Date(saturday); plannedMonday.setDate(saturday.getDate() + 2)
  const plannedSunday = new Date(saturday); plannedSunday.setDate(saturday.getDate() + 8)

  // Mostramos el mes que CONTIENE al lunes planificado. Si la semana cruza
  // dos meses (típico fin de mes), igual mostramos el del lunes — eso
  // matchea cuál es el "mes vigente" para el cascade del SPI.
  const year = plannedMonday.getFullYear()
  const monthIdx = plannedMonday.getMonth()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const isSameYMD = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()

  const isPlanned = (d: Date) => {
    const time = d.getTime()
    return time >= plannedMonday.getTime() && time <= plannedSunday.getTime()
  }

  // Build 6-row × 7-col grid, Monday-first.
  const firstOfMonth = new Date(year, monthIdx, 1)
  const dayOfWeek = (firstOfMonth.getDay() + 6) % 7
  const gridStart = new Date(firstOfMonth)
  gridStart.setDate(firstOfMonth.getDate() - dayOfWeek)

  const weeks: { weekNo: number; days: { date: Date; inMonth: boolean }[] }[] = []
  for (let w = 0; w < 6; w++) {
    const weekRow: { date: Date; inMonth: boolean }[] = []
    let weekNo = 0
    for (let d = 0; d < 7; d++) {
      const date = new Date(gridStart)
      date.setDate(gridStart.getDate() + w * 7 + d)
      if (d === 0) weekNo = getIsoWeekNumber(date)
      weekRow.push({ date, inMonth: date.getMonth() === monthIdx })
    }
    weeks.push({ weekNo, days: weekRow })
    const lastDayThisRow = weekRow[6].date
    if (lastDayThisRow.getMonth() > monthIdx && w >= 3) break
    if (lastDayThisRow.getMonth() !== monthIdx && lastDayThisRow.getFullYear() > year && w >= 3) break
  }

  const fmtRange = (d: Date) =>
    `${d.getDate()} ${SPI_MONTH_NAMES[d.getMonth()].slice(0, 3).toLowerCase()}`

  return (
    <div className="bg-black/20 border border-white/[0.08] rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-500 mb-1">
            Semana planificada
          </p>
          <p className="text-[13px] font-semibold text-white">
            {SPI_MONTH_NAMES[monthIdx]} {year}
          </p>
        </div>
        <span
          className="text-[11px] font-mono px-2.5 py-1 rounded-full self-start"
          style={{
            background: 'rgba(217, 70, 239, 0.15)',
            border: '1px solid rgba(217, 70, 239, 0.35)',
            color: '#f0abfc',
          }}
        >
          Lun {fmtRange(plannedMonday)} → Dom {fmtRange(plannedSunday)}
        </span>
      </div>

      {/* Weekday headers (Lun, Mar, Mié, Jue, Vie, Sáb, Dom) */}
      <div className="grid grid-cols-[24px_repeat(7,1fr)] gap-y-1 mb-1.5">
        <span />
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span key={i} className="text-[10px] text-zinc-500 text-center font-medium">{d}</span>
        ))}
      </div>

      {/* Weeks */}
      <div className="grid grid-cols-[24px_repeat(7,1fr)] gap-y-1">
        {weeks.map((week, wi) => (
          <React.Fragment key={wi}>
            <span className="text-[9px] text-zinc-600 bg-white/[0.03] rounded text-center font-mono leading-6">
              {week.weekNo}
            </span>
            {week.days.map((cell, di) => {
              const isToday = isSameYMD(cell.date, today)
              const isPlannedDay = isPlanned(cell.date)
              const isWeekend = di >= 5
              let textCls = 'text-zinc-200'
              if (!cell.inMonth) textCls = 'text-zinc-700'
              else if (isWeekend) textCls = 'text-red-400/80'
              return (
                <div key={di} className="text-center relative">
                  {isToday ? (
                    // HOY: círculo azul fuerte
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-500 text-white text-[11px] font-semibold">
                      {cell.date.getDate()}
                    </span>
                  ) : isPlannedDay ? (
                    // SEMANA PLANIFICADA: fucsia translúcido con borde
                    <span
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-semibold"
                      style={{
                        background: 'rgba(217, 70, 239, 0.18)',
                        border: '1px solid rgba(217, 70, 239, 0.50)',
                        color: '#f5d0fe',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                      }}
                    >
                      {cell.date.getDate()}
                    </span>
                  ) : (
                    <span className={`inline-block text-[11px] leading-7 ${textCls}`}>
                      {cell.date.getDate()}
                    </span>
                  )}
                </div>
              )
            })}
          </React.Fragment>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.06] text-[10px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
          Hoy
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded-full inline-block"
            style={{ background: 'rgba(217, 70, 239, 0.18)', border: '1px solid rgba(217, 70, 239, 0.50)' }}
          />
          Semana planificada
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// AUTO-GROW TEXTAREA
// ─────────────────────────────────────────────────────────────────────
/** Textarea que crece automáticamente para mostrar todo su contenido sin
 *  scroll vertical. Acepta todas las props nativas de <textarea> + un
 *  `minRows` que setea el alto mínimo cuando está vacío.
 *
 *  Estrategia: en cada cambio de `value` resetear `height` a 'auto' (para
 *  que `scrollHeight` reporte la altura natural del contenido y NO la
 *  altura previamente seteada — sin este reset el textarea solo crece,
 *  nunca decrece al borrar) y luego setear `height = scrollHeight`.
 *  Usamos useLayoutEffect para que el ajuste suceda antes del paint y
 *  no se vea un flash en N filas.
 *
 *  Ventaja vs `resize-y` manual: el contenido es SIEMPRE visible, no hace
 *  falta que el usuario recuerde re-dimensionar cada caja. */
function AutoGrowTextarea({
  value, minRows = 2, style, ...rest
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> & {
  minRows?: number
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => {
    const ta = ref.current
    if (!ta) return
    // Reset → scrollHeight reflects natural content size (otherwise the
    // textarea would only grow, never shrink when the user deletes text).
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      style={{ resize: 'none', overflow: 'hidden', ...style }}
      {...rest}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────
// FIELD
// ─────────────────────────────────────────────────────────────────────
function Field({
  field, value, onChange,
}: { field: SectionField; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      {field.blockquote && (
        <p className="text-[11px] text-zinc-500 italic mb-1.5 border-l-2 border-white/[0.12] pl-2">
          {field.blockquote}
        </p>
      )}
      <label className="block text-[11px] font-medium text-zinc-400 mb-1">{field.label}</label>
      {field.hint && (
        <p className="text-[10px] text-zinc-600 italic mb-1.5">{field.hint}</p>
      )}
      {field.type === 'textarea' ? (
        <AutoGrowTextarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          minRows={3}
          className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-fuchsia-500/40"
        />
      ) : field.type === 'select' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-fuchsia-500/40"
        >
          <option value="">— elegir —</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-fuchsia-500/40"
        />
      )}
      {field.epigraph && (
        <p className="text-[10px] text-zinc-600 italic mt-1.5">{field.epigraph}</p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// TASKS BLOCK
// ─────────────────────────────────────────────────────────────────────
function TasksBlock({
  session, projectsById, taskMap, onAdd, onUpdate, onRemove, onPush,
}: {
  session: SPISession
  projectsById: ReturnType<typeof useTasksStore.getState>['projects']
  taskMap: ReturnType<typeof useTasksStore.getState>['tasks']
  onAdd: (t: Omit<SPITask, 'id'>) => string
  onUpdate: (taskId: string, patch: Partial<SPITask>) => void
  onRemove: (taskId: string) => void
  onPush: (taskId: string) => void
}) {
  const [newTitle, setNewTitle] = useState('')
  const submit = () => {
    const t = newTitle.trim()
    if (!t) return
    onAdd({ title: t, important: false })
    setNewTitle('')
  }
  const sessionTasks = session.tasks ?? []
  const importantCount = sessionTasks.filter((t) => t.important).length
  const linkedCount = sessionTasks.filter((t) => !!t.linkedTaskId).length

  return (
    <div className="bg-gradient-to-br from-fuchsia-950/20 to-zinc-950/40 border border-fuchsia-500/20 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          ⚒️ Tareas de la semana
          <span className="text-[10px] font-mono text-zinc-500">
            {session.tasks.length} · {importantCount} ⭐ · {linkedCount} en task manager
          </span>
        </h3>
      </div>
      <p className="text-xs text-zinc-500 italic mb-4">
        Listá TODAS las tareas que se te ocurran. Después marcá con ⭐ las que son tu 80/20.
        Al cerrar la sesión, todas se materializan en el proyecto <span className="text-fuchsia-400 font-semibold">SPI</span> del task manager.
        Podés hacer push individual antes con la flecha.
      </p>

      <div className="space-y-2 mb-3">
        {sessionTasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            projectsById={projectsById}
            taskMap={taskMap}
            onUpdate={(patch) => onUpdate(task.id, patch)}
            onRemove={() => onRemove(task.id)}
            onPush={() => onPush(task.id)}
          />
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
          placeholder="Agregar tarea..."
          className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-fuchsia-500/40"
        />
        <button
          onClick={submit}
          disabled={!newTitle.trim()}
          className="px-3 py-2 bg-fuchsia-500/15 border border-fuchsia-500/40 hover:bg-fuchsia-500/25 disabled:opacity-30 disabled:cursor-not-allowed text-fuchsia-300 rounded-lg text-sm font-semibold transition-all flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function TaskRow({
  task, projectsById, taskMap, onUpdate, onRemove, onPush,
}: {
  task: SPITask
  projectsById: ReturnType<typeof useTasksStore.getState>['projects']
  taskMap: ReturnType<typeof useTasksStore.getState>['tasks']
  onUpdate: (patch: Partial<SPITask>) => void
  onRemove: () => void
  onPush: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  // Status inferred from the linked Task — tells the user "this is now
  // in Personal" or "marked done in NQN" without leaving the SPI view.
  const linkedTask = task.linkedTaskId ? taskMap[task.linkedTaskId] : null
  const currentProject = linkedTask ? projectsById[linkedTask.projectId] : null
  const isLinked = !!linkedTask
  const movedAway = isLinked && currentProject?.systemProjectKey !== 'spi'

  return (
    <div className={`bg-white/[0.03] border rounded-lg group ${
      isLinked ? 'border-emerald-500/20' : 'border-white/[0.08]'
    }`}>
      <div className="px-3 py-2 flex items-center gap-2">
        <button
          onClick={() => onUpdate({ important: !task.important })}
          title={task.important ? 'Quitar de Pareto' : 'Marcar como Pareto (80/20)'}
          className={`shrink-0 transition-colors ${task.important ? 'text-amber-400' : 'text-zinc-700 hover:text-amber-400'}`}
        >
          <Star className={`w-4 h-4 ${task.important ? 'fill-amber-400' : ''}`} />
        </button>
        <input
          value={task.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          className="flex-1 bg-transparent text-sm text-zinc-200 focus:outline-none placeholder:text-zinc-700"
        />

        {/* Linked-status indicator. */}
        {isLinked && (
          <span
            title={movedAway && currentProject
              ? `Movida a "${currentProject.name}" desde el task manager`
              : 'En el proyecto SPI del task manager'}
            className="shrink-0 flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{
              color: currentProject?.color ?? '#10b981',
              background: (currentProject?.color ?? '#10b981') + '15',
            }}
          >
            <Check className="w-2.5 h-2.5" />
            {currentProject?.name ?? 'SPI'}
          </span>
        )}

        {/* Push-to-manager button (only when not yet linked). */}
        {!isLinked && (
          <button
            onClick={onPush}
            title="Crear ahora en el task manager (sin esperar al cierre)"
            className="shrink-0 text-zinc-600 hover:text-fuchsia-300 transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-zinc-600 hover:text-zinc-300 text-xs px-1"
          title="Detalles (fecha + para qué)"
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={onRemove}
          className="shrink-0 text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
          title={isLinked ? 'Quitar de la sesión SPI (la tarea sigue en el task manager)' : 'Eliminar tarea'}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 space-y-2 border-t border-white/[0.05]">
              {/* Date picker — sin el icono Calendar para no competir
                  visualmente con el bloque "para qué". El input type=date
                  ya muestra su propio iconito nativo. */}
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={task.dueDate ?? ''}
                  onChange={(e) => onUpdate({ dueDate: e.target.value || undefined })}
                  className="text-xs bg-black/30 border border-white/[0.08] rounded px-2 py-1 text-zinc-300 focus:outline-none focus:border-fuchsia-500/40"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">💡 Para qué (propósito)</label>
                <AutoGrowTextarea
                  value={task.whyPurpose ?? ''}
                  onChange={(e) => onUpdate({ whyPurpose: e.target.value || undefined })}
                  placeholder="Qué resultado va a generar esta tarea?"
                  minRows={2}
                  className="w-full text-xs bg-black/30 border border-white/[0.08] rounded px-2 py-1.5 text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-fuchsia-500/40"
                />
              </div>
              {isLinked && currentProject && (
                <p className="text-[10px] text-zinc-500">
                  Vive en el task manager → <span style={{ color: currentProject.color }}>{currentProject.name}</span>.
                  Para moverla a otro proyecto, abrila desde el task manager y usá el dropdown del proyecto.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// HISTORY MODAL
// ─────────────────────────────────────────────────────────────────────
function HistoryModal({
  sessions, activeSessionId, onClose, onOpen,
}: { sessions: SPISession[]; activeSessionId: string | null; onClose: () => void; onOpen: (id: string) => void }) {
  const { t } = useTranslation()
  const sorted = [...sessions].sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-black/30 border border-white/[0.08] rounded-2xl p-5 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-200 flex items-center gap-2">
            <History className="w-5 h-5 text-fuchsia-400" /> {t('spi.spiHistory')}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Evolution chart — only meaningful with 1+ closed session */}
        <div className="mb-5">
          <EvolutionChart sessions={sessions} />
        </div>

        {sorted.length === 0 ? (
          <p className="text-sm text-zinc-500 italic text-center py-8">Todavía no hay sesiones.</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((sess) => {
              const [y, m, d] = sess.weekStartDate.split('-').map(Number)
              const date = new Date(y, m - 1, d)
              const dateLabel = date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
              const qN = m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4
              const label = `Semana ${weekOfQuarter(sess.weekStartDate)} / Q${qN} · ${dateLabel}`
              const isActive = sess.id === activeSessionId
              return (
                <button
                  key={sess.id}
                  onClick={() => onOpen(sess.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    isActive
                      ? 'bg-fuchsia-500/10 border-fuchsia-500/40'
                      : 'bg-white/[0.03] border-white/[0.08] hover:border-white/[0.12]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-zinc-200 capitalize">{label}</span>
                    {sess.closedAt && sess.score !== undefined && (
                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                        <Trophy className="w-3 h-3" /> {sess.score}%
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    {sess.tasks.length} tareas · {sess.closedAt ? 'cerrada' : 'abierta'}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// CLOSE MODAL
// ─────────────────────────────────────────────────────────────────────
function CloseSessionModal({
  onClose, onConfirm, pendingTaskCount,
}: { onClose: () => void; onConfirm: (args: { mood: number; notes: string }) => void; pendingTaskCount: number }) {
  const [mood, setMood] = useState(7)
  const [notes, setNotes] = useState('')
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-black/30 border border-emerald-500/30 rounded-2xl p-6 max-w-md w-full"
      >
        <h2 className="text-lg font-semibold text-zinc-200 flex items-center gap-2 mb-1">
          <Trophy className="w-5 h-5 text-emerald-400" /> Cerrar sesión SPI
        </h2>
        <p className="text-xs text-zinc-500 mb-2">
          Una vez cerrada, la sesión queda inmortalizada en tu historial y suma a tu streak de sábados.
        </p>
        {pendingTaskCount > 0 && (
          <p className="text-xs text-fuchsia-300/80 mb-5 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-md px-2.5 py-1.5">
            <ArrowRight className="w-3 h-3 inline mr-1" />
            Se van a crear <span className="font-semibold">{pendingTaskCount}</span> tarea{pendingTaskCount === 1 ? '' : 's'} en el proyecto <span className="font-semibold">SPI</span> del task manager.
          </p>
        )}
        {pendingTaskCount === 0 && (
          <p className="text-xs text-zinc-600 italic mb-5">
            (Sin tareas pendientes para pushear.)
          </p>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-xs text-zinc-400 mb-2 block">Estado de ánimo (1-10)</label>
            <div className="flex items-center gap-2">
              <input
                type="range" min={1} max={10} value={mood}
                onChange={(e) => setMood(parseInt(e.target.value))}
                className="flex-1 accent-emerald-400"
              />
              <span className="text-2xl font-bold text-emerald-400 tabular-nums w-10 text-right">{mood}</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Reflexión de cierre (opcional)</label>
            <AutoGrowTextarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Qué te llevás de esta semana?"
              minRows={3}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/40"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.12] text-zinc-400 rounded-lg text-sm transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm({ mood, notes })}
            className="flex-1 px-3 py-2 bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 text-emerald-300 rounded-lg text-sm font-semibold transition-all"
          >
            Cerrar SPI
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// BITÁCORA BLOCK — cross-session knowledge base
// Two columns: "Sí funciona" (preservar) and "No funciona" (arreglar).
// Entries persist across ALL SPI sessions — visible from every Saturday
// so the user accumulates self-knowledge over time.
// ─────────────────────────────────────────────────────────────────────
function BitacoraBlock({
  entries, onAdd, onUpdate, onRemove,
}: {
  entries: import('@/lib/spi/types').BitacoraEntry[]
  onAdd: (e: Omit<import('@/lib/spi/types').BitacoraEntry, 'id' | 'createdAt' | 'updatedAt'>) => string
  onUpdate: (id: string, patch: Partial<import('@/lib/spi/types').BitacoraEntry>) => void
  onRemove: (id: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [showResolved, setShowResolved] = useState(false)

  const working = entries.filter((e) => e.kind === 'working')
  const broken = entries.filter((e) => e.kind === 'broken' && (showResolved || !e.resolved))
  const totalWorking = working.length
  const totalBroken = entries.filter((e) => e.kind === 'broken').length
  const resolvedCount = entries.filter((e) => e.kind === 'broken' && e.resolved).length

  return (
    <div className="bg-black/20 border border-white/[0.08] rounded-2xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-lg shrink-0">🗂️</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-zinc-200">Bitácora de Calibración</h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Lo que funciona, no se toca · Cross-session ·
            <span className="text-emerald-400/80 ml-1">{totalWorking} ✓</span> ·
            <span className="text-amber-400/80 ml-1">{totalBroken - resolvedCount} ⚠</span>
            {resolvedCount > 0 && <span className="text-zinc-600 ml-1">({resolvedCount} resueltos)</span>}
          </p>
        </div>
        {collapsed ? <ChevronRight className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.05] p-4">
              {/* Toggle resolved visibility */}
              {totalBroken > 0 && resolvedCount > 0 && (
                <div className="flex justify-end mb-2">
                  <button
                    onClick={() => setShowResolved((v) => !v)}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showResolved ? 'ocultar resueltos' : `mostrar resueltos (${resolvedCount})`}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* SI FUNCIONA */}
                <BitacoraColumn
                  kind="working"
                  title="✓ Sí está funcionando"
                  subtitle="Y por qué — efecto / causa"
                  color="emerald"
                  entries={working}
                  onAdd={(situation, dominoEffect) => onAdd({ kind: 'working', situation, dominoEffect })}
                  onUpdate={onUpdate}
                  onRemove={onRemove}
                />
                {/* NO FUNCIONA */}
                <BitacoraColumn
                  kind="broken"
                  title="⚠ NO está funcionando"
                  subtitle="Acción / efecto dominó solución"
                  color="amber"
                  entries={broken}
                  onAdd={(situation, dominoEffect) => onAdd({ kind: 'broken', situation, dominoEffect, resolved: false })}
                  onUpdate={onUpdate}
                  onRemove={onRemove}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function BitacoraColumn({
  kind, title, subtitle, color, entries, onAdd, onUpdate, onRemove,
}: {
  kind: 'working' | 'broken'
  title: string
  subtitle: string
  color: 'emerald' | 'amber'
  entries: import('@/lib/spi/types').BitacoraEntry[]
  onAdd: (situation: string, dominoEffect: string) => string
  onUpdate: (id: string, patch: Partial<import('@/lib/spi/types').BitacoraEntry>) => void
  onRemove: (id: string) => void
}) {
  const [newSituation, setNewSituation] = useState('')
  const [newDomino, setNewDomino] = useState('')
  const [adding, setAdding] = useState(false)

  const submit = () => {
    const s = newSituation.trim()
    if (!s) return
    onAdd(s, newDomino.trim())
    setNewSituation('')
    setNewDomino('')
    setAdding(false)
  }

  const accent = color === 'emerald'
    ? { text: 'text-emerald-300', border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', btn: 'hover:text-emerald-300 hover:bg-emerald-500/10' }
    : { text: 'text-amber-300', border: 'border-amber-500/30', bg: 'bg-amber-500/5', btn: 'hover:text-amber-300 hover:bg-amber-500/10' }

  return (
    <div className={`bg-white/[0.03] border ${accent.border} rounded-lg p-3`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className={`text-[11px] font-semibold ${accent.text}`}>{title}</p>
          <p className="text-[9px] text-zinc-600 mt-0.5">{subtitle}</p>
        </div>
        <span className="text-[10px] font-mono text-zinc-600">{entries.length}</span>
      </div>

      <div className="space-y-1.5 mb-2 max-h-80 overflow-y-auto">
        {entries.length === 0 && (
          <p className="text-[11px] text-zinc-600 italic py-2 text-center">Sin entradas todavía.</p>
        )}
        {entries.map((e) => (
          <BitacoraRow
            key={e.id}
            entry={e}
            color={color}
            onUpdate={(patch) => onUpdate(e.id, patch)}
            onRemove={() => onRemove(e.id)}
          />
        ))}
      </div>

      {/* Add new */}
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className={`w-full text-[11px] text-zinc-500 ${accent.btn} px-2 py-1.5 rounded transition-colors flex items-center gap-1.5 border border-dashed border-white/[0.08] hover:${accent.border}`}
        >
          <Plus className="w-3 h-3" /> Agregar entrada
        </button>
      ) : (
        <div className={`${accent.bg} border ${accent.border} rounded p-2 space-y-1.5`}>
          <input
            autoFocus
            value={newSituation}
            onChange={(e) => setNewSituation(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setAdding(false); setNewSituation(''); setNewDomino('') } }}
            placeholder={kind === 'working' ? 'Qué está funcionando?' : 'Qué NO está funcionando?'}
            className="w-full text-xs bg-black/30 border border-white/[0.08] rounded px-2 py-1 text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-fuchsia-500/40"
          />
          <input
            value={newDomino}
            onChange={(e) => setNewDomino(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submit() }
              if (e.key === 'Escape') { setAdding(false); setNewSituation(''); setNewDomino('') }
            }}
            placeholder={kind === 'working' ? 'Por qué? (efecto / causa)' : 'Acción solución / efecto dominó'}
            className="w-full text-[11px] bg-black/30 border border-white/[0.08] rounded px-2 py-1 text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-fuchsia-500/40"
          />
          <div className="flex justify-end gap-1">
            <button
              onClick={() => { setAdding(false); setNewSituation(''); setNewDomino('') }}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 px-2 py-0.5"
            >
              cancel
            </button>
            <button
              onClick={submit}
              disabled={!newSituation.trim()}
              className={`text-[10px] ${accent.text} ${accent.btn} disabled:opacity-30 px-2 py-0.5 rounded`}
            >
              guardar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function BitacoraRow({
  entry, color, onUpdate, onRemove,
}: {
  entry: import('@/lib/spi/types').BitacoraEntry
  color: 'emerald' | 'amber'
  onUpdate: (patch: Partial<import('@/lib/spi/types').BitacoraEntry>) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const dotColor = color === 'emerald' ? '#10b981' : '#f59e0b'
  return (
    <div className={`bg-black/30 border border-white/[0.05] rounded p-1.5 group ${entry.resolved ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-1.5">
        {entry.kind === 'broken' && (
          <button
            onClick={() => onUpdate({ resolved: !entry.resolved })}
            title={entry.resolved ? 'Marcar como pendiente' : 'Marcar como resuelto'}
            className={`shrink-0 w-3 h-3 mt-0.5 rounded border flex items-center justify-center transition-all ${
              entry.resolved
                ? 'bg-emerald-500/20 border-emerald-500'
                : 'border-white/[0.12] hover:border-zinc-500'
            }`}
          >
            {entry.resolved && <Check className="w-2 h-2 text-emerald-400" />}
          </button>
        )}
        {entry.kind === 'working' && (
          <span className="w-1 h-1 rounded-full mt-2 shrink-0" style={{ background: dotColor }} />
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 text-left text-[11px] text-zinc-200 leading-tight"
        >
          <span className={entry.resolved ? 'line-through' : ''}>{entry.situation || <em className="text-zinc-600">(vacío)</em>}</span>
        </button>
        <button
          onClick={onRemove}
          className="shrink-0 text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* Domino effect — always visible if filled, smaller */}
      {entry.dominoEffect && !expanded && (
        <p className="text-[10px] text-zinc-500 italic mt-0.5 ml-3 line-clamp-2">→ {entry.dominoEffect}</p>
      )}

      {/* Expanded edit mode. Changes auto-save on each keystroke via
          onUpdate — the "Listo" button is just a way to collapse the
          row back to the compact view. Esc does the same thing. */}
      {expanded && (
        <div className="space-y-1.5 mt-1.5 ml-3">
          <AutoGrowTextarea
            autoFocus
            value={entry.situation}
            onChange={(e) => onUpdate({ situation: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Escape') setExpanded(false) }}
            minRows={2}
            className="w-full text-[11px] bg-white/[0.03] border border-white/[0.08] rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-fuchsia-500/40"
          />
          <AutoGrowTextarea
            value={entry.dominoEffect}
            onChange={(e) => onUpdate({ dominoEffect: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Escape') setExpanded(false) }}
            placeholder={entry.kind === 'working' ? 'Por qué funciona?' : 'Acción solución'}
            minRows={2}
            className="w-full text-[10px] bg-white/[0.03] border border-white/[0.08] rounded px-1.5 py-1 text-zinc-400 placeholder:text-zinc-700 focus:outline-none focus:border-fuchsia-500/40"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] text-zinc-700">
              {new Date(entry.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
              <span className="ml-1.5 text-zinc-700/60">· auto-guardado</span>
            </p>
            <button
              onClick={() => setExpanded(false)}
              className="text-[10px] text-zinc-500 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors px-2 py-0.5 rounded flex items-center gap-1"
              title="Cerrar edición · Esc"
            >
              <Check className="w-2.5 h-2.5" /> Listo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// CELEBRATION MODAL
// Shown right after closing a session. Displays XP breakdown and, if
// the user leveled up, a confetti-like animation + new level banner.
// ─────────────────────────────────────────────────────────────────────
function CelebrationModal({
  result, onClose,
}: {
  result: { xp: SessionXP; leveledUp: boolean; newLevel: number; pushedTasks: number }
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { xp, leveledUp, newLevel, pushedTasks } = result
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.85, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 280, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        className={`relative overflow-hidden rounded-2xl p-6 max-w-md w-full border ${
          leveledUp
            ? 'bg-gradient-to-br from-violet-950 via-fuchsia-950/40 to-zinc-950 border-fuchsia-500/40'
            : 'bg-black/30 border-emerald-500/30'
        }`}
      >
        {/* Backdrop sparkles on level-up */}
        {leveledUp && (
          <>
            {[...Array(12)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0 }}
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0, 1, 0],
                  x: [0, (Math.random() - 0.5) * 280],
                  y: [0, (Math.random() - 0.5) * 280],
                }}
                transition={{ duration: 1.8, delay: i * 0.05, repeat: Infinity, repeatDelay: 2 }}
                className="absolute top-1/2 left-1/2 w-1 h-1 bg-fuchsia-300 rounded-full pointer-events-none"
              />
            ))}
          </>
        )}

        {leveledUp ? (
          <>
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
              className="flex items-center justify-center mb-3"
            >
              <div className="px-4 py-1.5 bg-fuchsia-500/20 border border-fuchsia-400/40 rounded-full">
                <span className="text-[10px] font-mono uppercase tracking-widest text-fuchsia-200">⚡ Nuevo nivel ⚡</span>
              </div>
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="text-center text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-fuchsia-300 to-violet-400 mb-1"
            >
              {t('spi.levelLabel')} {newLevel}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
              className="text-center text-sm text-fuchsia-300/80 mb-5"
            >
              {titleForLevel(newLevel)}
            </motion.p>
          </>
        ) : (
          <div className="flex items-center justify-center mb-3">
            <Trophy className="w-10 h-10 text-emerald-400" />
          </div>
        )}

        {!leveledUp && (
          <h2 className="text-center text-xl font-bold text-zinc-100 mb-1">{t('spi.sessionClosed')}</h2>
        )}
        <p className="text-center text-xs text-zinc-500 mb-5">
          {pushedTasks > 0
            ? `${pushedTasks} tarea${pushedTasks === 1 ? '' : 's'} creada${pushedTasks === 1 ? '' : 's'} en el proyecto SPI.`
            : 'Sin nuevas tareas pusheadas.'}
        </p>

        {/* XP breakdown */}
        <div className="bg-black/30 border border-white/[0.08] rounded-lg p-3 space-y-1.5 mb-4">
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">XP ganada</p>
          <XPRow label="Base (cerrar la sesión)" value={xp.base} />
          {xp.scoreBonus > 0 && <XPRow label="Bonus por score" value={xp.scoreBonus} />}
          {xp.moodBonus > 0 && <XPRow label="Bonus por mood" value={xp.moodBonus} />}
          {xp.taskBonus > 0 && <XPRow label="Bonus por tareas Pareto" value={xp.taskBonus} />}
          <div className="pt-1.5 mt-1.5 border-t border-white/[0.08] flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-200">Total</span>
            <span className="text-lg font-bold text-fuchsia-300 tabular-nums">+{xp.total} XP</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full px-3 py-2.5 bg-fuchsia-500/15 border border-fuchsia-500/40 hover:bg-fuchsia-500/25 text-fuchsia-300 rounded-lg text-sm font-semibold transition-all"
        >
          Continuar
        </button>
      </motion.div>
    </motion.div>
  )
}

function XPRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300 font-mono tabular-nums">+{value}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// EVOLUTION CHART
// Renders score-per-session over time. Shown in History modal AND
// optionally inline (we keep it in history for now to not crowd the
// main session view).
// ─────────────────────────────────────────────────────────────────────
function EvolutionChart({ sessions }: { sessions: SPISession[] }) {
  const closed = sessions.filter((s) => !!s.closedAt && s.score !== undefined)
  const data = useMemo(() => closed
    .slice()
    .sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate))
    .map((s) => {
      const [y, m, d] = s.weekStartDate.split('-').map(Number)
      const date = new Date(y, m - 1, d)
      return {
        date: s.weekStartDate,
        label: date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
        score: s.score ?? 0,
        mood: s.mood ?? 0,
      }
    }), [closed])

  if (data.length === 0) {
    return (
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-lg p-4 text-center text-xs text-zinc-600 italic">
        Cerrá sesiones para empezar a ver tu evolución acá.
      </div>
    )
  }

  const avgScore = Math.round(data.reduce((a, b) => a + b.score, 0) / data.length)
  const lastScore = data[data.length - 1].score
  const trend = data.length >= 2 ? lastScore - data[data.length - 2].score : 0

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
          <TrendingUp className="w-3 h-3" /> Evolución · {data.length} sesiones
        </p>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-zinc-500">promedio <span className="text-fuchsia-300 font-mono">{avgScore}%</span></span>
          <span className="text-zinc-500">última <span className="text-emerald-300 font-mono">{lastScore}%</span></span>
          {trend !== 0 && (
            <span className={trend > 0 ? 'text-emerald-400' : 'text-red-400'}>
              {trend > 0 ? '+' : ''}{trend}
            </span>
          )}
        </div>
      </div>
      <div style={{ width: '100%', height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#71717a' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#71717a' }} width={32} tickFormatter={(v) => `${v}`} />
            <Tooltip
              contentStyle={{ background: 'var(--surface-popover)', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#a1a1aa' }}
              formatter={(v, name) => [`${v}${name === 'score' ? '%' : ''}`, name === 'score' ? 'Score' : 'Mood']}
            />
            <ReferenceLine y={avgScore} stroke="#a855f7" strokeDasharray="3 3" strokeOpacity={0.4} />
            <Line type="monotone" dataKey="score" stroke="#d946ef" strokeWidth={2.5}
              dot={{ r: 3, fill: '#d946ef' }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// PROJECTION CONTEXT — read-only summary of year/quarter/month plans
// for the period containing this SPI week. Shown at the top of the
// strategic lane so the user doesn't re-type meta_pro_q/mes every week.
// ─────────────────────────────────────────────────────────────────────
function ProjectionContext({
  weekStartDate, plans,
}: {
  weekStartDate: string
  plans: ReturnType<typeof useProjectionStore.getState>['plans']
}) {
  // Derive the parent period keys from the session's Saturday.
  const monthKey = monthOfSpiWeek(weekStartDate)
  const quarterKey = quarterOfMonthKey(monthKey)
  const yearKey = monthKey.slice(0, 4)

  const yearPlan = plans.find((p) => p.level === 'year' && p.periodKey === yearKey)
  const quarterPlan = plans.find((p) => p.level === 'quarter' && p.periodKey === quarterKey)
  const monthPlan = plans.find((p) => p.level === 'month' && p.periodKey === monthKey)

  // Pluck the most meaningful fields from each plan. If a user customized
  // their projection template, some fields may not exist — they're optional.
  const yearGoal = yearPlan?.values?.identidad?.una_cosa
    || yearPlan?.values?.metas_anuales?.profesional
    || yearPlan?.values?.metas_anuales?.profesional_principal  // legacy
  const yearPersona = yearPlan?.values?.identidad?.persona

  // ── Principal areas (cascade) ──
  // Read from annual plan, then surface the monthly sub-goals as the
  // most actionable view (one level above the weekly SPI).
  const principalesCsv = yearPlan?.values?.metas_anuales?.principales ?? ''
  const principalKeys = principalesCsv.split(',').filter(Boolean)
  type CascadeItem = { areaKey: string; areaLabel: string; subgoals: string[] }
  const monthCascade: CascadeItem[] = principalKeys.map((k) => {
    const subs = [1, 2, 3]
      .map((i) => monthPlan?.values?.principal_cascade?.[`${k}_sub${i}`] ?? '')
      .filter((s) => s.trim().length > 0)
    return {
      areaKey: k,
      areaLabel: ({
        fisica: 'Salud Física',
        mental_emocional: 'Salud Mental/Emocional',
        // Legacy keys — pre-v2 plans had `mental` and `emocional` separados.
        // Si el cascade del trimestre/mes todavía referencia esas keys
        // viejas (porque el usuario no abrió Anual desde la migración),
        // las renderizamos con su label original así no aparecen como
        // texto crudo. La migración del store se encarga de pasarlas a
        // mental_emocional la próxima vez que carga.
        mental: 'Salud Mental',
        emocional: 'Salud Emocional',
        espiritual: 'Conexión Espiritual',
        relaciones: 'Relaciones Personales',
        profesional: 'Profesional',
        financiera: 'Salud Financiera',
        legado: 'Propósito / Legado',
        hobbies: 'Hobbies / Pasiones',
        creatividad: 'Creatividad',
      } as Record<string, string>)[k] ?? k,
      subgoals: subs,
    }
  }).filter((c) => c.subgoals.length > 0)

  const quarterBattle = quarterPlan?.values?.alineacion?.una_batalla
  const quarterObjectives = [
    quarterPlan?.values?.objetivos_q?.objetivo_1,
    quarterPlan?.values?.objetivos_q?.objetivo_2,
    quarterPlan?.values?.objetivos_q?.objetivo_3,
  ].filter(Boolean) as string[]

  const monthFocus = monthPlan?.values?.alineacion_m?.foco_mes
  const monthProjects = [
    monthPlan?.values?.proyectos_m?.proyecto_1,
    monthPlan?.values?.proyectos_m?.proyecto_2,
    monthPlan?.values?.proyectos_m?.proyecto_3,
    monthPlan?.values?.proyectos_m?.proyecto_4,
  ].filter(Boolean) as string[]

  const allEmpty = !yearGoal && !yearPersona && !quarterBattle && quarterObjectives.length === 0
    && !monthFocus && monthProjects.length === 0 && monthCascade.length === 0
  const nothingExists = !yearPlan && !quarterPlan && !monthPlan

  return (
    <div className="bg-gradient-to-br from-blue-950/30 to-indigo-950/20 border border-blue-500/20 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-blue-300/80">
          📐 Contexto desde Proyección
        </p>
        <a
          href="/proyeccion"
          className="text-[10px] text-blue-300/60 hover:text-blue-200 transition-colors"
          title="Editar planes anual / trimestral / mensual"
        >
          editar →
        </a>
      </div>

      {nothingExists ? (
        <div className="text-xs text-zinc-500 italic">
          Todavía no armaste tus planes de proyección.{' '}
          <a href="/proyeccion" className="text-blue-300 hover:text-blue-200 underline decoration-blue-500/30">
            Empezá por el año
          </a>
          {' '}para que aparezcan acá las anclas estratégicas cada semana.
        </div>
      ) : allEmpty ? (
        <div className="text-xs text-zinc-500 italic">
          Tus planes existen pero están vacíos en los campos clave (meta principal del año, batalla del Q, foco del mes).{' '}
          <a href="/proyeccion" className="text-blue-300 hover:text-blue-200 underline decoration-blue-500/30">
            Completalos
          </a>
          {' '}para verlos acá.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {/* YEAR */}
          <ContextCard
            emoji="🦅"
            label={`Año ${yearKey}`}
            href={`/proyeccion?level=year&period=${yearKey}`}
            exists={!!yearPlan}
          >
            {yearGoal && (
              <p><span className="text-blue-300/60">Meta:</span> {yearGoal}</p>
            )}
            {yearPersona && (
              <p className="mt-1"><span className="text-blue-300/60">Persona:</span> {yearPersona}</p>
            )}
          </ContextCard>

          {/* QUARTER */}
          <ContextCard
            emoji="🎯"
            label={labelForPeriod(quarterKey)}
            href={`/proyeccion?level=quarter&period=${quarterKey}`}
            exists={!!quarterPlan}
          >
            {quarterBattle && (
              <p><span className="text-blue-300/60">Batalla:</span> {quarterBattle}</p>
            )}
            {quarterObjectives.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {quarterObjectives.slice(0, 3).map((o, i) => (
                  <li key={i} className="line-clamp-2">{i + 1}. {o}</li>
                ))}
              </ul>
            )}
          </ContextCard>

          {/* MONTH */}
          <ContextCard
            emoji="📆"
            label={labelForPeriod(monthKey)}
            href={`/proyeccion?level=month&period=${monthKey}`}
            exists={!!monthPlan}
          >
            {monthFocus && (
              <p><span className="text-blue-300/60">Foco:</span> {monthFocus}</p>
            )}
            {monthProjects.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {monthProjects.slice(0, 4).map((p, i) => (
                  <li key={i} className="line-clamp-2">• {p}</li>
                ))}
              </ul>
            )}
          </ContextCard>
        </div>
      )}

      {/* Principal areas cascade — surfaces the 2 principal areas' monthly
          sub-goals so the user can derive this week's tasks from them.
          Only renders when the user has actually filled cascade sub-goals
          for the current month. */}
      {monthCascade.length > 0 && (
        <div className="mt-2 border-t border-blue-500/20 pt-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-amber-300/80 mb-2 flex items-center gap-1.5">
            ⭐ Áreas principales · sub-metas de este mes
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {monthCascade.map((c) => (
              <div key={c.areaKey} className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-2.5">
                <p className="text-[11px] font-semibold text-amber-200 mb-1">{c.areaLabel}</p>
                <ul className="space-y-1">
                  {c.subgoals.map((s, i) => (
                    <li key={i} className="text-[11px] text-zinc-300 line-clamp-3">
                      <span className="text-amber-400/60 font-mono">{i + 1}.</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-zinc-600 italic mt-2">
            De acá salen las tareas concretas de esta semana — pensá qué pasos darían cada sub-meta esta semana.
          </p>
        </div>
      )}
    </div>
  )
}

function ContextCard({
  emoji, label, href, exists, children,
}: {
  emoji: string
  label: string
  href: string
  exists: boolean
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      className={`block bg-black/30 border rounded-lg p-2.5 hover:border-blue-500/40 transition-all ${
        exists ? 'border-white/[0.08]' : 'border-zinc-900 opacity-50'
      }`}
      title={exists ? 'Click para editar en Proyección' : 'Click para crear plan en Proyección'}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm">{emoji}</span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-blue-300/80 capitalize">{label}</span>
      </div>
      <div className="text-[11px] text-zinc-300 leading-snug">
        {exists ? children : <span className="italic text-zinc-600">— sin plan —</span>}
      </div>
    </a>
  )
}

// ─────────────────────────────────────────────────────────────────────
// WEEK HABITS SNAPSHOT (frozen al cierre o live durante la semana)
// ─────────────────────────────────────────────────────────────────────
/** Decide entre snapshot CONGELADO (capturado al cerrar la sesión) y
 *  cálculo EN VIVO desde habitsStore. Mismo patrón que MonthSnapshotContainer
 *  en ProjectionPage. */
function WeekSnapshotContainer({ session }: { session: SPISession }) {
  // Suscripción a habits y a kpis para que el cálculo live se actualice
  // cuando marcamos un hábito o cambiamos un KPI durante la semana.
  const habits = useHabitsStore((s) => s.habits)
  const kpisLibrary = useKpisStore((s) => s.definitions)
  // Una sesión es "live" cuando su semana Mon→Sun todavía está en curso
  // (incluye el sábado en que fue creada + los 8 días siguientes). Hasta
  // ese domingo, mostramos el snapshot LIVE aunque el user haya cerrado
  // la sesión — la planificación queda congelada pero los hábitos y
  // KPIs siguen llenándose. Recién el lunes siguiente se considera
  // "snapshot definitivo" y mostramos el frozen.
  const isStillCurrentWeek =
    session.weekStartDate === activeWeekAnchorYmd()
    || session.weekStartDate === lastSaturdayYmd()
  const liveSnapshot = useMemo(() => {
    if (session.weekSnapshot && !isStillCurrentWeek) return null
    return buildWeekSnapshot(session.weekStartDate, session)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, session.weekSnapshot, session.weekStartDate, habits, kpisLibrary, isStillCurrentWeek])

  // Prioridad: si la semana SIGUE en curso → live (aunque haya frozen).
  // Si ya terminó (lunes en adelante) y hay frozen → frozen.
  // Si no hay frozen → live como fallback.
  const snapshot = isStillCurrentWeek ? liveSnapshot : (session.weekSnapshot ?? liveSnapshot)
  if (!snapshot) return null
  const hasHabits = snapshot.habits.length > 0
  const hasKpis = (snapshot.kpis?.length ?? 0) > 0
  if (!hasHabits && !hasKpis) return null
  const isLive = isStillCurrentWeek || !session.weekSnapshot
  return <WeekHabitsBlock snapshot={snapshot} isLive={isLive} />
}

/** Renderiza la imagen de hábitos de la semana — grid 7 días × hábito.
 *  `Sáb · Dom · Lun · Mar · Mié · Jue · Vie`. Cada celda blanco/negro/N/A
 *  matching el lenguaje visual de HabitsPage. */
function WeekHabitsBlock({
  snapshot, isLive,
}: { snapshot: WeekClosureSnapshot; isLive: boolean }) {
  const [yStr, mStr, dStr] = snapshot.weekStartDate.split('-').map(Number)
  const sat = new Date(yStr, mStr - 1, dStr)
  const dayLabels = ['Sáb', 'Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie']
  const dayNumbers = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sat)
    d.setDate(sat.getDate() + i)
    return d.getDate()
  })

  const capturedDate = new Date(snapshot.capturedAt).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  // Promedio semanal: media de los completionPct de hábitos que tuvieron
  // al menos un día contado (no todos future, no todos skipped).
  const ratedHabits = snapshot.habits.filter((h) =>
    h.days.some((d) => d === 'done' || d === 'missed')
  )
  const weekAvg = ratedHabits.length > 0
    ? Math.round(ratedHabits.reduce((acc, h) => acc + h.completionPct, 0) / ratedHabits.length)
    : 0

  return (
    <div className="bg-black/30 border border-emerald-500/20 rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[10px] font-mono uppercase tracking-wider text-emerald-300/80">
          🎯 {isLive ? 'Vista en vivo' : 'Snapshot del cierre'} · Hábitos de la semana
        </p>
        <span className="text-[10px] text-zinc-600 font-mono">
          {isLive ? 'calculado en vivo desde tus datos' : `capturado el ${capturedDate}`}
        </span>
      </div>

      {/* Resumen KPI: promedio semanal */}
      {ratedHabits.length > 0 && (
        <div className="flex items-baseline gap-1.5 border-b border-white/[0.08] pb-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            Promedio semanal
          </span>
          <span className="text-2xl font-bold text-emerald-300 tabular-nums">{weekAvg}%</span>
          <span className="text-[10px] text-zinc-600">
            · {ratedHabits.length} hábito{ratedHabits.length === 1 ? '' : 's'} con tracking esta semana
          </span>
        </div>
      )}

      {/* Curva de completitud diaria — % de hábitos completados cada uno
          de los 7 días de la semana. Da una mirada rápida de cómo arrancó
          y terminó la semana (¿strong start, faded mid-week?). */}
      {ratedHabits.length > 0 && (
        <HabitsCompletionCurve snapshot={snapshot} dayLabels={dayLabels} />
      )}

      {/* Tabla — header (días) + rows (un hábito por row) */}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="min-w-full text-[11px]">
          <thead>
            <tr>
              <th className="text-left text-[9px] font-mono uppercase tracking-wider text-zinc-600 pr-3 pb-2 font-normal sticky left-0 bg-black/30">
                Hábito
              </th>
              {dayLabels.map((label, i) => (
                <th key={i} className="px-1 pb-2 font-normal">
                  <div className="text-[9px] font-mono uppercase text-zinc-600">{label}</div>
                  <div className="text-[10px] text-zinc-500 tabular-nums">{dayNumbers[i]}</div>
                </th>
              ))}
              <th className="text-right text-[9px] font-mono uppercase tracking-wider text-zinc-600 pl-3 pb-2 font-normal">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {snapshot.habits.map((h) => (
              <tr key={h.id} className="border-t border-zinc-900">
                <td className="py-1.5 pr-3 sticky left-0 bg-black/30">
                  <span className="mr-1.5">{h.icon}</span>
                  <span className="text-zinc-300">{h.name}</span>
                </td>
                {h.days.map((status, i) => (
                  <td key={i} className="px-0.5 py-1.5 text-center">
                    <WeekHabitCell status={status} />
                  </td>
                ))}
                <td className="py-1.5 pl-3 text-right tabular-nums">
                  <span className={
                    h.completionPct >= 80 ? 'text-emerald-400 font-semibold'
                      : h.completionPct >= 50 ? 'text-amber-400'
                      : 'text-zinc-500'
                  }>
                    {h.completionPct}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-zinc-600 flex items-center gap-3 flex-wrap pt-1">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-white" /> hecho
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full border border-white/70" /> vacío
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-zinc-700" /> N/A
        </span>
        <span className="flex items-center gap-1 text-zinc-700">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-white/[0.03]" /> futuro
        </span>
      </div>

      {/* KPIs del snapshot — congelados al cierre o live mientras se
          edita la semana. Solo mostramos esta tabla si el snapshot
          captured KPIs (sólo cuando el usuario tenía KPIs seleccionados
          al cierre). */}
      {snapshot.kpis && snapshot.kpis.length > 0 && (
        <div className="border-t border-white/[0.08] pt-3 mt-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-fuchsia-300/80 mb-2">
            🎯 KPIs de la semana
          </p>
          {/* Curva de completitud por KPI — bar chart horizontal con un
              bar por cada KPI mostrando % de cumplimiento. Visual rápido
              de "qué KPIs cumplí esta semana" antes del detalle numérico. */}
          <KpisCompletionChart kpis={snapshot.kpis} />
          <table className="min-w-full text-[11px]">
            <tbody>
              {snapshot.kpis.map((k) => {
                const pct = k.completionPct
                const color = pct === undefined ? '#71717a'
                  : pct >= 100 ? '#10b981'
                  : pct >= 75 ? '#34d399'
                  : pct >= 50 ? '#f59e0b'
                  : '#ef4444'
                const label = k.kind === 'boolean'
                  ? (k.value > 0 ? '✓ Sí' : '✗ No')
                  : k.kind === 'percent'
                    ? `${Math.round(k.value)}%`
                    : k.target !== undefined
                      ? `${k.value}/${k.target}`
                      : String(k.value)
                return (
                  <tr key={k.id} className="border-t border-zinc-900 first:border-t-0">
                    <td className="py-1.5 pr-3">
                      <span className="mr-1.5">{k.icon}</span>
                      <span className="text-zinc-300">{k.name}</span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums" style={{ color }}>
                      {label}
                      {pct !== undefined && (
                        <span className="text-[10px] text-zinc-600 ml-1">· {pct}%</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Celda individual del grid semanal — matchea el lenguaje visual de
 *  HabitsPage: celda negra + punto blanco / anillo blanco / minus / vacío. */
function WeekHabitCell({ status }: { status: 'done' | 'skipped' | 'missed' | 'future' }) {
  if (status === 'future') {
    return <span className="inline-block w-5 h-5 rounded bg-white/[0.03]" />
  }
  if (status === 'skipped') {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-zinc-800">
        <span className="block w-1.5 h-px bg-zinc-500" />
      </span>
    )
  }
  if (status === 'done') {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-black">
        <span className="block w-2 h-2 rounded-full bg-white" />
      </span>
    )
  }
  // missed = celda negra con anillo blanco vacío (igual que "no marcado" en HabitsPage)
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-black">
      <span className="block w-2 h-2 rounded-full border border-white/70" />
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────
// HABITS COMPLETION CURVE — % de hábitos done por cada día de la semana
// ─────────────────────────────────────────────────────────────────────
/** Line chart compacto que muestra cómo evolucionó la completitud durante
 *  los 7 días. X = día (Sáb..Vie), Y = % de hábitos completados ese día.
 *
 *  Cálculo del % por día:
 *   - numerator   = hábitos con status 'done' ese día
 *   - denominator = hábitos con status 'done' O 'missed' ese día
 *     (skipped y future NO cuentan — son "N/A").
 *   - Si denominator === 0, el día se grafica como null (gap en la curva). */
function HabitsCompletionCurve({
  snapshot, dayLabels,
}: { snapshot: WeekClosureSnapshot; dayLabels: string[] }) {
  const data = useMemo(() => {
    return dayLabels.map((label, i) => {
      let done = 0
      let counted = 0
      for (const h of snapshot.habits) {
        const s = h.days[i]
        if (s === 'done') { done++; counted++ }
        else if (s === 'missed') { counted++ }
      }
      return {
        day: label,
        pct: counted > 0 ? Math.round((done / counted) * 100) : null,
      }
    })
  }, [snapshot.habits, dayLabels])

  // Si todos los días son null (sin tracking esta semana), no renderizamos.
  if (!data.some((d) => d.pct !== null)) return null

  return (
    <div className="border-b border-white/[0.08] pb-3 -mt-1">
      <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-600 mb-1">
        Curva de completitud diaria
      </p>
      <div style={{ width: '100%', height: 90 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="2 3" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#71717a' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 9, fill: '#52525b' }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              contentStyle={{ background: 'var(--surface-popover)', border: '1px solid #27272a', borderRadius: 6, fontSize: 11 }}
              labelStyle={{ color: '#a1a1aa', fontSize: 10 }}
              formatter={(v) => (v === null || v === undefined ? ['—', '%'] : [`${v}%`, 'completitud'])}
            />
            <ReferenceLine y={80} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.4} />
            <Line
              type="monotone"
              dataKey="pct"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 3, fill: '#10b981', stroke: '#000' }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// KPIS COMPLETION CHART — bar chart con % de cumplimiento por KPI
// ─────────────────────────────────────────────────────────────────────
/** Bar chart vertical compacto, un bar por KPI, altura = completionPct%.
 *  Color del bar refleja la franja de cumplimiento (rojo <50, amarillo
 *  50-75, verde 75-100, esmeralda ≥100). Da una mirada rápida de "qué
 *  KPIs cumplí" antes de leer la tabla numérica detallada. */
function KpisCompletionChart({ kpis }: { kpis: NonNullable<WeekClosureSnapshot['kpis']> }) {
  const data = useMemo(() => {
    return kpis.map((k) => ({
      name: `${k.icon} ${k.name.length > 12 ? k.name.slice(0, 12) + '…' : k.name}`,
      pct: k.completionPct ?? 0,
    }))
  }, [kpis])

  if (data.length === 0) return null

  // No usamos chart cuando hay un solo KPI — un bar solitario se ve raro.
  // El usuario lee el % directo de la tabla abajo.
  if (data.length < 2) return null

  const colorFor = (pct: number): string =>
    pct >= 100 ? '#10b981'
      : pct >= 75 ? '#34d399'
      : pct >= 50 ? '#f59e0b'
      : '#ef4444'

  return (
    <div className="mb-3 -mt-1">
      <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-600 mb-1">
        Cumplimiento por KPI
      </p>
      <div style={{ width: '100%', height: 90 + Math.max(0, (data.length - 4) * 6) }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="2 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#71717a' }} axisLine={false} tickLine={false} interval={0} />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 9, fill: '#52525b' }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              contentStyle={{ background: 'var(--surface-popover)', border: '1px solid #27272a', borderRadius: 6, fontSize: 11 }}
              labelStyle={{ color: '#a1a1aa', fontSize: 10 }}
              formatter={(v) => [`${v ?? 0}%`, 'cumplimiento']}
            />
            <ReferenceLine y={100} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.5} />
            <Bar dataKey="pct" isAnimationActive={false} radius={[3, 3, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={colorFor(entry.pct)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// COPY SESSION BUTTON — markdown export del SPI semanal
// ─────────────────────────────────────────────────────────────────────
function CopySessionButton({ session, template }: { session: SPISession; template: ReturnType<typeof useSPIStore.getState>['template'] }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  // Pulleamos TODOS los planes + KPIs para que el export resuelva las
  // secciones dinámicas (qué buscás esta semana, KPIs activos, etc).
  const allPlans = useProjectionStore((s) => s.plans)
  const kpiDefinitions = useKpisStore((s) => s.definitions)
  const handle = async () => {
    const md = sessionToMarkdown(session, template, { allPlans, kpiDefinitions })
    const ok = await copyMarkdownToClipboard(md)
    setStatus(ok ? 'copied' : 'error')
    setTimeout(() => setStatus('idle'), 2000)
  }
  return (
    <button
      onClick={handle}
      title="Copiar todo el contenido de la sesión a markdown — útil para pegar en un chat y pedir ayuda."
      className="px-2.5 py-1.5 bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.12] hover:text-zinc-200 text-zinc-400 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
    >
      {status === 'copied' ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado</>
        : status === 'error' ? <><X className="w-3.5 h-3.5 text-red-400" /> Falló</>
        : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────
// CALENDAR SNAPSHOT BUTTON — abre la imagen del calendario de la semana
// ─────────────────────────────────────────────────────────────────────
// Comportamiento:
//   - Sesión cerrada con `calendarSnapshot` → muestra el snapshot guardado
//     (es la "imagen congelada" del momento del cierre).
//   - Sesión abierta (semana en curso) → construye un snapshot live al
//     vuelo desde los stores. Útil para previsualizar antes de cerrar.
//   - Sesión cerrada SIN `calendarSnapshot` (sesiones viejas) → también
//     genera uno live; no es exactamente el del cierre pero es lo mejor
//     que tenemos para sesiones pre-feature.
function CalendarSnapshotButton({ session }: { session: SPISession }) {
  const [open, setOpen] = useState(false)
  // Si la semana Mon→Sun de la sesión todavía está en curso, calculamos
  // un snapshot LIVE aunque exista uno frozen. Recién a partir del lunes
  // siguiente (cuando esta semana ya cerró) usamos el frozen como "imagen
  // definitiva" de cómo terminó la semana. Esto permite que el SPI
  // pasado siga reflejando cambios del calendario hasta el domingo noche.
  const isStillCurrentWeek =
    session.weekStartDate === activeWeekAnchorYmd()
    || session.weekStartDate === lastSaturdayYmd()
  const snapshot = useMemo(() => {
    if (!open) return null
    if (isStillCurrentWeek) return buildCalendarSnapshot(session.weekStartDate)
    return session.calendarSnapshot ?? buildCalendarSnapshot(session.weekStartDate)
  }, [open, session.calendarSnapshot, session.weekStartDate, isStillCurrentWeek])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Ver el calendario de esta semana — bloques timeados con qué planeaste y qué completaste."
        className="px-2.5 py-1.5 bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.12] hover:text-zinc-200 text-zinc-400 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
      >
        <CalendarDays className="w-3.5 h-3.5" /> Calendario
      </button>
      {open && snapshot && (
        <CalendarSnapshotView snapshot={snapshot} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
