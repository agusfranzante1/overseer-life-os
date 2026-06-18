'use client'
import { useAppStore } from '@/lib/store/appStore'
import { getT } from '@/lib/i18n'
import { translateStatus } from '@/lib/i18n/statusTranslate'
import { dateLocale, dateFnsLocale } from '@/lib/i18n/dateLocale'
import { en } from '@/lib/i18n/en'
import { es } from '@/lib/i18n/es'

/** Hook unificado de i18n.
 *  - t(key): traduce una clave del diccionario, devuelve string.
 *  - lang: 'en' | 'es' actual del store.
 *  - locale: BCP-47 ('en-US' / 'es-AR') para Intl / toLocaleDateString.
 *  - dfLocale: objeto Locale de date-fns para pasar a format() y que los
 *    nombres de día/mes salgan en el idioma actual.
 *  - tStatus(label): traduce label de status LIVE (custom queda intacto).
 *  - tArray(key): para arrays del diccionario (calendar.weekdaysShort, etc.). */
export function useTranslation() {
  const lang = useAppStore((s) => s.language)
  const t = getT(lang)
  const tStatus = (label: string) => translateStatus(label, lang)
  const tArray = (key: string): string[] => {
    const dict = lang === 'en' ? en : es
    const parts = key.split('.')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let value: any = dict
    for (const p of parts) value = value?.[p]
    return Array.isArray(value) ? value : []
  }
  return { t, lang, locale: dateLocale(lang), dfLocale: dateFnsLocale(lang), tStatus, tArray }
}
