'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Pencil, Check, X, Trash2, Plus, ChevronDown, GripVertical } from 'lucide-react'
import { useAppStore, ScheduleKey } from '@/lib/store/appStore'

const SLOT_ICONS = [
  '🍽️','☕','🍪','🌙','🏋️','🍎','🍌','🥗','🍳','🥑',
  '🥤','💊','💧','📖','💼','🛏️','🧘','🚶','🏃','🚴',
  '✍️','🎯','🌅','🌇','⏰','💡','🎵','📞','🛁','🍫',
]
const SLOT_COLORS = [
  '#10b981','#6366f1','#f59e0b','#ef4444','#3b82f6','#ec4899',
  '#f97316','#8b5cf6','#14b8a6','#64748b','#06b6d4','#a855f7',
]

const PX_PER_HOUR = 72

function parseTime(time: string): number {
  const m = time.match(/^(\d{1,2}):(\d{2})$/) || time.match(/^(\d{1,2})$/)
  if (!m) return 0
  return parseInt(m[1]) + (parseInt(m[2] ?? '0') / 60)
}

/** Inversa de `parseTime`: convierte un hour-float (e.g. 13.25) en
 *  "HH:MM". Snap a 15 min para que el drag no genere horarios "13:07". */
function formatHour(hourFloat: number): string {
  const clamped = Math.max(0, Math.min(23.999, hourFloat))
  const snapped = Math.round(clamped * 4) / 4   // 15-min increments
  const h = Math.floor(snapped)
  const m = Math.round((snapped - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function IdealScheduleCard() {
  const {
    idealSchedule, updateSchedule, addScheduleSlot, removeScheduleSlot,
  } = useAppStore()
  const [editing, setEditing] = useState<ScheduleKey | null>(null)
  const [editVal, setEditVal] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [mounted, setMounted] = useState(false)
  // ── Drag-to-reschedule state ──
  // Mientras el usuario arrastra un slot, mantenemos la nueva hora en
  // memoria local (no la commiteamos al store hasta soltar) para evitar
  // re-renders y re-sorts en cada pixel. `dragKey` = ítem activo,
  // `dragTime` = hora previewed (string HH:MM).
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const [dragKey, setDragKey] = useState<ScheduleKey | null>(null)
  const [dragHour, setDragHour] = useState<number | null>(null)

  useEffect(() => {
    setMounted(true)
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Sort items by time
  const sorted = useMemo(() => {
    return Object.entries(idealSchedule)
      .map(([key, slot]) => ({ key: key as ScheduleKey, slot, hour: parseTime(slot.time) }))
      .sort((a, b) => a.hour - b.hour)
  }, [idealSchedule])

  // Timeline bounds: pad ±1h around items, clamp to [0, 24]
  const { startH, endH, totalPx } = useMemo(() => {
    if (sorted.length === 0) {
      return { startH: 7, endH: 23, totalPx: 16 * PX_PER_HOUR }
    }
    const minH = Math.max(0, Math.floor(sorted[0].hour) - 1)
    const maxH = Math.min(24, Math.ceil(sorted[sorted.length - 1].hour) + 1)
    return { startH: minH, endH: maxH, totalPx: (maxH - minH) * PX_PER_HOUR }
  }, [sorted])

  const hourTicks = useMemo(() => {
    const arr: number[] = []
    for (let h = startH; h <= endH; h++) arr.push(h)
    return arr
  }, [startH, endH])

  const nowHour = now.getHours() + now.getMinutes() / 60
  const nowInRange = mounted && nowHour >= startH && nowHour <= endH
  const nowOffsetPx = (nowHour - startH) * PX_PER_HOUR

  // Find next upcoming item to highlight
  const nextItem = useMemo(() => {
    if (!mounted) return null
    return sorted.find((s) => s.hour > nowHour) ?? null
  }, [sorted, nowHour, mounted])

  const currentPhase = useMemo(() => {
    if (!mounted) return null
    // The "current" phase is the last item whose hour <= now
    const past = sorted.filter((s) => s.hour <= nowHour)
    return past[past.length - 1] ?? null
  }, [sorted, nowHour, mounted])

  // Time remaining until next item (in minutes)
  const minutesUntilNext = useMemo(() => {
    if (!mounted || !nextItem) return null
    const diff = (nextItem.hour - nowHour) * 60
    return Math.max(0, Math.round(diff))
  }, [mounted, nextItem, nowHour])

  const remainingLabel = (mins: number): string => {
    if (mins <= 0) return 'ahora'
    if (mins < 60) return `en ${mins} min`
    const h = Math.floor(mins / 60)
    const m = mins % 60
    if (m === 0) return `en ${h}h`
    return `en ${h}h ${m}min`
  }

  const startEdit = (key: ScheduleKey) => {
    setEditVal(idealSchedule[key].time)
    setEditing(key)
  }

  const saveEdit = (key: ScheduleKey) => {
    if (/^\d{1,2}:\d{2}$/.test(editVal) || /^\d{1,2}$/.test(editVal)) {
      const normalized = /^\d{1,2}$/.test(editVal) ? `${editVal}:00` : editVal
      updateSchedule(key, normalized)
    }
    setEditing(null)
  }

  const handleDelete = (key: ScheduleKey) => {
    const slot = idealSchedule[key]
    if (!slot) return
    if (confirm(`¿Eliminar "${slot.label}" de los horarios ideales?`)) {
      removeScheduleSlot(key)
    }
  }

  /** Inicia un drag para mover un slot a otra hora. Se llama desde el
   *  handle "GripVertical" del item — no del item entero, así seguir
   *  clickeando el label/hora no dispara un drag accidental. */
  const startTimeDrag = (e: React.PointerEvent, key: ScheduleKey, originalHour: number) => {
    e.stopPropagation()
    e.preventDefault()
    const container = timelineRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const pointerId = e.pointerId
    const el = e.currentTarget as HTMLElement
    try { el.setPointerCapture(pointerId) } catch { /* noop */ }

    setDragKey(key)
    setDragHour(originalHour)

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      // Y dentro del contenedor → hora absoluta (snap interno).
      const offsetY = ev.clientY - containerRect.top
      const hourFloat = startH + offsetY / PX_PER_HOUR
      setDragHour(Math.max(0, Math.min(23.999, hourFloat)))
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      try { el.releasePointerCapture(pointerId) } catch { /* noop */ }
      // Commit al store solo en pointer-up, con snap a 15 min.
      setDragHour((h) => {
        if (h !== null) updateSchedule(key, formatHour(h))
        return null
      })
      setDragKey(null)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
  }

  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: `
          radial-gradient(circle at 0% 0%, rgba(99, 102, 241, 0.10), transparent 50%),
          rgba(255, 255, 255, 0.025)
        `,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 1px 2px rgba(0,0,0,0.2)',
      }}
    >
      <div className="flex items-center gap-3 mb-5">
        {/* Icon badge violeta */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: 'rgba(99, 102, 241, 0.18)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
          }}
        >
          <Clock className="w-4 h-4 text-indigo-300" />
        </div>
        <div className="flex-1">
          <h2 className="text-[15px] font-semibold text-white">Horarios ideales</h2>
          {mounted && currentPhase && (
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Ahora · <span style={{ color: currentPhase.slot.color }}>{currentPhase.slot.label}</span>
            </p>
          )}
        </div>
        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => setShowAdd((v) => !v)}
          title="Agregar horario nuevo"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-indigo-300 hover:text-white transition-colors"
          style={{
            background: 'rgba(99, 102, 241, 0.10)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
          }}
        >
          <Plus className="w-4 h-4" />
        </motion.button>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-3"
          >
            <AddSlotForm
              onCancel={() => setShowAdd(false)}
              onCreate={(slot) => { addScheduleSlot(slot); setShowAdd(false) }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline */}
      {sorted.length === 0 ? (
        <p className="text-xs text-zinc-600 text-center py-8">
          Sin horarios. Tocá <Plus className="w-3 h-3 inline" /> arriba para agregar uno.
        </p>
      ) : (
        <div className="relative flex gap-4" style={{ height: totalPx }}>
          {/* Left: hour rail */}
          <div className="relative w-16 shrink-0">
            {/* Vertical line */}
            <div className="absolute right-2 top-0 bottom-0 w-px bg-zinc-800" />

            {/* Hour ticks (subtle line every full hour across the whole card) */}
            {hourTicks.map((h) => (
              <div key={h} className="absolute right-0 flex items-center gap-1.5" style={{ top: (h - startH) * PX_PER_HOUR - 7 }}>
                <span className="text-[11px] font-mono text-zinc-600 tabular-nums">
                  {String(h % 24).padStart(2, '0')}:00
                </span>
                <span className="w-2 h-px bg-zinc-700" />
              </div>
            ))}

            {/* Now arrow */}
            {nowInRange && (
              <motion.div
                key="now-arrow"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 22 }}
                className="absolute right-0 z-10 pointer-events-none"
                style={{ top: nowOffsetPx - 7 }}
              >
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono font-bold text-pink-400 tabular-nums">
                    {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}
                  </span>
                  {/* Triangle/arrow pointing into the line */}
                  <svg width="10" height="14" viewBox="0 0 10 14" className="shrink-0">
                    <path d="M 0 0 L 10 7 L 0 14 Z" fill="#ec4899" />
                  </svg>
                </div>
              </motion.div>
            )}

            {/* Glowing dot at the now position on the line */}
            {nowInRange && (
              <motion.div
                className="absolute right-[5px] w-1.5 h-1.5 rounded-full"
                style={{ top: nowOffsetPx - 3, background: '#ec4899', boxShadow: '0 0 8px rgba(236,72,153,0.8)' }}
                animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </div>

          {/* Right: cards positioned by hour */}
          <div className="relative flex-1" ref={timelineRef}>
            {/* Faint horizontal hour gridlines */}
            {hourTicks.map((h) => (
              <div key={`grid-${h}`}
                className="absolute left-0 right-0 h-px bg-zinc-800/40 pointer-events-none"
                style={{ top: (h - startH) * PX_PER_HOUR }} />
            ))}

            {/* Horizontal now line */}
            {nowInRange && (
              <div className="absolute left-0 right-0 pointer-events-none z-0"
                style={{ top: nowOffsetPx }}>
                <div className="h-px bg-gradient-to-r from-pink-500/60 via-pink-500/30 to-pink-500/5" />
              </div>
            )}

            {sorted.map(({ key, slot, hour }) => {
              // Mientras el usuario arrastra ESTE item, usamos la hora
              // previewada en local (sin commitear al store todavía).
              const effectiveHour = dragKey === key && dragHour !== null ? dragHour : hour
              const top = (effectiveHour - startH) * PX_PER_HOUR - 24
              const isPast = mounted && effectiveHour < nowHour
              const isNext = nextItem?.key === key
              const isDragging = dragKey === key
              return (
                <div
                  key={key}
                  className={`absolute left-0 right-0 transition-opacity ${isPast ? 'opacity-50' : 'opacity-100'} ${
                    isDragging ? 'z-20' : ''
                  }`}
                  style={{ top }}
                >
                  <div
                    className={`relative flex items-center gap-4 group px-5 py-3.5 rounded-xl bg-zinc-800/60 border transition-all hover:bg-white/[0.05] ${
                      isNext ? 'border-indigo-500/60 shadow-[0_0_0_1px_rgba(99,102,241,0.3)]' : 'border-white/[0.08] hover:border-white/[0.12]'
                    } ${isDragging ? 'border-indigo-500/80 shadow-[0_0_18px_rgba(99,102,241,0.45)] cursor-grabbing' : ''}`}
                  >
                    {/* Color accent bar */}
                    <span className="absolute left-0 top-3 bottom-3 w-1 rounded-full"
                      style={{ background: slot.color }} />

                    {/* Drag handle — arrastrá verticalmente para mover el
                        slot a otra hora. Solo aparece en hover/drag, y solo
                        responde a pointer (no roba clicks al item). */}
                    <button
                      type="button"
                      onPointerDown={(e) => startTimeDrag(e, key, hour)}
                      title="Arrastrá para cambiar la hora"
                      className={`opacity-0 group-hover:opacity-100 ${isDragging ? 'opacity-100' : ''} text-zinc-500 hover:text-zinc-200 transition-opacity p-1 cursor-grab active:cursor-grabbing shrink-0`}
                      style={{ touchAction: 'none' }}
                    >
                      <GripVertical className="w-4 h-4" />
                    </button>

                    <span className="text-2xl shrink-0">{slot.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-base text-zinc-100 font-semibold truncate">{slot.label}</p>
                      {isNext && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-400">
                            siguiente
                          </span>
                          {minutesUntilNext !== null && (
                            <span className="text-[10px] font-mono tabular-nums text-indigo-300/80">
                              · {remainingLabel(minutesUntilNext)}
                            </span>
                          )}
                        </div>
                      )}
                      {!isNext && isPast && (
                        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mt-0.5">
                          ya pasó
                        </p>
                      )}
                    </div>

                    {editing === key ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={editVal}
                          onChange={(e) => setEditVal(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') saveEdit(key)
                            if (e.key === 'Escape') setEditing(null)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="13:00"
                          className="w-20 bg-white/[0.03] border border-indigo-500 rounded-lg px-2 py-1 text-base text-white text-center tabular-nums focus:outline-none"
                        />
                        <button onClick={() => saveEdit(key)} className="text-indigo-400 hover:text-indigo-300 p-1">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditing(null)} className="text-zinc-500 hover:text-zinc-300 p-1">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-extrabold tabular-nums" style={{ color: slot.color, letterSpacing: '-0.02em' }}>
                          {isDragging && dragHour !== null ? formatHour(dragHour) : slot.time}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); startEdit(key) }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-zinc-200 p-1"
                          title="Editar hora"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(key) }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-700 hover:text-red-400 p-1"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-[11px] text-zinc-600 mt-3 text-center">
        Decile al chat: <span className="text-zinc-500">&quot;quiero almorzar a las 14&quot;</span>
      </p>
    </div>
  )
}

// ─── Add Slot Form ────────────────────────────────────────────────────────────

interface AddSlotFormProps {
  onCancel: () => void
  onCreate: (slot: { label: string; icon: string; color: string; time?: string }) => void
}

function AddSlotForm({ onCancel, onCreate }: AddSlotFormProps) {
  const [label, setLabel] = useState('')
  const [icon, setIcon] = useState(SLOT_ICONS[0])
  const [color, setColor] = useState(SLOT_COLORS[0])
  const [time, setTime] = useState('12:00')
  const [iconsOpen, setIconsOpen] = useState(false)

  const handleSubmit = () => {
    if (!label.trim()) return
    onCreate({
      label: label.trim(),
      icon,
      color,
      time: /^\d{1,2}:\d{2}$/.test(time)
        ? time
        : /^\d{1,2}$/.test(time) ? `${time}:00` : '12:00',
    })
  }

  return (
    <div className="bg-black/30 border border-white/[0.12] rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-zinc-300">Nuevo horario</p>
        <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-200">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-[1fr_70px] gap-2">
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Nombre (ej. Yoga, Lectura)"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
            if (e.key === 'Escape') onCancel()
          }}
          className="bg-zinc-800 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
        />
        <input
          value={time}
          onChange={(e) => setTime(e.target.value)}
          placeholder="13:00"
          className="bg-zinc-800 border border-white/[0.12] rounded-lg px-2 py-1.5 text-xs text-white text-center tabular-nums focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <button onClick={() => setIconsOpen((v) => !v)}
          className="w-full flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-500 hover:text-zinc-300">
          <span>Icono · <span className="text-lg align-middle ml-1">{icon}</span></span>
          <ChevronDown className={`w-3 h-3 transition-transform ${iconsOpen ? 'rotate-180' : ''}`} />
        </button>
        {iconsOpen && (
          <div className="grid grid-cols-10 gap-1 mt-1.5">
            {SLOT_ICONS.map((ic) => (
              <button
                key={ic}
                onClick={() => setIcon(ic)}
                className={`aspect-square rounded-md text-sm flex items-center justify-center transition-colors ${
                  icon === ic
                    ? 'bg-indigo-500/25 border border-indigo-500/60'
                    : 'bg-zinc-800 hover:bg-white/[0.08] border border-transparent'
                }`}
              >
                {ic}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">Color</p>
        <div className="flex flex-wrap gap-1.5">
          {SLOT_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full transition-transform ${
                color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-950 scale-110' : ''
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-white/[0.08] text-zinc-300 text-xs font-semibold transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={!label.trim()}
          className="flex-1 px-3 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/40 hover:bg-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-300 text-xs font-bold transition-colors"
        >
          Crear
        </button>
      </div>
    </div>
  )
}
