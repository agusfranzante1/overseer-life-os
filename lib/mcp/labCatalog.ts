/** El CATÁLOGO del Laboratorio: los ejercicios y las categorías.
 *
 *  Distinto de `dataWrites.ts`, que maneja las SESIONES (lo que se completa al
 *  correr un ejercicio). Acá viven las plantillas.
 *
 *  ── Dos orígenes, y la diferencia importa ──
 *
 *  - **Los de fábrica** (`LAB_EXERCISES` / `LAB_CATEGORIES` en templates.ts)
 *    viven en el CÓDIGO. Se leen, no se editan: cambiarlos es un deploy.
 *  - **Los propios** viven en `lab_config`, una fila ÚNICA por usuario con dos
 *    arrays jsonb (`custom_exercises`, `custom_categories`).
 *
 *  El cliente los resuelve con `findExerciseAnywhere`: primero busca en los
 *  propios y después en los de fábrica. Es decir que **un ejercicio propio con
 *  la misma `key` que uno de fábrica lo TAPA** — que es la única forma de
 *  "editar" uno de fábrica, y así lo hace la app.
 *
 *  ⚠️ LA TRAMPA: `lab_config` es una FILA-BLOB. Escribir el array entero pisa
 *  los ejercicios que este proceso no conoce. Es exactamente lo que borró la
 *  configuración del sidebar del usuario en todos sus dispositivos (BASE nº3).
 *  Por eso acá SIEMPRE se lee lo que hay, se mergea encima por `key`, y recién
 *  ahí se escribe. Nunca se manda el array armado desde cero.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { LAB_EXERCISES, LAB_CATEGORIES } from '@/lib/lab/templates'
import type { LabExercise, LabCategory } from '@/lib/lab/types'
import type { WriteResult } from './writes'

const TIPOS_CAMPO = ['text', 'textarea', 'select', 'checklist', 'score'] as const

interface ConfigRow {
  custom_exercises: LabExercise[] | null
  custom_categories: LabCategory[] | null
}

async function leerConfig(userId: string): Promise<{ ejercicios: LabExercise[]; categorias: LabCategory[] } | { error: string }> {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('lab_config')
    .select('custom_exercises, custom_categories')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return { error: `${error.message} — ¿falta correr migration_lab_config.sql?` }
  const row = (data ?? {}) as Partial<ConfigRow>
  return {
    ejercicios: Array.isArray(row.custom_exercises) ? row.custom_exercises : [],
    categorias: Array.isArray(row.custom_categories) ? row.custom_categories : [],
  }
}

/** Escribe SOLO la clave que cambió, sobre lo que ya había leído el caller.
 *  No existe una versión que arme el array desde cero a propósito. */
async function guardarConfig(
  userId: string,
  patch: { ejercicios?: LabExercise[]; categorias?: LabCategory[] },
): Promise<string | null> {
  const sb = getSupabaseAdmin()
  const fila: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() }
  if (patch.ejercicios) fila.custom_exercises = patch.ejercicios
  if (patch.categorias) fila.custom_categories = patch.categorias
  const { error } = await sb.from('lab_config').upsert(fila, { onConflict: 'user_id' })
  return error ? `${error.message} — ¿falta correr migration_lab_config.sql?` : null
}

function contarCampos(ex: LabExercise): number {
  return (ex.fields?.length ?? 0) + (ex.steps ?? []).reduce((n, s) => n + (s.fields?.length ?? 0), 0)
}

// ─── LECTURA ────────────────────────────────────────────────────────────────

export async function listLabExercises(
  userId: string,
  input: { categoria?: unknown; completo?: unknown; key?: unknown } = {},
): Promise<WriteResult> {
  const cfg = await leerConfig(userId)
  if ('error' in cfg) return { ok: false, error: 'db_error', detail: cfg.error }

  // Los propios primero: uno con la misma key TAPA al de fábrica, igual que
  // hace `findExerciseAnywhere` en el cliente.
  const propios = cfg.ejercicios.map((e) => ({ ...e, origen: 'propio' as const }))
  const keysPropias = new Set(propios.map((e) => e.key))
  const fabrica = LAB_EXERCISES.filter((e) => !keysPropias.has(e.key)).map((e) => ({ ...e, origen: 'fabrica' as const }))

  let todos = [...propios, ...fabrica]
  if (input.key) todos = todos.filter((e) => e.key === String(input.key))
  if (input.categoria) todos = todos.filter((e) => e.categoryKey === String(input.categoria))

  // Por default se devuelve el resumen: el detalle completo de 30 ejercicios
  // con todos sus pasos y campos es una respuesta impagable.
  const completo = input.completo === true || Boolean(input.key)
  const ejercicios = completo ? todos : todos.map((e) => ({
    key: e.key,
    origen: e.origen,
    categoryKey: e.categoryKey,
    emoji: e.emoji,
    title: e.title,
    shortDescription: e.shortDescription,
    pasos: e.steps?.length ?? 0,
    campos: contarCampos(e),
    isQuick: e.isQuick ?? false,
  }))

  return {
    ok: true,
    total: ejercicios.length,
    propios: propios.length,
    deFabrica: fabrica.length,
    ...(completo ? {} : { nota: 'Resumen. Pasá `completo: true` o una `key` para ver los pasos y campos.' }),
    ejercicios,
  }
}

