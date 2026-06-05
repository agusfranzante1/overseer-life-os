import type { Language } from '@/types'

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
