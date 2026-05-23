'use client'
import { useCallback } from 'react'
import { useChatStore } from '@/lib/store/chatStore'
import { useTasksStore } from '@/lib/store/tasksStore'
import { useAppStore } from '@/lib/store/appStore'
import { useGymStore } from '@/lib/store/gymStore'
import { useHealthStore, getTodaySnapshot } from '@/lib/store/healthStore'
import { useGoogleCalendarStore } from '@/lib/store/googleCalendarStore'
import { detectIntent, type Intent, type IntentType } from '@/lib/ai/intentDetector'
import { handleIntent } from '@/lib/ai/intentHandlers'
import { getAiHeaders } from '@/lib/ai/headers'

// LLM-FIRST architecture:
//   1. Every message goes to Claude (or Ollama) for classification — Claude is
//      the primary brain. It sees the full app context and recent chat history
//      and returns either a structured intent OR signals it's open-ended.
//   2. The regex detector is now ONLY a SAFETY NET that runs if the AI is
//      offline / no key configured / API errored. It still understands the
//      common patterns (gym set logging, single-task add, completion, etc).
//   3. Open-ended intents (`question` / `unknown`) trigger a conversational
//      reply from Claude using the full context.
//
// Trade-off accepted: every message pays ~500-1500ms for the API roundtrip.
// In exchange we stop misclassifying messages the regex thinks it understands
// but actually doesn't (the classic "agregar X en P, y Y en Q" disaster).
const AI_CONVERSATIONAL_INTENTS: IntentType[] = ['question', 'unknown']

async function classifyWithLLM(
  message: string,
  context: Record<string, unknown>,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
): Promise<Intent | null> {
  const headers = getAiHeaders()
  if (!headers) return null  // AI disabled in settings
  try {
    const res = await fetch('/api/ai/interpret', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, context: { ...context, recentChat: history } }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) return null
    const json = await res.json()
    if (!json.ok || !json.intent?.type) return null
    return {
      type: json.intent.type as IntentType,
      raw: message,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extracted: (json.intent.extracted ?? {}) as any,
    }
  } catch {
    return null
  }
}

/** Build a rich context snapshot for Claude. Keeps payload small enough to
 *  fit in a single turn but informative enough for grounded answers. */
