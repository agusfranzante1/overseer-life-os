import type { Language } from '@/types'
import { getT } from './index'

/** Traduce labels de status de tarea LIVE según el idioma del user.
 *
 *  La complicación: las custom statuses se guardan como strings concretos
 *  ('To Do', 'Hacer', 'Hecho', etc.) en project.statuses[]. Si el user
 *  customizó (renombró 'To Do' a 'Backlog'), no queremos traducir nada
 *  — es su nombre custom.
 *
 *  Pero para los 6 statuses DEFAULT (los que vienen al crear un proyecto
 *  nuevo o que están en proyectos viejos), queremos que la UI los muestre
 *  en el idioma actual, sin importar en cuál idioma se crearon.
 *
 *  Cómo funciona:
 *  1. Mantenemos un set canónico de labels conocidos en ES y EN.
 *  2. Buscamos el label que entra contra ese set para sacar la clave
 *     canónica ('todo', 'in_progress', etc.).
 *  3. Si matchea, devolvemos el label en el idioma actual.
 *  4. Si no matchea, es un label custom del user → lo devolvemos tal cual. */

const KNOWN_LABELS: Record<string, string> = {
  // English defaults
  'to do':       'todo',
  'in progress': 'in_progress',
  'waiting':     'waiting',
  'done':        'done',
  'paused':      'paused',
  'postponed':   'postponed',
  // Spanish defaults
  'hacer':     'todo',
  'haciendo':  'in_progress',
  'esperando': 'waiting',
  'hecho':     'done',
  'pausado':   'paused',
  'pospuesto': 'postponed',
}

/** Devuelve el label en el idioma actual SI matchea un default conocido.
 *  Si no matchea (= status custom del user), devuelve el label original. */
export function translateStatus(label: string, lang: Language): string {
  if (!label) return label
  const key = KNOWN_LABELS[label.toLowerCase().trim()]
  if (!key) return label  // custom — respetar tal cual
  const t = getT(lang)
  return t(`statuses.${key}`)
}

/** Versión inversa para inputs/búsquedas: dado un label en CUALQUIER
 *  idioma, devuelve la clave canónica si es un default conocido. */
export function statusCanonicalKey(label: string): string | null {
  return KNOWN_LABELS[label.toLowerCase().trim()] ?? null
}
