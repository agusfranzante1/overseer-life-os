'use client'
import { useMemo, useState } from 'react'
import { X, ClipboardPaste, Check } from 'lucide-react'
import { parseOutlineToTasks, type BuiltOutline, type ParsedOutlineSubtask } from '@/lib/tasks/parseOutline'

interface ImportOutlineModalProps {
  projectName: string
  onClose: () => void
  onConfirm: (outline: BuiltOutline) => void
}

const SAMPLE = `Proyecto o tarea principal
  Subtarea
    Subtarea interna
Otra tarea principal`

export function ImportOutlineModal({ projectName, onClose, onConfirm }: ImportOutlineModalProps) {
  const [text, setText] = useState('')
  const outline = useMemo(() => parseOutlineToTasks(text), [text])
  const taskCount = outline.tasks.length
  const subtaskCount = useMemo(() => {
    const countNested = (items: ParsedOutlineSubtask[]): number =>
      items.reduce((sum, item) => sum + 1 + countNested(item.subtasks), 0)
    return outline.tasks.reduce((sum, task) => sum + countNested(task.subtasks), 0)
  }, [outline])

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[88vh] bg-zinc-950 border border-white/[0.12] rounded-lg shadow-2xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-white/[0.08] flex items-center gap-3">
          <ClipboardPaste className="w-4 h-4 text-indigo-300 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-zinc-100">Importar / Pegar lista</h2>
            <p className="text-xs text-zinc-500 truncate">Proyecto: {projectName}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-zinc-500 hover:text-zinc-200 p-1 rounded hover:bg-white/[0.06]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 min-h-0 flex-1">
          <div className="p-4 border-b lg:border-b-0 lg:border-r border-white/[0.08] flex flex-col min-h-[320px]">
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={SAMPLE}
              className="flex-1 min-h-[280px] resize-none bg-black/30 border border-white/[0.12] rounded-lg px-3 py-3 text-sm text-zinc-100 placeholder:text-zinc-700 focus:outline-none focus:border-indigo-500/60"
            />
          </div>

          <div className="p-4 overflow-y-auto min-h-[320px]">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Preview</h3>
              <span className="text-[11px] text-zinc-500 tabular-nums">{taskCount} tareas · {subtaskCount} subtareas</span>
            </div>
            {taskCount === 0 ? (
              <div className="h-full min-h-[240px] rounded-lg border border-dashed border-white/[0.12] flex items-center justify-center text-xs text-zinc-600 text-center px-6">
                Pegá una lista con indentación, bullets, numeración o emojis para ver la jerarquía.
              </div>
            ) : (
              <div className="space-y-3">
                {outline.tasks.map((task, index) => (
                  <div key={`${task.title}-${index}`} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                    <p className="text-sm font-semibold text-zinc-100">{task.title}</p>
                    {task.subtasks.length > 0 && (
                      <PreviewSubtasks items={task.subtasks} depth={1} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-white/[0.08] flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-200 rounded-lg hover:bg-white/[0.06]">
            Cancelar
          </button>
          <button
            disabled={taskCount === 0}
            onClick={() => {
              if (taskCount === 0) return
              onConfirm(outline)
            }}
            className="px-3 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Importar
          </button>
        </div>
      </div>
    </div>
  )
}

function PreviewSubtasks({ items, depth }: { items: ParsedOutlineSubtask[]; depth: number }) {
  const indent = Math.min(depth, 6) * 14
  return (
    <div className="mt-1.5 space-y-1">
      {items.map((item, index) => (
        <div key={`${item.title}-${depth}-${index}`}>
          <p className="text-xs text-zinc-300" style={{ paddingLeft: indent }}>
            {item.title}
          </p>
          {item.subtasks.length > 0 && <PreviewSubtasks items={item.subtasks} depth={depth + 1} />}
        </div>
      ))}
    </div>
  )
}
