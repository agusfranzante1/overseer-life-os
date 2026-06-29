'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_SPI_TEMPLATE } from '@/lib/spi/template'
import type { SPISession, SPITask, SPITemplate, BitacoraEntry } from '@/lib/spi/types'
import { useTasksStore } from './tasksStore'
import { useKpisStore } from './kpisStore'
import { computeSessionXP, totalXPFromSessions, levelFromXP, didLevelUp, type SessionXP } from '@/lib/spi/gamification'
import { buildWeekSnapshot } from '@/lib/spi/weekSnapshot'
import { buildCalendarSnapshot, calendarMondayForSpiWeek } from '@/lib/spi/calendarSnapshot'

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/** Returns the most recent Saturday at 00:00 local time as YYYY-MM-DD. */
/** Saturday-anchored "current week" key — YYYY-MM-DD of the most recent
 *  Saturday (today if today IS Saturday). Used por la SPI page para
 *  identificar la sesión que se ESTÁ EDITANDO hoy (la ritual de planeación
 *  del sábado).
 *
 *  IMPORTANTE: esto NO es el mismo concepto que la "semana activa" para
 *  KPIs/hábitos/calendario. La semana activa va de LUNES a DOMINGO; la
 *  sesión que la "owns" es la del SÁBADO ANTERIOR al lunes de la semana
 *  en curso. Usá `activeWeekAnchorYmd()` para eso.
 *
 *  Ejemplo:
 *    Hoy = Sábado 13/Ene.
 *    - lastSaturdayYmd() = '2024-01-13' (la sesión que estás llenando hoy
 *      para PLANIFICAR la próxima semana Mon 15 → Sun 21).
 *    - activeWeekAnchorYmd() = '2024-01-06' (la sesión cuya semana
 *      Mon 8 → Sun 14 todavía está en curso). */
