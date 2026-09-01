/** Proyección: los niveles ESTRATÉGICOS por encima de la semana.
 *
 *     Año (2026)
 *       └── Semestre (2026-H1)
 *            └── Trimestre (2026-Q1)
 *                 └── Mes (2026-09)
 *                      └── Semana SPI (anclada al sábado)
 *
 *  Por qué hacía falta: el usuario dijo *"tengo un SPI mensual también donde
 *  pongo metas, y de esas metas irían los KPIs mensuales"*. Esas metas viven
 *  acá, en `projection_plans`, y el bridge no podía ni leerlas — así que
 *  cualquier objetivo mensual que armáramos por chat nacía desconectado del
 *  lugar donde él los escribe.
 *
 *  ── LO QUE YA HACE SU APP Y NO HAY QUE REINVENTAR ────────────────────────
 *  El `score` **cascadea solo**: el mes promedia los scores de las sesiones
 *  semanales de SPI, el trimestre promedia los meses y el año los trimestres.
 *  O sea que "medir el avance mes a mes" no es un sistema nuevo: es **cerrar
 *  las semanas**. El score de una semana existe únicamente si la sesión se
 *  cierra, y cerrar se cierra en la app (calcula XP y empuja las tareas al task
 *  manager). Ese es el único paso manual que no se puede sacar.
 *
 *  Mismo contrato que `spiWrites.ts`: se MERGEA campo por campo, `updated_at`
 *  se bumpea en la columna y en el payload (BASE nº1), y editar un plan ya
 *  cerrado se rechaza.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import type { WriteResult } from './writes'

export type ProjectionLevel = 'year' | 'semester' | 'quarter' | 'month'

interface PlanPayload {
  id: string
  level: string
  periodKey: string
  createdAt: string
  updatedAt: string
  closedAt?: string
  values: Record<string, Record<string, string>>
  templateVersion: number
  selectedLanes?: string[]
  notes?: string
  score?: number
  [k: string]: unknown
}

/** Cada nivel tiene su propia forma de clave y son string-ordenables a
 *  propósito. Validarlas importa: una clave mal formada crea un plan que la app
 *  no encuentra nunca (busca por `periodKey` exacto) y parece que se perdió. */
const FORMATO: Record<ProjectionLevel, RegExp> = {
  year: /^\d{4}$/,
  semester: /^\d{4}-H[12]$/,
  quarter: /^\d{4}-Q[1-4]$/,
  month: /^\d{4}-(0[1-9]|1[0-2])$/,
}

export function periodKeyActual(level: ProjectionLevel, now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  switch (level) {
    case 'year': return String(y)
    case 'semester': return `${y}-H${m <= 6 ? 1 : 2}`
    case 'quarter': return `${y}-Q${Math.floor((m - 1) / 3) + 1}`
    case 'month': return `${y}-${String(m).padStart(2, '0')}`
  }
}

function bridgeId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
}

// ---------------------------------------------------------------------------
// get_projection
// ---------------------------------------------------------------------------

/** Los planes estratégicos con sus metas cargadas. Sin argumentos devuelve el
 *  año, semestre, trimestre y mes EN CURSO — que es lo que se necesita para
 *  colgar los objetivos de la semana de algo más grande. */
export async function getProjection(userId: string, input: Record<string, unknown> = {}) {
  const sb = getSupabaseAdmin()
  const level = typeof input.level === 'string' ? input.level : ''
  const periodKey = typeof input.periodKey === 'string' ? input.periodKey.trim() : ''

  let q = sb.from('projection_plans').select('*').eq('user_id', userId)
  if (level) q = q.eq('level', level)
  if (periodKey) q = q.eq('period_key', periodKey)
  const { data, error } = await q.order('period_key', { ascending: false }).limit(40)
  if (error) return { error: 'db_error', detail: error.message }

  const enCurso = new Set(
    (['year', 'semester', 'quarter', 'month'] as ProjectionLevel[]).map((l) => periodKeyActual(l)),
  )

  const planes = (data ?? []).map((r) => {
    const p = (r.payload ?? {}) as PlanPayload
    return {
      id: r.id as string,
      nivel: (r.level as string) ?? p.level,
      periodo: (r.period_key as string) ?? p.periodKey,
      enCurso: enCurso.has((r.period_key as string) ?? p.periodKey),
      cerrado: !!p.closedAt,
      score: p.score ?? null,
      // Solo las secciones con algo cargado: un plan vacío con 12 secciones en
      // blanco es ruido, y este archivo existe para no producir ruido.
      metas: Object.fromEntries(
        Object.entries(p.values ?? {})
          .map(([sec, campos]) => [
            sec,
            Object.fromEntries(Object.entries(campos ?? {}).filter(([, v]) => String(v ?? '').trim() !== '')),
          ])
          .filter(([, campos]) => Object.keys(campos as object).length > 0),
      ),
      notas: p.notes,
    }
  })

  return {
    enCurso: {
      año: periodKeyActual('year'),
      semestre: periodKeyActual('semester'),
      trimestre: periodKeyActual('quarter'),
      mes: periodKeyActual('month'),
    },
    planes,
    ...(planes.length === 0
      ? { detail: 'No hay ningún plan de proyección cargado todavía. `update_projection` crea el del período que le pases.' }
      : {}),
  }
}

