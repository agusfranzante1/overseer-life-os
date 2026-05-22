'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Task, Project, Priority, Subtask } from '@/types'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useTranslation } from '@/hooks/useTranslation'
import { CheckCircle2, Clock, Trash2, ChevronDown, ChevronUp, Plus, Flag, GripVertical, CornerDownRight, MoreHorizontal, ChevronRight } from 'lucide-react'
import { PRIORITY_COLORS } from '@/lib/utils/constants'
import { format } from 'date-fns'
import { SubtaskDetailModal } from './SubtaskDetailModal'

interface Props {
  task: Task
  project: Project
  onClick: () => void
  /** Show a small project badge on the card. Used by views that mix tasks
   *  from multiple projects (All Projects Kanban) so the user knows which
   *  project owns each card. Defaults to false. */
  showProjectBadge?: boolean
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']

export function TaskCard({ task, project, onClick, showProjectBadge = false }: Props) {
  const { completeTask, postponeTask, deleteTask, toggleSubtask, addSubtask, updateSubtask, deleteSubtask, updateTask } = useTasksStore()
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [newSubtask, setNewSubtask] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(task.title)
  useEffect(() => { if (!editingTitle) setTitleDraft(task.title) }, [task.title, editingTitle])

  const isDone = project.statuses.find((s) => s.label === task.status)?.countsAsDone
  const completedSubtasks = task.subtasks.filter((s) => s.completed).length
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date(new Date().toDateString())
  const isHighPriority = task.priority === 'high' || task.priority === 'urgent'
  const isUrgent = task.priority === 'urgent'

  const urgentSubs = task.subtasks.filter((s) => s.priority === 'urgent')
  const highSubs = task.subtasks.filter((s) => s.priority === 'high')

  // ── Drag-and-drop state for subtask nesting ──
  const [dragSubId, setDragSubId] = useState<string | null>(null)
  const [overSubId, setOverSubId] = useState<string | null>(null)
  const draggedSubRef = useRef<string | null>(null)

  // ── Collapse state per parent subtask (parent id → collapsed?) ──
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set())
  const toggleParentCollapse = (parentId: string) => {
    setCollapsedParents((prev) => {
      const next = new Set(prev)
      if (next.has(parentId)) next.delete(parentId); else next.add(parentId)
      return next
    })
  }

  // ── Subtask detail modal ──
  const [detailSubtaskId, setDetailSubtaskId] = useState<string | null>(null)
  const detailSubtask = task.subtasks.find((s) => s.id === detailSubtaskId) ?? null

