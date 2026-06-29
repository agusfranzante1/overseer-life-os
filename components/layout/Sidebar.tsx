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
  Network, ChevronUp, ChevronDown, ChevronRight, Target, GraduationCap, Sparkles,
  Sun, Moon,
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
  { href: '/estudio',   icon: GraduationCap,   key: 'estudio' },
  { href: '/contenido', icon: Sparkles,        key: 'contenido' },
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
  const { sidebarCollapsed, toggleSidebar, language, setLanguage, navOrder, setNavOrder, theme, toggleTheme } = useAppStore()
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

  // Footer colapsable — agrupa modo claro / idioma / timezone / sync / cerrar
  // sesión detrás de un botón "Opciones" para no ocupar tanto espacio. Recuerda
  // la preferencia en localStorage. Default: colapsado. Se lee en un effect
  // (no en el init) para no romper la hidratación SSR de Next.
  const [footerOpen, setFooterOpenState] = useState(false)
  useEffect(() => {
    try { setFooterOpenState(localStorage.getItem('overseer-sidebar-footer-open') === '1') } catch { /* noop */ }
  }, [])
  const setFooterOpen = (v: boolean) => {
    setFooterOpenState(v)
    try { localStorage.setItem('overseer-sidebar-footer-open', v ? '1' : '0') } catch { /* noop */ }
  }

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
      style={{
        ...(dragX !== 0 ? { transform: `translateX(${dragX}px)`, transition: 'none' } : {}),
        // Mismo color base que el body — el sidebar NO tiene borde ni
        // overlay. Se mezcla con el resto (como en el mockup del user).
        // El padding lateral del main content define la separación
        // visual, no un divisor. Flipea con el tema vía --app-bg.
        background: 'var(--app-bg)',
      }}
      className={`
        flex flex-col h-screen shrink-0 overflow-hidden
        fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        sm:relative sm:translate-x-0 sm:z-20
      `}
    >
      {/* Top bar: menu button (collapse on desktop / close drawer on mobile)
          + logo + edit toggle when labels are visible. */}
      {/* Logo header — limpio como el mockup: logo + "OVERSEER" + icono
          settings a la derecha. NO hay botón hamburguesa en desktop.
          En mobile se sigue mostrando para poder cerrar el drawer. */}
      <div className={`flex items-center gap-2.5 ${showLabels ? 'px-4' : 'px-2 justify-center'} py-5`}>
        {/* Hamburger SOLO en mobile para cerrar el drawer */}
        {isMobile && (
          <button
            onClick={() => onMobileClose && onMobileClose()}
            title="Cerrar menú"
            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
        <motion.button
          whileHover={{ scale: 1.06, rotate: -5 }}
          whileTap={{ scale: 0.94, rotate: 5 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          onClick={() => !isMobile && toggleSidebar()}
          title={!isMobile ? (sidebarCollapsed ? 'Expandir' : 'Colapsar') : undefined}
          className="shrink-0 flex items-center justify-center cursor-pointer relative"
        >
          {/* Glow violeta detrás del logo — pulse muy sutil */}
          <motion.span
            className="absolute inset-0 rounded-lg"
            animate={{ opacity: [0.3, 0.55, 0.3] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              background: 'radial-gradient(circle, rgba(139, 92, 246, 0.35), transparent 65%)',
              filter: 'blur(8px)',
            }}
          />
          <Image src="/eye-v3.png" alt="Overseer" width={34} height={34} className="relative z-10" />
        </motion.button>
        {showLabels && (
          <>
            <span className="font-semibold text-white text-[14px] tracking-[0.2em] uppercase whitespace-nowrap flex-1 truncate">
              Overseer
            </span>
            <button
              onClick={() => setEditMode((v) => !v)}
              title={editMode ? 'Salir del modo edición' : 'Reordenar menú'}
              className={`p-1 rounded transition-colors ${
                editMode ? 'text-indigo-400' : 'text-zinc-500 hover:text-white'
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
      <nav className="flex-1 py-2 space-y-0.5 overflow-y-auto px-3">
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
                whileTap={{ scale: 0.97 }}
                className={`relative flex items-center gap-3 ${showLabels ? 'px-3' : 'justify-center px-2'} py-2 rounded-xl cursor-pointer transition-all select-none ${
                  active
                    // Active: pill violeta del mockup — gradiente fuerte
                    // tipo "selected room" en el smart home dashboard.
                    // Texto blanco puro, sin glow externo.
                    ? 'text-white'
                    // Inactive: SOLO texto + icono, sin background ni
                    // border. Hover sube el texto a blanco pleno.
                    : 'text-zinc-500 hover:text-white'
                }`}
                style={active ? {
                  // Pill del item activo — derivado de --app-accent para que
                  // siga el color elegido en Configuración. Default indigo.
                  background: 'linear-gradient(90deg, color-mix(in srgb, var(--app-accent) 25%, transparent), color-mix(in srgb, var(--app-accent) 14%, transparent))',
                  boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--app-accent) 28%, transparent), inset 0 0 24px color-mix(in srgb, var(--app-accent) 18%, transparent)',
                } : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {showLabels && (
                  <span className="text-[13px] font-medium whitespace-nowrap flex-1">
                    {t(`nav.${key}`)}
                  </span>
                )}
                {/* Dot verde "on" — solo en el item activo, indicador
                    de "sección encendida" como en el mockup. */}
                {active && (
                  <span
                    className={`shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400 ${showLabels ? '' : 'absolute top-1.5 right-1.5'}`}
                    style={{ boxShadow: '0 0 6px rgba(52, 211, 153, 0.7)' }}
                  />
                )}
              </motion.div>
            </Link>
          )
        })}
      </nav>

      {/* Bottom actions — colapsables detrás de "Opciones" para no ocupar
          tanto espacio. Sin border-top: la separación es solo el gap. */}
      <div className="pt-4 pb-4 px-3 space-y-0.5">
        {/* Toggle "Opciones" */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setFooterOpen(!footerOpen)}
          title={!showLabels ? 'Opciones' : undefined}
          aria-expanded={footerOpen}
          className={`w-full flex items-center gap-3 ${showLabels ? 'px-3' : 'justify-center px-2'} py-2 rounded-xl text-[13px] transition-colors ${footerOpen ? 'text-white' : 'text-zinc-500 hover:text-white'}`}
        >
          {/* Flecha de disclosure: ▶ colapsado, ▼ expandido. */}
          {footerOpen
            ? <ChevronDown className="w-4 h-4 shrink-0" />
            : <ChevronRight className="w-4 h-4 shrink-0" />}
          {showLabels && (
            <span className="text-sm font-medium whitespace-nowrap flex-1 text-left">Opciones</span>
          )}
        </motion.button>

        <AnimatePresence initial={false}>
          {footerOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden space-y-0.5"
            >
              <SyncNowButton collapsed={!showLabels} />
              <TimezoneButton collapsed={!showLabels} />

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={toggleTheme}
                title={!showLabels ? (theme === 'dark' ? 'Modo claro' : 'Modo oscuro') : undefined}
                className={`w-full flex items-center gap-3 ${showLabels ? 'px-3' : 'justify-center px-2'} py-2 rounded-xl text-[13px] text-zinc-500 hover:text-white transition-colors`}
              >
                {theme === 'dark'
                  ? <Sun className="w-4 h-4 shrink-0" />
                  : <Moon className="w-4 h-4 shrink-0" />}
                {showLabels && (
                  <span className="text-sm font-medium whitespace-nowrap">
                    {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
                  </span>
                )}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={toggleLang}
                title={!showLabels ? (language === 'en' ? 'English' : 'Español') : undefined}
                className={`w-full flex items-center gap-3 ${showLabels ? 'px-3' : 'justify-center px-2'} py-2 rounded-xl text-[13px] text-zinc-500 hover:text-white transition-colors`}
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
                  title={!showLabels ? t('nav.logout') : undefined}
                  className={`w-full flex items-center gap-3 ${showLabels ? 'px-3' : 'justify-center px-2'} py-2.5 rounded-xl text-zinc-300 hover:text-red-300 hover:bg-red-500/10 transition-colors`}
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  {showLabels && (
                    <span className="text-sm font-medium whitespace-nowrap">{t('nav.logout')}</span>
                  )}
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  )
}

// ─── Timezone Button — popover with searchable list + auto-purge toggle ───────

// Botón "Sincronizar ahora" — para que el user pueda forzar un sync
// manual cuando algo no aparece (mobile recién abierto, o sospecha que
// la data en otro device es más reciente). Muestra el estado actual y
// usa i18n para los labels.
function SyncNowButton({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'idle' | 'syncing' | 'ok' | 'err'>('idle')
  const handleSync = async () => {
    if (status === 'syncing') return
    setStatus('syncing')
    try {
      const { forceSyncAll } = await import('@/lib/supabase/sync')
      await forceSyncAll()
      setStatus('ok')
      setTimeout(() => setStatus('idle'), 2000)
    } catch (e) {
      console.error('Manual sync failed', e)
      setStatus('err')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }
  const label =
    status === 'syncing' ? t('nav.syncing') :
    status === 'ok'      ? `${t('nav.synced')} ✓` :
    status === 'err'     ? t('nav.syncError') :
    t('nav.syncNow')
  const color =
    status === 'ok'  ? 'text-emerald-400' :
    status === 'err' ? 'text-red-400' :
    'text-zinc-400'

  return (
    <motion.button
      whileHover={{ scale: status === 'syncing' ? 1 : 1.02 }}
      whileTap={{ scale: status === 'syncing' ? 1 : 0.97 }}
      onClick={handleSync}
      title={collapsed ? label : undefined}
      disabled={status === 'syncing'}
      className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-xl text-[13px] hover:text-white transition-colors disabled:opacity-50 ${color}`}
    >
      <RotateCcw className={`w-4 h-4 shrink-0 ${status === 'syncing' ? 'animate-spin' : ''}`} />
      {!collapsed && (
        <span className="text-sm font-medium whitespace-nowrap">{label}</span>
      )}
    </motion.button>
  )
}

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
        className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-xl text-[13px] text-zinc-500 hover:text-white transition-colors`}
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
