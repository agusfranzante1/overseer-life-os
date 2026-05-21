'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useAppStore } from '@/lib/store/appStore'
import { useTasksStore } from '@/lib/store/tasksStore'
import { Sidebar } from './Sidebar'
import { ChatBox } from '@/components/chat/ChatBox'
import { motion } from 'framer-motion'
import { useSupabaseSync } from '@/lib/supabase/sync'
import { todayKeyInTz } from '@/lib/utils/dateInTz'

const AUTH_PATHS = ['/login', '/signup']

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const timezone = useAppStore((s) => s.timezone)
  const autoPurgeCompletedTasks = useAppStore((s) => s.autoPurgeCompletedTasks)
  const archiveCompletedBefore = useTasksStore((s) => s.archiveCompletedBefore)
  const sidebarWidth = sidebarCollapsed ? 64 : 220

  useSupabaseSync()

  // Auto-purge completed tasks once per app load, then again whenever the user
  // crosses a day boundary in their selected TZ (set a timeout for next
  // midnight in that TZ).
  useEffect(() => {
    if (!autoPurgeCompletedTasks) return

    const runPurge = () => {
      const todayKey = todayKeyInTz(timezone)
      archiveCompletedBefore(todayKey, timezone)
    }

    runPurge()

    // Compute ms until the next midnight in the user's TZ. We probe minute
    // by minute (cheap) up to 26h and find when the date key changes — that's
    // the next day boundary in this TZ.
    const msUntilNextMidnight = () => {
      const now = new Date()
      const todayKey = todayKeyInTz(timezone)
      const probeKey = (when: Date) => {
        try {
          return new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
          }).format(when)
        } catch { return todayKey }
      }
      for (let mins = 1; mins <= 26 * 60; mins++) {
        const probe = new Date(now.getTime() + mins * 60_000)
        if (probeKey(probe) !== todayKey) {
          return mins * 60_000 + 5_000 // +5s buffer to land safely on new day
        }
      }
      return 60 * 60_000 // fallback: 1h
    }

    const timer = setTimeout(runPurge, msUntilNextMidnight())
    return () => clearTimeout(timer)
  }, [timezone, autoPurgeCompletedTasks, archiveCompletedBefore])

  const isAuthPage = AUTH_PATHS.some((p) => pathname?.startsWith(p))

  if (isAuthPage) return <>{children}</>

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      <Sidebar />
      <motion.main
        animate={{ marginLeft: 0 }}
        className="flex-1 flex flex-col overflow-hidden"
        style={{
          '--sidebar-width': `${sidebarWidth}px`,
        } as React.CSSProperties}
      >
        <div className="flex-1 overflow-y-auto pb-20">
          {children}
        </div>
        <ChatBox />
      </motion.main>
    </div>
  )
}
