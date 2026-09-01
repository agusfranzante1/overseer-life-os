/** `get_metas_incompletas` — el espacio que está declarado y sin llenar.
 *
 *  Pedido textual del usuario: *"quiero tener el espacio para completar con la
 *  cifra o el objetivo que yo tenga. Si no hay objetivo, está el espacio, vos
 *  te das cuenta, me pedís que lo complete. Así con trading, así con DRM"*.
 *
 *  ── POR QUÉ NO SE LLAMA `get_huecos` ─────────────────────────────────────
 *  Porque "hueco" ya significa otra cosa en este bridge: `freeSlots.ts` calcula
 *  los **huecos libres de la agenda** y así los llama `get_agenda`. Dos tools
 *  con el mismo sustantivo y sentidos distintos es una confusión garantizada.
 *
 *  ── LAS TRES REGLAS QUE LO ORDENAN ───────────────────────────────────────
 *
 *  1. **Read-only y sin rellenar nada.** Devuelve un PLAN de escritura
 *     (`completarCon`, ejecutable tal cual) y la pregunta a hacer. Nunca el
 *     valor. Inventarle un objetivo numérico al usuario es peor que dejarlo
 *     vacío: después se mide contra él y el resultado no significa nada.
 *
 *  2. **No es la manguera.** El SPI más los cinco niveles suman ~90 campos.
 *     Volcarlos todos reproduce exactamente lo que él dijo del programa
 *     anterior: *"completar, completar, y al final no ver nada, porque son
 *     muchos datos"*. Por eso el default es `soloEmpezadas`: se reportan los
 *     huecos de secciones donde YA escribió algo — que es donde de verdad
 *     declaró una intención y la dejó a medias.
 *
 *  3. **Un array vacío por no haber podido mirar es un fallo silencioso**
 *     (BASE nº6) — indistinguible de "está todo completo". Si falta la
 *     plantilla, si un plan está cerrado, si un carril no está elegido: va en
 *     `avisos`, no se omite.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { ALL_TEMPLATES } from '@/lib/projection/templates'
import { DEFAULT_SPI_TEMPLATE } from '@/lib/spi/template'
import type { SPISection, SectionField } from '@/lib/spi/types'
import { detectarHueco, preguntaPara, type Hueco } from './huecosText'
import { lastSaturdayYmd, isYmd } from './spiWeek'
import { periodKeyActual, type ProjectionLevel } from './projectionWrites'

const NIVEL_ES: Record<string, string> = {
  year: 'año', semester: 'semestre', quarter: 'trimestre', month: 'mes', week: 'semana',
}

export interface HuecoReportado {
  id: string
  tipo: Hueco['tipo'] | 'kpi_sin_meta' | 'kpi_sin_valor'
  confianza: Hueco['confianza']
  faltaQue: string
  nivel: string
  periodo: string
  seccion: { key: string; titulo: string }
  campo: { key: string; label: string; type: string }
  valorActual: string | null
  porQue: string
  pregunta: string
  completarCon: { tool: string; args: Record<string, unknown> }
  ruta: string
}

/** Aplana las subsecciones: el template las anida y los `values` no. */
function planas(secciones: SPISection[]): SPISection[] {
  const out: SPISection[] = []
  const visitar = (s: SPISection) => {
    out.push(s)
    for (const sub of s.subsections ?? []) visitar(sub)
  }
  for (const s of secciones) visitar(s)
  return out
}

/** Un campo `score` vacío no es lo mismo que una meta sin cifra: son escalas
 *  1-10 de autoevaluación y llenarlas es del usuario, no una meta pendiente. */
const TIPOS_IGNORADOS = new Set(['score'])

/** Un campo que el propio template llama "opcional" no es un hueco: es una
 *  ranura de más, a propósito. Reportarla es ruido. */
function esOpcional(label: string): boolean {
  return /\(opcional\)|\bopcional$/i.test(label.trim())
}

