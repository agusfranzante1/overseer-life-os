import { en } from './en'
import { es } from './es'
import { Language } from '@/types'

const translations: Record<Language, Record<string, unknown>> = { en, es }

export type TranslationKey = string

export function getT(lang: Language) {
  const dict = translations[lang]
  return function t(key: string): string {
    const parts = key.split('.')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let value: any = dict
    for (const part of parts) {
      value = value?.[part]
    }
    return typeof value === 'string' ? value : key
  }
}
