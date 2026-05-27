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

  // Auto-purge completed tasks. Three triggers, layered for robustness:
  //   1. On mount (immediately) — covers most refreshes/visits
  //   2. Delayed re-run 10s later — catches tasks hydrated FROM Supabase
  //      after the initial mount (the sync is async; if we only purge
  //      at t=0 we'd miss anything not yet pulled from cloud)
  //   3. Recursive midnight scheduler — re-arms itself each day so the
  //      purge keeps happening even if the user never refreshes
  //   4. Periodic safety net every 30min for the same reason
  useEffect(() => {
    if (!autoPurgeCompletedTasks) return

    const runPurge = () => {
      const todayKey = todayKeyInTz(timezone)
      archiveCompletedBefore(todayKey, timezone)
    }

    // Trigger #1 — immediately on mount.
    runPurge()

    // Trigger #2 — re-run 10s later to catch tasks pulled from Supabase
    // AFTER the initial mount. Without this, the initial purge runs against
    // a still-empty store and silently does nothing.
    const lateStartTimer = setTimeout(runPurge, 10_000)

    // Trigger #3 — recursive midnight scheduler.
    // Computes ms until the next day boundary in the user's TZ, fires
    // runPurge there, and re-arms for the FOLLOWING night. Previously this
    // was a one-shot setTimeout — tasks completed multiple nights ago in a
    // long-lived tab would never get archived.
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

    let midnightTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleNextMidnight = () => {
      midnightTimer = setTimeout(() => {
        runPurge()
        scheduleNextMidnight()  // re-arm for tomorrow
      }, msUntilNextMidnight())
    }
    scheduleNextMidnight()

    // Trigger #4 — safety net every 30min. Catches edge cases where the
    // tab was backgrounded across midnight (browsers throttle setTimeout
    // when tabs are inactive) or the user toggled offline/online.
    const safetyInterval = setInterval(runPurge, 30 * 60_000)

    return () => {
      clearTimeout(lateStartTimer)
      if (midnightTimer) clearTimeout(midnightTimer)
      clearInterval(safetyInterval)
    }
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
