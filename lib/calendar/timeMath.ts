/**
 * Matemática de tiempo del calendario — PURA y testeable.
 *
 * Está separada del componente a propósito: es exactamente el tipo de lógica
 * (redondeo de minutos, conversión pixel↔tiempo, serialización con timezone)
 * donde vivía el bug histórico del "bloque que empezaba a las 16:05 en vez de
 * las 16:00". Al aislarla se puede fijar el invariante con tests y evitar que
 * la regresión vuelva sin que nadie se entere.
 *
 * INVARIANTES (cubiertos por lib/calendar/timeMath.test.ts):
 *  1. El drag/resize snapea el DELTA a múltiplos de `step` (15 min por
 *     defecto). Un evento que arranca en un borde limpio (:00/:15/:30/:45)
 *     SIEMPRE cae en otro borde limpio — nunca se corre 5 minutos.
 *  2. `toLocalISO` serializa el wall-clock LOCAL con offset explícito, así
 *     Google recibe la hora que el usuario ve. Round-trip estable.
 */

/** Convierte un desplazamiento vertical en píxeles a un delta en minutos
 *  snapeado a múltiplos de `step`. Es el delta lo que se snapea (no la
 *  posición absoluta): así el offset relativo del evento se preserva y un
 *  inicio "redondo" se mantiene redondo. */
export function snapDeltaMinutes(offsetY: number, hourPx: number, step = 15): number {
  if (hourPx <= 0) return 0
  const minPerPx = 60 / hourPx
  return Math.round((offsetY * minPerPx) / step) * step
}

/** Serializa un Date al formato ISO con el offset de timezone LOCAL explícito
 *  (`YYYY-MM-DDTHH:mm:ss±HH:MM`). Google Calendar interpreta ese offset y
 *  guarda el instante correcto mostrando el wall-clock que el usuario eligió.
 *  Sin el offset explícito, mandar solo la hora local haría que GCal la tome
 *  como UTC y el evento se corriera las horas del huso. */
export function toLocalISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const offsetMin = -d.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const absMin = Math.abs(offsetMin)
  const offH = pad(Math.floor(absMin / 60))
  const offM = pad(absMin % 60)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${offH}:${offM}`
}
