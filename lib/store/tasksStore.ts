'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Task, Project, Subtask, CustomStatus } from '@/types'
import { DEFAULT_STATUSES, PROJECT_COLORS } from '@/lib/utils/constants'
import { dateKeyInTz } from '@/lib/utils/dateInTz'
import { nextRecurrenceDueDate } from '@/lib/utils/taskRecurrence'
import { syncTaskToGcal, unlinkTaskFromGcal } from '@/lib/utils/taskGcalSync'

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function today() {
  return new Date().toISOString().split('T')[0]
}

interface TasksState {
  projects: Record<string, Project>
  tasks: Record<string, Task>
  selectedProjectId: string | null

  // Project actions
  addProject: (p: { name: string; description?: string; color?: string }) => string
  updateProject: (id: string, patch: Partial<Project>) => void
  /** Mueve un proyecto en el orden manual del sidebar. delta = -1 sube,
   *  +1 baja. Si se llega a los bordes, no hace nada. */
  reorderProject: (id: string, delta: -1 | 1) => void
  deleteProject: (id: string) => void
  /** Finds an existing system project by its systemProjectKey (e.g. 'spi'),
   *  or creates one if it doesn't exist. Returns the project id. Idempotent
   *  — safe to call on every SPI page mount. */
  ensureSystemProject: (args: { systemProjectKey: 'spi'; name: string; color: string; icon?: string }) => string
  setSelectedProject: (id: string | null) => void
  addStatusToProject: (projectId: string, status: Omit<CustomStatus, 'id'>) => void
  removeStatusFromProject: (projectId: string, statusId: string) => void
  /** Migración one-shot: agrega el status "Waiting"/"Esperando" a cualquier
   *  proyecto cuyo statuses[] no lo tenga todavía. Para proyectos viejos
   *  pre-fix que solo tenían los 5 statuses originales. Idempotente: se
   *  puede llamar muchas veces, los proyectos que ya tienen Waiting no se
   *  tocan. */
  ensureWaitingStatusInAllProjects: () => void

