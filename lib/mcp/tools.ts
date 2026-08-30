/** Catálogo y dispatch de las herramientas MCP del bridge.
 *
 *  Separado de la ruta a propósito: acá va QUÉ puede hacer Claude, en
 *  `app/api/mcp/route.ts` va el protocolo JSON-RPC. Así se puede leer la
 *  superficie de la API completa en un archivo.
 */

import {
  getAgenda, getTasks, getPlannerProfile, getPlanHistory, getProjects, getRecurringSeries, getGym, getWallet,
} from './queries'
import { saveDayPlan, scheduleTask, updatePlannerProfile } from './writes'
import { createTask, setTaskRecurrence, addSubtasks } from './taskWrites'
import { deleteSubtasks } from './deleteSubtasks'
import { deleteCalendarEvent, createCalendarEvent } from './calendarWrites'
import { getUserPrefs } from './queries'

export interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const str = (description: string) => ({ type: 'string', description })
const num = (description: string) => ({ type: 'number', description })

export const TOOLS: ToolDef[] = [
  {
    name: 'get_agenda',
    description:
      'La herramienta principal para planificar. Para cada día del rango devuelve: eventos reales de Google Calendar, las anclas fijas del día del usuario (almuerzo, entrenamiento…), los HUECOS LIBRES ya calculados con sus minutos, las tareas que vencen ese día y el plan guardado si ya hay uno. Usala SIEMPRE antes de proponer un plan: no adivines cuánto tiempo tiene libre.',
    inputSchema: {
      type: 'object',
      properties: {
        from: str('Primer día, YYYY-MM-DD.'),
        to: str('Último día, YYYY-MM-DD. Máximo 31 días de rango.'),
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_tasks',
    description:
      'Lista las tareas pendientes con todo lo que hace falta para priorizar: proyecto, prioridad, importancia, vencimiento, energía estimada, etiquetas, cuántas veces se postergó y el estado de sus subtareas. Excluye siempre las archivadas.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: str('Filtrar por proyecto.'),
        status: str('Filtrar por estado (ej. "To Do", "Haciendo").'),
        tags: { type: 'array', items: { type: 'string' }, description: 'Filtrar por etiquetas.' },
        includeCompleted: { type: 'boolean', description: 'Incluir completadas. Default false.' },
        limit: num('Máximo de tareas. Default 200.'),
      },
    },
  },
  {
    name: 'get_planner_profile',
    description:
      'Lo que el planificador aprendió del usuario: horario de trabajo, ventanas de foco, duraciones típicas, energía por franja del día y las reglas en lenguaje natural que se fueron acumulando. Leelo ANTES de armar un plan.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_plan_history',
    description:
      'Planes de días anteriores comparados con lo que realmente pasó: qué bloques se cumplieron, cuáles no, y cuántas veces se pateó cada tarea. Es la fuente para aprender: si un tipo de bloque se incumple sistemáticamente, se ve acá.',
    inputSchema: {
      type: 'object',
      properties: { days: num('Cuántos días hacia atrás. Default 14.') },
    },
  },
  {
    name: 'list_projects',
    description:
      'Los proyectos del usuario con sus ESTADOS reales y cuántas tareas pendientes tienen. Leelo antes de create_task: `status` es obligatorio y cada tablero tiene sus propios estados (los de este usuario están en español: "Hacer", "Haciendo"), así que no asumas "To Do".',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_recurring_series',
    description:
      'Revisar las tareas recurrentes: una entrada por serie con su regla, el proyecto, si está detenida, cuántas instancias hay hechas y pendientes, la próxima fecha y el detalle de las instancias. Usalo cuando el usuario pregunte qué recurrentes tiene o algo se vea raro/duplicado.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'create_task',
    description:
      'Crea una tarea en un proyecto. IMPORTANTE: para que aparezca como bloque en el CALENDARIO de Overseer necesita `dueDate` Y `dueTime` juntos — solo con fecha es un to-do del día y no se dibuja. La respuesta trae `showsInCalendar` para confirmarlo. Podés mandarle subtareas y hacerla recurrente de una.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: str('Proyecto destino. Sacalo de list_projects.'),
        title: str('Título de la tarea.'),
        description: str('Descripción larga. Opcional.'),
        notes: str('Notas. Opcional.'),
        status: str('Estado inicial. Tiene que existir en ese proyecto; si no, se usa el primer estado no-hecho y se avisa.'),
        priority: str('low | medium | high | urgent. Default medium.'),
        importance: str('low | medium | high. Default medium.'),
        dueDate: str('YYYY-MM-DD. Necesaria para el calendario y OBLIGATORIA si es recurrente (es el ancla de la serie).'),
        dueTime: str('HH:MM. Junto con dueDate hace que se vea en el calendario.'),
        durationMinutes: num('Largo del bloque en el calendario. Default 60 si hay hora.'),
        energyEstimate: num('1 a 5.'),
        tags: { type: 'array', items: { type: 'string' }, description: 'Etiquetas, cruzan proyectos.' },
        favorite: { type: 'boolean', description: 'Marcarla con ⭐.' },
        scheduledFor: str('"today" | "tomorrow".'),
        subtasks: {
          type: 'array',
          description: 'Subtareas. Acepta strings sueltos o { title }.',
          items: { type: 'string' },
        },
        recurrence: {
          type: 'object',
          description: 'Regla de repetición. Requiere dueDate. Las instancias las genera la app al abrir Tareas.',
          properties: {
            kind: { type: 'string', enum: ['daily', 'weekdays', 'weekly', 'monthly'] },
            daysOfWeek: { type: 'array', items: { type: 'number' }, description: 'Solo weekly. 0=domingo … 6=sábado.' },
            until: str('YYYY-MM-DD — no genera instancias después de esa fecha.'),
          },
          required: ['kind'],
        },
      },
      required: ['projectId', 'title'],
    },
  },
  {
    name: 'add_subtasks',
    description:
      'Agrega subtareas a una tarea que YA existe (create_task solo sirve para tareas nuevas). Caen al final del checklist. Sirve para desglosar en pasos concretos un proyecto que el usuario tiene modelado como una tarea contenedora.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: str('Tarea a la que se le agregan.'),
        subtasks: { type: 'array', items: { type: 'string' }, description: 'Títulos, en orden.' },
      },
      required: ['taskId', 'subtasks'],
    },
  },
  {
    name: 'delete_subtasks',
    description:
      'Borra subtareas por id. Es LO UNICO que borra del dominio de tareas — el resto del bridge nunca borra. OJO: si una subtarea tiene subtareas anidadas adentro, se van TODAS con ella (la FK es on delete cascade); la respuesta informa cuales se arrastraron. Escribe tombstones para que el borrado no rebote desde otro dispositivo. Pasar `taskId` como guarda para asegurarse de no borrar la subtarea de otra tarea.',
    inputSchema: {
      type: 'object',
      properties: {
        subtaskIds: { type: 'array', items: { type: 'string' }, description: 'Ids a borrar.' },
        taskId: str('Opcional pero recomendado: si se pasa, falla si alguna subtarea no pertenece a esa tarea.'),
      },
      required: ['subtaskIds'],
    },
  },
  {
    name: 'set_task_recurrence',
    description:
      'Hace recurrente una tarea que ya existe, le cambia la regla, o detiene la serie (mandá recurrence: null). Se aplica sobre la tarea MADRE, no sobre una instancia. La tarea tiene que tener fecha: esa fecha es el ancla de la serie. Las instancias las genera/rehace la app al abrir Tareas.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: str('Id de la tarea madre.'),
        recurrence: {
          type: 'object',
          description: 'La regla nueva. Mandá null para detener la serie.',
          properties: {
            kind: { type: 'string', enum: ['daily', 'weekdays', 'weekly', 'monthly'] },
            daysOfWeek: { type: 'array', items: { type: 'number' }, description: 'Solo weekly. 0=domingo … 6=sábado.' },
            until: str('YYYY-MM-DD.'),
          },
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'get_wallet',
    description:
      'La billetera y el capital: saldo por billetera y divisa (calculado desde las transacciones, no hay columna de saldo), total por divisa, ingresos/egresos de los ultimos meses, las CUENTAS DE FONDEO (prop firms) con su tamaño, costo, estado y limites de riesgo, y la distribucion configurada. Usalo para responder cuanto capital hay, donde esta, y como viene el mes.',
    inputSchema: {
      type: 'object',
      properties: { meses: num('Cuantos meses hacia atras en el resumen mensual. Default 3.') },
    },
  },
  {
    name: 'get_gym',
    description:
      'El entrenamiento: qué categorías toca cada día de la semana (trainingPlan), las rutinas guardadas con sus ejercicios, las últimas sesiones hechas, la fase, el tipo de gimnasio y el último peso corporal. Usalo para armar la semana: el calendario dice CUÁNDO entrena, esto dice QUÉ.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'delete_calendar_event',
    description:
      'Borra un evento de Google Calendar. Los ids salen de get_agenda (cada evento trae id, calendarId y, si es recurrente, recurringEventId). OJO: `scope` es obligatorio y no tiene default — "instance" borra solo ese día, "series" borra la serie entera y no vuelve nunca. Esto NO tiene deshacer desde acá (queda en la papelera de Google un tiempo). Confirmá con el usuario antes de usarlo.',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: str('Id del evento (de get_agenda).'),
        calendarId: str('Calendario al que pertenece (de get_agenda).'),
        recurringEventId: str('Id de la serie, si el evento es una instancia. Necesario para scope="series".'),
        scope: { type: 'string', enum: ['instance', 'series'], description: 'Qué se borra. Obligatorio.' },
      },
      required: ['eventId', 'calendarId', 'scope'],
    },
  },
  {
    name: 'create_calendar_event',
    description:
      'Crea un bloque en Google Calendar. Se usa para agendar los bloques de trabajo de la semana. Horas en hora LOCAL del usuario. Para repetirlo, pasar `recurrenceRule` en formato RRULE (ej. "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR").',
    inputSchema: {
      type: 'object',
      properties: {
        title: str('Título del bloque.'),
        date: str('Día, YYYY-MM-DD. Si es recurrente, es la primera fecha.'),
        start: str('Hora de inicio HH:MM (local).'),
        end: str('Hora de fin HH:MM (local).'),
        description: str('Detalle. Opcional.'),
        calendarId: str('Calendario destino. Default "primary".'),
        recurrenceRule: str('RRULE para repetirlo. Opcional.'),
      },
      required: ['title', 'date', 'start', 'end'],
    },
  },
  {
    name: 'save_day_plan',
    description:
      'Guarda el plan de un día. Le aparece al usuario en el widget "Plan de hoy" del Panel, en todos sus dispositivos. Reemplaza el plan anterior de esa fecha (hay uno solo por día). Poné SIEMPRE el "reason" de cada bloque: es lo que le permite al usuario entender por qué lo pusiste ahí y corregirte.',
    inputSchema: {
      type: 'object',
      properties: {
        date: str('Día del plan, YYYY-MM-DD.'),
        note: str('Resumen o consejo del día. Opcional.'),
        blocks: {
          type: 'array',
          description: 'Bloques en orden. Se ordenan por hora automáticamente.',
          items: {
            type: 'object',
            properties: {
              title: str('Qué se hace en el bloque.'),
              kind: { type: 'string', enum: ['task', 'event', 'break', 'focus'], description: 'Tipo de bloque.' },
              start: str('Hora de inicio HH:MM. Opcional.'),
              end: str('Hora de fin HH:MM. Opcional.'),
              taskId: str('Id de la tarea real que se trabaja. Opcional pero MUY recomendado: linkea el bloque con la tarea.'),
              reason: str('Por qué este bloque va acá. Opcional pero recomendado.'),
            },
            required: ['title'],
          },
        },
      },
      required: ['date', 'blocks'],
    },
  },
  {
    name: 'schedule_task',
    description:
      'Mueve una tarea en el tiempo: fecha, hora, duración o "hoy/mañana". Es lo ÚNICO que se puede modificar de una tarea desde acá — no se puede completar, borrar, cambiar de proyecto ni tocar recurrencias. Mandá null en un campo para vaciarlo.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: str('Id de la tarea.'),
        dueDate: str('YYYY-MM-DD o null.'),
        dueTime: str('HH:MM o null.'),
        durationMinutes: num('Duración en minutos o null.'),
        scheduledFor: str('"today", "tomorrow" o null.'),
      },
      required: ['taskId'],
    },
  },
  {
    name: 'update_planner_profile',
    description:
      'Actualiza lo aprendido sobre cómo planificar para este usuario. Usalo cuando te diga una preferencia ("no me agendes estudio los viernes", "a la mañana rindo más") o cuando veas en get_plan_history que algo se incumple sistemáticamente. Es un merge parcial: mandá solo lo que cambia. Las reglas nuevas se mandan con la lista COMPLETA de rules (reemplaza, no appendea).',
    inputSchema: {
      type: 'object',
      properties: {
        patch: {
          type: 'object',
          description: 'Campos a actualizar: workingHours, deepWorkWindows, typicalDurations, energyByTimeOfDay, rules.',
        },
      },
      required: ['patch'],
    },
  },
]

