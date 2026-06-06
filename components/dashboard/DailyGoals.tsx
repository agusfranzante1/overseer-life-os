'use client'
import { useEffect, useRef, useState, useCallback, KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Plus, Trash2, ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import {
  Goal, getActiveDateString, getTomorrowDateString,
  formatDateLabel, storeGet, storeSet, runRollover, loadStreak,
} from '@/lib/goals/goalsUtils'

// ─── types ────────────────────────────────────────────────────────────────────
interface GoalRowProps {
  goal: Goal
  index: number
  goals: Goal[]
  onSave: (goals: Goal[]) => void
  readOnly?: boolean
  dragIdx: React.MutableRefObject<number | null>
  dragOver: React.MutableRefObject<number | null>
  onReorder: (from: number, to: number) => void
}

// ─── GoalRow ──────────────────────────────────────────────────────────────────
function GoalRow({ goal, index, goals, onSave, readOnly, dragIdx, dragOver, onReorder }: GoalRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [flashing, setFlashing] = useState(false)
  const [dragHover, setDragHover] = useState(false)
  const textRef = useRef<HTMLSpanElement>(null)
  const origText = useRef('')

  const toggle = () => {
    const next = goals.map((g, i) =>
      i === index ? { ...g, done: !g.done, doneAt: !g.done ? Date.now() : undefined } : g
    )
    onSave(next)
  }

  const remove = () => onSave(goals.filter((_, i) => i !== index))

  const toggleQueue = () => {
    setFlashing(true)
    setTimeout(() => {
      const next = goals.map((g, i) => i === index ? { ...g, queued: !g.queued } : g)
      onSave(next)
      setFlashing(false)
    }, 480)
  }

  const startEdit = () => {
    if (readOnly) return
    origText.current = textRef.current?.textContent ?? ''
    setIsEditing(true)
    textRef.current?.setAttribute('contenteditable', 'true')
    textRef.current?.focus()
    // Move caret to end
    const range = document.createRange()
    const sel = window.getSelection()
    if (textRef.current && sel) {
      range.selectNodeContents(textRef.current)
      range.collapse(false)
      sel.removeAllRanges()
      sel.addRange(range)
    }
  }

  const commitEdit = () => {
    textRef.current?.removeAttribute('contenteditable')
    const newText = textRef.current?.textContent?.trim() ?? ''
    if (newText && newText !== origText.current) {
      const next = goals.map((g, i) => i === index ? { ...g, text: newText } : g)
      onSave(next)
    } else if (!newText && textRef.current) {
      textRef.current.textContent = origText.current
    }
    setIsEditing(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
    if (e.key === 'Escape') {
      textRef.current?.removeAttribute('contenteditable')
      if (textRef.current) textRef.current.textContent = origText.current
      setIsEditing(false)
    }
  }

  const isDone = goal.done
  const isQueued = goal.queued && !isDone

  return (
    <motion.div
      layout
      draggable={!readOnly}
      onDragStart={() => { dragIdx.current = index }}
      onDragOver={(e) => { e.preventDefault(); dragOver.current = index; setDragHover(true) }}
      onDragLeave={() => setDragHover(false)}
      onDrop={() => {
        setDragHover(false)
        if (dragIdx.current !== null && dragIdx.current !== index) {
          onReorder(dragIdx.current, index)
        }
        dragIdx.current = null
        dragOver.current = null
      }}
      onDragEnd={() => { dragIdx.current = null; dragOver.current = null; setDragHover(false) }}
      className="group flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-150"
      style={{
        marginBottom: 6,
        background: flashing
          ? 'rgba(242,192,99,0.18)'
          : isDone
            ? 'rgba(107,227,164,0.04)'
            : isQueued
              ? 'rgba(242,192,99,0.08)'
              : 'rgba(255,255,255,0.035)',
        borderColor: dragHover
          ? 'rgba(255,255,255,0.25)'
          : isDone
            ? 'rgba(107,227,164,0.12)'
            : isQueued
              ? 'rgba(242,192,99,0.25)'
              : 'rgba(255,255,255,0.06)',
        boxShadow: isQueued ? 'inset 3px 0 0 0 #F2C063' : undefined,
        opacity: isDone ? 0.5 : 1,
        transform: flashing ? 'scale(1.01)' : 'scale(1)',
      }}
    >
      {/* Drag handle */}
      {!readOnly && (
        <span className="shrink-0 opacity-0 group-hover:opacity-40 cursor-grab text-zinc-400 transition-opacity"
          style={{ width: 14, letterSpacing: -2, fontSize: 14 }}>
          <GripVertical className="w-3.5 h-3.5" />
        </span>
      )}

      {/* Checkbox */}
      <button
        onClick={toggle}
        disabled={readOnly}
        title={readOnly ? 'Activates at 6 AM tomorrow' : undefined}
        className="shrink-0 w-[22px] h-[22px] rounded-[7px] border transition-all flex items-center justify-center"
        style={{
          borderColor: isDone ? '#6BE3A4' : 'rgba(255,255,255,0.18)',
          background: isDone ? '#6BE3A4' : 'rgba(255,255,255,0.04)',
          boxShadow: isDone ? '0 0 12px rgba(107,227,164,0.40)' : undefined,
        }}
      >
        {isDone && (
          <motion.svg
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#0A0A0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </motion.svg>
        )}
      </button>

      {/* Text */}
      <span
        ref={textRef}
        onDoubleClick={startEdit}
        onBlur={commitEdit}
        onKeyDown={onKeyDown}
        className="flex-1 text-sm min-w-0 outline-none focus:outline-none rounded"
        style={{
          color: isDone ? '#FAFAFA' : isQueued ? '#FFE2A8' : '#FAFAFA',
          textDecoration: isDone ? 'line-through' : undefined,
          textDecorationColor: isDone ? 'rgba(255,255,255,0.4)' : undefined,
          cursor: readOnly ? 'default' : 'text',
          wordBreak: 'break-word',
        }}
        suppressContentEditableWarning
      >
        {goal.text}
      </span>

      {/* Queue button */}
      {!readOnly && (
        <button
          onClick={toggleQueue}
          className="shrink-0 transition-all opacity-55 hover:opacity-100"
          title="Queue for focus window"
          style={{
            color: isQueued ? '#F2C063' : '#76746E',
            filter: isQueued ? 'drop-shadow(0 0 4px rgba(242,192,99,0.65))' : undefined,
          }}>
          <Zap className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Delete */}
      {!readOnly && (
        <button
          onClick={remove}
          className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 text-zinc-500 hover:text-red-400 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </motion.div>
  )
}

// ─── SegmentedBar ─────────────────────────────────────────────────────────────
function SegmentedBar({ goals }: { goals: Goal[] }) {
  if (goals.length === 0) return null
  return (
    <div className="flex gap-1 mb-4" style={{ height: 6 }}>
      {goals.map((g, i) => (
        <div key={i} className="flex-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          {g.done && (
            <motion.div
              initial={{ width: 0 }} animate={{ width: '100%' }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              className="h-full rounded-full"
              style={{ background: '#6BE3A4', boxShadow: '0 0 6px rgba(107,227,164,0.40)' }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── AddRow ────────────────────────────────────────────────────────────────────
function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (text: string) => void }) {
  const [text, setText] = useState('')
  const add = () => {
    if (!text.trim()) return
    onAdd(text.trim())
    setText('')
  }
  return (
    <div className="flex gap-2 pt-3 border-t border-white/[0.05] mt-3">
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') add() }}
        placeholder={placeholder}
        className="flex-1 bg-zinc-800/60 border border-white/[0.12]/50 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
      />
      <button
        onClick={add}
        className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-zinc-900 transition-all hover:-translate-y-px"
        style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E5DD 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.6)' }}
      >
        <Plus className="w-3.5 h-3.5" />
        Add
      </button>
    </div>
  )
}

// ─── GoalCard ─────────────────────────────────────────────────────────────────
interface GoalCardProps {
  title: string
  subtitle?: string
  goals: Goal[]
  onSave: (goals: Goal[]) => void
  streak?: number
  showProgress?: boolean
  readOnly?: boolean
  rightBadge?: React.ReactNode
  addPlaceholder: string
  allDoneLabel?: boolean
}

function GoalCard({ title, subtitle, goals, onSave, streak, showProgress = true, readOnly, rightBadge, addPlaceholder, allDoneLabel }: GoalCardProps) {
  const [showMore, setShowMore] = useState(false)
  const dragIdx = useRef<number | null>(null)
  const dragOver = useRef<number | null>(null)

  const done = goals.filter(g => g.done).length
  const total = goals.length
  const allDone = total > 0 && done === total

  const LIMIT = 5
  const visible = showMore ? goals : goals.slice(0, LIMIT)
  const hidden = goals.length - LIMIT

  const reorder = (from: number, to: number) => {
    const next = [...goals]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onSave(next)
  }

  const pushRemaining = () => {
    const tmKey = `goals:${getTomorrowDateString()}`
    const unchecked = goals.filter(g => !g.done)
    const tmGoals = storeGet(tmKey) ?? []
    const existing = new Set(tmGoals.map(g => g.text))
    const toAdd = unchecked.filter(g => !existing.has(g.text))
    storeSet(tmKey, [...tmGoals, ...toAdd.map(g => ({ text: g.text, done: false }))])
    onSave(goals.filter(g => g.done))
  }

  return (
    <div
      className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 transition-all duration-500"
      style={allDone ? {
        background: 'radial-gradient(ellipse at 50% 0%, rgba(107,227,164,0.07) 0%, rgba(24,24,27,0) 65%), rgb(24,24,27)',
      } : undefined}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-zinc-500 mb-2">{title}</p>
          {subtitle && <p className="text-xs text-zinc-600 mb-2">{subtitle}</p>}

          {showProgress && (
            <div className="flex items-baseline gap-2">
              <span className="font-bold tabular-nums" style={{
                fontSize: 38, letterSpacing: '-0.045em', lineHeight: 1,
                color: allDone ? '#6BE3A4' : '#FAFAFA',
              }}>{done}</span>
              <span className="font-mono text-lg text-zinc-500">/ {total}</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.10em] text-zinc-500 ml-1">
                {total === 0 ? 'no goals yet' : allDone ? 'all done — solid day ✓' : 'complete'}
              </span>
            </div>
          )}
        </div>

        {/* Streak or badge */}
        {streak !== undefined ? (
          <div
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm transition-all shrink-0"
            style={streak > 0 ? {
              background: 'rgba(242,192,99,0.10)',
              color: '#F2C063',
              border: '1px solid rgba(242,192,99,0.32)',
            } : {
              background: 'rgba(255,255,255,0.04)',
              color: '#76746E',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <Zap className="w-3 h-3 shrink-0"
              style={{ filter: streak > 0 ? 'drop-shadow(0 0 6px rgba(242,192,99,0.6))' : undefined }} />
            <span className="font-mono font-bold tabular-nums text-xs">{streak}</span>
            <span className="text-[10px] uppercase tracking-[0.10em]">day streak</span>
          </div>
        ) : rightBadge}
      </div>

      {/* Segmented bar */}
      {showProgress && <SegmentedBar goals={goals} />}

      {/* Goal list */}
      <AnimatePresence>
        {goals.length === 0 ? (
          <p className="text-xs text-zinc-600 italic text-center py-3">
            {readOnly ? 'Nothing planned for tomorrow yet' : 'No goals for today yet — add one below.'}
          </p>
        ) : (
          <>
            {visible.map((goal, i) => (
              <GoalRow
                key={`${goal.text}-${i}`}
                goal={goal}
                index={i}
                goals={goals}
                onSave={onSave}
                readOnly={readOnly}
                dragIdx={dragIdx}
                dragOver={dragOver}
                onReorder={reorder}
              />
            ))}

            {/* Show more toggle */}
            {goals.length > LIMIT && (
              <button
                onClick={() => setShowMore(s => !s)}
                className="w-full mt-1 mb-2 py-2 flex items-center justify-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors border border-dashed border-white/[0.12]/60 rounded-xl"
              >
                {showMore ? (
                  <><ChevronUp className="w-3 h-3" /> Show less</>
                ) : (
                  <><ChevronDown className="w-3 h-3" /> Show {hidden} more</>
                )}
              </button>
            )}
          </>
        )}
      </AnimatePresence>

      {/* Push remaining */}
      {!readOnly && goals.some(g => !g.done) && (
        <button
          onClick={pushRemaining}
          className="w-full mt-2 mb-1 py-2 text-xs text-zinc-500 hover:text-zinc-200 border border-dashed border-white/[0.12]/40 hover:border-zinc-600 rounded-xl transition-all"
        >
          Push remaining → tomorrow
        </button>
      )}

      {/* Add input */}
      <AddRow
        placeholder={addPlaceholder}
        onAdd={(text) => onSave([...goals, { text, done: false }])}
      />
    </div>
  )
}

// ─── DailyGoals (main export) ─────────────────────────────────────────────────
export function DailyGoals() {
  const [todayGoals, setTodayGoals] = useState<Goal[]>([])
  const [tomorrowGoals, setTomorrowGoals] = useState<Goal[]>([])
  const [streak, setStreak] = useState(0)
  const [todayLabel, setTodayLabel] = useState('')
  const [tomorrowLabel, setTomorrowLabel] = useState('')
  const [mounted, setMounted] = useState(false)

  const todayKey = `goals:${getActiveDateString()}`
  const tomorrowKey = `goals:${getTomorrowDateString()}`

  const reload = useCallback(() => {
    setTodayLabel(formatDateLabel(getActiveDateString()))
    setTomorrowLabel(formatDateLabel(getTomorrowDateString()))
    setTodayGoals(storeGet(todayKey) ?? [])
    setTomorrowGoals(storeGet(tomorrowKey) ?? [])
    setStreak(loadStreak())
  }, [todayKey, tomorrowKey])

  useEffect(() => {
    runRollover(getActiveDateString())
    reload()
    setMounted(true)
    const handler = () => reload()
    window.addEventListener('goals-changed', handler)
    return () => window.removeEventListener('goals-changed', handler)
  }, [reload])

  if (!mounted) return null

  const saveTodayGoals = (goals: Goal[]) => {
    storeSet(todayKey, goals)
    setTodayGoals(goals)
  }

  const saveTomorrowGoals = (goals: Goal[]) => {
    storeSet(tomorrowKey, goals)
    setTomorrowGoals(goals)
  }

  const tmCount = tomorrowGoals.length

  return (
    <div className="space-y-2">
      {/* Section eyebrow */}
      <div className="flex items-center gap-3">
        <div className="w-[18px] h-px bg-zinc-500/60" />
        <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-zinc-500">To Do List</span>
        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg,rgba(255,255,255,0.08),transparent)' }} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* TODAY */}
        <GoalCard
          title={`Today — ${todayLabel}`}
          goals={todayGoals}
          onSave={saveTodayGoals}
          streak={streak}
          showProgress
          addPlaceholder="Add a goal for today…"
          allDoneLabel
        />

        {/* PLAN TOMORROW */}
        <GoalCard
          title={`Plan tomorrow — ${tomorrowLabel}`}
          subtitle="Write tonight, locked until 6 AM."
          goals={tomorrowGoals}
          onSave={saveTomorrowGoals}
          showProgress={false}
          readOnly
          addPlaceholder="Plan something for tomorrow…"
          rightBadge={
            <span className="text-[11px] font-mono uppercase tracking-[0.10em] text-zinc-500 tabular-nums shrink-0">
              {tmCount} planned
            </span>
          }
        />
      </div>
    </div>
  )
}