// ---------------------------------------------------------------------------
// update_projection
// ---------------------------------------------------------------------------

export async function updateProjection(userId: string, input: Record<string, unknown>): Promise<WriteResult> {
  const level = String(input.level ?? '').trim() as ProjectionLevel
  if (!FORMATO[level]) {
    return { ok: false, error: 'bad_level', detail: '`level` tiene que ser year | semester | quarter | month.' }
  }
  const periodKey = typeof input.periodKey === 'string' && input.periodKey.trim()
    ? input.periodKey.trim()
    : periodKeyActual(level)
  if (!FORMATO[level].test(periodKey)) {
    return {
      ok: false, error: 'bad_period',
      detail: `"${periodKey}" no es una clave válida de ${level}. Formatos: year "2026", semester "2026-H1", quarter "2026-Q1", month "2026-09". Una clave mal formada crea un plan que la app no encuentra nunca.`,
    }
  }

  const sb = getSupabaseAdmin()
  const { data: fila, error: readErr } = await sb
    .from('projection_plans').select('id, payload')
    .eq('user_id', userId).eq('period_key', periodKey).eq('level', level).maybeSingle()
  if (readErr) return { ok: false, error: 'db_error', detail: readErr.message }

  const now = new Date().toISOString()
  const creado = !fila
  const p: PlanPayload = fila
    ? {
        ...((fila.payload ?? {}) as PlanPayload),
        values: ((fila.payload ?? {}) as PlanPayload).values ?? {},
      }
    : {
        id: bridgeId('prj'), level, periodKey,
        createdAt: now, updatedAt: now, values: {}, templateVersion: 1,
      }

  if (p.closedAt) {
    return {
      ok: false, error: 'plan_cerrado',
      detail: `El plan de ${periodKey} ya está cerrado (${p.closedAt}). Su score ya alimentó al nivel de arriba; reabrilo desde la app si de verdad hace falta.`,
    }
  }

  const cambios: string[] = []
  const warnings: string[] = []

  if (input.values !== undefined) {
    const v = input.values
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      return { ok: false, error: 'bad_values', detail: '`values` es un objeto {sección: {campo: "texto"}}.' }
    }
    for (const [sec, campos] of Object.entries(v as Record<string, unknown>)) {
      if (typeof campos !== 'object' || campos === null || Array.isArray(campos)) {
        warnings.push(`Sección "${sec}" ignorada: tiene que ser un objeto {campo: texto}.`)
        continue
      }
      p.values[sec] = p.values[sec] ?? {}
      for (const [campo, valor] of Object.entries(campos as Record<string, unknown>)) {
        p.values[sec][campo] = valor === null || valor === undefined ? '' : String(valor).slice(0, 5000)
      }
    }
    cambios.push('values')
  }

  if (typeof input.notes === 'string') { p.notes = input.notes.slice(0, 5000); cambios.push('notes') }

  if (input.lanes !== undefined) {
    if (!Array.isArray(input.lanes)) return { ok: false, error: 'bad_lanes', detail: '`lanes` tiene que ser un array.' }
    const lanes = input.lanes.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    p.selectedLanes = [...new Set([...(p.selectedLanes ?? []), ...lanes])]
    cambios.push('selectedLanes')
  }

  if (cambios.length === 0 && !creado) {
    return { ok: false, error: 'nothing_to_do', detail: 'No mandaste ningún campo para cambiar.', warnings }
  }

  p.updatedAt = now   // BASE nº1: el merge LWW mira el payload
  const row = {
    id: p.id, user_id: userId, level, period_key: periodKey,
    created_at: p.createdAt, updated_at: now,
    closed_at: p.closedAt ?? null, payload: p,
  }
  const { error } = await sb.from('projection_plans').upsert(row)
  if (error) return { ok: false, error: 'db_error', detail: error.message }

  return {
    ok: true, creado, nivel: level, periodo: periodKey, cambios,
    secciones: Object.keys(p.values),
    ...(warnings.length > 0 ? { warnings } : {}),
  }
}