type Args = Record<string, unknown>

/** Ejecuta una tool. Devuelve el objeto que va serializado al cliente MCP. */
export async function callTool(
  name: string,
  args: Args,
  ctx: { userId: string; origin: string },
): Promise<unknown> {
  const { userId, origin } = ctx

  switch (name) {
    case 'get_agenda':
      return getAgenda(userId, origin, String(args.from ?? ''), String(args.to ?? ''))

    case 'get_tasks':
      return {
        tasks: await getTasks(userId, {
          projectId: args.projectId as string | undefined,
          status: args.status as string | undefined,
          tags: Array.isArray(args.tags) ? (args.tags as string[]) : undefined,
          includeCompleted: !!args.includeCompleted,
          limit: typeof args.limit === 'number' ? args.limit : undefined,
        }),
      }

    case 'get_planner_profile':
      return { plannerProfile: await getPlannerProfile(userId) }

    case 'get_plan_history':
      return { history: await getPlanHistory(userId, typeof args.days === 'number' ? args.days : 14) }

    case 'list_projects':
      return { projects: await getProjects(userId) }

    case 'get_recurring_series':
      return { series: await getRecurringSeries(userId) }

    case 'create_task':
      return createTask(userId, args)

    case 'add_subtasks':
      return addSubtasks(userId, { taskId: args.taskId as string, subtasks: args.subtasks })

    case 'delete_subtasks':
      return deleteSubtasks(userId, { subtaskIds: args.subtaskIds, taskId: args.taskId as string | undefined })

    case 'set_task_recurrence':
      return setTaskRecurrence(userId, {
        taskId: args.taskId as string,
        // `null` explícito = detener la serie. `undefined` (la clave ni vino)
        // se trata igual: no hay otra cosa razonable que hacer sin regla.
        recurrence: args.recurrence,
      })

    case 'get_wallet':
      return { wallet: await getWallet(userId, typeof args.meses === 'number' ? args.meses : 3) }

    case 'get_gym':
      return { gym: await getGym(userId) }

    case 'delete_calendar_event':
      return deleteCalendarEvent(userId, origin, args as Parameters<typeof deleteCalendarEvent>[2])

    case 'create_calendar_event': {
      const prefs = await getUserPrefs(userId)
      return createCalendarEvent(userId, origin, prefs.timezone, args as Parameters<typeof createCalendarEvent>[3])
    }

    case 'save_day_plan':
      return saveDayPlan(userId, {
        date: args.date as string,
        blocks: args.blocks,
        note: args.note as string | undefined,
      })

    case 'schedule_task':
      return scheduleTask(userId, args as Parameters<typeof scheduleTask>[1])

    case 'update_planner_profile':
      return updatePlannerProfile(userId, args.patch as Record<string, never>)

    default:
      return { ok: false, error: 'unknown_tool', detail: `No existe la herramienta "${name}".` }
  }
}