  // Build tree: roots + children grouped by parentId
  const subtaskTree = useMemo(() => {
    const sorted = [...task.subtasks].sort((a, b) => a.order - b.order)
    const roots = sorted.filter((s) => !s.parentId)
    const childrenByParent = new Map<string, Subtask[]>()
    for (const s of sorted) {
      if (s.parentId) {
        if (!childrenByParent.has(s.parentId)) childrenByParent.set(s.parentId, [])
        childrenByParent.get(s.parentId)!.push(s)
      }
    }
    return { roots, childrenByParent }
  }, [task.subtasks])

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSubtask.trim()) return
    addSubtask(task.id, newSubtask.trim())
    setNewSubtask('')
  }

  const commitTitle = () => {
    setEditingTitle(false)
    const v = titleDraft.trim()
    if (v && v !== task.title) updateTask(task.id, { title: v })
  }

  // ── Subtask DnD handlers ──
  const onSubDragStart = (subId: string, hasChildren: boolean) => (e: React.DragEvent) => {
    // Disallow dragging subtasks that have children (would create grandchildren)
    if (hasChildren) {
      e.preventDefault()
      return
    }
    draggedSubRef.current = subId
    setDragSubId(subId)
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', subId) } catch { /* noop */ }
  }
  const onSubDragOver = (subId: string) => (e: React.DragEvent) => {
    if (!draggedSubRef.current || draggedSubRef.current === subId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (overSubId !== subId) setOverSubId(subId)
  }
  const onSubDrop = (targetSubId: string) => (e: React.DragEvent) => {
    e.preventDefault()
    const src = draggedSubRef.current
    if (!src || src === targetSubId) { resetSubDrag(); return }
    // Target: if it's a child, parent it to the same parent (sibling)
    //         if it's a root, parent it to that root
    const target = task.subtasks.find((s) => s.id === targetSubId)
    if (!target) { resetSubDrag(); return }
    const newParentId = target.parentId ?? target.id
    if (newParentId === src) { resetSubDrag(); return }  // no self-parenting
    updateSubtask(task.id, src, { parentId: newParentId })
    resetSubDrag()
  }
  const resetSubDrag = () => {
    draggedSubRef.current = null
    setDragSubId(null)
    setOverSubId(null)
  }

  // Border logic
  const borderClass = isDone
    ? 'border-zinc-800 opacity-60'
    : isUrgent
      ? 'border-red-500 shadow-[0_0_0_1px_rgba(239,68,68,0.3)]'
      : isHighPriority || isOverdue
        ? 'border-red-500/40'
        : 'border-zinc-800 hover:border-zinc-700'

  return (
    <motion.div
      className={`bg-zinc-900 border rounded-xl transition-all ${borderClass}`}
    >
      {/* Body — clicking it opens the detail modal */}
      <div
        className="p-3 cursor-pointer"
        onClick={(e) => {
          // Don't trigger if user clicked an interactive element (they handle their own clicks with stopPropagation)
          if ((e.target as HTMLElement).closest('[data-interactive]')) return
          onClick()
        }}
      >
        <div className="flex items-start gap-3">
          <button
            data-interactive
            onClick={(e) => { e.stopPropagation(); completeTask(task.id) }}
            className={`mt-0.5 shrink-0 transition-colors ${
              isDone ? 'text-emerald-400' : 'text-zinc-600 hover:text-emerald-400'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
          </button>

          <div className="flex-1 min-w-0">
            {/* Project badge — only shown in mixed-project views (e.g. All
                Projects Kanban) so users know which project owns the card. */}
            {showProjectBadge && (
              <div className="flex items-center gap-1.5 mb-1 -mt-0.5">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: project.color }}
                />
                <span
                  className="text-[10px] font-mono uppercase tracking-wider truncate"
                  style={{ color: project.color }}
                  title={project.name}
                >
                  {project.name}
                </span>
              </div>
            )}
            {/* Title */}
            <div className="flex items-center gap-2">
              {editingTitle ? (
                <input
                  data-interactive
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') { e.preventDefault(); commitTitle() }
                    if (e.key === 'Escape') { setTitleDraft(task.title); setEditingTitle(false) }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className={`flex-1 bg-zinc-800 border border-indigo-500 rounded px-1.5 py-0.5 text-sm font-medium focus:outline-none ${
                    isDone ? 'line-through text-zinc-500' : 'text-zinc-100'
                  }`}
                />
              ) : (
                <button
                  data-interactive
                  onClick={(e) => { e.stopPropagation(); setEditingTitle(true) }}
                  title="Click para renombrar"
                  className={`text-sm font-medium text-left flex-1 px-1.5 py-0.5 -ml-1.5 rounded hover:bg-zinc-800/60 transition-colors min-w-0 truncate ${
                    isDone ? 'line-through text-zinc-500' : 'text-zinc-200'
                  }`}
                >
                  {task.title}
                </button>
              )}

              {(urgentSubs.length > 0 || highSubs.length > 0) && (
                <span title={
                  urgentSubs.length > 0
                    ? `${urgentSubs.length} subtarea${urgentSubs.length > 1 ? 's' : ''} urgente${urgentSubs.length > 1 ? 's' : ''}`
                    : `${highSubs.length} subtarea${highSubs.length > 1 ? 's' : ''} de prioridad alta`
                }
                  className="shrink-0 flex items-center gap-0.5"
                  style={{ color: urgentSubs.length > 0 ? '#ef4444' : '#f97316' }}>
                  <Flag className="w-3 h-3 fill-current" />
                  <span className="text-[10px] font-bold tabular-nums">
                    {urgentSubs.length + highSubs.length}
                  </span>
                </span>
              )}
            </div>

            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <InlineSelectBadge
                value={task.status}
                options={project.statuses.map((s) => ({ value: s.label, label: s.label, color: s.color }))}
                onChange={(v) => updateTask(task.id, { status: v })}
                bgColor={(project.statuses.find((s) => s.label === task.status)?.color ?? '#6b7280') + '20'}
                fgColor={project.statuses.find((s) => s.label === task.status)?.color ?? '#6b7280'}
              />
              <InlineSelectBadge
                value={task.priority}
                options={PRIORITIES.map((p) => ({ value: p, label: t(`tasks.priorities.${p}`), color: PRIORITY_COLORS[p] }))}
                onChange={(v) => updateTask(task.id, { priority: v as Priority })}
                bgColor={PRIORITY_COLORS[task.priority] + '15'}
                fgColor={PRIORITY_COLORS[task.priority]}
                renderLabel={() => t(`tasks.priorities.${task.priority}`)}
              />
              {task.dueDate && (
                <span className={`text-xs ${isOverdue ? 'text-red-400' : 'text-zinc-500'}`}>
                  {isOverdue ? '⚠️ ' : ''}{format(new Date(task.dueDate), 'MMM d')}
                </span>
              )}
              {task.subtasks.length > 0 && (
                <span className="text-xs text-zinc-500">
                  {completedSubtasks}/{task.subtasks.length}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {task.subtasks.length > 0 && (
              <button
                data-interactive
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
                className="text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
            <button
              data-interactive
              onClick={(e) => { e.stopPropagation(); postponeTask(task.id) }}
              className="text-zinc-600 hover:text-amber-400 transition-colors p-1"
              title={t('tasks.postpone')}
            >
              <Clock className="w-3.5 h-3.5" />
            </button>
            <button
              data-interactive
              onClick={(e) => { e.stopPropagation(); deleteTask(task.id) }}
              className="text-zinc-600 hover:text-red-400 transition-colors p-1"
              title={t('tasks.delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {task.subtasks.length > 0 && (
          <div className="mt-2 ml-7">
            <div className="h-0.5 bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                animate={{ width: `${(completedSubtasks / task.subtasks.length) * 100}%` }}
                className="h-full bg-indigo-500 rounded-full"
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Subtasks expanded — TREE rendering */}
      {expanded && task.subtasks.length > 0 && (
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: 'auto' }}
          transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
          className="border-t border-zinc-800 bg-zinc-900/50 px-3 py-2 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ml-7 space-y-1">
            {subtaskTree.roots.map((root) => {
              const children = subtaskTree.childrenByParent.get(root.id) ?? []
              const doneChildren = children.filter((c) => c.completed).length
              const hasChildren = children.length > 0
              const isCollapsed = collapsedParents.has(root.id)
              return (
                <div key={root.id} className="space-y-1">
                  <InlineSubtask
                    subtask={root}
                    hasChildren={hasChildren}
                    childrenCollapsed={isCollapsed}
                    onToggleCollapse={hasChildren ? () => toggleParentCollapse(root.id) : undefined}
                    progressLabel={hasChildren ? `${doneChildren}/${children.length}` : undefined}
                    isDragging={dragSubId === root.id}
                    isOver={overSubId === root.id}
                    onToggle={() => toggleSubtask(task.id, root.id)}
                    onRename={(nt) => {
                      const tt = nt.trim()
                      if (tt && tt !== root.title) updateSubtask(task.id, root.id, { title: tt })
                    }}
                    onPriorityChange={(p) => updateSubtask(task.id, root.id, { priority: p || undefined })}
                    onDelete={() => deleteSubtask(task.id, root.id)}
                    onOpenDetail={() => setDetailSubtaskId(root.id)}
                    onDragStart={onSubDragStart(root.id, hasChildren)}
                    onDragOver={onSubDragOver(root.id)}
                    onDragLeave={() => setOverSubId((k) => k === root.id ? null : k)}
                    onDrop={onSubDrop(root.id)}
                    onDragEnd={resetSubDrag}
                  />
                  {hasChildren && !isCollapsed && children.map((child) => (
                    <div key={child.id} className="ml-5 flex items-start gap-2">
                      <CornerDownRight className="w-3 h-3 text-zinc-700 mt-1.5 shrink-0" />
                      <div className="flex-1">
                        <InlineSubtask
                          subtask={child}
                          hasChildren={false}
                          isChild
                          isDragging={dragSubId === child.id}
                          isOver={overSubId === child.id}
                          onToggle={() => toggleSubtask(task.id, child.id)}
                          onRename={(nt) => {
                            const tt = nt.trim()
                            if (tt && tt !== child.title) updateSubtask(task.id, child.id, { title: tt })
                          }}
                          onPriorityChange={(p) => updateSubtask(task.id, child.id, { priority: p || undefined })}
                          onDelete={() => deleteSubtask(task.id, child.id)}
                          onUngroup={() => updateSubtask(task.id, child.id, { parentId: undefined })}
                          onOpenDetail={() => setDetailSubtaskId(child.id)}
                          onDragStart={onSubDragStart(child.id, false)}
                          onDragOver={onSubDragOver(child.id)}
                          onDragLeave={() => setOverSubId((k) => k === child.id ? null : k)}
                          onDrop={onSubDrop(child.id)}
                          onDragEnd={resetSubDrag}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          <form onSubmit={handleAddSubtask} className="ml-7 mt-2 flex items-center gap-1">
            <input
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              placeholder={t('tasks.addSubtask')}
              className="flex-1 bg-transparent border-b border-zinc-700 focus:border-indigo-500 outline-none text-sm text-zinc-300 placeholder-zinc-600 py-0.5"
            />
            <button type="submit" className="text-zinc-600 hover:text-indigo-400 transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>
        </motion.div>
      )}

      {expanded && task.subtasks.length === 0 && (
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: 'auto' }}
          transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
          className="border-t border-zinc-800 bg-zinc-900/50 px-3 py-2 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <form onSubmit={handleAddSubtask} className="ml-7 flex items-center gap-1">
            <input
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              placeholder={t('tasks.addSubtask')}
              className="flex-1 bg-transparent border-b border-zinc-700 focus:border-indigo-500 outline-none text-sm text-zinc-300 placeholder-zinc-600 py-0.5"
            />
            <button type="submit" className="text-zinc-600 hover:text-indigo-400 transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>
        </motion.div>
      )}

      {/* Subtask detail modal */}
      {detailSubtask && (
        <SubtaskDetailModal
          taskId={task.id}
          subtask={detailSubtask}
          project={project}
          parentTitle={task.title}
          parentSubtaskTitle={
            detailSubtask.parentId
              ? task.subtasks.find((s) => s.id === detailSubtask.parentId)?.title
              : undefined
          }
          onClose={() => setDetailSubtaskId(null)}
        />
      )}
    </motion.div>
  )
}

// ─── Inline select badge (status / priority) — uses portal to escape card overflow ─

interface InlineSelectBadgeProps {
  value: string
  options: { value: string; label: string; color: string }[]
  onChange: (v: string) => void
  bgColor: string
  fgColor: string
  renderLabel?: () => string
}

function InlineSelectBadge({ value, options, onChange, bgColor, fgColor, renderLabel }: InlineSelectBadgeProps) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => setMounted(true), [])

  // Compute portal position relative to viewport
  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    setPos({ top: r.bottom + 4, left: r.left, minWidth: Math.max(140, r.width) })
    setOpen(true)
  }

  // Close on outside click / Escape / scroll
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      // Allow clicks inside the dropdown (which has data-inline-dropdown)
      if (target && target.closest('[data-inline-dropdown]')) return
      if (btnRef.current && btnRef.current.contains(target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onScroll = () => setOpen(false)
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        data-interactive
        onClick={(e) => { e.stopPropagation(); open ? setOpen(false) : openMenu() }}
        className="text-xs px-1.5 py-0.5 rounded font-medium hover:brightness-125 transition-all"
        style={{ background: bgColor, color: fgColor }}
        title="Click para cambiar"
      >
        {renderLabel ? renderLabel() : value}
      </button>
      {mounted && open && pos && createPortal(
        <div
          data-inline-dropdown
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            minWidth: pos.minWidth,
            zIndex: 9999,
          }}
          className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden"
        >
          {options.map((opt) => (
            <button key={opt.value}
              onClick={(e) => { e.stopPropagation(); onChange(opt.value); setOpen(false) }}
              className="w-full px-3 py-1.5 text-xs font-medium text-left hover:bg-zinc-800 transition-colors flex items-center gap-2"
              style={{ color: opt.color }}>
              <span className="w-2 h-2 rounded-full" style={{ background: opt.color }} />
              {opt.label}
              {opt.value === value && <span className="ml-auto text-zinc-500">✓</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}

// ─── Inline subtask row (with priority + drag) ────────────────────────────────

interface InlineSubtaskProps {
  subtask: Subtask
  hasChildren: boolean
  childrenCollapsed?: boolean
  onToggleCollapse?: () => void
  isChild?: boolean
  progressLabel?: string
  isDragging?: boolean
  isOver?: boolean
  onToggle: () => void
  onRename: (nt: string) => void
  onPriorityChange: (p: Priority | '') => void
  onDelete: () => void
  onUngroup?: () => void
  onOpenDetail: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
}

function InlineSubtask({
  subtask, hasChildren, childrenCollapsed, onToggleCollapse, isChild, progressLabel, isDragging, isOver,
  onToggle, onRename, onPriorityChange, onDelete, onUngroup, onOpenDetail,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}: InlineSubtaskProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(subtask.title)
  useEffect(() => { if (!editing) setDraft(subtask.title) }, [subtask.title, editing])

  const commit = () => { setEditing(false); onRename(draft) }
  const prioColor = subtask.priority ? PRIORITY_COLORS[subtask.priority] : null
  const canDrag = !hasChildren

  return (
    <div
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-1.5 group rounded transition-all px-1 ${
        isDragging ? 'opacity-40' :
        isOver ? 'bg-indigo-500/20 ring-1 ring-indigo-500/60' : ''
      }`}
      style={{ cursor: canDrag ? 'grab' : 'default' }}
    >
      {/* Drag handle — only on hover, hidden by default */}
      <span className="w-3 shrink-0 flex items-center justify-center">
        {canDrag && (
          <GripVertical className="w-3 h-3 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </span>

      {/* Collapse/expand toggle for parent subtasks */}
      {hasChildren && onToggleCollapse ? (
        <button data-interactive onClick={(e) => { e.stopPropagation(); onToggleCollapse() }}
          title={childrenCollapsed ? 'Expandir' : 'Replegar'}
          className="shrink-0 text-zinc-500 hover:text-zinc-200">
          {childrenCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      ) : (
        <span className="w-3 shrink-0" />
      )}

      <button data-interactive onClick={(e) => { e.stopPropagation(); onToggle() }}>
        <CheckCircle2 className={`w-4 h-4 transition-colors ${subtask.completed ? 'text-emerald-400' : 'text-zinc-600 hover:text-zinc-400'}`} />
      </button>

      {/* Priority dot — click to cycle */}
      <button
        data-interactive
        onClick={(e) => {
          e.stopPropagation()
          const cycle: (Priority | '')[] = ['', 'low', 'medium', 'high', 'urgent']
          const idx = cycle.indexOf(subtask.priority ?? '')
          const next = cycle[(idx + 1) % cycle.length]
          onPriorityChange(next as Priority | '')
        }}
        title={subtask.priority ? `Prioridad: ${subtask.priority}` : 'Sin prioridad — click para asignar'}
        className="shrink-0 w-2 h-2 rounded-full transition-colors"
        style={{ background: prioColor ?? '#3f3f46' }}
      />

      {editing ? (
        <input
          data-interactive
          autoFocus value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setDraft(subtask.title); setEditing(false) }
          }}
          onClick={(e) => e.stopPropagation()}
          className={`flex-1 bg-zinc-800 border border-indigo-500 rounded px-1.5 py-0.5 text-sm focus:outline-none ${
            subtask.completed ? 'line-through text-zinc-500' : 'text-zinc-100'
          }`}
        />
      ) : (
        <button
          data-interactive
          onClick={(e) => { e.stopPropagation(); setEditing(true) }}
          title="Click para renombrar"
          className={`flex-1 text-sm text-left px-1.5 py-0.5 rounded hover:bg-zinc-800/60 transition-colors ${
            subtask.completed ? 'line-through text-zinc-500' : 'text-zinc-200'
          } ${hasChildren ? 'font-semibold' : ''}`}
        >
          {subtask.title}
        </button>
      )}

      {/* Progress for parent subtasks */}
      {progressLabel && (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 tabular-nums shrink-0">
          {progressLabel}
        </span>
      )}

      {/* Action buttons (on hover) */}
      <div className="flex items-center gap-0.5 shrink-0">
        {isChild && onUngroup && (
          <button data-interactive onClick={(e) => { e.stopPropagation(); onUngroup() }}
            title="Sacar del grupo"
            className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-200 transition-all text-[11px] px-1">
            ↶
          </button>
        )}
        <button
          data-interactive
          onClick={(e) => { e.stopPropagation(); onOpenDetail() }}
          title="Abrir detalle"
          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-200 transition-all p-0.5"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
        <button
          data-interactive
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="Eliminar"
          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
