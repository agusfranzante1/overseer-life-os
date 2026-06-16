'use client'
import React, { useState, useEffect, useMemo, useLayoutEffect, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Telescope, ChevronLeft, ChevronRight, ChevronDown, Calendar, Target,
  Trophy, X, RotateCcw, ArrowRight, Infinity as InfinityIcon, Copy, Check,
} from 'lucide-react'
import { SPIPage } from '@/components/spi/SPIPage'
import { useProjectionStore } from '@/lib/store/projectionStore'
import { useSPIStore } from '@/lib/store/spiStore'
import { useHabitsStore } from '@/lib/store/habitsStore'
import { useWalletStore } from '@/lib/store/walletStore'
import { useKpisStore } from '@/lib/store/kpisStore'
import { buildMonthSnapshot } from '@/lib/projection/monthSnapshot'
import { ALL_TEMPLATES, WHEEL_AREAS } from '@/lib/projection/templates'
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip as RechartsTooltip,
} from 'recharts'
import { Sparkles, Dices, Loader2 } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import { getAiHeaders } from '@/lib/ai/headers'
import {
  currentYearKey, currentQuarterKey, currentMonthKey,
  previewMonthKey, previewQuarterKey,
  quarterMonths, yearOfQuarter, yearOfMonth, quarterOfMonthKey,
  labelForPeriod, shiftPeriod, monthOfSpiWeek, weekOfQuarter,
} from '@/lib/projection/period'
import type { ProjectionLevel, ProjectionPlan, ProjectionTemplate, SPISection, SectionField } from '@/lib/projection/types'
import { planToMarkdown, copyMarkdownToClipboard } from '@/lib/projection/exportMarkdown'

