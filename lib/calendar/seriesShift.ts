/** Cómo se traslada a la serie entera un cambio hecho sobre UNA instancia de
 *  un evento recurrente ("toda la serie").
 *
 *  El inicio y el final se corren por SEPARADO. Antes había un solo delta,
 *  calculado sobre el inicio, y se aplicaba a los dos: mover un bloque andaba,
 *  pero ACHICARLO o agrandarlo desde el borde (que solo cambia el final) daba
 *  delta 0 → se le mandaba a Google la serie tal cual estaba, la app decía
 *  "Serie movida ✓" y el bloque volvía a su tamaño original. (2026-10-08)
 *
 *  Puro y sin dependencias: lo usa la ruta PATCH y lo cubre el test. */

export interface SeriesShiftInput {
  /** Inicio y fin ACTUALES de la instancia que el usuario tocó (en Google). */
  instanceStart: string
  instanceEnd?: string | null
  /** Lo que pidió el usuario para esa instancia. Puede venir uno solo. */
  newStart?: string | null
  newEnd?: string | null
  /** Inicio y fin de la serie (el evento maestro). */
  masterStart: string
  masterEnd: string
}

export type SeriesShiftResult =
  | { ok: true; start: string; end: string; changed: boolean }
  | { ok: false; error: string }

const ms = (iso: string) => new Date(iso).getTime()

export function shiftSeries(i: SeriesShiftInput): SeriesShiftResult {
  const startDelta = i.newStart ? ms(i.newStart) - ms(i.instanceStart) : 0
  // Sin fin nuevo, el final acompaña al inicio (un movimiento puro conserva
  // la duración). Sin fin actual de la instancia no hay contra qué medir el
  // nuevo, así que también acompaña.
  const endDelta = i.newEnd && i.instanceEnd ? ms(i.newEnd) - ms(i.instanceEnd) : startDelta

  if (![startDelta, endDelta, ms(i.masterStart), ms(i.masterEnd)].every(Number.isFinite)) {
    return { ok: false, error: 'fecha_invalida' }
  }

  const start = ms(i.masterStart) + startDelta
  const end = ms(i.masterEnd) + endDelta
  if (end <= start) return { ok: false, error: 'fin_antes_del_inicio' }

  return {
    ok: true,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    changed: startDelta !== 0 || endDelta !== 0,
  }
}
