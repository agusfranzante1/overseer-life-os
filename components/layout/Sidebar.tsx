'use client'
import { useState, useRef, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '@/lib/store/appStore'
import { useTranslation } from '@/hooks/useTranslation'
import {
  LayoutDashboard, Calendar, CheckSquare,
  Globe, WalletCards, Activity, Dumbbell, Utensils, HeartPulse, Menu,
  TrendingUp, GripVertical, Check, RotateCcw, Settings2, Cog, LogOut,
  Clock, Search, X as XIcon, Infinity as InfinityIcon, Telescope, FlaskConical,
} from 'lucide-react'
import { listTimezones, formatTzOffset, detectTimezone } from '@/lib/utils/dateInTz'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { hasSupabaseConfig, getSupabaseBrowser } from '@/lib/supabase/client'

interface NavItem {
  href: string
  icon: typeof LayoutDashboard
  key: string
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',  icon: LayoutDashboard, key: 'dashboard' },
  // SPI ahora es UNA sola entrada — la pestaña de proyección contiene
  // adentro las 4 vistas (anual / trimestral / mensual / semanal).
  // El route /spi sigue vivo para backward-compat pero no aparece en el sidebar.
  { href: '/proyeccion', icon: InfinityIcon,    key: 'spi' },
  { href: '/laboratorio', icon: FlaskConical,    key: 'lab' },
  { href: '/tasks',      icon: CheckSquare,     key: 'tasks' },
  { href: '/calendar',  icon: Calendar,        key: 'calendar' },
  { href: '/money',     icon: WalletCards,     key: 'money' },
  { href: '/trading',   icon: TrendingUp,      key: 'trading' },
  { href: '/health',    icon: HeartPulse,      key: 'health' },
  { href: '/habits',    icon: Activity,        key: 'habits' },
  { href: '/gym',       icon: Dumbbell,        key: 'gym' },
  { href: '/food',      icon: Utensils,        key: 'food' },
  { href: '/settings',  icon: Cog,             key: 'settings' },
]

const DEFAULT_ORDER = NAV_ITEMS.map((n) => n.key)

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, language, setLanguage, navOrder, setNavOrder } = useAppStore()
  const { t } = useTranslation()
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    if (!hasSupabaseConfig()) return
    try {
      await getSupabaseBrowser().auth.signOut()
      router.push('/login')
      router.refresh()
    } catch { /* noop */ }
  }

  const [editMode, setEditMode] = useState(false)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const draggedRef = useRef<string | null>(null)

  const toggleLang = () => setLanguage(language === 'en' ? 'es' : 'en')

  const orderedNav = useMemo(() => {
    const knownByKey = new Map(NAV_ITEMS.map((n) => [n.key, n]))
    const userOrder = navOrder && navOrder.length > 0 ? navOrder : DEFAULT_ORDER
    const seen = new Set<string>()
    const result: NavItem[] = []
    for (const key of userOrder) {
      const item = knownByKey.get(key)
      if (item && !seen.has(key)) {
        result.push(item)
        seen.add(key)
      }
    }
    for (const item of NAV_ITEMS) {
      if (!seen.has(item.key)) result.push(item)
    }
    return result
  }, [navOrder])

  // ── DnD handlers (only active in edit mode AND expanded) ──
  const onDragStart = (key: string) => (e: React.DragEvent) => {
    draggedRef.current = key
    setDragKey(key)
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', key) } catch { /* noop */ }
  }
  const onDragOver = (key: string) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (overKey !== key) setOverKey(key)
  }
  const onDrop = (targetKey: string) => (e: React.DragEvent) => {
    e.preventDefault()
    const src = draggedRef.current
    if (!src || src === targetKey) { resetDrag(); return }
    const currentOrder = orderedNav.map((n) => n.key)
    const next = currentOrder.filter((k) => k !== src)
    const idx = next.indexOf(targetKey)
    next.splice(idx, 0, src)
    setNavOrder(next)
    resetDrag()
  }
  const resetDrag = () => {
    draggedRef.current = null
    setDragKey(null)
    setOverKey(null)
  }

  // ── Width: collapsed = icon rail (64px), expanded = full (220px) ──
  const width = sidebarCollapsed ? 64 : 220

  return (
    <motion.aside
      animate={{ width }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="relative flex flex-col h-screen bg-zinc-900 border-r border-zinc-800 shrink-0 z-20 overflow-hidden"
    >
      {/* Top bar: collapse button + logo (+ edit toggle when expanded) */}
      <div className={`flex items-center gap-2 ${sidebarCollapsed ? 'px-2 justify-center' : 'px-3'} py-4 border-b border-zinc-800`}>
        <button
          onClick={toggleSidebar}
          title={sidebarCollapsed ? 'Expandir' : 'Colapsar'}
          className="shrink-0 w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
        >
          <Menu className="w-4 h-4" />
        </button>
        {!sidebarCollapsed && (
          <>
            <Image src="/logo.png" alt="Overseer" width={32} height={32} className="shrink-0 rounded-lg" />
            <span className="font-bold text-white text-sm tracking-wider uppercase whitespace-nowrap flex-1 truncate">
              Overseer
            </span>
            <button
              onClick={() => setEditMode((v) => !v)}
              title={editMode ? 'Salir del modo edición' : 'Reordenar menú'}
              className={`p-1 rounded transition-colors ${
                editMode ? 'text-indigo-400' : 'text-zinc-600 hover:text-zinc-300'
              }`}
            >
              {editMode ? <Check className="w-3.5 h-3.5" /> : <Settings2 className="w-3.5 h-3.5" />}
            </button>
          </>
        )}
      </div>

      {/* Edit-mode toolbar (only when expanded) */}
      <AnimatePresence>
        {editMode && !sidebarCollapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden bg-indigo-500/5 border-b border-indigo-500/20"
          >
            <div className="px-3 py-2 space-y-1.5">
              <p className="text-[10px] text-indigo-300 leading-snug">
                <GripVertical className="w-2.5 h-2.5 inline" /> Arrastrá para reordenar
              </p>
              <button
                onClick={() => { setNavOrder([]) }}
                className="w-full flex items-center justify-center gap-1.5 text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
              >
                <RotateCcw className="w-2.5 h-2.5" /> Restaurar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Nav */}
      <nav className={`flex-1 py-4 space-y-1 overflow-y-auto ${sidebarCollapsed ? 'px-2' : 'px-2'}`}>
        {orderedNav.map(({ href, icon: Icon, key }) => {
          const active = pathname === href || (href === '/dashboard' && pathname === '/')
          const isDragging = dragKey === key
          const isOver = overKey === key && dragKey !== key

          // Edit mode (only when expanded): render as draggable div
          if (editMode && !sidebarCollapsed) {
            return (
              <div
                key={href}
                draggable
                onDragStart={onDragStart(key)}
                onDragOver={onDragOver(key)}
                onDragLeave={() => setOverKey((k) => k === key ? null : k)}
                onDrop={onDrop(key)}
                onDragEnd={resetDrag}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all ${
                  isDragging
                    ? 'opacity-40 scale-95 border-indigo-500/50 bg-zinc-800'
                    : isOver
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700'
                }`}
                style={{ cursor: 'grab' }}
              >
                <GripVertical className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                <Icon className="w-4 h-4 shrink-0 text-zinc-400" />
                <span className="text-sm font-medium whitespace-nowrap text-zinc-300 flex-1">
                  {t(`nav.${key}`)}
                </span>
              </div>
            )
          }

          // Normal: <Link>. Collapsed → icon only with tooltip. Expanded → icon + label.
          return (
            <Link key={href} href={href} title={sidebarCollapsed ? t(`nav.${key}`) : undefined}>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-lg cursor-pointer transition-colors ${
                  active
                    ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!sidebarCollapsed && (
                  <span className="text-sm font-medium whitespace-nowrap">
                    {t(`nav.${key}`)}
                  </span>
                )}
              </motion.div>
            </Link>
          )
        })}
      </nav>

      {/* Bottom actions — timezone + language toggle + logout */}
      <div className="border-t border-zinc-800 p-2 space-y-1">
        <TimezoneButton collapsed={sidebarCollapsed} />

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={toggleLang}
          title={sidebarCollapsed ? (language === 'en' ? 'English' : 'Español') : undefined}
          className={`w-full flex items-center gap-3 ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors`}
        >
          <Globe className="w-4 h-4 shrink-0" />
          {!sidebarCollapsed && (
            <span className="text-sm font-medium whitespace-nowrap">
              {language === 'en' ? '🇬🇧 English' : '🇦🇷 Español'}
            </span>
          )}
        </motion.button>

        {hasSupabaseConfig() && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleLogout}
            title={sidebarCollapsed ? 'Cerrar sesión' : undefined}
            className={`w-full flex items-center gap-3 ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && (
              <span className="text-sm font-medium whitespace-nowrap">Cerrar sesión</span>
            )}
          </motion.button>
        )}
      </div>
    </motion.aside>
  )
}

// ─── Timezone Button — popover with searchable list + auto-purge toggle ───────

function TimezoneButton({ collapsed }: { collapsed: boolean }) {
  const timezone = useAppStore((s) => s.timezone)
  const setTimezone = useAppStore((s) => s.setTimezone)
  const autoPurge = useAppStore((s) => s.autoPurgeCompletedTasks)
  const setAutoPurge = useAppStore((s) => s.setAutoPurgeCompletedTasks)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const allTzs = useMemo(() => listTimezones(), [])
  const filtered = useMemo(() => {
    if (!query.trim()) return allTzs.slice(0, 60)
    const q = query.toLowerCase()
    return allTzs.filter((tz) => tz.toLowerCase().includes(q)).slice(0, 60)
  }, [allTzs, query])

  const offset = formatTzOffset(timezone)
  // Show just the city portion for the button label
  const shortLabel = timezone.split('/').slice(-1)[0]?.replace(/_/g, ' ') ?? timezone

  return (
    <div className="relative" ref={ref}>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setOpen((v) => !v)}
        title={collapsed ? `${timezone} (${offset})` : undefined}
        className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors`}
      >
        <Clock className="w-4 h-4 shrink-0" />
        {!collapsed && (
          <span className="text-sm font-medium whitespace-nowrap flex items-center gap-2 min-w-0 flex-1 text-left">
            <span className="truncate">{shortLabel}</span>
            <span className="text-[10px] font-mono text-zinc-500 shrink-0">{offset}</span>
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-full mb-2 left-0 right-0 z-30 w-72 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl"
            style={{ maxHeight: '60vh' }}
          >
            <div className="p-3 border-b border-zinc-800">
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2">Zona horaria</p>
              <p className="text-xs text-zinc-300 mb-3">
                {timezone}
                <span className="ml-2 text-[10px] font-mono text-zinc-500">{offset}</span>
              </p>
              <button
                onClick={() => setTimezone(detectTimezone())}
                className="w-full text-[11px] text-left px-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
              >
                Usar la del dispositivo ({detectTimezone()})
              </button>
            </div>

            <div className="p-2 border-b border-zinc-800">
              <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1">
                <Search className="w-3.5 h-3.5 text-zinc-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar zona horaria..."
                  className="flex-1 bg-transparent text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="text-zinc-500 hover:text-zinc-300">
                    <XIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: '30vh' }}>
              {filtered.map((tz) => (
                <button
                  key={tz}
                  onClick={() => { setTimezone(tz); setOpen(false) }}
                  className={`w-full flex items-center justify-between text-left px-3 py-1.5 text-xs transition-colors ${
                    tz === timezone ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span className="truncate">{tz}</span>
                  <span className="text-[10px] font-mono text-zinc-500 shrink-0 ml-2">{formatTzOffset(tz)}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-xs text-zinc-600 text-center py-4">Sin resultados</p>
              )}
            </div>

            <div className="p-3 border-t border-zinc-800 flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-300">Auto-archivar completadas</p>
                <p className="text-[10px] text-zinc-500 leading-tight">Al día siguiente las pasa a la papelera (no las borra)</p>
              </div>
              <button
                onClick={() => setAutoPurge(!autoPurge)}
                className={`shrink-0 w-10 h-5 rounded-full transition-colors relative ${
                  autoPurge ? 'bg-emerald-500' : 'bg-zinc-700'
                }`}
                title={autoPurge ? 'Apagar auto-archivar' : 'Encender auto-archivar'}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  autoPurge ? 'translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
