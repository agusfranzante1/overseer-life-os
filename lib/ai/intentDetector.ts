export type IntentType =
  | 'greeting'
  | 'question'
  | 'task_create_no_project'
  | 'task_create_with_project'
  | 'execute_complete'
  | 'execute_postpone'
  | 'execute_move'
  | 'execute_polish'
  | 'plan_2h'
  | 'push_tomorrow'
  | 'what_now'
  | 'daily_status'
  | 'clarify_project'
  | 'gym_start_session'
  | 'gym_end_session'
  | 'gym_add_set'
  | 'gym_log_sets'
  | 'gym_switch_exercise'
  | 'gym_batch'
  | 'schedule_update'
  | 'unknown'

export type GymAction =
  | { kind: 'session_start'; name?: string }
  | { kind: 'exercise'; name?: string; sets: number; reps?: number; weight?: number; unit?: 'kg' | 'lb' }

export interface Intent {
  type: IntentType
  raw: string
  extracted: {
    taskTitle?: string
    projectName?: string
    taskId?: string
    exerciseName?: string
    weight?: number
    reps?: number
    unit?: 'kg' | 'lb'
    sessionName?: string
    scheduleKey?: string
    scheduleTime?: string
    gymActions?: GymAction[]
    sets?: { weight: number; reps: number; unit?: 'kg' | 'lb' }[]
  }
}

// Permissive: just needs a schedule keyword + any number in the same message
const SCHEDULE_UPDATE = /\b(almuerzo|comer|almorzar|comida|café|cafe|coffee|merienda|cena|cenar|entrenamiento|entrenar|horario|gym|train|fruta|snack)\b.{0,80}\b\d{1,2}|\b\d{1,2}.{0,80}\b(almuerzo|comer|almorzar|comida|café|cafe|coffee|merienda|cena|cenar|entrenamiento|entrenar|horario|gym|train|fruta|snack)\b/i

const GYM_START = /\b(nueva\s*sesi[oó]n|empez[ao]r?\s*(sesion|entrenamiento|gym)|hagamos\s*(una\s*)?sesi[oó]n|arranc[ao]r?\s*entrenamiento|start\s*(session|workout)|new\s*workout|vamos\s*al\s*gym|estoy\s+haciendo\s+(piernas|pecho|espalda|hombros?|brazos|biceps|b[ií]ceps|triceps|tr[ií]ceps|gl[uú]teos|abdomen|core|push|pull|full\s*body|funcional))\b/i
const GYM_END = /\b(finaliz[ao]r?\s*(sesion|entrenamiento)?|termin[ao]r?\s*sesi[oó]n|listo.*gym|fin\s*de\s*sesion|end\s*session|finish\s*workout)\b/i
const GYM_SWITCH = /\b(ahora\s*(pasamos|vamos|toca|cambi[eo])\s*[a-z]+|vamos\s*con|pasamos\s*a|cambi[eo]\s+(?:de\s+)?ejercicio|siguiente\s*ejercicio|now\s*(doing|moving\s*to))\b/i

// Strong split markers — when present, message contains multiple exercise descriptions
const GYM_EXERCISE_MARKER = /\b((?:el\s+)?(?:primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|quint[oa]|sext[oa]|s[eé]ptim[oa]|octav[oa]|noven[oa]|d[eé]cim[oa])\s+ejercicio|nuevo\s+ejercicio|siguiente\s+ejercicio|otro\s+ejercicio|cambi[eo]\s+(?:de\s+)?ejercicio)\b/gi
// "N series de M reps" pattern — indicates explicit set count
const GYM_HAS_SERIES = /\b\d+\s+(?:series?|rondas?|vueltas?)\s+(?:de\s+)?\d+/i
// Matches with OR without verb: "hice sentadilla 80kg 5 reps" OR "press inclinado 20kg 8 repes" OR "3 series 80kg"
const GYM_ADD_SET = /\b(hice|hic[ei]|hic[ei]mos|hac[eé]r|did|puse|pus[ei])\b.*\d|\b\d+\.?\d*\s*(kg|lb)\b.*\b\d+\s*(rep[esa]?s?|repeticiones?)\b|\b\d+\s*(rep[esa]?s?|repeticiones?)\b.*\b\d+\.?\d*\s*(kg|lb)\b/i