export async function listLabCategories(userId: string): Promise<WriteResult> {
  const cfg = await leerConfig(userId)
  if ('error' in cfg) return { ok: false, error: 'db_error', detail: cfg.error }

  const keysPropias = new Set(cfg.categorias.map((c) => c.key))
  const todas = [
    ...cfg.categorias.map((c) => ({ ...c, origen: 'propio' as const })),
    ...LAB_CATEGORIES.filter((c) => !keysPropias.has(c.key)).map((c) => ({ ...c, origen: 'fabrica' as const })),
  ]

  const propios = cfg.ejercicios
  const cuenta = (k: string) =>
    propios.filter((e) => e.categoryKey === k).length +
    LAB_EXERCISES.filter((e) => e.categoryKey === k && !propios.some((p) => p.key === e.key)).length

  return {
    ok: true,
    total: todas.length,
    categorias: todas.map((c) => ({ ...c, ejercicios: cuenta(c.key) })),
  }
}

// ─── VALIDACIÓN ─────────────────────────────────────────────────────────────

function validarEjercicio(ex: Partial<LabExercise>): string | null {
  if (!ex.title || !String(ex.title).trim()) return 'Falta `title`.'
  if (!ex.categoryKey) return 'Falta `categoryKey`. Miralas con list_lab_categories.'
  if (!ex.fields?.length && !ex.steps?.length) {
    return 'Un ejercicio sin `fields` ni `steps` no tiene nada para completar: no sirve para nada.'
  }
  const revisar = [...(ex.fields ?? []), ...(ex.steps ?? []).flatMap((s) => s.fields ?? [])]
  for (const f of revisar) {
    if (!f?.key) return 'Todos los campos necesitan `key`.'
    if (!f.label) return `El campo "${f.key}" no tiene \`label\`.`
    if (!TIPOS_CAMPO.includes(f.type)) {
      return `El campo "${f.key}" tiene type "${String(f.type)}". Los válidos: ${TIPOS_CAMPO.join(', ')}.`
    }
    if (f.type === 'select' && !f.options?.length) {
      // Un select sin opciones se renderiza vacío y el usuario no puede
      // responder: mejor fallar acá que dejarlo inservible en la app.
      return `El campo "${f.key}" es select y no tiene \`options\`.`
    }
  }
  // Las keys duplicadas hacen que dos campos escriban en el mismo lugar y uno
  // pise al otro al completar la sesión.
  const keys = revisar.map((f) => f.key)
  const dup = keys.find((k, i) => keys.indexOf(k) !== i)
  if (dup) return `La key de campo "${dup}" está repetida. Cada campo necesita una única.`

  if (ex.titleField?.fieldKey && !keys.includes(ex.titleField.fieldKey)) {
    return `\`titleField\` apunta a "${ex.titleField.fieldKey}", que no existe entre los campos.`
  }
  return null
}

// ─── ALTA Y MODIFICACIÓN ────────────────────────────────────────────────────