  // Task actions
  addTask: (t: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateTask: (id: string, patch: Partial<Task>) => void
  completeTask: (id: string) => void
  deleteTask: (id: string) => void
  /** Duplica una task COMPLETA con todas sus subtareas (1 y 2 nivel),
   *  generando nuevos ids para todos. Útil para usar tasks como plantilla
   *  de proceso: el user arma una tarea madre con sub-pasos, y la
   *  duplica cada vez que repite el proceso.
   *
   *  Reglas del duplicado:
   *   - Se generan nuevos ids para la task y todas sus subtasks.
   *   - parentId de las subtask2 se re-mapea a los nuevos ids de subtask1.
   *   - Subtasks archivadas NO se copian (ruido del histórico).
   *   - Todo el estado de progreso se resetea: completed=false, sin
   *     completedAt, sin archivedAt, status → primer status open del
   *     proyecto. La copia arranca limpia.
   *   - createdAt/updatedAt = ahora. postponedCount = 0.
   *   - Sin linkage a GCal (eventId/calendarId limpios — si el user
   *     quiere, lo re-vincula vía el sync al editar fecha/hora).
   *   - Recurrencia se preserva (si el original era recurrente, la copia
   *     también, pero por el momento puede confundir — el user puede
   *     borrarla con un click).
   *   - La copia se inserta INMEDIATAMENTE DESPUÉS de la original en
   *     `project.taskIds` (no al final) — visualmente queda al lado.
   *   - Título: "Original (copia)" — el user lo edita después.
   *
   *  Devuelve el id de la nueva task, o null si la fuente no existe. */
  duplicateTask: (id: string) => string | null
  /** Moves all completed tasks (status countsAsDone) into the archive
   *  ("papelera") if their completedAt date — computed in the given IANA
   *  timezone — is strictly before todayKey. Archived tasks stay in the
   *  store; they just become hidden from normal views. Returns the count
   *  archived. */
  archiveCompletedBefore: (todayKey: string, timezone: string) => number
  /** Asegura que toda tarea recurrente OVERDUE (dueDate < hoy) que aún no
   *  haya sido marcada como done tenga su "próxima instancia" creada en
   *  el futuro. Idempotente — usa `recurrenceSpawnedNext` para evitar
   *  duplicar. Si el user se olvida de completar una tarea recurrente,
   *  igual la siguiente aparece sola en su nueva fecha — no perdés el
   *  hilo. Devuelve cuántas instancias nuevas se crearon. */
  ensureRecurringSpawns: (todayKey: string) => number
  /** Llena el buffer de instancias recurrentes para la TASK ID dada
   *  hasta tener `lookaheadCount` instancias chained. Idempotente —
   *  si la cadena ya está completa, no hace nada. Se llama al crear
   *  una recurrente Y al agregar recurrence a una tarea existente. */
  ensureRecurringBuffer: (taskId: string, lookaheadCount?: number) => void
  /** Borra todas las instancias futuras NO completadas de la cadena
   *  recurrente del head dado y re-arma con `ensureRecurringBuffer`.
   *  Lo usamos al CAMBIAR la regla de recurrencia para evitar tasks
   *  huérfanas con fechas viejas que no encajan con la nueva regla. */
  rebuildRecurringChain: (taskId: string) => void
  /** Restore an archived task: clear its archivedAt + completedAt and reset
   *  its status to the first non-done status of its project. */
  restoreFromArchive: (id: string) => void
  /** Permanently delete a single archived task (skipping the trash). */
  deletePermanently: (id: string) => void
  /** Permanently delete every archived task — "vaciar papelera". Returns count. */
  emptyArchive: () => number
  moveTask: (taskId: string, projectId: string) => void
  /** Convert a mother Task into a Subtask of another Task, bringing all
   *  its existing subtasks along as direct children of the new subtask.
   *  Nested subtasks (2-level deep) get FLATTENED into direct children
   *  because the subtask model only supports 1 level of nesting.
   *  No-op if sourceTaskId === targetTaskId or either doesn't exist. */
  convertTaskToSubtask: (sourceTaskId: string, targetTaskId: string) => void
  /** Reverso de convertTaskToSubtask: agarra una subtask1 (top-level
   *  dentro de una task madre) y la PROMUEVE a tarea madre dentro del
   *  mismo proyecto. Si la subtask1 tiene subtask2 (children con
   *  parentId apuntando a ella), esas se mudan también — quedan como
   *  subtask1 (top-level) de la nueva madre.
   *
   *  Casos cubiertos:
   *   - Si `subtaskId` no es una subtask top-level (tiene parentId),
   *     no hace nada — solo subtask1 se promueven a madres.
   *   - Subtask y children archivados NO se traen (ruido histórico).
   *   - Status/priority/dueDate/notes/description/completedAt de la
   *     subtask se preservan en la nueva task.
   *   - Children se les genera id fresco para evitar colisiones.
   *   - La nueva task se inserta INMEDIATAMENTE después de la task
   *     madre original en `project.taskIds` (queda al lado).
   *
   *  Devuelve el id de la nueva task, o null si no hay nada que hacer. */
  promoteSubtaskToTask: (taskId: string, subtaskId: string) => string | null
  postponeTask: (id: string) => void
  pushRemainingToTomorrow: () => void
  planNext2h: () => Task[]

  // Subtask actions
  addSubtask: (taskId: string, title: string, parentId?: string) => void
  updateSubtask: (taskId: string, subtaskId: string, patch: Partial<Subtask>) => void
  toggleSubtask: (taskId: string, subtaskId: string) => void
  deleteSubtask: (taskId: string, subtaskId: string) => void
}

export const useTasksStore = create<TasksState>()(
  persist(
    (set, get) => ({
      selectedProjectId: null,
      projects: {},
      tasks: {},

      setSelectedProject: (id) => set({ selectedProjectId: id }),

      addProject: ({ name, description, color }) => {
        const id = genId()
        const existingColors = Object.values(get().projects).map((p) => p.color)
        const nextColor = color ?? PROJECT_COLORS.find((c) => !existingColors.includes(c)) ?? PROJECT_COLORS[0]
        set((s) => ({
          projects: {
            ...s.projects,
            [id]: {
              id,
              name,
              description,
              color: nextColor,
              statuses: DEFAULT_STATUSES,
              taskIds: [],
              createdAt: new Date().toISOString(),
              archived: false,
            },
          },
        }))
        return id
      },

      updateProject: (id, patch) =>
        set((s) => ({
          projects: { ...s.projects, [id]: { ...s.projects[id], ...patch } },
        })),

      reorderProject: (id, delta) =>
        set((s) => {
          // Trabajamos solo sobre proyectos NO archivados, que es lo que
          // efectivamente se ve en el sidebar. El orden actual es por el
          // campo `order` si está, sino por createdAt como fallback.
          const visible = Object.values(s.projects)
            .filter((p) => !p.archived)
            .sort((a, b) => {
              if (a.order !== undefined && b.order !== undefined) return a.order - b.order
              if (a.order !== undefined) return -1
              if (b.order !== undefined) return 1
              return a.createdAt.localeCompare(b.createdAt)
            })
          const idx = visible.findIndex((p) => p.id === id)
          if (idx === -1) return s
          const newIdx = idx + delta
          if (newIdx < 0 || newIdx >= visible.length) return s
          // Swap y reasignamos orden 0..N-1 a TODOS para evitar drift.
          const reordered = [...visible]
          ;[reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]]
          const projects = { ...s.projects }
          reordered.forEach((p, i) => {
            projects[p.id] = { ...projects[p.id], order: i }
          })
          return { projects }
        }),

      ensureSystemProject: ({ systemProjectKey, name, color, icon }) => {
        const projects = Object.values(get().projects)

        // Candidatos: cualquier proyecto que TENGA el tag de sistema, O
        // que tenga el nombre convencional pero NO el tag (legacy: viene
        // de un pull antes de que el sync incluyera systemProjectKey, o
        // fue creado en otro device antes del fix).
        const candidates = projects.filter(
          (p) => p.systemProjectKey === systemProjectKey
            || (p.name === name && !p.systemProjectKey)
        )

        if (candidates.length === 0) {
          // Sin candidatos → crear fresh.
          const id = genId()
          set((s) => ({
            projects: {
              ...s.projects,
              [id]: {
                id, name, color, icon,
                statuses: DEFAULT_STATUSES,
                taskIds: [],
                createdAt: new Date().toISOString(),
                archived: false,
                isSystemProject: true,
                systemProjectKey,
              },
            },
          }))
          return id
        }

        // Hay 1+ candidatos. Quedamos con el MÁS VIEJO (createdAt) — los
        // demás son duplicados que se generaron por el bug del sync. Los
        // mergeamos:
        //   - taskIds: concatenamos todos en el "keep"
        //   - tasks que apuntaban a duplicates → re-apuntan a keep
        //   - duplicates se borran
        //   - keep queda tagged con isSystemProject + systemProjectKey
        //     (cura los legacy que pulleaste sin tag).
        const sorted = [...candidates].sort((a, b) =>
          (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
        )
        const keep = sorted[0]
        const duplicates = sorted.slice(1)

        // Si hay un solo candidato Y ya está bien tagged, no tocamos nada.
        if (duplicates.length === 0
          && keep.systemProjectKey === systemProjectKey
          && keep.isSystemProject) {
          return keep.id
        }

        set((s) => {
          const newProjects = { ...s.projects }
          const newTasks = { ...s.tasks }

          // Recolectar todos los taskIds (sin duplicar ids).
          const mergedTaskIds = Array.from(new Set([
            ...(newProjects[keep.id]?.taskIds ?? []),
            ...duplicates.flatMap((d) => d.taskIds ?? []),
          ]))

          // Heal el "keep": agregar tag + flag + merge de taskIds.
          newProjects[keep.id] = {
            ...newProjects[keep.id],
            isSystemProject: true,
            systemProjectKey,
            taskIds: mergedTaskIds,
          }

          // Re-apuntar las tasks de los duplicates al keep.
          for (const d of duplicates) {
            for (const tid of d.taskIds ?? []) {
              if (newTasks[tid]) {
                newTasks[tid] = { ...newTasks[tid], projectId: keep.id }
              }
            }
            delete newProjects[d.id]
          }

          return { projects: newProjects, tasks: newTasks }
        })

        return keep.id
      },

      deleteProject: (id) =>
        set((s) => {
          // System projects (e.g. SPI) cannot be deleted from the task
          // manager — they're owned by another subsystem that needs them
          // to exist. The UI already disables the delete button, but we
          // guard at the store too in case someone calls programmatically.
          if (s.projects[id]?.isSystemProject) return s
          const { [id]: _, ...rest } = s.projects
          const tasks = Object.fromEntries(
            Object.entries(s.tasks).filter(([, t]) => t.projectId !== id)
          )
          return { projects: rest, tasks }
        }),

      ensureWaitingStatusInAllProjects: () => set((s) => {
        // Una versión en inglés y una en español para no atropellar
        // proyectos que el user haya creado en el otro idioma. Si el
        // proyecto YA tiene un status con cualquiera de estos labels,
        // no agregamos nada.
        const WAITING_LABELS = new Set(['Waiting', 'Esperando'])
        const newProjects = { ...s.projects }
        let changed = false
        for (const id of Object.keys(newProjects)) {
          const proj = newProjects[id]
          if (!proj?.statuses) continue
          if (proj.statuses.some((st) => WAITING_LABELS.has(st.label))) continue
          // Append al final con order = length actual (no renumeramos los
          // existentes para no romper el orden si el user customizó).
          const newStatus: CustomStatus = {
            id: `waiting_${id.slice(0, 6)}`,
            label: 'Waiting',
            color: '#06b6d4',
            order: proj.statuses.length,
            countsAsDone: false,
          }
          newProjects[id] = { ...proj, statuses: [...proj.statuses, newStatus] }
          changed = true
        }
        return changed ? { projects: newProjects } : s
      }),

      addStatusToProject: (projectId, status) => {
        const id = genId()
        set((s) => ({
          projects: {
            ...s.projects,
            [projectId]: {
              ...s.projects[projectId],
              statuses: [...s.projects[projectId].statuses, { ...status, id }],
            },
          },
        }))
      },

      removeStatusFromProject: (projectId, statusId) =>
        set((s) => ({
          projects: {
            ...s.projects,
            [projectId]: {
              ...s.projects[projectId],
              statuses: s.projects[projectId].statuses.filter((st) => st.id !== statusId),
            },
          },
        })),

      addTask: (t) => {
        const id = genId()
        const now = new Date().toISOString()
        // Si la task viene con dueTime y NO viene durationMinutes, default a
        // 60 (1 hora). Si no viene dueTime, NO le seteamos duration — sin
        // hora no aplica.
        const withDefaults: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> = t.dueTime && !t.durationMinutes
          ? { ...t, durationMinutes: 60 }
          : t
        const task: Task = { ...withDefaults, id, createdAt: now, updatedAt: now }
        set((s) => ({
          tasks: { ...s.tasks, [id]: task },
          projects: {
            ...s.projects,
            [t.projectId]: {
              ...s.projects[t.projectId],
              taskIds: [...(s.projects[t.projectId]?.taskIds ?? []), id],
            },
          },
        }))
        // Buffer recurrente: si la task viene con recurrence + dueDate,
        // disparamos el helper que spawnea las próximas 6 instancias.
        // Si NO viene con recurrence al crear (el caso común: el user
        // agrega recurrence después desde TaskDetail), `updateTask`
        // dispara el buffer cuando detecta la patch.
        if (task.recurrence && task.dueDate) {
          get().ensureRecurringBuffer(id, 14)
        }

        // GCal sync fire-and-forget — no bloqueamos la respuesta del store.
        // El sync helper persiste los IDs del evento creado de vuelta vía
        // updateTask cuando termina.
        ;(async () => {
          const patch = await syncTaskToGcal(task)
          if (patch.gcalEventId || patch.gcalCalendarId) {
            get().updateTask(id, patch)
          }
        })()
        return id
      },

      /** Llena el buffer de instancias recurrentes para el TASK ID dado
       *  hasta el FIN de la semana de la dueDate del head (Lun→Dom).
       *  El parámetro `lookaheadCount` se mantiene como tope de seguridad
       *  (no más de N pasos en la cadena), pero el corte real es la
       *  ventana semanal — así una recurrencia weekly genera 1, weekdays
       *  genera ≤5, daily genera ≤7, custom genera tantas como días
       *  caigan en la semana.
       *
       *  Idempotente: si la cadena ya cubre la semana, no hace nada.
       *
       *  Se llama tanto al CREAR una recurrente (vía addTask) como al
       *  AGREGAR recurrencia a una tarea existente (vía updateTask) y
       *  como BACKFILL al montar TasksPage. Sin esto el user agregaba
       *  recurrence a una tarea ya creada y no veía nada de la semana
       *  hasta completarla. */
      ensureRecurringBuffer: (taskId, lookaheadCount = 14) => {
        const nowIso = new Date().toISOString()
        set((s) => {
          const head = s.tasks[taskId]
          if (!head?.recurrence || !head.dueDate) return s
          const tasks = { ...s.tasks }
          let projects = s.projects

          // ─── Ventana semanal Lun→Dom de la dueDate del head ───
          // Si el head es Sábado, la "semana" es esa Lun anterior → Dom
          // siguiente. Si el head es Lunes, esa misma semana. Spawneamos
          // solo instancias cuyo dueDate cae dentro de esta ventana.
          //
          // Por qué la semana del head y no la de hoy: el user crea sus
          // recurrentes el Sábado/Domingo para la semana que ARRANCA;
          // la dueDate apunta al Lunes (o al día que elija). La ventana
          // que importa es la del head, no la de "ahora".
          const [hy, hm, hd] = head.dueDate.split('-').map(Number)
          const headDate = new Date(hy, hm - 1, hd); headDate.setHours(0, 0, 0, 0)
          // Lun=1 … Dom=0. Queremos arrancar la semana en Lun.
          const dayOfWeek = headDate.getDay()                  // 0..6 (Dom=0)
          const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
          const weekStart = new Date(headDate); weekStart.setDate(headDate.getDate() - daysToMonday)
          const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)
          const fmtYmd = (d: Date) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          const weekEndYmd = fmtYmd(weekEnd)

          // GUARD anti-duplicados: dado un dueDate target, devuelve true
          // si ya existe una task de la "misma serie" (mismo projectId +
          // title + recurrence definida) con ese dueDate. Esto evita que
          // múltiples llamadas a ensureRecurringBuffer (por re-render,
          // por toggle de chip de día, etc.) generen tasks con fechas
          // repetidas.
          const dupeExists = (targetDue: string) =>
            Object.values(tasks).some((t) =>
              t.id !== taskId
              && t.projectId === head.projectId
              && t.title === head.title
              && t.dueDate === targetDue
              && !t.archivedAt
              && !!t.recurrence,
            )

          // Avanzar al final de la cadena ya existente — desde acá vamos
          // a spawnear hacia adelante hasta el corte semanal. Walk by
          // dueDate: buscamos el sucesor con dueDate más cercano > prev,
          // dentro de la ventana semanal. Esto es más robusto que walk
          // por recurrence porque no depende de que el flag spawnedNext
          // esté coherente.
          let prevDue = head.dueDate
          for (let safety = 0; safety < lookaheadCount; safety++) {
            const candidates = Object.values(tasks).filter((t) =>
              t.id !== taskId
              && t.projectId === head.projectId
              && t.title === head.title
              && !t.archivedAt
              && !!t.recurrence
              && !!t.dueDate
              && t.dueDate > prevDue
              && t.dueDate <= weekEndYmd,
            ).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
            if (candidates.length === 0) break
            prevDue = candidates[0].dueDate!
          }

          // Spawn loop — desde la última fecha conocida, generamos las
          // siguientes hasta llegar fuera de la semana del head. Skip si
          // la fecha ya existe (anti-dup).
          for (let i = 0; i < lookaheadCount; i++) {
            const next = nextRecurrenceDueDate(prevDue, head.recurrence!)
            if (!next) break                         // serie terminó (until)
            if (next > weekEndYmd) break             // ya nos pasamos del Domingo de la semana del head
            if (next <= head.dueDate) {              // safety: jamás retroceder
              prevDue = next
              continue
            }
            if (dupeExists(next)) {                  // anti-duplicado idempotente
              prevDue = next
              continue
            }
            const newId = genId()
            const proj = projects[head.projectId]
            const todoStatus = proj?.statuses[0]?.label ?? 'To Do'
            tasks[newId] = {
              ...head,
              id: newId,
              dueDate: next,
              status: todoStatus,
              completedAt: undefined,
              archivedAt: undefined,
              createdAt: nowIso,
              updatedAt: nowIso,
              postponedCount: 0,
              subtasks: (head.subtasks ?? []).map((sub) => ({
                ...sub, id: genId(), completed: false, completedAt: undefined, status: todoStatus,
              })),
              recurrenceSpawnedNext: false,
              gcalEventId: undefined,
              gcalCalendarId: undefined,
            }
            if (proj) {
              projects = {
                ...projects,
                [proj.id]: {
                  ...proj,
                  taskIds: [...(projects[proj.id]?.taskIds ?? []), newId],
                },
              }
            }
            prevDue = next
          }
          return { tasks, projects }
        })
      },

      /** Borra todas las instancias FUTURAS (no completadas) de la cadena
       *  recurrente del head dado, y dispara `ensureRecurringBuffer` para
       *  re-armarla con la nueva regla. Lo usamos en `updateTask` cuando
       *  el user cambia el kind o los días de la recurrencia — sin esto
       *  cambiar de [1,3,5] a [1,3] dejaba el Vie viejo huérfano y
       *  generaba "fechas raras" al opener la tarea.
       *  No toca tareas completadas (parte del histórico) ni tareas en
       *  otras semanas no spawneadas por este buffer. */
      rebuildRecurringChain: (taskId: string) => {
        set((s) => {
          const head = s.tasks[taskId]
          if (!head) return s
          // Identificamos "futuras de la cadena": mismas projectId +
          // title + recurrence definida + dueDate estrictamente > head +
          // no completadas + no archivadas.
          const toDelete = Object.values(s.tasks).filter((t) =>
            t.id !== taskId
            && t.projectId === head.projectId
            && t.title === head.title
            && !!t.recurrence
            && !!t.dueDate
            && !!head.dueDate
            && t.dueDate > head.dueDate
            && !t.completedAt
            && !t.archivedAt,
          ).map((t) => t.id)
          if (toDelete.length === 0) return s
          const tasks = { ...s.tasks }
          const projects = { ...s.projects }
          for (const id of toDelete) {
            const t = tasks[id]
            delete tasks[id]
            const proj = projects[t.projectId]
            if (proj) {
              projects[t.projectId] = {
                ...proj,
                taskIds: proj.taskIds.filter((x) => x !== id),
              }
            }
          }
          return { tasks, projects }
        })
        // Después del nuke, re-buffereamos para llenar la semana fresca
        // con la nueva regla.
        get().ensureRecurringBuffer(taskId, 14)
      },

      updateTask: (id, patch) => {
        let nextTask: Task | null = null
        let shouldSync = false
        set((s) => {
          const prev = s.tasks[id]
          if (!prev) return s

          // If the status is changing, auto-manage completedAt:
          //   - transitioning INTO a countsAsDone status → stamp completedAt
          //   - transitioning OUT of a countsAsDone status → clear completedAt
          //     (so the auto-purge doesn't reap a re-opened task tomorrow)
          let completedAtPatch: { completedAt?: string | undefined } = {}
          // Auto-downgrade de prioridad cuando se pausa: si transicionás
          // a Paused/Pausado, la urgencia ya no aplica (algo está bloqueado
          // o lo dejaste en standby). Bajamos a 'low' SOLO si el user no
          // está ya mandando un priority explícito en la misma patch
          // (respetamos su intent si la cambió a propósito).
          const PAUSED_LABELS = new Set(['Paused', 'Pausado'])
          let priorityPatch: { priority?: import('@/types').Priority } = {}
          if (typeof patch.status === 'string' && patch.status !== prev.status) {
            const proj = s.projects[prev.projectId]
            const newStatusDef = proj?.statuses.find((st) => st.label === patch.status)
            const oldStatusDef = proj?.statuses.find((st) => st.label === prev.status)
            if (newStatusDef?.countsAsDone && !oldStatusDef?.countsAsDone) {
              completedAtPatch = { completedAt: new Date().toISOString() }
            } else if (!newStatusDef?.countsAsDone && oldStatusDef?.countsAsDone) {
              completedAtPatch = { completedAt: undefined }
            }
            if (PAUSED_LABELS.has(patch.status) && patch.priority === undefined) {
              priorityPatch = { priority: 'low' }
            }
          }

          // Si la patch toca dueDate/dueTime y agrega dueTime, default
          // durationMinutes a 60 si no venía.
          const durationPatch: { durationMinutes?: number } = {}
          if (patch.dueTime && !prev.durationMinutes && patch.durationMinutes === undefined) {
            durationPatch.durationMinutes = 60
          }

          // ── Auto-detect "reprogramada":
          // Si el user mueve dueDate o dueTime Y el momento ANTERIOR ya
          // pasó (now > momento previo) Y el nuevo momento es POSTERIOR
          // al anterior, marcamos la tarea como reprogramada. Captura
          // tanto el caso clásico ("vencía ayer, la muevo a mañana") como
          // el granular ("vencía hoy 4pm, son las 5pm, la muevo a 8pm").
          // No pisamos rescheduledFrom si ya estaba seteado (preservamos
          // la fecha original original).
          const reschedPatch: { rescheduledFrom?: string } = {}
          if (!prev.completedAt && !prev.archivedAt && ('dueDate' in patch || 'dueTime' in patch)) {
            const buildMoment = (d: string | undefined, t: string | undefined): Date | null => {
              if (!d) return null
              const [yy, mm, dd] = d.split('-').map(Number)
              if (!yy || !mm || !dd) return null
              if (t) {
                const [hh, mi] = t.split(':').map(Number)
                return new Date(yy, mm - 1, dd, hh ?? 0, mi ?? 0, 0)
              }
              // Sin hora: el "momento" es el final del día (23:59:59).
              // Así una tarea fechada ayer cuenta como overdue hoy en cualquier
              // hora; una fechada HOY sin hora no cuenta como overdue salvo
              // que terminemos el día.
              return new Date(yy, mm - 1, dd, 23, 59, 59)
            }
            const prevMoment = buildMoment(prev.dueDate, prev.dueTime)
            const newDueDate = ('dueDate' in patch ? patch.dueDate : prev.dueDate)
            const newDueTime = ('dueTime' in patch ? patch.dueTime : prev.dueTime)
            const newMoment = buildMoment(newDueDate, newDueTime)
            const now = new Date()
            if (
              prevMoment
              && newMoment
              && prevMoment.getTime() < now.getTime()       // el anterior ya pasó
              && newMoment.getTime() > prevMoment.getTime() // el nuevo es posterior
              && !prev.rescheduledFrom                       // no pisar si ya estaba marcada
            ) {
              reschedPatch.rescheduledFrom = prev.dueDate
            }
          }

          const merged = { ...prev, ...patch, ...completedAtPatch, ...priorityPatch, ...durationPatch, ...reschedPatch, updatedAt: new Date().toISOString() }
          nextTask = merged
          // Flag: ¿la patch acaba de AGREGAR recurrence o cambió su kind?
          // Si sí, después del set() vamos a disparar el buffer para que
          // la semana entera se vea instantáneamente. Importante: solo
          // si hay dueDate (sin fecha no hay ancla).
          const prevR = prev.recurrence
          const newR = merged.recurrence
          const recurrenceJustAdded = !!(merged.dueDate && newR && (!prevR || prevR.kind !== newR.kind || JSON.stringify(prevR.daysOfWeek ?? []) !== JSON.stringify(newR.daysOfWeek ?? [])))
          ;(merged as Task & { __triggerBuffer?: boolean }).__triggerBuffer = recurrenceJustAdded

          // Decidir si re-sincronizar a GCal. Trigger cuando cambia algo
          // que afecta el evento: title, dueDate, dueTime, durationMinutes,
          // description, completedAt (deselectea), archivedAt.
          const eventRelevantKeys = ['title', 'dueDate', 'dueTime', 'durationMinutes', 'description', 'completedAt', 'archivedAt'] as const
          shouldSync = eventRelevantKeys.some((k) => k in patch) ||
            'completedAt' in completedAtPatch ||
            'durationMinutes' in durationPatch

          return {
            tasks: {
              ...s.tasks,
              [id]: merged,
            },
          }
        })
        // Si la patch acaba de agregar/cambiar recurrence, NUKEAMOS las
        // instancias futuras de la cadena vieja y re-armamos con la nueva
        // regla. Esto previene "fechas repetidas o raras" que aparecían
        // antes cuando solo agregábamos al buffer sobre una cadena que
        // ya tenía instancias con la regla anterior.
        if (nextTask && (nextTask as Task & { __triggerBuffer?: boolean }).__triggerBuffer) {
          delete (nextTask as Task & { __triggerBuffer?: boolean }).__triggerBuffer
          get().rebuildRecurringChain(id)
        }

        // Sync fire-and-forget — el patch que devuelve syncTaskToGcal
        // contiene los IDs del evento creado/borrado; lo aplicamos vía
        // un segundo set() bypaseando esta misma updateTask (para no
        // disparar otro sync recursivo).
        if (shouldSync && nextTask) {
          ;(async () => {
            const syncPatch = await syncTaskToGcal(nextTask!)
            if (syncPatch.gcalEventId !== undefined || syncPatch.gcalCalendarId !== undefined) {
              set((s) => {
                const cur = s.tasks[id]
                if (!cur) return s
                return {
                  tasks: {
                    ...s.tasks,
                    [id]: {
                      ...cur,
                      gcalEventId: syncPatch.gcalEventId,
                      gcalCalendarId: syncPatch.gcalCalendarId,
                    },
                  },
                }
              })
            }
          })()
        }
      },

      completeTask: (id) => {
        // Toggle: si ya está completada, REVIERTE a To Do (limpia
        // completedAt + status al primer status NO-done del proyecto).
        // Si no está completada, la marca como done normalmente.
        // Mirrors el comportamiento de toggleSubtask, que también permite
        // des-completar con un segundo click.
        const taskBefore = get().tasks[id]
        if (!taskBefore) return
        const projBefore = get().projects[taskBefore.projectId]
        const wasDone = !!taskBefore.completedAt
          || !!projBefore?.statuses.find((st) => st.label === taskBefore.status)?.countsAsDone

        if (wasDone) {
          // ── Revertir a To Do
          set((s) => {
            const task = s.tasks[id]
            if (!task) return s
            const proj = s.projects[task.projectId]
            const todoStatus =
              proj?.statuses.find((st) => !st.countsAsDone)?.label
              ?? proj?.statuses[0]?.label
              ?? 'To Do'
            const now = new Date().toISOString()
            return {
              tasks: {
                ...s.tasks,
                [id]: {
                  ...task,
                  status: todoStatus,
                  completedAt: undefined,
                  // archivedAt también limpio: si el auto-purge ya la mandó
                  // a la papelera y el user la desmarca, debe volver al
                  // listado activo.
                  archivedAt: undefined,
                  updatedAt: now,
                },
              },
            }
          })
          return
        }

        // ── Marcar como done (camino original) ──
        // Unlink del evento GCal — la task completada deja de ocupar
        // espacio en el calendario. Pre-set para tener los IDs antes
        // de que el state.tasks[id] cambie.
        if (taskBefore.gcalEventId && taskBefore.gcalCalendarId) {
          unlinkTaskFromGcal(taskBefore).catch(() => { /* noop */ })
        }
        // Captura del id de la instancia spawneada (si hay) — lo seteamos
        // adentro del set() y lo leemos después para fillear su semana.
        let postSpawnedId: string | null = null
        set((s) => {
          const task = s.tasks[id]
          if (!task) return s
          const proj = s.projects[task.projectId]
          const doneStatus = proj?.statuses.find((st) => st.countsAsDone)?.label ?? 'Done'
          const now = new Date().toISOString()

          const updatedTasks = {
            ...s.tasks,
            [id]: {
              ...task,
              status: doneStatus,
              completedAt: now,
              updatedAt: now,
              // Limpiar marca de "tardía" al completar — la urgencia
              // visual deja de tener sentido una vez resuelta.
              rescheduledFrom: undefined,
            },
          }
          let updatedProjects = s.projects

          // NO spawn aquí. Completar una recurrente NO crea nada nuevo.
          // - La siguiente instancia de la SEMANA EN CURSO ya existe
          //   (la creó el buffer cuando se creó la tarea o se cambió la
          //   recurrencia).
          // - La PRÓXIMA SEMANA se arma sola cuando el user abre la app
          //   en una fecha posterior al final de la cadena actual —
          //   `ensureRecurringSpawns` detecta que el chain end quedó
          //   "viejo" y crea la próxima semana en bloque.

          return { tasks: updatedTasks, projects: updatedProjects }
        })

        // postSpawnedId nunca se asigna ahora — el bloque condicional fue
        // removido. La variable queda solo por compatibilidad de signature.
        if (postSpawnedId) {
          get().ensureRecurringBuffer(postSpawnedId, 14)
        }
      },

      duplicateTask: (id) => {
        const source = get().tasks[id]
        if (!source) return null
        const nowIso = new Date().toISOString()
        const newTaskId = genId()
        const proj = get().projects[source.projectId]
        const firstOpenStatus =
          proj?.statuses.find((st) => !st.countsAsDone)?.label
          ?? proj?.statuses[0]?.label
          ?? 'To Do'

        // Map old subtask id → new subtask id, para re-mapear parentId.
        // Solo incluimos subtasks NO archivadas — la archive es ruido
        // histórico que no querés arrastrar al duplicado.
        const liveSubs = source.subtasks.filter((sub) => !sub.archivedAt)
        const subIdMap = new Map<string, string>()
        for (const sub of liveSubs) {
          subIdMap.set(sub.id, genId())
        }

        // Construir las subtasks nuevas: ids frescos, estado de progreso
        // reseteado, parentId re-mapeado a los nuevos ids.
        const newSubtasks: Subtask[] = liveSubs.map((sub) => ({
          ...sub,
          id: subIdMap.get(sub.id)!,
          completed: false,
          completedAt: undefined,
          archivedAt: undefined,
          status: firstOpenStatus,
          // Si el parentId original existe en el map, re-mapeamos. Si no
          // (parentId apuntaba a una subtask archivada), queda como top-level.
          parentId: sub.parentId ? subIdMap.get(sub.parentId) ?? undefined : undefined,
        }))

        // Build the duplicate task — clean slate de progreso + sin GCal.
        const newTask: Task = {
          ...source,
          id: newTaskId,
          title: `${source.title} (copia)`,
          subtasks: newSubtasks,
          status: firstOpenStatus,
          completedAt: undefined,
          archivedAt: undefined,
          createdAt: nowIso,
          updatedAt: nowIso,
          postponedCount: 0,
          // GCal: la copia es una task fresca. Si el original tenía evento
          // sincronizado, el nuevo NO empieza con uno — el sync lo crea
          // (solo si el user le pone dueTime/duration luego).
          gcalEventId: undefined,
          gcalCalendarId: undefined,
        }

        set((s) => {
          // Insertamos la copia INMEDIATAMENTE DESPUÉS del original en
          // el orden del proyecto — así visualmente queda al lado.
          const sourceProj = s.projects[source.projectId]
          const taskIds = [...(sourceProj?.taskIds ?? [])]
          const idx = taskIds.indexOf(id)
          if (idx === -1) taskIds.push(newTaskId)
          else taskIds.splice(idx + 1, 0, newTaskId)
          return {
            tasks: { ...s.tasks, [newTaskId]: newTask },
            projects: {
              ...s.projects,
              [source.projectId]: {
                ...sourceProj,
                taskIds,
              },
            },
          }
        })

        return newTaskId
      },

      deleteTask: (id) => {
        // Unlink del evento GCal ANTES de borrar la task del store, así
        // tenemos los IDs para llamar a la API.
        const task = get().tasks[id]
        if (task?.gcalEventId && task?.gcalCalendarId) {
          unlinkTaskFromGcal(task).catch(() => { /* noop */ })
        }
        set((s) => {
          const task = s.tasks[id]
          if (!task) return s

          // If the task is ALREADY archived (you're cleaning it up from the
          // papelera), this is a hard delete. Otherwise, soft-delete: move it
          // to the archive so the user can recover it from the papelera.
          if (task.archivedAt) {
            const { [id]: _gone, ...tasks } = s.tasks
            return {
              tasks,
              projects: {
                ...s.projects,
                [task.projectId]: {
                  ...s.projects[task.projectId],
                  taskIds: s.projects[task.projectId]?.taskIds.filter((tid) => tid !== id) ?? [],
                },
              },
            }
          }

          // Soft delete → archive
          const nowIso = new Date().toISOString()
          return {
            tasks: {
              ...s.tasks,
              [id]: {
                ...task,
                archivedAt: nowIso,
                // If the task wasn't already completed, stamp completedAt now
                // so the archive UI has a sensible "completada" date to show.
                completedAt: task.completedAt ?? nowIso,
                updatedAt: nowIso,
              },
            },
          }
        })
      },

      archiveCompletedBefore: (todayKey, timezone) => {
        let archived = 0
        const nowIso = new Date().toISOString()

        // Política HÍBRIDA basada en visibilidad en el calendario:
        //
        // - Las tareas con dueDate + dueTime (que aparecen como BLOQUE
        //   en el calendario) se mantienen visibles hasta el DOMINGO de
        //   la semana en que se completaron. Así el snapshot del calendario
        //   del SPI semanal queda completo cuando hacés el cierre.
        // - Las tareas SIN dueDate o sin dueTime (las "puro to-do", que
        //   nunca aparecieron en el calendario) se archivan al DÍA
        //   SIGUIENTE del completion. Mantenerlas toda la semana solo
        //   ensucia el task manager sin aportar al SPI.
        //
        // Mismo criterio para subtareas: timed → end-of-week, untimed →
        // next-day.
        //
        // El "domingo de la semana" se calcula respetando la timezone
        // del user. Usamos noon para evitar bordes raros con DST.
        const endOfWeekKey = (dateKey: string): string => {
          const [y, m, d] = dateKey.split('-').map(Number)
          const date = new Date(y, m - 1, d, 12, 0, 0)
          const dow = date.getDay()  // 0=Dom, 1=Lun, ..., 6=Sáb
          const daysUntilSunday = dow === 0 ? 0 : 7 - dow
          date.setDate(date.getDate() + daysUntilSunday)
          const yy = date.getFullYear()
          const mm = String(date.getMonth() + 1).padStart(2, '0')
          const dd = String(date.getDate()).padStart(2, '0')
          return `${yy}-${mm}-${dd}`
        }

        set((s) => {
          const tasks = { ...s.tasks }
          for (const t of Object.values(tasks)) {
            const proj = s.projects[t.projectId]
            if (!proj) continue

            // ── Subtasks: archive con regla híbrida.
            const updatedSubs = (t.subtasks ?? []).map((st) => {
              if (st.archivedAt) return st
              if (!st.completed || !st.completedAt) return st
              const stKey = dateKeyInTz(new Date(st.completedAt), timezone)
              // Subtask con dueDate + dueTime → aparece en el calendario
              // → espera al fin de semana.
              const subIsTimed = !!st.dueDate && !!st.dueTime
              const ready = subIsTimed
                ? endOfWeekKey(stKey) < todayKey
                : stKey < todayKey
              if (!ready) return st
              archived++
              return { ...st, archivedAt: nowIso }
            })
            const subsChanged = updatedSubs.some((st, i) => st !== t.subtasks?.[i])

            // ── Parent task: misma regla híbrida.
            if (!t.archivedAt) {
              const statusDef = proj.statuses.find((st) => st.label === t.status)
              if (statusDef?.countsAsDone && t.completedAt) {
                const completedKey = dateKeyInTz(new Date(t.completedAt), timezone)
                const taskIsTimed = !!t.dueDate && !!t.dueTime
                const ready = taskIsTimed
                  ? endOfWeekKey(completedKey) < todayKey
                  : completedKey < todayKey
                if (ready) {
                  tasks[t.id] = { ...t, subtasks: updatedSubs, archivedAt: nowIso }
                  archived++
                  continue
                }
              }
            }
            if (subsChanged) tasks[t.id] = { ...t, subtasks: updatedSubs }
          }
          return { tasks }
        })
        return archived
      },

      ensureRecurringSpawns: (todayKey) => {
        // Esta acción corre al ABRIR la app y se ocupa del "rollover
        // semanal": si el final de la cadena recurrente quedó en una
        // semana ANTERIOR a la actual (porque el user no abrió la app
        // por unos días o cerró la semana entera), arma la semana que
        // está viviendo el user ahora.
        //
        // No usamos el flag `recurrenceSpawnedNext` para decidir — nos
        // basamos en la dueDate más nueva de cada serie. Una "serie" es
        // matcheada por projectId + title + recurrence definida.
        let spawned = 0
        const nowIso = new Date().toISOString()
        const spawnedIds: string[] = []
        set((s) => {
          const tasks = { ...s.tasks }
          let projects = s.projects
          // 1) Agrupar tasks recurrentes por serie (mismo project + title).
          const byKey = new Map<string, Task[]>()
          for (const t of Object.values(s.tasks)) {
            if (!t.recurrence) continue
            if (!t.dueDate) continue
            if (t.archivedAt) continue
            const key = `${t.projectId}::${t.title}`
            if (!byKey.has(key)) byKey.set(key, [])
            byKey.get(key)!.push(t)
          }
          // 2) Para cada serie, encontrar la dueDate más nueva. Si esa
          // dueDate < hoy (es decir, el final de la cadena quedó en una
          // semana o día anterior), spawnear la siguiente instancia y
          // dejar que el post-fill arme su semana entera.
          for (const arr of byKey.values()) {
            const sorted = arr.sort((a, b) => (b.dueDate ?? '').localeCompare(a.dueDate ?? ''))
            const tail = sorted[0]                 // dueDate más nueva
            if (!tail.dueDate || tail.dueDate >= todayKey) continue
            const nextDueDate = nextRecurrenceDueDate(tail.dueDate, tail.recurrence!)
            if (!nextDueDate) continue            // serie terminó (until)
            // Si ya existe una task con esa fecha en la serie, skip
            // (idempotente — múltiples llamadas no duplican).
            const dupe = arr.some((t) => t.dueDate === nextDueDate)
            if (dupe) continue

            const newId = genId()
            const proj = s.projects[tail.projectId]
            const todoStatus = proj?.statuses[0]?.label ?? 'To Do'
            const freshSubs: Subtask[] = (tail.subtasks ?? [])
              .filter((sub) => !sub.archivedAt)
              .map((sub) => ({
                ...sub,
                id: genId(),
                completed: false,
                completedAt: undefined,
                status: todoStatus,
              }))
            tasks[newId] = {
              ...tail,
              id: newId,
              dueDate: nextDueDate,
              status: todoStatus,
              completedAt: undefined,
              archivedAt: undefined,
              createdAt: nowIso,
              updatedAt: nowIso,
              postponedCount: 0,
              subtasks: freshSubs,
              recurrenceSpawnedNext: false,
            }
            if (proj) {
              projects = {
                ...projects,
                [proj.id]: {
                  ...proj,
                  taskIds: [...(projects[proj.id]?.taskIds ?? []), newId],
                },
              }
            }
            spawned++
            spawnedIds.push(newId)
          }
          return { tasks, projects }
        })
        // Post-set: el buffer arma el resto de la semana de cada spawned.
        // ensureRecurringBuffer es idempotente y respeta el dueño semanal
        // del head: si la serie es weekly + 1 día, no agrega nada más.
        for (const newId of spawnedIds) {
          get().ensureRecurringBuffer(newId, 14)
        }
        return spawned
      },

      restoreFromArchive: (id) =>
        set((s) => {
          const t = s.tasks[id]
          if (!t) return s
          const proj = s.projects[t.projectId]
          // Find a sensible non-done status to restore to. Prefer "In Progress"
          // style (first non-done), fall back to current status if nothing fits.
          const reopenStatus = proj?.statuses.find((st) => !st.countsAsDone)?.label ?? t.status
          return {
            tasks: {
              ...s.tasks,
              [id]: {
                ...t,
                archivedAt: undefined,
                completedAt: undefined,
                status: reopenStatus,
                updatedAt: new Date().toISOString(),
              },
            },
          }
        }),

      deletePermanently: (id) =>
        set((s) => {
          const task = s.tasks[id]
          if (!task) return s
          const { [id]: _gone, ...tasks } = s.tasks
          return {
            tasks,
            projects: {
              ...s.projects,
              [task.projectId]: {
                ...s.projects[task.projectId],
                taskIds: (s.projects[task.projectId]?.taskIds ?? []).filter((tid) => tid !== id),
              },
            },
          }
        }),

      emptyArchive: () => {
        let removed = 0
        set((s) => {
          const tasks: typeof s.tasks = {}
          const removedIdsByProject: Record<string, Set<string>> = {}
          for (const [id, t] of Object.entries(s.tasks)) {
            if (t.archivedAt) {
              removed++
              ;(removedIdsByProject[t.projectId] ??= new Set()).add(id)
            } else {
              tasks[id] = t
            }
          }
          const projects = { ...s.projects }
          for (const [projectId, ids] of Object.entries(removedIdsByProject)) {
            const p = projects[projectId]
            if (!p) continue
            projects[projectId] = {
              ...p,
              taskIds: (p.taskIds ?? []).filter((tid) => !ids.has(tid)),
            }
          }
          return { tasks, projects }
        })
        return removed
      },

      moveTask: (taskId, newProjectId) =>
        set((s) => {
          const task = s.tasks[taskId]
          if (!task) return s
          const oldProject = s.projects[task.projectId]
          const newProject = s.projects[newProjectId]
          const newStatus = newProject?.statuses[0]?.label ?? task.status
          return {
            tasks: { ...s.tasks, [taskId]: { ...task, projectId: newProjectId, status: newStatus } },
            projects: {
              ...s.projects,
              [task.projectId]: {
                ...oldProject,
                taskIds: oldProject?.taskIds.filter((id) => id !== taskId) ?? [],
              },
              [newProjectId]: {
                ...newProject,
                taskIds: [...(newProject?.taskIds ?? []), taskId],
              },
            },
          }
        }),

      convertTaskToSubtask: (sourceTaskId, targetTaskId) =>
        set((s) => {
          if (sourceTaskId === targetTaskId) return s
          const source = s.tasks[sourceTaskId]
          const target = s.tasks[targetTaskId]
          if (!source || !target) return s
          // Archived items can't participate — restore them first if the
          // user wants to merge them somewhere.
          if (source.archivedAt || target.archivedAt) return s

          const newRootId = genId()
          const baseOrder = target.subtasks.length

          // The dragged task BECOMES a new top-level subtask in the target.
          // We copy over the fields that the Subtask type supports; anything
          // Task-specific (energyEstimate, scheduledFor, postponedCount,
          // projectId, etc.) is left behind since it doesn't apply at the
          // subtask level.
          const newRoot: Subtask = {
            id: newRootId,
            title: source.title,
            completed: !!source.completedAt,
            status: source.status,
            order: baseOrder,
            notes: source.notes,
            description: source.description,
            priority: source.priority,
            dueDate: source.dueDate,
            completedAt: source.completedAt,
            // parentId undefined → this is a top-level subtask in target.
          }

          // ALL of the source's non-archived subtasks become FLAT children
          // of newRoot. Originally-nested subtasks lose their parentId
          // chain (we flatten to a single level because the Subtask schema
          // only supports 1 level of nesting). This loses the "subtask of
          // subtask" relationships but preserves all the data — typically
          // the user can rebuild the structure visually after the move.
          const childSubs: Subtask[] = source.subtasks
            .filter((sub) => !sub.archivedAt)
            .map((sub, idx) => ({
              ...sub,
              id: genId(),       // fresh ids so they don't collide with anything
              parentId: newRootId,
              order: baseOrder + 1 + idx,
            }))

          const newTarget: Task = {
            ...target,
            subtasks: [...target.subtasks, newRoot, ...childSubs],
            updatedAt: new Date().toISOString(),
          }

          // Drop the source task entirely + unlink from its project's taskIds.
          const newTasks = { ...s.tasks, [targetTaskId]: newTarget }
          delete newTasks[sourceTaskId]

          const sourceProj = s.projects[source.projectId]
          const newProjects = sourceProj ? {
            ...s.projects,
            [source.projectId]: {
              ...sourceProj,
              taskIds: sourceProj.taskIds.filter((id) => id !== sourceTaskId),
            },
          } : s.projects

          return { tasks: newTasks, projects: newProjects }
        }),

      promoteSubtaskToTask: (taskId, subtaskId) => {
        const source = get().tasks[taskId]
        if (!source) return null
        const sub = source.subtasks.find((st) => st.id === subtaskId)
        if (!sub) return null
        // Solo subtask1 (top-level) puede promoverse. Si es una subtask2
        // (tiene parentId), el user debería primero "desagrupar" (sacarle
        // el parentId) y después promover.
        if (sub.parentId) return null
        if (sub.archivedAt) return null

        const proj = get().projects[source.projectId]
        if (!proj) return null

        const nowIso = new Date().toISOString()
        const newTaskId = genId()

        // Children directos de la subtask que estamos promoviendo
        // (subtask2 con parentId === subtaskId). Estos se vuelven
        // subtask1 top-level de la nueva madre. Archivados se descartan.
        const childSubs = source.subtasks.filter(
          (st) => st.parentId === subtaskId && !st.archivedAt
        )
        // Mapeo old → new id por si en el futuro se permite más
        // anidamiento. Hoy es plano (1 nivel) — solo evita colisiones.
        const childIdMap = new Map<string, string>()
        for (const c of childSubs) childIdMap.set(c.id, genId())

        const newRootSubs: Subtask[] = childSubs.map((c, idx) => ({
          ...c,
          id: childIdMap.get(c.id)!,
          parentId: undefined,  // ahora son top-level de la NUEVA madre
          order: idx,
        }))

        // Inferir importance — Subtask no la tiene, así que defaulteamos
        // a la importance de la task madre original (preserva contexto).
        const newTask: Task = {
          id: newTaskId,
          projectId: source.projectId,
          title: sub.title,
          description: sub.description,
          status: sub.status,
          priority: sub.priority ?? 'medium',
          importance: source.importance,
          dueDate: sub.dueDate,
          dueTime: sub.dueTime,
          durationMinutes: sub.durationMinutes,
          notes: sub.notes,
          subtasks: newRootSubs,
          createdAt: nowIso,
          updatedAt: nowIso,
          // Si la subtask estaba completada, lo respetamos en la task.
          completedAt: sub.completedAt,
        }

        set((s) => {
          // Sacar de la task madre: la propia subtask + todos sus children.
          const sourceTask = s.tasks[taskId]
          if (!sourceTask) return s
          const removeIds = new Set<string>([subtaskId, ...childSubs.map((c) => c.id)])
          const updatedSource: Task = {
            ...sourceTask,
            subtasks: sourceTask.subtasks.filter((st) => !removeIds.has(st.id)),
            updatedAt: nowIso,
          }

          // Insertar la nueva task INMEDIATAMENTE DESPUÉS de la original
          // en project.taskIds — visualmente queda al lado, fácil de
          // encontrar después de promover.
          const projTaskIds = [...(s.projects[source.projectId]?.taskIds ?? [])]
          const idx = projTaskIds.indexOf(taskId)
          if (idx === -1) projTaskIds.push(newTaskId)
          else projTaskIds.splice(idx + 1, 0, newTaskId)

          return {
            tasks: { ...s.tasks, [taskId]: updatedSource, [newTaskId]: newTask },
            projects: {
              ...s.projects,
              [source.projectId]: {
                ...s.projects[source.projectId],
                taskIds: projTaskIds,
              },
            },
          }
        })

        return newTaskId
      },

      postponeTask: (id) =>
        set((s) => ({
          tasks: {
            ...s.tasks,
            [id]: {
              ...s.tasks[id],
              scheduledFor: 'tomorrow',
              postponedCount: (s.tasks[id]?.postponedCount ?? 0) + 1,
              updatedAt: new Date().toISOString(),
            },
          },
        })),

      pushRemainingToTomorrow: () =>
        set((s) => {
          const todayStr = today()
          const updated = { ...s.tasks }
          for (const id in updated) {
            const t = updated[id]
            const proj = s.projects[t.projectId]
            const isDone = proj?.statuses.find((st) => st.label === t.status)?.countsAsDone
            if (!isDone && (t.scheduledFor === 'today' || t.dueDate === todayStr)) {
              updated[id] = {
                ...t,
                scheduledFor: 'tomorrow',
                postponedCount: (t.postponedCount ?? 0) + 1,
                updatedAt: new Date().toISOString(),
              }
            }
          }
          return { tasks: updated }
        }),

      planNext2h: () => {
        const { tasks, projects } = get()
        const todayStr = today()
        const candidates = Object.values(tasks).filter((t) => {
          const proj = projects[t.projectId]
          const isDone = proj?.statuses.find((st) => st.label === t.status)?.countsAsDone
          return !isDone && (t.scheduledFor === 'today' || t.dueDate === todayStr)
        })
        // Sort by priority then importance
        const priorityOrder: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 }
        const impactOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
        candidates.sort((a, b) => {
          const pa = (priorityOrder[a.priority] ?? 0) + (impactOrder[a.importance] ?? 0)
          const pb = (priorityOrder[b.priority] ?? 0) + (impactOrder[b.importance] ?? 0)
          return pb - pa
        })
        return candidates.slice(0, 3)
      },

      addSubtask: (taskId, title, parentId) => {
        const id = genId()
        set((s) => {
          // Inherit the parent project's first status (e.g. "To Do") so the
          // status chip renders correctly. Falls back to "todo" if the
          // project somehow has no statuses configured.
          const task = s.tasks[taskId]
          const proj = s.projects[task?.projectId]
          const defaultStatus = proj?.statuses[0]?.label ?? 'todo'
          return {
            tasks: {
              ...s.tasks,
              [taskId]: {
                ...task,
                subtasks: [
                  ...task.subtasks,
                  {
                    id, title, completed: false, status: defaultStatus,
                    order: task.subtasks.length, notes: '',
                    // Default priority LOW — mirror the parent Task default
                    // so capture stays off the radar until the user bumps it.
                    priority: 'low',
                    ...(parentId ? { parentId } : {}),
                  },
                ],
                updatedAt: new Date().toISOString(),
              },
            },
          }
        })
      },

      updateSubtask: (taskId, subtaskId, patch) =>
        set((s) => {
          const task = s.tasks[taskId]
          const proj = s.projects[task?.projectId]
          return {
          tasks: {
            ...s.tasks,
            [taskId]: {
              ...s.tasks[taskId],
              subtasks: s.tasks[taskId].subtasks.map((st) => {
                if (st.id !== subtaskId) return st
                let completedPatch: Partial<typeof st> = {}
                // If the status changed, mirror Task: stamp/clear completedAt
                // when transitioning across the countsAsDone boundary. El
                // auto-purge usa completedAt para archivar al día siguiente.
                // También: si pasa a Paused/Pausado, bajamos la priority
                // a 'low' (mismo comportamiento que en Task madre).
                const PAUSED_LABELS = new Set(['Paused', 'Pausado'])
                if (typeof patch.status === 'string' && patch.status !== st.status) {
                  const newStatusDef = proj?.statuses.find((sd) => sd.label === patch.status)
                  const oldStatusDef = proj?.statuses.find((sd) => sd.label === st.status)
                  if (newStatusDef?.countsAsDone && !oldStatusDef?.countsAsDone) {
                    completedPatch = { completed: true, completedAt: new Date().toISOString() }
                  } else if (!newStatusDef?.countsAsDone && oldStatusDef?.countsAsDone) {
                    completedPatch = { completed: false, completedAt: undefined }
                  }
                  if (PAUSED_LABELS.has(patch.status) && patch.priority === undefined) {
                    completedPatch = { ...completedPatch, priority: 'low' }
                  }
                }
                return { ...st, ...patch, ...completedPatch }
              }),
              updatedAt: new Date().toISOString(),
            },
          },
          }
        }),

      toggleSubtask: (taskId, subtaskId) =>
        set((s) => {
          // Toggling completed should also flip the status chip between
          // "done-ish" and the first non-done status, so the visual stays
          // consistent. Looks up the parent project's status list to find
          // the matching done/non-done labels.
          //
          // NO hacemos cascade UP a la task madre — la madre se archiva
          // por su propio ciclo (cuando el user la marca como done). Las
          // subtasks se archivan independientemente al día siguiente de
          // su completedAt, igual que las tasks top-level.
          const task = s.tasks[taskId]
          const proj = s.projects[task?.projectId]
          const doneLabel = proj?.statuses.find((st) => st.countsAsDone)?.label
          const firstOpenLabel = proj?.statuses.find((st) => !st.countsAsDone)?.label
            ?? proj?.statuses[0]?.label
          const nowIso = new Date().toISOString()
          // Detectamos si esta subtarea tiene recurrencia + dueDate +
          // está pasando a completed (no si la des-completamos). En ese
          // caso, después del toggle, spawneamos la siguiente instancia
          // como subtarea hermana del mismo task madre. Mismo motor que
          // Task.recurrence.
          const targetSub = task?.subtasks.find((st) => st.id === subtaskId)
          const willComplete = targetSub && !targetSub.completed
          const shouldSpawnNext = !!(willComplete
            && targetSub?.recurrence
            && targetSub?.dueDate
            && !targetSub?.recurrenceSpawnedNext)
          const nextDue = shouldSpawnNext
            ? nextRecurrenceDueDate(targetSub!.dueDate!, targetSub!.recurrence!)
            : null

          return {
            tasks: {
              ...s.tasks,
              [taskId]: {
                ...task,
                subtasks: (() => {
                  const updated = task.subtasks.map((st) => {
                    if (st.id !== subtaskId) return st
                    const nowCompleted = !st.completed
                    const newStatus = nowCompleted
                      ? (doneLabel ?? st.status)
                      : (firstOpenLabel ?? st.status)
                    return {
                      ...st,
                      completed: nowCompleted,
                      status: newStatus,
                      // Mirror the Task contract: stamp completedAt when
                      // checking, clear it when unchecking. El auto-purge
                      // nocturno usa esto para archivar al día siguiente.
                      completedAt: nowCompleted ? nowIso : undefined,
                      // Marcamos como spawneada si efectivamente vamos
                      // a crear la siguiente, así un re-toggle no la
                      // duplica.
                      recurrenceSpawnedNext: shouldSpawnNext && nextDue ? true : st.recurrenceSpawnedNext,
                    }
                  })
                  // Spawn de la siguiente recurrente: copia plantilla
                  // (título/priority/parentId/recurrence/durationMinutes)
                  // pero arranca fresco (completed=false, completedAt
                  // undefined, status=primer open, dueDate=nextDue).
                  if (shouldSpawnNext && nextDue && targetSub) {
                    const newSub: Subtask = {
                      ...targetSub,
                      id: genId(),
                      completed: false,
                      completedAt: undefined,
                      archivedAt: undefined,
                      status: firstOpenLabel ?? targetSub.status,
                      dueDate: nextDue,
                      recurrenceSpawnedNext: false,
                      // Si el padre tiene order, la dejamos al final.
                      order: Math.max(0, ...updated.map((x) => x.order ?? 0)) + 1,
                    }
                    updated.push(newSub)
                  }
                  return updated
                })(),
                updatedAt: nowIso,
              },
            },
          }
        }),

      deleteSubtask: (taskId, subtaskId) =>
        set((s) => ({
          tasks: {
            ...s.tasks,
            [taskId]: {
              ...s.tasks[taskId],
              subtasks: s.tasks[taskId].subtasks.filter((st) => st.id !== subtaskId),
              updatedAt: new Date().toISOString(),
            },
          },
        })),
    }),
    { name: 'overseer-tasks' }
  )
)
