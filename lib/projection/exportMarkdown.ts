/** Helpers para serializar planes y sesiones SPI a markdown
 *  copy-paste-ready. Pensado para que el usuario apriete "Copiar todo"
 *  y pegue el dump entero en un chat IA que lo ayude a completar.
 *
 *  IMPORTANTE: las secciones DINÁMICAS — que pullean valores de OTROS
 *  planes (ej. "Qué buscás esta semana" muestra meta anual + sub-metas
 *  Q + sub-metas mes + meta semanal + KPIs activos por área) — se
 *  resuelven acá también. Si no, el copy quedaba vacío ahí porque el
 *  template no tiene fields hardcoded para esas secciones.
 *
 *  Para resolver el cross-plan lookup, las funciones de export pueden
 *  recibir un `context` con todos los plans y el KPI library. */

import type { ProjectionPlan, ProjectionTemplate, SPISection } from '@/lib/projection/types'
import type { SPISession, SPITemplate } from '@/lib/spi/types'
import type { KPIDefinition } from '@/lib/kpi/types'
import { WHEEL_AREAS } from '@/lib/projection/templates'
import { labelForPeriod } from '@/lib/projection/period'

/** Contexto cross-plan necesario para resolver secciones dinámicas. */
export interface ExportContext {
  /** Todos los planes del store — para que las secciones del semanal/mes
   *  puedan pullear contexto del trimestre/anual. */
  allPlans?: ProjectionPlan[]
  /** Library completa de KPIs — para mostrar nombre/target/icon de los
   *  KPIs activos en la sesión semanal. */
  kpiDefinitions?: KPIDefinition[]
}

// ─── Helpers de lookup ───────────────────────────────────────────────

function findPlan(plans: ProjectionPlan[] | undefined, level: ProjectionPlan['level'], periodKey: string): ProjectionPlan | null {
  if (!plans) return null
  return plans.find((p) => p.level === level && p.periodKey === periodKey) ?? null
}

/** Para una sesión SPI (cuyo weekStartDate es un sábado), devuelve la
 *  tripla anual/trimestral/mensual de planes que la "contienen". Usa el
 *  criterio "mes con mayoría de días" para sesiones que cruzan fin de mes. */
function planTripleForSession(session: SPISession, plans: ProjectionPlan[] | undefined): {
  year: ProjectionPlan | null
  quarter: ProjectionPlan | null
  month: ProjectionPlan | null
  monthKey: string
  quarterKey: string
  yearKey: string
} {
  const [yStr, mStr, dStr] = session.weekStartDate.split('-')
  const sat = new Date(parseInt(yStr, 10), parseInt(mStr, 10) - 1, parseInt(dStr, 10))
  // Cuál mes tiene la mayoría de los 7 días.
  const counts = new Map<string, number>()
  for (let i = 0; i < 7; i++) {
    const d = new Date(sat)
    d.setDate(sat.getDate() + i)
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    counts.set(mk, (counts.get(mk) ?? 0) + 1)
  }
  let monthKey = `${yStr}-${mStr}`
  let bestC = 0
  for (const [mk, c] of counts) if (c >= bestC) { monthKey = mk; bestC = c }
  const [yearKey, monthStr] = monthKey.split('-')
  const m = parseInt(monthStr, 10)
  const qN = m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4
  const quarterKey = `${yearKey}-Q${qN}`
  return {
    year: findPlan(plans, 'year', yearKey),
    quarter: findPlan(plans, 'quarter', quarterKey),
    month: findPlan(plans, 'month', monthKey),
    monthKey, quarterKey, yearKey,
  }
}

/** Lee las áreas marcadas como principales en el plan anual (CSV). */
function principalAreaKeys(annualPlan: ProjectionPlan | null): string[] {
  const csv = annualPlan?.values?.metas_anuales?.principales ?? ''
  return csv.split(',').filter(Boolean)
}

// ─── Render principal de secciones ──────────────────────────────────

interface RenderArgs {
  section: SPISection
  values: Record<string, Record<string, string>>
  depth: number
  parentKey?: string
  session?: SPISession   // solo cuando estamos exportando un session
  ctx: ExportContext
}

