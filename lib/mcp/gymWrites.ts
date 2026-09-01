/** Gimnasio: registrar sesiones y el peso, desde el bridge.
 *
 *  Pedido del 2026-09-01: *"vamos a empezar a llevar el entrenamiento… por lo
 *  menos qué distribución llevo"*. Y el dato que lo justifica: su última sesión
 *  registrada es del **2026-06-23**, más de dos meses atrás — mientras que
 *  entrenó ayer y hoy. No es que no entrene: es que abrir la app, crear la
 *  sesión y cargar los ejercicios no pasa nunca.
 *
 *  ── LO QUE ESTO SÍ RESUELVE ──────────────────────────────────────────────
 *  La DISTRIBUCIÓN, que es lo que él pidió: qué grupo tocó cada día y cuánto
 *  hace que no toca uno. Eso se contesta con la fecha y el nombre de la sesión
 *  (Push / Pull / Leg), sin cargar series ni kilos.
 *
 *  Los ejercicios se aceptan si los dice, pero **son opcionales a propósito**:
 *  exigirlos convierte "decime que entrenaste" en la misma fricción que ya
 *  hizo que dejara de registrar.
 *
 *  ── LO QUE NO HACE ───────────────────────────────────────────────────────
 *  Series, repeticiones y kilos. Eso se carga entrenando, con el celular en la
 *  mano entre serie y serie, y la app ya tiene una sesión activa para eso.
 *  Dictarlos por chat después sería inventar números.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import type { WriteResult } from './writes'
import { isYmd } from './spiWeek'

/** Los grupos que la app usa para clasificar. Se guardan normalizados para que
 *  "espalda" y "Espalda" no cuenten como dos cosas distintas al resumir. */
const GRUPOS: Record<string, string> = {
  pecho: 'Pecho', pectoral: 'Pecho',
  espalda: 'Espalda', dorsal: 'Espalda',
  hombro: 'Hombros', hombros: 'Hombros',
  biceps: 'Bíceps', 'bíceps': 'Bíceps',
  triceps: 'Tríceps', 'tríceps': 'Tríceps',
  pierna: 'Piernas', piernas: 'Piernas', cuadriceps: 'Piernas', 'cuádriceps': 'Piernas',
  gluteo: 'Glúteos', 'glúteo': 'Glúteos', gluteos: 'Glúteos',
  femoral: 'Femorales', femorales: 'Femorales',
  gemelo: 'Gemelos', gemelos: 'Gemelos',
  abdominales: 'Abdominales', abs: 'Abdominales', core: 'Abdominales',
  antebrazo: 'Antebrazos', trapecio: 'Trapecios',
  cardio: 'Cardio',
}

function normalizarGrupo(x: unknown): string {
  const s = String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  return GRUPOS[s] ?? (String(x ?? '').trim() || 'Otro')
}