export async function upsertLabExercise(
  userId: string,
  input: { key?: unknown; ejercicio?: unknown },
): Promise<WriteResult> {
  const cfg = await leerConfig(userId)
  if ('error' in cfg) return { ok: false, error: 'db_error', detail: cfg.error }

  const datos = (input.ejercicio ?? {}) as Partial<LabExercise>
  if (typeof datos !== 'object' || Array.isArray(datos)) {
    return { ok: false, error: 'bad_input', detail: 'Falta `ejercicio` (objeto).' }
  }

  const key = input.key ? String(input.key) : (datos.key ? String(datos.key) : null)
  const existentePropio = key ? cfg.ejercicios.find((e) => e.key === key) : undefined
  const deFabrica = key ? LAB_EXERCISES.find((e) => e.key === key) : undefined

  // Editar un ejercicio de FÁBRICA crea una copia propia que lo tapa — es la
  // única forma que existe, porque los de fábrica están en el código.
  const base: Partial<LabExercise> = existentePropio ?? deFabrica ?? {}
  const tapaFabrica = !existentePropio && Boolean(deFabrica)

  const ex: LabExercise = {
    ...(base as LabExercise),
    ...datos,
    key: key ?? 'custom_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
  } as LabExercise
  ex.emoji = ex.emoji || '🧪'
  ex.shortDescription = ex.shortDescription || ''

  const problema = validarEjercicio(ex)
  if (problema) return { ok: false, error: 'bad_input', detail: problema }

  const categoriasValidas = new Set([...LAB_CATEGORIES.map((c) => c.key), ...cfg.categorias.map((c) => c.key)])
  if (!categoriasValidas.has(ex.categoryKey)) {
    return {
      ok: false, error: 'bad_input',
      detail: `La categoría "${ex.categoryKey}" no existe. Las que hay: ${[...categoriasValidas].join(', ')}.`,
    }
  }

  // MERGE, no reemplazo: se toca solo esta key y el resto del array queda como
  // estaba (BASE nº3 — así se perdió la config del sidebar).
  const ejercicios = existentePropio
    ? cfg.ejercicios.map((e) => (e.key === ex.key ? ex : e))
    : [ex, ...cfg.ejercicios]

  const err = await guardarConfig(userId, { ejercicios })
  if (err) return { ok: false, error: 'db_error', detail: err }

  return {
    ok: true,
    creado: !existentePropio,
    key: ex.key,
    ejercicio: ex,
    pasos: ex.steps?.length ?? 0,
    campos: contarCampos(ex),
    totalPropios: ejercicios.length,
    ...(tapaFabrica ? {
      aviso: `Se creó una copia PROPIA de "${ex.key}", que tapa al de fábrica. Los de fábrica viven en el código y no se pueden editar directo; esta copia es la que va a usar la app de ahora en más.`,
    } : {}),
  }
}

export async function upsertLabCategory(
  userId: string,
  input: { key?: unknown; categoria?: unknown },
): Promise<WriteResult> {
  const cfg = await leerConfig(userId)
  if ('error' in cfg) return { ok: false, error: 'db_error', detail: cfg.error }

  const datos = (input.categoria ?? {}) as Partial<LabCategory>
  const key = input.key ? String(input.key) : (datos.key ? String(datos.key) : null)
  const existente = key ? cfg.categorias.find((c) => c.key === key) : undefined
  const fabrica = key ? LAB_CATEGORIES.find((c) => c.key === key) : undefined

  const cat: LabCategory = {
    ...(existente ?? fabrica ?? {}),
    ...datos,
    key: key ?? 'cat_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
  } as LabCategory
  if (!cat.title?.trim()) return { ok: false, error: 'bad_input', detail: 'Falta `title`.' }
  cat.emoji = cat.emoji || '🧪'
  cat.color = cat.color || '#6b7280'
  cat.tagline = cat.tagline || ''

  const categorias = existente
    ? cfg.categorias.map((c) => (c.key === cat.key ? cat : c))
    : [...cfg.categorias, cat]

  const err = await guardarConfig(userId, { categorias })
  if (err) return { ok: false, error: 'db_error', detail: err }
  return { ok: true, creada: !existente, key: cat.key, categoria: cat }
}

// ─── BAJA ───────────────────────────────────────────────────────────────────

export async function deleteLabExercise(
  userId: string,
  input: { key?: unknown },
): Promise<WriteResult> {
  const key = String(input.key ?? '').trim()
  if (!key) return { ok: false, error: 'bad_input', detail: 'Falta `key`.' }

  const cfg = await leerConfig(userId)
  if ('error' in cfg) return { ok: false, error: 'db_error', detail: cfg.error }

  const ex = cfg.ejercicios.find((e) => e.key === key)
  if (!ex) {
    const esDeFabrica = LAB_EXERCISES.some((e) => e.key === key)
    return {
      ok: false, error: 'not_found',
      detail: esDeFabrica
        ? `"${key}" es un ejercicio de FÁBRICA: vive en el código y no se puede borrar desde acá. Solo se pueden borrar los propios.`
        : `No existe el ejercicio propio "${key}".`,
    }
  }

  // Las SESIONES que usaron este ejercicio no se tocan. Quedan con su
  // `exerciseKey` apuntando a algo que ya no existe, y eso está bien: el
  // historial de lo que se trabajó no se borra porque se borre la plantilla.
  const sb = getSupabaseAdmin()
  const { count } = await sb
    .from('lab_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('exercise_key', key)

  const ejercicios = cfg.ejercicios.filter((e) => e.key !== key)
  const err = await guardarConfig(userId, { ejercicios })
  if (err) return { ok: false, error: 'db_error', detail: err }

  return {
    ok: true,
    borrado: key,
    title: ex.title,
    quedanPropios: ejercicios.length,
    ...(count ? {
      sesionesQueLoUsaban: count,
      aviso: `Hay ${count} sesión(es) hechas con este ejercicio. NO se borraron: el historial de lo trabajado se conserva aunque la plantilla ya no exista.`,
    } : {}),
  }
}
