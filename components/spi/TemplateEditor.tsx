'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  X, Plus, Trash2, ChevronUp, ChevronDown, RotateCcw, Save, Settings2,
} from 'lucide-react'
import type { SPITemplate, SPISection, SectionField, SectionFieldType, SPILane } from '@/lib/spi/types'
import { DEFAULT_SPI_TEMPLATE } from '@/lib/spi/template'

/** Template editor — lets the user shape the SPI ritual to their needs.
 *
 *  Design choices:
 *  - Works on a LOCAL DRAFT copy. The user explicitly clicks "Guardar"
 *    to commit. Avoids destroying the running template on every keystroke.
 *  - No drag-drop; just up/down buttons. Simpler, works on mobile.
 *  - Subsections are rendered nested with the same controls. Recursive.
 *  - Restore-default button at the bottom for "I messed it up".
 *
 *  What you CAN'T do (intentionally, V1):
 *  - Move a field between sections.
 *  - Reparent a subsection.
 *  - Edit existing field "key" (the internal id) — only the label.
 *    The key is what links to past session values, changing it would
 *    orphan old data. Best to delete + add new if needed.
 */

const FIELD_TYPE_LABELS: Record<SectionFieldType, string> = {
  text: 'Texto corto',
  textarea: 'Texto largo',
  select: 'Lista desplegable',
  checklist: 'Checklist',
}