function buildChatContext(args: {
  tasksStore: ReturnType<typeof useTasksStore.getState>
  gymStore: ReturnType<typeof useGymStore.getState>
  appStore: ReturnType<typeof useAppStore.getState>
  gcalStore: ReturnType<typeof useGoogleCalendarStore.getState>
  todaySnap: ReturnType<typeof getTodaySnapshot>
  baseline: { sleepGoalMinutes: number; restingHR?: number; hrv?: number }
}) {
  const { tasksStore, gymStore, appStore, gcalStore, todaySnap, baseline } = args
  const projects = Object.values(tasksStore.projects).filter((p) => !p.archived)
  const allTasks = Object.values(tasksStore.tasks)
  const isDone = (t: typeof allTasks[number]) => {
    const proj = tasksStore.projects[t.projectId]
    const status = proj?.statuses.find((s) => s.label === t.status)
    return !!status?.countsAsDone
  }
  const pending = allTasks.filter((t) => !isDone(t))
  const todayTasks = pending.filter((t) => t.scheduledFor === 'today')
  const urgent = pending.filter((t) => t.priority === 'urgent' || t.priority === 'high')

  const trimTask = (t: typeof allTasks[number]) => ({
    title: t.title,
    project: tasksStore.projects[t.projectId]?.name,
    priority: t.priority,
    importance: t.importance,
    dueDate: t.dueDate,
    category: t.category,
  })

  const recentSessions = (gymStore.sessions ?? [])
    .slice(0, 5)
    .map((s) => ({
      date: s.date,
      name: s.name,
      exercises: s.exercises.map((e) => ({
        name: e.name,
        muscleGroup: e.muscleGroup,
        topSet: e.sets.length > 0
          ? e.sets.reduce((best, set) => set.weight > best.weight ? set : best, e.sets[0])
          : null,
        totalSets: e.sets.length,
      })),
    }))

  const lastWeight = gymStore.weightEntries[0]

  return {
    language: appStore.language,
    dayType: appStore.dayType,
    projects: projects.map((p) => ({
      name: p.name,
      taskCount: tasksStore.tasks ? Object.values(tasksStore.tasks).filter((t) => t.projectId === p.id).length : 0,
    })),
    todayTasks: todayTasks.slice(0, 20).map(trimTask),
    urgent: urgent.slice(0, 10).map(trimTask),
    metrics: {
      energy: appStore.metrics.energy,
      wakeTime: appStore.metrics.wakeTime,
      sleepDebt: appStore.metrics.sleepDebt,
      todaySteps: todaySnap?.steps ?? null,
      todaySleepMinutes: todaySnap?.sleepMinutes ?? null,
      todayRestingHR: todaySnap?.restingHR ?? null,
      sleepGoalMinutes: baseline.sleepGoalMinutes,
      baselineRestingHR: baseline.restingHR ?? null,
    },
    gym: {
      phase: gymStore.phase,
      gymType: gymStore.gymType,
      weightGoalKg: gymStore.weightGoalKg,
      lastBodyWeight: lastWeight ? { date: lastWeight.date, kg: lastWeight.kg } : null,
      activeSession: gymStore.activeSession
        ? { name: gymStore.activeSession.name, exercises: gymStore.activeSession.exercises.length }
        : null,
      currentExercise: gymStore.currentExerciseName,
      routines: (gymStore.routines ?? []).map((r) => ({
        name: r.name,
        dayLabel: r.dayLabel,
        exercises: r.exercises.map((e) => ({
          name: e.name,
          muscle: e.muscleGroup,
          target: `${e.targetSets}x${e.targetReps}${e.targetWeight ? ' @ ' + e.targetWeight : ''}`,
        })),
      })),
      recentSessions,
    },
    schedule: appStore.scheduleOrder.map((k) => ({
      key: k, label: appStore.idealSchedule[k]?.label, time: appStore.idealSchedule[k]?.time,
    })),
    // ── Google Calendar upcoming events ─────────────────────────────────────
    // Include events from NOW → +30 days so Claude can answer questions like
    // "¿cuándo es mi próximo turno con X?", "¿qué tengo mañana?",
    // "¿qué se viene esta semana?". Trim each event to the essentials —
    // descriptions and locations are kept short so context stays compact.
    calendar: buildCalendarSlice(gcalStore),
  }
}

function buildCalendarSlice(gcal: ReturnType<typeof useGoogleCalendarStore.getState>) {
  if (!gcal.connected) return { connected: false, upcoming: [] }
  const now = Date.now()
  const thirtyDaysOut = now + 30 * 24 * 60 * 60 * 1000
  const calendarsById = Object.fromEntries(gcal.calendars.map((c) => [c.id, c.summary]))
  const upcoming = (gcal.events ?? [])
    .filter((e) => {
      const startMs = new Date(e.start).getTime()
      const endMs = new Date(e.end).getTime()
      // Include events that haven't ended yet AND start within 30 days.
      return endMs >= now && startMs <= thirtyDaysOut
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 40)  // cap so we don't blow up the prompt
    .map((e) => ({
      title: e.summary,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      calendar: calendarsById[e.calendarId] ?? null,
      location: e.location?.slice(0, 80) ?? undefined,
      description: e.description?.slice(0, 200) ?? undefined,
    }))
  return {
    connected: true,
    lastFetchedAt: gcal.lastFetchedAt ?? null,
    upcoming,
  }
}

async function callConversationalAI(
  message: string,
  context: Record<string, unknown>,
  history: { role: 'user' | 'assistant'; content: string }[],
): Promise<string | null> {
  const headers = getAiHeaders()
  if (!headers) return null
  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, context, history }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) return null
    const json = await res.json()
    if (!json.ok || typeof json.content !== 'string') return null
    return json.content
  } catch {
    return null
  }
}

