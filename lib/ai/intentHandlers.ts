import { Intent, IntentType } from './intentDetector'
import { Task, Language } from '@/types'

interface Stores {
  updateSchedule?: (key: string, time: string) => void
  tasks: {
    projects: Record<string, { id: string; name: string; statuses: { label: string; countsAsDone: boolean }[]; taskIds: string[] }>
    tasks: Record<string, Task>
    addTask: (t: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => string
    completeTask: (id: string) => void
    postponeTask: (id: string) => void
    pushRemainingToTomorrow: () => void
    planNext2h: () => Task[]
    updateTask: (id: string, patch: Partial<Task>) => void
    moveTask: (taskId: string, projectId: string) => void
  }
  gym?: {
    activeSession: { name: string; exercises: { name: string; sets: { weight: number; reps: number; unit: string }[] }[] } | null
    currentExerciseName: string | null
    startSession: (name?: string) => { name: string }
    endSession: () => void
    addSetToExercise: (exerciseName: string, weight: number, reps: number, unit?: 'kg' | 'lb') => boolean
    addExerciseToSession: (name: string, muscleGroup?: string) => unknown
    setCurrentExercise: (name: string) => unknown
  }
  metrics: { focus: number; energy: number; workload: number; stress: number; sleep: number }
  setPendingIntent: (intent: { type: string; raw: string; extracted: Record<string, string | undefined> } | null) => void
  getPendingIntent: () => { type: string; raw: string; extracted: Record<string, string | undefined> } | null
}

type TasksStoreRef = Stores['tasks']

export interface HandlerResult {
  content: string
  actionType?: string
  payload?: Record<string, unknown>
  requiresConfirm?: boolean
}

const greetings_en = [
  "Hey! What do you want to organize, add, or resolve right now?",
  "Hello! Ready when you are. What's on your mind?",
  "Hi there! What needs to get done today?",
  "Hey. What are we tackling first?",
]

const greetings_es = [
  "¡Hola! ¿Qué querés organizar, agregar o resolver ahora?",
  "¡Hey! Listo cuando vos quieras. ¿Qué tenés en mente?",
  "¡Hola! ¿Qué necesitás hacer hoy?",
  "Hey. ¿Con qué arrancamos primero?",
]

function pickGreeting(lang: Language): string {
  const list = lang === 'es' ? greetings_es : greetings_en
  return list[Math.floor(Math.random() * list.length)]
}

function findTaskByRef(ref: string | undefined, tasks: Record<string, Task>): Task | null {
  if (!ref) return null
  const lower = ref.toLowerCase()
  return Object.values(tasks).find((t) =>
    t.title.toLowerCase().includes(lower) ||
    lower.includes(t.title.toLowerCase())
  ) ?? null
}

function findProjectByName(name: string, projects: Stores['tasks']['projects']): { id: string; name: string; statuses: { label: string; countsAsDone: boolean }[] } | null {
  const lower = name.toLowerCase()
  return Object.values(projects).find((p) => p.name.toLowerCase().includes(lower)) ?? null
}

function polishTask(title: string, lang: Language): string {
  // Simple polisher: make vague tasks more concrete
  const polishMap_en: [RegExp, string][] = [
    [/^ver/i, 'Review and define action for:'],
    [/^hacer/i, 'Complete specific action:'],
    [/^check/i, 'Review, evaluate and decide on:'],
    [/^update/i, 'Open file, make changes, save and verify:'],
  ]
  const polishMap_es: [RegExp, string][] = [
    [/^ver\b/i, 'Revisar y definir próximo paso para:'],
    [/^hacer\b/i, 'Completar acción concreta:'],
    [/^revisar\b/i, 'Abrir, revisar con criterio específico y decidir:'],
    [/^actualizar\b/i, 'Abrir archivo, actualizar valores, guardar y verificar:'],
  ]
  const map = lang === 'es' ? polishMap_es : polishMap_en
  for (const [pattern, prefix] of map) {
    if (pattern.test(title)) return `${prefix} "${title.replace(pattern, '').trim()}"`
  }
  return lang === 'es'
    ? `Versión concreta: ${title} → definí exactamente qué hacer, cuándo y cómo medir que está lista.`
    : `Concrete version: ${title} → define exactly what to do, when, and how to know it's done.`
}

export async function handleIntent(
  intent: Intent,
  stores: Stores,
  lang: Language
): Promise<HandlerResult> {
  const { tasks, projects } = stores.tasks
  const { metrics } = stores
  const allProjects = Object.values(projects)

  switch (intent.type) {
    case 'greeting':
      return { content: pickGreeting(lang) }

    case 'question':
      return { content: buildAdviceReply(intent.raw, metrics, lang) }

    case 'what_now': {
      const pending = stores.tasks.planNext2h()
      if (pending.length === 0) {
        return {
          content: lang === 'es'
            ? "No tenés tareas pendientes para hoy. Buen momento para revisar qué viene mañana."
            : "No pending tasks for today. Good time to plan what's coming tomorrow."
        }
      }
      const top = pending[0]
      const energyNote = metrics.energy < 40
        ? (lang === 'es' ? "\n\nTu energía está baja. Empezá con algo simple y corto." : "\n\nYour energy is low. Start with something simple and short.")
        : ''
      return {
        content: lang === 'es'
          ? `Ahora mismo, una sola cosa: **${top.title}**${energyNote}\n\nNo planifiques más. Ejecutá eso.`
          : `Right now, one thing only: **${top.title}**${energyNote}\n\nStop planning. Execute that.`
      }
    }

    case 'daily_status': {
      const taskList = Object.values(tasks)
      const done = taskList.filter((t) => {
        const proj = projects[t.projectId]
        return proj?.statuses.find((s) => s.label === t.status)?.countsAsDone
      })
      const pending = taskList.filter((t) => {
        const proj = projects[t.projectId]
        return !proj?.statuses.find((s) => s.label === t.status)?.countsAsDone
      })
      return {
        content: lang === 'es'
          ? `**Estado del día:**\n- Completadas: ${done.length}\n- Pendientes: ${pending.length}\n- Energía: ${metrics.energy}%\n- Foco: ${metrics.focus}%\n\n${pending.length > 5 ? '⚠️ Tenés demasiadas tareas abiertas. Priorizá 3 máximo.' : 'Carga manejable. Seguí.'}`
          : `**Day status:**\n- Completed: ${done.length}\n- Pending: ${pending.length}\n- Energy: ${metrics.energy}%\n- Focus: ${metrics.focus}%\n\n${pending.length > 5 ? '⚠️ Too many open tasks. Pick 3 max to focus on.' : 'Manageable load. Keep going.'}`
      }
    }

    case 'plan_2h': {
      const suggested = stores.tasks.planNext2h()
      if (suggested.length === 0) {
        return {
          content: lang === 'es'
            ? "No hay tareas pendientes para planificar. Agregá tareas primero."
            : "No pending tasks to plan. Add some tasks first."
        }
      }
      const list = suggested.map((t, i) => `${i + 1}. **${t.title}**`).join('\n')
      return {
        content: lang === 'es'
          ? `**Próximas 2 horas — plan concreto:**\n\n${list}\n\nFoco en una a la vez. Sin multitasking. Sin agregar más.`
          : `**Next 2 hours — concrete plan:**\n\n${list}\n\nOne at a time. No multitasking. No adding more.`
      }
    }

    case 'push_tomorrow': {
      stores.tasks.pushRemainingToTomorrow()
      return {
        content: lang === 'es'
          ? "Listo. Moví todas las tareas pendientes a mañana. El día está cerrado."
          : "Done. Moved all remaining tasks to tomorrow. Day is closed."
      }
    }

    case 'task_create_no_project': {
      if (allProjects.length === 0) {
        return {
          content: lang === 'es'
            ? "No tenés proyectos creados. Creá uno primero desde el Task Tracker."
            : "You have no projects yet. Create one first from the Task Tracker."
        }
      }
      const projectNames = allProjects.map((p) => p.name).join(', ')
      stores.setPendingIntent({
        type: 'task_create_with_project',
        raw: intent.raw,
        extracted: { taskTitle: intent.extracted.taskTitle },
      })
      return {
        content: lang === 'es'
          ? `¿A qué proyecto la agrego? Proyectos disponibles: **${projectNames}**`
          : `Which project should I add it to? Available: **${projectNames}**`,
        actionType: 'ask_project',
      }
    }

    case 'task_create_with_project': {
      const { taskTitle, projectName } = intent.extracted
      if (!projectName) {
        return {
          content: lang === 'es'
            ? "No detecté el proyecto. ¿A cuál la agrego?"
            : "I couldn't detect the project. Which one?"
        }
      }
      const project = findProjectByName(projectName, projects)
      if (!project) {
        return {
          content: lang === 'es'
            ? `No encontré el proyecto "${projectName}". Verificá el nombre.`
            : `Project "${projectName}" not found. Check the name.`
        }
      }
      const title = taskTitle || intent.raw
      stores.tasks.addTask({
        title,
        projectId: project.id,
        status: project.statuses[0]?.label ?? 'To Do',
        priority: 'medium',
        importance: 'medium',
        subtasks: [],
        scheduledFor: 'today',
      })
      return {
        content: lang === 'es'
          ? `Listo. Agregué **"${title}"** al proyecto **${project.name}**.`
          : `Done. Added **"${title}"** to project **${project.name}**.`
      }
    }

    case 'execute_complete': {
      const task = findTaskByRef(intent.extracted.taskTitle, tasks)
      if (!task) {
        return {
          content: lang === 'es'
            ? `No encontré esa tarea. ¿Podés ser más específico?`
            : "Couldn't find that task. Can you be more specific?"
        }
      }
      stores.tasks.completeTask(task.id)
      return {
        content: lang === 'es'
          ? `Perfecto. **"${task.title}"** marcada como hecha.`
          : `Done! **"${task.title}"** marked as complete.`
      }
    }

    case 'execute_postpone': {
      const task = findTaskByRef(intent.extracted.taskTitle, tasks)
      if (!task) {
        return {
          content: lang === 'es'
            ? "No encontré esa tarea."
            : "Couldn't find that task."
        }
      }
      stores.tasks.postponeTask(task.id)
      const count = (task.postponedCount ?? 0) + 1
      const warning = count >= 3
        ? (lang === 'es'
          ? `\n\n⚠️ Llevas ${count} postergaciones. O la hacés hoy en versión mínima, o la sacamos de la semana.`
          : `\n\n⚠️ That's ${count} postpones. Either do it in minimal form today, or remove it from the week.`)
        : ''
      return {
        content: (lang === 'es'
          ? `Listo. **"${task.title}"** movida a mañana.`
          : `Done. **"${task.title}"** pushed to tomorrow.`) + warning
      }
    }

    case 'execute_move': {
      const task = findTaskByRef(intent.extracted.taskTitle, tasks)
      const project = intent.extracted.projectName
        ? findProjectByName(intent.extracted.projectName, projects)
        : null
      if (!task || !project) {
        return {
          content: lang === 'es'
            ? "No encontré la tarea o el proyecto. ¿Podés especificar?"
            : "Couldn't find the task or project. Can you specify?"
        }
      }
      stores.tasks.moveTask(task.id, project.id)
      return {
        content: lang === 'es'
          ? `Listo. **"${task.title}"** movida al proyecto **${project.name}**.`
          : `Done. **"${task.title}"** moved to **${project.name}**.`
      }
    }

    case 'execute_polish': {
      const task = findTaskByRef(intent.extracted.taskTitle, tasks)
      if (!task) {
        return {
          content: lang === 'es'
            ? "No encontré esa tarea. ¿Cuál querés pulir?"
            : "Couldn't find that task. Which one do you want to polish?"
        }
      }
      const polished = polishTask(task.title, lang)
      return {
        content: lang === 'es'
          ? `**Tarea original:** ${task.title}\n\n**Versión pulida:**\n${polished}`
          : `**Original task:** ${task.title}\n\n**Polished version:**\n${polished}`
      }
    }

    case 'clarify_project': {
      const pending = stores.getPendingIntent()
      if (!pending) {
        return { content: lang === 'es' ? "No sé a qué te referís." : "Not sure what you mean." }
      }
      stores.setPendingIntent(null)
      const projectName = intent.raw.trim()
      return handleIntent(
        {
          type: 'task_create_with_project',
          raw: pending.raw,
          extracted: { taskTitle: pending.extracted.taskTitle, projectName },
        },
        stores,
        lang
      )
    }

    case 'schedule_update': {
      const { scheduleKey, scheduleTime } = intent.extracted
      if (!scheduleKey || !scheduleTime) {
        return {
          content: lang === 'es'
            ? "No entendí bien el horario. Probá: *\"quiero almorzar a las 13:30\"*"
            : "Couldn't parse the time. Try: *\"I want to have lunch at 1:30pm\"*"
        }
      }
      if (!stores.updateSchedule) {
        return { content: lang === 'es' ? "No puedo actualizar el horario ahora." : "Can't update schedule right now." }
      }
      const LABELS: Record<string, string> = {
        almuerzo: 'Almuerzo', cafe: 'Café', merienda: 'Merienda', cena: 'Cena', entrenamiento: 'Entrenamiento'
      }
      stores.updateSchedule(scheduleKey, scheduleTime)
      return {
        content: lang === 'es'
          ? `✅ **${LABELS[scheduleKey] ?? scheduleKey}** actualizado a las **${scheduleTime}**. Anotado — tu energía va a agradecértelo.`
          : `✅ **${LABELS[scheduleKey] ?? scheduleKey}** updated to **${scheduleTime}**. Noted — your energy will thank you.`
      }
    }

    case 'gym_start_session': {
      if (!stores.gym) return { content: lang === 'es' ? "El módulo de gimnasio no está disponible." : "Gym module not available." }
      if (stores.gym.activeSession) {
        return {
          content: lang === 'es'
            ? `Ya tenés una sesión activa: **${stores.gym.activeSession.name}**. Finalizala primero antes de empezar una nueva.`
            : `You already have an active session: **${stores.gym.activeSession.name}**. Finish it before starting a new one.`
        }
      }
      const name = intent.extracted.sessionName
        ? intent.extracted.sessionName.charAt(0).toUpperCase() + intent.extracted.sessionName.slice(1)
        : undefined
      const session = stores.gym.startSession(name)
      return {
        content: lang === 'es'
          ? `🏋️ ¡Sesión iniciada! **${session.name}**\n\nDecime qué ejercicio querés hacer. Ejemplo: *"hice sentadilla 80kg 5 reps"* o *"ahora pasamos a bíceps"*.`
          : `🏋️ Session started! **${session.name}**\n\nTell me which exercise to do. Example: *"did squat 80kg 5 reps"* or *"now moving to biceps"*.`
      }
    }

    case 'gym_end_session': {
      if (!stores.gym) return { content: lang === 'es' ? "El módulo de gimnasio no está disponible." : "Gym module not available." }
      if (!stores.gym.activeSession) {
        return {
          content: lang === 'es'
            ? "No hay ninguna sesión activa en este momento."
            : "No active session right now."
        }
      }
      const sessionName = stores.gym.activeSession.name
      const exerciseCount = stores.gym.activeSession.exercises.length
      const totalSets = stores.gym.activeSession.exercises.reduce((s, e) => s + e.sets.length, 0)
      stores.gym.endSession()
      return {
        content: lang === 'es'
          ? `✅ Sesión **${sessionName}** finalizada.\n\n- ${exerciseCount} ejercicio${exerciseCount !== 1 ? 's' : ''}\n- ${totalSets} serie${totalSets !== 1 ? 's' : ''} en total\n\nBuen trabajo. 💪`
          : `✅ Session **${sessionName}** finished.\n\n- ${exerciseCount} exercise${exerciseCount !== 1 ? 's' : ''}\n- ${totalSets} total set${totalSets !== 1 ? 's' : ''}\n\nGreat work. 💪`
      }
    }

    case 'gym_add_set': {
      if (!stores.gym) return { content: lang === 'es' ? "El módulo de gimnasio no está disponible." : "Gym module not available." }
      if (!stores.gym.activeSession) {
        return {
          content: lang === 'es'
            ? "No hay sesión activa. Decí *\"nueva sesión\"* para empezar."
            : "No active session. Say *\"new session\"* to start."
        }
      }
      const { exerciseName, weight, reps, unit } = intent.extracted
      if (!weight || !reps) {
        return {
          content: lang === 'es'
            ? "No entendí el peso o las reps. Probá: *\"hice sentadilla 80kg 5 reps\"*"
            : "Couldn't parse weight or reps. Try: *\"did squat 80kg 5 reps\"*"
        }
      }
      // Resolve: explicit name → current tracked exercise → last in session
      const resolvedName = exerciseName
        || stores.gym.currentExerciseName
        || stores.gym.activeSession.exercises.slice(-1)[0]?.name
        || 'Ejercicio'

      stores.gym.addSetToExercise(resolvedName, weight, reps, (unit as 'kg' | 'lb') ?? 'kg')
      return {
        content: lang === 'es'
          ? `💪 **${resolvedName}** — ${weight}${unit ?? 'kg'} × ${reps} reps`
          : `💪 **${resolvedName}** — ${weight}${unit ?? 'kg'} × ${reps} reps`
      }
    }

    case 'gym_batch': {
      if (!stores.gym) return { content: lang === 'es' ? "El módulo de gimnasio no está disponible." : "Gym module not available." }
      const actions = intent.extracted.gymActions ?? []
      if (actions.length === 0) {
        return { content: lang === 'es' ? "No pude leer ningún ejercicio del mensaje." : "Couldn't parse any exercises." }
      }

      const lines: string[] = []
      let lastExerciseName: string | null = stores.gym.currentExerciseName

      // Auto-start session if first action is session_start OR if there's no active session
      const firstIsSessionStart = actions[0].kind === 'session_start'
      if (firstIsSessionStart) {
        const a = actions[0] as { kind: 'session_start'; name?: string }
        if (!stores.gym.activeSession) {
          const cap = a.name ? a.name.charAt(0).toUpperCase() + a.name.slice(1) : undefined
          const session = stores.gym.startSession(cap)
          lines.push(lang === 'es' ? `🏋️ Sesión iniciada: **${session.name}**` : `🏋️ Session started: **${session.name}**`)
        }
      } else if (!stores.gym.activeSession) {
        // Auto-start a generic session if user is logging sets without explicit start
        const session = stores.gym.startSession()
        lines.push(lang === 'es' ? `🏋️ Sesión iniciada: **${session.name}**` : `🏋️ Session started: **${session.name}**`)
      }

      // Process exercise actions
      for (const a of actions) {
        if (a.kind !== 'exercise') continue
        const exerciseName = a.name || lastExerciseName || stores.gym.activeSession?.exercises.slice(-1)[0]?.name || 'Ejercicio'

        if (a.reps === undefined) {
          // Register the exercise but no sets yet
          stores.gym.setCurrentExercise(exerciseName)
          lastExerciseName = exerciseName
          lines.push(lang === 'es' ? `➕ **${exerciseName}** (sin series cargadas todavía)` : `➕ **${exerciseName}** (no sets logged yet)`)
          continue
        }

        // Add N sets of M reps at weight W
        const sets = Math.max(1, a.sets ?? 1)
        const weight = a.weight ?? 0
        const unit = a.unit ?? 'kg'
        for (let s = 0; s < sets; s++) {
          stores.gym.addSetToExercise(exerciseName, weight, a.reps, unit)
        }
        lastExerciseName = exerciseName
        const weightStr = weight > 0 ? `${weight}${unit}` : (lang === 'es' ? 'sin peso' : 'no weight')
        lines.push(lang === 'es'
          ? `💪 **${exerciseName}** — ${sets} serie${sets !== 1 ? 's' : ''} × ${a.reps} reps · ${weightStr}`
          : `💪 **${exerciseName}** — ${sets} set${sets !== 1 ? 's' : ''} × ${a.reps} reps · ${weightStr}`)
      }

      return { content: lines.join('\n') }
    }

    case 'gym_switch_exercise': {
      if (!stores.gym) return { content: lang === 'es' ? "El módulo de gimnasio no está disponible." : "Gym module not available." }
      if (!stores.gym.activeSession) {
        return {
          content: lang === 'es'
            ? "No hay sesión activa. Empezá una primero."
            : "No active session. Start one first."
        }
      }
      const name = intent.extracted.exerciseName
      if (!name) {
        return {
          content: lang === 'es'
            ? "¿A qué ejercicio pasamos?"
            : "Which exercise are we moving to?"
        }
      }
      stores.gym.setCurrentExercise(name)
      return {
        content: lang === 'es'
          ? `Listo, pasamos a **${name}**. Decime cuándo terminés una serie.`
          : `Got it, moving to **${name}**. Tell me when you finish a set.`
      }
    }

    default:
      return {
        content: lang === 'es'
          ? "No entendí bien. Podés decirme: agregar tarea, completar tarea, posponer, planificar próximas 2 horas, o hacerme una pregunta."
          : "Not sure I understood. You can say: add task, complete task, postpone, plan next 2 hours, or ask me a question."
      }
  }
}

function buildAdviceReply(
  question: string,
  metrics: { focus: number; energy: number; workload: number },
  lang: Language
): string {
  const lower = question.toLowerCase()

  if (/organiz|priorit|prioriz/.test(lower)) {
    return lang === 'es'
      ? `Para organizar tu día:\n1. Elegí UNA tarea importante como prioridad principal\n2. Agrupá las tareas cortas (menos de 15 min) para hacerlas juntas\n3. Dejá las tareas pesadas para cuando tenés más energía\n\nTu energía actual es ${metrics.energy}%. ${metrics.energy < 50 ? 'Evitá tareas pesadas ahora.' : 'Buen momento para algo importante.'}`
      : `To organize your day:\n1. Pick ONE important task as your main priority\n2. Group short tasks (<15 min) to batch them\n3. Save heavy tasks for when your energy is higher\n\nYour current energy is ${metrics.energy}%. ${metrics.energy < 50 ? 'Avoid heavy tasks right now.' : 'Good time for something important.'}`
  }

  if (/focus|foco|distract/.test(lower)) {
    return lang === 'es'
      ? `Para mejorar el foco:\n- Bloques de 25-50 minutos sin interrupciones\n- Una sola tarea a la vez\n- Cerrá tabs que no necesitás\n- Tu foco actual es ${metrics.focus}%. ${metrics.focus < 60 ? 'Considerá un descanso antes de una tarea profunda.' : 'Estás bien para arrancar.'}`
      : `To improve focus:\n- Work in 25-50 min blocks without interruptions\n- One task at a time\n- Close unnecessary tabs\n- Your focus is ${metrics.focus}% now. ${metrics.focus < 60 ? 'Consider a break before deep work.' : "You're good to go."}`
  }

  return lang === 'es'
    ? `Buena pregunta. Lo más importante ahora es ejecutar, no planificar. ¿Qué tarea específica tenés en mente?`
    : `Good question. The most important thing right now is to execute, not plan. What specific task do you have in mind?`
}
