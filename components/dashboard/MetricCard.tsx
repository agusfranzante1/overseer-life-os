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

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="relative bg-zinc-900 rounded-xl p-4 border border-zinc-800 hover:border-zinc-700 transition-colors group"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span style={{ color }}>{icon}</span>
          <span className="text-xs text-zinc-400 font-medium uppercase tracking-wider">{label}</span>
        </div>
        <button
          onClick={startEdit}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-zinc-300"
        >
          <Pencil className="w-3 h-3" />
        </button>
      </div>

      {editing ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
            className="w-full bg-zinc-800 border border-indigo-500 rounded px-2 py-1 text-sm text-white focus:outline-none"
          />
          <button onClick={saveEdit} className="text-indigo-400 hover:text-indigo-300">
            <Check className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="mt-1">
          <span className="text-2xl font-bold text-white" style={{ color }}>{displayValue}</span>
          {typeof value === 'number' && metricKey !== 'sleep' && metricKey !== 'sleepDebt' && metricKey !== 'steps' && metricKey !== 'wakeTime' && (
            <div className="mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(value, 100)}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{ backgroundColor: color }}
              />
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}