export function useChat() {
  const chatStore = useChatStore()
  const tasksStore = useTasksStore()
  const appStore = useAppStore()
  const { language, metrics, updateSchedule } = appStore
  const gymStore = useGymStore()
  const healthStore = useHealthStore()
  const gcalStore = useGoogleCalendarStore()

  const sendMessage = useCallback(async (text: string) => {
    chatStore.addMessage({ role: 'user', content: text })
    chatStore.setThinking(true)

    await new Promise((r) => setTimeout(r, 400))

    try {
      const projectNames = Object.values(tasksStore.projects).map((p) => p.name)
      const pending = chatStore.pendingIntent

      // If we have a pending clarification (e.g. asked which project), force
      // that path and skip the LLM round-trip — the user's "Personal" reply
      // doesn't need to be re-classified.
      let intent: Intent | null = pending?.type === 'task_create_no_project'
        ? { type: 'clarify_project' as const, raw: text, extracted: { taskTitle: pending.extracted?.taskTitle } }
        : null

      // ── LLM-FIRST CLASSIFICATION ─────────────────────────────────────────
      // Always ask Claude first when no pending state. Pass projects, gym
      // state, language, recent chat history AND user corrections so Claude
      // sees what was previously misinterpreted and learns the user's
      // personal patterns (few-shot in-context learning).
      if (!intent) {
        const recentHistory = chatStore.messages.slice(-6).map((m) => ({
          role: m.role, content: m.content.slice(0, 400),
        }))
        // Pick the 20 most recent corrections — newer ones are more likely
        // to reflect current preferences; capping keeps the prompt compact.
        const corrections = chatStore.corrections.slice(0, 20).map((c) => ({
          userInput: c.userInput,
          wrongInterpretation: c.wrongInterpretation,
          correctInterpretation: c.correctInterpretation,
        }))
        const llm = await classifyWithLLM(text, {
          projects: projectNames,
          activeGymSession: gymStore.activeSession?.name ?? null,
          currentExercise: gymStore.currentExerciseName ?? null,
          language,
          userCorrections: corrections,
        }, recentHistory)
        if (llm) {
          intent = llm
        } else {
          // SAFETY NET: AI unreachable (offline, no key, error). Fall back to
          // the regex detector so the user still gets SOMETHING useful.
          intent = detectIntent(text, projectNames)
        }
      }

      // Conversational AI path — for open-ended messages, ask Claude with full
      // app context for a real reply instead of returning a canned line.
      if (AI_CONVERSATIONAL_INTENTS.includes(intent.type)) {
        const ctx = buildChatContext({
          tasksStore, gymStore, appStore, gcalStore,
          todaySnap: getTodaySnapshot(healthStore.snapshots),
          baseline: healthStore.baseline,
        })
        const history = chatStore.messages.slice(-10).map((m) => ({
          role: m.role, content: m.content,
        }))
        const aiReply = await callConversationalAI(text, ctx, history)
        if (aiReply) {
          chatStore.addMessage({ role: 'assistant', content: aiReply })
          return
        }
        // If AI failed (offline, no key, error) fall through to canned handler.
      }

      const result = await handleIntent(
        intent,
        {
          tasks: tasksStore,
          gym: gymStore,
          metrics,
          updateSchedule: (key: string, time: string) => updateSchedule(key as import('@/lib/store/appStore').ScheduleKey, time),
          setPendingIntent: chatStore.setPendingIntent,
          getPendingIntent: () => chatStore.pendingIntent,
        },
        language
      )

      chatStore.addMessage({
        role: 'assistant',
        content: result.content,
        ...(result.actionType ? {
          actionCard: { type: result.actionType as 'ask_project', payload: result.payload ?? {}, confirmed: false }
        } : {}),
      })
    } finally {
      chatStore.setThinking(false)
    }
  }, [chatStore, tasksStore, appStore, gymStore, healthStore, gcalStore, language, metrics, updateSchedule])

  return {
    messages: chatStore.messages,
    isThinking: chatStore.isThinking,
    sendMessage,
    clearHistory: chatStore.clearHistory,
  }
}
