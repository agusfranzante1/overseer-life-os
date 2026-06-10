'use client'
/**
 * CustomExerciseBuilder — modal para que el user defina ejercicios
 * propios del Lab (ej. "Tirada de cartas", "Ritual semanal", etc).
 *
 * Estructura del ejercicio armado:
 *   - Header: emoji, título, descripción corta, categoría, intro/outro
 *   - Secciones (steps): cada una con título + intro + lista de campos
 *   - Cada campo: label, tipo (textarea/text/select), placeholder, hint
 *
 * Al guardar se crea/actualiza en el labStore (customExercises). Después
 * el ExerciseRunner lo corre sin cambios — mismo shape que built-in.
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Plus, Trash2, GripVertical, ChevronDown, ChevronRight } from 'lucide-react'
import { useLabStore } from '@/lib/store/labStore'
import { LAB_CATEGORIES } from '@/lib/lab/templates'
import type { LabExercise, LabExerciseStep } from '@/lib/lab/types'
import type { SectionField, SectionFieldType } from '@/lib/spi/types'

const EMOJI_SUGGESTIONS = ['🎴', '🔮', '🧠', '✨', '🌙', '☕', '📓', '🪞', '🧘', '🎯', '🔥', '🌊', '🍃', '🎭', '🗝️', '🪄', '🎨', '📜', '⚖️', '🧩']
const FIELD_TYPES: { value: SectionFieldType; label: string }[] = [
  { value: 'textarea', label: 'Respuesta larga' },
  { value: 'text',     label: 'Respuesta corta' },
  { value: 'select',   label: 'Opciones (dropdown)' },
  { value: 'score',    label: 'Puntaje 1-10' },
]

interface Props {
  /** Si está, edita; si no, crea. */
  existing?: LabExercise | null
  /** Categoría sugerida al crear (opcional). */
  defaultCategoryKey?: string
  onClose: () => void
}

function genStepKey(): string  { return 'step_' + Math.random().toString(36).slice(2, 8) }
function genFieldKey(): string { return 'field_' + Math.random().toString(36).slice(2, 8) }