const GREETING = /^(hi|hello|hey|good\s+(morning|afternoon|evening|night)|hola|buenas|qué onda|que onda|ola|buen[ao]s)\b/i
const QUESTION = /\?|^(what|how|why|when|where|should|can you|tell me|explain|qué|cómo|cuál|cuándo|dónde|por qué|podés|me podés|explain|ayudame)/i
const COMPLETE = /\b(complete|done|finish|tick|check off|mark.*done|completar|terminar|marcar.*hecha|marcar.*done|tachá|tachar)\b/i
const POSTPONE = /\b(postpone|push.*tomorrow|delay|posponer|mover.*mañana|para mañana|push to tomorrow)\b/i
const MOVE = /\b(move|transfer|mover|pasar)\b.*\b(to|al|a)\b/i
const POLISH = /\b(polish|improve|refine|mejorar|pulir|hacer.*más concreta|refinar)\b/i
const CREATE = /\b(add|create|new task|agregar|crear|nueva tarea|añadir|quiero agregar|necesito agregar)\b/i
const PLAN_2H = /\b(plan.*2h|plan.*2 hours|planificar.*2|plan next|próximas 2)\b/i
const PUSH_TOMORROW = /\b(push.*remaining|mover.*pendientes|move.*remaining|all.*tomorrow|todas.*mañana)\b/i
const WHAT_NOW = /\b(what.*do.*now|qué hago|what do i do|qué hago ahora|what should i|qué conviene|now mode|siguiente|what.*next)\b/i
const DAILY_STATUS = /\b(how.*day|cómo.*día|summary|resumen|status|estado del día|brief)\b/i

