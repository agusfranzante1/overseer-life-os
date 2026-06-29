'use client'
import { useState, useEffect } from 'react'
import { Sparkles, Pencil } from 'lucide-react'
import { useSPIStore, activeWeekAnchorYmd } from '@/lib/store/spiStore'
import { useAppStore } from '@/lib/store/appStore'

const DEFAULT_PROMPT = '¿Por qué te vas a felicitar hoy, sabiendo el final de la película?'
/** Día (JS getDay 0=Dom) → sufijo del campo `felicitar_<día>` del template SPI
 *  (sección autoconcepto). Sin acentos, igual que las keys del template. */
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
const MOODS = [
  { v: '1', emoji: '😞', label: 'Muy mal' },
  { v: '2', emoji: '😕', label: 'Mal' },
  { v: '3', emoji: '😐', label: 'Normal' },
  { v: '4', emoji: '🙂', label: 'Bien' },
  { v: '5', emoji: '😄', label: 'Excelente' },
]

function dayIndexInTz(tz: string): number {
  try {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date())
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd)
  } catch { return new Date().getDay() }
}

/** Reflexión diaria del Panel: "¿Por qué te vas a felicitar hoy?" + mood del
 *  día. Se guarda en la sesión SPI de la SEMANA ACTIVA: el texto en
 *  `values.autoconcepto.felicitar_<día>` (reusa los campos del template) y el
 *  mood en `values.dailyMood.<día>`. Así, al cerrar la semana, queda algo
 *  bueno + el mood de cada día. */
export function DailyReflection() {
  const timezone = useAppStore((s) => s.timezone)
  const storedPrompt = useAppStore((s) => s.dailyReflectionPrompt)
  const setStoredPrompt = useAppStore((s) => s.setDailyReflectionPrompt)
  const sessions = useSPIStore((s) => s.sessions)
  const ensureWeekSession = useSPIStore((s) => s.ensureWeekSession)
  const updateValue = useSPIStore((s) => s.updateValue)

  const anchor = activeWeekAnchorYmd(new Date())
  const dayName = DAY_NAMES[dayIndexInTz(timezone)] ?? 'lunes'
  const fieldKey = `felicitar_${dayName}`

  const session = sessions.find((s) => s.weekStartDate === anchor)
  const savedFelic = session?.values?.autoconcepto?.[fieldKey] ?? ''
  const savedMood = session?.values?.dailyMood?.[dayName] ?? ''

  // Prompt editable — sincronizado multi-device vía appPrefs (app_preferences).
  // Vacío en el store = usar el DEFAULT_PROMPT. Antes vivía en localStorage
  // (por-device); ahora viaja con el resto de las prefs del usuario.
  const prompt = storedPrompt || DEFAULT_PROMPT
  const [editingPrompt, setEditingPrompt] = useState(false)
  const savePrompt = (v: string) => {
    const t = v.trim()
    // Guardamos '' cuando coincide con el default, así no llenamos el payload
    // con el texto por defecto y cualquier cambio futuro del default se propaga.
    setStoredPrompt(t === DEFAULT_PROMPT ? '' : t)
    setEditingPrompt(false)
  }

  // Texto del día — buffer local, persiste en SPI al salir (blur).
  const [text, setText] = useState(savedFelic)
  useEffect(() => { setText(savedFelic) }, [savedFelic])
  const persistFelic = () => {
    if (text === savedFelic) return
    updateValue(ensureWeekSession(anchor), 'autoconcepto', fieldKey, text)
  }
  const setMood = (v: string) => {
    updateValue(ensureWeekSession(anchor), 'dailyMood', dayName, v === savedMood ? '' : v)
  }

  return (
    <div className="bg-gradient-to-br from-amber-500/[0.08] to-fuchsia-500/[0.04] border border-amber-500/20 rounded-2xl p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      {/* Título editable */}
      <div className="flex items-start gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
        {editingPrompt ? (
          <input
            autoFocus
            defaultValue={prompt}
            onBlur={(e) => savePrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') savePrompt((e.target as HTMLInputElement).value)
              if (e.key === 'Escape') setEditingPrompt(false)
            }}
            className="flex-1 bg-zinc-900/60 border border-amber-500/30 rounded-lg px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:border-amber-400"
          />
        ) : (
          <button
            onClick={() => setEditingPrompt(true)}
            title="Editar la pregunta"
            className="flex-1 text-left text-sm font-semibold text-zinc-100 leading-snug group inline-flex items-start gap-1.5"
          >
            <span>{prompt}</span>
            <Pencil className="w-3 h-3 text-zinc-600 group-hover:text-amber-300 shrink-0 mt-1 transition-colors" />
          </button>
        )}
      </div>

      {/* Respuesta del día */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={persistFelic}
        placeholder="Algo bueno de hoy…"
        rows={2}
        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/40 resize-none leading-snug"
      />

      {/* Mood del día */}
      <div className="flex items-center justify-between gap-2 mt-3">
        <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Mood de hoy</span>
        <div className="flex items-center gap-1">
          {MOODS.map((m) => {
            const active = savedMood === m.v
            return (
              <button
                key={m.v}
                onClick={() => setMood(m.v)}
                title={m.label}
                className={`w-8 h-8 rounded-lg text-lg leading-none flex items-center justify-center transition-all ${
                  active ? 'bg-amber-500/20 ring-1 ring-amber-400/50 scale-110' : 'opacity-50 hover:opacity-100 hover:bg-white/[0.05]'
                }`}
              >
                {m.emoji}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
