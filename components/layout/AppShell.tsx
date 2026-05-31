'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { Menu, AlertTriangle, X as XIcon } from 'lucide-react'
import { useAppStore } from '@/lib/store/appStore'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useWalletStore } from '@/lib/store/walletStore'
import { Sidebar } from './Sidebar'
import { TitleUpdater } from './TitleUpdater'
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
  const processRecurringExpenses = useWalletStore((s) => s.processRecurringExpenses)
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

  // Process recurring wallet expenses (suscripciones / pagos recurrentes).
  // Same pattern as task auto-purge: run on mount + 10s delayed (post-Supabase
  // pull) + every 30 min as safety net. Idempotent — never double-charges
  // thanks to `lastAppliedYearMonth` guard in the store.
  useEffect(() => {
    processRecurringExpenses()
    const delayed = setTimeout(() => processRecurringExpenses(), 10_000)
    const interval = setInterval(() => processRecurringExpenses(), 30 * 60_000)
    return () => { clearTimeout(delayed); clearInterval(interval) }
  }, [processRecurringExpenses])

  const isAuthPage = AUTH_PATHS.some((p) => pathname?.startsWith(p))

  // Mobile drawer state — on phones (<sm) the sidebar is hidden by default
  // and slides in as an overlay when the user taps the top hamburger. On
  // tablet/desktop (≥sm) the sidebar lives inline as before.
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  // Auto-close the drawer when the route changes — feels natural since the
  // user just navigated. Also defensive against the drawer staying open
  // across pages.
  useEffect(() => { setMobileNavOpen(false) }, [pathname])

  // Navigation loading bar — gives the user immediate feedback when they
  // tap a link. Previously, mobile felt "frozen" between tap and the new
  // page rendering because Next streams + RSC can take a beat on slow
  // connections. A thin colored bar at the top removes that uncertainty.
  //
  // Strategy: listen to clicks on any internal <a href="..."> at document
  // level; mark loading. When pathname changes → mark done. Auto-clear
  // after 4s as a safety net (in case navigation was prevented by some
  // handler and we never get a pathname change).
  const [navLoading, setNavLoading] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (e: MouseEvent) => {
      // Don't trigger on cmd/ctrl/shift click (new tab/window).
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      const target = (e.target as HTMLElement | null)?.closest('a[href]') as HTMLAnchorElement | null
      if (!target) return
      const href = target.getAttribute('href') ?? ''
      // Skip external, anchor, and special protocols.
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      // Skip if it's the same page (avoid showing loader for no-op nav).
      try {
        const url = new URL(href, window.location.origin)
        if (url.pathname === window.location.pathname) return
      } catch { /* ignore */ }
      setNavLoading(true)
    }
    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [])
  useEffect(() => {
    // Pathname changed → nav completed. Brief delay so the bar shows
    // "fill" before fading out.
    if (!navLoading) return
    const id = setTimeout(() => setNavLoading(false), 200)
    return () => clearTimeout(id)
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Safety net: if pathname never changes (e.g. a blocked nav), clear
    // after 4s so the bar doesn't get stuck forever.
    if (!navLoading) return
    const id = setTimeout(() => setNavLoading(false), 4000)
    return () => clearTimeout(id)
  }, [navLoading])

  // Sync-error toast — listens to the global 'overseer-sync-error' event
  // that lib/supabase/sync.ts and the Google Calendar store fire when
  // something goes wrong. Without this, sync failures were invisible to
  // the user (only logged to devtools).
  //
  // Optional `action` adds a CTA button (used for "Reconectar" when
  // Google's refresh token died).
  const [syncError, setSyncError] = useState<{ message: string; action?: { label: string; href: string } } | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string; action?: { label: string; href: string } }>).detail
      if (detail?.message) setSyncError({ message: detail.message, action: detail.action })
    }
    window.addEventListener('overseer-sync-error', handler)
    return () => window.removeEventListener('overseer-sync-error', handler)
  }, [])

  if (isAuthPage) return <>{children}</>

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      {/* Updates document.title to "OVERSEER · {section}" on every route
          change so the browser tab shows where the user is. Renders no DOM. */}
      <TitleUpdater />

      {/* Top navigation progress bar — fires the moment a link is tapped
          and finishes when the new pathname renders. Lives above everything
          else so it's always visible. */}
      <AnimatePresence>
        {navLoading && (
          <motion.div
            initial={{ width: '0%', opacity: 1 }}
            animate={{ width: '70%', opacity: 1 }}
            exit={{ width: '100%', opacity: 0 }}
            transition={{ width: { duration: 0.8, ease: 'easeOut' }, opacity: { duration: 0.2 } }}
            className="fixed top-0 left-0 z-[100] h-0.5 bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.7)]"
          />
        )}
      </AnimatePresence>

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

        {/* ChatBox is only rendered on /gym. The `pb-20` reserves the
            ~80px the ChatBox occupies at the bottom of the viewport — but
            only on routes that ACTUALLY render the ChatBox. Without this
            conditional, every other route shows an empty black band at
            the bottom (where the ChatBox would have been). That dead band
            was the cause of the "Calendar y Tasks no llegan al borde". */}
        {(() => {
          const showChatBox = !!pathname?.startsWith('/gym')
          return (
            <>
              <div className={`flex-1 overflow-y-auto ${showChatBox ? 'pb-20' : ''}`}>
                {children}
              </div>
              {showChatBox && <ChatBox />}
            </>
          )
        })()}

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
                <p className="text-xs text-red-300/90 leading-relaxed break-words">{syncError.message}</p>
                {syncError.action && (
                  <a
                    href={syncError.action.href}
                    className="inline-block mt-2 px-3 py-1.5 bg-red-500/20 border border-red-500/50 hover:bg-red-500/30 text-red-100 rounded-lg text-xs font-bold transition-colors"
                  >
                    {syncError.action.label} →
                  </a>
                )}
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