function genKey(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`
}

export function TemplateEditor({
  template, onSave, onClose, onReset,
}: {
  template: SPITemplate
  onSave: (t: SPITemplate) => void
  onReset: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<SPITemplate>(() => structuredClone(template))
  const isDirty = JSON.stringify(draft) !== JSON.stringify(template)

  // ─── Mutation helpers (operate on draft) ─────────────────────────────
  const update = (mut: (t: SPITemplate) => void) => {
    const next = structuredClone(draft)
    mut(next)
    setDraft(next)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-950 border border-fuchsia-500/30 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-fuchsia-400" /> Editar plantilla SPI
            </h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Ajustá las preguntas que aparecen cada sábado · v{draft.version}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Main checklist editor */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-fuchsia-300 mb-2">
              📋 Checklist principal
            </p>
            <div className="space-y-1.5">
              {draft.mainChecklist.map((item, idx) => (
                <div key={item.key} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5">
                  <input
                    value={item.label}
                    onChange={(e) => update((t) => { t.mainChecklist[idx].label = e.target.value })}
                    className="flex-1 bg-transparent text-sm text-zinc-200 focus:outline-none"
                  />
                  <ReorderButtons
                    canUp={idx > 0}
                    canDown={idx < draft.mainChecklist.length - 1}
                    onUp={() => update((t) => { [t.mainChecklist[idx - 1], t.mainChecklist[idx]] = [t.mainChecklist[idx], t.mainChecklist[idx - 1]] })}
                    onDown={() => update((t) => { [t.mainChecklist[idx], t.mainChecklist[idx + 1]] = [t.mainChecklist[idx + 1], t.mainChecklist[idx]] })}
                  />
                  <button
                    onClick={() => update((t) => { t.mainChecklist.splice(idx, 1) })}
                    className="text-zinc-700 hover:text-red-400 p-1"
                    title="Quitar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => update((t) => { t.mainChecklist.push({ key: genKey('item'), label: 'Nuevo ítem' }) })}
                className="w-full text-left text-xs text-zinc-500 hover:text-fuchsia-300 hover:bg-fuchsia-500/5 px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                <Plus className="w-3 h-3" /> Agregar ítem al checklist
              </button>
            </div>
          </div>

          {/* Lanes editor */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-fuchsia-300 mb-2">
              Carriles temáticos
            </p>
            <p className="text-[10px] text-zinc-500 mb-2 italic">
              Los carriles son los grupos temáticos que el usuario elige al inicio de cada sesión.
              Cada sección de abajo se asigna a uno.
            </p>
            <div className="space-y-1.5">
              {(draft.lanes ?? []).map((lane, idx) => (
                <LaneRow
                  key={lane.key}
                  lane={lane}
                  canUp={idx > 0}
                  canDown={idx < (draft.lanes?.length ?? 0) - 1}
                  onChange={(l) => update((t) => { t.lanes[idx] = l })}
                  onDelete={() => update((t) => { t.lanes.splice(idx, 1) })}
                  onUp={() => update((t) => { [t.lanes[idx - 1], t.lanes[idx]] = [t.lanes[idx], t.lanes[idx - 1]] })}
                  onDown={() => update((t) => { [t.lanes[idx], t.lanes[idx + 1]] = [t.lanes[idx + 1], t.lanes[idx]] })}
                />
              ))}
              <button
                onClick={() => update((t) => {
                  if (!t.lanes) t.lanes = []
                  t.lanes.push({
                    key: genKey('lane'),
                    emoji: '✨',
                    title: 'Nuevo carril',
                    description: '',
                    color: '#a1a1aa',
                  })
                })}
                className="w-full text-left text-xs text-zinc-500 hover:text-fuchsia-300 hover:bg-fuchsia-500/5 px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                <Plus className="w-3 h-3" /> Agregar carril
              </button>
            </div>
          </div>

          {/* Sections editor */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-fuchsia-300 mb-2">
              Secciones
            </p>
            <p className="text-[10px] text-zinc-500 mb-2 italic">
              Cada sección se asigna a un carril (dropdown a la derecha del título).
            </p>
            <div className="space-y-3">
              {draft.sections.map((section, idx) => (
                <SectionEditor
                  key={section.key}
                  section={section}
                  lanes={draft.lanes ?? []}
                  canUp={idx > 0}
                  canDown={idx < draft.sections.length - 1}
                  onChange={(newSection) => update((t) => { t.sections[idx] = newSection })}
                  onDelete={() => update((t) => { t.sections.splice(idx, 1) })}
                  onUp={() => update((t) => { [t.sections[idx - 1], t.sections[idx]] = [t.sections[idx], t.sections[idx - 1]] })}
                  onDown={() => update((t) => { [t.sections[idx], t.sections[idx + 1]] = [t.sections[idx + 1], t.sections[idx]] })}
                />
              ))}
              <button
                onClick={() => update((t) => { t.sections.push({
                  key: genKey('sec'),
                  emoji: '✨',
                  title: 'Nueva sección',
                  intro: '',
                  fields: [],
                }) })}
                className="w-full text-left text-xs text-zinc-500 hover:text-fuchsia-300 hover:bg-fuchsia-500/5 px-3 py-2 rounded-lg border border-dashed border-zinc-800 hover:border-fuchsia-500/30 transition-colors flex items-center gap-2"
              >
                <Plus className="w-3 h-3" /> Agregar nueva sección
              </button>
            </div>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={() => {
              if (confirm('Restaurar la plantilla original? Se perderán tus cambios actuales (las sesiones pasadas se mantienen intactas).')) {
                onReset()
                onClose()
              }
            }}
            className="text-xs text-zinc-500 hover:text-amber-400 transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3 h-3" /> Restaurar defaults
          </button>
          <div className="flex items-center gap-2">
            {isDirty && (
              <span className="text-[10px] font-mono text-amber-400 mr-2">cambios sin guardar</span>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => { onSave(draft); onClose() }}
              disabled={!isDirty}
              className="px-3 py-1.5 bg-fuchsia-500/15 border border-fuchsia-500/40 hover:bg-fuchsia-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-fuchsia-300 rounded text-xs font-semibold transition-all flex items-center gap-1.5"
            >
              <Save className="w-3 h-3" /> Guardar plantilla
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// LANE ROW EDITOR
// ─────────────────────────────────────────────────────────────────────
function LaneRow({
  lane, canUp, canDown, onChange, onDelete, onUp, onDown,
}: {
  lane: SPILane
  canUp: boolean
  canDown: boolean
  onChange: (l: SPILane) => void
  onDelete: () => void
  onUp: () => void
  onDown: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
      <div className="px-2 py-1.5 flex items-center gap-2">
        <input
          value={lane.emoji}
          onChange={(e) => onChange({ ...lane, emoji: e.target.value })}
          className="w-9 bg-zinc-950 border border-zinc-800 rounded text-center text-sm focus:outline-none focus:border-fuchsia-500/40"
          maxLength={2}
        />
        <input
          value={lane.title}
          onChange={(e) => onChange({ ...lane, title: e.target.value })}
          className="flex-1 bg-transparent text-sm font-semibold focus:outline-none"
          style={{ color: lane.color }}
        />
        <input
          type="color"
          value={lane.color}
          onChange={(e) => onChange({ ...lane, color: e.target.value })}
          className="w-6 h-6 rounded cursor-pointer bg-transparent border border-zinc-800"
          title="Color del carril"
        />
        <ReorderButtons canUp={canUp} canDown={canDown} onUp={onUp} onDown={onDown} />
        <button onClick={() => setExpanded((v) => !v)} className="text-zinc-600 hover:text-zinc-300 text-[10px] font-mono px-1">
          {expanded ? '−' : '+'}
        </button>
        <button
          onClick={() => { if (confirm(`Eliminar carril "${lane.title}"? Las secciones quedan sin carril.`)) onDelete() }}
          className="text-zinc-700 hover:text-red-400 p-1"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {expanded && (
        <div className="px-2 pb-2 pt-0 border-t border-zinc-800">
          <label className="text-[9px] text-zinc-600 mb-0.5 block mt-1">Descripción (qué decirle al usuario cuándo elegir este)</label>
          <textarea
            value={lane.description}
            onChange={(e) => onChange({ ...lane, description: e.target.value })}
            rows={2}
            className="w-full text-[11px] bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-300 focus:outline-none focus:border-fuchsia-500/40 resize-none"
          />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// SECTION EDITOR (recursive — handles subsections)
// ─────────────────────────────────────────────────────────────────────
function SectionEditor({
  section, lanes, canUp, canDown, onChange, onDelete, onUp, onDown,
}: {
  section: SPISection
  lanes: SPILane[]
  canUp: boolean
  canDown: boolean
  onChange: (s: SPISection) => void
  onDelete: () => void
  onUp: () => void
  onDown: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  const updateField = (idx: number, field: SectionField) => {
    const next = { ...section, fields: [...(section.fields ?? [])] }
    next.fields![idx] = field
    onChange(next)
  }
  const addField = () => {
    const next: SPISection = {
      ...section,
      fields: [...(section.fields ?? []), {
        key: genKey('field'),
        label: 'Nueva pregunta',
        type: 'textarea',
      }],
    }
    onChange(next)
  }
  const removeField = (idx: number) => {
    const next = { ...section, fields: [...(section.fields ?? [])] }
    next.fields!.splice(idx, 1)
    onChange(next)
  }
  const reorderField = (idx: number, dir: -1 | 1) => {
    const next = { ...section, fields: [...(section.fields ?? [])] }
    const j = idx + dir
    if (j < 0 || j >= next.fields!.length) return
    ;[next.fields![idx], next.fields![j]] = [next.fields![j], next.fields![idx]]
    onChange(next)
  }
  const addSubsection = () => {
    const next: SPISection = {
      ...section,
      subsections: [...(section.subsections ?? []), {
        key: genKey('sub'),
        emoji: '🔹',
        title: 'Nueva subsección',
        fields: [],
      }],
    }
    onChange(next)
  }
  const updateSubsection = (idx: number, sub: SPISection) => {
    const next = { ...section, subsections: [...(section.subsections ?? [])] }
    next.subsections![idx] = sub
    onChange(next)
  }
  const removeSubsection = (idx: number) => {
    const next = { ...section, subsections: [...(section.subsections ?? [])] }
    next.subsections!.splice(idx, 1)
    onChange(next)
  }
  const reorderSubsection = (idx: number, dir: -1 | 1) => {
    const next = { ...section, subsections: [...(section.subsections ?? [])] }
    const j = idx + dir
    if (j < 0 || j >= next.subsections!.length) return
    ;[next.subsections![idx], next.subsections![j]] = [next.subsections![j], next.subsections![idx]]
    onChange(next)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Section header row */}
      <div className="px-3 py-2 flex items-center gap-2 border-b border-zinc-800">
        <input
          value={section.emoji}
          onChange={(e) => onChange({ ...section, emoji: e.target.value })}
          className="w-10 bg-zinc-950 border border-zinc-800 rounded text-center text-sm focus:outline-none focus:border-fuchsia-500/40"
          maxLength={2}
        />
        <input
          value={section.title}
          onChange={(e) => onChange({ ...section, title: e.target.value })}
          className="flex-1 bg-transparent text-sm font-semibold text-zinc-200 focus:outline-none"
          placeholder="Título de la sección"
        />
        <select
          value={section.laneKey ?? ''}
          onChange={(e) => onChange({ ...section, laneKey: e.target.value || undefined })}
          className="text-[10px] bg-zinc-950 border border-zinc-800 rounded px-1.5 py-1 text-zinc-400 focus:outline-none focus:border-fuchsia-500/40"
          title="Carril al que pertenece"
        >
          <option value="">(sin carril)</option>
          {lanes.map((l) => (
            <option key={l.key} value={l.key}>{l.emoji} {l.title}</option>
          ))}
        </select>
        <ReorderButtons canUp={canUp} canDown={canDown} onUp={onUp} onDown={onDown} />
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-zinc-500 hover:text-zinc-200 text-[10px] font-mono uppercase px-2"
        >
          {expanded ? 'menos' : 'más'}
        </button>
        <button
          onClick={() => { if (confirm(`Eliminar sección "${section.title}"?`)) onDelete() }}
          className="text-zinc-700 hover:text-red-400 p-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="p-3 space-y-3">
          {/* Intro */}
          <div>
            <label className="text-[10px] text-zinc-500 mb-1 block">Intro (descripción de la sección)</label>
            <textarea
              value={section.intro ?? ''}
              onChange={(e) => onChange({ ...section, intro: e.target.value })}
              rows={2}
              placeholder="Texto introductorio que aparece arriba al expandir esta sección"
              className="w-full text-xs bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-fuchsia-500/40 resize-none"
            />
          </div>

          {/* Collapsed-by-default checkbox */}
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={!!section.defaultCollapsed}
              onChange={(e) => onChange({ ...section, defaultCollapsed: e.target.checked })}
              className="accent-fuchsia-500"
            />
            Iniciar colapsada (el usuario tiene que abrirla manualmente)
          </label>

          {/* Fields */}
          {(section.fields?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">Preguntas</p>
              <div className="space-y-2">
                {section.fields!.map((field, idx) => (
                  <FieldEditor
                    key={field.key}
                    field={field}
                    canUp={idx > 0}
                    canDown={idx < section.fields!.length - 1}
                    onChange={(f) => updateField(idx, f)}
                    onDelete={() => removeField(idx)}
                    onUp={() => reorderField(idx, -1)}
                    onDown={() => reorderField(idx, 1)}
                  />
                ))}
              </div>
            </div>
          )}
          <button
            onClick={addField}
            className="text-[11px] text-zinc-500 hover:text-fuchsia-300 hover:bg-fuchsia-500/5 px-2 py-1 rounded transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" /> Agregar pregunta
          </button>

          {/* Subsections (recursive) */}
          {(section.subsections?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5 mt-3">Subsecciones</p>
              <div className="space-y-2 pl-3 border-l border-zinc-800">
                {section.subsections!.map((sub, idx) => (
                  <SectionEditor
                    key={sub.key}
                    section={sub}
                    lanes={lanes}
                    canUp={idx > 0}
                    canDown={idx < section.subsections!.length - 1}
                    onChange={(s) => updateSubsection(idx, s)}
                    onDelete={() => removeSubsection(idx)}
                    onUp={() => reorderSubsection(idx, -1)}
                    onDown={() => reorderSubsection(idx, 1)}
                  />
                ))}
              </div>
            </div>
          )}
          <button
            onClick={addSubsection}
            className="text-[11px] text-zinc-500 hover:text-fuchsia-300 hover:bg-fuchsia-500/5 px-2 py-1 rounded transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" /> Agregar subsección
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// FIELD EDITOR
// ─────────────────────────────────────────────────────────────────────
function FieldEditor({
  field, canUp, canDown, onChange, onDelete, onUp, onDown,
}: {
  field: SectionField
  canUp: boolean
  canDown: boolean
  onChange: (f: SectionField) => void
  onDelete: () => void
  onUp: () => void
  onDown: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded">
      <div className="px-2 py-1.5 flex items-center gap-2">
        <input
          value={field.label}
          onChange={(e) => onChange({ ...field, label: e.target.value })}
          placeholder="Pregunta"
          className="flex-1 bg-transparent text-xs text-zinc-200 focus:outline-none"
        />
        <select
          value={field.type}
          onChange={(e) => onChange({ ...field, type: e.target.value as SectionFieldType })}
          className="text-[10px] bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-400 focus:outline-none focus:border-fuchsia-500/40"
        >
          {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <ReorderButtons canUp={canUp} canDown={canDown} onUp={onUp} onDown={onDown} />
        <button onClick={() => setExpanded((v) => !v)} className="text-zinc-600 hover:text-zinc-300 text-[10px] font-mono px-1">
          {expanded ? '−' : '+'}
        </button>
        <button onClick={onDelete} className="text-zinc-700 hover:text-red-400 p-1">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {expanded && (
        <div className="px-2 pb-2 pt-1 space-y-2 border-t border-zinc-800">
          <div>
            <label className="text-[9px] text-zinc-600 mb-0.5 block">Placeholder</label>
            <input
              value={field.placeholder ?? ''}
              onChange={(e) => onChange({ ...field, placeholder: e.target.value || undefined })}
              className="w-full text-[11px] bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-300 focus:outline-none focus:border-fuchsia-500/40"
            />
          </div>
          <div>
            <label className="text-[9px] text-zinc-600 mb-0.5 block">Hint (descripción debajo del label)</label>
            <input
              value={field.hint ?? ''}
              onChange={(e) => onChange({ ...field, hint: e.target.value || undefined })}
              className="w-full text-[11px] bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-300 focus:outline-none focus:border-fuchsia-500/40"
            />
          </div>
          <div>
            <label className="text-[9px] text-zinc-600 mb-0.5 block">Blockquote (cita arriba del campo)</label>
            <input
              value={field.blockquote ?? ''}
              onChange={(e) => onChange({ ...field, blockquote: e.target.value || undefined })}
              className="w-full text-[11px] bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-300 focus:outline-none focus:border-fuchsia-500/40"
            />
          </div>
          <div>
            <label className="text-[9px] text-zinc-600 mb-0.5 block">Epigraph (cita debajo del campo)</label>
            <input
              value={field.epigraph ?? ''}
              onChange={(e) => onChange({ ...field, epigraph: e.target.value || undefined })}
              className="w-full text-[11px] bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-300 focus:outline-none focus:border-fuchsia-500/40"
            />
          </div>
          {field.type === 'select' && (
            <div>
              <label className="text-[9px] text-zinc-600 mb-0.5 block">Opciones (una por línea)</label>
              <textarea
                value={(field.options ?? []).join('\n')}
                onChange={(e) => onChange({ ...field, options: e.target.value.split('\n').filter(Boolean) })}
                rows={3}
                className="w-full text-[11px] bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-300 focus:outline-none focus:border-fuchsia-500/40 resize-none"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// SHARED — small reorder up/down pair
// ─────────────────────────────────────────────────────────────────────
function ReorderButtons({
  canUp, canDown, onUp, onDown,
}: { canUp: boolean; canDown: boolean; onUp: () => void; onDown: () => void }) {
  return (
    <div className="flex items-center">
      <button
        onClick={onUp}
        disabled={!canUp}
        className="text-zinc-700 hover:text-zinc-300 disabled:opacity-20 disabled:cursor-not-allowed p-0.5"
        title="Mover arriba"
      >
        <ChevronUp className="w-3 h-3" />
      </button>
      <button
        onClick={onDown}
        disabled={!canDown}
        className="text-zinc-700 hover:text-zinc-300 disabled:opacity-20 disabled:cursor-not-allowed p-0.5"
        title="Mover abajo"
      >
        <ChevronDown className="w-3 h-3" />
      </button>
    </div>
  )
}

// Re-export the bundled default for "restore" actions.
export { DEFAULT_SPI_TEMPLATE }
