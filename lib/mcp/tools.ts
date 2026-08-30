/** Catálogo y dispatch de las herramientas MCP del bridge.
 *
 *  Separado de la ruta a propósito: acá va QUÉ puede hacer Claude, en
 *  `app/api/mcp/route.ts` va el protocolo JSON-RPC. Así se puede leer la
 *  superficie de la API completa en un archivo.
 */

import {
  getAgenda, getTasks, getPlannerProfile, getPlanHistory,
} from './queries'
import { saveDayPlan, scheduleTask, updatePlannerProfile } from './writes'

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
