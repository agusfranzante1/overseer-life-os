/** Helpers para serializar planes y sesiones SPI a markdown
 *  copy-paste-ready. Pensado para que el usuario apriete "Copiar todo"
 *  y pegue el dump entero en un chat IA que lo ayude a completar. */

import type { ProjectionPlan, SPISection, SectionField } from '@/lib/projection/types'
import type { SPISession, SPITemplate } from '@/lib/spi/types'
import { WHEEL_AREAS } from '@/lib/projection/templates'
import { labelForPeriod } from '@/lib/projection/period'

/** Renderiza una sección recursiva — su intro, fields con valor no vacío,
 *  y subsections. El "depth" controla el nivel de header (h2, h3, h4...).
 *  Las áreas principales del año (cuando aplica) se marcan con ⭐. */
function renderSection(
  section: SPISection,
  values: Record<string, Record<string, string>>,
  depth: number,
  parentKey = '',
): string {
  const fullKey = parentKey ? `${parentKey}.${section.key}` : section.key
  const sectionValues = values[fullKey] ?? values[section.key] ?? {}
  const heading = '#'.repeat(Math.min(6, depth))
  let out = `\n${heading} ${section.emoji ? section.emoji + ' ' : ''}${section.title}\n`
  if (section.intro) out += `_${section.intro}_\n`

  // Caso especial: metas_anuales con principales marcadas con ⭐
  const principalKeys = section.key === 'metas_anuales'
    ? (sectionValues.principales ?? '').split(',').filter(Boolean)
    : []
  const principalSet = new Set(principalKeys)

  if (section.fields) {
    let any = false
    for (const field of section.fields) {
      // Saltamos el field "principales" (es solo storage interno del picker)
      if (field.key === 'principales') continue
      const raw = sectionValues[field.key]
      if (!raw || !raw.trim()) continue
      any = true
      const isPrincipal = principalSet.has(field.key)
      const label = isPrincipal ? `⭐ ${field.label}` : field.label
      // Para scores numéricos los inline; para textareas multi-línea, los
      // ponemos en bloque para preservar saltos de línea.
      const isMultiline = raw.includes('\n') || raw.length > 80
      if (isMultiline) {
        out += `\n**${label}**:\n${raw.trim()}\n`
      } else {
        out += `- **${label}**: ${raw.trim()}\n`
      }
    }
    if (!any && !section.subsections?.length) {
      out += `_(sin completar)_\n`
    }
  }

  // Cascade principal (quarter/month) — sub-metas por área principal
  if (section.key === 'principal_cascade') {
    const cascade = sectionValues
    // Inferir las áreas que tienen sub-metas escribiendo `${areaKey}_subN`
    const areaKeys = Array.from(
      new Set(
        Object.keys(cascade)
          .map((k) => k.replace(/_sub[123]$/, ''))
          .filter((k) => k && /_sub[123]/.test(`${k}_sub1`) || true)
      )
    )
    for (const k of areaKeys) {
      const sub1 = cascade[`${k}_sub1`]
      const sub2 = cascade[`${k}_sub2`]
      const sub3 = cascade[`${k}_sub3`]
      if (!sub1 && !sub2 && !sub3) continue
      const areaLabel = WHEEL_AREAS.find((a) => a.key === k)?.label ?? k
      out += `\n**⭐ ${areaLabel}**\n`
      if (sub1?.trim()) out += `1. ${sub1.trim()}\n`
      if (sub2?.trim()) out += `2. ${sub2.trim()}\n`
      if (sub3?.trim()) out += `3. ${sub3.trim()}\n`
    }
  }

  if (section.subsections) {
    for (const sub of section.subsections) {
      out += renderSection(sub, values, depth + 1, fullKey)
    }
  }
  return out
}

