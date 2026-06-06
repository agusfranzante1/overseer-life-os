'use client'
import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check } from 'lucide-react'
import type { CalendarWeekSnapshot } from '@/lib/spi/types'
import { useTranslation } from '@/hooks/useTranslation'

/** Render pasivo del snapshot semanal del calendario. Funciona como
 *  "imagen" inmutable: no toca stores, no abre modales, no permite editar.
 *
 *  Layout: grid 7 columnas (Lun..Dom) × 24 horas, igual que el WeekView.
 *  Cada bloque del snapshot se dibuja en su día/hora con su color y
 *  estado de completion (tachado + opacidad cuando done). */

const HOUR_PX = 32  // más compacto que el WeekView real

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface Props {
  snapshot: CalendarWeekSnapshot
  onClose: () => void
}

export function CalendarSnapshotView({ snapshot, onClose }: Props) {
  const { t, tArray } = useTranslation()
  const weekdays = tArray('calendar.weekdaysShort')

  // Build days array (Lun..Dom) desde weekStartDate.
  const days = useMemo(() => {
    const [y, m, d] = snapshot.weekStartDate.split('-').map(Number)
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(y, m - 1, d + i)
      return {
        date: day,
        dateKey: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
        weekdayLabel: weekdays[i] ?? '',
      }
    })
  }, [snapshot.weekStartDate, weekdays])

  // Agrupar bloques por día.
  const blocksByDay = useMemo(() => {
    const map = new Map<string, typeof snapshot.blocks>()
    for (const b of snapshot.blocks) {
      const key = b.start.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(b)
    }
    return map
  }, [snapshot.blocks])

  // Rango de horas mostradas — del min al max + 1, sin pasar de [6, 23].
  // Si no hay bloques, default a 8..22.
  const { hourStart, hourEnd } = useMemo(() => {
    if (snapshot.blocks.length === 0) return { hourStart: 8, hourEnd: 22 }
    let mn = 23, mx = 0
    for (const b of snapshot.blocks) {
      const sh = new Date(b.start).getHours()
      const eh = new Date(b.end).getHours()
      if (sh < mn) mn = sh
      if (eh > mx) mx = eh
    }
    return { hourStart: Math.max(0, mn - 1), hourEnd: Math.min(24, mx + 1) }
  }, [snapshot.blocks])

  const hours = Array.from({ length: hourEnd - hourStart }, (_, i) => hourStart + i)
  const gridHeight = hours.length * HOUR_PX

  const fmtDate = (d: Date) =>
    `${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}`

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white/[0.03] border border-white/[0.08] rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.08]">
            <div>
              <h3 className="text-base font-bold text-white">
                📅 {t('spi.calendarSnapshotTitle') !== 'spi.calendarSnapshotTitle' ? t('spi.calendarSnapshotTitle') : 'Calendario de la semana'}
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {snapshot.weekStartDate} · {snapshot.tasksDone}/{snapshot.tasksTotal} tareas completadas
              </p>
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Grid */}
          <div className="overflow-auto flex-1 p-3">
            <div className="grid" style={{ gridTemplateColumns: '48px repeat(7, minmax(90px, 1fr))', minWidth: '700px' }}>
              {/* Header row */}
              <div />
              {days.map((d) => (
                <div key={d.dateKey} className="text-center pb-2 border-b border-white/[0.08]">
                  <p className="text-[10px] font-medium uppercase text-zinc-500">{d.weekdayLabel}</p>
                  <p className="text-sm text-zinc-300 font-semibold">{fmtDate(d.date)}</p>
                </div>
              ))}

              {/* Hours column */}
              <div className="border-r border-white/[0.08]/60" style={{ height: gridHeight }}>
                {hours.map((h) => (
                  <div key={h} className="text-right pr-1.5 text-[9px] text-zinc-500" style={{ height: HOUR_PX }}>
                    <span className="-translate-y-1.5 inline-block">{String(h).padStart(2, '0')}:00</span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {days.map((d) => {
                const dayBlocks = blocksByDay.get(d.dateKey) ?? []
                return (
                  <div key={d.dateKey} className="relative border-l border-white/[0.08]/60" style={{ height: gridHeight }}>
                    {/* Hour cell dividers */}
                    {hours.map((h) => (
                      <div key={h} className="border-b border-white/[0.08]/40" style={{ height: HOUR_PX }} />
                    ))}
                    {/* Blocks */}
                    {dayBlocks.map((b) => {
                      const start = new Date(b.start)
                      const end = new Date(b.end)
                      const startH = start.getHours() + start.getMinutes() / 60
                      const endH = end.getHours() + end.getMinutes() / 60
                      // Clamp dentro del rango visible
                      const top = Math.max(0, (startH - hourStart) * HOUR_PX)
                      const height = Math.max(14, (endH - startH) * HOUR_PX)
                      const isTask = b.source !== 'gcal'
                      return (
                        <div
                          key={b.id}
                          title={`${b.summary}\n${fmtTime(b.start)} – ${fmtTime(b.end)}`}
                          className="absolute left-0.5 right-0.5 rounded px-1 py-0.5 text-[10px] font-medium overflow-hidden leading-tight"
                          style={{
                            top, height,
                            background: isTask ? `${b.color}55` : b.color,
                            border: isTask ? `1px dashed ${b.color}` : undefined,
                            color: '#fff',
                            opacity: b.isCompleted ? 0.5 : 1,
                            textDecoration: b.isCompleted ? 'line-through' : undefined,
                          }}
                        >
                          <span className="inline-flex items-center gap-1">
                            {b.isCompleted && <Check className="w-2.5 h-2.5 shrink-0" strokeWidth={3} />}
                            <span className="truncate">{b.summary}</span>
                          </span>
                          {height > 24 && (
                            <p className="text-[9px] opacity-80 mt-0.5">
                              {fmtTime(b.start)} – {fmtTime(b.end)}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Footer — legend */}
          <div className="px-5 py-2 border-t border-white/[0.08] flex items-center gap-4 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded bg-blue-500" /> Evento
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded border border-dashed border-emerald-500" /> Tarea
            </span>
            <span className="flex items-center gap-1">
              <Check className="w-2.5 h-2.5 text-emerald-400" strokeWidth={3} /> Completada
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