export function detectIntent(message: string, knownProjects: string[]): Intent {
  const raw = message.trim()
  const lower = raw.toLowerCase()

  // Short greeting check
  if (GREETING.test(lower) && raw.length < 80 && !CREATE.test(lower)) {
    return { type: 'greeting', raw, extracted: {} }
  }

  // Schedule update
  if (SCHEDULE_UPDATE.test(lower)) {
    const parsed = parseScheduleUpdate(lower)
    if (parsed) return { type: 'schedule_update', raw, extracted: parsed }
  }

  // Gym intents — check before general task creation
  if (GYM_END.test(lower)) return { type: 'gym_end_session', raw, extracted: {} }

  // Batch detection: multi-exercise messages OR explicit "N series" patterns
  const hasExerciseMarker = GYM_EXERCISE_MARKER.test(lower)
  GYM_EXERCISE_MARKER.lastIndex = 0  // reset because /g flag
  if (hasExerciseMarker || GYM_HAS_SERIES.test(lower)) {
    const actions = parseGymBatch(lower)
    if (actions && actions.length > 0) {
      // Single-action batches with set data → keep gym_add_set semantics for compatibility
      if (actions.length === 1 && actions[0].kind === 'exercise') {
        const a = actions[0]
        if (a.reps !== undefined) {
          return {
            type: 'gym_add_set', raw,
            extracted: {
              exerciseName: a.name,
              weight: a.weight ?? 0,
              reps: a.reps,
              unit: a.unit ?? 'kg',
            },
          }
        }
      }
      return { type: 'gym_batch', raw, extracted: { gymActions: actions } }
    }
  }

  if (GYM_START.test(lower)) {
    const nameMatch = lower.match(/(?:sesi[oó]n|entrenamiento|estoy\s+haciendo)\s+(?:de\s+)?([a-záéíóúñ\s]+?)(?=[\.,]|$)/i)
    const sessionName = nameMatch?.[1]?.trim()
    return { type: 'gym_start_session', raw, extracted: { sessionName } }
  }
  // Multi-set in ONE exercise — DON'T let the single-set regex grab this.
  // Signals:
  //   (a) ordinal series markers ("la primera", "segunda serie"...)
  //   (b) multiple weight mentions ("75kg ... 80kg ... 85kg")
  //   (c) chained "X@Y" / "AxB" patterns ("8x80, 6x85")
  //   (d) explicit N-series declarations ("hice 3 series", "4 series de 8")
  // Route through LLM so it returns gym_log_sets with all sets parsed.
  const ordinalSeriesMarker = /\b(primer[ao]?|segund[ao]|tercer[ao]?|cuart[ao]|quint[ao])\s+(serie|set)\b|\bla\s+(primera|segunda|tercera|cuarta|quinta)\b/i
  const multipleWeights = (lower.match(/\b\d+(?:[\.,]\d+)?\s*kg\b/gi) || []).length >= 2
  const setAtPattern = /\b\d+\s*[x×@]\s*\d+(?:[\.,]\d+)?\b.*\b\d+\s*[x×@]\s*\d+(?:[\.,]\d+)?\b/i
  const nSeriesDecl = /\b(\d+|tres|cuatro|cinco|seis|siete|ocho)\s+(series?|sets?)\b/i
  if (
    ordinalSeriesMarker.test(lower) ||
    multipleWeights ||
    setAtPattern.test(lower) ||
    (nSeriesDecl.test(lower) && (GYM_ADD_SET.test(lower) || /\bkg\b/i.test(lower)))
  ) {
    return { type: 'unknown', raw, extracted: {} }
  }
  // gym_add_set before gym_switch — a message with weight+reps is always a set log
  if (GYM_ADD_SET.test(lower)) {
    const parsed = parseGymSet(lower)
    if (parsed) return { type: 'gym_add_set', raw, extracted: parsed }
  }
  // gym_switch only when there are no numbers (pure exercise change message)
  if (GYM_SWITCH.test(lower) && !/\d/.test(lower)) {
    const exerciseName = extractExerciseName(lower)
    return { type: 'gym_switch_exercise', raw, extracted: { exerciseName } }
  }

  // Command-style intents first (most specific)
  if (PLAN_2H.test(lower)) return { type: 'plan_2h', raw, extracted: {} }
  if (PUSH_TOMORROW.test(lower)) return { type: 'push_tomorrow', raw, extracted: {} }
  if (WHAT_NOW.test(lower)) return { type: 'what_now', raw, extracted: {} }
  if (DAILY_STATUS.test(lower)) return { type: 'daily_status', raw, extracted: {} }

  if (COMPLETE.test(lower)) return { type: 'execute_complete', raw, extracted: extractTaskRef(raw) }
  if (POSTPONE.test(lower)) return { type: 'execute_postpone', raw, extracted: extractTaskRef(raw) }
  if (POLISH.test(lower)) return { type: 'execute_polish', raw, extracted: extractTaskRef(raw) }
  if (MOVE.test(lower)) {
    const projectName = knownProjects.find((p) => lower.includes(p.toLowerCase()))
    return { type: 'execute_move', raw, extracted: { ...extractTaskRef(raw), projectName } }
  }

  // Task creation
  if (CREATE.test(lower)) {
    const projectName = knownProjects.find((p) => lower.includes(p.toLowerCase()))
    const taskTitle = extractTaskTitle(raw)
    return projectName
      ? { type: 'task_create_with_project', raw, extracted: { taskTitle, projectName } }
      : { type: 'task_create_no_project', raw, extracted: { taskTitle } }
  }

  // Check for implicit task (contains verb + noun without explicit "add")
  // e.g. "revisar precios" or "update the document"
  const implicitTask = detectImplicitTask(lower, knownProjects)
  if (implicitTask) return implicitTask

  // Question
  if (QUESTION.test(lower)) return { type: 'question', raw, extracted: {} }

  return { type: 'unknown', raw, extracted: {} }
}

function detectImplicitTask(lower: string, knownProjects: string[]): Intent | null {
  // Implicit task: message contains action verb but no question mark and no greeting
  const actionVerbs = /^(revisar|actualizar|enviar|llamar|escribir|preparar|organizar|hacer|terminar|empezar|review|update|send|call|write|prepare|organize|finish|start|check|fix|arreglar|crear|build|deploy|test)/
  if (actionVerbs.test(lower) && !lower.includes('?')) {
    const projectName = knownProjects.find((p) => lower.includes(p.toLowerCase()))
    return {
      type: projectName ? 'task_create_with_project' : 'task_create_no_project',
      raw: lower,
      extracted: { taskTitle: lower, projectName },
    }
  }
  return null
}

function extractTaskTitle(raw: string): string {
  return raw
    .replace(/\b(add|create|new task|agregar|crear|nueva tarea|añadir|quiero agregar|necesito agregar)\b/gi, '')
    .replace(/\b(for|in|to|al|a|en|para)\b\s+\w+.*/i, '')
    .trim()
    .replace(/^[:\-\s]+/, '')
    || raw
}

