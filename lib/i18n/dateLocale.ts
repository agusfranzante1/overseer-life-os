import type { Language } from '@/types'
import type { Locale } from 'date-fns'
import { es } from 'date-fns/locale/es'
import { enUS } from 'date-fns/locale/en-US'

/** Mapea el idioma del user al locale BCP-47 para usar con Intl APIs
 *  (toLocaleDateString, Intl.DateTimeFormat, etc.).
 *
 *  Antes había `'es-AR'` hardcodeado en muchos lugares. Ahora cualquier
 *  formateo de fecha que use este helper respeta el idioma seteado. */
export function dateLocale(lang: Language): string {
  switch (lang) {
    case 'en': return 'en-US'
    case 'es': return 'es-AR'
    default:   return 'en-US'
  }
}

/** Mapea el idioma del user al objeto Locale de date-fns, para pasarlo como
 *  `{ locale }` a `format()`. Sin esto, date-fns formatea SIEMPRE en inglés
 *  (default enUS) — por eso los nombres de días/meses del calendario salían
 *  en inglés aunque la app estuviera en español. */
export function dateFnsLocale(lang: Language): Locale {
  switch (lang) {
    case 'es': return es
    case 'en': return enUS
    default:   return enUS
  }
}
