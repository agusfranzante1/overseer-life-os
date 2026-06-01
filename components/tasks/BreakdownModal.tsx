'use client'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, X, Loader2, Plus, Trash2, ArrowRight, Wand2 } from 'lucide-react'
import { useTasksStore } from '@/lib/store/tasksStore'
import { Priority, Task } from '@/types'
import { PRIORITY_COLORS } from '@/lib/utils/constants'
import { getAiHeaders } from '@/lib/ai/headers'

interface BreakdownResult {
  title: string
  priority?: Priority
}

interface Props {
  /** Optional task to attach the breakdown to. If omitted, user creates a new task. */
  initialTask?: Task | null
  onClose: () => void
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']

export function BreakdownModal({ initialTask, onClose }: Props) {
  const { projects, addTask, addSubtask, updateSubtask } = useTasksStore()
  const [mode, setMode] = useState<'existing' | 'new'>(initialTask ? 'existing' : 'new')
  const [taskInput, setTaskInput] = useState(initialTask?.title ?? '')
  const [contextInput, setContextInput] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState(initialTask?.id ?? '')
  const [selectedProjectId, setSelectedProjectId] = useState(initialTask?.projectId ?? Object.keys(projects)[0] ?? '')
  const [subtasks, setSubtasks] = useState<BreakdownResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // When choosing existing task, default text to its title for the AI call
  useEffect(() => {
    if (mode === 'existing' && selectedTaskId) {
      const t = Object.values(useTasksStore.getState().tasks).find((x) => x.id === selectedTaskId)
      if (t) setTaskInput(t.title)
    }
  }, [mode, selectedTaskId])

  const breakdown = async () => {
    if (!taskInput.trim()) return
    setLoading(true)
    setError(null)
    setSubtasks([])

    const headers = getAiHeaders()
    if (!headers) {
      setError('La IA está desactivada. Andá a Configuración para activar Claude o Ollama.')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/ai/breakdown', {
        method: 'POST',
        headers,
        body: JSON.stringify({ task: taskInput.trim(), context: contextInput.trim() }),
      })
      const json = await res.json()
      if (!json.ok) {
        setError(
          json.error === 'ollama_unreachable'
            ? 'No pude llegar a Ollama. ¿Está corriendo en localhost:11434?'
            : json.error === 'anthropic_failed'
              ? `Claude rechazó la request: ${json.detail ?? ''}`
              : `Error: ${json.error}${json.detail ? ` — ${json.detail}` : ''}`
        )
        return
      }
      setSubtasks(json.subtasks ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown')
    } finally {
      setLoading(false)
    }
  }

