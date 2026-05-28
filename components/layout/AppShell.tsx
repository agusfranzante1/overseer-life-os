'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { Menu, AlertTriangle, X as XIcon } from 'lucide-react'
import { useAppStore } from '@/lib/store/appStore'
import { useTasksStore } from '@/lib/store/tasksStore'
import { Sidebar } from './Sidebar'
import { ChatBox } from '@/components/chat/ChatBox'
import { motion, AnimatePresence } from 'framer-motion'
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

  // Mobile drawer state — on phones (<sm) the sidebar is hidden by default
  // and slides in as an overlay when the user taps the top hamburger. On
  // tablet/desktop (≥sm) the sidebar lives inline as before.
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  // Auto-close the drawer when the route changes — feels natural since the
  // user just navigated. Also defensive against the drawer staying open
  // across pages.
  useEffect(() => { setMobileNavOpen(false) }, [pathname])

  // Sync-error toast — listens to the global 'overseer-sync-error' event
  // that lib/supabase/sync.ts fires when a push fails. Without this, sync
  // failures were invisible to the user (only logged to devtools).
  const [syncError, setSyncError] = useState<string | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string }>).detail
      if (detail?.message) setSyncError(detail.message)
    }
    window.addEventListener('overseer-sync-error', handler)
    return () => window.removeEventListener('overseer-sync-error', handler)
  }, [])

  if (isAuthPage) return <>{children}</>

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      <Sidebar
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      {/* Mobile backdrop — only when drawer is open, dismisses on tap. */}
      <AnimatePresence>
        {mobileNavOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileNavOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm sm:hidden"
          />
        )}
      </AnimatePresence>

      <motion.main
        animate={{ marginLeft: 0 }}
        className="flex-1 flex flex-col overflow-hidden min-w-0"
        style={{
          '--sidebar-width': `${sidebarWidth}px`,
        } as React.CSSProperties}
      >
        {/* Mobile top bar — visible only <sm. Holds the hamburger so the
            user can reach the sidebar without it eating screen estate. */}
        <div className="sm:hidden sticky top-0 z-30 flex items-center gap-3 px-3 py-2.5 bg-zinc-900/95 backdrop-blur border-b border-zinc-800">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="w-9 h-9 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-700 flex items-center justify-center text-zinc-300 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu className="w-4 h-4" />
          </button>
          <Image src="/logo.png" alt="Overseer" width={26} height={26} className="rounded-md" />
          <span className="font-bold text-white text-sm tracking-wider uppercase">Overseer</span>
        </div>

        <div className="flex-1 overflow-y-auto pb-20">
          {children}
        </div>
        <ChatBox />

        {/* Sync error toast — sticky bottom-right, only when sync push fails.
            Click X to dismiss. Tells the user EXACTLY what to do (most common
            cause is a missing Supabase migration). */}
        <AnimatePresence>
          {syncError && (
            <motion.div
              initial={{ opacity: 0, y: 20, x: 20 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-4 right-4 z-50 max-w-md bg-red-950/95 backdrop-blur border-2 border-red-500/50 rounded-xl shadow-2xl p-4 flex items-start gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-200 mb-1">Sync error</p>
                <p className="text-xs text-red-300/90 leading-relaxed break-words">{syncError}</p>
              </div>
              <button onClick={() => setSyncError(null)}
                className="text-red-400 hover:text-red-200 transition-colors shrink-0">
                <XIcon className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.main>
    </div>
  )
}
