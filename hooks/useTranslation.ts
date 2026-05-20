'use client'
import { useAppStore } from '@/lib/store/appStore'
import { getT } from '@/lib/i18n'

export function useTranslation() {
  const lang = useAppStore((s) => s.language)
  const t = getT(lang)
  return { t, lang }
}