  const updateSub = (idx: number, patch: Partial<BreakdownResult>) => {
    setSubtasks((prev) => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))
  }

  const removeSub = (idx: number) => {
    setSubtasks((prev) => prev.filter((_, i) => i !== idx))
  }

  const addManualSub = () => {
    // Default LOW — matches the global "new tasks start off the radar" rule.
    setSubtasks((prev) => [...prev, { title: '', priority: 'low' }])
  }

  const applyToProject = () => {
    if (subtasks.length === 0) return

    let targetTaskId = selectedTaskId

    // If we're in "new task" mode, create the parent task first
    if (mode === 'new') {
      if (!selectedProjectId || !taskInput.trim()) return
      const project = projects[selectedProjectId]
      if (!project) return
      // Pick first status of the project (or "To Do" fallback)
      const firstStatus = project.statuses[0]?.label ?? 'To Do'
      targetTaskId = addTask({
        projectId: selectedProjectId,
        title: taskInput.trim(),
        status: firstStatus,
        // Default LOW — matches the global "new tasks start off the radar"
        // rule. The user can bump priority/importance per-task after.
        priority: 'low',
        importance: 'low',
        subtasks: [],
      })
    }

    // Append the breakdown subtasks
    for (const s of subtasks) {
      if (!s.title.trim()) continue
      addSubtask(targetTaskId, s.title.trim())
      // Get the subtask we just added (it'll be the last one)
      const updatedTask = useTasksStore.getState().tasks[targetTaskId]
      if (updatedTask) {
        const lastSub = updatedTask.subtasks[updatedTask.subtasks.length - 1]
        if (lastSub && s.priority) {
          updateSubtask(targetTaskId, lastSub.id, { priority: s.priority })
        }
      }
    }

    onClose()
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
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-900 border border-indigo-500/30 rounded-2xl shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-gradient-to-r from-indigo-500/10 to-transparent">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">Desglose con IA</h3>
            <span className="text-[10px] font-mono text-indigo-300/70">via Ollama local</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Mode toggle */}
          <div className="flex bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
            <button onClick={() => setMode('new')}
              className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors ${
                mode === 'new' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-200'
              }`}>
              Nueva tarea
            </button>
            <button onClick={() => setMode('existing')}
              disabled={Object.values(useTasksStore.getState().tasks).length === 0}
              className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors disabled:opacity-40 ${
                mode === 'existing' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-200'
              }`}>
              Tarea existente
            </button>
          </div>

          {/* Existing task picker */}
          {mode === 'existing' && (
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Tarea</label>
              <select value={selectedTaskId} onChange={(e) => setSelectedTaskId(e.target.value)}
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                <option value="">— elegí una tarea —</option>
                {Object.values(useTasksStore.getState().tasks).map((t) => (
                  <option key={t.id} value={t.id}>
                    {projects[t.projectId]?.name ? `[${projects[t.projectId].name}] ` : ''}{t.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* New task project picker */}
          {mode === 'new' && (
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Proyecto destino</label>
              <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                {Object.values(projects).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Task description */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              {mode === 'existing' ? 'Descripción (editable)' : 'Tarea a desglosar'}
            </label>
            <textarea
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="ej. organizar una mudanza"
              rows={2}
              autoFocus={mode === 'new'}
              className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Context (optional) */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Contexto extra (opcional)
            </label>
            <textarea
              value={contextInput}
              onChange={(e) => setContextInput(e.target.value)}
              placeholder="ej. tengo 2 semanas, casa de 2 ambientes, presupuesto ajustado"
              rows={2}
              className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Action button */}
          <button
            onClick={breakdown}
            disabled={!taskInput.trim() || loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 border border-indigo-500/40 hover:border-indigo-500/60 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-300 text-sm font-bold transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Pensando con la IA local...' : 'Desglosar con IA'}
          </button>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Results */}
          {subtasks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  Subtareas propuestas · {subtasks.length}
                </h4>
                <button onClick={addManualSub}
                  className="text-[10px] text-zinc-500 hover:text-zinc-200 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> agregar manual
                </button>
              </div>
              <div className="space-y-1.5">
                {subtasks.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 group bg-zinc-950/60 border border-zinc-800 rounded-lg p-2">
                    <span className="text-[10px] font-mono text-zinc-600 w-5 shrink-0">{i + 1}.</span>
                    <input
                      value={s.title}
                      onChange={(e) => updateSub(i, { title: e.target.value })}
                      className="flex-1 bg-transparent border-b border-zinc-800 focus:border-indigo-500 outline-none text-sm text-zinc-200 py-0.5"
                    />
                    <select
                      value={s.priority ?? ''}
                      onChange={(e) => updateSub(i, { priority: (e.target.value || undefined) as Priority | undefined })}
                      className="text-[10px] font-mono uppercase rounded px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-300 focus:outline-none"
                      style={{
                        color: s.priority ? PRIORITY_COLORS[s.priority] : undefined,
                        borderColor: s.priority ? PRIORITY_COLORS[s.priority] + '60' : undefined,
                      }}
                    >
                      <option value="">—</option>
                      {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <button onClick={() => removeSub(i)}
                      className="text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Apply */}
              <button
                onClick={applyToProject}
                disabled={subtasks.filter((s) => s.title.trim()).length === 0 || (mode === 'new' && (!selectedProjectId || !taskInput.trim())) || (mode === 'existing' && !selectedTaskId)}
                className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 disabled:opacity-40 text-emerald-300 text-sm font-bold transition-all"
              >
                <ArrowRight className="w-4 h-4" />
                {mode === 'new' ? `Crear tarea + ${subtasks.length} subtareas` : `Agregar ${subtasks.length} subtareas`}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
