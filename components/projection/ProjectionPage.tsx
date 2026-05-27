'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Telescope, ChevronLeft, ChevronRight, ChevronDown, Calendar, Target,
  Trophy, X, RotateCcw, ArrowRight, Infinity as InfinityIcon,
} from 'lucide-react'
import { useProjectionStore } from '@/lib/store/projectionStore'
import { useSPIStore } from '@/lib/store/spiStore'
import { ALL_TEMPLATES, WHEEL_AREAS } from '@/lib/projection/templates'
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip as RechartsTooltip,
} from 'recharts'
import { Sparkles, Dices, Loader2 } from 'lucide-react'
import { getAiHeaders } from '@/lib/ai/headers'
import {
  currentYearKey, currentQuarterKey, currentMonthKey,
  quarterMonths, yearOfQuarter, yearOfMonth, quarterOfMonthKey,
  labelForPeriod, shiftPeriod, monthOfSpiWeek,
} from '@/lib/projection/period'
import type { ProjectionLevel, ProjectionPlan, SPISection, SectionField } from '@/lib/projection/types'

export function ProjectionPage() {
  const {
    plans, getOrCreatePlan, updateValue, closePlan, reopenPlan, findPlan,
  } = useProjectionStore()
  const spiSessions = useSPIStore((s) => s.sessions)

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Active tab + active periods per level. We track each separately so
  // navigating between tabs preserves where the user was.
  const [activeLevel, setActiveLevel] = useState<ProjectionLevel>('year')
  const [yearKey, setYearKey] = useState(() => currentYearKey())
  const [quarterKey, setQuarterKey] = useState(() => currentQuarterKey())
  const [monthKey, setMonthKey] = useState(() => currentMonthKey())

  // Honor `?level=X&period=Y` query params so breadcrumb links from /spi
  // (e.g. /proyeccion?level=quarter&period=2026-Q1) drop the user into
  // the right tab and period.
  const searchParams = useSearchParams()
  useEffect(() => {
    if (!mounted) return
    const lvl = searchParams.get('level') as ProjectionLevel | null
    const period = searchParams.get('period')
    if (lvl === 'year' || lvl === 'quarter' || lvl === 'month') {
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
          <Telescope className="w-6 h-6 text-indigo-400" />
          Proyección
        </h1>
        <p className="text-xs text-zinc-500 mt-1 max-w-xl">
          La vista de águila: año, trimestre, mes. Lo táctico de cada semana sucede en{' '}
          <Link href="/spi" className="text-fuchsia-400 hover:text-fuchsia-300 underline decoration-fuchsia-500/30">
            ♾️ SPI
          </Link>.
        </p>
      </header>

      {/* ── Level tabs ──────────────────────────────────────────── */}
      <div className="flex items-center gap-1 bg-zinc-950/60 border border-zinc-800 rounded-xl p-1 w-fit">
        <LevelTab active={activeLevel === 'year'}    onClick={() => setActiveLevel('year')}    icon="🦅" label="Anual" />
        <LevelTab active={activeLevel === 'quarter'} onClick={() => setActiveLevel('quarter')} icon="🎯" label="Trimestral" />
        <LevelTab active={activeLevel === 'month'}   onClick={() => setActiveLevel('month')}   icon="📆" label="Mensual" />
      </div>

      {/* ── Active level content ────────────────────────────────── */}
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
      {activeLevel === 'quarter' && (
        <LevelView
          level="quarter"
          periodKey={quarterKey}
          onShift={(delta) => setQuarterKey((k) => shiftPeriod(k, delta))}
          onGoToToday={() => setQuarterKey(currentQuarterKey())}
          plan={findPlan('quarter', quarterKey)}
          getOrCreatePlan={getOrCreatePlan}
          updateValue={updateValue}
          closePlan={closePlan}
          reopenPlan={reopenPlan}
          relatedPlans={plans}
          spiSessions={spiSessions}
          onJumpToChild={(level, periodKey) => {
            if (level === 'month') { setMonthKey(periodKey); setActiveLevel('month') }
          }}
        />
      )}
      {activeLevel === 'month' && (
        <LevelView
          level="month"
          periodKey={monthKey}
          onShift={(delta) => setMonthKey((k) => shiftPeriod(k, delta))}
          onGoToToday={() => setMonthKey(currentMonthKey())}
          plan={findPlan('month', monthKey)}
          getOrCreatePlan={getOrCreatePlan}
          updateValue={updateValue}
          closePlan={closePlan}
          reopenPlan={reopenPlan}
          relatedPlans={plans}
          spiSessions={spiSessions}
          onJumpToChild={() => { /* week → handled via direct SPI link */ }}
        />
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
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
      }`}
    >
      <span>{icon}</span> {label}
    </button>
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
      <div className="bg-zinc-950/60 border border-indigo-500/20 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onShift(-1)}
              className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-zinc-200 transition-colors"
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
              className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-zinc-200 transition-colors"
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

      {/* If no plan yet — empty state with start CTA */}
      {!plan && (
        <div className="bg-zinc-950/40 border border-zinc-800 rounded-2xl p-8 text-center">
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
      children.push({
        level: 'week',
        key: sess.id,
        label: `Semana del ${d}/${m}`,
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
    <div className="bg-zinc-950/40 border border-zinc-800 rounded-xl p-4">
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-1.5">
        <ChevronDown className="w-3 h-3" /> {childTypeLabel}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {children.map((child) => {
          const Common = (
            <div className={`w-full bg-zinc-900 border rounded-lg px-3 py-2 transition-all ${
              child.closed
                ? 'border-emerald-500/30'
                : child.plan
                  ? 'border-indigo-500/30'
                  : 'border-zinc-800 hover:border-zinc-700'
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
  const [open, setOpen] = useState(!section.defaultCollapsed)
  return (
    <div className="bg-zinc-950/40 border border-zinc-800 rounded-xl">
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
              {/* Special render: "2 metas principales" picker — for
                  metas_anuales it goes ABOVE the field list so the user
                  picks the 2 areas to focus on FIRST, then completes the
                  metas (which get re-ordered to put principales on top). */}
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
      <div className="bg-zinc-950/60 border border-amber-500/20 rounded-xl p-4 text-center">
        <p className="text-xs text-amber-300/80">
          Todavía no elegiste tus 2 áreas principales del año.
        </p>
        <p className="text-[10px] text-zinc-500 mt-1">
          Volvé al plan <span className="text-zinc-300">Anual</span> y marcá 2 áreas en la sección "Metas del año".
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
          <div key={areaKey} className="bg-zinc-950/60 border border-amber-500/20 rounded-xl overflow-hidden">
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
                <p className="text-xs text-zinc-300 whitespace-pre-wrap bg-zinc-900/60 border border-zinc-800 rounded px-2.5 py-2">
                  {parent}
                </p>
              </div>
              {/* 3 sub-goal inputs */}
              <div className="space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  3 sub-metas para este {plan.level === 'quarter' ? 'trimestre' : 'mes'}
                </p>
                {[0, 1, 2].map((idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-[10px] font-mono text-zinc-600 mt-2 w-4 shrink-0">{idx + 1}.</span>
                    <textarea
                      value={subs[idx]}
                      onChange={(e) => onValueChange('principal_cascade', `${areaKey}_sub${idx + 1}`, e.target.value)}
                      placeholder={`Sub-meta ${idx + 1}...`}
                      rows={2}
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-amber-500/40 resize-y"
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

/** "Elegí 2 metas principales" picker — rendered below the metas section.
 *  The selection is stored as a comma-separated list of area keys under
 *  values.metas_anuales.principales so it persists with the rest of the
 *  plan without needing schema changes. Limit: 2 selected at a time;
 *  clicking a 3rd auto-removes the oldest. */
function PrincipalGoalsPicker({
  values, onChange,
}: { values: Record<string, string>; onChange: (csv: string) => void }) {
  const principales = (values.principales ?? '').split(',').filter(Boolean)

  const toggle = (areaKey: string) => {
    if (principales.includes(areaKey)) {
      onChange(principales.filter((k) => k !== areaKey).join(','))
    } else {
      // Max 2 — when adding a 3rd, drop the oldest.
      const next = principales.length >= 2
        ? [...principales.slice(1), areaKey]
        : [...principales, areaKey]
      onChange(next.join(','))
    }
  }

  return (
    <div className="bg-zinc-950/60 border border-amber-500/20 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-amber-300">
          ⭐ Paso 1 · Elegí las 2 áreas principales del año
        </p>
        <span className="text-[10px] font-mono text-zinc-600">
          {principales.length}/2 seleccionadas
        </span>
      </div>
      <p className="text-[11px] text-zinc-500 italic mb-3">
        Las 2 que elijas se van a trabajar activamente. Las demás quedan como referencia.
        Después abajo completás las metas — las elegidas aparecen arriba primero.
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
                  : 'bg-zinc-900 border-zinc-800 hover:border-amber-500/30 text-zinc-300'
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
      <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-6 text-center text-xs text-zinc-600 italic">
        Puntuá al menos un área para ver el gráfico.
      </div>
    )
  }

  return (
    <div className="bg-zinc-950/60 border border-indigo-500/20 rounded-xl p-4">
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
              contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
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
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-indigo-500/40 resize-y"
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
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-indigo-500/40"
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
        className="bg-zinc-950 border border-emerald-500/30 rounded-2xl p-6 max-w-md w-full"
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
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="¿Qué te llevás de este período?"
              rows={3}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/40 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 rounded-lg text-sm transition-all">
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
