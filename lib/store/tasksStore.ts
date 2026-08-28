'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Task, Project, Subtask, CustomStatus } from '@/types'
import { DEFAULT_STATUSES, PROJECT_COLORS } from '@/lib/utils/constants'
import { dateKeyInTz } from '@/lib/utils/dateInTz'
import { nextRecurrenceDueDate } from '@/lib/utils/taskRecurrence'
import { syncTaskToGcal, unlinkTaskFromGcal } from '@/lib/utils/taskGcalSync'
import { collectDescendantSubtaskIds } from '@/lib/tasks/subtaskTree'

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/** Id DETERMINISTA para una instancia recurrente = madre + fecha. Clave para
 *  el multi-device: si dos dispositivos spawnean la MISMA ocurrencia (mismo
 *  día de la misma serie), generan el MISMO id → el merge del sync las fusiona
 *  en vez de duplicarlas. Antes se usaba `genId()` (random) y cada device creaba
 *  una copia distinta de la misma tarea → "aparecen 2 por día". */
function recurringInstanceId(motherId: string, dueDate: string): string {
  return `rec_${motherId}_${dueDate}`
}

/** Id DETERMINISTA para la copia de una subtarea dentro de una instancia
 *  recurrente. Mismo motivo que `recurringInstanceId`: la instancia ya tenía id
 *  determinista, pero sus SUBTAREAS se creaban con `genId()`, así que dos
 *  dispositivos que spawneaban la misma ocurrencia producían la misma tarea con
 *  subtareas de ids distintos → el merge las sumaba y la instancia terminaba con
 *  la lista de subtareas DUPLICADA. */
function recurringSubtaskId(instanceId: string, sourceSubtaskId: string): string {
  return `${instanceId}__${sourceSubtaskId}`
}

/** Id DETERMINISTA para la siguiente hermana de una SUBTAREA recurrente. */
function recurringSubtaskSiblingId(sourceSubtaskId: string, dueDate: string): string {
  return `recsub_${sourceSubtaskId}_${dueDate}`
}

/** Copia las subtareas de la madre para una instancia recurrente nueva.
 *  - ids deterministas (ver arriba),
 *  - `parentId` REMAPEADO a la copia: antes seguía apuntando a la subtarea de
 *    la MADRE, así que el árbol de la instancia quedaba colgando de otra tarea
 *    (y el push mandaba un `parent_id` cruzado entre tareas distintas),
 *  - no arrastra subtareas archivadas (ni deja hijas colgadas de una madre que
 *    no se copió). */
