'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/hooks/useTranslation'
import { emojiToFaviconDataUri } from '@/lib/utils/pageMeta'

/** Map URL paths → nav i18n key + emoji. We reuse the same keys the
 *  Sidebar uses so the tab title always matches the menu item name (no
 *  two sources of truth for "Calendario" vs "Calendar" etc).
 *
 *  El tercer elemento de cada tupla es el EMOJI propio de la página —
 *  va como prefijo del título de la pestaña Y como favicon SVG dinámico.
 *  Así, con 6 pestañas abiertas, distinguís Calendar / Tasks / Mapas
 *  Mentales sin pasar el mouse por encima.
 *
 *  The lookup is a STARTS_WITH check (`/tasks/abc` still resolves to 'tasks'),
 *  in declared order — list more specific paths first when they overlap. */
const ROUTE_TO_NAV: ReadonlyArray<readonly [string, string, string]> = [
  ['/dashboard',   'dashboard', '🏠'],
  ['/proyeccion',  'spi',       '♾️'],
  ['/spi',         'spi',       '♾️'],   // legacy redirect — same nav key
  ['/laboratorio', 'lab',       '🧪'],
  ['/mapas',       'mindmaps',  '🕸️'],
  ['/tasks',       'tasks',     '✅'],
  ['/calendar',    'calendar',  '📅'],
  ['/money',       'money',     '💰'],
  ['/trading',     'trading',   '📈'],
  ['/health',      'health',    '❤️'],
  ['/habits',      'habits',    '🟢'],
  ['/gym',         'gym',       '🏋️'],
  ['/food',        'food',      '🍽️'],
  ['/settings',    'settings',  '⚙️'],
]

const DEFAULT_EMOJI = '🦾'

/** Watches the current route and sets:
 *   1) `document.title` con `"<emoji> OVERSEER · <section>"` — el emoji
 *      ayuda a distinguir pestañas en el browser y en /recents.
 *   2) Un `<link rel="icon">` con un SVG dinámico que muestra el emoji
 *      de la página actual como favicon. Cada navegación lo refresca.
 *
 *  Renders no DOM — purely a side-effect component. */
export function TitleUpdater() {
  const pathname = usePathname()
  const { t } = useTranslation()

  useEffect(() => {
    if (typeof document === 'undefined') return
    const path = pathname ?? ''
    const match = ROUTE_TO_NAV.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))
    const emoji = match?.[2] ?? DEFAULT_EMOJI
    if (match) {
      const sectionLabel = t(`nav.${match[1]}`)
      document.title = `${emoji} OVERSEER · ${sectionLabel}`
    } else {
      // Unknown route (login, signup, errors) → fall back to the base title.
      document.title = `${DEFAULT_EMOJI} OVERSEER · Life OS`
    }

    // ── Favicon dinámico ────────────────────────────────────────────
    // Inyectamos (o reusamos) un <link rel="icon"> con data-attribute
    // propio para no pisar al favicon estático del proyecto. Los browsers
    // priorizan el último `rel="icon"` declarado, así que este gana sobre
    // el favicon default de app/icon.*.
    const href = emojiToFaviconDataUri(emoji)
    const existing = document.querySelector<HTMLLinkElement>(
      'link[rel="icon"][data-dynamic="page-favicon"]'
    )
    if (existing) {
      existing.href = href
    } else {
      const link = document.createElement('link')
      link.rel = 'icon'
      link.type = 'image/svg+xml'
      link.dataset.dynamic = 'page-favicon'
      link.href = href
      document.head.appendChild(link)
    }
  }, [pathname, t])

  return null
}
