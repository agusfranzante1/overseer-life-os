'use client'
import { motion } from 'framer-motion'
import { useAppStore } from '@/lib/store/appStore'
import { useTranslation } from '@/hooks/useTranslation'
import { DAY_TYPE_CONFIG } from '@/lib/utils/constants'
import { DayType } from '@/types'
import { Brain, Briefcase, Heart, Dumbbell, TrendingUp, Camera } from 'lucide-react'

const ICONS: Record<DayType, React.ReactNode> = {
  deep_work: <Brain className="w-3.5 h-3.5" />,
  admin: <Briefcase className="w-3.5 h-3.5" />,
  recovery: <Heart className="w-3.5 h-3.5" />,
  legs_day: <Dumbbell className="w-3.5 h-3.5" />,
  trading: <TrendingUp className="w-3.5 h-3.5" />,
  content: <Camera className="w-3.5 h-3.5" />,
}

const DAY_TYPES: DayType[] = ['deep_work', 'admin', 'recovery', 'legs_day', 'trading', 'content']

export function DayTypeSelector() {
  const { dayType, setDayType } = useAppStore()
  const { t } = useTranslation()

  return (
    <div>
      <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider font-semibold">
        {t('dashboard.dayType')}
      </p>
      <div className="flex flex-wrap gap-2">
        {DAY_TYPES.map((type) => {
          const config = DAY_TYPE_CONFIG[type]
          const active = dayType === type
          return (
            <motion.button
              key={type}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setDayType(active ? null : type)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                active
                  ? 'text-white border-current'
                  : 'text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-zinc-200'
              }`}
              style={active ? {
                backgroundColor: config.color + '20',
                borderColor: config.color,
                color: config.color,
              } : {}}
            >
              <span style={{ color: active ? config.color : undefined }}>{ICONS[type]}</span>
              {t(`dayTypes.${type}`)}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