function revisarPlan(args: {
  nivel: string
  periodo: string
  secciones: SPISection[]
  values: Record<string, Record<string, string>>
  carriles: string[] | null
  tool: string
  argsBase: Record<string, unknown>
  soloEmpezadas: boolean
  avisos: string[]
}): HuecoReportado[] {
  const { nivel, periodo, secciones, values, carriles, tool, argsBase, soloEmpezadas, avisos } = args
  const out: HuecoReportado[] = []
  const nivelEs = NIVEL_ES[nivel] ?? nivel

  for (const sec of planas(secciones)) {
    const campos = sec.fields ?? []
    if (campos.length === 0) continue

    // Un carril no elegido no es un hueco: es una parte que decidió no hacer.
    if (carriles && sec.laneKey && !carriles.includes(sec.laneKey)) {
      continue
    }

    const cargados = values[sec.key] ?? {}
    const empezada = Object.values(cargados).some((v) => String(v ?? '').trim() !== '')
    if (soloEmpezadas && !empezada) continue

    for (const campo of campos as SectionField[]) {
      if (TIPOS_IGNORADOS.has(campo.type)) continue
      if (esOpcional(campo.label ?? '')) continue
      const valor = cargados[campo.key]

      // Si la sección está empezada, un campo AUSENTE también es hueco: quiso
      // llenar esa sección y este quedó sin tocar.
      const h = detectarHueco(valor)
      if (!h) continue
      if (h.tipo === 'vacio' && !empezada) continue

      out.push({
        id: `${nivel}:${periodo}:${sec.key}:${campo.key}`,
        tipo: h.tipo,
        confianza: h.confianza,
        faltaQue: h.faltaQue,
        nivel: nivelEs,
        periodo,
        seccion: { key: sec.key, titulo: sec.title },
        campo: { key: campo.key, label: campo.label, type: campo.type },
        valorActual: valor === undefined ? null : String(valor),
        porQue: porQue(h),
        pregunta: preguntaPara(h, { seccion: sec.title, campo: campo.label, periodo: `${nivelEs} ${periodo}` }),
        completarCon: {
          tool,
          args: { ...argsBase, values: { [sec.key]: { [campo.key]: '<lo que responda>' } } },
        },
        ruta: `${sec.title} › ${campo.label}`,
      })
    }
  }

  if (out.length === 0 && Object.keys(values).length === 0) {
    avisos.push(`El plan de ${nivelEs} ${periodo} está completamente vacío: no hay ninguna sección empezada. Pasá \`todo: true\` para ver sus campos igual.`)
  }
  return out
}

function porQue(h: Hueco): string {
  switch (h.tipo) {
    case 'vacio': return 'El campo está en blanco pero la sección ya tiene otras respuestas cargadas.'
    case 'placeholder': return `Quedó un marcador de "lo completo después" (${h.evidencia}).`
    case 'cifra_faltante': return `Hay un símbolo de moneda o una cantidad sin número detrás (${h.evidencia}). El objetivo está declarado; la cifra no.`
    case 'fecha_faltante': return `Hay una promesa de fecha sin fecha (${h.evidencia}).`
  }
}

// ---------------------------------------------------------------------------

