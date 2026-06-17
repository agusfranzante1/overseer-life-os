/**
 * Cálculo de progreso del módulo ESTUDIO en "unidades de estudio".
 *
 * Por Tema:
 *   - total = items.length || 1   (un tema sin ítems vale 1 unidad)
 *   - done  = items.length ? items completados : (tema.done ? 1 : 0)
 *
 * Los niveles superiores suman las unidades de sus hijos:
 *   Parcial = Σ temas · Materia = Σ parciales · Carrera = Σ materias.
 *
 * Ponderar por cantidad de unidades (y no promediar) hace que una materia con
 * más material pese más en la carrera — que es lo intuitivo para "% de material
 * de estudio completado".
 */
import type { Tema, StudyProgress } from './types'

function pct(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

function combine(parts: StudyProgress[]): StudyProgress {
  let done = 0
  let total = 0
  for (const p of parts) { done += p.done; total += p.total }
  return { done, total, pct: pct(done, total) }
}

/** Unidades de un tema (ver doc del módulo). */
export function temaProgress(tema: Tema): StudyProgress {
  const items = tema.items ?? []
  if (items.length > 0) {
    const done = items.filter((i) => i.done).length
    return { done, total: items.length, pct: pct(done, items.length) }
  }
  return { done: tema.done ? 1 : 0, total: 1, pct: tema.done ? 100 : 0 }
}

/** Progreso de un parcial = suma de sus temas. */
export function parcialProgress(temas: Tema[]): StudyProgress {
  return combine(temas.map(temaProgress))
}

/** Progreso agregado de varios parciales (para materia/carrera). Recibe ya los
 *  StudyProgress de cada parcial/materia para no recalcular. */
export function aggregate(parts: StudyProgress[]): StudyProgress {
  return combine(parts)
}

/** Un tema se considera completo cuando todas sus unidades están hechas. */
export function isTemaComplete(tema: Tema): boolean {
  const p = temaProgress(tema)
  return p.total > 0 && p.done === p.total
}