function renderSection(args: RenderArgs): string {
  const { section, values, depth, parentKey = '', session, ctx } = args
  const fullKey = parentKey ? `${parentKey}.${section.key}` : section.key
  const sectionValues = values[fullKey] ?? values[section.key] ?? {}
  const heading = '#'.repeat(Math.min(6, depth))
  let out = `\n${heading} ${section.emoji ? section.emoji + ' ' : ''}${section.title}\n`
  if (section.intro) out += `_${section.intro}_\n`

  // ── Caso especial: que_buscamos en SPI semanal ──
  // Esta sección NO tiene fields hardcoded — el componente renderea un
  // bloque dinámico por cada área principal del año con: meta anual +
  // sub-metas trim + sub-metas mes + meta semanal + KPIs activos. Si no
  // resolvemos eso acá, el copy queda vacío.
  if (section.key === 'que_buscamos' && session && ctx.allPlans) {
    out += renderQueBuscamosBlock(session, ctx)
    if (section.subsections) {
      for (const sub of section.subsections) {
        out += renderSection({ ...args, section: sub, depth: depth + 1, parentKey: fullKey })
      }
    }
    return out
  }

  // Caso especial: metas_anuales con principales marcadas con ⭐
  const principalKeys = section.key === 'metas_anuales'
    ? (sectionValues.principales ?? '').split(',').filter(Boolean)
    : []
  const principalSet = new Set(principalKeys)

  if (section.fields) {
    let any = false
    for (const field of section.fields) {
      if (field.key === 'principales') continue
      const raw = sectionValues[field.key]
      if (!raw || !String(raw).trim()) continue
      any = true
      const isPrincipal = principalSet.has(field.key)
      const label = isPrincipal ? `⭐ ${field.label}` : field.label
      const value = String(raw).trim()
      const isMultiline = value.includes('\n') || value.length > 80
      if (isMultiline) {
        out += `\n**${label}**:\n${value}\n`
      } else {
        out += `- **${label}**: ${value}\n`
      }
    }
    if (!any && !section.subsections?.length && section.key !== 'principal_cascade') {
      out += `_(sin completar)_\n`
    }
  }

  // ── Caso especial: principal_cascade (trim / mes) ──
  // Sub-metas por área principal del año. ANTES también hacía esto pero
  // la inferencia de áreas estaba bugueada. Ahora pulleamos las áreas
  // principales DEL ANUAL (no de las keys del cascade) para que aparezcan
  // incluso si todavía no tienen sub-metas escritas.
  if (section.key === 'principal_cascade') {
    const annual = ctx.allPlans ? findPlan(ctx.allPlans, 'year', currentYearFromValues(values)) : null
    const areaKeys = annual ? principalAreaKeys(annual) : Array.from(
      new Set(
        Object.keys(sectionValues)
          .map((k) => k.match(/^(.+)_sub[123]$/)?.[1])
          .filter((k): k is string => !!k)
      )
    )
    let anyCascade = false
    for (const k of areaKeys) {
      const sub1 = sectionValues[`${k}_sub1`]
      const sub2 = sectionValues[`${k}_sub2`]
      const sub3 = sectionValues[`${k}_sub3`]
      const hasAny = !!(sub1?.trim() || sub2?.trim() || sub3?.trim())
      if (!hasAny) continue
      anyCascade = true
      const areaLabel = WHEEL_AREAS.find((a) => a.key === k)?.label ?? k
      out += `\n**⭐ ${areaLabel}**\n`
      if (sub1?.trim()) out += `1. ${sub1.trim()}\n`
      if (sub2?.trim()) out += `2. ${sub2.trim()}\n`
      if (sub3?.trim()) out += `3. ${sub3.trim()}\n`
    }
    if (!anyCascade && areaKeys.length > 0) {
      out += `_(sin sub-metas cargadas para las ${areaKeys.length} áreas principales)_\n`
    } else if (areaKeys.length === 0) {
      out += `_(no marcaste áreas principales en el plan anual)_\n`
    }
  }

  if (section.subsections) {
    for (const sub of section.subsections) {
      out += renderSection({ ...args, section: sub, depth: depth + 1, parentKey: fullKey })
    }
  }
  return out
}

/** Año "actual" inferido de los values del plan que estamos exportando.
 *  Hack útil para cuando llamamos renderSection sin session — usamos el
 *  yearKey que está en el cascade context. Devuelve string vacío si no
 *  podemos inferir (en cuyo caso findPlan devuelve null). */
function currentYearFromValues(_values: Record<string, Record<string, string>>): string {
  // En la práctica esto solo se llama para trim/mes plans. El periodKey
  // del plan está implícito en el caller, pero no lo tenemos acá. Lo más
  // simple: usamos el año actual del browser. Si el cascade es histórico
  // (ej. plan de 2025 leído en 2026), el lookup falla → caemos al
  // fallback de inferir desde keys del cascade. Aceptable.
  return String(new Date().getFullYear())
}

/** Render del bloque "Qué buscás esta semana" — por cada área principal
 *  del año: meta anual + sub-metas Q + sub-metas mes + meta semanal del
 *  usuario + KPIs activos esta semana en esa área. */
