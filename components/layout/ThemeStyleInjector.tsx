'use client'
import { useAppStore } from '@/lib/store/appStore'

/** Inyecta un <style> global con los overrides de color que el usuario
 *  eligió en Configuración → Apariencia. Lee `themeColors` del appStore y
 *  genera reglas que pisan las variables base de globals.css:
 *
 *   - darkBg  → :root            { --app-bg }   (tema oscuro)
 *   - lightBg → html.theme-light { --app-bg }   (tema claro)
 *   - accent  → --app-accent + override de indigo/violet 500/600 en AMBOS
 *               temas, para "estandarizar" los botones primarios y el nav.
 *
 *  Va montado en AppShell (siempre presente). Cuando un valor es null se
 *  omite y queda el default del CSS. Como el <style> se renderiza después
 *  de globals.css y usa selectores de igual/mayor especificidad, gana. */
export function ThemeStyleInjector() {
  const { darkBg, lightBg, accent } = useAppStore((s) => s.themeColors)

  const rules: string[] = []

  if (darkBg) rules.push(`:root{--app-bg:${darkBg};}`)
  if (lightBg) rules.push(`html.theme-light{--app-bg:${lightBg};}`)

  if (accent) {
    const dark = darkenHex(accent, 0.12)
    // Acento + override de las familias que usan los CTAs primarios y el
    // nav (indigo/violet). Aplica a oscuro y claro por igual.
    rules.push(
      `:root,html.theme-light{` +
        `--app-accent:${accent};` +
        `--color-indigo-500:${accent};--color-indigo-600:${dark};` +
        `--color-violet-500:${accent};--color-violet-600:${dark};` +
      `}`,
    )
  }

  if (rules.length === 0) return null

  return <style id="overseer-theme-overrides" dangerouslySetInnerHTML={{ __html: rules.join('') }} />
}

/** Oscurece un hex (#rrggbb) multiplicando cada canal por (1 - amount).
 *  Usado para derivar el shade 600 a partir del acento elegido. */
function darkenHex(hex: string, amount: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return hex
  const f = 1 - Math.max(0, Math.min(1, amount))
  const ch = (h: string) => Math.max(0, Math.min(255, Math.round(parseInt(h, 16) * f)))
  const to2 = (n: number) => n.toString(16).padStart(2, '0')
  return `#${to2(ch(m[1]))}${to2(ch(m[2]))}${to2(ch(m[3]))}`
}
