'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight, Trophy, RotateCcw, Archive, Trash2 } from 'lucide-react'
import { useLabStore } from '@/lib/store/labStore'
import { findCategory, findExercise } from '@/lib/lab/templates'
import type { LabSession } from '@/lib/lab/types'
import type { SectionField } from '@/lib/spi/types'

/** ExerciseRunner — corre una sesión de un ejercicio del Lab.
 *
 *  Renderiza:
 *   - Header con título editable + chip de categoría + status pill
 *   - Intro del ejercicio (colapsable)
 *   - Fields globales (si los hay) bajo "__root"
 *   - Cada step como sección colapsable
 *   - Outro (filosofía / recordatorio)
 *   - Bloque de cierre: outcome + botón "Cerrar"
 *   - Acciones secundarias: reabrir / archivar / borrar
 *
 *  Diseñado para usarse EMBEBIDO (dentro de la página del Lab o adentro de
 *  un modal del SPI). No tiene navegación propia — el padre maneja el back.
 */
export function ExerciseRunner({
  sessionId, onBack,
}: {
  sessionId: string
  onBack?: () => void
}) {
  const session = useLabStore((s) => s.sessions.find((x) => x.id === sessionId)) ?? null
  const updateValue = useLabStore((s) => s.updateValue)
  const renameSession = useLabStore((s) => s.renameSession)
  const closeSession = useLabStore((s) => s.closeSession)
  const reopenSession = useLabStore((s) => s.reopenSession)
  const archiveSession = useLabStore((s) => s.archiveSession)
  const unarchiveSession = useLabStore((s) => s.unarchiveSession)
  const deleteSession = useLabStore((s) => s.deleteSession)

  const [outcomeDraft, setOutcomeDraft] = useState('')
  const [showClose, setShowClose] = useState(false)
  const [introOpen, setIntroOpen] = useState(false)

  if (!session) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-zinc-500">Sesión no encontrada.</p>
        {onBack && (
          <button onClick={onBack} className="mt-3 text-xs text-indigo-400 hover:text-indigo-300">
            ← Volver
          </button>
        )}
      </div>
    )
  }

  const exercise = findExercise(session.exerciseKey)
  const category = findCategory(session.categoryKey)
  if (!exercise || !category) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-amber-400">Este ejercicio ya no existe en el catálogo.</p>
        {onBack && (
          <button onClick={onBack} className="mt-3 text-xs text-indigo-400 hover:text-indigo-300">
            ← Volver
          </button>
        )}
      </div>
    )
  }

  const isClosed = session.status === 'closed'
  const isArchived = session.status === 'archived'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border p-4" style={{
        background: category.color + '0F',
        borderColor: category.color + '40',
      }}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border"
                style={{ borderColor: category.color + '60', color: category.color, background: category.color + '15' }}>
                {category.emoji} {category.title}
              </span>
              <StatusBadge status={session.status} />
            </div>
            <input
              value={session.title}
              onChange={(e) => renameSession(session.id, e.target.value)}
              className="w-full bg-transparent text-lg font-semibold text-zinc-100 focus:outline-none focus:bg-zinc-900/40 rounded px-1 -ml-1"
              placeholder="Título de la sesión"
            />
            <p className="text-xs text-zinc-500 mt-0.5">{exercise.emoji} {exercise.title}</p>
          </div>

          <div className="flex items-center gap-1.5">
            {onBack && (
              <button onClick={onBack}
                className="text-[11px] text-zinc-500 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-900"
                title="Volver">
                ←
              </button>
            )}
            {!isClosed && !isArchived && (
              <button onClick={() => setShowClose((v) => !v)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5"
                style={{ borderColor: category.color + '60', color: category.color, background: category.color + '18' }}>
                <Trophy className="w-3.5 h-3.5" /> Cerrar
              </button>
            )}
            {isClosed && (
              <button onClick={() => reopenSession(session.id)}
                className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 flex items-center gap-1.5"
                title="Reabrir para seguir editando">
                <RotateCcw className="w-3.5 h-3.5" /> Reabrir
              </button>
            )}
            {!isArchived ? (
              <button onClick={() => { if (confirm('¿Archivar esta sesión? Podés desarchivarla después.')) archiveSession(session.id) }}
                className="text-zinc-500 hover:text-zinc-300 p-1.5 rounded hover:bg-zinc-900"
                title="Archivar">
                <Archive className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button onClick={() => unarchiveSession(session.id)}
                className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-900">
                Desarchivar
              </button>
            )}
            <button onClick={() => { if (confirm('¿Borrar esta sesión para siempre? No se puede deshacer.')) { deleteSession(session.id); onBack?.() } }}
              className="text-zinc-600 hover:text-red-400 p-1.5 rounded hover:bg-zinc-900"
              title="Borrar">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {exercise.intro && (
          <button onClick={() => setIntroOpen((v) => !v)}
            className="mt-3 text-[11px] text-zinc-500 italic hover:text-zinc-300 flex items-center gap-1">
            {introOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {introOpen ? 'Ocultar contexto' : 'Mostrar contexto del ejercicio'}
          </button>
        )}
        <AnimatePresence initial={false}>
          {introOpen && exercise.intro && (
            <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="text-xs text-zinc-400 italic mt-2 leading-relaxed overflow-hidden">
              {exercise.intro}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Closed banner */}
      {isClosed && session.outcome && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 mb-1">
            ✅ Outcome de la sesión
          </p>
          <p className="text-sm text-zinc-200 whitespace-pre-wrap">{session.outcome}</p>
        </div>
      )}

      {/* Fields globales bajo "__root" */}
      {exercise.fields && exercise.fields.length > 0 && (
        <div className="bg-zinc-950/40 border border-zinc-800 rounded-xl p-4 space-y-4">
          {exercise.fields.map((field) => (
            <Field key={field.key}
              field={field}
              value={session.values.__root?.[field.key] ?? ''}
              onChange={(v) => updateValue(session.id, '__root', field.key, v)}
              accent={category.color}
              disabled={isArchived}
            />
          ))}
        </div>
      )}

      {/* Steps (multi-step exercises) */}
      {exercise.steps?.map((step, idx) => (
        <StepBlock
          key={step.key}
          step={step}
          index={idx}
          totalSteps={exercise.steps!.length}
          session={session}
          onValueChange={(stepKey, fieldKey, value) => updateValue(session.id, stepKey, fieldKey, value)}
          accent={category.color}
          disabled={isArchived}
        />
      ))}

      {/* Outro / recordatorio */}
      {exercise.outro && (
        <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 text-center">
          <p className="text-xs text-zinc-400 italic leading-relaxed">{exercise.outro}</p>
        </div>
      )}

      {/* Close panel */}
      <AnimatePresence>
        {showClose && !isClosed && !isArchived && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-zinc-950 border border-emerald-500/40 rounded-2xl p-4 space-y-3"
          >
            <div>
              <p className="text-xs font-semibold text-emerald-300 mb-1">¿Qué te llevás de esta sesión?</p>
              <p className="text-[11px] text-zinc-500 italic mb-2">
                Un párrafo corto. La insight clave. Lo que vas a recordar dentro de un mes.
              </p>
              <textarea
                value={outcomeDraft}
                onChange={(e) => setOutcomeDraft(e.target.value)}
                placeholder="Ej: La creencia 'es difícil hacer dinero' es comodidad. La que sostengo, no la realidad. Elijo ver evidencia de lo opuesto cada día."
                rows={4}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 resize-y"
              />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => setShowClose(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-900">
                Cancelar
              </button>
              <button
                onClick={() => {
                  closeSession(session.id, outcomeDraft.trim())
                  setShowClose(false)
                  setOutcomeDraft('')
                }}
                className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/50 hover:bg-emerald-500/30 text-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <Trophy className="w-3.5 h-3.5" /> Cerrar sesión
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StatusBadge({ status }: { status: LabSession['status'] }) {
  if (status === 'open') return (
    <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border bg-blue-500/15 border-blue-500/40 text-blue-300">
      en progreso
    </span>
  )
  if (status === 'closed') return (
    <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border bg-emerald-500/15 border-emerald-500/40 text-emerald-300">
      cerrada
    </span>
  )
  return (
    <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border bg-zinc-800 border-zinc-700 text-zinc-500">
      archivada
    </span>
  )
}

function StepBlock({
  step, index, totalSteps, session, onValueChange, accent, disabled,
}: {
  step: NonNullable<ReturnType<typeof findExercise>>['steps'] extends (infer S)[] | undefined ? S : never
  index: number
  totalSteps: number
  session: LabSession
  onValueChange: (stepKey: string, fieldKey: string, value: string) => void
  accent: string
  disabled?: boolean
}) {
  // Always start collapsed — consistent with SPI/Proyección sections, the
  // user wants everything closed by default and only opens what they need.
  // (Previously the first step auto-expanded; that was inconsistent with
  // the rest of the app.)
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-zinc-950/40 border border-zinc-800 rounded-xl">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-zinc-900/40 transition-colors rounded-t-xl">
        <span className="text-[10px] font-mono text-zinc-600 w-10">{index + 1}/{totalSteps}</span>
        <span className="text-lg shrink-0">{step.emoji ?? '•'}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-zinc-200">{step.title}</h3>
          {step.intro && !open && (
            <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1">{step.intro}</p>
          )}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="px-4 pb-4 pt-3 space-y-4 border-t border-zinc-800/60">
              {step.intro && (
                <p className="text-xs text-zinc-400 italic leading-relaxed">{step.intro}</p>
              )}
              {step.fields.map((field) => (
                <Field key={field.key}
                  field={field}
                  value={session.values[step.key]?.[field.key] ?? ''}
                  onChange={(v) => onValueChange(step.key, field.key, v)}
                  accent={accent}
                  disabled={disabled}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Field({
  field, value, onChange, accent, disabled,
}: { field: SectionField; value: string; onChange: (v: string) => void; accent: string; disabled?: boolean }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-zinc-300 mb-1">{field.label}</label>
      {field.hint && (
        <p className="text-[10px] text-zinc-600 italic mb-1.5">{field.hint}</p>
      )}
      {field.type === 'textarea' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          disabled={disabled}
          style={{ borderColor: value ? accent + '40' : undefined }}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-indigo-500/40 resize-y disabled:opacity-60"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-indigo-500/40 disabled:opacity-60"
        />
      )}
      {field.epigraph && (
        <p className="text-[10px] text-zinc-600 italic mt-1.5">{field.epigraph}</p>
      )}
    </div>
  )
}