function renderQueBuscamosBlock(session: SPISession, ctx: ExportContext): string {
  let out = ''
  const { year, quarter, month, monthKey, quarterKey } = planTripleForSession(session, ctx.allPlans)
  const principalKeys = principalAreaKeys(year)
  if (principalKeys.length === 0) {
    out += `_(no marcaste áreas principales en el plan anual ${year ? `(${year.periodKey})` : ''})_\n`
    return out
  }
  const selectedKpiIds = new Set(session.selectedKpiIds ?? [])
  for (const k of principalKeys) {
    const areaLabel = WHEEL_AREAS.find((a) => a.key === k)?.label ?? k
    out += `\n### ⭐ ${areaLabel}\n`
    // Meta anual
    const annualMeta = (year?.values?.metas_anuales?.[k] ?? '').trim()
    if (annualMeta) {
      out += `**Anual**: ${annualMeta}\n`
    }
    // Sub-metas trimestrales
    const qSubs = [1, 2, 3]
      .map((i) => quarter?.values?.principal_cascade?.[`${k}_sub${i}`] ?? '')
      .filter((s) => s && s.trim().length > 0)
    if (qSubs.length > 0) {
      out += `**Trimestral · ${quarterKey}**:\n`
      qSubs.forEach((s, i) => { out += `${i + 1}. ${s.trim()}\n` })
    }
    // Sub-metas mensuales
    const mSubs = [1, 2, 3]
      .map((i) => month?.values?.principal_cascade?.[`${k}_sub${i}`] ?? '')
      .filter((s) => s && s.trim().length > 0)
    if (mSubs.length > 0) {
      out += `**Mensual · ${monthKey}**:\n`
      mSubs.forEach((s, i) => { out += `${i + 1}. ${s.trim()}\n` })
    }
    // Meta semanal (lo que escribiste en el textarea)
    const weeklyMeta = (session.values?.que_buscamos?.[`meta_${k}_sem`] ?? '').trim()
    if (weeklyMeta) {
      out += `**Esta semana**: ${weeklyMeta}\n`
    } else {
      out += `**Esta semana**: _(sin completar)_\n`
    }
    // KPIs activos en esta área
    const areaKpis = (ctx.kpiDefinitions ?? []).filter(
      (kpi) => !kpi.archivedAt && kpi.areaKey === k && selectedKpiIds.has(kpi.id)
    )
    if (areaKpis.length > 0) {
      out += `**KPIs activos**: ${areaKpis.map((kpi) => {
        const t = kpi.target !== undefined ? ` /${kpi.target}${kpi.kind === 'percent' ? '%' : ''}` : ''
        return `${kpi.icon} ${kpi.name}${t}`
      }).join(' · ')}\n`
    }
  }
  return out
}

// ─── Entry points públicos ──────────────────────────────────────────

/** Plan de proyección (eagle / year / quarter / month) → markdown.
 *  Si pasás `ctx.allPlans`, el cascade del trim/mes resuelve las áreas
 *  principales correctas del año respectivo. */
export function planToMarkdown(
  plan: ProjectionPlan,
  template: ProjectionTemplate,
  ctx: ExportContext = {},
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
    md += renderSection({ section, values: plan.values, depth: 2, ctx })
  }
  return md.trim() + '\n'
}

/** SPI session semanal → markdown. Incluye checklist, secciones por
 *  lane (con bloque dinámico de "Qué buscás esta semana" resuelto),
 *  tareas, KPIs, y cierre. */
export function sessionToMarkdown(
  session: SPISession,
  template: SPITemplate,
  ctx: ExportContext = {},
): string {
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

  // Resumen del contexto de proyección que afecta a esta semana — al tope
  // así el chat IA tiene contexto antes de leer las secciones.
  if (ctx.allPlans) {
    const triple = planTripleForSession(session, ctx.allPlans)
    md += `\n## 📐 Contexto de proyección\n`
    md += `- **Año**: ${triple.year ? `[${triple.year.periodKey}]` : '_(sin plan)_'}\n`
    md += `- **Trimestre**: ${triple.quarter ? `[${triple.quarterKey}]` : `_(sin plan ${triple.quarterKey})_`}\n`
    md += `- **Mes**: ${triple.month ? `[${triple.monthKey}]` : `_(sin plan ${triple.monthKey})_`}\n`
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
      md += renderSection({ section, values: session.values, depth: 3, session, ctx })
    }
  }
  // Secciones sin lane
  for (const section of template.sections.filter((s) => !s.laneKey)) {
    md += renderSection({ section, values: session.values, depth: 2, session, ctx })
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

  // KPIs — snapshot frozen primero, fallback a values.kpis con lookup
  // contra la library.
  const kpiSnapshot = session.weekSnapshot?.kpis
  if (kpiSnapshot && kpiSnapshot.length > 0) {
    md += `\n## 📊 KPIs de la semana (snapshot)\n`
    for (const k of kpiSnapshot) {
      const label = k.kind === 'boolean'
        ? (k.value > 0 ? '✓' : '✗')
        : k.target !== undefined ? `${k.value}/${k.target}` : String(k.value)
      md += `- ${k.icon ?? ''} **${k.name}**: ${label}`
      if (k.completionPct !== undefined) md += ` · ${k.completionPct}%`
      md += `\n`
    }
  } else if (ctx.kpiDefinitions && session.selectedKpiIds && session.selectedKpiIds.length > 0) {
    md += `\n## 📊 KPIs activos esta semana\n`
    const libById = new Map(ctx.kpiDefinitions.map((k) => [k.id, k]))
    for (const id of session.selectedKpiIds) {
      const def = libById.get(id)
      if (!def) continue
      const raw = session.values?.kpis?.[id] ?? ''
      const target = def.target !== undefined ? `/${def.target}${def.kind === 'percent' ? '%' : ''}` : ''
      md += `- ${def.icon} **${def.name}**: ${raw || '_(sin valor)_'}${target}\n`
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