export async function getMetasIncompletas(userId: string, input: Record<string, unknown> = {}) {
  const sb = getSupabaseAdmin()
  const soloEmpezadas = input.todo !== true
  const limite = Math.min(Math.max(Number(input.limit) || 40, 1), 200)
  const semanaSpi = typeof input.weekStartDate === 'string' && isYmd(input.weekStartDate)
    ? input.weekStartDate : lastSaturdayYmd()

  const avisos: string[] = []
  const huecos: HuecoReportado[] = []

  const enCurso: Record<ProjectionLevel, string> = {
    year: periodKeyActual('year'),
    semester: periodKeyActual('semester'),
    quarter: periodKeyActual('quarter'),
    month: periodKeyActual('month'),
  }

  const [planesRes, sesionRes, templateRes, kpisRes] = await Promise.all([
    sb.from('projection_plans').select('level, period_key, payload').eq('user_id', userId)
      .in('period_key', Object.values(enCurso)),
    sb.from('spi_sessions').select('payload').eq('user_id', userId).eq('week_start_date', semanaSpi).maybeSingle(),
    sb.from('spi_template').select('payload').eq('user_id', userId).maybeSingle(),
    sb.from('kpis').select('payload').eq('user_id', userId),
  ])

  if (planesRes.error) avisos.push(`No se pudieron leer los planes de proyección: ${planesRes.error.message}`)

  // ── Proyección: año / semestre / trimestre / mes ────────────────────────
  const porClave = new Map((planesRes.data ?? []).map((r) => [`${r.level}:${r.period_key}`, r]))
  for (const nivel of ['year', 'semester', 'quarter', 'month'] as ProjectionLevel[]) {
    const periodo = enCurso[nivel]
    const fila = porClave.get(`${nivel}:${periodo}`)
    const tpl = ALL_TEMPLATES[nivel]
    if (!tpl) { avisos.push(`No hay plantilla para el nivel ${nivel}.`); continue }

    if (!fila) {
      avisos.push(`Todavía no existe el plan de ${NIVEL_ES[nivel]} ${periodo}. Se crea con update_projection y ahí se pueden cargar sus metas.`)
      continue
    }
    const p = (fila.payload ?? {}) as { values?: Record<string, Record<string, string>>; closedAt?: string; selectedLanes?: string[] }
    if (p.closedAt) {
      avisos.push(`El plan de ${NIVEL_ES[nivel]} ${periodo} está cerrado (${p.closedAt}): sus huecos no se pueden completar desde el bridge.`)
      continue
    }
    huecos.push(...revisarPlan({
      nivel, periodo,
      secciones: tpl.sections ?? [],
      values: p.values ?? {},
      carriles: (tpl.lanes?.length ?? 0) > 0 ? (p.selectedLanes ?? []) : null,
      tool: 'update_projection',
      argsBase: { level: nivel, periodKey: periodo },
      soloEmpezadas, avisos,
    }))
  }

  // ── La semana del SPI ───────────────────────────────────────────────────
  if (templateRes.error) {
    avisos.push(`No se pudo leer tu plantilla de SPI (${templateRes.error.message}); se usa la plantilla por defecto, así que las secciones que hayas personalizado pueden no coincidir.`)
  }
  const spiTpl = (templateRes.data?.payload as typeof DEFAULT_SPI_TEMPLATE | undefined) ?? DEFAULT_SPI_TEMPLATE
  const ses = (sesionRes.data?.payload ?? null) as
    | { values?: Record<string, Record<string, string>>; selectedLanes?: string[]; selectedKpiIds?: string[]; closedAt?: string }
    | null

  if (!ses) {
    avisos.push(`No existe la sesión de SPI de la semana del sábado ${semanaSpi}. Se crea con ensure_spi_week.`)
  } else if (ses.closedAt) {
    avisos.push(`La semana ${semanaSpi} ya está cerrada: sus huecos no se pueden completar desde el bridge.`)
  } else {
    huecos.push(...revisarPlan({
      nivel: 'week', periodo: semanaSpi,
      secciones: spiTpl.sections ?? [],
      values: ses.values ?? {},
      carriles: ses.selectedLanes ?? [],
      tool: 'update_spi_week',
      argsBase: { weekStartDate: semanaSpi },
      soloEmpezadas, avisos,
    }))
  }

  // ── KPIs: declarados sin meta, y encendidos sin valor ───────────────────
  const defs = (kpisRes.data ?? []).map((r) => (r.payload ?? {}) as {
    id: string; name: string; icon?: string; kind?: string; target?: number
    cumulativeTarget?: number; cumulativeDeadline?: string; archivedAt?: string
  })
  const encendidos = new Set(ses?.selectedKpiIds ?? [])
  const valoresKpi = ses?.values?.kpis ?? {}

  for (const k of defs) {
    if (k.archivedAt) continue
    // Un KPI `boolean` no lleva target: su meta implícita es "cumplir".
    if (k.kind !== 'boolean' && (k.target === undefined || k.target === null)) {
      huecos.push({
        id: `kpi:${k.id}:target`,
        tipo: 'kpi_sin_meta', confianza: 'alta', faltaQue: 'la meta semanal',
        nivel: 'KPI', periodo: '—',
        seccion: { key: 'kpis', titulo: 'Biblioteca de KPIs' },
        campo: { key: 'target', label: k.name, type: 'number' },
        valorActual: null,
        porQue: 'El KPI está definido pero no tiene meta, así que el scoreboard no puede decir si lo cumpliste.',
        pregunta: `El KPI "${`${k.icon ?? ''} ${k.name}`.trim()}" no tiene meta semanal. ¿Cuál ponemos?`,
        completarCon: { tool: 'upsert_kpi', args: { kpiId: k.id, target: '<el número>' } },
        ruta: `KPIs › ${k.name} › meta semanal`,
      })
    }
    if (k.cumulativeTarget && !k.cumulativeDeadline) {
      huecos.push({
        id: `kpi:${k.id}:deadline`,
        tipo: 'kpi_sin_meta', confianza: 'media', faltaQue: 'la fecha tope',
        nivel: 'KPI', periodo: '—',
        seccion: { key: 'kpis', titulo: 'Biblioteca de KPIs' },
        campo: { key: 'cumulativeDeadline', label: k.name, type: 'date' },
        valorActual: null,
        porQue: `Tiene meta acumulada (${k.cumulativeTarget}) pero sin fecha tope, así que no se puede decir si vas en hora o atrasado.`,
        pregunta: `"${k.name}" tiene meta acumulada de ${k.cumulativeTarget} pero sin fecha. ¿Para cuándo?`,
        completarCon: { tool: 'upsert_kpi', args: { kpiId: k.id, cumulativeDeadline: '<YYYY-MM-DD>' } },
        ruta: `KPIs › ${k.name} › fecha tope`,
      })
    }
    if (encendidos.has(k.id) && !String(valoresKpi[k.id] ?? '').trim()) {
      huecos.push({
        id: `kpi:${k.id}:valor:${semanaSpi}`,
        tipo: 'kpi_sin_valor', confianza: 'alta', faltaQue: 'el valor de la semana',
        nivel: 'semana', periodo: semanaSpi,
        seccion: { key: 'kpis', titulo: 'KPIs de la semana' },
        campo: { key: k.id, label: k.name, type: 'number' },
        valorActual: null,
        porQue: 'Está encendido para esta semana pero sin número cargado: no puntúa.',
        pregunta: `¿Cuánto marcaste esta semana en "${k.name}"${k.target ? ` (meta ${k.target})` : ''}?`,
        completarCon: { tool: 'set_kpi_value', args: { weekStartDate: semanaSpi, kpiId: k.id, value: '<el número>' } },
        ruta: `SPI ${semanaSpi} › KPIs › ${k.name}`,
      })
    }
  }

  // Primero lo inequívoco, y dentro de eso lo más chico primero (una cifra que
  // falta se contesta en cinco segundos; un campo en blanco cuesta pensar).
  const ORDEN: Record<string, number> = {
    cifra_faltante: 0, kpi_sin_valor: 1, kpi_sin_meta: 2, placeholder: 3, fecha_faltante: 4, vacio: 5,
  }
  huecos.sort((a, b) => {
    if (a.confianza !== b.confianza) return a.confianza === 'alta' ? -1 : 1
    return (ORDEN[a.tipo] ?? 9) - (ORDEN[b.tipo] ?? 9)
  })

  const truncado = huecos.length > limite
  const porTipo: Record<string, number> = {}
  const porNivel: Record<string, number> = {}
  for (const h of huecos) {
    porTipo[h.tipo] = (porTipo[h.tipo] ?? 0) + 1
    porNivel[h.nivel] = (porNivel[h.nivel] ?? 0) + 1
  }

  return {
    hoy: new Date().toISOString().slice(0, 10),
    periodos: { ...enCurso, semanaSpi },
    modo: soloEmpezadas ? 'solo secciones ya empezadas (pasá todo:true para ver el resto)' : 'todo',
    resumen: { total: huecos.length, porTipo, porNivel, truncado, mostrados: Math.min(huecos.length, limite) },
    avisos,
    huecos: huecos.slice(0, limite),
  }
}
