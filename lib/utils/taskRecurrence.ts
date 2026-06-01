/** Recurrence helpers — dado un dueDate y una regla, calcula la siguiente
 *  fecha de la serie. Las fechas son YYYY-MM-DD locales (sin tz). */

import type { TaskRecurrence } from '@/types'

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setHours(0, 0, 0, 0)
  return dt
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Próxima fecha de la serie a partir de `fromDueDate`. Devuelve null si
 *  la serie ya terminó (caso `until` superado).
 *
 *  Convenciones:
 *   - daily        → +1 día
 *   - weekdays     → siguiente Lun-Vie (saltea sábado y domingo)
 *   - weekly       → siguiente día de los `daysOfWeek` (o mismo weekday
 *                    que `fromDueDate` si daysOfWeek no está definido)
 *   - monthly      → mismo día del próximo mes; si ese mes no tiene ese
 *                    día (ej. 31 de feb), usa el último día del mes
 */
export function nextRecurrenceDueDate(
  fromDueDate: string,
  recurrence: TaskRecurrence,
): string | null {
  const from = parseDate(fromDueDate)
  let next: Date

  switch (recurrence.kind) {
    case 'daily':
      next = new Date(from)
      next.setDate(from.getDate() + 1)
      break

    case 'weekdays': {
      next = new Date(from)
      next.setDate(from.getDate() + 1)
      // Saltea Sáb (6) y Dom (0) hasta caer en Lun-Vie.
      while (next.getDay() === 0 || next.getDay() === 6) {
        next.setDate(next.getDate() + 1)
      }
      break
    }

    case 'weekly': {
      const days = recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0
        ? [...recurrence.daysOfWeek].sort((a, b) => a - b)
        : [from.getDay()]
      // Empezamos buscando desde el día siguiente; avanzamos hasta caer
      // en uno de los daysOfWeek seleccionados (máx 14 iteraciones por
      // seguridad — debería ser <=7 siempre).
      next = new Date(from)
      next.setDate(from.getDate() + 1)
      for (let i = 0; i < 14; i++) {
        if (days.includes(next.getDay())) break
        next.setDate(next.getDate() + 1)
      }
      break
    }

    case 'monthly': {
      const day = from.getDate()
      const nextMonth = from.getMonth() + 1
      const year = from.getFullYear() + Math.floor(nextMonth / 12)
      const month = nextMonth % 12
      // Días del mes destino — si el día original (31) no existe en el
      // mes destino (feb), clampeamos al último día del mes.
      const lastDayOfNextMonth = new Date(year, month + 1, 0).getDate()
      const targetDay = Math.min(day, lastDayOfNextMonth)
      next = new Date(year, month, targetDay)
      next.setHours(0, 0, 0, 0)
      break
    }

    default:
      return null
  }

  // Respeta `until` si está definido.
  if (recurrence.until) {
    const limit = parseDate(recurrence.until)
    if (next.getTime() > limit.getTime()) return null
  }

  return formatDate(next)
}

/** Expande una serie recurrente en TODAS las fechas dentro de un rango
 *  [rangeStart, rangeEnd] (ambos YYYY-MM-DD, inclusive). El primer
 *  elemento del array es la base `fromDueDate` si cae adentro del rango.
 *
 *  Útil para el calendario: dada una tarea recurrente, podemos mostrar
 *  todas sus instancias en el mes visible sin tener que materializarlas
 *  como tareas reales en el store. */
export function expandRecurrenceInRange(
  fromDueDate: string,
  recurrence: TaskRecurrence,
  rangeStart: string,
  rangeEnd: string,
): string[] {
  const start = parseDate(rangeStart).getTime()
  const end = parseDate(rangeEnd).getTime()
  const results: string[] = []
  let cursor: string | null = fromDueDate
  let safety = 0
  while (cursor && safety < 366 * 2) {
    const t = parseDate(cursor).getTime()
    if (t > end) break
    if (t >= start) results.push(cursor)
    cursor = nextRecurrenceDueDate(cursor, recurrence)
    safety++
  }
  return results
}

/** Etiqueta humana para una regla — para el badge de "se repite". */
export function recurrenceLabel(recurrence: TaskRecurrence): string {
  switch (recurrence.kind) {
    case 'daily':    return 'Todos los días'
    case 'weekdays': return 'Lun-Vie'
    case 'weekly': {
      if (!recurrence.daysOfWeek || recurrence.daysOfWeek.length === 0) {
        return 'Semanal'
      }
      const names = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
      const sorted = [...recurrence.daysOfWeek].sort((a, b) => a - b)
      return sorted.map((d) => names[d]).join(', ')
    }
    case 'monthly':  return 'Cada mes'
    default:         return 'Recurrente'
  }
}