export function CustomExerciseBuilder({ existing, defaultCategoryKey, onClose }: Props) {
  const addCustomExercise = useLabStore((s) => s.addCustomExercise)
  const updateCustomExercise = useLabStore((s) => s.updateCustomExercise)
  const removeCustomExercise = useLabStore((s) => s.removeCustomExercise)

  const [emoji, setEmoji] = useState(existing?.emoji ?? '🎴')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [shortDescription, setShortDescription] = useState(existing?.shortDescription ?? '')
  const [intro, setIntro] = useState(existing?.intro ?? '')
  const [outro, setOutro] = useState(existing?.outro ?? '')
  const [categoryKey, setCategoryKey] = useState(existing?.categoryKey ?? defaultCategoryKey ?? LAB_CATEGORIES[0].key)
  const [steps, setSteps] = useState<LabExerciseStep[]>(
    existing?.steps && existing.steps.length > 0
      ? existing.steps
      : [{ key: genStepKey(), title: 'Sección 1', fields: [{ key: genFieldKey(), label: 'Pregunta', type: 'textarea' }] }]
  )

  const updateStep = (idx: number, patch: Partial<LabExerciseStep>) =>
    setSteps((arr) => arr.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  const removeStep = (idx: number) => setSteps((arr) => arr.filter((_, i) => i !== idx))
  const addStep = () => setSteps((arr) => [
    ...arr,
    { key: genStepKey(), title: `Sección ${arr.length + 1}`, fields: [{ key: genFieldKey(), label: 'Pregunta', type: 'textarea' }] },
  ])

  const updateField = (stepIdx: number, fieldIdx: number, patch: Partial<SectionField>) =>
    setSteps((arr) => arr.map((s, i) => {
      if (i !== stepIdx) return s
      return { ...s, fields: s.fields.map((f, j) => (j === fieldIdx ? { ...f, ...patch } : f)) }
    }))
  const removeField = (stepIdx: number, fieldIdx: number) =>
    setSteps((arr) => arr.map((s, i) => {
      if (i !== stepIdx) return s
      return { ...s, fields: s.fields.filter((_, j) => j !== fieldIdx) }
    }))
  const addField = (stepIdx: number) =>
    setSteps((arr) => arr.map((s, i) => {
      if (i !== stepIdx) return s
      return { ...s, fields: [...s.fields, { key: genFieldKey(), label: 'Nueva pregunta', type: 'textarea' }] }
    }))

  const moveStep = (idx: number, delta: number) =>
    setSteps((arr) => {
      const next = [...arr]
      const newIdx = idx + delta
      if (newIdx < 0 || newIdx >= next.length) return next
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return next
    })

  const handleSave = () => {
    const t = title.trim()
    if (!t) { alert('Poné un título al ejercicio.'); return }
    if (steps.length === 0) { alert('Agregá al menos una sección.'); return }
    const cleanSteps: LabExerciseStep[] = steps.map((s) => ({
      ...s,
      title: s.title.trim() || 'Sin título',
      fields: s.fields
        .filter((f) => f.label.trim().length > 0)
        .map((f) => ({
          ...f,
          label: f.label.trim(),
          // Limpieza de options si no es select
          options: f.type === 'select'
            ? (f.options ?? []).map((o) => o.trim()).filter(Boolean)
            : undefined,
        })),
    })).filter((s) => s.fields.length > 0)

    if (cleanSteps.length === 0) {
      alert('Cada sección necesita al menos una pregunta con label.')
      return
    }

    const payload: Omit<LabExercise, 'key'> = {
      categoryKey,
      emoji,
      title: t,
      shortDescription: shortDescription.trim(),
      intro: intro.trim() || undefined,
      outro: outro.trim() || undefined,
      steps: cleanSteps,
    }

    if (existing) {
      updateCustomExercise(existing.key, payload)
    } else {
      addCustomExercise(payload)
    }
    onClose()
  }

  const handleDelete = () => {
    if (!existing) return
    if (!confirm(`¿Eliminar el ejercicio "${existing.title}"?\n\nLas sesiones que ya creaste quedan como histórico pero no vas a poder iniciar nuevas con este ejercicio.`)) return
    removeCustomExercise(existing.key)
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.97, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-white/[0.10] rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base font-semibold text-white">
              {existing ? 'Editar ejercicio' : 'Nuevo ejercicio'}
            </h2>
            <p className="text-[10px] text-zinc-500">Armá tu ritual: secciones + preguntas guiadas.</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {/* Header del ejercicio */}
          <Section title="Identidad del ejercicio">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <FormField label="Emoji">
                <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={6}
                  className="w-full text-center text-2xl bg-zinc-800 border border-white/[0.12] rounded-lg px-2 py-2 text-zinc-200 focus:outline-none focus:border-violet-500" />
              </FormField>
              <FormField label="Título">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Tirada de cartas matutina"
                  className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-2 text-sm text-zinc-200 focus:outline-none focus:border-violet-500" />
              </FormField>
            </div>
            <div className="flex flex-wrap gap-1.5 -mt-1">
              {EMOJI_SUGGESTIONS.map((e) => (
                <button key={e} onClick={() => setEmoji(e)}
                  className={`w-7 h-7 rounded text-base hover:bg-white/[0.05] transition-colors ${emoji === e ? 'bg-violet-500/20 border border-violet-500/40' : ''}`}>
                  {e}
                </button>
              ))}
            </div>

            <FormField label="Descripción corta (1 línea)" hint="Se muestra como subtítulo en la lista de la categoría.">
              <input value={shortDescription} onChange={(e) => setShortDescription(e.target.value)}
                placeholder="Ej. Saco 3 cartas y les hago preguntas guiadas para abrir mi día."
                className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500" />
            </FormField>

            <FormField label="Categoría">
              <select value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)}
                className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500">
                {LAB_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.emoji} {c.title}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Intro (opcional)" hint="Texto que aparece al abrir el ejercicio — el por qué de la práctica.">
              <textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={2}
                placeholder="La intención antes de empezar..."
                className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500 resize-none" />
            </FormField>

            <FormField label="Outro (opcional)" hint="Texto al final de la sesión — el cierre / mantra.">
              <textarea value={outro} onChange={(e) => setOutro(e.target.value)} rows={2}
                placeholder="Lo que te llevás..."
                className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500 resize-none" />
            </FormField>
          </Section>

          {/* Secciones (steps) */}
          <Section title="Secciones y preguntas" subtitle="Cada sección aparece como bloque colapsable. Agregá las preguntas que querés responder en cada una.">
            <div className="space-y-3">
              {steps.map((step, sidx) => (
                <StepEditor
                  key={step.key}
                  step={step}
                  index={sidx}
                  isFirst={sidx === 0}
                  isLast={sidx === steps.length - 1}
                  canRemove={steps.length > 1}
                  onUpdate={(patch) => updateStep(sidx, patch)}
                  onRemove={() => removeStep(sidx)}
                  onMoveUp={() => moveStep(sidx, -1)}
                  onMoveDown={() => moveStep(sidx, 1)}
                  onUpdateField={(fidx, patch) => updateField(sidx, fidx, patch)}
                  onRemoveField={(fidx) => removeField(sidx, fidx)}
                  onAddField={() => addField(sidx)}
                />
              ))}
              <button onClick={addStep}
                className="w-full text-xs text-zinc-500 hover:text-violet-300 hover:bg-violet-500/5 active:bg-violet-500/10 px-3 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 border border-dashed border-white/[0.08] hover:border-violet-500/40">
                <Plus className="w-3.5 h-3.5" /> Agregar sección
              </button>
            </div>
          </Section>
        </div>

        <div className="flex items-center gap-2 p-4 border-t border-white/[0.06]">
          {existing && (
            <button onClick={handleDelete}
              className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 text-sm font-semibold transition-colors flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5" /> Eliminar
            </button>
          )}
          <button onClick={onClose}
            className="ml-auto px-4 py-2 rounded-lg bg-zinc-800 hover:bg-white/[0.08] text-zinc-300 text-sm font-semibold transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-violet-500/20 border border-violet-500/40 hover:bg-violet-500/30 text-violet-200 text-sm font-bold transition-colors">
            {existing ? 'Guardar cambios' : 'Crear ejercicio'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-zinc-600 mt-1 italic">{hint}</p>}
    </div>
  )
}

