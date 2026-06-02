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
  Network, ChevronUp, ChevronDown, Target,
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
  { href: '/mapas',       icon: Network,         key: 'mindmaps' },
  { href: '/tasks',      icon: CheckSquare,     key: 'tasks' },
  { href: '/calendar',  icon: Calendar,        key: 'calendar' },
  { href: '/money',     icon: WalletCards,     key: 'money' },
  { href: '/trading',   icon: TrendingUp,      key: 'trading' },
  { href: '/health',    icon: HeartPulse,      key: 'health' },
  { href: '/habits',    icon: Activity,        key: 'habits' },
  { href: '/kpis',      icon: Target,          key: 'kpis' },
  { href: '/gym',       icon: Dumbbell,        key: 'gym' },
  { href: '/food',      icon: Utensils,        key: 'food' },
  { href: '/settings',  icon: Cog,             key: 'settings' },
]

const DEFAULT_ORDER = NAV_ITEMS.map((n) => n.key)

export function Sidebar({
  mobileOpen = false,
  onMobileClose,
}: {
  mobileOpen?: boolean
  onMobileClose?: () => void
} = {}) {
  const { sidebarCollapsed, toggleSidebar, language, setLanguage, navOrder, setNavOrder } = useAppStore()
  const { t } = useTranslation()
  const pathname = usePathname()
  const router = useRouter()

  // Detect mobile (<sm). On mobile we IGNORE the collapsed state — when the
  // drawer is open we always want the full sidebar (icons + labels), since
  // a 64px icon-rail in an overlay would feel useless.
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Reordering UI — declared up here (before the touch handlers) so the
  // swipe-to-close handler can suppress itself while we're reordering.
  // Without this, the swipe handler would steal touch events from the nav
  // items and the user couldn't drag them at all on mobile.
  const [editMode, setEditMode] = useState(false)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const draggedRef = useRef<string | null>(null)

  // Swipe-to-close — mobile only. The user can grab the drawer and drag it
  // left to dismiss it (the same way iOS/Android drawers work). While dragging,
  // we translate the drawer in real time so the gesture feels live. On release,
  // if dragged > 70px to the left, the drawer closes. Vertical scroll inside
  // the drawer is preserved (we lock direction on the first significant move).
  //
  // IMPORTANTE: disabled while in edit mode so the reorder gestures on
  // individual nav items don't get swallowed by the drawer swipe.
  const dragStartXRef = useRef<number | null>(null)
  const dragStartYRef = useRef<number | null>(null)
  const dragHorizontalRef = useRef<boolean>(false)
  const [dragX, setDragX] = useState(0)
  const onTouchStart = (e: React.TouchEvent) => {
    if (!isMobile || !mobileOpen || editMode) return
    const t = e.touches[0]
    dragStartXRef.current = t.clientX
    dragStartYRef.current = t.clientY
    dragHorizontalRef.current = false
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartXRef.current === null || dragStartYRef.current === null) return
    const t = e.touches[0]
    const dx = t.clientX - dragStartXRef.current
    const dy = t.clientY - dragStartYRef.current
    if (!dragHorizontalRef.current && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
      // Vertical scroll — disengage horizontal drag.
      dragStartXRef.current = null
      dragStartYRef.current = null
      return
    }
    if (Math.abs(dx) > 8) dragHorizontalRef.current = true
    if (dragHorizontalRef.current) setDragX(Math.min(0, dx))
  }
  const onTouchEnd = () => {
    if (dragX < -70 && onMobileClose) onMobileClose()
    setDragX(0)
    dragStartXRef.current = null
    dragStartYRef.current = null
    dragHorizontalRef.current = false
  }

  const handleLogout = async () => {
    if (!hasSupabaseConfig()) return
    try {
      await getSupabaseBrowser().auth.signOut()
      router.push('/login')
      router.refresh()
    } catch { /* noop */ }
  }

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

  /** Move an item one slot up or down. Used by the tap-arrow buttons —
   *  the touch-friendly alternative to HTML5 drag-and-drop (which doesn't
   *  work on mobile browsers). Snapshots the CURRENT visible order from
   *  `orderedNav` so the move is correct even if the user hasn't fully
   *  customized navOrder yet. */
  const moveItem = (key: string, direction: -1 | 1) => {
    const currentOrder = orderedNav.map((n) => n.key)
    const idx = currentOrder.indexOf(key)
    if (idx === -1) return
    const targetIdx = idx + direction
    if (targetIdx < 0 || targetIdx >= currentOrder.length) return
    const next = [...currentOrder]
    ;[next[idx], next[targetIdx]] = [next[targetIdx], next[idx]]
    setNavOrder(next)
  }

  // ── Width: collapsed = icon rail (64px), expanded = full (220px).
  // On mobile we always render at 260px (full drawer width) regardless
  // of the persisted `sidebarCollapsed` preference.
  const desktopWidth = sidebarCollapsed ? 64 : 220
  const width = isMobile ? 260 : desktopWidth
  // Same idea for the "collapsed UI mode" — only honored on desktop. On
  // mobile, drawer is always full so the user sees icons + labels.
  const showLabels = isMobile || !sidebarCollapsed

  // Auto-close the mobile drawer when a nav link is tapped so it feels
  // like a normal app drawer (open → pick → close).
  const handleNavClick = () => {
    if (isMobile && onMobileClose) onMobileClose()
  }

  return (
    <motion.aside
      animate={{ width }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={dragX !== 0 ? { transform: `translateX(${dragX}px)`, transition: 'none' } : undefined}
      className={`
        flex flex-col h-screen bg-zinc-900 border-r border-zinc-800 shrink-0 overflow-hidden
        fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        sm:relative sm:translate-x-0 sm:z-20
      `}
    >
      {/* Top bar: menu button (collapse on desktop / close drawer on mobile)
          + logo + edit toggle when labels are visible. */}
      <div className={`flex items-center gap-2 ${showLabels ? 'px-3' : 'px-2 justify-center'} py-4 border-b border-zinc-800`}>
        <button
          onClick={() => {
            if (isMobile && onMobileClose) onMobileClose()
            else toggleSidebar()
          }}
          title={isMobile ? 'Cerrar menú' : sidebarCollapsed ? 'Expandir' : 'Colapsar'}
          className="shrink-0 w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
        >
          <Menu className="w-4 h-4" />
        </button>
        {showLabels && (
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
        {editMode && showLabels && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden bg-indigo-500/5 border-b border-indigo-500/20"
          >
            <div className="px-3 py-2 space-y-1.5">
              <p className="text-[10px] text-indigo-300 leading-snug">
                <ChevronUp className="w-2.5 h-2.5 inline" /><ChevronDown className="w-2.5 h-2.5 inline -ml-0.5" /> Tocá las flechas para mover · drag opcional en desktop
              </p>
              <button
                onClick={() => { setNavOrder([]) }}
                className="w-full flex items-center justify-center gap-1.5 text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-700 text-zinc-300 transition-colors"
              >
                <RotateCcw className="w-2.5 h-2.5" /> Restaurar orden
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 overflow-y-auto px-2">
        {orderedNav.map(({ href, icon: Icon, key }, idx) => {
          const active = pathname === href || (href === '/dashboard' && pathname === '/')
          const isDragging = dragKey === key
          const isOver = overKey === key && dragKey !== key
          const isFirst = idx === 0
          const isLast = idx === orderedNav.length - 1

          // Edit mode (only when labels are visible): render as draggable div
          // PLUS up/down arrow buttons. HTML5 drag-and-drop ONLY works on
          // desktop (browsers don't fire it on touch screens), so the arrow
          // buttons are the canonical reorder mechanism on mobile. Drag is
          // a desktop-only bonus.
          if (editMode && showLabels) {
            return (
              <div
                key={href}
                draggable
                onDragStart={onDragStart(key)}
                onDragOver={onDragOver(key)}
                onDragLeave={() => setOverKey((k) => k === key ? null : k)}
                onDrop={onDrop(key)}
                onDragEnd={resetDrag}
                className={`flex items-center gap-2 px-2 py-2 rounded-lg border transition-all ${
                  isDragging
                    ? 'opacity-40 scale-95 border-indigo-500/50 bg-zinc-800'
                    : isOver
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700'
                }`}
                style={{ cursor: 'grab' }}
              >
                <GripVertical className="w-3 h-3 text-zinc-600 shrink-0" />
                <Icon className="w-4 h-4 shrink-0 text-zinc-400" />
                <span className="text-sm font-medium whitespace-nowrap text-zinc-300 flex-1 truncate">
                  {t(`nav.${key}`)}
                </span>
                {/* Tap arrows — touch-friendly reorder. preventDefault on
                    pointerdown so the row's draggable behavior doesn't grab
                    the touch first. */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    type="button"
                    disabled={isFirst}
                    onClick={(e) => { e.stopPropagation(); moveItem(key, -1) }}
                    onPointerDown={(e) => e.stopPropagation()}
                    title="Subir"
                    className="w-5 h-3.5 rounded flex items-center justify-center text-zinc-500 hover:text-indigo-300 hover:bg-zinc-800 active:bg-zinc-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={isLast}
                    onClick={(e) => { e.stopPropagation(); moveItem(key, 1) }}
                    onPointerDown={(e) => e.stopPropagation()}
                    title="Bajar"
                    className="w-5 h-3.5 rounded flex items-center justify-center text-zinc-500 hover:text-indigo-300 hover:bg-zinc-800 active:bg-zinc-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )
          }

          // Normal: <Link>. Icon-only with tooltip when labels hidden, icon
          // + label otherwise. On mobile, tapping also closes the drawer.
          //
          // `active:` styles + `whileTap` scale combo gives the user IMMEDIATE
          // tactile feedback (within 1 frame) — important on mobile where the
          // navigation itself can take a beat to render and the user otherwise
          // wonders if their tap registered.
          return (
            <Link
              key={href}
              href={href}
              title={!showLabels ? t(`nav.${key}`) : undefined}
              onClick={handleNavClick}
            >
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                className={`flex items-center gap-3 ${showLabels ? 'px-3' : 'justify-center px-2'} py-2.5 rounded-lg cursor-pointer transition-colors select-none ${
                  active
                    ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 active:bg-indigo-600/40'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 active:bg-indigo-500/20 active:text-indigo-200'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {showLabels && (
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
        <TimezoneButton collapsed={!showLabels} />

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={toggleLang}
          title={!showLabels ? (language === 'en' ? 'English' : 'Español') : undefined}
          className={`w-full flex items-center gap-3 ${showLabels ? 'px-3' : 'justify-center px-2'} py-2.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors`}
        >
          <Globe className="w-4 h-4 shrink-0" />
          {showLabels && (
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
            title={!showLabels ? 'Cerrar sesión' : undefined}
            className={`w-full flex items-center gap-3 ${showLabels ? 'px-3' : 'justify-center px-2'} py-2.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {showLabels && (
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
