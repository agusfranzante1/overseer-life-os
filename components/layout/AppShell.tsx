'use client'
import { usePathname } from 'next/navigation'
import { useAppStore } from '@/lib/store/appStore'
import { Sidebar } from './Sidebar'
import { ChatBox } from '@/components/chat/ChatBox'
import { motion } from 'framer-motion'
import { useSupabaseSync } from '@/lib/supabase/sync'

const AUTH_PATHS = ['/login', '/signup']

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const sidebarWidth = sidebarCollapsed ? 64 : 220

  useSupabaseSync()

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
