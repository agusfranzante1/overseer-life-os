'use client'
import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts'
import { useAppStore } from '@/lib/store/appStore'
import { useTranslation } from '@/hooks/useTranslation'

export function CircularScore() {
  const { metrics, dayType } = useAppStore()
  const { t } = useTranslation()

  const overallScore = Math.round((metrics.focus + metrics.energy + (100 - metrics.stress)) / 3)

  const data = [
    { name: t('metrics.focus'), value: metrics.focus, fill: '#6366f1' },
    { name: t('metrics.energy'), value: metrics.energy, fill: '#f59e0b' },
    { name: 'Calm', value: 100 - metrics.stress, fill: '#10b981' },
  ]

  const scoreColor = overallScore >= 70 ? '#10b981' : overallScore >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative">
        <RadialBarChart
          width={180}
          height={180}
          innerRadius={40}
          outerRadius={80}
          data={data}
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            dataKey="value"
            cornerRadius={4}
            background={{ fill: '#27272a' }}
          />
        </RadialBarChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black" style={{ color: scoreColor }}>
            {overallScore}
          </span>
          <span className="text-xs text-zinc-500">{t('dashboard.score')}</span>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2 w-full px-1">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1 min-w-0">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
            <span className="text-[11px] text-zinc-400 truncate">{d.name}</span>
            <span className="text-[11px] font-semibold text-zinc-300 shrink-0">{d.value}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
