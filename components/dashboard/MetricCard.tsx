'use client'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { useAppStore } from '@/lib/store/appStore'
import { useTranslation } from '@/hooks/useTranslation'
import { MetricEntry } from '@/types'
import { Pencil, Check } from 'lucide-react'

interface Props {
  metricKey: keyof MetricEntry
  color: string
  icon: React.ReactNode
}

function getStatusLabel(key: keyof MetricEntry, value: number | string): string {
  if (typeof value === 'string') return value
  if (key === 'stress') {
    if (value < 30) return 'Low'
    if (value < 60) return 'Medium'
    return 'High'
  }
  if (key === 'sleep') return `${value}h`
  if (key === 'sleepDebt') return `${value}h`
  if (key === 'steps') return value.toLocaleString()
  if (key === 'workload') {
    if (value < 40) return 'Light'
    if (value < 70) return 'Medium'
    return 'High'
  }
  return `${value}%`
}

export function MetricCard({ metricKey, color, icon }: Props) {
  const { metrics, updateMetric } = useAppStore()
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState('')

  const value = metrics[metricKey]
  const labelKey = `metrics.${metricKey}` as Parameters<typeof t>[0]
  const label = t(labelKey)

  const displayValue = getStatusLabel(metricKey, value)

  const startEdit = () => {
    setEditVal(String(value))
    setEditing(true)
  }

  const saveEdit = () => {
    // wakeTime is always a string (e.g. "07:00") — never parse it as a number
    // because parseFloat("07:00") = 7, which corrupts the value
    if (metricKey === 'wakeTime') {
      updateMetric('wakeTime', editVal as MetricEntry['wakeTime'])
      setEditing(false)
      return
    }
    const parsed = parseFloat(editVal)
    if (!isNaN(parsed)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updateMetric(metricKey as 'focus', parsed as any)
    }
    setEditing(false)
  }

  // Métricas que NO se editan manualmente — vienen automáticas (Xiaomi
  // Band, Health Auto Export). Mostramos badge "AUTO" como en el mockup.
  const isAutoMetric = metricKey === 'steps' || metricKey === 'sleep' || metricKey === 'sleepDebt'

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="relative rounded-2xl p-5 transition-all group overflow-hidden"
      style={{
        // Glow radial del color del metric en la esquina sup-izq, glass base
        background: `
          radial-gradient(circle at 0% 0%, ${color}1f, transparent 50%),
          rgba(255, 255, 255, 0.025)
        `,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 1px 2px rgba(0,0,0,0.2)',
      }}
    >
      {/* Top row: icon badge coloreado + label + AUTO badge / edit btn */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              background: `${color}22`,
              border: `1px solid ${color}40`,
            }}
          >
            <span style={{ color }}>{icon}</span>
          </div>
          <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-[0.12em]">{label}</span>
        </div>
        {isAutoMetric ? (
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.10] text-zinc-400">
            AUTO
          </span>
        ) : (
          <button
            onClick={startEdit}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-zinc-300"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            type={metricKey === 'wakeTime' ? 'time' : 'text'}
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
            className="w-full bg-white/[0.05] border border-indigo-500/40 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-400"
          />
          <button onMouseDown={(e) => e.preventDefault()} onClick={saveEdit} className="text-indigo-400 hover:text-indigo-300">
            <Check className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div>
          <span className="text-3xl font-bold tracking-tight tabular-nums" style={{ color }}>{displayValue}</span>
          {/* Colored bottom bar — sutil, ocupa todo el ancho */}
          {typeof value === 'number' && metricKey !== 'sleep' && metricKey !== 'sleepDebt' && metricKey !== 'steps' && metricKey !== 'wakeTime' && (
            <div className="mt-3 h-1 bg-white/[0.04] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(value, 100)}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                  boxShadow: `0 0 8px ${color}88`,
                }}
              />
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}
