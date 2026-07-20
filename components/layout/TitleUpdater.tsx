'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/hooks/useTranslation'

/** Map URL paths → nav i18n key + emoji. We reuse the same keys the
 *  Sidebar uses so the tab title always matches the menu item name (no
 *  two sources of truth for "Calendario" vs "Calendar" etc).
 *
 *  El tercer elemento de cada tupla es el EMOJI propio de la página —
 *  se usa como prefijo del título de la pestaña así, con varias pestañas
 *  abiertas, distinguís cada una rápido por su emoji adelante del nombre.
 *
 *  El favicon de la página NO se toca — sigue siendo el logo original
 *  declarado en `app/icon.*`. (Antes inyectábamos un favicon SVG por
 *  ruta y quedaba duplicado visualmente con el ícono en el nombre.
 *  Ahora el emoji vive solo en el título.)
 *
 *  The lookup is a STARTS_WITH check (`/tasks/abc` still resolves to 'tasks'),
 *  in declared order — list more specific paths first when they overlap. */
const ROUTE_TO_NAV: ReadonlyArray<readonly [string, string, string]> = [
  ['/dashboard',   'dashboard', '🏠'],
  ['/proyeccion',  'spi',       '♾️'],
  ['/spi',         'spi',       '♾️'],   // legacy redirect — same nav key
  ['/laboratorio', 'lab',       '🧪'],
  ['/journal',     'journal',   '📔'],
  ['/mapas',       'mindmaps',  '🕸️'],
  ['/tasks',       'tasks',     '✅'],
  ['/calendar',    'calendar',  '📅'],
  ['/money',       'money',     '💰'],
  ['/trading',     'trading',   '📈'],
  ['/health',      'health',    '❤️'],
  ['/habits',      'habits',    '🟢'],
  ['/kpis',        'kpis',      '🎯'],
  ['/gym',         'gym',       '🏋️'],
  ['/food',        'food',      '🍽️'],
  ['/settings',    'settings',  '⚙️'],
]

const DEFAULT_EMOJI = '🦾'

/** Watches the current route and sets `document.title` to
 *  `"<emoji> OVERSEER · <section>"` so the browser tab muestra qué
 *  sección está abierta — el emoji va de prefijo para diferenciar
 *  varias pestañas de un vistazo. El favicon queda intacto (sigue
 *  siendo el logo original del proyecto).
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

    // ── Limpieza defensiva ─────────────────────────────────────────
    // Si una versión anterior dejó un favicon SVG dinámico inyectado,
    // lo quitamos así el browser vuelve a usar el favicon original
    // declarado en `app/icon.*`. Sin esta limpieza, el SVG anterior
    // se quedaba "pegado" hasta que el usuario forzara un hard refresh.
    const stale = document.querySelector<HTMLLinkElement>(
      'link[rel="icon"][data-dynamic="page-favicon"]'
    )
    if (stale) stale.remove()
  }, [pathname, t])

  return null
}
