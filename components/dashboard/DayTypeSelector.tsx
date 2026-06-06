'use client'
import { useState } from 'react'
import { useAppStore } from '@/lib/store/appStore'
import { useTranslation } from '@/hooks/useTranslation'
import { Plus, X, Check } from 'lucide-react'

const PRESET_COLORS = [
  '#6366f1', '#94a3b8', '#10b981', '#f59e0b', '#3b82f6',
  '#ec4899', '#f97316', '#8b5cf6', '#14b8a6', '#ef4444',
]

const PRESET_EMOJIS = ['🧠', '💼', '❤️', '🏋️', '📈', '📷', '🎯', '🛠️', '📚', '🍳', '🚀', '🌿', '⚡']

export function DayTypeSelector() {
  const dayType = useAppStore((s) => s.dayType)
  const setDayType = useAppStore((s) => s.setDayType)
  const dayTypes = useAppStore((s) => s.dayTypes)
  const addDayType = useAppStore((s) => s.addDayType)
  const removeDayType = useAppStore((s) => s.removeDayType)
  const { t } = useTranslation()

  const [editMode, setEditMode] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draftLabel, setDraftLabel] = useState('')
  const [draftColor, setDraftColor] = useState(PRESET_COLORS[0])
  const [draftIcon, setDraftIcon] = useState(PRESET_EMOJIS[0])

  // Built-in IDs have i18n labels; custom IDs use their stored label as-is.
  const labelFor = (cfg: { id: string; label: string }) => {
    const translated = t(`dayTypes.${cfg.id}`)
    return translated.startsWith('dayTypes.') ? cfg.label : translated
  }

  const handleAdd = () => {
    const label = draftLabel.trim()
    if (!label) return
    addDayType({ label, color: draftColor, icon: draftIcon })
    setDraftLabel('')
    setDraftColor(PRESET_COLORS[0])
    setDraftIcon(PRESET_EMOJIS[0])
    setAdding(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
          {t('dashboard.dayType')}
        </p>
        <button
          onClick={() => setEditMode((v) => !v)}
          className={`text-[10px] font-mono uppercase tracking-wider transition-colors ${
            editMode ? 'text-indigo-400' : 'text-zinc-600 hover:text-zinc-400'
          }`}
        >
          {editMode ? 'listo' : 'editar'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {dayTypes.map((cfg) => {
          const active = dayType === cfg.id
          return (
            <div key={cfg.id} className="relative">
              <button
                onClick={() => !editMode && setDayType(active ? null : cfg.id)}
                disabled={editMode}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  active
                    ? 'text-white border-current'
                    : 'text-zinc-400 border-white/[0.08] hover:border-zinc-600 hover:text-zinc-200'
                } ${editMode ? 'cursor-default opacity-70' : ''}`}
                style={active ? {
                  backgroundColor: cfg.color + '20',
                  borderColor: cfg.color,
                  color: cfg.color,
                } : {}}
              >
                <span>{cfg.icon}</span>
                {labelFor(cfg)}
              </button>
              {editMode && (
                <button
                  onClick={() => {
                    if (confirm(`¿Eliminar tipo de día "${labelFor(cfg)}"?`)) removeDayType(cfg.id)
                  }}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500/90 hover:bg-red-500 text-white flex items-center justify-center"
                  title={`Eliminar ${labelFor(cfg)}`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          )
        })}

        {editMode && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-white/[0.12] text-zinc-500 hover:border-indigo-500 hover:text-indigo-400 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo tipo
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-3">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
              placeholder="Nombre del tipo de día"
              className="flex-1 bg-black/30 border border-white/[0.12] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
            <button onClick={handleAdd} disabled={!draftLabel.trim()}
              className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 disabled:opacity-40 text-emerald-300">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setAdding(false)}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">Icono</p>
            <div className="flex flex-wrap gap-1">
              {PRESET_EMOJIS.map((emoji) => (
                <button key={emoji} onClick={() => setDraftIcon(emoji)}
                  className={`w-7 h-7 rounded-md flex items-center justify-center text-sm ${
                    draftIcon === emoji ? 'bg-indigo-500/20 ring-1 ring-indigo-500' : 'bg-zinc-800 hover:bg-zinc-700'
                  }`}>
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">Color</p>
            <div className="flex flex-wrap gap-1">
              {PRESET_COLORS.map((color) => (
                <button key={color} onClick={() => setDraftColor(color)}
                  className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${
                    draftColor === color ? 'ring-2 ring-white scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }} />
              ))}
            </div>
          </div>

          <p className="text-[10px] text-zinc-500 flex items-center gap-1.5">
            Preview:
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-medium"
              style={{ backgroundColor: draftColor + '20', borderColor: draftColor, color: draftColor }}>
              <span>{draftIcon}</span> {draftLabel || 'Mi tipo'}
            </span>
          </p>
        </div>
      )}
    </div>
  )
}