/** Plan de proyección (eagle / year / quarter / month) → markdown. */
export function planToMarkdown(
  plan: ProjectionPlan,
  template: { title: string; sections: SPISection[] },
): string {
  const periodLabel = labelForPeriod(plan.periodKey)
  let md = `# ${template.title} · ${periodLabel}\n`
  if (plan.closedAt) {
    md += `> Cerrado el ${new Date(plan.closedAt).toLocaleDateString('es-AR')}`
    if (plan.mood) md += ` · mood ${plan.mood}/10`
    md += `\n`
    if (plan.notes?.trim()) md += `\n**Notas de cierre**: ${plan.notes.trim()}\n`
  } else {
    md += `> En progreso\n`
  }
  for (const section of template.sections) {
    md += renderSection(section, plan.values, 2)
  }
  return md.trim() + '\n'
}

/** SPI session semanal → markdown. Incluye checklist, todas las
 *  secciones, las tareas generadas, los KPIs (si hay snapshot o si
 *  hay valores en session.values.kpis), y el cierre (mood, notes, score). */
export function sessionToMarkdown(session: SPISession, template: SPITemplate): string {
  const periodLabel = `Semana del ${session.weekStartDate}`
  let md = `# SPI Semanal · ${periodLabel}\n`
  if (session.closedAt) {
    md += `> Cerrada el ${new Date(session.closedAt).toLocaleDateString('es-AR')}`
    if (session.mood) md += ` · mood ${session.mood}/10`
    if (session.score !== undefined) md += ` · score ${session.score}%`
    md += `\n`
  } else {
    md += `> En progreso\n`
  }

  // Checklist principal
  const mc = session.mainChecklist ?? {}
  const mcKeys = Object.keys(mc)
  if (mcKeys.length > 0) {
    md += `\n## Checklist principal\n`
    for (const k of mcKeys) {
      md += `- [${mc[k] ? 'x' : ' '}] ${k}\n`
    }
  }

  // Secciones por lane seleccionado
  const selected = new Set(session.selectedLanes ?? [])
  const allLanes = template.lanes ?? []
  for (const lane of allLanes) {
    if (selected.size > 0 && !selected.has(lane.key)) continue
    const laneSections = template.sections.filter((s) => s.laneKey === lane.key)
    if (laneSections.length === 0) continue
    md += `\n## ${lane.emoji ?? ''} ${lane.title}\n`
    for (const section of laneSections) {
      md += renderSection(section, session.values, 3)
    }
  }
  // Secciones sin lane
  for (const section of template.sections.filter((s) => !s.laneKey)) {
    md += renderSection(section, session.values, 2)
  }

  // Tareas generadas
  if (session.tasks && session.tasks.length > 0) {
    md += `\n## ✅ Tareas de la semana\n`
    for (const t of session.tasks) {
      md += `- ${t.title}`
      if (t.whyPurpose) md += ` _(${t.whyPurpose})_`
      if (t.dueDate) md += ` · vence ${t.dueDate}`
      md += `\n`
    }
  }

  // KPIs (snapshot frozen primero, fallback a values.kpis)
  const kpiSnapshot = session.weekSnapshot?.kpis
  if (kpiSnapshot && kpiSnapshot.length > 0) {
    md += `\n## 📊 KPIs de la semana\n`
    for (const k of kpiSnapshot) {
      const label = k.kind === 'boolean'
        ? (k.value > 0 ? '✓' : '✗')
        : k.target !== undefined ? `${k.value}/${k.target}` : String(k.value)
      md += `- ${k.icon ?? ''} **${k.name}**: ${label}`
      if (k.completionPct !== undefined) md += ` · ${k.completionPct}%`
      md += `\n`
    }
  }

  // Cierre
  if (session.notes?.trim()) {
    md += `\n## Reflexión de cierre\n${session.notes.trim()}\n`
  }

  return md.trim() + '\n'
}

/** Copia al clipboard con feedback. Devuelve true si funcionó. */
export async function copyMarkdownToClipboard(md: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false
  try {
    await navigator.clipboard.writeText(md)
    return true
  } catch {
    return false
  }
}
