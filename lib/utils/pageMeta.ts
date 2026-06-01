/** Mapa de ruta → emoji + título corto. Lo consume PageFavicon para
 *  actualizar dinámicamente `<link rel="icon">` y `document.title`
 *  cuando navegás entre páginas. Así, en el browser, cada pestaña abierta
 *  muestra su propio icono y nombre legible.
 *
 *  Las claves son PREFIJOS de pathname — la primera coincidencia gana.
 *  Mantené el orden de más específico a más genérico (p.ej. '/dashboard'
 *  arriba que '/' al final). */

export interface PageMeta {
  emoji: string
  title: string
}

const PAGE_META_BY_PREFIX: { prefix: string; meta: PageMeta }[] = [
  { prefix: '/dashboard',   meta: { emoji: '🏠', title: 'Dashboard' } },
  { prefix: '/proyeccion',  meta: { emoji: '♾️', title: 'Proyección' } },
  { prefix: '/spi',         meta: { emoji: '📐', title: 'SPI' } },
  { prefix: '/laboratorio', meta: { emoji: '🧪', title: 'Laboratorio' } },
  { prefix: '/mapas',       meta: { emoji: '🕸️', title: 'Mapas Mentales' } },
  { prefix: '/tasks',       meta: { emoji: '✅', title: 'Tareas' } },
  { prefix: '/calendar',    meta: { emoji: '📅', title: 'Calendario' } },
  { prefix: '/money',       meta: { emoji: '💰', title: 'Money' } },
  { prefix: '/trading',     meta: { emoji: '📈', title: 'Trading' } },
  { prefix: '/health',      meta: { emoji: '❤️', title: 'Salud' } },
  { prefix: '/habits',      meta: { emoji: '🟢', title: 'Hábitos' } },
  { prefix: '/gym',         meta: { emoji: '🏋️', title: 'Gym' } },
  { prefix: '/food',        meta: { emoji: '🍽️', title: 'Comidas' } },
  { prefix: '/settings',    meta: { emoji: '⚙️', title: 'Settings' } },
  { prefix: '/login',       meta: { emoji: '🔑', title: 'Login' } },
]

/** Default cuando no matchea ninguna ruta — usa el logo genérico. */
export const DEFAULT_PAGE_META: PageMeta = { emoji: '🦾', title: 'Overseer' }

export function getPageMeta(pathname: string | null | undefined): PageMeta {
  if (!pathname) return DEFAULT_PAGE_META
  for (const { prefix, meta } of PAGE_META_BY_PREFIX) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return meta
  }
  // `/` redirige a dashboard, así que tratamos a `/` como dashboard.
  if (pathname === '/') return PAGE_META_BY_PREFIX[0].meta
  return DEFAULT_PAGE_META
}

/** Genera un data-URI SVG con el emoji centrado, listo para usar como
 *  `href` de un `<link rel="icon">`. El SVG es 64×64 con un fondo
 *  zinc-950 (matchea el theme oscuro de la app) y el emoji centrado en
 *  blanco/su color natural. */
export function emojiToFaviconDataUri(emoji: string): string {
  // Importante: dejar el SVG en una sola línea + usar encodeURIComponent
  // para que sirva como data URI sin romperse en parsers exigentes.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#09090b"/><text x="50%" y="50%" font-size="44" text-anchor="middle" dominant-baseline="central" dy=".1em">${emoji}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
