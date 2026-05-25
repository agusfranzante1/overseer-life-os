'use client'
import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Infinity as InfinityIcon, Plus, ChevronDown, ChevronRight, Flame, Trophy,
  Check, Calendar, Star, Trash2, Sparkles, History, X, ArrowRight, Zap, TrendingUp,
  Settings2,
} from 'lucide-react'
import { TemplateEditor } from './TemplateEditor'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts'
import { useSPIStore } from '@/lib/store/spiStore'
import { useTasksStore } from '@/lib/store/tasksStore'
import type { SPISection, SectionField, SPISession, SPITask } from '@/lib/spi/types'
import { titleForLevel, type SessionXP } from '@/lib/spi/gamification'

export function SPIPage() {
  const {
    template, sessions, activeSessionId,
    createOrOpenCurrentWeek, setActiveSession,
    toggleChecklistItem, updateValue, closeSession, deleteSession,
    addTask, updateTask, removeTask, pushTaskToManager,
    updateTemplate, resetTemplate, setSessionLanes,
    bitacoraEntries, addBitacoraEntry, updateBitacoraEntry, removeBitacoraEntry,
    getStreak, getLevel,
  } = useSPIStore()
  const projectsById = useTasksStore((s) => s.projects)
  const taskMap = useTasksStore((s) => s.tasks)

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [showHistory, setShowHistory] = useState(false)
  const [showClose, setShowClose] = useState(false)
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

  const streak = getStreak()
  const levelInfo = getLevel()

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* ── Header ───────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <InfinityIcon className="w-6 h-6 text-fuchsia-400" />
            SPI · Sistema de Progreso Infinito
          </h1>
          <p className="text-xs text-zinc-500 mt-1 max-w-xl">
            Cada sábado te sentás, observás tu semana desde la vista del águila, y diseñás la siguiente.
            Lo que funciona, no se toca. Lo que falla, se ajusta.
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
              <div className="w-20 h-1 bg-zinc-900 rounded-full overflow-hidden mt-0.5">
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
                {streak} {streak === 1 ? 'sábado' : 'sábados'}
              </span>
            </div>
          )}
          <button
            onClick={() => setShowHistory(true)}
            className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
          >
            <History className="w-3.5 h-3.5" /> Historial ({sessions.length})
          </button>
          <button
            onClick={() => setShowTemplateEditor(true)}
            className="px-2 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-fuchsia-500/40 text-zinc-500 hover:text-fuchsia-300 rounded-lg transition-all"
            title="Editar plantilla — agregá, quitá o renombrá preguntas y secciones"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
          {!activeSession && (
            <button
              onClick={() => createOrOpenCurrentWeek()}
              className="px-4 py-2 bg-fuchsia-500/15 border border-fuchsia-500/40 hover:bg-fuchsia-500/25 text-fuchsia-300 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Empezar esta semana
            </button>
          )}
        </div>
      </header>

      {/* ── No active session — empty state ──────────────────────── */}
      {!activeSession && (
        <EmptyState
          hasPastSessions={sessions.length > 0}
          onStart={() => createOrOpenCurrentWeek()}
          onViewHistory={() => setShowHistory(true)}
        />
      )}

      {/* ── Active session ──────────────────────────────────────── */}
      {activeSession && (
        <ActiveSession
          session={activeSession}
          template={template}
          projectsById={projectsById}
          taskMap={taskMap}
          bitacoraEntries={bitacoraEntries}
          onBitacoraAdd={addBitacoraEntry}
          onBitacoraUpdate={updateBitacoraEntry}
          onBitacoraRemove={removeBitacoraEntry}
          onChecklistToggle={(key) => toggleChecklistItem(activeSession.id, key)}
          onValueChange={(secKey, fieldKey, v) => updateValue(activeSession.id, secKey, fieldKey, v)}
          onSetLanes={(lanes) => setSessionLanes(activeSession.id, lanes)}
          onAddTask={(t) => addTask(activeSession.id, t)}
          onUpdateTask={(taskId, patch) => updateTask(activeSession.id, taskId, patch)}
          onRemoveTask={(taskId) => removeTask(activeSession.id, taskId)}
          onPushTask={(taskId) => pushTaskToManager(activeSession.id, taskId)}
          onCloseRequest={() => setShowClose(true)}
          onCancelRequest={() => {
            // If the session has any content, ask before nuking it.
            // Otherwise (just opened, nothing filled) — silent delete.
            const hasContent =
              Object.values(activeSession.mainChecklist ?? {}).some(Boolean) ||
              Object.keys(activeSession.values ?? {}).length > 0 ||
              (activeSession.tasks?.length ?? 0) > 0 ||
              (activeSession.selectedLanes?.length ?? 0) > 0
            if (hasContent && !confirm('¿Cancelar esta sesión? Vas a perder lo que escribiste en ella.')) return
            deleteSession(activeSession.id)
          }}
        />
      )}

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
        {showClose && activeSession && (
          <CloseSessionModal
            pendingTaskCount={(activeSession.tasks ?? []).filter((t) => !t.linkedTaskId).length}
            onClose={() => setShowClose(false)}
            onConfirm={({ mood, notes }) => {
              const result = closeSession(activeSession.id, { mood, notes })
              setShowClose(false)
              setCloseResult({
                xp: result.xp,
                leveledUp: result.leveledUp,
                newLevel: result.newLevel,
                pushedTasks: result.pushedTasks,
              })
            }}
          />
        )}
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
// EMPTY STATE
// ─────────────────────────────────────────────────────────────────────
function EmptyState({
  hasPastSessions, onStart, onViewHistory,
}: { hasPastSessions: boolean; onStart: () => void; onViewHistory: () => void }) {
  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-10 text-center">
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
            className="px-5 py-2.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
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
  session, template, projectsById, taskMap,
  bitacoraEntries, onBitacoraAdd, onBitacoraUpdate, onBitacoraRemove,
  onChecklistToggle, onValueChange, onSetLanes,
  onAddTask, onUpdateTask, onRemoveTask, onPushTask,
  onCloseRequest, onCancelRequest,
}: {
  session: SPISession
  template: ReturnType<typeof useSPIStore.getState>['template']
  projectsById: ReturnType<typeof useTasksStore.getState>['projects']
  taskMap: ReturnType<typeof useTasksStore.getState>['tasks']
  bitacoraEntries: import('@/lib/spi/types').BitacoraEntry[]
  onBitacoraAdd: (e: Omit<import('@/lib/spi/types').BitacoraEntry, 'id' | 'createdAt' | 'updatedAt'>) => string
  onBitacoraUpdate: (id: string, patch: Partial<import('@/lib/spi/types').BitacoraEntry>) => void
  onBitacoraRemove: (id: string) => void
  onChecklistToggle: (key: string) => void
  onValueChange: (sectionKey: string, fieldKey: string, value: string) => void
  onSetLanes: (lanes: string[]) => void
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
  const safeSelectedLanes = Array.isArray(session.selectedLanes) ? session.selectedLanes : []
  const safeLanes = Array.isArray(template.lanes) ? template.lanes : []
  const checklistDone = Object.values(safeMainChecklist).filter(Boolean).length
  const checklistTotal = Object.keys(safeMainChecklist).length

  return (
    <div className="space-y-4">
      {/* Session header */}
      <div className="bg-zinc-950/60 border border-fuchsia-500/20 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-fuchsia-400/70">Sesión de</p>
            <p className="text-base font-semibold text-zinc-200 capitalize">{weekLabel}</p>
            {isClosed && session.score !== undefined && (
              <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                <Trophy className="w-3 h-3" /> Cerrada · puntuación {session.score}%
              </p>
            )}
          </div>
          {!isClosed && (
            <div className="flex items-center gap-2">
              <button
                onClick={onCancelRequest}
                title="Descartar esta sesión sin guardarla (no afecta tu streak ni XP)"
                className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-red-500/40 hover:text-red-400 text-zinc-500 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" /> Cancelar
              </button>
              <button
                onClick={onCloseRequest}
                className="px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 text-emerald-300 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
              >
                <Trophy className="w-3.5 h-3.5" /> Cerrar SPI
              </button>
            </div>
          )}
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
                  className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg hover:bg-zinc-900/60 transition-colors group"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                    checked
                      ? 'bg-emerald-500/20 border-emerald-500'
                      : 'border-zinc-700 group-hover:border-zinc-500'
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
              {laneSections.map((section) => (
                <Section
                  key={section.key}
                  section={section}
                  session={session}
                  parentKey=""
                  onValueChange={onValueChange}
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
          />
        ))}

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
    </div>
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
  const [picked, setPicked] = useState<string[]>(selected)
  const toggle = (key: string) =>
    setPicked((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])
  return (
    <div className="bg-zinc-950/60 border border-fuchsia-500/30 rounded-2xl p-6">
      <h2 className="text-base font-semibold text-zinc-100 mb-1">¿En dónde querés concentrarte hoy?</h2>
      <p className="text-xs text-zinc-500 mb-5">
        Elegí uno o varios carriles. Solo se mostrarán las preguntas de los carriles que actives —
        las demás quedan ocultas para esta sesión.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        {lanes.map((lane) => {
          const isPicked = picked.includes(lane.key)
          return (
            <button
              key={lane.key}
              onClick={() => toggle(lane.key)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                isPicked
                  ? 'bg-zinc-900 shadow-lg'
                  : 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700'
              }`}
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
                {isPicked && (
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
          disabled={picked.length === 0}
          className="px-4 py-2 bg-fuchsia-500/15 border border-fuchsia-500/40 hover:bg-fuchsia-500/25 disabled:opacity-30 disabled:cursor-not-allowed text-fuchsia-300 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
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
        className="bg-zinc-950 border border-fuchsia-500/30 rounded-2xl w-full max-w-2xl overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
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
// SECTION (recursive — supports subsections)
// ─────────────────────────────────────────────────────────────────────
function Section({
  section, session, parentKey, onValueChange,
}: {
  section: SPISection
  session: SPISession
  parentKey: string
  onValueChange: (sectionKey: string, fieldKey: string, value: string) => void
}) {
  const [open, setOpen] = useState(!section.defaultCollapsed)
  const fullKey = parentKey ? `${parentKey}.${section.key}` : section.key

  return (
    <div className={`bg-zinc-950/40 border border-zinc-800 rounded-xl ${parentKey ? 'ml-4 mt-2' : ''}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-zinc-900/40 transition-colors rounded-t-xl"
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
            <div className="px-4 pb-4 space-y-4 border-t border-zinc-800/60 pt-4">
              {section.intro && (
                <p className="text-xs text-zinc-400 italic leading-relaxed">{section.intro}</p>
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
// FIELD
// ─────────────────────────────────────────────────────────────────────
function Field({
  field, value, onChange,
}: { field: SectionField; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      {field.blockquote && (
        <p className="text-[11px] text-zinc-500 italic mb-1.5 border-l-2 border-zinc-700 pl-2">
          {field.blockquote}
        </p>
      )}
      <label className="block text-[11px] font-medium text-zinc-400 mb-1">{field.label}</label>
      {field.hint && (
        <p className="text-[10px] text-zinc-600 italic mb-1.5">{field.hint}</p>
      )}
      {field.type === 'textarea' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-fuchsia-500/40 resize-y"
        />
      ) : field.type === 'select' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-fuchsia-500/40"
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
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-fuchsia-500/40"
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
    <div className="bg-gradient-to-br from-fuchsia-950/20 to-zinc-950/40 border border-fuchsia-500/20 rounded-xl p-5">
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
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-fuchsia-500/40"
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
    <div className={`bg-zinc-900 border rounded-lg group ${
      isLinked ? 'border-emerald-500/20' : 'border-zinc-800'
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
            <div className="px-3 pb-3 pt-1 space-y-2 border-t border-zinc-800/60">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <input
                  type="date"
                  value={task.dueDate ?? ''}
                  onChange={(e) => onUpdate({ dueDate: e.target.value || undefined })}
                  className="text-xs bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-300 focus:outline-none focus:border-fuchsia-500/40"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">💡 Para qué (propósito)</label>
                <textarea
                  value={task.whyPurpose ?? ''}
                  onChange={(e) => onUpdate({ whyPurpose: e.target.value || undefined })}
                  placeholder="Qué resultado va a generar esta tarea?"
                  rows={2}
                  className="w-full text-xs bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-fuchsia-500/40 resize-none"
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
        className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-200 flex items-center gap-2">
            <History className="w-5 h-5 text-fuchsia-400" /> Historial SPI
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
              const label = date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
              const isActive = sess.id === activeSessionId
              return (
                <button
                  key={sess.id}
                  onClick={() => onOpen(sess.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    isActive
                      ? 'bg-fuchsia-500/10 border-fuchsia-500/40'
                      : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
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
        className="bg-zinc-950 border border-emerald-500/30 rounded-2xl p-6 max-w-md w-full"
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
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Qué te llevás de esta semana?"
              rows={3}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/40 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 rounded-lg text-sm transition-all"
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
    <div className="bg-zinc-950/40 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-zinc-900/40 transition-colors"
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
            <div className="border-t border-zinc-800/60 p-4">
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
    <div className={`bg-zinc-900 border ${accent.border} rounded-lg p-3`}>
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
          className={`w-full text-[11px] text-zinc-500 ${accent.btn} px-2 py-1.5 rounded transition-colors flex items-center gap-1.5 border border-dashed border-zinc-800 hover:${accent.border}`}
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
            className="w-full text-xs bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-fuchsia-500/40"
          />
          <input
            value={newDomino}
            onChange={(e) => setNewDomino(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submit() }
              if (e.key === 'Escape') { setAdding(false); setNewSituation(''); setNewDomino('') }
            }}
            placeholder={kind === 'working' ? 'Por qué? (efecto / causa)' : 'Acción solución / efecto dominó'}
            className="w-full text-[11px] bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-fuchsia-500/40"
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
    <div className={`bg-zinc-950 border border-zinc-800/60 rounded p-1.5 group ${entry.resolved ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-1.5">
        {entry.kind === 'broken' && (
          <button
            onClick={() => onUpdate({ resolved: !entry.resolved })}
            title={entry.resolved ? 'Marcar como pendiente' : 'Marcar como resuelto'}
            className={`shrink-0 w-3 h-3 mt-0.5 rounded border flex items-center justify-center transition-all ${
              entry.resolved
                ? 'bg-emerald-500/20 border-emerald-500'
                : 'border-zinc-700 hover:border-zinc-500'
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

      {/* Expanded edit mode */}
      {expanded && (
        <div className="space-y-1.5 mt-1.5 ml-3">
          <textarea
            value={entry.situation}
            onChange={(e) => onUpdate({ situation: e.target.value })}
            rows={2}
            className="w-full text-[11px] bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-zinc-200 focus:outline-none focus:border-fuchsia-500/40 resize-none"
          />
          <textarea
            value={entry.dominoEffect}
            onChange={(e) => onUpdate({ dominoEffect: e.target.value })}
            placeholder={entry.kind === 'working' ? 'Por qué funciona?' : 'Acción solución'}
            rows={2}
            className="w-full text-[10px] bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-zinc-400 placeholder:text-zinc-700 focus:outline-none focus:border-fuchsia-500/40 resize-none"
          />
          <p className="text-[9px] text-zinc-700">{new Date(entry.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
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
            : 'bg-zinc-950 border-emerald-500/30'
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
              Nivel {newLevel}
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
          <h2 className="text-center text-xl font-bold text-zinc-100 mb-1">Sesión cerrada</h2>
        )}
        <p className="text-center text-xs text-zinc-500 mb-5">
          {pushedTasks > 0
            ? `${pushedTasks} tarea${pushedTasks === 1 ? '' : 's'} creada${pushedTasks === 1 ? '' : 's'} en el proyecto SPI.`
            : 'Sin nuevas tareas pusheadas.'}
        </p>

        {/* XP breakdown */}
        <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-3 space-y-1.5 mb-4">
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">XP ganada</p>
          <XPRow label="Base (cerrar la sesión)" value={xp.base} />
          {xp.scoreBonus > 0 && <XPRow label="Bonus por score" value={xp.scoreBonus} />}
          {xp.moodBonus > 0 && <XPRow label="Bonus por mood" value={xp.moodBonus} />}
          {xp.taskBonus > 0 && <XPRow label="Bonus por tareas Pareto" value={xp.taskBonus} />}
          <div className="pt-1.5 mt-1.5 border-t border-zinc-800 flex items-center justify-between">
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
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center text-xs text-zinc-600 italic">
        Cerrá sesiones para empezar a ver tu evolución acá.
      </div>
    )
  }

  const avgScore = Math.round(data.reduce((a, b) => a + b.score, 0) / data.length)
  const lastScore = data[data.length - 1].score
  const trend = data.length >= 2 ? lastScore - data[data.length - 2].score : 0

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
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
              contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
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
