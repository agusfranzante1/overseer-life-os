'use client'
import { useAppStore } from '@/lib/store/appStore'
import { Sidebar } from './Sidebar'
import { ChatBox } from '@/components/chat/ChatBox'
import { motion } from 'framer-motion'
import { useSupabaseSync } from '@/lib/supabase/sync'

export function AppShell({ children }: { children: React.ReactNode }) {
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const sidebarWidth = sidebarCollapsed ? 64 : 220

  // Background sync to Supabase (no-op if not configured / not logged in)
  useSupabaseSync()

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