function StepEditor({
  step, index, isFirst, isLast, canRemove,
  onUpdate, onRemove, onMoveUp, onMoveDown,
  onUpdateField, onRemoveField, onAddField,
}: {
  step: LabExerciseStep
  index: number
  isFirst: boolean
  isLast: boolean
  canRemove: boolean
  onUpdate: (patch: Partial<LabExerciseStep>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onUpdateField: (idx: number, patch: Partial<SectionField>) => void
  onRemoveField: (idx: number) => void
  onAddField: () => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-lg bg-black/30 border border-white/[0.08]">
      <div className="flex items-center gap-2 p-2.5 border-b border-white/[0.06]">
        <button onClick={() => setOpen((v) => !v)} className="text-zinc-500 hover:text-zinc-200 shrink-0">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <span className="text-[10px] font-mono text-zinc-600 shrink-0">{String(index + 1).padStart(2, '0')}</span>
        <input value={step.title} onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="Título de la sección"
          className="flex-1 bg-transparent text-sm font-semibold text-zinc-100 focus:outline-none border-b border-transparent focus:border-violet-500" />
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onMoveUp} disabled={isFirst}
            className="text-zinc-600 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed p-1" title="Subir">
            ↑
          </button>
          <button onClick={onMoveDown} disabled={isLast}
            className="text-zinc-600 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed p-1" title="Bajar">
            ↓
          </button>
          {canRemove && (
            <button onClick={onRemove} className="text-zinc-600 hover:text-red-400 p-1" title="Eliminar sección">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="p-3 space-y-3">
          <FormField label="Intro de la sección (opcional)">
            <textarea value={step.intro ?? ''} onChange={(e) => onUpdate({ intro: e.target.value })} rows={2}
              placeholder="Contexto que aparece al abrir esta sección..."
              className="w-full bg-zinc-800 border border-white/[0.10] rounded px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-violet-500 resize-none" />
          </FormField>

          <div className="space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Preguntas</div>
            {step.fields.map((field, fidx) => (
              <FieldEditor
                key={field.key}
                field={field}
                onUpdate={(patch) => onUpdateField(fidx, patch)}
                onRemove={step.fields.length > 1 ? () => onRemoveField(fidx) : undefined}
              />
            ))}
            <button onClick={onAddField}
              className="text-[11px] text-zinc-500 hover:text-violet-300 flex items-center gap-1.5 px-2 py-1">
              <Plus className="w-3 h-3" /> Agregar pregunta
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function FieldEditor({
  field, onUpdate, onRemove,
}: { field: SectionField; onUpdate: (patch: Partial<SectionField>) => void; onRemove?: () => void }) {
  return (
    <div className="rounded bg-white/[0.02] border border-white/[0.04] p-2.5 space-y-2">
      <div className="flex items-start gap-2">
        <GripVertical className="w-3 h-3 text-zinc-600 mt-1.5 shrink-0" />
        <input value={field.label} onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="¿Qué le preguntás al user?"
          className="flex-1 bg-transparent text-xs font-semibold text-zinc-200 focus:outline-none border-b border-transparent focus:border-violet-500" />
        <select value={field.type} onChange={(e) => onUpdate({ type: e.target.value as SectionFieldType })}
          className="bg-zinc-800 border border-white/[0.10] rounded px-1.5 py-0.5 text-[10px] text-zinc-300 focus:outline-none focus:border-violet-500 shrink-0">
          {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {onRemove && (
          <button onClick={onRemove} className="text-zinc-600 hover:text-red-400 p-0.5" title="Eliminar pregunta">
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="pl-5 space-y-1.5">
        <input value={field.placeholder ?? ''} onChange={(e) => onUpdate({ placeholder: e.target.value })}
          placeholder="Placeholder (texto gris en el input vacío)"
          className="w-full bg-transparent border-b border-white/[0.06] focus:border-violet-500/40 text-[10px] text-zinc-400 focus:outline-none py-0.5" />
        <input value={field.hint ?? ''} onChange={(e) => onUpdate({ hint: e.target.value })}
          placeholder="Hint (pista debajo de la pregunta)"
          className="w-full bg-transparent border-b border-white/[0.06] focus:border-violet-500/40 text-[10px] text-zinc-400 focus:outline-none py-0.5" />
        {field.type === 'select' && (
          <input value={(field.options ?? []).join(', ')}
            onChange={(e) => onUpdate({ options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            placeholder="Opciones separadas por coma (ej. Sí, No, Tal vez)"
            className="w-full bg-zinc-800/40 border border-white/[0.06] rounded px-2 py-1 text-[10px] text-zinc-300 focus:outline-none focus:border-violet-500" />
        )}
      </div>
    </div>
  )
}
