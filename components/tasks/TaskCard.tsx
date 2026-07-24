'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Task, Project, Priority, Subtask } from '@/types'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useTaskUiStore } from '@/lib/store/taskUiStore'
import { effectivePriority } from '@/lib/utils/taskPriority'
import { sortSubtasks, type KanbanSort } from '@/lib/utils/taskSort'
import { useTranslation } from '@/hooks/useTranslation'
import { CheckCircle2, Clock, Trash2, ChevronDown, ChevronUp, Plus, Flag, GripVertical, CornerDownRight, MoreHorizontal, ChevronRight, Calendar, X, Copy } from 'lucide-react'
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
  /** Modo de sort que aplicamos a las sub-tareas dentro de esta card.
   *  Si no se pasa, usamos 'manual' (orden manual del drag). Cuando se
   *  pasa, se aplica el mismo criterio que las tasks top-level del
   *  proyecto — así "urgente arriba" o "por estado" aplica también a
   *  subtask1 y subtask2. La regla "completadas primero" sigue siendo
   *  inquebrantable y se aplica antes que cualquier modo. */
  subtaskSortMode?: KanbanSort
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']

export function TaskCard({ task, project, onClick, showProjectBadge = false, subtaskSortMode = 'manual' }: Props) {
  const { completeTask, postponeTask, deleteTask, duplicateTask, toggleSubtask, addSubtask, updateSubtask, deleteSubtask, updateTask, convertTaskToSubtask, promoteSubtaskToTask } = useTasksStore()
  const { t, dfLocale } = useTranslation()
  // Estado de UI (expanded del card, colapso de cada sub-tarea-1) vive
  // en su propio store persistido. Refrescar la página ya no resetea el
  // layout — recordamos qué quedó abierto/cerrado.
  const expanded = useTaskUiStore((s) => !!s.taskExpanded[task.id])
  const setExpanded = (next: boolean | ((v: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(expanded) : next
    useTaskUiStore.getState().setTaskExpanded(task.id, value)
  }
  const [newSubtask, setNewSubtask] = useState('')
  // Ref + flag para que el "+" de acción foque el input de subtask1 al click.
  // Si la card está colapsada, primero expandimos y después focamos en el
  // useEffect (porque el input no existe en el DOM hasta que expanded=true).
  const subtaskInputRef = useRef<HTMLInputElement>(null)
  const [shouldFocusSubtaskInput, setShouldFocusSubtaskInput] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(task.title)
  useEffect(() => { if (!editingTitle) setTitleDraft(task.title) }, [task.title, editingTitle])

  // Cuando el user clickea el "+" de la fila de acciones queremos
  // que la card quede expandida Y el input de "Nueva subtarea" esté
  // focado y listo para tipear. Como el input se monta cuando
  // expanded=true, lo seteamos como pedido y este effect lo cumple
  // en el próximo render.
  useEffect(() => {
    if (shouldFocusSubtaskInput && expanded && subtaskInputRef.current) {
      subtaskInputRef.current.focus()
      setShouldFocusSubtaskInput(false)
    }
  }, [shouldFocusSubtaskInput, expanded])

  const isDone = project.statuses.find((s) => s.label === task.status)?.countsAsDone
  // Archived subtasks are hidden from all counters and the tree below.
  // They live in task.subtasks with archivedAt set; the auto-purge sends
  // them there one day after completion (same contract as tasks).
  const visibleSubtasks = task.subtasks.filter((s) => !s.archivedAt)
  const completedSubtasks = visibleSubtasks.filter((s) => s.completed).length
  const archivedSubtasksCount = task.subtasks.length - visibleSubtasks.length

  // Due-date state — computed in LOCAL time to avoid the timezone bug
  // where `new Date('2026-05-27')` is parsed as UTC midnight, which
  // becomes the previous day in UTC-3 (AR). The old `< toDateString()`
  // check was firing the alert one day early for that reason.
  const dueState: 'overdue' | 'today' | 'tomorrow' | 'future' | null = (() => {
    if (!task.dueDate) return null
    const [y, m, d] = task.dueDate.split('-').map(Number)
    const due = new Date(y, m - 1, d); due.setHours(0, 0, 0, 0)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    if (due.getTime() < today.getTime()) return 'overdue'
    if (due.getTime() === today.getTime()) return 'today'
    if (due.getTime() === tomorrow.getTime()) return 'tomorrow'
    return 'future'
  })()
  const isOverdue = dueState === 'overdue'
  const isDueTomorrow = dueState === 'tomorrow'

  // Prioridad EFECTIVA: si alguna sub-tarea abierta es urgent, la madre
  // se trata como 'high' (escalamiento heredado). El priority real en
  // el store NO cambia — cuando la subtarea se completa/borra, la madre
  // vuelve a su priority original sola.
  const effPriority = effectivePriority(task)
  const isHighPriority = effPriority === 'high' || effPriority === 'urgent'
  const isUrgent = effPriority === 'urgent'

  const urgentSubs = visibleSubtasks.filter((s) => s.priority === 'urgent' && !s.completed)
  const highSubs = visibleSubtasks.filter((s) => s.priority === 'high' && !s.completed)
  const escalatedByChild = effPriority !== task.priority

  // ── Drag-and-drop state for subtask nesting ──
  const [dragSubId, setDragSubId] = useState<string | null>(null)
  const [overSubId, setOverSubId] = useState<string | null>(null)
  const draggedSubRef = useRef<string | null>(null)

  // ── Task-to-task drag (for converting a mother task into a subtask of
  //    another). Uses a custom dataTransfer MIME type so the existing
  //    subtask drag-and-drop code keeps working untouched — the two paths
  //    don't interfere. ──
  const [isDraggingThisCard, setIsDraggingThisCard] = useState(false)
  const [isDropTarget, setIsDropTarget] = useState(false)

  /** Drag start on the TaskCard itself — fires when the user starts dragging
   *  the card body. Tags the dataTransfer with the task id so another
   *  TaskCard's drop handler can identify it.
   *
   *  Previous version had a guard `target !== currentTarget` which was wrong:
   *  HTML5 sets dragstart's target to the DRAGGED ELEMENT (the closest
   *  draggable ancestor of where the user grabbed), so when the user grabbed
   *  anywhere inside the card the event still bubbled with target === card.
   *  But in some browser/React combos, target ends up being the original
   *  mousedown child element instead, which made the old guard bail
   *  EVERY time the user grabbed any inner content (title, body, etc) —
   *  meaning dataTransfer never got set and the drop never registered.
   *  Result: drag felt completely broken.
   *
   *  New guard walks UP from event.target looking for a NESTED draggable
   *  ancestor before reaching the card. If found, that nested draggable
   *  (e.g. a subtask row) is the real source — bail out. Otherwise, this
   *  is the card itself being dragged → set up dataTransfer. */
  const onTaskDragStart = (e: React.DragEvent) => {
    let node: HTMLElement | null = e.target as HTMLElement
    while (node && node !== e.currentTarget) {
      if (node.draggable) {
        // Nested draggable (a subtask) is the source. Don't overwrite its
        // dataTransfer — its own handler manages that.
        return
      }
      node = node.parentElement
    }
    e.dataTransfer.effectAllowed = 'move'
    try {
      e.dataTransfer.setData('application/x-overseer-task', task.id)
      // Fallback for browsers that don't surface custom MIME types via
      // dataTransfer.types during dragover.
      e.dataTransfer.setData('text/plain', `task:${task.id}`)
    } catch { /* noop */ }
    setIsDraggingThisCard(true)
  }

  const onTaskDragOver = (e: React.DragEvent) => {
    // Accept drops from OTHER TaskCards. We check ONLY the custom MIME here
    // (not text/plain) so subtask drags — which also use text/plain — don't
    // get falsely highlighted as drop targets. The custom MIME is set during
    // dragstart and per spec is visible during dragover.
    //
    // `Array.from(...)` is defensive: in some browsers `dataTransfer.types`
    // is a `DOMStringList` whose `includes` may not exist or behave as
    // expected. Converting to an Array sidesteps that.
    const types = Array.from(e.dataTransfer.types)
    if (!types.includes('application/x-overseer-task')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!isDropTarget) setIsDropTarget(true)
  }
  const onTaskDragLeave = () => setIsDropTarget(false)

  const onTaskDrop = (e: React.DragEvent) => {
    setIsDropTarget(false)
    let sourceId = ''
    try {
      sourceId = e.dataTransfer.getData('application/x-overseer-task')
      if (!sourceId) {
        const plain = e.dataTransfer.getData('text/plain') ?? ''
        if (plain.startsWith('task:')) sourceId = plain.slice(5)
      }
    } catch { /* noop */ }
    if (!sourceId || sourceId === task.id) return
    e.preventDefault()
    e.stopPropagation()
    convertTaskToSubtask(sourceId, task.id)
  }

  const onTaskDragEnd = () => {
    setIsDraggingThisCard(false)
    setIsDropTarget(false)
  }

  // ── Inline "add child" state — which parent subtask currently has its
  //    "+ subtarea" input expanded, plus the in-flight draft text. Resets
  //    on submit/Esc/blur. Allows adding nested subtasks without opening
  //    the subtask detail modal. ──
  const [addingChildTo, setAddingChildTo] = useState<string | null>(null)
  const [childDraft, setChildDraft] = useState('')

  // ── Collapse state per parent subtask (parent id → collapsed?) ──
  // Persistido en el taskUi store: refrescar la página NO resetea qué
  // sub-tarea-1 quedó cerrada.
  const subtaskCollapsedMap = useTaskUiStore((s) => s.subtaskCollapsed)
  const isParentCollapsed = (parentId: string) => !!subtaskCollapsedMap[`${task.id}:${parentId}`]
  const toggleParentCollapse = (parentId: string) => {
    useTaskUiStore.getState().toggleSubtaskCollapsed(task.id, parentId)
  }

  // ── Subtask detail modal ──
  const [detailSubtaskId, setDetailSubtaskId] = useState<string | null>(null)
  const detailSubtask = task.subtasks.find((s) => s.id === detailSubtaskId) ?? null

  // Build tree: roots + children grouped by parentId. Archived subtasks
  // are excluded so el tree solo renderea lo activo.
  //
  // Sort: aplicamos `sortSubtasks` con el modo que viene del proyecto
  // (subtaskSortMode). La regla "completadas primero" es inquebrantable
  // y vive dentro del helper. El modo decide el ordenamiento SECUNDARIO
  // dentro de cada grupo (completas vs incompletas).
  //
  // Aplica a ambos niveles: roots (subtask1) Y children (subtask2). Así
  // si el user elige "urgente arriba", las subtask1 ordenan por urgencia,
  // y dentro de cada subtask1 sus subtask2 también ordenan por urgencia.
  const subtaskTree = useMemo(() => {
    // Orden ÚNICO via sortSubtasks (prioridad → fecha → nombre → orden), el
    // MISMO criterio que las madres. NO reordenamos por "tener hijos": una
    // subtask1 de prioridad media con una subtask2 hija sin prioridad debe
    // quedar ARRIBA de una subtask1 de prioridad baja sin hijos. Tener una
    // hija no baja la prioridad de la madre.
    const sorted = sortSubtasks(visibleSubtasks, subtaskSortMode, project)
    const roots = sorted.filter((s) => !s.parentId)
    const childrenByParent = new Map<string, Subtask[]>()
    for (const s of sorted) {
      if (s.parentId) {
        if (!childrenByParent.has(s.parentId)) childrenByParent.set(s.parentId, [])
        childrenByParent.get(s.parentId)!.push(s)
      }
    }
    return { roots, childrenByParent }
  }, [visibleSubtasks, subtaskSortMode, project])

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSubtask.trim()) return
    addSubtask(task.id, newSubtask.trim())
    setNewSubtask('')
  }

  // Pegar varios renglones → una subtarea por línea no-vacía.
  const handleSubtaskPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const lines = e.clipboardData.getData('text').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length > 1) {
      e.preventDefault()
      for (const line of lines) addSubtask(task.id, line)
      setNewSubtask('')
    }
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

  // Color del border-top según prioridad EFECTIVA.
  //   urgent       → rojo
  //   high/overdue → naranja
  //   medium       → amarillo
  //   low          → gris neutro (sin acento prominente)
  //   done         → casi invisible
  // El color comunica la urgencia. Low y done quedan limpias para que
  // el ojo se vaya naturalmente a urgent/high/medium primero.
  const accentColor = isDone
    ? 'var(--surface-fill)'
    : isUrgent
      ? '#ef4444'        // rojo
      : isHighPriority || isOverdue
        ? '#f97316'      // naranja
        : effPriority === 'medium'
          ? '#eab308'    // amarillo
          : 'var(--surface-fill)'  // low → neutro
  // Hay tinte de color (glow + border 2px) solo si NO es low/done.
  const hasPriorityAccent = !isDone && (isUrgent || isHighPriority || isOverdue || effPriority === 'medium')

  // Apply task-to-task drag visual state. Solid violet ring while a
  // foreign TaskCard is hovering over this card (= valid drop target);
  // soft opacity dip on the source while it's being dragged.
  const dndClass = isDropTarget
    ? 'ring-2 ring-violet-400 ring-offset-2 ring-offset-[var(--app-bg)]'
    : ''
  const dndStyle: React.CSSProperties = isDraggingThisCard
    ? { opacity: 0.4 }
    : {}

  // ── Swipe-to-delete (mobile) ───────────────────────────────────────
  // Deslizando la tarjeta hacia la IZQUIERDA aparece un tachito rojo POR
  // ENCIMA de la tarjeta, anclado a la derecha; su ancho crece con el swipe
  // hasta 1/4 de la tarjeta. La tarjeta NO se mueve. Cualquier cosa que no
  // sea tocar el tachito (scrollear, tocar la tarjeta) lo cierra y queda todo
  // igual. El axis-lock + `touch-action: pan-y` dejan pasar el scroll vertical.
  const cardWrapRef = useRef<HTMLDivElement>(null)
  const [revealW, setRevealW] = useState(0)     // px del tachito revelado
  const [dragging, setDragging] = useState(false) // estado: se lee en el render para la transición
  const swipe = useRef({ startX: 0, startY: 0, base: 0, active: false, axis: '' as '' | 'x' | 'y', maxW: 90 })
  const onCardTouchStart = (e: React.TouchEvent) => {
    const tch = e.touches[0]
    const w = cardWrapRef.current?.getBoundingClientRect().width ?? 360
    swipe.current = { startX: tch.clientX, startY: tch.clientY, base: revealW, active: true, axis: '', maxW: Math.round(w * 0.25) }
  }
  const onCardTouchMove = (e: React.TouchEvent) => {
    const s = swipe.current
    if (!s.active) return
    const dx = e.touches[0].clientX - s.startX
    const dy = e.touches[0].clientY - s.startY
    if (s.axis === '') {
      // Movimiento vertical dominante → es scroll: cerramos el tachito y soltamos.
      if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) {
        s.axis = 'y'; s.active = false; setDragging(false); if (revealW) setRevealW(0); return
      }
      if (Math.abs(dx) > 8) { s.axis = 'x'; setDragging(true) }
    }
    if (s.axis !== 'x') return
    // Swipe a la izquierda (dx < 0) revela; a la derecha lo cierra. Tope: 1/4.
    setRevealW(Math.max(0, Math.min(s.maxW, s.base - dx)))
  }
  const onCardTouchEnd = () => {
    const s = swipe.current
    s.active = false
    // Al soltar: si pasó ~40% del ancho máximo, queda abierto (1/4) para poder
    // tocar el tachito; si no, se cierra.
    if (s.axis === 'x') { setDragging(false); setRevealW(revealW >= s.maxW * 0.4 ? s.maxW : 0) }
  }
  const revealOpen = revealW > 0
  // Mientras el tachito esté abierto, cualquier scroll (seguir bajando) lo cierra.
  useEffect(() => {
    if (!revealOpen) return
    const close = () => setRevealW(0)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [revealOpen])

  return (
    // Wrapper relativo + recortado: contiene la tarjeta y, POR ENCIMA, el
    // tachito rojo que se revela al deslizar. `ref` para medir el ancho (1/4).
    <div ref={cardWrapRef} className="relative overflow-hidden rounded-2xl">
    {/* Plain <div> — was a motion.div but Framer Motion's `onDragStart` /
    // `onDrag` typings clash with HTML5 drag-and-drop. We weren't using any
    // animation props here (no initial/animate/whileHover/etc), so dropping
    // motion has zero visual impact and unblocks the HTML5 DnD handlers. */}
    <div
      draggable
      onDragStart={onTaskDragStart}
      onDragOver={onTaskDragOver}
      onDragLeave={onTaskDragLeave}
      onDrop={onTaskDrop}
      onDragEnd={onTaskDragEnd}
      onTouchStart={onCardTouchStart}
      onTouchMove={onCardTouchMove}
      onTouchEnd={onCardTouchEnd}
      style={{
        ...dndStyle,
        // Estilo del mockup: card oscura translúcida. Cuando la tarea
        // tiene urgencia REAL (urgent/high/overdue), el border-top se
        // ilumina con su color y un glow sutil tiñe la parte superior.
        // Tareas normales (medium/low) quedan limpias, sin tinte azul
        // ni gris fuerte — solo el glass base.
        background: hasPriorityAccent
          ? `linear-gradient(180deg, ${accentColor}1a 0%, transparent 25%), var(--card-bg)`
          : 'var(--card-bg)',
        borderTop: hasPriorityAccent
          ? `2px solid ${accentColor}`
          : '1px solid var(--card-border)',
        boxShadow: `inset 0 0 0 1px var(--card-inset), 0 1px 2px rgba(0,0,0,0.3)`,
        opacity: isDone ? 0.55 : 1,
        // `pan-y`: el browser maneja el scroll vertical, el pan horizontal
        // (swipe) nos llega a estos handlers. La tarjeta NO se mueve.
        touchAction: 'pan-y',
      }}
      className={`rounded-2xl transition-all overflow-hidden ${dndClass}`}
    >
      {/* Body — clicking it opens the detail modal. La clase `group/card`
          permite que los action buttons hijos usen `group-hover/card:` para
          aparecer solo al hover. `relative` para que los action buttons
          absolutos se posicionen contra este wrapper. */}
      <div
        className="relative p-4 cursor-pointer group/card"
        onClick={(e) => {
          // Si el tachito está abierto, un tap en la tarjeta lo CIERRA en vez
          // de abrir el detalle (cualquier cosa que no sea el tachito → cerrar).
          if (revealOpen) { setRevealW(0); return }
          // Don't trigger if user clicked an interactive element (they handle their own clicks with stopPropagation)
          if ((e.target as HTMLElement).closest('[data-interactive]')) return
          onClick()
        }}
      >
        <div className="flex items-start gap-3">
          {(() => {
            // No permitir completar si quedan subtareas open (excluye
            // las archivadas). Sirve para que el user no marque "Done"
            // una tarea madre cuyo proceso todavía no terminó — pierde
            // visibilidad del trabajo pendiente. SÍ permite des-completar
            // (revertir) aunque haya subtareas open: el toggle es
            // bidireccional siempre.
            const openSubs = (task.subtasks ?? []).filter((s) => !s.completed && !s.archivedAt)
            const blocked = !isDone && openSubs.length > 0
            return (
              <button
                data-interactive
                disabled={blocked}
                onClick={(e) => {
                  e.stopPropagation()
                  // Bloqueada (subtareas pendientes): simplemente no hace nada,
                  // sin avisos ni cambios de color que molesten.
                  if (blocked) return
                  completeTask(task.id)
                }}
                title={blocked ? `Falta completar ${openSubs.length} subtarea(s)` : isDone ? 'Marcar como pendiente' : 'Marcar como completada'}
                className={`mt-0.5 shrink-0 transition-colors ${
                  isDone
                    ? 'text-emerald-400'
                    : blocked
                      ? 'text-zinc-600 cursor-not-allowed'   // neutro: el color NO comunica el bloqueo
                      : 'text-zinc-600 hover:text-emerald-400'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
            )
          })()}

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
            {/* Title row — `min-w-0` is critical here: without it the inner
                flex child (the title button) inherits min-width: auto and
                stops respecting truncate, so long titles push the row wider
                than its container. */}
            <div className="flex items-center gap-2 min-w-0">
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
                  title={`Click para renombrar · ${task.title}`}
                  className={`text-sm font-medium text-left flex-1 px-1.5 py-0.5 -ml-1.5 rounded hover:bg-white/[0.05]/60 transition-colors min-w-0 break-words leading-snug line-clamp-3 ${
                    isDone ? 'line-through text-zinc-500' : 'text-zinc-200'
                  }`}
                >
                  {task.title}
                </button>
              )}

              {/* Urgent/high subtask flag — same reasoning as the priority
                  badge above: hide once the parent task is done. */}
              {!isDone && (urgentSubs.length > 0 || highSubs.length > 0) && (
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

            {/* Badges row — `flex-nowrap` + `overflow-hidden` keeps every
                TaskCard exactly the same height regardless of how many
                badges or how long the status label is. Badges that don't
                fit just get clipped on the right; the user can open the
                task to see everything in detail. */}
            <div className="flex flex-nowrap items-center gap-1.5 mt-1.5 overflow-hidden min-w-0">
              <InlineSelectBadge
                value={task.status}
                options={project.statuses.map((s) => ({ value: s.label, label: s.label, color: s.color }))}
                onChange={(v) => updateTask(task.id, { status: v })}
                bgColor={(project.statuses.find((s) => s.label === task.status)?.color ?? '#6b7280') + '20'}
                fgColor={project.statuses.find((s) => s.label === task.status)?.color ?? '#6b7280'}
              />
              {/* Banderita "EVENTO EN CALENDARIO" — explica por qué una tarea
                  completada NO se archivó al día siguiente. El auto-purge
                  mantiene las tareas con dueDate + dueTime hasta el domingo
                  para que el snapshot del calendario en el SPI semanal quede
                  completo. Sin este flag, el user se confunde y piensa que
                  el archive está roto. */}
              {isDone && task.dueDate && task.dueTime && (
                <span
                  title="Esta tarea aparece como bloque en el calendario. Se va a archivar el domingo (cierre de semana) para que el snapshot del SPI quede completo."
                  className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-300/90 flex items-center gap-1 shrink-0"
                >
                  <Calendar className="w-2.5 h-2.5" />
                  En calendario
                </span>
              )}
              {/* Priority badge — hidden once the task is done so the user
                  doesn't see "Urgente" + "Done" at the same time (visually
                  confusing while waiting for the auto-archive). The data
                  is preserved; if the user un-completes the task, the
                  badge comes back. Same for the date/overdue indicator —
                  irrelevant once the task is finished. */}
              {!isDone && (
                <>
                  {/* La badge muestra la prioridad EFECTIVA (puede estar
                      escalada por una subtarea urgente) pero el dropdown
                      edita la real (`task.priority`). El usuario ve qué
                      tan urgente está la tarea YA, pero sigue controlando
                      su propio setting subyacente. */}
                  <InlineSelectBadge
                    value={task.priority}
                    options={PRIORITIES.map((p) => ({ value: p, label: t(`tasks.priorities.${p}`), color: PRIORITY_COLORS[p] }))}
                    onChange={(v) => updateTask(task.id, { priority: v as Priority })}
                    bgColor={PRIORITY_COLORS[effPriority] + '15'}
                    fgColor={PRIORITY_COLORS[effPriority]}
                    renderLabel={() => t(`tasks.priorities.${effPriority}`)}
                  />
                  {escalatedByChild && (
                    <span
                      className="text-[10px] font-mono text-red-300/70 flex items-center gap-0.5"
                      title={`Escalada a "${t(`tasks.priorities.${effPriority}`)}" por subtarea urgente. La prioridad real sigue siendo "${t(`tasks.priorities.${task.priority}`)}" y vuelve cuando se resuelva la subtarea.`}
                    >
                      ↑ por subtarea urgente
                    </span>
                  )}
                </>
              )}
              {!isDone && task.dueDate && (() => {
                // Parse date in LOCAL time (avoids UTC roll-back bug).
                const [y, m, d] = task.dueDate.split('-').map(Number)
                const localDue = new Date(y, m - 1, d)
                const isToday = dueState === 'today'
                const isLate = !!task.rescheduledFrom
                const color = isOverdue || isLate ? 'text-red-400' : isToday ? 'text-amber-400' : isDueTomorrow ? 'text-red-400' : 'text-zinc-500'
                return (
                  <span className={`text-xs ${color} flex items-center gap-1`}>
                    {isOverdue ? '⚠️ ' : ''}{format(localDue, 'MMM d', { locale: dfLocale })}
                    {isToday && (
                      <span className="text-[10px] font-semibold text-amber-400 px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/30">→ HOY</span>
                    )}
                    {isDueTomorrow && (
                      <span className="text-[10px] font-medium text-red-400/80">→ Mañana</span>
                    )}
                    {isLate && (
                      <span className="text-[10px] font-bold text-red-300 px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/40 animate-pulse" title={`Era para ${task.rescheduledFrom}`}>
                        ⚠ TARDÍA
                      </span>
                    )}
                  </span>
                )
              })()}
              {visibleSubtasks.length > 0 && (
                <span className="text-xs text-zinc-500">
                  {completedSubtasks}/{visibleSubtasks.length}
                </span>
              )}
            </div>
          </div>

          {/* Chevron de expand/collapse — siempre visible cuando hay
              subtareas (es un toggle de estado, no acción destructiva).
              Vive afuera del grupo hover-only para que el user vea de un
              vistazo qué tareas tienen hijas. */}
          <div className="flex items-center gap-1 shrink-0">
            {visibleSubtasks.length > 0 && (
              <button
                data-interactive
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
                className="text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
          {/* Action buttons (Plus / Clock / Copy / Trash) — POSICIONADOS
              ABSOLUTOS arriba a la derecha de la card. Antes con `shrink-0
              opacity-0` igual ocupaban su ancho en el layout, dejándole
              al título solo 70px en Kanban. Ahora flotan encima sin
              comerse espacio. El offset `right-9` (36px) deja libre el
              espacio del chevron de expand/collapse (que sigue en el
              flow del flex row) para que no se choquen visualmente. */}
          {/* En mobile SIEMPRE visibles (antes eran invisibles pero clickeables:
              al tocar el chevron para colapsar se tocaba el tachito invisible y
              se borraba la tarea). En desktop siguen apareciendo solo al hover. */}
          <div className={`absolute top-3 flex items-center gap-0.5 shrink-0 opacity-100 sm:opacity-0 sm:group-hover/card:opacity-100 transition-opacity bg-zinc-900/85 backdrop-blur-sm rounded-md px-1 ${
            visibleSubtasks.length > 0 ? 'right-9' : 'right-3'
          }`}>
            {/* "+" rápido para agregar subtask1 sin abrir el modal de
                detalle. Si la card está colapsada, la expandimos. El
                flag `shouldFocusSubtaskInput` triggera el useEffect que
                fija el foco una vez que el input ya está montado. */}
            <button
              data-interactive
              onClick={(e) => {
                e.stopPropagation()
                if (!expanded) setExpanded(true)
                setShouldFocusSubtaskInput(true)
              }}
              className="text-zinc-600 hover:text-indigo-300 transition-colors p-1"
              title="Agregar subtarea"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            {/* Programar fecha + hora directo desde la card, sin abrir el
                detalle. Abre un popover (portal, para escapar el
                overflow-hidden de la card) con inputs de fecha y hora. */}
            <TaskScheduleButton task={task} updateTask={updateTask} />
            <button
              data-interactive
              onClick={(e) => { e.stopPropagation(); postponeTask(task.id) }}
              className="text-zinc-600 hover:text-amber-400 transition-colors p-1"
              title={t('tasks.postpone')}
            >
              <Clock className="w-3.5 h-3.5" />
            </button>
            {/* Duplicar tarea madre completa con todas sus subtasks — para
                usar tasks como plantilla de proceso. La copia se inserta
                inmediatamente debajo de la original con título "X (copia)"
                y estado reseteado a "To Do" para arrancar limpia. */}
            <button
              data-interactive
              onClick={(e) => { e.stopPropagation(); duplicateTask(task.id) }}
              className="text-zinc-600 hover:text-indigo-300 transition-colors p-1"
              title="Duplicar tarea con todas sus subtareas (plantilla de proceso)"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            {/* Eliminar — oculto en mobile (ahí se borra deslizando la tarjeta,
                y así un toque cerca del chevron no puede borrar por accidente). */}
            <button
              data-interactive
              onClick={(e) => { e.stopPropagation(); deleteTask(task.id) }}
              className="hidden sm:block text-zinc-600 hover:text-red-400 transition-colors p-1"
              title={t('tasks.delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {visibleSubtasks.length > 0 && (
          <div className="mt-2 ml-7">
            <div className="h-0.5 bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                animate={{ width: `${(completedSubtasks / visibleSubtasks.length) * 100}%` }}
                className="h-full bg-indigo-500 rounded-full"
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Subtasks expanded — TREE rendering */}
      {expanded && visibleSubtasks.length > 0 && (
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: 'auto' }}
          transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
          className="border-t border-white/[0.08] bg-white/[0.03]/50 px-3 py-2 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Removed the old `ml-7` here — subtasks were getting pushed
              ~28px to the right of the panel's px-3 inner padding, which
              left an awkward gap that didn't visually belong inside a
              bordered card. Now they sit flush at the panel's own
              padding, matching the parent task title's left edge more
              naturally. */}
          <div className="space-y-1">
            {subtaskTree.roots.map((root) => {
              const children = subtaskTree.childrenByParent.get(root.id) ?? []
              const doneChildren = children.filter((c) => c.completed).length
              const hasChildren = children.length > 0
              const isCollapsed = isParentCollapsed(root.id)
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
                    projectStatuses={project.statuses}
                    onToggle={() => toggleSubtask(task.id, root.id)}
                    onRename={(nt) => {
                      const tt = nt.trim()
                      if (tt && tt !== root.title) updateSubtask(task.id, root.id, { title: tt })
                    }}
                    onPriorityChange={(p) => updateSubtask(task.id, root.id, { priority: p || undefined })}
                    onStatusChange={(s) => updateSubtask(task.id, root.id, { status: s })}
                    onDueDateChange={(d) => updateSubtask(task.id, root.id, { dueDate: d })}
                    onDelete={() => deleteSubtask(task.id, root.id)}
                    onPromoteToTask={() => promoteSubtaskToTask(task.id, root.id)}
                    onAddChild={() => { setAddingChildTo(root.id); setChildDraft('') }}
                    onOpenDetail={() => setDetailSubtaskId(root.id)}
                    onDragStart={onSubDragStart(root.id, hasChildren)}
                    onDragOver={onSubDragOver(root.id)}
                    onDragLeave={() => setOverSubId((k) => k === root.id ? null : k)}
                    onDrop={onSubDrop(root.id)}
                    onDragEnd={resetSubDrag}
                  />
                  {/* Thin divider line between a parent subtask and its
                      children — makes the hierarchy visually obvious without
                      the heavy ml-7 indent that lived here before. */}
                  {hasChildren && !isCollapsed && (
                    <div className="border-t border-white/[0.05] ml-5 my-1" />
                  )}
                  {/* Child subtask rows. Indented via `ml-12` on the
                      wrapper. Why so much: the child's InlineSubtask
                      renders only ONE left-gutter element (the arrow) vs
                      the parent's TWO (handle + collapse spacer). That
                      internally compresses the child layout by ~24px,
                      eating into the visual indent. ml-12 compensates so
                      the child's check sits ~24px to the right of the
                      parent's, giving a clearly-readable nesting.
                      The status/date chips still align with the parent's
                      because they're flex-positioned to the right edge,
                      which is the same in both rows (ml only shifts the
                      left side). */}
                  {hasChildren && !isCollapsed && children.map((child) => (
                    <div key={child.id} className="ml-12">
                      <InlineSubtask
                        subtask={child}
                        hasChildren={false}
                        isChild
                        isDragging={dragSubId === child.id}
                        isOver={overSubId === child.id}
                        projectStatuses={project.statuses}
                        onToggle={() => toggleSubtask(task.id, child.id)}
                        onRename={(nt) => {
                          const tt = nt.trim()
                          if (tt && tt !== child.title) updateSubtask(task.id, child.id, { title: tt })
                        }}
                        onPriorityChange={(p) => updateSubtask(task.id, child.id, { priority: p || undefined })}
                        onStatusChange={(s) => updateSubtask(task.id, child.id, { status: s })}
                        onDueDateChange={(d) => updateSubtask(task.id, child.id, { dueDate: d })}
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
                  ))}

                  {/* CTA inline "+ subtarea" eliminado — el acceso para
                      agregar subtask2 vive ahora 100% en el botón Plus de
                      la fila de acciones del root (onAddChild). Mantenemos
                      SOLO el input cuando ya se disparó addingChildTo,
                      para que el formulario se renderee. */}
                  {!isCollapsed && addingChildTo === root.id && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        const t = childDraft.trim()
                        if (!t) { setAddingChildTo(null); return }
                        addSubtask(task.id, t, root.id)
                        setChildDraft('')
                        // Keep the input open so the user can rapid-fire
                        // multiple children. Esc closes it.
                      }}
                      className="ml-12 flex items-center gap-1.5 px-2 py-1"
                    >
                      <CornerDownRight className="w-2.5 h-2.5 text-zinc-600 shrink-0" />
                      <input
                        autoFocus
                        value={childDraft}
                        onChange={(e) => setChildDraft(e.target.value)}
                        onPaste={(e) => {
                          const lines = e.clipboardData.getData('text').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
                          if (lines.length > 1) {
                            e.preventDefault()
                            for (const line of lines) addSubtask(task.id, line, root.id)
                            setChildDraft('')
                          }
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Escape') { setAddingChildTo(null); setChildDraft('') }
                        }}
                        onBlur={() => {
                          // Close the input if it's empty (user clicked away
                          // without typing). Keep it open if there's content
                          // so blurred-but-typed values don't get lost.
                          if (!childDraft.trim()) setAddingChildTo(null)
                        }}
                        placeholder="Nueva subtarea…"
                        className="flex-1 bg-transparent border-b border-indigo-500/40 focus:border-indigo-500 outline-none text-[14px] text-zinc-200 placeholder:text-zinc-700 py-0.5"
                      />
                      <button
                        type="button"
                        onClick={() => { setAddingChildTo(null); setChildDraft('') }}
                        title="Cerrar"
                        className="text-zinc-600 hover:text-zinc-300 text-[10px]"
                      >
                        Esc
                      </button>
                    </form>
                  )}
                </div>
              )
            })}
          </div>
          <form onSubmit={handleAddSubtask} className="mt-2 flex items-center gap-1">
            <input
              ref={subtaskInputRef}
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onPaste={handleSubtaskPaste}
              placeholder={t('tasks.addSubtask')}
              className="flex-1 bg-transparent border-b border-white/[0.12] focus:border-indigo-500 outline-none text-sm text-zinc-300 placeholder-zinc-600 py-0.5"
            />
            <button type="submit" className="text-zinc-600 hover:text-indigo-400 transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>
        </motion.div>
      )}

      {expanded && visibleSubtasks.length === 0 && (
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: 'auto' }}
          transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
          className="border-t border-white/[0.08] bg-white/[0.03]/50 px-3 py-2 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <form onSubmit={handleAddSubtask} className="flex items-center gap-1">
            <input
              ref={subtaskInputRef}
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onPaste={handleSubtaskPaste}
              placeholder={t('tasks.addSubtask')}
              className="flex-1 bg-transparent border-b border-white/[0.12] focus:border-indigo-500 outline-none text-sm text-zinc-300 placeholder-zinc-600 py-0.5"
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
    </div>

      {/* Tachito rojo — POR ENCIMA de la tarjeta, anclado a la derecha. Su
          ancho = lo que deslizaste (tope 1/4). Tocarlo borra; cualquier otra
          cosa lo cierra. Mientras está casi cerrado no intercepta toques. */}
      <button
        data-interactive
        onClick={(e) => { e.stopPropagation(); deleteTask(task.id); setRevealW(0) }}
        aria-hidden={!revealOpen}
        tabIndex={revealOpen ? 0 : -1}
        title="Eliminar tarea"
        className="absolute top-0 right-0 bottom-0 z-10 flex items-center justify-center bg-red-600 active:bg-red-700 text-white overflow-hidden rounded-r-2xl"
        style={{
          width: revealW,
          transition: dragging ? 'none' : 'width 0.18s ease-out',
          pointerEvents: revealW > 6 ? 'auto' : 'none',
        }}
      >
        <Trash2 className="w-5 h-5 shrink-0" />
      </button>
    </div>
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
            background: 'var(--surface-popover)',
            boxShadow: '0 10px 32px -8px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04), 0 0 24px -8px rgba(99,102,241,0.35)',
          }}
          className="rounded-lg overflow-hidden border border-white/[0.14]"
        >
          {options.map((opt) => (
            <button key={opt.value}
              onClick={(e) => { e.stopPropagation(); onChange(opt.value); setOpen(false) }}
              className="w-full px-3 py-1.5 text-xs font-medium text-left hover:bg-white/[0.05] transition-colors flex items-center gap-2"
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

// ─── Task schedule button (date + time inline popover) ───────────────────────
// Botón de calendario en la fila de acciones de la tarea madre. Abre un
// popover (vía portal, para escapar del overflow-hidden de la card) con
// inputs de fecha y hora, así el user agenda la tarea en el calendario sin
// tener que abrir el detalle. Si la tarea ya tiene fecha, el icono se tiñe.

function TaskScheduleButton({
  task, updateTask,
}: {
  task: Task
  updateTask: (id: string, patch: Partial<Task>) => void
}) {
  const { dfLocale } = useTranslation()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => setMounted(true), [])

  const POPOVER_W = 220
  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    // Right-align el popover contra el botón; clamp para no salirse por
    // el borde izquierdo de la ventana.
    const left = Math.max(8, r.right - POPOVER_W)
    setPos({ top: r.bottom + 4, left })
    setOpen(true)
  }

  // Cerrar al click afuera / Escape / scroll — mismo patrón que InlineSelectBadge.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (target && target.closest('[data-schedule-popover]')) return
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

  const hasSchedule = !!task.dueDate
  const scheduleLabel = task.dueDate
    ? (() => {
        const [y, m, d] = task.dueDate.split('-').map(Number)
        const dt = new Date(y, m - 1, d)
        const base = format(dt, 'EEE d MMM', { locale: dfLocale })
        return task.dueTime ? `${base} · ${task.dueTime}` : base
      })()
    : null

  return (
    <>
      <button
        ref={btnRef}
        data-interactive
        onClick={(e) => { e.stopPropagation(); open ? setOpen(false) : openMenu() }}
        title={scheduleLabel ? `Programada: ${scheduleLabel} — click para cambiar` : 'Poner fecha y hora'}
        className={`transition-colors p-1 ${hasSchedule ? 'text-indigo-300 hover:text-indigo-200' : 'text-zinc-600 hover:text-indigo-300'}`}
      >
        <Calendar className="w-3.5 h-3.5" />
      </button>
      {mounted && open && pos && createPortal(
        <div
          data-schedule-popover
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: POPOVER_W,
            zIndex: 9999,
            background: 'var(--surface-popover)',
            boxShadow: '0 10px 32px -8px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04), 0 0 24px -8px rgba(99,102,241,0.35)',
          }}
          className="rounded-lg border border-white/[0.14] p-3 space-y-2"
        >
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Programar</p>
          <div>
            <label className="text-[10px] text-zinc-500 mb-1 block">Fecha</label>
            <input
              type="date"
              value={task.dueDate ?? ''}
              onChange={(e) => {
                const v = e.target.value || undefined
                // Si se borra la fecha, la hora pierde sentido → limpiamos
                // ambas para que la tarea no quede con hora colgada sin día.
                updateTask(task.id, v ? { dueDate: v } : { dueDate: undefined, dueTime: undefined })
              }}
              className="w-full text-xs bg-black/30 border border-white/[0.12] rounded px-2 py-1.5 text-zinc-200 focus:outline-none focus:border-indigo-500/60"
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 mb-1 block">Hora (opcional)</label>
            <input
              type="time"
              value={task.dueTime ?? ''}
              disabled={!task.dueDate}
              onChange={(e) => updateTask(task.id, { dueTime: e.target.value || undefined })}
              className="w-full text-xs bg-black/30 border border-white/[0.12] rounded px-2 py-1.5 text-zinc-200 focus:outline-none focus:border-indigo-500/60 disabled:opacity-40"
            />
            {!task.dueDate && (
              <p className="text-[9px] text-zinc-600 mt-1">Elegí una fecha primero.</p>
            )}
            {task.dueDate && task.dueTime && (
              <p className="text-[9px] text-indigo-300/80 mt-1">Aparece como bloque en el calendario.</p>
            )}
          </div>
          {hasSchedule && (
            <button
              onClick={() => { updateTask(task.id, { dueDate: undefined, dueTime: undefined }); setOpen(false) }}
              className="w-full flex items-center justify-center gap-1 text-[10px] text-zinc-500 hover:text-red-400 transition-colors pt-1"
            >
              <X className="w-2.5 h-2.5" /> Quitar fecha
            </button>
          )}
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
  /** Statuses the subtask can cycle through — typically inherited from
   *  the parent task's project. Lets subtasks track in-flight state
   *  ("Doing", "Done") so the user can see sub-project progress. */
  projectStatuses: { label: string; color: string }[]
  onToggle: () => void
  onRename: (nt: string) => void
  onPriorityChange: (p: Priority | '') => void
  onStatusChange: (status: string) => void
  onDueDateChange: (date: string | undefined) => void
  onDelete: () => void
  onUngroup?: () => void
  /** Para subtask1 (root, sin parentId): promueve esta subtask a una
   *  task madre nueva en el mismo proyecto, llevándose sus subtask2
   *  como subtask1 de la nueva madre. */
  onPromoteToTask?: () => void
  /** Para subtask1 (root): dispara el flujo de agregar una subtask2
   *  child. El parent (TaskCard) abre el input inline correspondiente. */
  onAddChild?: () => void
  onOpenDetail: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
}

function InlineSubtask({
  subtask, hasChildren, childrenCollapsed, onToggleCollapse, isChild, progressLabel, isDragging, isOver,
  projectStatuses,
  onToggle, onRename, onPriorityChange, onStatusChange, onDueDateChange,
  onDelete, onUngroup, onPromoteToTask, onAddChild, onOpenDetail,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}: InlineSubtaskProps) {
  const { t, tStatus, locale } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(subtask.title)
  const dateInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!editing) setDraft(subtask.title) }, [subtask.title, editing])

  const commit = () => { setEditing(false); onRename(draft) }
  const prioColor = subtask.priority ? PRIORITY_COLORS[subtask.priority] : null
  const canDrag = !hasChildren

  // Status pill — find the matching project status for color + cycle on click
  const currentStatusObj = projectStatuses.find((s) => s.label === subtask.status) ?? projectStatuses[0]
  const cycleStatus = () => {
    if (projectStatuses.length === 0) return
    const idx = projectStatuses.findIndex((s) => s.label === subtask.status)
    const next = projectStatuses[(idx + 1) % projectStatuses.length]
    if (next) onStatusChange(next.label)
  }

  // Native date picker — clicking the chip uses showPicker() where supported,
  // falls back to clicking the hidden input which opens it in older browsers.
  const openDatePicker = () => {
    const input = dateInputRef.current
    if (!input) return
    if (typeof input.showPicker === 'function') {
      try { input.showPicker(); return } catch { /* showPicker can throw in unfocused contexts */ }
    }
    input.click()
  }

  // Format dueDate as "DD/MM" for the chip; full string in tooltip.
  // Si la fecha es HOY mostramos "HOY" en lugar de DD/MM para que el user
  // entienda de un vistazo que esa subtask vence hoy.
  const dueIsToday = (() => {
    if (!subtask.dueDate) return false
    const [y, m, d] = subtask.dueDate.split('-').map(Number)
    const due = new Date(y, m - 1, d); due.setHours(0, 0, 0, 0)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return due.getTime() === today.getTime()
  })()
  const dueDateChip = subtask.dueDate
    ? (() => {
        if (dueIsToday) return 'HOY'
        const [y, m, d] = subtask.dueDate!.split('-').map(Number)
        const dt = new Date(y, m - 1, d)
        return dt.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
      })()
    : null
  const dueDateFull = subtask.dueDate
    ? (() => {
        const [y, m, d] = subtask.dueDate!.split('-').map(Number)
        const dt = new Date(y, m - 1, d)
        return dt.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
      })()
    : null
  // Visual cue for overdue/today
  const dueStateColor = (() => {
    if (!subtask.dueDate || subtask.completed) return '#71717a'  // zinc-500
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const [y, m, d] = subtask.dueDate.split('-').map(Number)
    const due = new Date(y, m - 1, d); due.setHours(0, 0, 0, 0)
    if (due.getTime() < today.getTime()) return '#ef4444'   // red — overdue
    if (due.getTime() === today.getTime()) return '#f59e0b' // amber — today
    return '#71717a'
  })()

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
      {/* Left gutter — three modes:
            (a) `isChild` → CornerDownRight arrow, flush against the check.
                Replaces the drag handle + collapse spacer since child
                subtasks don't need either.
            (b) parent WITH children → drag handle (hover) + collapse toggle.
            (c) parent WITHOUT children → drag handle (hover) + empty spacer. */}
      {isChild ? (
        // Negative right margin cancels the gap-1.5 (6px) of the parent
        // flex container so the arrow visually TOUCHES the check.
        <CornerDownRight className="w-3 h-3 text-zinc-700 shrink-0 -mr-1.5" />
      ) : (
        <>
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
        </>
      )}

      <button data-interactive onClick={(e) => { e.stopPropagation(); onToggle() }}>
        <CheckCircle2 className={`w-4 h-4 transition-colors ${subtask.completed ? 'text-emerald-400' : 'text-zinc-600 hover:text-zinc-400'}`} />
      </button>

      {/* Priority dot — click to cycle. Hidden once the subtask is
          completed (same reasoning as the parent task's priority chip:
          a finished item shouldn't visually scream "urgent" anymore). */}
      {!subtask.completed && (
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
      )}
      {/* Reserve the same width when hidden so the row layout stays
          consistent between completed and non-completed subtasks. */}
      {subtask.completed && <span className="shrink-0 w-2" />}

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
          className={`flex-1 bg-zinc-800 border border-indigo-500 rounded px-1.5 py-0.5 text-[15px] focus:outline-none ${
            subtask.completed ? 'line-through text-zinc-500' : 'text-zinc-100'
          }`}
        />
      ) : (
        <button
          data-interactive
          onClick={(e) => { e.stopPropagation(); setEditing(true) }}
          title={`Click para renombrar · ${subtask.title}`}
          className={`flex-1 text-[15px] text-left px-1.5 py-0.5 rounded hover:bg-white/[0.05]/60 transition-colors min-w-0 truncate ${
            subtask.completed ? 'line-through text-zinc-500' : 'text-zinc-200'
          } ${hasChildren ? 'font-semibold' : ''}`}
        >
          {subtask.title}
          {/* Progress chip lives INSIDE the title button so it doesn't
              push the status/date chips around — keeps every row's right
              column aligned regardless of whether the subtask has children. */}
          {progressLabel && (
            <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 tabular-nums align-middle">
              {progressLabel}
            </span>
          )}
        </button>
      )}

      {/* ── Property chips (status + date) ────────────────────────────
          Always visible if set; subtle when unset (date appears on hover).
          Status pill cycles through the parent project's status list. */}
      {currentStatusObj && projectStatuses.length > 0 && (
        <button
          data-interactive
          onClick={(e) => { e.stopPropagation(); cycleStatus() }}
          title={`${t('tasks.status')}: ${tStatus(currentStatusObj.label)}`}
          className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded border transition-all"
          style={{
            color: currentStatusObj.color,
            borderColor: `${currentStatusObj.color}40`,
            background: `${currentStatusObj.color}12`,
          }}
        >
          {tStatus(currentStatusObj.label)}
        </button>
      )}
      {/* Banderita "En calendario" para subtareas completadas con dueTime.
          Misma regla híbrida que aplica el auto-purge: las subtasks timed
          sobreviven hasta el domingo para que el snapshot del SPI quede
          completo. */}
      {subtask.completed && subtask.dueDate && subtask.dueTime && (
        <span
          title="Esta subtarea aparece como bloque en el calendario. Se va a archivar el domingo (cierre de semana) para que el snapshot del SPI quede completo."
          className="shrink-0 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-300/90 flex items-center gap-1"
        >
          <Calendar className="w-2.5 h-2.5" />
          En calendario
        </span>
      )}

      {/* Date chip + input invisible solapado encima — el browser ancla
          el popover del calendario nativo a la POSICIÓN del input, así
          que si está `sr-only` (off-screen) el popover aparece flotando
          lejos. Lo posicionamos absoluto encima del chip con opacity:0
          para que el popover salga PEGADO al chip. */}
      {subtask.dueDate ? (
        <div className="relative inline-block shrink-0">
          <button
            data-interactive
            onClick={(e) => { e.stopPropagation(); openDatePicker() }}
            title={`Vence: ${dueDateFull} — click para cambiar`}
            className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border transition-all hover:bg-white/[0.05]"
            style={{ color: dueStateColor, borderColor: `${dueStateColor}40` }}
          >
            <Calendar className="w-2.5 h-2.5" />
            {dueDateChip}
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onDueDateChange(undefined) }}
              title="Quitar fecha"
              className="text-zinc-600 hover:text-red-400 -mr-0.5"
            >
              <X className="w-2 h-2" />
            </span>
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={subtask.dueDate ?? ''}
            onChange={(e) => onDueDateChange(e.target.value || undefined)}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
            tabIndex={-1}
          />
        </div>
      ) : (
        <div className="relative inline-block shrink-0">
          <button
            data-interactive
            onClick={(e) => { e.stopPropagation(); openDatePicker() }}
            title="Agregar fecha de entrega"
            className="text-zinc-700 hover:text-zinc-300 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all p-0.5"
          >
            <Calendar className="w-3 h-3" />
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={subtask.dueDate ?? ''}
            onChange={(e) => onDueDateChange(e.target.value || undefined)}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
            tabIndex={-1}
          />
        </div>
      )}

      {/* Action buttons (on hover).
          The "ungroup" button only makes sense for child subtasks, but we
          ALWAYS reserve its slot (using `invisible` for non-children) so
          that every row's action column has the same width. Otherwise the
          status/date chips end up at slightly different horizontal
          positions between parent and child rows. */}
      <div className="flex items-center gap-0.5 shrink-0">
        {/* Slot izquierdo: dos botones distintos según sea subtask1 o subtask2.
            - subtask2 (isChild): ↶ "Sacar del grupo" — quita parentId, queda subtask1.
            - subtask1 (!isChild): ↗ "Promover a tarea madre" — saca la
              subtask de la task madre y la convierte en una nueva task
              top-level del proyecto, llevándose sus subtask2 como subtask1
              de la nueva madre.
            Cuando no aplica, el slot queda invisible (no `display:none`)
            así no corre los chips de status/fecha de su columna. */}
        {isChild ? (
          <button
            data-interactive
            onClick={(e) => { e.stopPropagation(); if (onUngroup) onUngroup() }}
            title={onUngroup ? 'Sacar del grupo (queda como subtarea de la madre)' : ''}
            aria-hidden={!onUngroup}
            tabIndex={!onUngroup ? -1 : undefined}
            className={`text-zinc-600 hover:text-zinc-200 transition-all text-[11px] px-1 ${
              onUngroup ? 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100' : 'invisible pointer-events-none'
            }`}
          >
            ↶
          </button>
        ) : (
          <button
            data-interactive
            onClick={(e) => {
              e.stopPropagation()
              if (!onPromoteToTask) return
              const msg = hasChildren
                ? 'Promover esta subtarea a tarea madre del proyecto?\n\nSus subtareas internas también se mudan con ella como subtareas de la nueva madre.'
                : 'Promover esta subtarea a tarea madre del proyecto?'
              if (confirm(msg)) onPromoteToTask()
            }}
            title={onPromoteToTask ? 'Promover a tarea madre del proyecto (se lleva sus subtareas)' : ''}
            aria-hidden={!onPromoteToTask}
            tabIndex={!onPromoteToTask ? -1 : undefined}
            className={`text-zinc-600 hover:text-emerald-300 transition-all text-[11px] px-1 ${
              onPromoteToTask ? 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100' : 'invisible pointer-events-none'
            }`}
          >
            ↗
          </button>
        )}
        {/* "+" para agregar subtask2 — solo aparece en subtask1 (!isChild).
            Para subtask2 (isChild=true) no tiene sentido porque el nesting
            es de 1 solo nivel. La acción dispara onAddChild que el parent
            (TaskCard) wirea al flujo inline existente (setAddingChildTo). */}
        {!isChild && onAddChild && (
          <button
            data-interactive
            onClick={(e) => { e.stopPropagation(); onAddChild() }}
            title="Agregar subtarea adentro"
            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-zinc-600 hover:text-indigo-300 transition-all p-0.5"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          data-interactive
          onClick={(e) => { e.stopPropagation(); onOpenDetail() }}
          title="Abrir detalle"
          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-zinc-600 hover:text-zinc-200 transition-all p-0.5"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
        <button
          data-interactive
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="Eliminar"
          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
