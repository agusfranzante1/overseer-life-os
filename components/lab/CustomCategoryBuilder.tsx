'use client'
/**
 * CustomCategoryBuilder — modal para que el user defina un "pabellón"
 * propio del Lab (ej. "Rituales", "Tarot", "Lectura", etc).
 *
 * Tras crearla, aparece como una card más en el home del Lab y queda
 * disponible como categoría destino al armar ejercicios custom.
 *
 * No se pueden borrar las built-in (Creencias, Emociones, etc) — solo las
 * que el user crea acá. Y solo si están vacías de ejercicios custom.
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Trash2 } from 'lucide-react'
import type { LabCategory } from '@/lib/lab/types'

const EMOJI_SUGGESTIONS = ['🎴', '🔮', '✨', '🌙', '☕', '📓', '🪞', '🧘', '🎯', '🔥', '🌊', '🍃', '🎭', '🗝️', '🪄', '🎨', '📜', '⚖️', '🧩', '🌱', '🪐', '⛩', '🕯', '💎']
const COLOR_PRESETS = ['#a855f7', '#ec4899', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#f97316', '#ef4444', '#facc15', '#6366f1', '#84cc16', '#14b8a6']

interface Props {
  existing?: LabCategory | null
  onSave: (payload: Omit<LabCategory, 'key'>) => void
  onDelete?: () => void
  onClose: () => void
}

export function CustomCategoryBuilder({ existing, onSave, onDelete, onClose }: Props) {
  const [emoji, setEmoji] = useState(existing?.emoji ?? '🎴')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [color, setColor] = useState(existing?.color ?? '#a855f7')
  const [tagline, setTagline] = useState(existing?.tagline ?? '')
  const [intro, setIntro] = useState(existing?.intro ?? '')

  const handleSave = () => {
    const t = title.trim()
    if (!t) { alert('Poné un título.'); return }
    onSave({
      emoji: emoji.trim() || '🧪',
      title: t,
      color,
      tagline: tagline.trim() || '—',
      intro: intro.trim() || undefined,
    })
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
        className="bg-zinc-900 border border-white/[0.10] rounded-2xl w-full max-w-lg overflow-hidden flex flex-col"
        style={{ boxShadow: `0 10px 40px -10px ${color}55, inset 0 1px 0 ${color}20` }}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base font-semibold text-white">
              {existing ? 'Editar categoría' : 'Nueva categoría'}
            </h2>
            <p className="text-[10px] text-zinc-500">Tu propio pabellón del Lab.</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <PreviewCard emoji={emoji} title={title || 'Nueva categoría'} color={color} tagline={tagline || 'Tu tagline acá'} />

          <Field label="Emoji">
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={6}
              className="w-full text-center text-2xl bg-zinc-800 border border-white/[0.12] rounded-lg px-2 py-2 text-zinc-200 focus:outline-none focus:border-violet-500" />
            <div className="flex flex-wrap gap-1 mt-2">
              {EMOJI_SUGGESTIONS.map((e) => (
                <button key={e} onClick={() => setEmoji(e)}
                  className={`w-7 h-7 rounded text-base hover:bg-white/[0.05] transition-colors ${emoji === e ? 'bg-violet-500/20 border border-violet-500/40' : ''}`}>
                  {e}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Título">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Rituales, Tarot, Lectura..."
              className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-2 text-sm text-zinc-200 focus:outline-none focus:border-violet-500" />
          </Field>

          <Field label="Color de identidad">
            <div className="flex gap-2 items-center flex-wrap">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer bg-transparent border border-white/[0.10]" />
              {COLOR_PRESETS.map((c) => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition-all ${color === c ? 'ring-2 ring-white scale-110' : 'hover:scale-105'}`}
                  style={{ background: c }} />
              ))}
            </div>
          </Field>

          <Field label="Tagline" hint="Frase corta debajo del título.">
            <input value={tagline} onChange={(e) => setTagline(e.target.value)}
              placeholder="Lo que esta categoría trabaja en 1 línea."
              className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500" />
          </Field>

          <Field label="Intro (opcional)" hint="Texto largo — la filosofía del pabellón. Aparece al entrar.">
            <textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={3}
              placeholder="El por qué de esta categoría..."
              className="w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500 resize-none" />
          </Field>
        </div>

        <div className="flex items-center gap-2 p-4 border-t border-white/[0.06]">
          {onDelete && (
            <button onClick={onDelete}
              className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 text-sm font-semibold transition-colors flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5" /> Eliminar
            </button>
          )}
          <button onClick={onClose}
            className="ml-auto px-4 py-2 rounded-lg bg-zinc-800 hover:bg-white/[0.08] text-zinc-300 text-sm font-semibold transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm font-bold transition-colors"
            style={{ background: color + '30', border: `1px solid ${color}70`, color }}
          >
            {existing ? 'Guardar' : 'Crear categoría'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-zinc-600 mt-1 italic">{hint}</p>}
    </div>
  )
}

function PreviewCard({ emoji, title, color, tagline }: { emoji: string; title: string; color: string; tagline: string }) {
  return (
    <div className="rounded-xl border-2 p-4"
      style={{ background: color + '12', borderColor: color + '40' }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl">{emoji}</span>
        <h3 className="text-base font-bold" style={{ color }}>{title}</h3>
      </div>
      <p className="text-[11px] text-zinc-300 italic">{tagline}</p>
    </div>
  )
}