function bridgeId(): string {
  return `gym${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
}

// ---------------------------------------------------------------------------
// log_workout
// ---------------------------------------------------------------------------

export async function logWorkout(userId: string, input: Record<string, unknown>): Promise<WriteResult> {
  const sb = getSupabaseAdmin()

  const fecha = typeof input.fecha === 'string' && isYmd(input.fecha)
    ? input.fecha
    : new Date().toISOString().slice(0, 10)

  const nombre = typeof input.nombre === 'string' ? input.nombre.trim() : ''
  const grupos = Array.isArray(input.grupos)
    ? [...new Set(input.grupos.map(normalizarGrupo))].filter(Boolean)
    : []

  if (!nombre && grupos.length === 0) {
    return {
      ok: false, error: 'bad_input',
      detail: 'Decime al menos `nombre` (Push / Pull / Leg / Upper / Brazos) o `grupos` (["pecho","triceps"]).',
    }
  }

  // Si no dice el nombre de la rutina pero sí los grupos, se arma con los
  // grupos: mejor "Espalda + Bíceps" que una sesión sin nombre.
  const titulo = nombre || grupos.join(' + ')

  // Se busca la rutina por nombre para vincularla: así la app la muestra
  // adentro de la rutina que ya existe en vez de como una sesión suelta.
  let routineId: string | null = null
  if (nombre) {
    const { data } = await sb.from('gym_routines').select('id, name').eq('user_id', userId)
    const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    routineId = (data ?? []).find((r) => norm(r.name as string) === norm(nombre))?.id as string ?? null
  }

  // Los ejercicios son opcionales. Sin series: cargarlas por chat sería
  // inventar números que él no dictó.
  const ejercicios = (Array.isArray(input.ejercicios) ? input.ejercicios : [])
    .map((e) => {
      const nom = typeof e === 'string' ? e : String((e as Record<string, unknown>)?.nombre ?? (e as Record<string, unknown>)?.name ?? '')
      if (!nom.trim()) return null
      const g = typeof e === 'object' && e !== null
        ? normalizarGrupo((e as Record<string, unknown>).grupo ?? (e as Record<string, unknown>).muscleGroup)
        : (grupos[0] ?? 'Otro')
      return { id: bridgeId(), name: nom.trim().slice(0, 120), muscleGroup: g, sets: [] }
    })
    .filter(Boolean)

  const duracion = Number(input.duracionMin)
  const inicio = `${fecha}T12:00:00.000Z`
  const fin = Number.isFinite(duracion) && duracion > 0
    ? new Date(Date.parse(inicio) + duracion * 60000).toISOString()
    : new Date(Date.parse(inicio) + 60 * 60000).toISOString()

  // Una sesión por día y por nombre: repetir "entrené Push" el mismo día no
  // tiene que dejar dos filas.
  const { data: existentes } = await sb.from('gym_sessions').select('id, name')
    .eq('user_id', userId).eq('date', fecha)
  const yaEsta = (existentes ?? []).find((s) => String(s.name ?? '').toLowerCase() === titulo.toLowerCase())

  const fila = {
    id: (yaEsta?.id as string) ?? bridgeId(),
    user_id: userId,
    date: fecha,
    name: titulo.slice(0, 80),
    routine_id: routineId,
    exercises: ejercicios,
    started_at: inicio,
    ended_at: fin,
    notes: typeof input.notas === 'string' ? input.notas.slice(0, 2000) : null,
  }

  const { error } = await sb.from('gym_sessions').upsert(fila)
  if (error) return { ok: false, error: 'db_error', detail: error.message }

  return {
    ok: true,
    actualizada: !!yaEsta,
    sesion: {
      fecha, nombre: fila.name,
      grupos: grupos.length ? grupos : undefined,
      ejercicios: ejercicios.length,
      vinculadaARutina: routineId ? nombre : undefined,
    },
    ...(nombre && !routineId
      ? { aviso: `No existe una rutina llamada "${nombre}" en tu Overseer (las que hay: Push, Pull, Leg, Upper, Brazos). La sesión se guarda igual, suelta.` }
      : {}),
  }
}

// ---------------------------------------------------------------------------
// get_workout_split — la distribución, que es lo que él pidió
// ---------------------------------------------------------------------------

/** Qué entrenó cada día y **cuánto hace que no toca cada grupo**. Ese segundo
 *  número es el que sirve: un split se rompe por lo que se deja de hacer, no
 *  por lo que se hace. */
export async function getWorkoutSplit(userId: string, input: Record<string, unknown> = {}) {
  const sb = getSupabaseAdmin()
  const dias = Math.min(Math.max(Number(input.dias) || 21, 1), 180)
  const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10)

  const { data, error } = await sb.from('gym_sessions')
    .select('date, name, exercises, ended_at, started_at')
    .eq('user_id', userId).gte('date', desde).order('date', { ascending: false })
  if (error) return { error: 'db_error', detail: error.message }

  const hoy = new Date().toISOString().slice(0, 10)
  const diasDesde = (f: string) => Math.round((Date.parse(hoy) - Date.parse(f)) / 86400000)

  const sesiones = (data ?? []).map((s) => {
    const ex = Array.isArray(s.exercises) ? (s.exercises as { muscleGroup?: string }[]) : []
    return {
      fecha: s.date as string,
      hace: diasDesde(s.date as string),
      nombre: s.name as string,
      grupos: [...new Set(ex.map((e) => e.muscleGroup).filter(Boolean))],
      ejercicios: ex.length,
    }
  })

  // Última vez que tocó cada grupo — por nombre de sesión y por grupo cargado.
  const ultima: Record<string, number> = {}
  for (const s of sesiones) {
    for (const g of [...s.grupos, s.nombre]) {
      const k = String(g)
      if (ultima[k] === undefined || s.hace < ultima[k]) ultima[k] = s.hace
    }
  }

  const porSemana: Record<string, number> = {}
  for (const s of sesiones) {
    const semana = new Date(Date.parse(s.fecha) - ((new Date(s.fecha + 'T12:00:00Z').getUTCDay() + 6) % 7) * 86400000)
      .toISOString().slice(0, 10)
    porSemana[semana] = (porSemana[semana] ?? 0) + 1
  }

  return {
    ventanaDias: dias,
    total: sesiones.length,
    ultimaSesion: sesiones[0] ? `${sesiones[0].fecha} (hace ${sesiones[0].hace} días) — ${sesiones[0].nombre}` : null,
    diasDesdeLaUltima: sesiones[0]?.hace ?? null,
    sesionesPorSemana: porSemana,
    ultimaVezPorGrupo: Object.fromEntries(
      Object.entries(ultima).sort((a, b) => a[1] - b[1]).map(([g, d]) => [g, d === 0 ? 'hoy' : `hace ${d} días`]),
    ),
    sesiones,
  }
}