function extractTaskRef(raw: string): Intent['extracted'] {
  const quoted = raw.match(/["'](.+?)["']/)
  if (quoted) return { taskTitle: quoted[1] }
  // Remove command words and return the rest
  const cleaned = raw
    .replace(/\b(complete|done|finish|completar|terminar|marcar|postpone|posponer|polish|pulir|mejorar)\b/gi, '')
    .replace(/\b(la tarea|the task|tarea)\b/gi, '')
    .trim()
  return { taskTitle: cleaned || raw }
}

// Words that indicate "same exercise, new set" or set-type context — NOT exercise names
const SET_ORDINALS = /^(primer[ao]?|segund[ao]?|tercer[ao]?|cuart[ao]?|quint[ao]?|sext[ao]?|s[eé]ptim[ao]?|octav[ao]?|noven[ao]?|d[eé]cim[ao]?|otra|otro|misma|mismo|igual|siguiente|next|same|last|ejercicio|ejercicios|drop\s*set|dropset|drop|superset|superserie|cluster|bi-?set|giant|[1-9](ra|da|ta|ma|mo|ro)?|y\s*(otra|otro))$/i

function parseGymSet(lower: string): Intent['extracted'] | null {
  // Patterns like: "hice sentadilla 80kg 5 reps", "press inclinado 20kg 8 repes", "3 series 12 reps"
  const numbers = [...lower.matchAll(/(\d+\.?\d*)\s*(kg|lb)?/gi)]
  if (numbers.length < 2) return null

  let weight: number | undefined
  let reps: number | undefined
  let unit: 'kg' | 'lb' = 'kg'

  // Single pass: find FIRST weight and FIRST reps (don't overwrite — first set wins)
  for (const match of numbers) {
    const val = parseFloat(match[1])
    const u = match[2]?.toLowerCase()
    const after = lower.slice(lower.indexOf(match[0]) + match[0].length, lower.indexOf(match[0]) + match[0].length + 25)
    const isReps = /^\s*(rep[esa]?s?|repeticiones?)\b/i.test(after)
    const isSeries = /^\s*(series?|rondas?|vueltas?)\b/i.test(after)

    if ((u === 'kg' || u === 'lb') && weight === undefined) {
      weight = val
      unit = u as 'kg' | 'lb'
    } else if (isReps && reps === undefined) {
      reps = val
    } else if (!isSeries && weight !== undefined && reps === undefined && !u) {
      // Unlabeled number after weight but before any reps label → treat as reps
      reps = val
    }
  }

  // Fallback: if still no explicit unit, larger = weight, smaller = reps
  if (!weight || !reps) {
    const vals = numbers
      .filter((m) => {
        const after = lower.slice(lower.indexOf(m[0]) + m[0].length, lower.indexOf(m[0]) + m[0].length + 20)
        return !/^\s*(series?|rondas?|vueltas?)\b/i.test(after)
      })
      .map((m) => parseFloat(m[1]))
      .filter((v) => v > 0)
    vals.sort((a, b) => b - a)
    weight = weight ?? vals[0]
    reps = reps ?? vals[1]
  }

  if (!weight || !reps) return null

  // Extract exercise name: strip all filler words, numbers, and set context
  const rawExercise = lower
    .replace(/\b(hice|hic[ei]|hic[ei]mos|did|puse|pus[ei]|hac[eé]r|bueno|listo|ok|okay)\b/gi, '')
    .replace(/\b\d+\.?\d*\s*(kg|lb)?\b/gi, '')
    .replace(/\b(rep[esa]?s?|repeticiones?|series?|vueltas?|rondas?)\b/gi, '')
    .replace(/\b(drop\s*set|dropset|superset|superserie|cluster|bi-?set)\b/gi, '')
    .replace(/\b(con|with|en|de|x|y|por|cada|al|la|el|un|una)\b/gi, '')
    .replace(/\b(descansando|descans[ao]|descanso|min|minutos?|seg|segundos?)\b/gi, '')
    .replace(/[,\.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // If all remaining words are ordinals/filler → use current exercise
  const words = rawExercise.split(/\s+/).filter(Boolean)
  const isMeaningless = words.length === 0 || words.every((w) => SET_ORDINALS.test(w))

  return {
    exerciseName: isMeaningless ? undefined : rawExercise,
    weight,
    reps,
    unit,
  }
}

function extractExerciseName(lower: string): string {
  return lower
    .replace(/\b(ahora\s*)?(pasamos|vamos|toca)\s*(a|con)?\b/gi, '')
    .replace(/\b(siguiente\s*ejercicio|now\s*(doing|moving\s*to))\b/gi, '')
    .replace(/\b(a|con|al|to)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const SCHEDULE_KEYWORDS: Record<string, string> = {
  almuerzo: 'almuerzo', comer: 'almuerzo', almorzar: 'almuerzo', comida: 'almuerzo',
  'café': 'cafe', cafe: 'cafe', coffee: 'cafe',
  // "fruta snack" before plain "snack" / "fruta" for specificity (longer keys checked first below)
  'fruta snack': 'fruta_snack',
  'fruta_snack': 'fruta_snack',
  fruta: 'fruta_snack', snack: 'fruta_snack',
  merienda: 'merienda',
  cena: 'cena', cenar: 'cena',
  entrenamiento: 'entrenamiento', entrenar: 'entrenamiento', gym: 'entrenamiento', train: 'entrenamiento',
}

function parseScheduleUpdate(lower: string): Intent['extracted'] | null {
  // Find which schedule slot
  let scheduleKey: string | undefined
  for (const [word, key] of Object.entries(SCHEDULE_KEYWORDS)) {
    if (lower.includes(word)) { scheduleKey = key; break }
  }
  if (!scheduleKey) return null

  let hour = -1
  let minutes = 0

  // 1. HH:MM format (highest priority)
  const colonMatch = lower.match(/\b(\d{1,2}):(\d{2})\b/)
  if (colonMatch) {
    hour = parseInt(colonMatch[1])
    minutes = parseInt(colonMatch[2])
  } else {
    // 2. "19hs", "19h", "19 horas", "las 19", "a las 19", "a las 19hs"
    const patterns = [
      /\blas?\s+(\d{1,2})\s*hs?\b/,      // "las 19hs", "la 19h"
      /a\s+las?\s+(\d{1,2})\s*hs?\b/,    // "a las 19hs"
      /\b(\d{1,2})\s*hs\b/,              // "19hs" (Argentine abbreviation)
      /\b(\d{1,2})\s*h(?:oras?)?\b/,     // "19h", "19 horas"
      /\blas?\s+(\d{1,2})\b/,            // "las 19"
      /a\s+las?\s+(\d{1,2})\b/,          // "a las 19"
    ]
    for (const pat of patterns) {
      const m = lower.match(pat)
      if (m) { hour = parseInt(m[1]); break }
    }
    // 3. Fallback: any standalone 1-2 digit number
    if (hour === -1) {
      const any = lower.match(/\b(\d{1,2})\b/)
      if (any) hour = parseInt(any[1])
    }
  }

  if (hour < 0 || hour > 23) return null
  const scheduleTime = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

  return { scheduleKey, scheduleTime }
}

// ─── Multi-exercise / multi-set batch parser ──────────────────────────────────

const SESSION_LEAD = /\b(estoy\s+haciendo|sesi[oó]n\s+de|sesi[oó]n\s+gym\s+(?:de\s+)?|vamos\s+a\s+hacer|hagamos\s+(?:una\s+)?sesi[oó]n\s+(?:de\s+)?)\s*([a-záéíóúñ\s]{2,30}?)(?=[\.,;:]|primer|segund|tercer|cuart|quint|nuevo\s+ejercicio|siguiente\s+ejercicio|$)/i

const SPLIT_MARKER_RE = /\b((?:el\s+)?(?:primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|quint[oa]|sext[oa]|s[eé]ptim[oa]|octav[oa]|noven[oa]|d[eé]cim[oa])\s+ejercicio|nuevo\s+ejercicio|siguiente\s+ejercicio|otro\s+ejercicio|cambi[eo]\s+(?:de\s+)?ejercicio)\b/gi

/**
 * Splits the message at exercise-boundary markers and parses each segment.
 * Also detects a leading "session start" phrase ("estoy haciendo piernas").
 */
export function parseGymBatch(lower: string): GymAction[] | null {
  const actions: GymAction[] = []

  // 1. Session-start at the beginning (optional)
  const sess = lower.match(SESSION_LEAD)
  let consumedUpTo = 0
  if (sess && sess.index !== undefined && sess.index < 25) {
    const name = sess[2]?.trim().replace(/\s+/g, ' ')
    if (name && name.length >= 2 && name.length < 30 && !/\d/.test(name)) {
      actions.push({ kind: 'session_start', name })
      consumedUpTo = sess.index + sess[0].length
    }
  }

  // 2. Find all exercise split markers in the rest
  const rest = lower.slice(consumedUpTo)
  const matches = [...rest.matchAll(SPLIT_MARKER_RE)]

  if (matches.length === 0) {
    // No explicit markers — but we may still have one implicit exercise segment
    if (actions.length === 0) return null
    // If we only had a session start, treat the rest as one segment
    const trailing = rest.trim()
    if (trailing.length > 0) {
      const seg = parseExerciseSegment(trailing)
      if (seg) actions.push(seg)
    }
    return actions
  }

  // 3. For each split, extract the segment between this match and the next
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const segStart = m.index! + m[0].length
    const segEnd = i + 1 < matches.length ? matches[i + 1].index! : rest.length
    const segment = rest.slice(segStart, segEnd).trim()
    const action = parseExerciseSegment(segment)
    if (action) actions.push(action)
  }

  return actions.length > 0 ? actions : null
}

/**
 * Parses a single segment describing one exercise.
 * Extracts: sets count, reps, weight, exercise name.
 */
function parseExerciseSegment(seg: string): GymAction | null {
  if (!seg) return null
  const lower = seg.toLowerCase()

  // Sets count: "3 series" / "3 rondas" / "3 vueltas"
  const setsMatch = lower.match(/\b(\d+)\s+(?:series?|rondas?|vueltas?)\b/)
  const sets = setsMatch ? Math.min(20, Math.max(1, parseInt(setsMatch[1]))) : 1

  // Reps: "12 reps" / "12 repeticiones" / "12 repes" / "12 repas"
  const repsMatch = lower.match(/\b(\d+)\s*(?:rep[esa]?s?|repeticiones?)\b/)
  const reps = repsMatch ? parseInt(repsMatch[1]) : undefined

  // Weight: "20kg" / "20 kg" / "12.5kg" / "20 lb"
  const weightMatch = lower.match(/\b(\d+\.?\d*)\s*(kg|lb)\b/)
  const weight = weightMatch ? parseFloat(weightMatch[1]) : undefined
  const unit: 'kg' | 'lb' = (weightMatch?.[2] as 'kg' | 'lb') ?? 'kg'

  // "N series de M reps con W kg" alternate pattern catch
  if (!repsMatch && setsMatch) {
    const altReps = lower.match(/(?:series?|rondas?)\s+de\s+(\d+)/)
    if (altReps) {
      const parsed = parseInt(altReps[1])
      return {
        kind: 'exercise',
        name: cleanExerciseName(seg),
        sets,
        reps: parsed,
        weight,
        unit,
      }
    }
  }

  // Clean exercise name — strip numbers, units, filler words, ordinals
  const name = cleanExerciseName(seg)

  // If no reps AND no name, segment is junk
  if (!name && reps === undefined) return null

  return {
    kind: 'exercise',
    name: name || undefined,
    sets,
    reps,
    weight,
    unit,
  }
}

function cleanExerciseName(seg: string): string {
  return seg
    .toLowerCase()
    .replace(/\b\d+\.?\d*\s*(?:kg|lb)?\b/g, '')
    .replace(/\b(rep[esa]?s?|repeticiones?|series?|rondas?|vueltas?|de)\b/gi, '')
    .replace(/\b(hice|hic[ei]|hic[ei]mos|hac[eé]r|did|puse|pus[ei]|voy|estoy\s+haciendo|haciendo|ahora|despu[eé]s|y|luego|entonces|bueno|listo|ok|okay|con|al|la|el|los|las|en|para|hasta|que|un|una|uno|por|cada)\b/gi, '')
    .replace(/\b(primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|quint[oa]|sext[oa]|s[eé]ptim[oa]|octav[oa]|noven[oa]|d[eé]cim[oa])\b/gi, '')
    .replace(/[,\.;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
