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
import { deleteTasks } from './deleteTasks'
import { getSpi, getKpis, getHistory } from './spiQueries'
import { completeTasks, completeSubtasks } from './completeWrites'
import { updateTask, updateSubtask } from './updateWrites'
import { deleteCalendarEvent, createCalendarEvent } from './calendarWrites'
import { getUserPrefs } from './queries'
import { ensureSpiWeek, updateSpiWeek, setSpiTasks, upsertKpi, setKpiValue } from './spiWrites'
import { getHabits, upsertHabit, markHabit, deleteHabit } from './habitWrites'
import { getProgress } from './progress'
import { getProjection, updateProjection } from './projectionWrites'
import { getMetasIncompletas } from './huecos'
import { getBooks, upsertBook } from './bookWrites'
import { listCalendars } from './queries'
import { getOffers, upsertOffer, setOfferDoc } from './offerWrites'
import { logWorkout, getWorkoutSplit } from './gymWrites'

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
        taskId: str('Leer UNA sola tarea. Util para abrir un proceso largo sin arrastrar el resto del tablero.'),
        subtaskLimit: num('Cuantas subtareas pendientes por tarea. Default 30, tope 500. Subilo para procesos de 100+ pasos: los ids de las subtareas SOLO salen de aca, asi que lo que quede afuera no se puede tildar ni borrar.'),
        incluirSubtareasHechas: { type: 'boolean', description: 'Devolver tambien las subtareas ya completadas con su id, en `subtasks.hechas`. Necesario para destildar, editar o borrar un paso ya hecho.' },
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
      'Agrega subtareas a una tarea que YA existe (create_task solo sirve para tareas nuevas). Caen al final del checklist. ACEPTA ANIDADO: cada ítem puede ser un string suelto o { titulo, hijos: [...] }, hasta 6 niveles — sirve para cargar un proceso entero con sus etapas, secciones e ítems de una sola vez.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: str('Tarea a la que se le agregan.'),
        subtasks: { type: 'array', description: 'Strings sueltos o { titulo, hijos: [...] } anidado, en orden.' },
      },
      required: ['taskId', 'subtasks'],
    },
  },
  {
    name: 'update_task',
    description:
      'Edita una tarea existente: title, description, notes, status, priority, importance, energyEstimate, category, tags, favorite. El `status` se valida contra los estados REALES del proyecto y falla listandolos si no existe. Si el estado cuenta como hecho, sincroniza completed_at (y se niega en recurrentes). NO mueve de proyecto ni archiva: eso tiene logica de dominio en el cliente.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: str('Id de la tarea.'),
        title: str('Titulo nuevo.'),
        description: str('Descripcion.'),
        notes: str('Notas.'),
        status: str('Estado. Tiene que existir en el proyecto (ej. "In Progress").'),
        priority: str('low | medium | high | urgent.'),
        importance: str('low | medium | high.'),
        energyEstimate: num('1 a 5, o null.'),
        category: str('Categoria.'),
        tags: { type: 'array', items: { type: 'string' }, description: 'Reemplaza las etiquetas.' },
        favorite: { type: 'boolean', description: 'Marcar/desmarcar ⭐.' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'update_subtask',
    description:
      'Edita una subtarea: title, notes, priority, favorite. No toca `parent_id` ni el orden — anidar y reordenar tiene logica de arbol (anti-ciclos, cascada) que vive en el cliente.',
    inputSchema: {
      type: 'object',
      properties: {
        subtaskId: str('Id de la subtarea (sale de get_tasks).'),
        title: str('Titulo nuevo.'),
        notes: str('Notas.'),
        priority: str('low | medium | high | urgent.'),
        favorite: { type: 'boolean', description: 'Marcar/desmarcar ⭐.' },
      },
      required: ['subtaskId'],
    },
  },
  {
    name: 'complete_tasks',
    description:
      'Marca tareas como hechas (o las des-marca con done:false, como el segundo click en la app). Setea completed_at Y el status a uno que cuente como hecho, igual que el cliente. SE NIEGA con tareas recurrentes: al completarlas el cliente genera la instancia siguiente con ids deterministas, y eso no se puede hacer desde el server.',
    inputSchema: {
      type: 'object',
      properties: {
        taskIds: { type: 'array', items: { type: 'string' }, description: 'Ids de las tareas.' },
        done: { type: 'boolean', description: 'true = hecha (default). false = des-completar.' },
      },
      required: ['taskIds'],
    },
  },
  {
    name: 'complete_subtasks',
    description:
      'Marca subtareas como hechas (o las des-marca con done:false). Los ids salen de get_tasks. Bumpea updated_at de la tarea madre para que el tilde no se pierda al sincronizar. SE NIEGA con subtareas recurrentes.',
    inputSchema: {
      type: 'object',
      properties: {
        subtaskIds: { type: 'array', items: { type: 'string' }, description: 'Ids de las subtareas.' },
        done: { type: 'boolean', description: 'true = hecha (default). false = des-completar.' },
      },
      required: ['subtaskIds'],
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
    name: 'delete_tasks',
    description:
      'Borra tareas ENTERAS por id, con sus subtareas (la FK es on delete cascade). Escribe tombstones de la tarea Y de cada subtarea antes de borrar, para que no rebote desde otro dispositivo. SE NIEGA si alguna es parte de una serie recurrente: borrar una sola deja el resto vivo y la serie se vuelve a sembrar — hay que pasar `incluirSerieRecurrente: true` para llevarse la serie completa, o usar set_task_recurrence con null si solo se quiere detenerla. Arriba de 10 tareas exige `confirmarBorradoMasivo`. NO borra proyectos ni archiva: esto borra de verdad y no tiene deshacer.',
    inputSchema: {
      type: 'object',
      properties: {
        taskIds: { type: 'array', items: { type: 'string' }, description: 'Ids de las tareas a borrar.' },
        incluirSerieRecurrente: {
          type: 'boolean',
          description: 'Permite borrar series recurrentes COMPLETAS (madre + todas sus instancias, incluso completadas). Sin esto, tocar una recurrente falla sin borrar nada.',
        },
        confirmarBorradoMasivo: {
          type: 'boolean',
          description: 'Necesario cuando el pedido termina borrando mas de 10 tareas.',
        },
      },
      required: ['taskIds'],
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
    name: 'get_spi',
    description:
      'El SPI del usuario: sus sesiones semanales con los objetivos y proyectos que eligio para cada semana (payload completo tal cual lo guarda la app), y la bitacora de lo que funciona / lo que esta roto. LEER ESTO ANTES de proponer objetivos: ya tiene un sistema de objetivos y armar otro al lado seria duplicarlo.',
    inputSchema: {
      type: 'object',
      properties: { semanas: num('Cuantas semanas hacia atras. Default 8.') },
    },
  },
  {
    name: 'get_kpis',
    description:
      'Los KPIs configurados por el usuario, con su payload completo. Van de la mano del SPI.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_history',
    description:
      'Lo COMPLETADO entre dos fechas, por dia, con totales y conteo por proyecto. Incluye las tareas ARCHIVADAS: la app las saca de la vista al dia siguiente de completarlas, pero la fila sigue en la base — ese es el registro de avance que desde adentro de la app no se ve. Sirve para comparar semana contra semana. OJO: el boton "borrar historial" de la app SI borra estas filas.',
    inputSchema: {
      type: 'object',
      properties: {
        from: str('Desde, YYYY-MM-DD.'),
        to: str('Hasta, YYYY-MM-DD.'),
      },
      required: ['from', 'to'],
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
  // ─── SPI: la ritual semanal ─────────────────────────────────────────────
  {
    name: 'ensure_spi_week',
    description:
      'Abre (o crea si no existe) la sesión de SPI de una semana. OJO: la semana del SPI arranca el SÁBADO — una sesión anclada al sábado X planifica lunes X+2 a domingo X+8. Sin `weekStartDate` usa la semana en curso. Es idempotente: si ya existe la reusa, no duplica el ritual. Llamala antes que cualquier otro write de SPI.',
    inputSchema: {
      type: 'object',
      properties: { weekStartDate: str('Sábado ancla, YYYY-MM-DD. Omitilo para la semana en curso.') },
    },
  },
  {
    name: 'update_spi_week',
    description:
      'Carga la sesión semanal del SPI: carriles (`lanes`), KPIs encendidos (`kpiIds`), respuestas del formulario (`values`) y el checklist principal. Por default SUMA (no pisa lo que el usuario cargó desde la app); mandá `replaceLanes`/`replaceKpis` en true para reemplazar. Un `kpiIds` con un id que no existe en la biblioteca FALLA en vez de guardar algo que no se rendearía.',
    inputSchema: {
      type: 'object',
      properties: {
        weekStartDate: str('Sábado ancla. Omitilo para la semana en curso.'),
        lanes: { type: 'array', items: { type: 'string' }, description: 'Carriles a activar (ej. estrategico, tactico, reflexivo, profundo).' },
        replaceLanes: { type: 'boolean', description: 'true = reemplazar la lista en vez de sumar.' },
        kpiIds: { type: 'array', items: { type: 'string' }, description: 'KPIs a encender esta semana. Salen de get_kpis / upsert_kpi.' },
        replaceKpis: { type: 'boolean', description: 'true = reemplazar en vez de sumar.' },
        values: { type: 'object', description: 'Respuestas: {seccion: {campo: "texto"}}. Se mergea por campo.' },
        mainChecklist: { type: 'object', description: '{clave: true|false} del checklist principal.' },
        notes: str('Notas de cierre / reflexión.'),
      },
    },
  },
  {
    name: 'set_spi_tasks',
    description:
      'Agrega, edita o quita las tareas de la sesión semanal del SPI. `important` es la marca ⭐ Pareto (el 20% que mueve el 80%) y `priority` es ⚡ prioridad del día (aparece en el Panel y bloquea la vista diaria hasta completarla). No duplica por título. Al CERRAR la semana desde la app, estas tareas se empujan solas al task manager en el proyecto SPI.',
    inputSchema: {
      type: 'object',
      properties: {
        weekStartDate: str('Sábado ancla. Omitilo para la semana en curso.'),
        add: { type: 'array', description: 'Tareas nuevas: strings sueltos o {title, important, priority, dueDate, whyPurpose}.' },
        update: { type: 'array', description: '[{taskId, ...campos a cambiar}]. El taskId es el de la tarea DENTRO del SPI.' },
        remove: { type: 'array', items: { type: 'string' }, description: 'Ids de tareas del SPI a quitar de la semana.' },
      },
    },
  },
  {
    name: 'upsert_kpi',
    description:
      'Crea o edita una definición de KPI (la biblioteca de /kpis). Un KPI es un CONTEO SEMANAL contra un target (3 entrenos de 5), distinto de un hábito, que es binario diario. Definir no es encender: para que aparezca en una semana hay que prenderlo con update_spi_week. Un KPI nuevo se ancla a la semana en curso y NO aparece retroactivamente en semanas viejas.',
    inputSchema: {
      type: 'object',
      properties: {
        kpiId: str('Id existente para editar. Omitilo para crear uno nuevo.'),
        name: str('Nombre, ej. "Entrenos".'),
        icon: str('Emoji.'),
        color: str('Hex, ej. #f59e0b.'),
        kind: str('count | percent | boolean. Default count.'),
        target: num('Techo semanal. En percent es 0-100; en boolean se ignora.'),
        group: str('Grupo visual del scoreboard, ej. trading.'),
        areaKey: str('Área de la rueda a la que pertenece.'),
        cumulativeTarget: num('Meta ACUMULADA de largo plazo (solo kind=count). El target semanal pasa a ser el ritmo.'),
        cumulativeStartDate: str('YYYY-MM-DD desde cuándo suma el acumulado.'),
        cumulativeDeadline: str('YYYY-MM-DD tope para la meta acumulada.'),
        archived: { type: 'boolean', description: 'true archiva el KPI (deja de ofrecerse, el histórico se conserva); false lo desarchiva.' },
      },
    },
  },
  {
    name: 'set_kpi_value',
    description:
      'Carga el número de un KPI para una semana. Falla si el KPI no está encendido en esa sesión, porque el valor no se vería.',
    inputSchema: {
      type: 'object',
      properties: {
        weekStartDate: str('Sábado ancla. Omitilo para la semana en curso.'),
        kpiId: str('Id del KPI.'),
        value: str('Valor. Siempre string, se parsea según el kind.'),
      },
      required: ['kpiId', 'value'],
    },
  },
  // ─── Hábitos ────────────────────────────────────────────────────────────
  {
    name: 'get_habits',
    description:
      'Los hábitos del usuario con su id, los días en que aplican, el estado de HOY, la racha y las marcas de los últimos N días. Leelo antes de marcar o borrar: es de donde salen los ids.',
    inputSchema: {
      type: 'object',
      properties: { dias: num('Ventana hacia atrás, 1-90. Default 14.') },
    },
  },
  {
    name: 'upsert_habit',
    description:
      'Crea o edita un hábito. `targetDays` son los días en que aplica (0=domingo … 6=sábado); `[]` = todos los días. Editar NUNCA toca el historial de marcas.',
    inputSchema: {
      type: 'object',
      properties: {
        habitId: str('Id existente para editar. Omitilo para crear.'),
        name: str('Nombre del hábito.'),
        icon: str('Emoji.'),
        color: str('Hex.'),
        category: str('Categoría, ej. Fitness.'),
        targetDays: { type: 'array', items: { type: 'number' }, description: '0=domingo … 6=sábado. [] = todos los días.' },
        reminderTime: str('HH:MM 24h para el recordatorio push, o null para sacarlo.'),
      },
    },
  },
  {
    name: 'mark_habit',
    description:
      'Marca días de un hábito. `estado` es OBLIGATORIO y no tiene default: "hecho", "salteado" (N/A, no cuenta ni a favor ni en contra) o "limpio". Marcar siempre gana entre dispositivos; DESMARCAR puede rebotar, porque el merge une las marcas — se avisa en la respuesta.',
    inputSchema: {
      type: 'object',
      properties: {
        habitId: str('Id del hábito, de get_habits.'),
        estado: str('hecho | salteado | limpio.'),
        fechas: { type: 'array', items: { type: 'string' }, description: 'YYYY-MM-DD. Omitilo para hoy.' },
      },
      required: ['habitId', 'estado'],
    },
  },
  {
    name: 'delete_habit',
    description:
      'Borra un hábito Y todo su historial de marcas. No hay papelera para hábitos: exige `confirmarNombre` con el nombre exacto. Escribe el tombstone antes de borrar para que no resucite desde otro dispositivo.',
    inputSchema: {
      type: 'object',
      properties: {
        habitId: str('Id del hábito.'),
        confirmarNombre: str('El nombre exacto del hábito, como confirmación.'),
      },
      required: ['habitId', 'confirmarNombre'],
    },
  },
  // ─── Medición ───────────────────────────────────────────────────────────
  {
    name: 'get_progress',
    description:
      'EL TABLERO DE AVANCE, ya calculado. Devuelve, para un rango: qué se completó cada día (incluidos los días en CERO, que es lo que hay que mirar), el reparto por proyecto con su share, el cumplimiento de cada hábito con su racha, los KPIs de la semana contra su target, y los objetivos escritos en el SPI. Usalo para el cierre del domingo en vez de re-derivar todo desde get_history. Sin rango usa la semana que planifica la sesión de SPI en curso. NO calcula si los objetivos se cumplieron: eso es una lectura, no una cuenta.',
    inputSchema: {
      type: 'object',
      properties: {
        from: str('Primer día YYYY-MM-DD. Omitilo para la semana en curso.'),
        to: str('Último día YYYY-MM-DD.'),
        weekStartDate: str('Sábado ancla del SPI a mirar. Omitilo para el de la semana en curso.'),
      },
    },
  },
  {
    name: 'get_projection',
    description:
      'Los planes ESTRATÉGICOS por encima de la semana: año, semestre, trimestre y mes, con las metas que el usuario escribió en cada uno. Acá viven las metas MENSUALES de las que cuelgan los KPIs. Sin argumentos devuelve los últimos planes y marca cuáles son los del período en curso. OJO: el campo `score` de estos planes NO se calcula (verificado 2026-08-31: nada en el repo lo asigna, aunque los comentarios del tipo prometan que el mes promedia las semanas). Para medir el avance real usá get_progress, que cuenta lo hecho.',
    inputSchema: {
      type: 'object',
      properties: {
        level: str('year | semester | quarter | month. Omitilo para traer todos.'),
        periodKey: str('Clave del período: "2026", "2026-H1", "2026-Q3", "2026-09".'),
      },
    },
  },
  {
    name: 'update_projection',
    description:
      'Escribe las metas de un plan estratégico (año/semestre/trimestre/mes). Mergea campo por campo, no pisa. Es donde va el objetivo mensual de retiros, de campañas, etc., para que los KPIs semanales cuelguen de algo. Rechaza un plan ya cerrado y valida el formato de la clave: una clave mal formada crea un plan que la app no encuentra nunca.',
    inputSchema: {
      type: 'object',
      properties: {
        level: str('year | semester | quarter | month.'),
        periodKey: str('Clave del período. Omitila para el período en curso de ese nivel.'),
        values: { type: 'object', description: 'Metas: {seccion: {campo: "texto"}}.' },
        notes: str('Notas del plan.'),
        lanes: { type: 'array', items: { type: 'string' }, description: 'Carriles a activar.' },
      },
      required: ['level'],
    },
  },
  {
    name: 'get_metas_incompletas',
    description:
      'OJO, no son huecos de agenda (para eso está get_agenda): son los OBJETIVOS declarados y sin completar. Recorre el SPI de la semana, los planes de año/semestre/trimestre/mes y la biblioteca de KPIs, y devuelve todo lo que el usuario empezó a escribir y dejó a medias — incluido el caso feo de "texto escrito pero SIN la cifra" (ej. "generar retiros por $. del trading": hay un símbolo de peso sin número detrás). Cada hueco viene con la pregunta ya redactada y con `completarCon`, que es la llamada exacta para llenarlo cuando el usuario responda. NUNCA inventes vos el valor que falta: la herramienta existe para preguntarlo. Por default solo reporta secciones ya EMPEZADAS (donde declaró una intención y la dejó incompleta); `todo: true` abre el resto. Si algo no se pudo mirar, sale en `avisos` — un array de huecos vacío nunca significa "está todo bien" por sí solo.',
    inputSchema: {
      type: 'object',
      properties: {
        weekStartDate: str('Sábado ancla del SPI. Omitilo para la semana en curso.'),
        todo: { type: 'boolean', description: 'true = también las secciones que nunca empezó (son ~90 campos: usalo solo si te lo piden).' },
        limit: num('Máximo de huecos a devolver. Default 40.'),
      },
    },
  },
  {
    name: 'get_books',
    description:
      'La biblioteca del usuario: qué está leyendo, qué quiere leer y qué terminó, con las fechas de inicio y fin. "Leer 30 min" es uno de sus hábitos diarios, así que esto es el contenido de ese hábito.',
    inputSchema: {
      type: 'object',
      properties: { estado: str('Filtrar por estado: want | reading | read (o "quiero leer", "leyendo", "leido"). Omitilo para todos.') },
    },
  },
  {
    name: 'upsert_book',
    description:
      'Agrega un libro a la biblioteca o le cambia el estado. Cuando el usuario diga que empezó un libro, va con estado "reading"; cuando lo termine, "read". Las fechas de inicio y fin se sellan solas al cambiar de estado. No duplica: si ya existe un libro con ese título, falla y devuelve su id para que le cambies el estado en vez de crear otro.',
    inputSchema: {
      type: 'object',
      properties: {
        bookId: str('Id existente para editar. Omitilo para crear.'),
        titulo: str('Titulo del libro.'),
        autor: str('Autor.'),
        estado: str('want (quiero leer) | reading (leyendo) | read (leido).'),
        empezado: str('YYYY-MM-DD. Se sella solo al pasar a leyendo.'),
        terminado: str('YYYY-MM-DD. Se sella solo al pasar a leido.'),
        notas: str('Notas sobre el libro.'),
      },
    },
  },
  {
    name: 'list_calendars',
    description:
      'Los calendarios de Google que el usuario tiene TILDADOS, con su id, su nombre y su COLOR. Leelo antes de crear eventos: cada evento va al calendario de su area (Trading, DRM, NQN SURVEY, Personal, Conocimiento…) y no al primario, porque el color del bloque lo da el calendario. Meter todo en el primario hace que el dia entero salga del mismo color y no se distinga nada de un vistazo. El campo puedeEscribir dice si se puede crear ahi: un calendario de solo lectura falla al crear.',
    inputSchema: { type: 'object', properties: {} },
  },
  // ─── Ofertas (el CRM) ───────────────────────────────────────────────────
  {
    name: 'get_offers',
    description:
      'El pipeline de Ofertas: los sistemas, sus ofertas agrupadas por etapa, categorias, geos y score. Usalo cuando el usuario pregunte como viene DRM o una oferta puntual — las TAREAS de DRM no cuentan la misma historia que el pipeline. Con conDocumento:true trae ademas el documento de cada oferta y las notas del sistema, ya convertidos a texto legible.',
    inputSchema: {
      type: 'object',
      properties: {
        systemId: str('Filtrar por un sistema. Omitilo para todos.'),
        etapa: str('Filtrar por etapa: acepta el id o el NOMBRE (ej. "Stock", "Seleccionado", "UGO").'),
        conDocumento: { type: 'boolean', description: 'true trae los documentos completos. Pesa: usalo cuando de verdad haga falta leerlos.' },
      },
    },
  },
  {
    name: 'upsert_offer',
    description:
      'Crea una oferta o la edita, incluido MOVERLA DE ETAPA. La etapa se puede pasar por nombre ("pasala a UGO") y se resuelve contra las etapas reales; una etapa inventada FALLA en vez de dejar la oferta invisible en el tablero. NO existe borrar ofertas desde el bridge y no se va a agregar: este dominio ya perdio 12 ofertas una vez por inferir borrados, y el borrado real va por intencion explicita del usuario en la app.',
    inputSchema: {
      type: 'object',
      properties: {
        offerId: str('Id existente para editar o mover. Omitilo para crear.'),
        systemId: str('Sistema al que pertenece. Si hay uno solo se resuelve solo.'),
        nombre: str('Nombre de la oferta.'),
        etapa: str('Etapa destino, por nombre o por id.'),
        score: num('Nota corta opcional. null la borra.'),
      },
    },
  },
  {
    name: 'set_offer_doc',
    description:
      'Escribe el documento de una oferta (pasando offerId) o las notas de un sistema (pasando systemId). Los bloques son strings sueltos o {tipo, texto, hijos}, con tipo text | bullet | toggle | page; un string que empieza con "- " se toma como vinieta. Por default AGREGA al final; modo "reemplazar" pisa todo y avisa cuantos bloques habia. Sube solo el contador docRev, que es lo que hace que el cambio sobreviva al merge multi-dispositivo.',
    inputSchema: {
      type: 'object',
      properties: {
        offerId: str('Documento de esta oferta.'),
        systemId: str('Notas de este sistema. Uno o el otro, no los dos.'),
        bloques: { type: 'array', description: 'Strings o {tipo, texto, hijos}.' },
        modo: str('agregar (default) | reemplazar.'),
      },
      required: ['bloques'],
    },
  },
  {
    name: 'log_workout',
    description:
      'Registra que entreno. Basta con el nombre de la rutina (Push / Pull / Leg / Upper / Brazos) o los grupos musculares; los ejercicios son OPCIONALES a proposito — exigirlos convierte "entrene" en la misma friccion que hizo que dejara de registrar. Si el nombre coincide con una rutina suya, la sesion queda vinculada a esa rutina. No duplica: dos veces el mismo nombre el mismo dia actualiza la sesion. NO carga series, repeticiones ni kilos: eso se carga entrenando, no dictado despues.',
    inputSchema: {
      type: 'object',
      properties: {
        fecha: str('YYYY-MM-DD. Omitila para hoy.'),
        nombre: str('Rutina: Push, Pull, Leg, Upper, Brazos.'),
        grupos: { type: 'array', items: { type: 'string' }, description: 'Grupos trabajados: ["pecho","triceps"]. Se normalizan.' },
        ejercicios: { type: 'array', description: 'Opcional. Strings o {nombre, grupo}.' },
        duracionMin: num('Duracion en minutos. Default 60.'),
        notas: str('Notas de la sesion.'),
      },
    },
  },
  {
    name: 'get_workout_split',
    description:
      'La DISTRIBUCION del entrenamiento: que entreno cada dia y, sobre todo, CUANTO HACE QUE NO TOCA cada grupo. Ese segundo dato es el que importa — un split se rompe por lo que se deja de hacer, no por lo que se hace. Devuelve tambien sesiones por semana y cuantos dias pasaron desde la ultima.',
    inputSchema: {
      type: 'object',
      properties: { dias: num('Ventana hacia atras, 1-180. Default 21.') },
    },
  }
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
          taskId: args.taskId as string | undefined,
          subtaskLimit: typeof args.subtaskLimit === 'number' ? args.subtaskLimit : undefined,
          incluirSubtareasHechas: args.incluirSubtareasHechas === true,
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

    case 'update_task':
      return updateTask(userId, args)

    case 'update_subtask':
      return updateSubtask(userId, args)

    case 'complete_tasks':
      return completeTasks(userId, { taskIds: args.taskIds, done: args.done })

    case 'complete_subtasks':
      return completeSubtasks(userId, { subtaskIds: args.subtaskIds, done: args.done })

    case 'delete_subtasks':
      return deleteSubtasks(userId, { subtaskIds: args.subtaskIds, taskId: args.taskId as string | undefined })

    case 'delete_tasks':
      return deleteTasks(userId, {
        taskIds: args.taskIds,
        incluirSerieRecurrente: args.incluirSerieRecurrente === true,
        confirmarBorradoMasivo: args.confirmarBorradoMasivo === true,
      })

    case 'set_task_recurrence':
      return setTaskRecurrence(userId, {
        taskId: args.taskId as string,
        // `null` explícito = detener la serie. `undefined` (la clave ni vino)
        // se trata igual: no hay otra cosa razonable que hacer sin regla.
        recurrence: args.recurrence,
      })

    case 'get_spi':
      return { spi: await getSpi(userId, typeof args.semanas === 'number' ? args.semanas : 8) }

    case 'get_kpis':
      return { kpis: await getKpis(userId) }

    case 'get_history':
      return getHistory(userId, String(args.from ?? ''), String(args.to ?? ''))

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

    case 'ensure_spi_week':
      return ensureSpiWeek(userId, args)

    case 'update_spi_week':
      return updateSpiWeek(userId, args)

    case 'set_spi_tasks':
      return setSpiTasks(userId, args)

    case 'upsert_kpi':
      return upsertKpi(userId, args)

    case 'set_kpi_value':
      return setKpiValue(userId, args)

    case 'get_habits':
      return getHabits(userId, args)

    case 'upsert_habit':
      return upsertHabit(userId, args)

    case 'mark_habit':
      return markHabit(userId, args)

    case 'delete_habit':
      return deleteHabit(userId, args)

    case 'get_progress':
      return getProgress(userId, args)

    case 'get_projection':
      return getProjection(userId, args)

    case 'update_projection':
      return updateProjection(userId, args)

    case 'get_metas_incompletas':
      return getMetasIncompletas(userId, args)

    case 'get_books':
      return getBooks(userId, args)

    case 'upsert_book':
      return upsertBook(userId, args)

    case 'list_calendars':
      return listCalendars(userId, origin)

    case 'get_offers':
      return getOffers(userId, args)

    case 'upsert_offer':
      return upsertOffer(userId, args)

    case 'set_offer_doc':
      return setOfferDoc(userId, args)

    case 'log_workout':
      return logWorkout(userId, args)

    case 'get_workout_split':
      return getWorkoutSplit(userId, args)

    default:
      return { ok: false, error: 'unknown_tool', detail: `No existe la herramienta "${name}".` }
  }
}