export function ProjectionPage() {
  const { t } = useTranslation()
  const {
    plans, getOrCreatePlan, updateValue, closePlan, reopenPlan, findPlan, setSelectedLanes,
  } = useProjectionStore()
  const spiSessions = useSPIStore((s) => s.sessions)

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Active tab — includes 'eagle' (Vista de Águila, on-demand) and 'week'
  // (embedded weekly SPI). Persisted across visits via localStorage.
  const [activeLevel, setActiveLevel] = useState<ProjectionLevel | 'week'>('year')
  const [yearKey, setYearKey] = useState(() => currentYearKey())
  const [quarterKey, setQuarterKey] = useState(() => currentQuarterKey())
  const [monthKey, setMonthKey] = useState(() => currentMonthKey())

  // Hydrate from localStorage once on mount (client-only to avoid SSR mismatch)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('overseer-spi-active-tab')
      if (saved === 'eagle' || saved === 'year' || saved === 'quarter' || saved === 'month' || saved === 'week') {
        setActiveLevel(saved)
      }
    } catch { /* ignore */ }
  }, [])
  // Persist whenever it changes
  useEffect(() => {
    if (!mounted) return
    try { localStorage.setItem('overseer-spi-active-tab', activeLevel) } catch { /* ignore */ }
  }, [activeLevel, mounted])

  // Honor `?level=X&period=Y` query params so breadcrumb links from /spi
  // (e.g. /proyeccion?level=quarter&period=2026-Q1) drop the user into
  // the right tab and period.
  const searchParams = useSearchParams()
  useEffect(() => {
    if (!mounted) return
    const lvl = searchParams.get('level') as ProjectionLevel | 'week' | null
    const period = searchParams.get('period')
    if (lvl === 'eagle' || lvl === 'year' || lvl === 'quarter' || lvl === 'month' || lvl === 'week') {
      setActiveLevel(lvl)
      if (period) {
        if (lvl === 'year')    setYearKey(period)
        if (lvl === 'quarter') setQuarterKey(period)
        if (lvl === 'month')   setMonthKey(period)
      }
    }
  }, [mounted, searchParams])

  if (!mounted) return null

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header>
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
          <InfinityIcon className="w-6 h-6 text-fuchsia-400" />
          SPI
        </h1>
        <p className="text-xs text-zinc-500 mt-1 max-w-xl">
          {t('spi.projectionSubtitle')}
        </p>
      </header>

      {/* ── Level tabs ──────────────────────────────────────────── */}
      <div className="flex items-center gap-1 bg-black/30 border border-white/[0.08] rounded-xl p-1 w-fit flex-wrap">
        <LevelTab active={activeLevel === 'eagle'}   onClick={() => setActiveLevel('eagle')}   icon="🦅" label={t('spi.eagleView')} />
        <LevelTab active={activeLevel === 'year'}    onClick={() => setActiveLevel('year')}    icon="📅" label={t('projection.annual')} />
        <LevelTab active={activeLevel === 'quarter'} onClick={() => setActiveLevel('quarter')} icon="🎯" label={t('projection.quarterly')} />
        <LevelTab active={activeLevel === 'month'}   onClick={() => setActiveLevel('month')}   icon="📆" label={t('projection.monthly')} />
        <LevelTab active={activeLevel === 'week'}    onClick={() => setActiveLevel('week')}    icon="♾️" label={t('spi.weeklyTab')} />
      </div>

      {/* ── Active level content ────────────────────────────────── */}
      {activeLevel === 'eagle' && (
        <EagleView
          plan={findPlan('eagle', 'current')}
          getOrCreatePlan={getOrCreatePlan}
          updateValue={updateValue}
          setSelectedLanes={setSelectedLanes}
          onGoToAnnual={() => setActiveLevel('year')}
        />
      )}
      {activeLevel === 'year' && (
        <LevelView
          level="year"
          periodKey={yearKey}
          onShift={(delta) => setYearKey((k) => shiftPeriod(k, delta))}
          onGoToToday={() => setYearKey(currentYearKey())}
          plan={findPlan('year', yearKey)}
          getOrCreatePlan={getOrCreatePlan}
          updateValue={updateValue}
          closePlan={closePlan}
          reopenPlan={reopenPlan}
          relatedPlans={plans}
          spiSessions={spiSessions}
          onJumpToChild={(level, periodKey) => {
            if (level === 'quarter') { setQuarterKey(periodKey); setActiveLevel('quarter') }
            if (level === 'month')   { setMonthKey(periodKey); setActiveLevel('month') }
          }}
        />
      )}
      {(activeLevel === 'quarter' || activeLevel === 'month') && (
        <PlanList
          level={activeLevel}
          allPlans={plans}
          spiSessions={spiSessions}
          getOrCreatePlan={getOrCreatePlan}
          updateValue={updateValue}
          closePlan={closePlan}
          reopenPlan={reopenPlan}
          onJumpToChild={(level, periodKey) => {
            if (level === 'month') { setMonthKey(periodKey); setActiveLevel('month') }
          }}
        />
      )}
      {activeLevel === 'week' && (
        // Embedded weekly SPI page — same component as /spi but rendered
        // inside the unified projection view. The internal header of
        // SPIPage stays for now (shows ♾️ + streak + history + template
        // editor), giving you the full weekly experience without the
        // separate sidebar entry.
        <div className="-mx-4 -mt-2">
          <SPIPage />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// LEVEL TAB
// ─────────────────────────────────────────────────────────────────────
function LevelTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
        active
          ? 'bg-indigo-500/15 border border-indigo-500/40 text-indigo-300'
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
      }`}
    >
      <span>{icon}</span> {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────
// PLAN LIST — for quarter / month levels.
// Renders a stack of plan cards: the CURRENT period card (always shown,
// expanded by default, "En Progreso" badge) on top, then any previously
// CLOSED plans for that level, collapsed, with "Done" badges.
// When the user crosses the next period boundary (e.g. enters Q3 after
// Q2), the previous current plan becomes part of the history list and
// a new current card appears at the top automatically.
// ─────────────────────────────────────────────────────────────────────
function PlanList({
  level, allPlans, spiSessions,
  getOrCreatePlan, updateValue, closePlan, reopenPlan, onJumpToChild,
}: {
  level: 'quarter' | 'month'
  allPlans: ProjectionPlan[]
  spiSessions: ReturnType<typeof useSPIStore.getState>['sessions']
  getOrCreatePlan: (level: ProjectionLevel, periodKey: string) => string
  updateValue: (planId: string, sectionKey: string, fieldKey: string, value: string) => void
  closePlan: (planId: string, args: { mood?: number; notes?: string }) => void
  reopenPlan: (planId: string) => void
  onJumpToChild: (level: ProjectionLevel, periodKey: string) => void
}) {
  const currentKey = level === 'quarter' ? currentQuarterKey() : currentMonthKey()
  // PREVIEW key: if today is the Sat/Sun before the start of a new
  // month/quarter (i.e. the upcoming Monday is the 1st), surface that
  // upcoming period as an EXTRA editable card on top. Lets the user do
  // their planning during the weekend instead of waiting for Monday.
  const previewKey = level === 'quarter' ? previewQuarterKey() : previewMonthKey()

  // Build the visible periods list: preview (when applicable) + current
  // (always) + any closed plans for past periods (newest first). Future
  // periods other than the immediate preview are NOT shown — they appear
  // automatically when their start date arrives.
  const periods = useMemo(() => {
    const list: { key: string; plan: ProjectionPlan | null; isCurrent: boolean; isPreview: boolean }[] = []
    // Preview goes FIRST so the user can jump in over the weekend.
    if (previewKey && previewKey !== currentKey) {
      const previewPlan = allPlans.find((p) => p.level === level && p.periodKey === previewKey) ?? null
      list.push({ key: previewKey, plan: previewPlan, isCurrent: false, isPreview: true })
    }
    const currentPlan = allPlans.find((p) => p.level === level && p.periodKey === currentKey) ?? null
    list.push({ key: currentKey, plan: currentPlan, isCurrent: true, isPreview: false })
    const closedPast = allPlans
      .filter((p) =>
        p.level === level
        && p.periodKey !== currentKey
        && p.periodKey !== previewKey
        && !!p.closedAt
      )
      .sort((a, b) => b.periodKey.localeCompare(a.periodKey))
    for (const p of closedPast) list.push({ key: p.periodKey, plan: p, isCurrent: false, isPreview: false })
    return list
  }, [level, currentKey, previewKey, allPlans])

  const template = ALL_TEMPLATES[level]

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-indigo-400/70">
          {template.title}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {level === 'quarter'
            ? 'Tu trimestre actual está abierto. Cuando lo cerrás, queda guardado abajo en el historial.'
            : 'Tu mes actual está abierto. Cuando lo cerrás, queda guardado abajo en el historial.'}
        </p>
      </div>

      {periods.map((p) => (
        <PlanCard
          key={p.key}
          level={level}
          periodKey={p.key}
          plan={p.plan}
          // Preview = the upcoming period the user can pre-fill this weekend.
          // Render as "in_progress" so the card is open and editable, but the
          // header gets an extra "Próximo · Disponible este finde" badge.
          status={p.isCurrent || p.isPreview ? 'in_progress' : 'done'}
          isPreview={p.isPreview}
          allPlans={allPlans}
          spiSessions={spiSessions}
          getOrCreatePlan={getOrCreatePlan}
          updateValue={updateValue}
          closePlan={closePlan}
          reopenPlan={reopenPlan}
          onJumpToChild={onJumpToChild}
        />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// PLAN CARD — collapsible card with status badge that wraps a single
// plan's content. Expanded by default for the current period; closed
// past periods default to collapsed.
// ─────────────────────────────────────────────────────────────────────
function PlanCard({
  level, periodKey, plan, status, isPreview,
  allPlans, spiSessions,
  getOrCreatePlan, updateValue, closePlan, reopenPlan, onJumpToChild,
}: {
  level: 'quarter' | 'month'
  periodKey: string
  plan: ProjectionPlan | null
  status: 'in_progress' | 'done'
  /** Pre-enablement card for the upcoming period (Sat/Sun before a new
   *  month/quarter starts). Renders with a "Próximo" badge instead of
   *  "En Progreso" so the user knows this is the NEXT period they can
   *  start filling in advance. */
  isPreview?: boolean
  allPlans: ProjectionPlan[]
  spiSessions: ReturnType<typeof useSPIStore.getState>['sessions']
  getOrCreatePlan: (level: ProjectionLevel, periodKey: string) => string
  updateValue: (planId: string, sectionKey: string, fieldKey: string, value: string) => void
  closePlan: (planId: string, args: { mood?: number; notes?: string }) => void
  reopenPlan: (planId: string) => void
  onJumpToChild: (level: ProjectionLevel, periodKey: string) => void
}) {
  // Past closed plans default collapsed; current period and preview cards
  // default expanded so the user lands directly on the editor.
  const [expanded, setExpanded] = useState(status === 'in_progress')
  const template = ALL_TEMPLATES[level]
  const [showClose, setShowClose] = useState(false)

  const ctx = useMemo(
    () => buildHierarchyContext(level, periodKey, allPlans, spiSessions),
    [level, periodKey, allPlans, spiSessions]
  )

  const badge = isPreview
    ? { label: 'Próximo · Disponible este finde', cls: 'bg-amber-500/15 border-amber-500/40 text-amber-300' }
    : status === 'in_progress'
      ? { label: 'En Progreso', cls: 'bg-blue-500/15 border-blue-500/40 text-blue-300' }
      : { label: 'Done',        cls: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' }

  return (
    <div className={`rounded-xl border overflow-hidden transition-colors ${
      isPreview
        ? 'bg-black/30 border-amber-500/30'
        : status === 'in_progress'
          ? 'bg-black/30 border-indigo-500/30'
          : 'bg-black/20 border-white/[0.08]'
    }`}>
      {/* Header — always clickable to expand/collapse */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-lg shrink-0">{level === 'quarter' ? '🎯' : '📆'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-zinc-100 capitalize truncate">
            {labelForPeriod(periodKey)}
          </p>
          {plan?.score !== undefined && status === 'done' && (
            <p className="text-[10px] text-zinc-500 mt-0.5">
              Cerrado · puntuación {plan.score}%
            </p>
          )}
        </div>
        <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${badge.cls}`}>
          {badge.label}
        </span>
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
            <div className="border-t border-white/[0.05] p-5 space-y-4">
              {/* Top action row: copy / close / reopen */}
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-zinc-500 italic leading-relaxed flex-1">{template.intro}</p>
                {plan && (
                  <CopyPlanButton plan={plan} template={template} />
                )}
                {plan?.closedAt ? (
                  <button
                    onClick={() => reopenPlan(plan.id)}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                    title="Reabrir para seguir editando"
                  >
                    reabrir
                  </button>
                ) : plan ? (
                  <button
                    onClick={() => setShowClose(true)}
                    className="px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 text-emerald-300 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0"
                  >
                    <Trophy className="w-3.5 h-3.5" /> Cerrar
                  </button>
                ) : null}
              </div>

              {/* Mini-calendar — only for the CURRENT quarter */}
              {level === 'quarter' && status === 'in_progress' && (
                <QuarterMiniCalendar quarterKey={periodKey} />
              )}

              {/* Empty state — only on the current period if not started */}
              {!plan && status === 'in_progress' && (
                <div className="bg-black/20 border border-white/[0.08] rounded-2xl p-6 text-center">
                  <Target className="w-8 h-8 text-indigo-400/70 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-zinc-200 mb-1">
                    No empezaste este {level === 'quarter' ? 'trimestre' : 'mes'} todavía
                  </p>
                  <p className="text-xs text-zinc-500 mb-4 max-w-md mx-auto">
                    Se guarda automático en cada cambio.
                  </p>
                  <button
                    onClick={() => getOrCreatePlan(level, periodKey)}
                    className="px-4 py-2 bg-indigo-500/15 border border-indigo-500/40 hover:bg-indigo-500/25 text-indigo-300 rounded-lg text-sm font-semibold transition-all"
                  >
                    Empezar plan
                  </button>
                </div>
              )}

              {/* Sections */}
              {plan && template.sections.map((section) => (
                <Section
                  key={section.key}
                  section={section}
                  plan={plan}
                  onValueChange={(secKey, fieldKey, value) => updateValue(plan.id, secKey, fieldKey, value)}
                />
              ))}

              {/* Snapshot del mes — para planes mensuales. Si hay snapshot
                  guardado en el plan (capturado al cerrar) lo usamos como
                  vista CONGELADA. Si no hay (porque el mes se cerró antes
                  de que existiera la feature, o porque está abierto), lo
                  calculamos en vivo desde los stores de hábitos y wallet. */}
              {plan && level === 'month' && (
                <MonthSnapshotContainer plan={plan} periodKey={periodKey} />
              )}
              {/* Agregado mensual de KPIs — pulla las 4-5 weekSnapshot.kpis
                  de las sesiones SPI del mes y los suma/promedia contra
                  los targets. Solo aparece si hubo KPIs trackeados. */}
              {plan && level === 'month' && (
                <MonthKpisAggregate periodKey={periodKey} />
              )}

              {/* Cascade from annual is rendered inside Section via the
                  special 'principal_cascade' key — no extra wiring here. */}

              {/* Child periods overview (only for current quarter — past
                  quarters' children are visible by clicking the month directly) */}
              {plan && status === 'in_progress' && ctx.children.length > 0 && (
                <ChildrenOverview
                  level={level}
                  children={ctx.children}
                  onJump={onJumpToChild}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showClose && plan && (
          <ClosePlanModal
            label={labelForPeriod(periodKey)}
            onClose={() => setShowClose(false)}
            onConfirm={({ mood, notes }) => {
              closePlan(plan.id, { mood, notes })
              setShowClose(false)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// EAGLE VIEW — Vista de Águila (on-demand reflection workspace)
//
// Singleton plan (periodKey='current'). Renders:
//   1. Wheel of Life (always, on top)
//   2. Lane picker chips (toggle which carriles render below)
//   3. Lane-filtered sections (Profundo / Estratégico / Reflexivo / Táctico)
//   4. CTA to jump to Anual when the user feels the exam is ready
//
// No close / mood / score — this is conversation-only. The user can
// reset (delete) the plan to start a fresh exam.
// ─────────────────────────────────────────────────────────────────────
function EagleView({
  plan, getOrCreatePlan, updateValue, setSelectedLanes, onGoToAnnual,
}: {
  plan: ProjectionPlan | null
  getOrCreatePlan: (level: ProjectionLevel, periodKey: string) => string
  updateValue: (planId: string, sectionKey: string, fieldKey: string, value: string) => void
  setSelectedLanes: (planId: string, lanes: string[]) => void
  onGoToAnnual: () => void
}) {
  const template = ALL_TEMPLATES.eagle
  const allLaneKeys = useMemo(() => (template.lanes ?? []).map((l) => l.key), [template.lanes])
  // Empty selectedLanes means "show all" — friendlier default for a workspace
  // that the user might revisit. Explicit toggle lets them focus on 1 lane.
  const selected = plan?.selectedLanes && plan.selectedLanes.length > 0
    ? plan.selectedLanes
    : allLaneKeys

  const toggleLane = (laneKey: string) => {
    if (!plan) return
    const isOn = selected.includes(laneKey)
    let next: string[]
    if (isOn) {
      next = selected.filter((k) => k !== laneKey)
      // If user just turned off the last lane, reset to "all visible".
      if (next.length === 0) next = []
    } else {
      next = [...selected, laneKey]
      // If all lanes selected, store as empty (= "show all" default).
      if (next.length === allLaneKeys.length) next = []
    }
    setSelectedLanes(plan.id, next)
  }

  // Filter sections: always-shown (no laneKey) + sections in active lanes.
  const visibleSections = useMemo(() => {
    return template.sections.filter((sec) => {
      if (!sec.laneKey) return true
      return selected.includes(sec.laneKey)
    })
  }, [template.sections, selected])

  return (
    <div className="space-y-4">
      {/* Intro / header */}
      <div className="bg-black/30 border border-indigo-500/20 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-indigo-400/70">
              {template.title}
            </p>
            <p className="text-base font-semibold text-zinc-100">
              Examen on-demand · workspace
            </p>
          </div>
          {plan && (
            <button
              onClick={onGoToAnnual}
              className="px-3 py-1.5 bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 text-amber-300 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
              title="Pasar a la pestaña Anual para escribir las metas en limpio"
            >
              Llevar a Anual <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-500 italic leading-relaxed">{template.intro}</p>
      </div>

      {/* Empty state */}
      {!plan && (
        <div className="bg-black/20 border border-white/[0.08] rounded-2xl p-8 text-center">
          <span className="text-3xl block mb-2">🦅</span>
          <p className="text-sm font-semibold text-zinc-200 mb-1">No abriste tu Vista de Águila todavía</p>
          <p className="text-xs text-zinc-500 mb-5 max-w-md mx-auto">
            Empezá puntuando tu Rueda de la Vida, después elegí los carriles que necesites
            para ordenar la conversación interna que te lleva a las metas anuales.
          </p>
          <button
            onClick={() => getOrCreatePlan('eagle', 'current')}
            className="px-4 py-2 bg-indigo-500/15 border border-indigo-500/40 hover:bg-indigo-500/25 text-indigo-300 rounded-lg text-sm font-semibold transition-all"
          >
            Abrir examen
          </button>
        </div>
      )}

      {/* Lane picker — only when a plan exists */}
      {plan && template.lanes && template.lanes.length > 0 && (
        <div className="bg-black/20 border border-white/[0.08] rounded-xl p-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
            Carriles · click para enfocar
          </p>
          <div className="flex flex-wrap gap-2">
            {template.lanes.map((lane) => {
              const isActive = selected.includes(lane.key)
              return (
                <button
                  key={lane.key}
                  onClick={() => toggleLane(lane.key)}
                  title={lane.description}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                    isActive ? 'text-zinc-100' : 'text-zinc-500 border-white/[0.08] bg-white/[0.03] hover:border-white/[0.12]'
                  }`}
                  style={isActive ? {
                    background: lane.color + '22',
                    borderColor: lane.color + '66',
                    color: lane.color,
                  } : {}}
                >
                  <span>{lane.emoji}</span> {lane.title}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] text-zinc-600 italic mt-2">
            Si todos están activos = ves todo. Apagá los que no necesites hoy para enfocar la sesión.
          </p>
        </div>
      )}

      {/* Sections */}
      {plan && visibleSections.map((section) => (
        <Section
          key={section.key}
          section={section}
          plan={plan}
          onValueChange={(secKey, fieldKey, value) => updateValue(plan.id, secKey, fieldKey, value)}
        />
      ))}

      {/* Bottom CTA — repeated for fluidity at the end of the exam */}
      {plan && (
        <div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl p-5 text-center">
          <p className="text-sm font-semibold text-zinc-200 mb-1">¿Listo para escribir las metas en limpio?</p>
          <p className="text-xs text-zinc-500 mb-3 max-w-md mx-auto">
            Lo que escribiste en el Borrador queda guardado acá. Ahora abrí Anual y pasalo en limpio mirando estos textos como guía.
          </p>
          <button
            onClick={onGoToAnnual}
            className="px-4 py-2 bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-amber-300 rounded-lg text-sm font-semibold transition-all inline-flex items-center gap-2"
          >
            Llevar a Anual <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// LEVEL VIEW — handles one level (year / quarter / month) at a time
// ─────────────────────────────────────────────────────────────────────
function LevelView({
  level, periodKey, onShift, onGoToToday,
  plan, getOrCreatePlan, updateValue, closePlan, reopenPlan,
  relatedPlans, spiSessions, onJumpToChild,
}: {
  level: ProjectionLevel
  periodKey: string
  onShift: (delta: number) => void
  onGoToToday: () => void
  plan: ProjectionPlan | null
  getOrCreatePlan: (level: ProjectionLevel, periodKey: string) => string
  updateValue: (planId: string, sectionKey: string, fieldKey: string, value: string) => void
  closePlan: (planId: string, args: { mood?: number; notes?: string }) => void
  reopenPlan: (planId: string) => void
  relatedPlans: ProjectionPlan[]
  spiSessions: ReturnType<typeof useSPIStore.getState>['sessions']
  onJumpToChild: (level: ProjectionLevel, periodKey: string) => void
}) {
  const template = ALL_TEMPLATES[level]
  const [showClose, setShowClose] = useState(false)

  // Compute hierarchy context for breadcrumbs / child-jump links.
  const ctx = useMemo(() => buildHierarchyContext(level, periodKey, relatedPlans, spiSessions), [level, periodKey, relatedPlans, spiSessions])

  const isCurrent = (level === 'year'    && periodKey === currentYearKey())
                || (level === 'quarter' && periodKey === currentQuarterKey())
                || (level === 'month'   && periodKey === currentMonthKey())

  return (
    <div className="space-y-4">
      {/* Period navigator */}
      <div className="bg-black/30 border border-indigo-500/20 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onShift(-1)}
              className="p-1.5 rounded-lg hover:bg-white/[0.03] text-zinc-500 hover:text-zinc-200 transition-colors"
              title="Período anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-indigo-400/70">
                {template.title}
              </p>
              <p className="text-base font-semibold text-zinc-100 capitalize">
                {labelForPeriod(periodKey)}
              </p>
              {/* Breadcrumb upward */}
              {ctx.parents.length > 0 && (
                <p className="text-[10px] text-zinc-600 mt-0.5">
                  Parte de{' '}
                  {ctx.parents.map((p, i) => (
                    <span key={p.key}>
                      <span className="text-zinc-400">{labelForPeriod(p.key)}</span>
                      {i < ctx.parents.length - 1 && <span className="text-zinc-700"> · </span>}
                    </span>
                  ))}
                </p>
              )}
            </div>
            <button
              onClick={() => onShift(1)}
              className="p-1.5 rounded-lg hover:bg-white/[0.03] text-zinc-500 hover:text-zinc-200 transition-colors"
              title="Período siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {!isCurrent && (
              <button
                onClick={onGoToToday}
                className="px-2 py-1 text-[10px] text-zinc-500 hover:text-indigo-300 transition-colors flex items-center gap-1"
                title="Volver al período actual"
              >
                <RotateCcw className="w-3 h-3" /> hoy
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {plan?.closedAt ? (
              <>
                <span className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded text-[10px] font-mono text-emerald-300 flex items-center gap-1">
                  <Trophy className="w-3 h-3" /> cerrado
                </span>
                <button
                  onClick={() => plan && reopenPlan(plan.id)}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  title="Reabrir para seguir editando"
                >
                  reabrir
                </button>
              </>
            ) : plan ? (
              <button
                onClick={() => setShowClose(true)}
                className="px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 text-emerald-300 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
              >
                <Trophy className="w-3.5 h-3.5" /> Cerrar
              </button>
            ) : null}
          </div>
        </div>

        <p className="text-xs text-zinc-500 italic leading-relaxed">{template.intro}</p>
      </div>

      {/* Mini-calendar — only on quarter view, shows the 3 months side
          by side with today highlighted. Helps the user place themselves
          in time while filling the quarter plan. */}
      {level === 'quarter' && (
        <QuarterMiniCalendar quarterKey={periodKey} />
      )}

      {/* If no plan yet — empty state with start CTA */}
      {!plan && (
        <div className="bg-black/20 border border-white/[0.08] rounded-2xl p-8 text-center">
          <Target className="w-9 h-9 text-indigo-400/70 mx-auto mb-3" />
          <p className="text-sm font-semibold text-zinc-200 mb-1">No empezaste este {levelLabel(level)} todavía</p>
          <p className="text-xs text-zinc-500 mb-5 max-w-md mx-auto">
            Una vez que abrís el plan, vas a poder responder las preguntas a tu ritmo. Se guarda automático en cada cambio.
          </p>
          <button
            onClick={() => getOrCreatePlan(level, periodKey)}
            className="px-4 py-2 bg-indigo-500/15 border border-indigo-500/40 hover:bg-indigo-500/25 text-indigo-300 rounded-lg text-sm font-semibold transition-all"
          >
            Empezar plan
          </button>
        </div>
      )}

      {/* Sections (only when plan exists) */}
      {plan && template.sections.map((section) => (
        <Section
          key={section.key}
          section={section}
          plan={plan}
          onValueChange={(secKey, fieldKey, value) => updateValue(plan.id, secKey, fieldKey, value)}
        />
      ))}

      {/* Child periods overview */}
      {plan && ctx.children.length > 0 && (
        <ChildrenOverview
          level={level}
          children={ctx.children}
          onJump={onJumpToChild}
        />
      )}

      {/* Closing modal */}
      <AnimatePresence>
        {showClose && plan && (
          <ClosePlanModal
            label={labelForPeriod(periodKey)}
            onClose={() => setShowClose(false)}
            onConfirm={({ mood, notes }) => {
              closePlan(plan.id, { mood, notes })
              setShowClose(false)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function levelLabel(level: ProjectionLevel): string {
  if (level === 'year') return 'año'
  if (level === 'quarter') return 'trimestre'
  return 'mes'
}

// ─────────────────────────────────────────────────────────────────────
// HIERARCHY CONTEXT — figure out parents (breadcrumb) and children
// ─────────────────────────────────────────────────────────────────────
interface HierarchyChild {
  level: ProjectionLevel | 'week'
  key: string
  label: string
  plan?: ProjectionPlan
  closed?: boolean
  /** For weeks (SPI sessions), link to /spi */
  href?: string
}

function buildHierarchyContext(
  level: ProjectionLevel,
  periodKey: string,
  allPlans: ProjectionPlan[],
  spiSessions: ReturnType<typeof useSPIStore.getState>['sessions'],
): { parents: { key: string; label: string }[]; children: HierarchyChild[] } {
  const parents: { key: string; label: string }[] = []
  const children: HierarchyChild[] = []

  if (level === 'quarter') {
    parents.push({ key: yearOfQuarter(periodKey), label: yearOfQuarter(periodKey) })
    for (const monthKey of quarterMonths(periodKey)) {
      const plan = allPlans.find((p) => p.level === 'month' && p.periodKey === monthKey)
      children.push({
        level: 'month',
        key: monthKey,
        label: labelForPeriod(monthKey),
        plan,
        closed: !!plan?.closedAt,
      })
    }
  } else if (level === 'month') {
    const qKey = quarterOfMonthKey(periodKey)
    parents.push({ key: yearOfMonth(periodKey), label: yearOfMonth(periodKey) })
    parents.push({ key: qKey, label: labelForPeriod(qKey) })
    // Weeks (SPI sessions) inside this month
    const monthSessions = spiSessions
      .filter((s) => monthOfSpiWeek(s.weekStartDate) === periodKey)
      .sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate))
    for (const sess of monthSessions) {
      const [, m, d] = sess.weekStartDate.split('-')
      const wN = weekOfQuarter(sess.weekStartDate)
      children.push({
        level: 'week',
        key: sess.id,
        // Format: "Semana N · DD/MM" — N is the week index INSIDE the
        // quarter (1-12/13), not the ISO week of year. The user plans in
        // 12-week trimester cycles.
        label: `Semana ${wN} · ${d}/${m}`,
        closed: !!sess.closedAt,
        href: '/spi',
      })
    }
  } else {
    // Year — children are the 4 quarters
    for (const q of [1, 2, 3, 4]) {
      const qKey = `${periodKey}-Q${q}`
      const plan = allPlans.find((p) => p.level === 'quarter' && p.periodKey === qKey)
      children.push({
        level: 'quarter',
        key: qKey,
        label: labelForPeriod(qKey),
        plan,
        closed: !!plan?.closedAt,
      })
    }
  }

  return { parents, children }
}

// ─────────────────────────────────────────────────────────────────────
// CHILDREN OVERVIEW — shows what's nested below the current level
// ─────────────────────────────────────────────────────────────────────
function ChildrenOverview({
  level, children, onJump,
}: {
  level: ProjectionLevel
  children: HierarchyChild[]
  onJump: (level: ProjectionLevel, periodKey: string) => void
}) {
  const childTypeLabel = level === 'year' ? 'Trimestres' : level === 'quarter' ? 'Meses' : 'Semanas (SPI)'
  return (
    <div className="bg-black/20 border border-white/[0.08] rounded-xl p-4">
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-1.5">
        <ChevronDown className="w-3 h-3" /> {childTypeLabel}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {children.map((child) => {
          const Common = (
            <div className={`w-full bg-white/[0.03] border rounded-lg px-3 py-2 transition-all ${
              child.closed
                ? 'border-emerald-500/30'
                : child.plan
                  ? 'border-indigo-500/30'
                  : 'border-white/[0.08] hover:border-white/[0.12]'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-200 capitalize">{child.label}</span>
                {child.closed && <Trophy className="w-3 h-3 text-emerald-400 shrink-0" />}
              </div>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                {child.closed ? 'cerrado' : child.plan ? 'en progreso' : child.level === 'week' ? '— sin sesión SPI' : '— sin empezar'}
              </p>
            </div>
          )
          if (child.href) {
            return (
              <Link key={child.key} href={child.href} title="Ir a SPI">
                {Common}
              </Link>
            )
          }
          return (
            <button
              key={child.key}
              onClick={() => onJump(child.level as ProjectionLevel, child.key)}
              className="text-left"
            >
              {Common}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// SECTION + FIELD (mini-versions, reused from SPI's layout)
// ─────────────────────────────────────────────────────────────────────
function Section({
  section, plan, onValueChange,
}: {
  section: SPISection
  plan: ProjectionPlan
  onValueChange: (sectionKey: string, fieldKey: string, value: string) => void
}) {
  // Always start COLLAPSED — the user explicitly asked for everything to
  // be closed by default across all Proyección tabs (Vista de Águila,
  // Anual, Trimestre, Mes). They open what they need, when they need it.
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-black/20 border border-white/[0.08] rounded-xl">
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
              {/* Special render: principal-goals picker — for metas_anuales
                  it goes ABOVE the field list so the user picks the areas
                  to focus on FIRST (any number — 1, 2, 3, 4...), then
                  completes the metas (which get re-ordered to put
                  principales on top). */}
              {section.key === 'metas_anuales' && (
                <PrincipalGoalsPicker
                  values={plan.values[section.key] ?? {}}
                  onChange={(principalesCsv) => onValueChange(section.key, 'principales', principalesCsv)}
                />
              )}
              {(() => {
                if (!section.fields) return null
                // For metas_anuales, re-order: principales first, then the rest.
                let orderedFields = section.fields
                let principalKeys: string[] = []
                if (section.key === 'metas_anuales') {
                  principalKeys = (plan.values[section.key]?.principales ?? '').split(',').filter(Boolean)
                  const principalSet = new Set(principalKeys)
                  const principalFields = section.fields.filter((f) => principalSet.has(f.key))
                  const rest = section.fields.filter((f) => !principalSet.has(f.key))
                  orderedFields = [...principalFields, ...rest]
                }
                return orderedFields.map((field) => {
                  const isPrincipal = principalKeys.includes(field.key)
                  return (
                    <Field
                      key={field.key}
                      field={isPrincipal ? { ...field, label: `⭐ ${field.label}` } : field}
                      value={plan.values[section.key]?.[field.key] ?? ''}
                      onChange={(v) => onValueChange(section.key, field.key, v)}
                    />
                  )
                })
              })()}
              {/* Subsections (recursive) — used by the 3-layer breakdown */}
              {section.subsections?.map((sub) => (
                <div key={sub.key} className="ml-2">
                  <Section
                    section={sub}
                    plan={plan}
                    onValueChange={onValueChange}
                  />
                </div>
              ))}
              {/* Special render: Wheel of Life radar chart, only for
                  this specific section key. Visualizes the score fields
                  the user just filled with sliders above. */}
              {section.key === 'wheel_of_life' && (
                <WheelOfLifeChart values={plan.values[section.key] ?? {}} />
              )}
              {/* Special render: cascade block — for quarter/month plans.
                  Reads the parent level's principales/sub-goals and lets
                  the user write 3 sub-goals per principal area at THIS level.
                  Has an "AI desglosar" button per area to auto-fill. */}
              {section.key === 'principal_cascade' && (
                <PrincipalCascadeBlock
                  plan={plan}
                  onValueChange={onValueChange}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// QUARTER MINI CALENDAR — 3 months side-by-side, today highlighted.
// Helps you locate yourself in time while filling the quarter plan.
// ─────────────────────────────────────────────────────────────────────

/** ISO week number for a given local date. */
function getIsoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)
}

/** Generate the 6-row × 7-col grid for one calendar month, Monday-first.
 *  Each cell carries date + flags for the renderer. */
function buildMonthGrid(year: number, monthIdx: number): {
  weeks: { weekNo: number; days: { date: Date; inMonth: boolean }[] }[]
} {
  // Find the Monday that starts the week containing day 1.
  const firstOfMonth = new Date(year, monthIdx, 1)
  const dayOfWeek = (firstOfMonth.getDay() + 6) % 7  // 0 = Monday
  const gridStart = new Date(firstOfMonth)
  gridStart.setDate(firstOfMonth.getDate() - dayOfWeek)

  const weeks: ReturnType<typeof buildMonthGrid>['weeks'] = []
  for (let w = 0; w < 6; w++) {
    const weekRow: { date: Date; inMonth: boolean }[] = []
    let weekNo = 0
    for (let d = 0; d < 7; d++) {
      const date = new Date(gridStart)
      date.setDate(gridStart.getDate() + w * 7 + d)
      if (d === 0) weekNo = getIsoWeek(date)
      weekRow.push({ date, inMonth: date.getMonth() === monthIdx })
    }
    weeks.push({ weekNo, days: weekRow })
    // Stop early if next week starts past the month AND we already covered
    // the last day — keeps the grid 4-6 rows depending on month layout.
    const lastDayThisRow = weekRow[6].date
    if (lastDayThisRow.getMonth() > monthIdx && w >= 3) break
    if (lastDayThisRow.getMonth() !== monthIdx && lastDayThisRow.getFullYear() > year && w >= 3) break
  }
  return { weeks }
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// ─────────────────────────────────────────────────────────────────────
// MONTH SNAPSHOT (stored o live)
// ─────────────────────────────────────────────────────────────────────
/** Decide entre el snapshot CONGELADO en el plan (capturado al cerrar)
 *  y un cálculo EN VIVO desde los stores de hábitos + wallet. Casos:
 *   - Plan cerrado con `monthSnapshot` guardado → usamos el congelado.
 *   - Plan cerrado SIN `monthSnapshot` (cerrado antes de la feature) →
 *     calculamos en vivo y mostramos un hint "vista en vivo".
 *   - Plan abierto → calculamos en vivo igual; útil para ver el progreso
 *     del mes en curso sin tener que cerrarlo.
 *
 *  El cálculo en vivo se re-corre cuando cambian los hábitos o las
 *  transacciones, así el panel siempre refleja el estado actual. */
function MonthSnapshotContainer({
  plan, periodKey,
}: {
  plan: ProjectionPlan
  periodKey: string
}) {
  // Suscripción a los stores que alimentan el snapshot live, así el
  // panel se re-renderiza cuando cambian (marcar un hábito, sumar
  // una transacción, etc.).
  const habits = useHabitsStore((s) => s.habits)
  const transactions = useWalletStore((s) => s.transactions)
  const liveSnapshot = useMemo(() => {
    if (plan.monthSnapshot) return null  // ya hay frozen, no hace falta computar
    return buildMonthSnapshot(periodKey)
    // habits y transactions están en deps para que recompute cuando cambien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.monthSnapshot, periodKey, habits, transactions])

  const snapshot = plan.monthSnapshot ?? liveSnapshot
  if (!snapshot) return null
  const isLive = !plan.monthSnapshot
  return <MonthClosureSnapshotBlock snapshot={snapshot} periodKey={periodKey} isLive={isLive} />
}

/** Renderiza la imagen del mes — grid de hábitos día por día + total de
 *  ingresos por moneda. Puede venir de un snapshot CONGELADO (capturado
 *  al cerrar el mes) o calculado EN VIVO desde los stores. El flag
 *  `isLive` solo cambia el subtítulo para que el usuario sepa qué está
 *  viendo. */
function MonthClosureSnapshotBlock({
  snapshot, periodKey, isLive = false,
}: {
  snapshot: import('@/lib/projection/types').MonthClosureSnapshot
  periodKey: string
  isLive?: boolean
}) {
  const [yearStr, monthStr] = periodKey.split('-')
  const year = parseInt(yearStr, 10)
  const monthIdx = parseInt(monthStr, 10) - 1
  const totalDays = new Date(year, monthIdx + 1, 0).getDate()
  const dayNumbers = Array.from({ length: totalDays }, (_, i) => i + 1)
  const monthName = MONTH_NAMES[monthIdx] ?? monthStr
  const capturedDate = new Date(snapshot.capturedAt).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div className="bg-black/30 border border-emerald-500/20 rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[10px] font-mono uppercase tracking-wider text-emerald-300/80">
          📸 {isLive ? 'Vista en vivo' : 'Snapshot del cierre'} · {monthName} {year}
        </p>
        <span className="text-[10px] text-zinc-600 font-mono">
          {isLive ? 'calculado en vivo desde tus datos' : `capturado el ${capturedDate}`}
        </span>
      </div>

      {/* Hábitos del mes — grid día x hábito */}
      {snapshot.habits.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-zinc-300">Hábitos · cómo te fue</p>
          <div className="overflow-x-auto -mx-1 px-1">
            <div className="inline-block min-w-full">
              {/* Header con números de día */}
              <div className="flex items-center gap-1 mb-1 ml-[140px]">
                {dayNumbers.map((d) => (
                  <span key={d} className="w-5 text-center text-[9px] font-mono text-zinc-600 tabular-nums">
                    {d}
                  </span>
                ))}
              </div>
              {/* Una fila por hábito */}
              {snapshot.habits.map((h) => (
                <div key={h.id} className="flex items-center gap-1 mb-1">
                  <div className="w-[140px] shrink-0 flex items-center gap-1.5 pr-2">
                    <span className="text-sm shrink-0">{h.icon}</span>
                    <span className="text-[11px] text-zinc-300 truncate" title={h.name}>{h.name}</span>
                  </div>
                  {h.days.map((state, i) => {
                    const bg = state === 'done' ? h.color
                      : state === 'skipped' ? '#27272a'
                      : state === 'future' ? 'transparent'
                      : '#18181b'
                    const border = state === 'future' ? '1px dashed #3f3f46' : 'none'
                    const title = state === 'done' ? 'Cumplido'
                      : state === 'skipped' ? 'N/A'
                      : state === 'future' ? 'Posterior al cierre'
                      : 'Perdido'
                    return (
                      <div
                        key={i}
                        title={`Día ${i + 1} · ${title}`}
                        className="w-5 h-5 rounded shrink-0"
                        style={{ backgroundColor: bg, border, opacity: state === 'missed' ? 0.5 : 1 }}
                      />
                    )
                  })}
                  <span className="ml-2 text-[10px] font-mono tabular-nums text-zinc-400 shrink-0">
                    {h.completionPct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-zinc-600 italic">Sin hábitos cargados al cierre.</p>
      )}

      {/* Ingresos por moneda */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-zinc-300">Ingresos del mes</p>
        {snapshot.income.length === 0 ? (
          <p className="text-xs text-zinc-600 italic">Sin ingresos registrados.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {snapshot.income.map((row) => (
              <div key={row.currencyCode} className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2">
                <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{row.currencyCode}</p>
                <p className="text-base font-bold text-emerald-300 tabular-nums">
                  {row.total.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-zinc-600">{row.count} {row.count === 1 ? 'movimiento' : 'movimientos'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function QuarterMiniCalendar({ quarterKey }: { quarterKey: string }) {
  // Parse 'YYYY-QN' → year + first month index (0-based).
  const [yearStr, qStr] = quarterKey.split('-Q')
  const year = parseInt(yearStr, 10)
  const q = parseInt(qStr, 10)
  if (Number.isNaN(year) || Number.isNaN(q)) return null
  const firstMonthIdx = (q - 1) * 3

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isSameYMD = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()

  return (
    <div className="bg-black/20 border border-white/[0.08] rounded-xl p-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((offset) => {
          const monthIdx = firstMonthIdx + offset
          const monthYear = year + Math.floor(monthIdx / 12)
          const realMonthIdx = monthIdx % 12
          const grid = buildMonthGrid(monthYear, realMonthIdx)
          return (
            <div key={monthIdx}>
              <p className="text-xs font-semibold text-zinc-200 mb-2">
                {MONTH_NAMES[realMonthIdx]}{monthYear !== year && ` ${monthYear}`}
              </p>
              {/* Weekday headers (Spanish Mon-Sun, X for Wednesday) */}
              <div className="grid grid-cols-[24px_repeat(7,1fr)] gap-y-0.5 mb-1">
                <span />
                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
                  <span key={d} className="text-[10px] text-zinc-500 text-center font-medium">{d}</span>
                ))}
              </div>
              {/* Weeks */}
              <div className="grid grid-cols-[24px_repeat(7,1fr)] gap-y-0.5">
                {grid.weeks.map((week, wi) => (
                  <React.Fragment key={wi}>
                    <span className="text-[9px] text-zinc-600 bg-white/[0.03] rounded text-center font-mono leading-6">
                      {week.weekNo}
                    </span>
                    {week.days.map((cell, di) => {
                      const isToday = isSameYMD(cell.date, today)
                      const isWeekend = di >= 5
                      let textCls = 'text-zinc-200'
                      if (!cell.inMonth) textCls = 'text-zinc-700'
                      else if (isWeekend) textCls = 'text-red-400'
                      return (
                        <div key={di} className="text-center relative">
                          {isToday ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white text-[11px] font-semibold">
                              {cell.date.getDate()}
                            </span>
                          ) : (
                            <span className={`inline-block text-[11px] leading-6 ${textCls}`}>
                              {cell.date.getDate()}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Cascade block — renders the 2 principal areas with their parent goal
 *  (from annual or quarter) and 3 sub-goal inputs for this level + an
 *  "AI desglosar" button per area that proposes 3 sub-goals.
 *
 *  Data model: sub-goals are stored under
 *    plan.values.principal_cascade.{areaKey}_sub1 / _sub2 / _sub3
 *  Annual principales are READ-ONLY from the annual plan (live, no
 *  snapshot yet — that's a future feature). */
function PrincipalCascadeBlock({
  plan, onValueChange,
}: {
  plan: ProjectionPlan
  onValueChange: (sectionKey: string, fieldKey: string, value: string) => void
}) {
  const allPlans = useProjectionStore((s) => s.plans)
  const [busyArea, setBusyArea] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Resolve principales + parent goals from the level above.
  const { principalKeys, parentGoals, parentLevelLabel } = useMemo(() => {
    if (plan.level === 'quarter') {
      // Read from annual plan of the same year.
      const year = plan.periodKey.split('-Q')[0]
      const annualPlan = allPlans.find((p) => p.level === 'year' && p.periodKey === year)
      const principalesCsv = annualPlan?.values?.metas_anuales?.principales ?? ''
      const keys = principalesCsv.split(',').filter(Boolean)
      const goals: Record<string, string> = {}
      for (const k of keys) {
        goals[k] = (annualPlan?.values?.metas_anuales?.[k] ?? '').trim()
      }
      return { principalKeys: keys, parentGoals: goals, parentLevelLabel: `Anual ${year}` }
    }
    if (plan.level === 'month') {
      // Read from THIS month's parent quarter plan.
      const [year, monthStr] = plan.periodKey.split('-')
      const monthNum = parseInt(monthStr, 10)
      const qNum = monthNum <= 3 ? 1 : monthNum <= 6 ? 2 : monthNum <= 9 ? 3 : 4
      const quarterKey = `${year}-Q${qNum}`
      const quarterPlan = allPlans.find((p) => p.level === 'quarter' && p.periodKey === quarterKey)
      // Quarter's principales are inherited from annual.
      const annualPlan = allPlans.find((p) => p.level === 'year' && p.periodKey === year)
      const principalesCsv = annualPlan?.values?.metas_anuales?.principales ?? ''
      const keys = principalesCsv.split(',').filter(Boolean)
      // Parent goal at month level = concatenated quarter sub-goals.
      const goals: Record<string, string> = {}
      for (const k of keys) {
        const subs = [1, 2, 3]
          .map((i) => quarterPlan?.values?.principal_cascade?.[`${k}_sub${i}`] ?? '')
          .filter((s) => s.trim().length > 0)
        goals[k] = subs.length > 0 ? subs.map((s, i) => `${i + 1}. ${s}`).join('\n') : ''
      }
      return { principalKeys: keys, parentGoals: goals, parentLevelLabel: `Trimestral ${quarterKey}` }
    }
    return { principalKeys: [], parentGoals: {}, parentLevelLabel: '' }
  }, [plan, allPlans])

  const areaLabel = (key: string) => WHEEL_AREAS.find((a) => a.key === key)?.label ?? key

  const callDesglosar = async (areaKey: string) => {
    setError(null)
    setBusyArea(areaKey)
    try {
      const headers = getAiHeaders()
      if (!headers) {
        setError('La IA está desactivada en Settings. Activala para usar el desglose automático.')
        setBusyArea(null)
        return
      }
      const res = await fetch('/api/ai/projection-breakdown', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          parentGoal: parentGoals[areaKey],
          level: plan.level,  // 'quarter' or 'month'
          context: `Área: ${areaLabel(areaKey)}. Nivel padre: ${parentLevelLabel}.`,
        }),
      })
      const json = await res.json()
      if (!json.ok || !Array.isArray(json.subgoals)) {
        setError(json.error ?? 'No se generaron sub-metas')
        setBusyArea(null)
        return
      }
      // Apply to all 3 slots — overwrites previous AI/manual content.
      const subs: string[] = json.subgoals
      for (let i = 0; i < 3; i++) {
        onValueChange('principal_cascade', `${areaKey}_sub${i + 1}`, subs[i] ?? '')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setBusyArea(null)
    }
  }

  if (principalKeys.length === 0) {
    return (
      <div className="bg-black/30 border border-amber-500/20 rounded-xl p-4 text-center">
        <p className="text-xs text-amber-300/80">
          Todavía no elegiste tus áreas principales del año.
        </p>
        <p className="text-[10px] text-zinc-500 mt-1">
          Volvé al plan <span className="text-zinc-300">Anual</span> y marcá las áreas que vas a trabajar en la sección "Metas del año".
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      {principalKeys.map((areaKey) => {
        const parent = parentGoals[areaKey] || '— sin meta en el nivel superior —'
        const subs = [1, 2, 3].map((i) => plan.values.principal_cascade?.[`${areaKey}_sub${i}`] ?? '')
        const isBusy = busyArea === areaKey
        return (
          <div key={areaKey} className="bg-black/30 border border-amber-500/20 rounded-xl overflow-hidden">
            {/* Header con el área */}
            <div className="px-4 py-3 bg-amber-500/5 border-b border-amber-500/20 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-amber-400">⭐</span>
                <span className="text-sm font-semibold text-amber-200">{areaLabel(areaKey)}</span>
                <span className="text-[10px] font-mono text-zinc-600 uppercase">
                  desglose {plan.level === 'quarter' ? 'trimestral' : 'mensual'}
                </span>
              </div>
              <button
                onClick={() => callDesglosar(areaKey)}
                disabled={isBusy || !parentGoals[areaKey]}
                title={!parentGoals[areaKey] ? 'No hay meta padre para desglosar' : 'Desglosar con IA (tirá los dados otra vez para variar)'}
                className="text-[10px] font-semibold text-amber-300 hover:text-amber-200 hover:bg-amber-500/15 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1 rounded transition-colors flex items-center gap-1.5"
              >
                {isBusy ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Desglosando...</>
                ) : subs.some((s) => s.trim()) ? (
                  <><Dices className="w-3 h-3" /> Tirar dados</>
                ) : (
                  <><Sparkles className="w-3 h-3" /> Desglosar con IA</>
                )}
              </button>
            </div>
            <div className="p-4 space-y-3">
              {/* Parent goal (read-only) */}
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
                  Meta padre · {parentLevelLabel}
                </p>
                <p className="text-xs text-zinc-300 whitespace-pre-wrap bg-white/[0.03] border border-white/[0.08] rounded px-2.5 py-2">
                  {parent}
                </p>
              </div>
              {/* 3 sub-goal inputs */}
              <div className="space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  {plan.level === 'quarter'
                    ? 'Cómo vas a sostener por 12 semanas este objetivo'
                    : '3 sub-metas para este mes'}
                </p>
                {[0, 1, 2].map((idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-[10px] font-mono text-zinc-600 mt-2 w-4 shrink-0">{idx + 1}.</span>
                    <AutoGrowTextarea
                      value={subs[idx]}
                      onChange={(e) => onValueChange('principal_cascade', `${areaKey}_sub${idx + 1}`, e.target.value)}
                      placeholder={`Sub-meta ${idx + 1}...`}
                      minRows={2}
                      className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-amber-500/40"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** "Elegí tus metas principales" picker — rendered below the metas section.
 *  The selection is stored as a comma-separated list of area keys under
 *  values.metas_anuales.principales so it persists with the rest of the
 *  plan without needing schema changes. No cap — the user picks as many
 *  areas as they want and those are the ones that cascade down to quarter
 *  and month plans. */
function PrincipalGoalsPicker({
  values, onChange,
}: { values: Record<string, string>; onChange: (csv: string) => void }) {
  const principales = (values.principales ?? '').split(',').filter(Boolean)

  const toggle = (areaKey: string) => {
    if (principales.includes(areaKey)) {
      onChange(principales.filter((k) => k !== areaKey).join(','))
    } else {
      // No cap — the user can pick as many principal areas as they want.
      // All selected areas cascade down to quarter/month plans.
      onChange([...principales, areaKey].join(','))
    }
  }

  return (
    <div className="bg-black/30 border border-amber-500/20 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-amber-300">
          ⭐ Paso 1 · Elegí tus áreas principales del año
        </p>
        <span className="text-[10px] font-mono text-zinc-600">
          {principales.length} seleccionada{principales.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="text-[11px] text-zinc-500 italic mb-3">
        Marcá las áreas que vas a trabajar activamente este año — pueden ser 1, 2, 3 o
        las que necesites. Las demás quedan como referencia. Después abajo completás las
        metas — las elegidas aparecen arriba primero y son las que bajan al trimestre y al mes.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {WHEEL_AREAS.map((area) => {
          const filled = (values[area.key] ?? '').trim().length > 0
          const isPrincipal = principales.includes(area.key)
          return (
            <button
              key={area.key}
              onClick={() => toggle(area.key)}
              title={isPrincipal ? 'Click para quitar' : 'Click para marcar como principal'}
              className={`text-left p-2.5 rounded-lg border transition-all ${
                isPrincipal
                  ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                  : 'bg-white/[0.03] border-white/[0.08] hover:border-amber-500/30 text-zinc-300'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {isPrincipal && <span className="text-amber-400">⭐</span>}
                <span className="text-xs font-semibold truncate">{area.label}</span>
              </div>
              {filled ? (
                <p className="text-[10px] text-zinc-500 mt-1 line-clamp-2">
                  {values[area.key]}
                </p>
              ) : (
                <p className="text-[10px] text-zinc-700 italic mt-1">— sin meta aún —</p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Wheel-of-Life radar chart. Reads the score values stored in the
 *  wheel_of_life section and renders them as a polar/radar shape so the
 *  user can SEE where their life is leaning today before setting goals.
 *  Avg of the scored areas shown as a headline number. */
function WheelOfLifeChart({ values }: { values: Record<string, string> }) {
  const data = WHEEL_AREAS.map((area) => ({
    area: area.label,
    score: values[area.key] === '' || values[area.key] === undefined
      ? 0
      : Math.max(0, Math.min(100, parseInt(values[area.key], 10) || 0)),
    isRated: values[area.key] !== '' && values[area.key] !== undefined,
  }))

  const rated = data.filter((d) => d.isRated)
  const avg = rated.length > 0
    ? Math.round(rated.reduce((acc, d) => acc + d.score, 0) / rated.length)
    : 0
  const lowest = rated.length > 0
    ? rated.reduce((min, d) => d.score < min.score ? d : min, rated[0])
    : null

  if (rated.length === 0) {
    return (
      <div className="bg-black/30 border border-white/[0.08] rounded-xl p-6 text-center text-xs text-zinc-600 italic">
        Puntuá al menos un área para ver el gráfico.
      </div>
    )
  }

  return (
    <div className="bg-black/30 border border-indigo-500/20 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-indigo-300">
          🎯 Tu rueda hoy · {rated.length}/{WHEEL_AREAS.length} áreas puntuadas
        </p>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-zinc-500">
            promedio <span className="text-indigo-300 font-mono tabular-nums">{avg}</span>
          </span>
          {lowest && (
            <span className="text-zinc-500">
              más bajo <span className="text-red-400 font-mono">{lowest.area} · {lowest.score}</span>
            </span>
          )}
        </div>
      </div>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <RadarChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
            <PolarGrid stroke="#3f3f46" />
            <PolarAngleAxis
              dataKey="area"
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
            />
            <PolarRadiusAxis
              angle={90} domain={[0, 100]}
              tick={{ fontSize: 8, fill: '#52525b' }}
              tickCount={6}
            />
            <Radar
              name="Hoy" dataKey="score"
              stroke="#6366f1" fill="#6366f1" fillOpacity={0.3}
              strokeWidth={2}
              dot={{ r: 3, fill: '#818cf8' }}
            />
            <RechartsTooltip
              contentStyle={{ background: 'var(--surface-popover)', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
              formatter={(v) => [`${v ?? 0}/100`, 'Puntuación'] as [string, string]}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-zinc-600 italic text-center mt-2">
        Las áreas más bajas son las que más mueven la aguja si las subís este año.
      </p>
    </div>
  )
}

/** Textarea que crece automáticamente para mostrar TODO el contenido sin
 *  scroll. Mismo helper que existe en SPIPage — duplicado mínimo para no
 *  expandir la API de un módulo solo para esto. Cualquier cambio a la
 *  estrategia (reset height → scrollHeight) hay que aplicarlo en ambos. */
function AutoGrowTextarea({
  value, minRows = 3, style, ...rest
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> & {
  minRows?: number
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => {
    const ta = ref.current
    if (!ta) return
    // Reset → scrollHeight reflects natural content size. Sin esto el
    // textarea solo crece, nunca decrece al borrar.
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

function Field({
  field, value, onChange,
}: { field: SectionField; value: string; onChange: (v: string) => void }) {
  return (
    <div>
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
          className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-indigo-500/40"
        />
      ) : field.type === 'score' ? (
        // 0-100 slider. Value is stored as a string so it fits the existing
        // values shape (Record<string, Record<string, string>>). Empty
        // string = not yet rated.
        <ScoreSlider value={value} onChange={onChange} />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-indigo-500/40"
        />
      )}
      {field.epigraph && (
        <p className="text-[10px] text-zinc-600 italic mt-1.5">{field.epigraph}</p>
      )}
    </div>
  )
}

/** 0-100 slider for "score" fields (used in the Wheel of Life section).
 *  Color graduates green → amber → red so the user can spot weak areas
 *  fast. Empty value renders as a neutral "—" until first interaction. */
function ScoreSlider({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const numericValue = value === '' ? 50 : Math.max(0, Math.min(100, parseInt(value, 10) || 0))
  const isUnset = value === ''
  const color = isUnset ? '#52525b'
    : numericValue >= 75 ? '#10b981'   // emerald
    : numericValue >= 50 ? '#f59e0b'   // amber
    : '#ef4444'                          // red
  return (
    <div className="flex items-center gap-3">
      <input
        type="range" min={0} max={100} step={5}
        value={numericValue}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 accent-indigo-500"
        style={{ accentColor: color }}
      />
      <span
        className="text-sm font-mono tabular-nums w-12 text-right transition-colors"
        style={{ color }}
      >
        {isUnset ? '—' : numericValue}
      </span>
      {!isUnset && (
        <button
          onClick={() => onChange('')}
          title="Limpiar"
          className="text-[10px] text-zinc-700 hover:text-zinc-400"
        >
          reset
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// CLOSE MODAL
// ─────────────────────────────────────────────────────────────────────
function ClosePlanModal({
  label, onClose, onConfirm,
}: {
  label: string
  onClose: () => void
  onConfirm: (args: { mood: number; notes: string }) => void
}) {
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
          <Trophy className="w-5 h-5 text-emerald-400" /> Cerrar plan
        </h2>
        <p className="text-xs text-zinc-500 mb-5 capitalize">{label}</p>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-zinc-400 mb-2 block">Estado de ánimo / sensación al cierre (1-10)</label>
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
            <label className="text-xs text-zinc-400 mb-1.5 block">Reflexión / aprendizaje (opcional)</label>
            <AutoGrowTextarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="¿Qué te llevás de este período?"
              minRows={3}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/40"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 px-3 py-2 bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.12] text-zinc-400 rounded-lg text-sm transition-all">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm({ mood, notes })}
            className="flex-1 px-3 py-2 bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 text-emerald-300 rounded-lg text-sm font-semibold transition-all"
          >
            Cerrar
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}


// ─────────────────────────────────────────────────────────────────────
// MONTH KPIS AGGREGATE
// ─────────────────────────────────────────────────────────────────────
/** Agrega los KPIs de las 4-5 sesiones SPI cuya semana pertenece al mes
 *  `periodKey` (YYYY-MM). Por cada KPI distinto:
 *   - count   → suma de los valores semanales
 *   - percent → promedio
 *   - boolean → cuántas semanas en SÍ
 *  Compara contra `target × N_semanas_con_data` para el % de cumplimiento.
 *  Pulla todos los datos de session.weekSnapshot.kpis (frozen). Si una
 *  semana del mes está sin cerrar, sus valores live NO se computan acá
 *  (es la vista mensual: solo se evalúa lo cerrado). */
function MonthKpisAggregate({ periodKey }: { periodKey: string }) {
  const sessions = useSPIStore((s) => s.sessions)

  const aggregate = useMemo(() => {
    // Sesiones cerradas con weekSnapshot.kpis cuyo "mes mayoritario"
    // matchea periodKey. Mismo criterio de "mes mayoritario" que el
    // WeeklyGoalsByArea usa para deducir el monthly plan.
    const monthMatching = sessions.filter((sess) => {
      if (!sess.weekSnapshot?.kpis || sess.weekSnapshot.kpis.length === 0) return false
      const [yStr, mStr, dStr] = sess.weekStartDate.split('-').map(Number)
      const sat = new Date(yStr, mStr - 1, dStr)
      const counts = new Map<string, number>()
      for (let i = 0; i < 7; i++) {
        const d = new Date(sat)
        d.setDate(sat.getDate() + i)
        const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        counts.set(mk, (counts.get(mk) ?? 0) + 1)
      }
      let best = ''; let bestC = 0
      for (const [mk, c] of counts) if (c >= bestC) { best = mk; bestC = c }
      return best === periodKey
    }).sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate))

    // Por kpiId, juntar todos los snapshots presentes en las semanas.
    const byKpi = new Map<string, { id: string; name: string; icon: string; color: string; kind: 'count' | 'percent' | 'boolean'; group?: string; target?: number; values: number[] }>()
    for (const sess of monthMatching) {
      for (const ks of sess.weekSnapshot?.kpis ?? []) {
        const existing = byKpi.get(ks.id)
        if (existing) {
          existing.values.push(ks.value)
        } else {
          byKpi.set(ks.id, {
            id: ks.id, name: ks.name, icon: ks.icon, color: ks.color, kind: ks.kind,
            group: ks.group, target: ks.target, values: [ks.value],
          })
        }
      }
    }

    const result = Array.from(byKpi.values()).map((k) => {
      const total = k.values.reduce((a, b) => a + b, 0)
      const avg = k.values.length > 0 ? total / k.values.length : 0
      const weeksCount = k.values.length
      let aggValue: number
      let aggTarget: number | undefined
      if (k.kind === 'percent') {
        aggValue = Math.round(avg)
        aggTarget = k.target  // target es 0-100; usamos directo
      } else if (k.kind === 'boolean') {
        aggValue = total       // cuántas semanas en SÍ
        aggTarget = weeksCount // target implícito = todas las semanas
      } else {
        aggValue = total       // suma de count
        aggTarget = k.target !== undefined ? k.target * weeksCount : undefined
      }
      const pct = aggTarget && aggTarget > 0 ? Math.min(100, Math.round((aggValue / aggTarget) * 100)) : null
      return {
        id: k.id, name: k.name, icon: k.icon, color: k.color, kind: k.kind, group: k.group,
        weeksCount, aggValue, aggTarget, pct,
      }
    })
    return { kpis: result, weeksWithData: monthMatching.length }
  }, [sessions, periodKey])

  if (aggregate.kpis.length === 0) return null

  return (
    <div className="bg-black/30 border border-fuchsia-500/20 rounded-2xl p-4 space-y-3">
      <p className="text-[10px] font-mono uppercase tracking-wider text-fuchsia-300/80">
        📊 KPIs del mes · agregado de {aggregate.weeksWithData} semana{aggregate.weeksWithData === 1 ? '' : 's'} cerrada{aggregate.weeksWithData === 1 ? '' : 's'}
      </p>
      <table className="min-w-full text-[11px]">
        <tbody>
          {aggregate.kpis.map((k) => {
            const pct = k.pct
            const color = pct === null ? '#71717a'
              : pct >= 100 ? '#10b981'
              : pct >= 75 ? '#34d399'
              : pct >= 50 ? '#f59e0b'
              : '#ef4444'
            const label = k.kind === 'boolean'
              ? `${k.aggValue}/${k.aggTarget} semanas`
              : k.kind === 'percent'
                ? `${Math.round(k.aggValue)}% promedio`
                : k.aggTarget !== undefined
                  ? `${k.aggValue}/${k.aggTarget}`
                  : String(k.aggValue)
            return (
              <tr key={k.id} className="border-t border-zinc-900 first:border-t-0">
                <td className="py-2 pr-3">
                  <span className="mr-1.5">{k.icon}</span>
                  <span className="text-zinc-300">{k.name}</span>
                  {k.group && (
                    <span className="ml-2 text-[10px] text-zinc-600">· {k.group}</span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums" style={{ color }}>
                  {label}
                  {pct !== null && (
                    <span className="text-[10px] text-zinc-600 ml-1">· {pct}%</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-zinc-600 italic">
        Suma para counters · promedio para percent · semanas cumplidas para boolean. Solo se computan las semanas SPI cerradas del mes.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// COPY PLAN BUTTON
// ─────────────────────────────────────────────────────────────────────
/** Botón "Copiar" que serializa el plan completo a markdown copy-paste-ready
 *  (titulado, secciones, fields con valor no vacío, cascade, mood/notes
 *  de cierre si aplica) y lo manda al clipboard. Pensado para pegar en un
 *  chat IA que te ayude a completar el plan. */
function CopyPlanButton({ plan, template }: { plan: ProjectionPlan; template: ProjectionTemplate }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  // Pulleamos TODOS los planes + KPIs para que el export pueda resolver
  // las secciones dinámicas (principal_cascade tira sobre el anual, etc).
  const allPlans = useProjectionStore((s) => s.plans)
  const kpiDefinitions = useKpisStore((s) => s.definitions)
  const handle = async () => {
    const md = planToMarkdown(plan, template, { allPlans, kpiDefinitions })
    const ok = await copyMarkdownToClipboard(md)
    setStatus(ok ? 'copied' : 'error')
    setTimeout(() => setStatus('idle'), 2000)
  }
  return (
    <button
      onClick={handle}
      title="Copiar todo el contenido del plan a markdown — útil para pegar en un chat y pedir ayuda."
      className="px-2.5 py-1.5 bg-zinc-800 border border-white/[0.12] hover:bg-white/[0.08] text-zinc-300 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0"
    >
      {status === 'copied' ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado</>
        : status === 'error' ? <><X className="w-3.5 h-3.5 text-red-400" /> Falló</>
        : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
    </button>
  )
}