function spawnSubtasksFor(instanceId: string, source: Subtask[] | undefined, todoStatus: string): Subtask[] {
  const alive = (source ?? []).filter((sub) => !sub.archivedAt)
  const kept = new Set(alive.map((sub) => sub.id))
  return alive.map((sub) => ({
    ...sub,
    id: recurringSubtaskId(instanceId, sub.id),
    parentId: sub.parentId && kept.has(sub.parentId)
      ? recurringSubtaskId(instanceId, sub.parentId)
      : undefined,
    completed: false,
    completedAt: undefined,
    archivedAt: undefined,
    status: todoStatus,
  }))
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
  ensureSystemProject: (args: { systemProjectKey: 'spi' | 'content-root'; name: string; color: string; icon?: string }) => string
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
  /** Marca/desmarca una tarea como favorita (⭐). Bumpea `updatedAt` para
   *  que el merge LWW del sync propague el cambio entre dispositivos. */
  toggleFavorite: (id: string) => void
  /** Mueve una tarea al INICIO del orden manual de su proyecto (`taskIds`).
   *  Solo tiene efecto visible en el modo de orden "manual"; en los demás
   *  modos el orden lo decide el comparator. Bumpea `updatedAt`. */
  sendTaskToTop: (id: string) => void
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
  /** Limpia duplicados de instancias recurrentes: si hay 2+ tareas de la MISMA
   *  serie (recurringHeadId, o projectId+título legacy) con la MISMA dueDate,
   *  conserva una (prioriza la completada; a igualdad, el id más chico) y borra
   *  el resto. Determinista → converge entre dispositivos. Idempotente. Devuelve
   *  cuántas borró. Arregla el "aparecen 2 por día" de spawns multi-device. */
  dedupeRecurringInstances: () => number
  /** Llena el buffer de instancias recurrentes para la TASK ID dada
   *  hasta tener `lookaheadCount` instancias chained. Idempotente —
   *  si la cadena ya está completa, no hace nada. Se llama al crear
   *  una recurrente Y al agregar recurrence a una tarea existente.
   *  `weeksAhead` controla hasta dónde se llena: 1 = semana del ancla
   *  (default); 2 = semana del ancla + la siguiente. addTask usa 2 para
   *  que el user vea las dos semanas de una sin esperar al trigger
   *  nocturno.
   *
   *  `anchorKey` (YYYY-MM-DD) fija la semana-ANCLA de la ventana. Si se
   *  omite, el ancla es la `dueDate` del head (caso CREACIÓN: el user
   *  eligió una fecha de inicio futura y queremos llenar desde ahí). El
   *  MANTENIMIENTO (backfill al abrir, rollover) debe pasar SIEMPRE el
   *  día de hoy como ancla — si no, cada instancia futura ancla su propia
   *  ventana y el horizonte "se persigue a sí mismo", generando semanas
   *  de más sin tope (el bug de las 4 semanas). */
  ensureRecurringBuffer: (taskId: string, lookaheadCount?: number, weeksAhead?: number, anchorKey?: string) => void
  /** Migración one-shot: backfill el campo `recurringHeadId` para datos
   *  pre-existentes (cuando el modelo de "madre persistente" no existía).
   *  Para cada serie matched por projectId + título normalizado,
   *  identifica la madre (instancia con dueDate más vieja no archivada)
   *  y le pone `recurringHeadId === id` (auto-referencia). Las demás
   *  hijas (con o sin dueDate posterior) reciben `recurringHeadId =
   *  motherId`. Idempotente: si todas las tasks ya tienen el field,
   *  no toca nada. */
  migrateRecurringHeads: () => void
  /** Une dos series recurrentes en una sola. Reasigna todas las tasks
   *  cuyo `recurringHeadId === sourceHeadId` (incluyendo la madre source)
   *  para que apunten a `targetHeadId`. La source mother queda como una
   *  hija más de la target — pierde su rol de cabeza.
   *
   *  Útil para arreglar series partidas por renames legacy (antes de que
   *  existiera el modelo de madre persistente) o por bugs históricos.
   *  No toca títulos/dueTime de ninguna instancia — solo reasigna el
   *  parentesco. Si después el user quiere unificar también el título,
   *  edita la madre target y la propagación se ocupa. */
  mergeRecurringSeries: (sourceHeadId: string, targetHeadId: string) => number
  /** Borra todas las instancias futuras NO completadas de la cadena
   *  recurrente del head dado y re-arma con `ensureRecurringBuffer`.
   *  Lo usamos al CAMBIAR la regla de recurrencia para evitar tasks
   *  huérfanas con fechas viejas que no encajan con la nueva regla. */
  rebuildRecurringChain: (taskId: string) => void
  /** Corta una serie recurrente entera de forma definitiva, de modo que
   *  NINGUNA instancia pueda re-spawnearse después.
   *
   *  A diferencia de `rebuildRecurringChain` (que solo borra `dueDate >
   *  head` y deja la recurrence puesta en las demás → re-spawn), esta
   *  opera sobre TODA la serie (match por recurringHeadId, con fallback a
   *  projectId+título) y:
   *    - Saca `recurrence` de CADA instancia (incluidas las completadas y
   *      las archivadas) — así ni el rollover ni el buffer la regeneran.
   *    - Borra (hard) todas las instancias NO completadas, salvo el head
   *      si `keepHead` (queda como tarea suelta, sin recurrencia).
   *    - Conserva las completadas como histórico (sin recurrence).
   *
   *  `keepHead=true`  → "Detener recurrencia" (mantené el head suelto).
   *  `keepHead=false` → "Borrar todo" (se va también el head). */
  removeRecurringSeries: (headId: string, keepHead: boolean) => void
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
  /** Marca/desmarca una subtarea como favorita (⭐). Bumpea el `updatedAt`
   *  de la tarea madre para que el merge LWW del sync propague el cambio
   *  (las subtareas se mergean bajo su tarea). */
  toggleSubtaskFavorite: (taskId: string, subtaskId: string) => void
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
          const rest = { ...s.projects }
          delete rest[id]
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
        // Si la task viene con recurrencia Y SIN un recurringHeadId
        // explícito (caso típico: el user creó una nueva recurrente
        // desde TaskDetail), esta task ES la madre. La auto-asignamos
        // para que el spawn use sus campos como template. Si vino con
        // un recurringHeadId ya seteado (caso de spawn interno desde
        // ensureRecurringBuffer), respetamos ese valor.
        if (task.recurrence && !task.recurringHeadId) {
          task.recurringHeadId = id
        }
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
        // disparamos el helper que spawnea las instancias.
        // `weeksAhead = 2` → llena la semana del head + la siguiente,
        // alineado con la expectativa "ver dos semanas al toque" sin
        // esperar al trigger del viernes-noche. Sin esto, crear una
        // recurrente un martes generaba solo esta semana y la próxima
        // recién aparecía cuando AppShell corría su efecto.
        if (task.recurrence && task.dueDate) {
          get().ensureRecurringBuffer(id, 14, 2)
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
      ensureRecurringBuffer: (taskId, lookaheadCount = 14, weeksAhead = 1, anchorKey) => {
        const nowIso = new Date().toISOString()
        set((s) => {
          const head = s.tasks[taskId]
          if (!head?.recurrence || !head.dueDate) return s
          const tasks = { ...s.tasks }
          let projects = s.projects
          // ─── IDENTIDAD DE LA SERIE (no confundir con el template) ───
          // `motherId` es la ETIQUETA de la serie: el id de la madre. Se
          // mantiene AUNQUE la fila de la madre ya no exista (borrada por el
          // user, o todavía no llegó a este device por sync). Es CRÍTICO:
          // antes, sin madre, cada instancia se tomaba a sí misma como madre
          // → su `dupeExists` no reconocía a las hermanas, spawneaba copias
          // de fechas que ya existían y cada copia nacía en una serie propia.
          // Medido: 6 instancias huérfanas → 39 tareas y 7 series en UNA sola
          // apertura de /tasks, sin forma de volver a unirlas.
          const motherId = head.recurringHeadId ?? head.id
          const motherRow = s.tasks[motherId]
          // La madre en la papelera DETIENE la cadena. El auto-purge nunca
          // archiva una madre bien anclada (excepción explícita en
          // archiveCompletedBefore), así que si está archivada es porque el
          // user la borró — y esperar que igual siga generando instancias es
          // exactamente el bug de "no hay forma de detenerla".
          // Exigimos la auto-referencia: una fila archivada que perdió su
          // `recurringHeadId` (clobber de sync) NO es una orden de frenar, y
          // frenar ahí le mataría al user una serie que quiere viva.
          if (motherRow?.archivedAt && motherRow.recurringHeadId === motherRow.id) return s
          // TEMPLATE de los spawns (título, dueTime, duración, subtasks…):
          // la madre si existe; si no, el head, que es una instancia de la
          // misma serie y por lo tanto una copia fiel del template.
          const mother = motherRow ?? head

          // ─── Ventana semanal Lun→Dom anclada ───
          // El ANCLA define qué semana arranca la ventana:
          //   - CREACIÓN (sin anchorKey): la dueDate del head. El user
          //     creó la recurrente para una semana puntual (ej. el Lunes
          //     que viene); la ventana es la de ESA fecha.
          //   - MANTENIMIENTO (anchorKey = hoy): la semana actual. Esto es
          //     CLAVE: si ancláramos en la dueDate de cada instancia, la
          //     instancia más futura extendería su propia ventana +N
          //     semanas y el horizonte crecería sin tope en cada apertura
          //     (bug de las 4 semanas). Anclando en hoy, todas las llamadas
          //     producen la MISMA ventana acotada e idempotente.
          const anchorDateStr = anchorKey || head.dueDate
          const [hy, hm, hd] = anchorDateStr.split('-').map(Number)
          const headDate = new Date(hy, hm - 1, hd); headDate.setHours(0, 0, 0, 0)
          // Lun=1 … Dom=0. Queremos arrancar la semana en Lun.
          const dayOfWeek = headDate.getDay()                  // 0..6 (Dom=0)
          const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
          const weekStart = new Date(headDate); weekStart.setDate(headDate.getDate() - daysToMonday)
          // weekEnd cubre `weeksAhead` semanas — 1 = solo la semana del
          // head (default), 2 = head + siguiente. Llamamos con 2 desde
          // addTask para que el user vea ambas semanas al crear.
          const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + (7 * Math.max(1, weeksAhead)) - 1)
          const fmtYmd = (d: Date) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          const weekStartYmd = fmtYmd(weekStart)
          const weekEndYmd = fmtYmd(weekEnd)

          // GUARD anti-duplicados: dado un dueDate target, devuelve true
          // si ya existe una task de la "misma serie" (matched por
          // recurringHeadId == motherId) con ese dueDate. Esto evita que
          // múltiples llamadas a ensureRecurringBuffer (por re-render,
          // por toggle de chip de día, etc.) generen tasks con fechas
          // repetidas. Fallback para data pre-migración: match por
          // projectId + título de la madre.
          const dupeExists = (targetDue: string) =>
            Object.values(tasks).some((t) =>
              t.id !== taskId
              && t.dueDate === targetDue
              && !t.archivedAt
              && !!t.recurrence
              && (
                t.recurringHeadId === motherId
                || (!t.recurringHeadId && t.projectId === mother.projectId && t.title === mother.title)
              ),
            )

          // Avanzar al final de la cadena ya existente — desde acá vamos
          // a spawnear hacia adelante hasta el corte semanal. Walk by
          // dueDate: buscamos el sucesor con dueDate más cercano > prev,
          // dentro de la ventana semanal. Match por recurringHeadId
          // (fallback título legacy).
          let prevDue = head.dueDate
          for (let safety = 0; safety < lookaheadCount; safety++) {
            const candidates = Object.values(tasks).filter((t) =>
              t.id !== taskId
              && !t.archivedAt
              && !!t.recurrence
              && !!t.dueDate
              && t.dueDate > prevDue
              && t.dueDate <= weekEndYmd
              && (
                t.recurringHeadId === motherId
                || (!t.recurringHeadId && t.projectId === mother.projectId && t.title === mother.title)
              ),
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
            if (next > weekEndYmd) break             // ya nos pasamos del Domingo del fin de ventana
            if (next < weekStartYmd) {               // antes de la ventana (ancla) — no spawnear pasado
              prevDue = next
              continue
            }
            if (next <= head.dueDate) {              // safety: jamás retroceder respecto del head
              prevDue = next
              continue
            }
            if (dupeExists(next)) {                  // anti-duplicado idempotente
              prevDue = next
              continue
            }
            const newId = recurringInstanceId(motherId, next)
            if (tasks[newId]) { prevDue = next; continue }   // id determinista ya presente
            const proj = projects[mother.projectId]
            const todoStatus = proj?.statuses[0]?.label ?? 'To Do'
            // SPAWN desde la MADRE — su título, dueTime, durationMinutes,
            // priority, importance, description, recurrence son la
            // fuente de verdad. Si una hija fue renombrada localmente, no
            // contamina los próximos spawns.
            tasks[newId] = {
              ...mother,
              id: newId,
              dueDate: next,
              status: todoStatus,
              completedAt: undefined,
              archivedAt: undefined,
              createdAt: nowIso,
              updatedAt: nowIso,
              postponedCount: 0,
              subtasks: spawnSubtasksFor(newId, mother.subtasks, todoStatus),
              recurrenceSpawnedNext: false,
              gcalEventId: undefined,
              gcalCalendarId: undefined,
              recurringHeadId: motherId,
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
          // Identificamos "futuras de la cadena": preferimos match por
          // recurringHeadId (modelo nuevo); fallback a projectId + título
          // para datos pre-migración.
          const motherId = head.recurringHeadId ?? head.id
          const toDelete = Object.values(s.tasks).filter((t) => {
            if (t.id === taskId) return false
            if (!t.recurrence) return false
            if (!t.dueDate || !head.dueDate) return false
            if (t.dueDate <= head.dueDate) return false
            if (t.completedAt || t.archivedAt) return false
            // Match preferente por recurringHeadId.
            if (t.recurringHeadId && t.recurringHeadId === motherId) return true
            // Fallback legacy.
            if (!t.recurringHeadId && t.projectId === head.projectId && t.title === head.title) return true
            return false
          }).map((t) => t.id)
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
        get().ensureRecurringBuffer(taskId, 14, 2)
      },

      removeRecurringSeries: (headId, keepHead) => {
        set((s) => {
          const head = s.tasks[headId]
          if (!head) return s
          const motherId = head.recurringHeadId ?? head.id
          // Normalización de título igual que la vista de recurrentes, para
          // poder cazar instancias aunque el `recurringHeadId` se haya
          // fragmentado (madre borrada → spawns re-anclados a otro head).
          const normTitle = (str: string) =>
            str.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
          const headTitleN = normTitle(head.title)
          // Pertenece a la serie LÓGICA. Incluye 3 caminos:
          //   1. el head mismo,
          //   2. match exacto por recurringHeadId (modelo nuevo intacto),
          //   3. CUALQUIER recurrente con mismo proyecto + título normalizado
          //      (sin importar recurringHeadId) — esto caza los fragmentos
          //      cuya madre se borró y quedaron re-anclados a otro head. Sin
          //      esto, "borrar todo" mataba un fragmento y los demás
          //      sobrevivían con recurrence y re-spawneaban (bug "queda de a 1").
          const inSeries = (t: Task) =>
            t.id === headId
            || (t.recurringHeadId != null && t.recurringHeadId === motherId)
            || (!!t.recurrence && t.projectId === head.projectId && normTitle(t.title) === headTitleN)

          const nowIso = new Date().toISOString()
          const tasks = { ...s.tasks }
          let projects = s.projects
          const removeFromProject = (t: Task) => {
            const proj = projects[t.projectId]
            if (proj) {
              projects = {
                ...projects,
                [t.projectId]: { ...proj, taskIds: proj.taskIds.filter((x) => x !== t.id) },
              }
            }
          }

          for (const t of Object.values(s.tasks)) {
            if (!inSeries(t)) continue
            const isHead = t.id === headId
            const isHistory = !!t.completedAt || !!t.archivedAt

            if (isHead && keepHead) {
              // Head queda como tarea suelta: sin recurrencia, sin rol de madre.
              tasks[t.id] = { ...t, recurrence: undefined, recurringHeadId: undefined, updatedAt: nowIso }
              continue
            }
            if (isHistory) {
              // Completadas/archivadas → se conservan como histórico, pero
              // SIN recurrence para que no re-siembren la serie.
              tasks[t.id] = { ...t, recurrence: undefined, updatedAt: nowIso }
              continue
            }
            // No completada (y no es el head que mantenemos) → fuera de verdad.
            delete tasks[t.id]
            removeFromProject(t)
          }

          return { tasks, projects }
        })
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

          // NOTA: la auto-detección de "reprogramada" se quitó porque
          // molestaba al CREAR una tarea — el user ajusta el horario
          // varias veces mientras configura y la marca falsamente como
          // tardía. Ahora la marca solo se setea via el botón explícito
          // "Marcar como TARDÍA" / "Traer a HOY" en TaskDetail. Editar
          // dueDate o dueTime es siempre un reagendamiento limpio.

          const merged = { ...prev, ...patch, ...completedAtPatch, ...priorityPatch, ...durationPatch, updatedAt: new Date().toISOString() }
          nextTask = merged
          // Si el user agregó recurrence a una tarea existente sin
          // recurringHeadId previo, esta task se vuelve LA MADRE de su
          // propia serie (auto-referencia).
          if (merged.recurrence && !merged.recurringHeadId) {
            merged.recurringHeadId = id
          }
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

          // ── Propagación MADRE → HIJAS FUTURAS ────────────────────────
          // Si la task editada es la madre de una cadena recurrente
          // (recurringHeadId === id) y la patch toca campos "de template"
          // — título, dueTime, durationMinutes, description — aplicamos
          // los mismos cambios a las hijas con `dueDate >= today` (las
          // futuras o de hoy). Las pasadas mantienen su estado histórico
          // y las que el user customizó individualmente se sobreescriben
          // — tradeoff aceptado a cambio de simplicidad. */
          let tasksMap = { ...s.tasks, [id]: merged }
          const isMother = merged.recurringHeadId === id
          const propagatableKeys = ['title', 'dueTime', 'durationMinutes', 'description'] as const
          const propagatable: Partial<Task> = {}
          for (const k of propagatableKeys) {
            if (k in patch) (propagatable as Record<string, unknown>)[k] = patch[k]
          }
          if (isMother && Object.keys(propagatable).length > 0) {
            const todayKey = new Date().toISOString().slice(0, 10)
            for (const t of Object.values(tasksMap)) {
              if (t.id === id) continue
              if (t.recurringHeadId !== id) continue
              if (t.archivedAt) continue
              if (!t.dueDate || t.dueDate < todayKey) continue
              tasksMap = {
                ...tasksMap,
                [t.id]: { ...t, ...propagatable, updatedAt: new Date().toISOString() },
              }
            }
          }
          return {
            tasks: tasksMap,
          }
        })
        // Si la patch acaba de agregar/cambiar recurrence, NUKEAMOS las
        // instancias futuras de la cadena vieja y re-armamos con la nueva
        // regla. Esto previene "fechas repetidas o raras" que aparecían
        // antes cuando solo agregábamos al buffer sobre una cadena que
        // ya tenía instancias con la regla anterior.
        if (nextTask && (nextTask as Task & { __triggerBuffer?: boolean }).__triggerBuffer) {
          delete (nextTask as Task & { __triggerBuffer?: boolean }).__triggerBuffer
          // rebuildRecurringChain nukea futuras y re-buffera. Lo hace
          // con weeksAhead=1 internamente; para que el user vea 2
          // semanas al agregar recurrencia desde TaskDetail, hacemos un
          // segundo pass con weeksAhead=2 después. Idempotente.
          get().rebuildRecurringChain(id)
          get().ensureRecurringBuffer(id, 14, 2)
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
          const updatedProjects = s.projects

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

      },

      toggleFavorite: (id) =>
        set((s) => {
          const task = s.tasks[id]
          if (!task) return s
          return {
            tasks: {
              ...s.tasks,
              [id]: { ...task, favorite: !task.favorite, updatedAt: new Date().toISOString() },
            },
          }
        }),

      sendTaskToTop: (id) =>
        set((s) => {
          const task = s.tasks[id]
          if (!task) return s
          const proj = s.projects[task.projectId]
          if (!proj) return s
          const rest = (proj.taskIds ?? []).filter((tid) => tid !== id)
          const now = new Date().toISOString()
          return {
            projects: {
              ...s.projects,
              [proj.id]: { ...proj, taskIds: [id, ...rest] },
            },
            // Bump updatedAt para que el merge LWW no pise el reorder con
            // una copia remota más vieja en el próximo pull.
            tasks: {
              ...s.tasks,
              [id]: { ...task, updatedAt: now },
            },
          }
        }),

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
            const tasks = { ...s.tasks }
            delete tasks[id]
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
          const tasks = {
            ...s.tasks,
            [id]: {
              ...task,
              archivedAt: nowIso,
              // If the task wasn't already completed, stamp completedAt now
              // so the archive UI has a sensible "completada" date to show.
              completedAt: task.completedAt ?? nowIso,
              updatedAt: nowIso,
            },
          }
          // Borrar la MADRE de una serie = detener la serie. Las instancias
          // futuras todavía no hechas se van con ella a la papelera (de donde
          // se pueden recuperar). Antes quedaban vivas y, encima, seguían
          // spawneando: el user borraba la tarea y la serie no se detenía.
          // Las completadas/pasadas se conservan como historial.
          if (task.recurringHeadId === id) {
            // Fecha LOCAL (las dueDate son YYYY-MM-DD locales). Con la de
            // `toISOString()` a la noche ya estaríamos en el día siguiente en
            // UTC y las instancias de hoy contarían como pasadas.
            const d = new Date()
            const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            for (const t of Object.values(s.tasks)) {
              if (t.id === id) continue
              if (t.recurringHeadId !== id) continue
              if (t.archivedAt || t.completedAt) continue
              if (t.dueDate && t.dueDate < todayKey) continue
              // Archivadas SIN `completedAt`: no las hiciste, las borraste. Si
              // les estampáramos completedAt ensuciarían el historial y las
              // estadísticas de "hechas" — y `restoreFromArchive` usa
              // justamente esa ausencia para saber cuáles devolver.
              tasks[t.id] = { ...t, archivedAt: nowIso, updatedAt: nowIso }
            }
          }
          return { tasks }
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
              // Subtask con dueDate + dueTime → aparece en el calendario.
              // Deadline = domingo de la semana de su dueDate (la semana en que
              // fue bloque y en la que el snapshot la necesita), NO la semana en
              // que se completó. Así un bloque viejo que marcás hecho hoy se
              // archiva en la próxima pasada, no una semana después.
              const subIsTimed = !!st.dueDate && !!st.dueTime
              const ready = subIsTimed
                ? endOfWeekKey(st.dueDate!) < todayKey
                : stKey < todayKey
              if (!ready) return st
              archived++
              return { ...st, archivedAt: nowIso }
            })
            const subsChanged = updatedSubs.some((st, i) => st !== t.subtasks?.[i])

            // ── Parent task: misma regla híbrida.
            // EXCEPCIÓN: las MADRES recurrentes (t.recurringHeadId === t.id)
            // no se archivan nunca por auto-purge — son el ancla persistente
            // de la cadena. Aunque el user las complete, quedan visibles en
            // la vista "Recurrentes" para poder editarlas o detener la
            // cadena. Solo se eliminan vía "Borrar todo" desde esa vista.
            const isRecurringMother = t.recurringHeadId === t.id
            if (!t.archivedAt && !isRecurringMother) {
              const statusDef = proj.statuses.find((st) => st.label === t.status)
              if (statusDef?.countsAsDone && t.completedAt) {
                const completedKey = dateKeyInTz(new Date(t.completedAt), timezone)
                const taskIsTimed = !!t.dueDate && !!t.dueTime
                // Bloque calendarizado → deadline = domingo de la semana de su
                // dueDate (no la de completado). Un bloque de una semana pasada
                // que completás hoy (p.ej. para limpiarlo) se archiva en la
                // próxima pasada, en vez de quedarse otra semana entera.
                const ready = taskIsTimed
                  ? endOfWeekKey(t.dueDate!) < todayKey
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
          // 1) Agrupar tasks recurrentes por serie — preferimos
          //    recurringHeadId; fallback a projectId+título para datos
          //    pre-migración.
          const byKey = new Map<string, Task[]>()
          for (const t of Object.values(s.tasks)) {
            if (!t.recurrence) continue
            if (!t.dueDate) continue
            if (t.archivedAt) continue
            const key = t.recurringHeadId
              ? `head:${t.recurringHeadId}`
              : `legacy:${t.projectId}::${t.title}`
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
            // MADRE de la serie — fuente de template. Si tail tiene
            // recurringHeadId, lookup directo; sino la madre es el item
            // con dueDate más vieja del grupo (sorted ascendente: el último).
            const motherFromId = tail.recurringHeadId ? s.tasks[tail.recurringHeadId] : undefined
            // Madre en la papelera → serie detenida (mismo criterio que
            // ensureRecurringBuffer: exige la auto-referencia para no frenar
            // una serie por una fila corrupta). Sin esto, borrar la madre no
            // paraba nada.
            if (motherFromId?.archivedAt && motherFromId.recurringHeadId === motherFromId.id) continue
            const mother = motherFromId
              ?? [...arr].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))[0]
            // La ETIQUETA de la serie es el `recurringHeadId` original, exista
            // o no la fila de la madre. Si cayéramos en `mother.id` cuando la
            // madre falta, el rollover abriría una serie NUEVA por cada
            // instancia huérfana (fragmentación + duplicados por fecha).
            const motherId = tail.recurringHeadId ?? mother.id
            // Recurrence rule del SPAWN viene de la madre (no del tail) —
            // si la madre cambió el kind, los próximos spawns lo respetan.
            const nextDueDate = nextRecurrenceDueDate(tail.dueDate, (mother.recurrence ?? tail.recurrence)!)
            if (!nextDueDate) continue            // serie terminó (until)
            // Si ya existe una task con esa fecha en la serie, skip
            // (idempotente — múltiples llamadas no duplican).
            const dupe = arr.some((t) => t.dueDate === nextDueDate)
            if (dupe) continue

            const newId = recurringInstanceId(motherId, nextDueDate)
            if (tasks[newId]) continue   // ya existe (id determinista) → no duplicar
            const proj = s.projects[mother.projectId]
            const todoStatus = proj?.statuses[0]?.label ?? 'To Do'
            const freshSubs: Subtask[] = spawnSubtasksFor(newId, mother.subtasks, todoStatus)
            tasks[newId] = {
              ...mother,
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
              recurringHeadId: motherId,
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
            spawned++
            spawnedIds.push(newId)
          }
          return { tasks, projects }
        })
        // Post-set: el buffer arma el resto de la semana + la siguiente,
        // anclado en el HOY REAL (no en `todayKey`, que puede ser el lunes
        // que viene por el spawn anticipado del SPI). Así:
        //   - la DECISIÓN de spawnear la semana próxima usa `todayKey`
        //     efectivo (adelanta el sábado para el SPI), PERO
        //   - el HORIZONTE del buffer queda fijo en [semana actual, +1] = 2
        //     semanas desde hoy real, sin importar el adelanto.
        // Esto evita tanto el crecimiento sin tope (bug 4 semanas) como una
        // 3ra semana transitoria los fines de semana.
        const now = new Date()
        const realTodayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        for (const newId of spawnedIds) {
          get().ensureRecurringBuffer(newId, 14, 2, realTodayKey)
        }
        return spawned
      },

      dedupeRecurringInstances: () => {
        let removed = 0
        set((s) => {
          const norm = (str: string) =>
            str.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
          const live = Object.values(s.tasks).filter((t) => t.recurrence && t.dueDate && !t.archivedAt)
          const toRemove = new Set<string>()

          // Keep determinista: completada primero (preserva historial), luego
          // id más chico. Tiene que dar lo mismo en todos los dispositivos.
          const pickKeeper = (arr: Task[]) => [...arr].sort((a, b) => {
            const ca = a.completedAt ? 0 : 1
            const cb = b.completedAt ? 0 : 1
            if (ca !== cb) return ca - cb
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
          })[0]

          const sweep = (keyOf: (t: Task) => string) => {
            const groups = new Map<string, Task[]>()
            for (const t of live) {
              if (toRemove.has(t.id)) continue
              const key = keyOf(t)
              if (!groups.has(key)) groups.set(key, [])
              groups.get(key)!.push(t)
            }
            for (const arr of groups.values()) {
              if (arr.length < 2) continue
              const keeper = pickKeeper(arr)
              for (const t of arr) if (t.id !== keeper.id) toRemove.add(t.id)
            }
          }

          // 1) Por (serie, dueDate) — el duplicado clásico: dos devices
          //    spawnearon la misma ocurrencia.
          sweep((t) => `${t.recurringHeadId ? `head:${t.recurringHeadId}` : `legacy:${t.projectId}::${norm(t.title)}`}@@${t.dueDate}`)
          // 2) Por (proyecto, título, dueDate) IGNORANDO la serie. Caza las
          //    copias que quedaron de una serie fragmentada: misma tarea, mismo
          //    día, pero cada copia con su propio `recurringHeadId` — la pasada
          //    1 no las ve como duplicados justamente porque agrupa por serie.
          sweep((t) => `title:${t.projectId}::${norm(t.title)}@@${t.dueDate}`)
          if (toRemove.size === 0) return s
          const tasks = { ...s.tasks }
          const projects = { ...s.projects }
          for (const id of toRemove) {
            const t = tasks[id]
            delete tasks[id]
            if (t && projects[t.projectId]) {
              projects[t.projectId] = {
                ...projects[t.projectId],
                taskIds: (projects[t.projectId].taskIds ?? []).filter((tid) => tid !== id),
              }
            }
          }
          removed = toRemove.size
          return { tasks, projects }
        })
        return removed
      },

      restoreFromArchive: (id) =>
        set((s) => {
          const t = s.tasks[id]
          if (!t) return s
          const proj = s.projects[t.projectId]
          // Find a sensible non-done status to restore to. Prefer "In Progress"
          // style (first non-done), fall back to current status if nothing fits.
          const reopenStatus = proj?.statuses.find((st) => !st.countsAsDone)?.label ?? t.status
          const nowIso = new Date().toISOString()
          const tasks = {
            ...s.tasks,
            [id]: {
              ...t,
              archivedAt: undefined,
              completedAt: undefined,
              status: reopenStatus,
              updatedAt: nowIso,
            },
          }
          // Simétrico a `deleteTask`: borrar la madre se lleva sus instancias
          // futuras, así que restaurarla las trae de vuelta. Solo las que
          // fueron BORRADAS (archivadas sin `completedAt`) — las completadas
          // son historial y se quedan donde están. Sin esto, sacar una serie de
          // la papelera la dejaba sin sus instancias hasta la semana siguiente.
          if (t.recurringHeadId === id) {
            for (const other of Object.values(s.tasks)) {
              if (other.id === id) continue
              if (other.recurringHeadId !== id) continue
              if (!other.archivedAt || other.completedAt) continue
              const otherProj = s.projects[other.projectId]
              const otherStatus = otherProj?.statuses.find((st) => !st.countsAsDone)?.label ?? other.status
              tasks[other.id] = { ...other, archivedAt: undefined, status: otherStatus, updatedAt: nowIso }
            }
          }
          return { tasks }
        }),

      deletePermanently: (id) =>
        set((s) => {
          const task = s.tasks[id]
          if (!task) return s
          const tasks = { ...s.tasks }
          delete tasks[id]
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
          const newProject = s.projects[newProjectId]
          if (!newProject) return s

          const now = new Date().toISOString()

          // Normalización de título idéntica a `removeRecurringSeries` — caza
          // instancias legacy (pre-`recurringHeadId`) por proyecto + título.
          const normTitle = (str: string) =>
            str.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

          // Una serie recurrente pertenece a UN proyecto. Si la task movida
          // participa de una serie, movemos TODA la serie junta; si moviéramos
          // solo un miembro, la serie queda partida entre proyectos y pierde el
          // ícono 🔁 (los grupos de 1 miembro se dibujan como TaskCard suelta,
          // sin indicador de recurrencia) y "aparece duplicada".
          const isRecurring = !!task.recurrence || !!task.recurringHeadId
          let memberIds: string[]
          if (isRecurring) {
            const motherId = task.recurringHeadId ?? task.id
            const mother = s.tasks[motherId] ?? task
            const motherTitleN = normTitle(mother.title)
            memberIds = Object.values(s.tasks)
              .filter((t) =>
                t.id === motherId
                || (t.recurringHeadId != null && t.recurringHeadId === motherId)
                || (!t.recurringHeadId && !!t.recurrence
                    && t.projectId === mother.projectId
                    && normTitle(t.title) === motherTitleN),
              )
              .map((t) => t.id)
            // La task disparadora entra siempre (defensivo).
            if (!memberIds.includes(taskId)) memberIds.push(taskId)
          } else {
            memberIds = [taskId]
          }
          const moving = new Set(memberIds)

          // Status del proyecto destino (preservamos done-ness de cada miembro
          // para no re-abrir instancias completadas/archivadas del historial).
          const destFirst = newProject.statuses[0]?.label
          const destDone = newProject.statuses.find((st) => st.countsAsDone)?.label

          // Reasignar cada miembro al proyecto destino. `updatedAt` bumpeado en
          // TODOS (CRÍTICO multi-device: el merge LWW pisaría el cambio de
          // `projectId` con una copia remota más vieja; en el pull, `taskIds`
          // se recomputa desde `projectId`, así que la verdad es projectId+updatedAt).
          const tasks = { ...s.tasks }
          for (const id of moving) {
            const t = tasks[id]
            if (!t) continue
            const oldProj = s.projects[t.projectId]
            const wasDone = !!oldProj?.statuses.find((st) => st.label === t.status)?.countsAsDone
            const nextStatus = wasDone ? (destDone ?? t.status) : (destFirst ?? t.status)
            tasks[id] = { ...t, projectId: newProjectId, status: nextStatus, updatedAt: now }
          }

          // `taskIds`: sacar los miembros de CUALQUIER proyecto (por si la serie
          // ya venía splinterada por este mismo bug) y agregarlos al destino.
          const projects: typeof s.projects = {}
          for (const [pid, proj] of Object.entries(s.projects)) {
            projects[pid] = {
              ...proj,
              taskIds: (proj.taskIds ?? []).filter((tid) => !moving.has(tid)),
            }
          }
          const destExisting = projects[newProjectId].taskIds
          projects[newProjectId] = {
            ...projects[newProjectId],
            taskIds: [...destExisting, ...memberIds.filter((id) => !destExisting.includes(id))],
          }

          return { tasks, projects }
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
          const liveSubs = source.subtasks.filter((sub) => !sub.archivedAt)
          const subIdMap = new Map<string, string>()
          for (const sub of liveSubs) subIdMap.set(sub.id, genId())

          const childSubs: Subtask[] = liveSubs.map((sub, idx) => {
            const mappedParentId = sub.parentId ? subIdMap.get(sub.parentId) : undefined
            return {
              ...sub,
              id: subIdMap.get(sub.id)!,
              parentId: mappedParentId ?? newRootId,
              order: sub.order ?? (baseOrder + 1 + idx),
            }
          })

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
        if (sub.archivedAt) return null

        const proj = get().projects[source.projectId]
        if (!proj) return null

        const nowIso = new Date().toISOString()
        const newTaskId = genId()
        const descendantIds = collectDescendantSubtaskIds(source.subtasks, subtaskId)
        const liveDescendants = source.subtasks.filter((st) => descendantIds.has(st.id) && !st.archivedAt)
        const childIdMap = new Map<string, string>()
        for (const child of liveDescendants) childIdMap.set(child.id, genId())

        const newRootSubs: Subtask[] = liveDescendants.map((child) => ({
          ...child,
          id: childIdMap.get(child.id)!,
          parentId: child.parentId === subtaskId
            ? undefined
            : child.parentId
              ? childIdMap.get(child.parentId)
              : undefined,
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
          const sourceTask = s.tasks[taskId]
          if (!sourceTask) return s
          const removeIds = new Set<string>([subtaskId, ...descendantIds])
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
          // Orden = 1 + el máximo existente, NO `subtasks.length`. Con length,
          // si antes borraste una subtarea, la nueva reusaba un `order` que ya
          // tenía otra (0,1,2 → borro la 1 → largo 2 → nueva order=2 =
          // colisión), y el desempate la mandaba a una posición arbitraria.
          // Con max+1 siempre queda estrictamente al final.
          const nextOrder = task.subtasks.reduce((m, st) => Math.max(m, st.order ?? 0), -1) + 1
          return {
            tasks: {
              ...s.tasks,
              [taskId]: {
                ...task,
                subtasks: [
                  ...task.subtasks,
                  {
                    id, title, completed: false, status: defaultStatus,
                    order: nextOrder, notes: '',
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

      updateSubtask: (taskId, subtaskId, patch) => {
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
        })
        // Content Strategy: reflejar el completado de una subtarea de
        // contenido en la etapa de la pieza (cubre el cambio de estado desde
        // el detalle, que puede flipear `completed`).
        if (subtaskId.startsWith('cs_')) {
          const sub = get().tasks[taskId]?.subtasks.find((st) => st.id === subtaskId)
          if (sub) {
            import('@/lib/content/contentTasks')
              .then((m) => m.syncSubtaskCompletionToItem(subtaskId, !!sub.completed))
              .catch(() => { /* noop */ })
          }
        }
      },

      toggleSubtask: (taskId, subtaskId) => {
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
                  // Guarda anti-duplicado: si la hermana de esa fecha ya está
                  // (la spawneó otro dispositivo y llegó por sync, o un
                  // re-toggle), no creamos otra.
                  const siblingId = nextDue ? recurringSubtaskSiblingId(subtaskId, nextDue) : ''
                  const normSub = (str: string) =>
                    str.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
                  const siblingExists = !!nextDue && updated.some((st) =>
                    st.id === siblingId
                    || (st.dueDate === nextDue && normSub(st.title) === normSub(targetSub!.title)),
                  )
                  if (shouldSpawnNext && nextDue && targetSub && !siblingExists) {
                    const newSub: Subtask = {
                      ...targetSub,
                      // Id DETERMINISTA: dos dispositivos que completan la
                      // misma subtarea recurrente generaban dos hermanas con
                      // ids random y el merge se quedaba con LAS DOS.
                      id: siblingId,
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
        })
        // Content Strategy: si es una subtarea de contenido (`cs_<itemId>`),
        // reflejar el completado en la etapa de la pieza (completar →
        // Publicado; des-completar → Agendado). Dynamic import → sin ciclo.
        if (subtaskId.startsWith('cs_')) {
          const sub = get().tasks[taskId]?.subtasks.find((st) => st.id === subtaskId)
          if (sub) {
            import('@/lib/content/contentTasks')
              .then((m) => m.syncSubtaskCompletionToItem(subtaskId, !!sub.completed))
              .catch(() => { /* noop */ })
          }
        }
      },

      toggleSubtaskFavorite: (taskId, subtaskId) =>
        set((s) => {
          const t = s.tasks[taskId]
          if (!t) return s
          const now = new Date().toISOString()
          return {
            tasks: {
              ...s.tasks,
              [taskId]: {
                ...t,
                // Bump del updatedAt de la madre → el merge LWW propaga las
                // subtasks (se mergean bajo su tarea).
                updatedAt: now,
                subtasks: t.subtasks.map((st) =>
                  st.id === subtaskId ? { ...st, favorite: !st.favorite } : st,
                ),
              },
            },
          }
        }),

      deleteSubtask: (taskId, subtaskId) =>
        set((s) => {
          const t = s.tasks[taskId]
          if (!t) return s
          const removeIds = collectDescendantSubtaskIds(t.subtasks, subtaskId)
          removeIds.add(subtaskId)
          const next = t.subtasks.filter((st) => !removeIds.has(st.id))
          return {
            tasks: {
              ...s.tasks,
              [taskId]: { ...t, subtasks: next, updatedAt: new Date().toISOString() },
            },
          }
        }),

      mergeRecurringSeries: (sourceHeadId, targetHeadId) => {
        if (sourceHeadId === targetHeadId) return 0
        let reassigned = 0
        set((s) => {
          const target = s.tasks[targetHeadId]
          if (!target) return s
          const tasks = { ...s.tasks }
          for (const t of Object.values(s.tasks)) {
            // Reasignamos tanto las hijas como la propia madre source.
            // La identifico por recurringHeadId === sourceHeadId (incluye
            // self-reference, por eso barre la madre también).
            if (t.recurringHeadId !== sourceHeadId) continue
            tasks[t.id] = { ...t, recurringHeadId: targetHeadId, updatedAt: new Date().toISOString() }
            reassigned++
          }
          return { tasks }
        })
        return reassigned
      },

      migrateRecurringHeads: () =>
        set((s) => {
          // Datos pre-migración no tenían `recurringHeadId`. Agrupamos por
          // projectId + título normalizado (mismo critero que usaba el spawn
          // legacy) y elegimos como MADRE a la instancia con dueDate más
          // vieja (no archivada). El resto reciben recurringHeadId = motherId.
          //
          // Idempotente: si la task ya tiene recurringHeadId seteado, no la
          // tocamos. Si una serie completa ya está migrada, el loop no hace
          // ningún cambio. Safe de correr en cada mount.
          const norm = (t: string) =>
            t.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
          // 1) Elegir la MADRE de cada serie (key = proyecto + título norm).
          //    Prioridad: madre ya establecida (recurringHeadId === id); si no,
          //    la tarea con `recurrence` de dueDate más vieja. Si NINGUNA tarea
          //    del grupo tiene recurrence, no es una serie → no se toca.
          const byKey = new Map<string, Task[]>()
          for (const t of Object.values(s.tasks)) {
            if (t.archivedAt) continue
            const key = `${t.projectId}::${norm(t.title)}`
            if (!byKey.has(key)) byKey.set(key, [])
            byKey.get(key)!.push(t)
          }
          // Orden canónico: dueDate más vieja → createdAt más viejo → id. Tiene
          // que ser DETERMINISTA: dos dispositivos que corran este heal sobre
          // los mismos datos deben elegir la MISMA madre, si no cada uno
          // re-etiqueta la serie a su manera y el sync hace ping-pong.
          const oldestFirst = (a: Task, b: Task) => {
            const da = a.dueDate ?? '9999-99-99'
            const db = b.dueDate ?? '9999-99-99'
            if (da !== db) return da.localeCompare(db)
            const ca = a.createdAt ?? ''
            const cb = b.createdAt ?? ''
            if (ca !== cb) return ca.localeCompare(cb)
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
          }
          const motherByKey = new Map<string, string>()
          for (const [key, arr] of byKey) {
            // Puede haber VARIAS madres establecidas si la serie se fragmentó
            // (madre borrada → cada instancia abrió serie propia). Nos
            // quedamos con la más vieja y el paso 2 re-ancla el resto.
            const established = arr.filter((t) => t.recurringHeadId && t.recurringHeadId === t.id)
            if (established.length > 0) {
              motherByKey.set(key, [...established].sort(oldestFirst)[0].id)
              continue
            }
            const recurring = arr.filter((t) => t.recurrence)
            if (recurring.length === 0) continue
            motherByKey.set(key, [...recurring].sort(oldestFirst)[0].id)
          }
          if (motherByKey.size === 0) return s
          // 2) Re-linkear toda tarea SIN recurringHeadId cuya key tenga madre.
          //    Incluye instancias que perdieron su `recurrence` en un clobber de
          //    sync multi-device (antes quedaban sueltas para siempre porque el
          //    heal viejo exigía `recurrence`). Una tarea sin recurrence solo se
          //    absorbe si tiene dueDate (parece instancia), para no tragarse
          //    one-offs que casualmente compartan título con una serie.
          let changed = false
          const nowIso = new Date().toISOString()
          const tasks = { ...s.tasks }
          for (const t of Object.values(s.tasks)) {
            if (t.archivedAt) continue
            const motherId = motherByKey.get(`${t.projectId}::${norm(t.title)}`)
            if (!motherId) continue
            if (t.recurringHeadId === motherId) continue          // ya anclada (idempotente)
            if (t.recurringHeadId) {
              // Solo re-anclamos FRAGMENTOS, no series sanas:
              //   - huérfana: su madre ya no existe, o
              //   - auto-anclada (es su propia madre) pero no es la canónica
              //     → la serie se partió en una serie por instancia.
              // Si apunta a otra tarea que SÍ existe (aunque esté archivada,
              // = serie detenida a propósito), no se toca: re-anclarla la
              // desengancharía de su madre y la cadena volvería a arrancar.
              const orphan = !s.tasks[t.recurringHeadId]
              const selfAnchored = t.recurringHeadId === t.id
              if (!orphan && !selfAnchored) continue
              if (!t.recurrence) continue                         // no arrastramos one-offs ya anclados
            } else if (!t.recurrence && !t.dueDate) {
              continue                                            // guarda anti-absorción
            }
            // `updatedAt` bumpeado: sin esto el merge LWW del pull pisaba el
            // re-anclaje con la copia remota vieja y la serie se volvía a
            // partir en cada sync (BASE nº1).
            tasks[t.id] = { ...t, recurringHeadId: motherId, updatedAt: nowIso }
            changed = true
          }
          if (!changed) return s
          return { tasks }
        }),
    }),
    { name: 'overseer-tasks' }
  )
)