export function lastSaturdayYmd(now: Date = new Date()): string {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()  // 0 Sun … 6 Sat
  // If today is Saturday → use today. Otherwise step back to previous Saturday.
  const diff = day === 6 ? 0 : (day + 1)  // Sun=1, Mon=2, ..., Fri=6
  d.setDate(d.getDate() - diff)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** YYYY-MM-DD del sábado que ARRANCA la sesión cuya SEMANA (lunes a
 *  domingo) contiene HOY. Cambia de valor solo los LUNES — todos los
 *  días Mon..Sun de la misma semana devuelven el MISMO sábado.
 *
 *  Reglas:
 *  - Día = lunes → sábado de hace 2 días.
 *  - Día = martes → sábado de hace 3 días.
 *  - …
 *  - Día = viernes → sábado de hace 6 días.
 *  - Día = sábado → sábado de hace 7 días (no el de HOY, porque
 *    el sábado es la ritual del NEXT week).
 *  - Día = domingo → sábado de hace 8 días.
 *
 *  Esto se usa por KPIs/hábitos/calendar para decidir qué SPISession
 *  contiene los datos en curso. */
export function activeWeekAnchorYmd(now: Date = new Date()): string {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()  // 0 Sun … 6 Sat
  // Días para retroceder hasta el sábado que ARRANCA la semana actual.
  // Convertimos `day` a "días desde el lunes" y le sumamos 2 (para llegar
  // al sábado anterior).
  //   Mon=1 → 0 días desde lunes → sábado anterior = 2 días atrás
  //   Tue=2 → 1 día desde lunes → sábado = 3 días atrás
  //   ...
  //   Sat=6 → 5 días desde lunes → sábado = 7 días atrás
  //   Sun=0 → 6 días desde lunes → sábado = 8 días atrás
  const daysFromMonday = (day + 6) % 7  // Mon=0 ... Sun=6
  const diff = daysFromMonday + 2
  d.setDate(d.getDate() - diff)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** Pre-fills a fresh session with the template's default checklist
 *  state (all unchecked) and empty values. */
function emptySession(template: SPITemplate, weekStartDate: string): SPISession {
  const nowIso = new Date().toISOString()
  const mainChecklist: Record<string, boolean> = {}
  for (const item of template.mainChecklist) mainChecklist[item.key] = false
  return {
    id: genId(),
    weekStartDate,
    createdAt: nowIso,
    updatedAt: nowIso,
    mainChecklist,
    // Empty array → lane picker se muestra hasta que el user elige.
    // El picker pre-selecciona 'estrategico' como obligatorio y permite
    // activar los otros 3 carriles para profundizar la sesión.
    selectedLanes: [],
    values: {},
    tasks: [],
    templateVersion: template.version,
  }
}

interface SPIState {
  template: SPITemplate
  sessions: SPISession[]
  activeSessionId: string | null
  /** Cross-session persistent journal — the Bitácora de Calibración.
   *  Lives globally (NOT inside individual sessions) so every Saturday
   *  the user can see ALL accumulated insights from prior weeks. */
  bitacoraEntries: BitacoraEntry[]

  // ─── Session lifecycle ────────────────────────────────────────────
  /** Creates a new session for the most recent Saturday and sets it
   *  as active. If a session for that Saturday already exists, it is
   *  returned instead — we don't duplicate per week. */
  createOrOpenCurrentWeek: () => string
  /** Asegura (find-or-create) la sesión cuyo `weekStartDate` es el dado y
   *  devuelve su id. Usado por el Panel para escribir la reflexión/mood
   *  diarios en la sesión de la SEMANA ACTIVA (activeWeekAnchorYmd) sin
   *  cambiar la sesión activa de edición. No spamea: solo crea si no existe. */
  ensureWeekSession: (weekStartDate: string) => string
  setActiveSession: (id: string | null) => void
  /** Closes the session: stamps closedAt, computes the score, stores
   *  mood/notes, AND pushes each task into the SPI project in the task
   *  manager (creating the project if it doesn't exist). After this the
   *  session is read-only-ish (still editable). Returns the count of
   *  tasks materialized + XP info + level-up flag for the celebration UI. */
  closeSession: (id: string, args: { mood?: number; notes?: string }) => {
    pushedTasks: number
    xp: SessionXP
    leveledUp: boolean
    newLevel: number
    previousLevel: number
  }
  /** Re-genera los snapshots (calendario + hábitos/KPIs) de una sesión ya
   *  cerrada, leyendo el estado live ACTUAL de los stores. Sirve para
   *  recuperar/refrescar el snapshot de una semana cuando se cerró antes
   *  de tiempo o con datos incompletos (p. ej. tareas completadas que ya
   *  se habían auto-archivado). Devuelve cuántos bloques quedaron en el
   *  snapshot del calendario. */
  recaptureSnapshots: (sessionId: string) => number
  /** Migración auto-sanadora: corrige TODOS los `calendarSnapshot`
   *  congelados que quedaron con la semana equivocada (bug de offset que
   *  apuntaba a la semana anterior). Para cada sesión cuyo snapshot tiene
   *  un `weekStartDate` distinto al lunes CORRECTO de su semana, lo
   *  re-captura con la lógica arreglada. Las que ya están bien se saltean
   *  (idempotente, no hay drift). Devuelve cuántas corrigió. */
  fixCalendarSnapshotWeeks: () => number

  // ─── Bitácora de Calibración (cross-session DB) ─────────────────
  addBitacoraEntry: (e: Omit<BitacoraEntry, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateBitacoraEntry: (id: string, patch: Partial<BitacoraEntry>) => void
  removeBitacoraEntry: (id: string) => void

  // ─── Template editing (Phase 4) ─────────────────────────────────
  /** Replace the entire template. New sessions will use this. Existing
   *  sessions keep their snapshot via templateVersion field. */
  updateTemplate: (t: SPITemplate) => void
  /** Restore the bundled default template. */
  resetTemplate: () => void

  // ─── Gamification selectors ─────────────────────────────────────
  /** Total XP earned across all closed sessions. */
  getTotalXP: () => number
  /** Current level info derived from total XP. */
  getLevel: () => ReturnType<typeof levelFromXP>
  /** Materializes a SPITask into the real Task store now (without
   *  closing the session). Useful for early commits. */
  pushTaskToManager: (sessionId: string, taskId: string) => void
  deleteSession: (id: string) => void

  // ─── Field / checklist editing ────────────────────────────────────
  toggleChecklistItem: (id: string, key: string) => void
  updateValue: (sessionId: string, sectionKey: string, fieldKey: string, value: string) => void
  /** Pick which lanes ("carriles") are active for this session.
   *  Empty array shows the picker; non-empty filters which sections render. */
  setSessionLanes: (sessionId: string, lanes: string[]) => void

  /** Set the list of KPIs activos para esta semana. El scoreboard del
   *  SPI semanal renderea solo estos IDs. */
  setSessionKpis: (sessionId: string, kpiIds: string[]) => void

  // ─── Generated tasks ──────────────────────────────────────────────
  addTask: (sessionId: string, task: Omit<SPITask, 'id'>) => string
  updateTask: (sessionId: string, taskId: string, patch: Partial<SPITask>) => void
  removeTask: (sessionId: string, taskId: string) => void
  reorderTasks: (sessionId: string, orderedIds: string[]) => void
  /** Reconcilia las INSTANCIAS recurrentes de tareas de origen SPI dentro
   *  de la sesión de la semana que les corresponde (por su dueDate),
   *  heredando ⭐/⚡ de la tarea original. Idempotente (dedup por
   *  linkedTaskId). Solo adjunta a sesiones que YA existen. Devuelve el
   *  número de SPITasks creadas. */
  reconcileRecurringSpiTasks: () => number

  // ─── Convenience selectors (not stored) ───────────────────────────
  getActiveSession: () => SPISession | null
  getStreak: () => number
}

/** Auto-compute a 0-100 score from a session's state. Weights:
 *  - 40% main checklist completion
 *  - 40% task completion ratio
 *  - 20% mood (1-10 normalized)
 *  Tasks with no entries → that component skipped (rescaled). */
function computeScore(session: SPISession): number {
  const mainChecklist = session.mainChecklist ?? {}
  const checklistTotal = Object.keys(mainChecklist).length || 1
  const checklistDone = Object.values(mainChecklist).filter(Boolean).length
  const checklistPct = (checklistDone / checklistTotal) * 100

  const tasks = session.tasks ?? []
  const totalTasks = tasks.length
  const doneTasks = tasks.filter((t) => !!t.linkedTaskId && !!t.movedToProjectId).length
  // Without integration yet (Phase 2), use important flag count as proxy.
  const tasksPct = totalTasks > 0
    ? (doneTasks / totalTasks) * 100
    : (totalTasks === 0 ? 0 : 0)

  const moodPct = session.mood ? ((session.mood - 1) / 9) * 100 : 0
  const moodComponent = session.mood !== undefined ? 0.2 * moodPct : 0

  if (session.mood === undefined && totalTasks === 0) {
    return Math.round(checklistPct)  // only the checklist matters then
  }
  if (totalTasks === 0) {
    return Math.round(0.6 * checklistPct + 0.4 * moodPct)
  }
  return Math.round(0.4 * checklistPct + 0.4 * tasksPct + moodComponent)
}

export const useSPIStore = create<SPIState>()(
  persist(
    (set, get) => ({
      template: DEFAULT_SPI_TEMPLATE,
      sessions: [],
      activeSessionId: null,
      bitacoraEntries: [],

      createOrOpenCurrentWeek: () => {
        const target = lastSaturdayYmd()
        const existing = get().sessions.find((s) => s.weekStartDate === target)
        if (existing) {
          set({ activeSessionId: existing.id })
          return existing.id
        }
        const fresh = emptySession(get().template, target)
        // ── Auto-herencia de KPIs activos ─────────────────────────────
        // La sesión nueva arranca con los mismos KPIs que tenía activos
        // la sesión más reciente ANTERIOR + cualquier KPI nuevo creado
        // desde entonces (cuyo `activatedAt <= target`). Así NO hay que
        // re-elegir todos los KPIs cada sábado — la continuidad es por
        // default; el usuario solo edita si esta semana hace algún cambio
        // (sacar guitarra, sumar piano, etc.).
        const prevSession = [...get().sessions]
          .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))
          .find((s) => s.weekStartDate < target)
        const inheritedIds = new Set(prevSession?.selectedKpiIds ?? [])
        // Sumamos también los KPIs activos creados en la library DESPUÉS
        // del weekStartDate de la sesión previa (o si no hay previa,
        // todos los activos hasta hoy). Leemos via getState() para no
        // suscribirnos — es un cálculo one-shot al crear la sesión.
        const allActive = useKpisStore.getState().definitions.filter(
          (d) => !d.archivedAt && d.activatedAt <= target
        )
        const prevCutoff = prevSession?.weekStartDate ?? ''
        for (const d of allActive) {
          if (d.activatedAt > prevCutoff) inheritedIds.add(d.id)
        }
        fresh.selectedKpiIds = Array.from(inheritedIds)

        set((s) => ({
          sessions: [fresh, ...s.sessions],
          activeSessionId: fresh.id,
        }))
        return fresh.id
      },

      ensureWeekSession: (weekStartDate) => {
        const existing = get().sessions.find((s) => s.weekStartDate === weekStartDate)
        if (existing) return existing.id
        const fresh = emptySession(get().template, weekStartDate)
        // NO cambiamos `activeSessionId` (no es la ritual de planeación, es
        // solo el contenedor de la reflexión diaria de la semana en curso).
        set((s) => ({ sessions: [fresh, ...s.sessions] }))
        return fresh.id
      },

      setActiveSession: (id) => set({ activeSessionId: id }),

      closeSession: (id, args) => {
        const session = get().sessions.find((s) => s.id === id)
        if (!session) return { pushedTasks: 0, xp: { base: 0, scoreBonus: 0, moodBonus: 0, taskBonus: 0, total: 0 }, leveledUp: false, newLevel: 0, previousLevel: 0 }

        // Snapshot total XP BEFORE this close so we can detect level-up.
        const xpBefore = totalXPFromSessions(get().sessions)

        // Ensure SPI project exists. The icon and color are stable so
        // re-creating across devices stays consistent.
        const tasksApi = useTasksStore.getState()
        const projectId = tasksApi.ensureSystemProject({
          systemProjectKey: 'spi',
          name: 'SPI',
          color: '#d946ef',  // fuchsia-500 — matches the SPI accent
          icon: '♾️',
        })

        // Push every SPITask that isn't already linked, into the task
        // manager as a real Task. The whyPurpose lives in the description
        // field so it's visible even after the user moves the task.
        const updatedTasks: SPITask[] = session.tasks.map((t) => {
          if (t.linkedTaskId) return t  // already pushed
          const realTaskId = tasksApi.addTask({
            title: t.title,
            projectId,
            status: 'To Do',
            priority: t.important ? 'high' : 'medium',
            importance: t.important ? 'high' : 'medium',
            subtasks: [],
            scheduledFor: 'today',
            dueDate: t.dueDate,
            description: t.whyPurpose
              ? `💡 Para qué: ${t.whyPurpose}\n\n(Tarea generada desde SPI · ${session.weekStartDate})`
              : `(Tarea generada desde SPI · ${session.weekStartDate})`,
          })
          return { ...t, linkedTaskId: realTaskId }
        })

        // Auto-tick the "cerrar" checklist item — the user just closed,
        // they shouldn't have to also remember to tick it. We look it up
        // by key (matches DEFAULT_SPI_TEMPLATE.mainChecklist.cerrar).
        const autoCheckedMain = { ...session.mainChecklist, cerrar: true }

        const closedSession: SPISession = {
          ...session,
          tasks: updatedTasks,
          closedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          mood: args.mood ?? session.mood,
          notes: args.notes ?? session.notes,
          mainChecklist: autoCheckedMain,
          score: computeScore({
            ...session,
            tasks: updatedTasks,
            mood: args.mood ?? session.mood,
            mainChecklist: autoCheckedMain,
          }),
          // Snapshot congelado de hábitos + KPIs al cierre — espejo
          // del MonthClosureSnapshot pero con 7 días. Vive con la
          // sesión así la revisión histórica no depende del estado
          // live de habits/kpis stores (pueden borrar/renombrar
          // después). Pasamos la sesión actualizada (con notes/mood
          // recién cargados) por si los KPIs leen de ahí.
          weekSnapshot: buildWeekSnapshot(session.weekStartDate, {
            ...session,
            tasks: updatedTasks,
            mood: args.mood ?? session.mood,
            notes: args.notes ?? session.notes,
            mainChecklist: autoCheckedMain,
          }),
          // Snapshot del calendario semanal — congela los bloques timeados
          // (eventos GCal + tareas/subtareas con dueTime) tal como
          // quedaron al cierre. Sirve para comparar semana a semana
          // cómo se organizó el tiempo. Vive con la sesión así sobrevive
          // a borrados de tasks/events posteriores.
          calendarSnapshot: buildCalendarSnapshot(session.weekStartDate),
        }
        set((s) => ({
          sessions: s.sessions.map((sess) => sess.id === id ? closedSession : sess),
        }))

        // XP/level computed AFTER updating, using the just-closed session.
        const xpAfter = totalXPFromSessions(get().sessions)
        const xp = computeSessionXP(closedSession)
        const leveledUp = didLevelUp(xpBefore, xpAfter)
        const newLevel = levelFromXP(xpAfter).level
        const previousLevel = levelFromXP(xpBefore).level

        const pushed = updatedTasks.filter((t) => t.linkedTaskId && !session.tasks.find((o) => o.id === t.id)?.linkedTaskId).length
        return { pushedTasks: pushed, xp, leveledUp, newLevel, previousLevel }
      },

      recaptureSnapshots: (sessionId) => {
        const session = get().sessions.find((s) => s.id === sessionId)
        if (!session) return 0
        const calendarSnapshot = buildCalendarSnapshot(session.weekStartDate)
        const weekSnapshot = buildWeekSnapshot(session.weekStartDate, session)
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? { ...sess, calendarSnapshot, weekSnapshot, updatedAt: new Date().toISOString() }
              : sess,
          ),
        }))
        return calendarSnapshot.blocks.length
      },

      fixCalendarSnapshotWeeks: () => {
        let fixed = 0
        set((s) => {
          let changed = false
          const sessions = s.sessions.map((sess) => {
            if (!sess.calendarSnapshot) return sess
            const correctMonday = calendarMondayForSpiWeek(sess.weekStartDate)
            // Ya está bien → no tocar (evita drift al re-leer estado live).
            if (sess.calendarSnapshot.weekStartDate === correctMonday) return sess
            // Semana equivocada (congelada con el bug) → re-capturar con la
            // lógica corregida, leyendo el mejor estado disponible ahora.
            const fresh = buildCalendarSnapshot(sess.weekStartDate)
            fixed++
            changed = true
            return { ...sess, calendarSnapshot: fresh }
          })
          return changed ? { sessions } : s
        })
        return fixed
      },

      addBitacoraEntry: (e) => {
        const id = genId()
        const nowIso = new Date().toISOString()
        set((s) => ({
          bitacoraEntries: [
            { ...e, id, createdAt: nowIso, updatedAt: nowIso },
            ...s.bitacoraEntries,
          ],
        }))
        return id
      },

      updateBitacoraEntry: (id, patch) =>
        set((s) => ({
          bitacoraEntries: s.bitacoraEntries.map((e) =>
            e.id !== id ? e : { ...e, ...patch, updatedAt: new Date().toISOString() }
          ),
        })),

      removeBitacoraEntry: (id) =>
        set((s) => ({
          bitacoraEntries: s.bitacoraEntries.filter((e) => e.id !== id),
        })),

      updateTemplate: (t) => set({
        // Bump version so future sessions snapshot the new template id.
        template: { ...t, version: (get().template.version ?? 0) + 1 },
      }),
      resetTemplate: () => set({
        template: { ...DEFAULT_SPI_TEMPLATE, version: (get().template.version ?? 0) + 1 },
      }),

      getTotalXP: () => totalXPFromSessions(get().sessions),
      getLevel: () => levelFromXP(totalXPFromSessions(get().sessions)),

      pushTaskToManager: (sessionId, taskId) => {
        const session = get().sessions.find((s) => s.id === sessionId)
        const task = session?.tasks.find((t) => t.id === taskId)
        if (!session || !task || task.linkedTaskId) return

        const tasksApi = useTasksStore.getState()
        const projectId = tasksApi.ensureSystemProject({
          systemProjectKey: 'spi',
          name: 'SPI',
          color: '#d946ef',
          icon: '♾️',
        })
        const realTaskId = tasksApi.addTask({
          title: task.title,
          projectId,
          status: 'To Do',
          priority: task.important ? 'high' : 'medium',
          importance: task.important ? 'high' : 'medium',
          subtasks: [],
          scheduledFor: 'today',
          dueDate: task.dueDate,
          description: task.whyPurpose
            ? `💡 Para qué: ${task.whyPurpose}\n\n(Tarea generada desde SPI · ${session.weekStartDate})`
            : `(Tarea generada desde SPI · ${session.weekStartDate})`,
        })
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              tasks: sess.tasks.map((t) => t.id === taskId ? { ...t, linkedTaskId: realTaskId } : t),
            }
          ),
        }))
      },

      deleteSession: (id) =>
        set((s) => ({
          sessions: s.sessions.filter((sess) => sess.id !== id),
          activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
        })),

      toggleChecklistItem: (id, key) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== id ? sess : {
              ...sess,
              updatedAt: new Date().toISOString(),
              mainChecklist: { ...sess.mainChecklist, [key]: !sess.mainChecklist[key] },
            }
          ),
        })),

      updateValue: (sessionId, sectionKey, fieldKey, value) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              updatedAt: new Date().toISOString(),
              values: {
                ...sess.values,
                [sectionKey]: { ...(sess.values[sectionKey] ?? {}), [fieldKey]: value },
              },
            }
          ),
        })),

      setSessionLanes: (sessionId, lanes) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              selectedLanes: lanes,
              updatedAt: new Date().toISOString(),
            }
          ),
        })),

      setSessionKpis: (sessionId, kpiIds) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              selectedKpiIds: kpiIds,
              updatedAt: new Date().toISOString(),
            }
          ),
        })),

      addTask: (sessionId, task) => {
        const id = genId()
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              updatedAt: new Date().toISOString(),
              tasks: [...sess.tasks, { ...task, id }],
            }
          ),
        }))
        // Si la sesión YA está cerrada, materializá la tarea de una en el
        // task manager (replica lo que hace el cierre con todas las tareas).
        // Si no, quedaría como SPITask sin `linkedTaskId` → no aparece en el
        // proyecto SPI ni como checkbox en Prioridades del Panel. En sesiones
        // ABIERTAS no se toca: se pushean todas juntas al cerrar.
        const sess = get().sessions.find((s) => s.id === sessionId)
        if (sess?.closedAt && !task.linkedTaskId) {
          get().pushTaskToManager(sessionId, id)
        }
        return id
      },

      updateTask: (sessionId, taskId, patch) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              updatedAt: new Date().toISOString(),
              tasks: sess.tasks.map((t) => t.id === taskId ? { ...t, ...patch } : t),
            }
          ),
        })),

      removeTask: (sessionId, taskId) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              updatedAt: new Date().toISOString(),
              tasks: sess.tasks.filter((t) => t.id !== taskId),
            }
          ),
        })),

      reorderTasks: (sessionId, orderedIds) =>
        set((s) => ({
          sessions: s.sessions.map((sess) => {
            if (sess.id !== sessionId) return sess
            const byId = new Map(sess.tasks.map((t) => [t.id, t]))
            const next = orderedIds.map((id) => byId.get(id)).filter(Boolean) as SPITask[]
            // Append any task missing from orderedIds at the end.
            for (const t of sess.tasks) if (!orderedIds.includes(t.id)) next.push(t)
            return { ...sess, tasks: next, updatedAt: new Date().toISOString() }
          }),
        })),

      reconcileRecurringSpiTasks: () => {
        const allTasks = useTasksStore.getState().tasks
        const { sessions } = get()

        // Map linkedTaskId → SPITask (todas las sesiones). Sirve para
        // (a) dedup —saber qué tareas globales ya están en algún listado— y
        // (b) heredar ⭐/⚡ de la tarea ORIGINAL de la cadena (recurringHeadId).
        const spiTaskByLinkedId = new Map<string, SPITask>()
        for (const sess of sessions) {
          for (const st of sess.tasks ?? []) {
            if (st.linkedTaskId) spiTaskByLinkedId.set(st.linkedTaskId, st)
          }
        }

        // sessionId → SPITasks nuevas a agregar.
        const additions = new Map<string, SPITask[]>()

        for (const t of Object.values(allTasks)) {
          if (!t.recurringHeadId) continue           // no es instancia recurrente
          if (t.archivedAt || !t.dueDate) continue
          if (spiTaskByLinkedId.has(t.id)) continue  // ya está en algún listado
          const source = spiTaskByLinkedId.get(t.recurringHeadId)
          if (!source) continue                      // la cadena no nació en el SPI

          // Sábado-ancla de la semana SPI de la instancia, por su dueDate.
          const [y, m, d] = t.dueDate.split('-').map(Number)
          const anchor = activeWeekAnchorYmd(new Date(y, m - 1, d, 12, 0, 0))
          const session = sessions.find((s) => s.weekStartDate === anchor)
          if (!session) continue                     // adjuntar solo si la sesión existe

          const newTask: SPITask = {
            // id determinístico → dos devices no duplican la misma instancia.
            id: `rec_${t.id}`,
            title: t.title,
            important: !!source.important,
            priority: !!source.priority,
            whyPurpose: source.whyPurpose,
            dueDate: t.dueDate,
            linkedTaskId: t.id,
          }
          const arr = additions.get(session.id) ?? []
          arr.push(newTask)
          additions.set(session.id, arr)
          // marcar como visto para no duplicar dentro de la misma corrida.
          spiTaskByLinkedId.set(t.id, newTask)
        }

        if (additions.size === 0) return 0
        let count = 0
        set((s) => ({
          sessions: s.sessions.map((sess) => {
            const add = additions.get(sess.id)
            if (!add || add.length === 0) return sess
            // Re-chequeo de dedup contra el estado actual del listado.
            const existing = new Set(
              (sess.tasks ?? []).map((x) => x.linkedTaskId).filter(Boolean) as string[]
            )
            const fresh = add.filter((x) => x.linkedTaskId && !existing.has(x.linkedTaskId))
            if (fresh.length === 0) return sess
            count += fresh.length
            return { ...sess, tasks: [...sess.tasks, ...fresh], updatedAt: new Date().toISOString() }
          }),
        }))
        return count
      },

      getActiveSession: () => {
        const { sessions, activeSessionId } = get()
        if (!activeSessionId) return null
        return sessions.find((s) => s.id === activeSessionId) ?? null
      },

      /** Consecutive weeks (starting from the latest closed session
       *  walking backwards) where a session exists AND was closed. */
      getStreak: () => {
        const closed = get().sessions
          .filter((s) => !!s.closedAt)
          .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))
        if (closed.length === 0) return 0

        let streak = 0
        let expected = closed[0].weekStartDate
        for (const sess of closed) {
          if (sess.weekStartDate !== expected) break
          streak++
          // Subtract 7 days from `expected` to get previous Saturday
          const [y, m, d] = expected.split('-').map(Number)
          const prev = new Date(y, m - 1, d)
          prev.setDate(prev.getDate() - 7)
          const py = prev.getFullYear()
          const pm = String(prev.getMonth() + 1).padStart(2, '0')
          const pd = String(prev.getDate()).padStart(2, '0')
          expected = `${py}-${pm}-${pd}`
        }
        return streak
      },
    }),
    {
      name: 'overseer-spi',
      partialize: (s) => ({
        template: s.template,
        sessions: s.sessions,
        activeSessionId: s.activeSessionId,
        bitacoraEntries: s.bitacoraEntries,
      }),
      // Auto-migration on rehydration. We need to handle 3 epochs:
      //   v1 → "aaa_emocional" + "aaa_tactico" split sections
      //   v2 → single "aaa" parent with nested subsections
      //   v3 → flat sections tagged with `laneKey` (current)
      //
      // For each upgrade, we:
      //   1. Replace template with current DEFAULT (only if user hasn't
      //      customized — we detect that via known-shape markers).
      //   2. Rewrite session.values keys to match the new structure so
      //      data the user typed before isn't orphaned.
      //   3. Initialize `selectedLanes: []` for sessions that predate it.
      onRehydrateStorage: () => (state) => {
        if (!state) return
        try {
          const sections = state.template?.sections ?? []
          const hasV1Split = sections.some((sec) => sec.key === 'aaa_emocional' || sec.key === 'aaa_tactico')
          const hasV1Bitacora = sections.some((sec) => sec.key === 'bitacora')
          const hasV2Aaa = sections.some((sec) => sec.key === 'aaa' && (sec.subsections?.length ?? 0) > 0)
          const isV3OrLater = !!state.template?.lanes && sections.some((sec) => !!sec.laneKey)

          if (!isV3OrLater && (hasV1Split || hasV1Bitacora || hasV2Aaa)) {
            // Bundled-default upgrade path from v1/v2. Custom user templates
            // wouldn't match any of these shapes — leave them alone.
            state.template = DEFAULT_SPI_TEMPLATE
          }

          // v3 → v4 upgrade: the strategic-lane "que_buscamos" section
          // dropped the 4 quarter/month fields (those live in Proyección
          // now). Detect a v3 default template and bump to v4 default.
          const isV3 = (state.template?.version ?? 0) === 3
          const queBuscamos = sections.find((sec) => sec.key === 'que_buscamos')
          const hasOldQueBuscamos = queBuscamos?.fields?.some((f) => f.key === 'meta_pro_q' || f.key === 'meta_per_q')
          if (isV3 && hasOldQueBuscamos) {
            state.template = DEFAULT_SPI_TEMPLATE
          }

          // v4 → v5 upgrade: la sección "que_buscamos" YA NO TIENE
          // fields hardcoded — SPIPage renderiza un bloque dinámico
          // (WeeklyGoalsByArea) que itera las áreas principales del plan
          // anual. Si el template persistido todavía trae fields ahí
          // (típicamente `meta_pro_sem` y `meta_per_sem` de la v4), los
          // limpiamos. Las values escritas se mantienen en session.values
          // pero quedan inertes — el bloque dinámico no las renderiza.
          const sectionsArr = state.template?.sections
          if (Array.isArray(sectionsArr)) {
            const idx = sectionsArr.findIndex((sec) => sec.key === 'que_buscamos')
            if (idx >= 0 && (sectionsArr[idx].fields?.length ?? 0) > 0) {
              const newSections = [...sectionsArr]
              newSections[idx] = { ...newSections[idx], fields: [] }
              state.template = {
                ...state.template!,
                sections: newSections,
                version: (state.template?.version ?? 0) + 1,
              }
            }
          }

          // Migrate value keys: v1/v2 used nested paths like "aaa.intencion.intencion"
          // and "aaa.profundidad.que_buscamos.meta_pro_q". v3 uses flat paths
          // like "intencion.intencion" and "que_buscamos.meta_pro_q".
          if (Array.isArray(state.sessions)) {
            state.sessions = state.sessions.map((sess) => {
              const next = { ...sess }
              // Ensure required fields exist on EVERY session — guards
              // against any payload that pre-dates a given field.
              if (!next.mainChecklist || typeof next.mainChecklist !== 'object') next.mainChecklist = {}
              if (!Array.isArray(next.tasks)) next.tasks = []
              if (!next.values || typeof next.values !== 'object') next.values = {}
              if (!Array.isArray(next.selectedLanes)) {
                // Pre-v3 sessions get ALL lanes selected so nothing disappears.
                next.selectedLanes = (state.template?.lanes ?? []).map((l) => l.key)
              }

              // Rewrite value keys (v1/v2 → v3).
              const oldVals = next.values
              const newVals: typeof oldVals = {}
              for (const [key, fields] of Object.entries(oldVals)) {
                let newKey = key
                if (newKey.startsWith('aaa.profundidad.')) newKey = newKey.slice('aaa.profundidad.'.length)
                else if (newKey.startsWith('aaa.')) newKey = newKey.slice('aaa.'.length)
                newVals[newKey] = { ...(newVals[newKey] ?? {}), ...fields }
              }
              next.values = newVals
              return next
            })
          }

          if (!Array.isArray(state.bitacoraEntries)) state.bitacoraEntries = []
        } catch (err) {
          // Migration failure shouldn't brick the SPI page. Log and reset
          // to bundled defaults so the user can keep using the app.
          console.error('SPI migration failed — resetting to defaults', err)
          state.template = DEFAULT_SPI_TEMPLATE
          if (!Array.isArray(state.sessions)) state.sessions = []
          if (!Array.isArray(state.bitacoraEntries)) state.bitacoraEntries = []
        }
      },
    }
  )
)
