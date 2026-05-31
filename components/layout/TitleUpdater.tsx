'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/hooks/useTranslation'

/** Map URL paths → nav i18n key. We reuse the same keys the Sidebar uses
 *  so the tab title always matches the menu item name (no two sources of
 *  truth for "Calendario" vs "Calendar" etc).
 *
 *  The lookup is a STARTS_WITH check (`/tasks/abc` still resolves to 'tasks'),
 *  in declared order — list more specific paths first when they overlap. */
const ROUTE_TO_NAV_KEY: ReadonlyArray<readonly [string, string]> = [
  ['/dashboard',   'dashboard'],
  ['/proyeccion',  'spi'],         // SPI / Proyección unified entry
  ['/spi',         'spi'],         // legacy redirect — same nav key
  ['/laboratorio', 'lab'],
  ['/mapas',       'mindmaps'],
  ['/tasks',       'tasks'],
  ['/calendar',    'calendar'],
  ['/money',       'money'],
  ['/trading',     'trading'],
  ['/health',      'health'],
  ['/habits',      'habits'],
  ['/gym',         'gym'],
  ['/food',        'food'],
  ['/settings',    'settings'],
]

/** Watches the current route and sets `document.title` to
 *  "OVERSEER · {section}" so the browser tab shows where the user is.
 *  Renders no DOM — purely a side-effect component. */
export function TitleUpdater() {
  const pathname = usePathname()
  const { t } = useTranslation()

  useEffect(() => {
    if (typeof document === 'undefined') return
    const path = pathname ?? ''
    const match = ROUTE_TO_NAV_KEY.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))
    if (match) {
      const sectionLabel = t(`nav.${match[1]}`)
      document.title = `OVERSEER · ${sectionLabel}`
    } else {
      // Unknown route (login, signup, errors) → fall back to the base title.
      document.title = 'OVERSEER · Life OS'
    }
  }, [pathname, t])

  return null
}
